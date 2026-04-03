// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseMessageEvent,
  checkMessageGate,
  isBotMentioned,
  isDuplicate,
  _resetDedup,
  buildContext,
  processInboundMessage,
} from "./inbound.js";
import type {
  FeihanAccountConfig,
  FeihanMessageEvent,
  PluginApi,
} from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAccount(
  overrides: Partial<FeihanAccountConfig> = {},
): FeihanAccountConfig {
  return {
    accountId: "test-account",
    enabled: true,
    appId: "app_test",
    appSecret: "secret",
    backendUrl: "https://your-backend-url.com",
    enableEncryption: true,
    requestTimeout: 30_000,
    requireMention: true,
    botUserId: "bot_user_001",
    inboundWhitelist: [],
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<FeihanMessageEvent["message"]> = {},
): FeihanMessageEvent {
  return {
    message: {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      messageType: "text",
      messageContent: { text: "hello world" },
      chatId: "chat_001",
      chatType: "direct",
      sender: { userId: "user_sender_001" },
      createdAt: Date.now(),
      ...overrides,
    },
  };
}

function makeMockApi(): PluginApi {
  return {
    registerChannel: vi.fn(),
    registerService: vi.fn(),
    config: { channels: { feihan: {} } },
    runtime: {
      channel: {
        reply: {
          dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue(undefined),
        },
        session: {
          recordInboundSession: vi.fn().mockResolvedValue(undefined),
          resolveStorePath: vi.fn().mockReturnValue("/tmp/store"),
        },
        routing: {
          resolveAgentRoute: vi.fn(),
        },
      },
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// parseMessageEvent
// ---------------------------------------------------------------------------

describe("parseMessageEvent", () => {
  it("parses a text message with object content", () => {
    const event = makeEvent({
      messageContent: { text: "Hello from Feihan" },
    });
    const result = parseMessageEvent(event);
    expect(result).not.toBeNull();
    expect(result!.body).toBe("Hello from Feihan");
    expect(result!.chatType).toBe("direct");
    expect(result!.senderId).toBe("user_sender_001");
  });

  it("parses a text message with JSON-encoded string content", () => {
    const event = makeEvent({
      messageContent: JSON.stringify({ text: "JSON body" }),
    });
    const result = parseMessageEvent(event);
    expect(result).not.toBeNull();
    expect(result!.body).toBe("JSON body");
  });

  it("parses a text message with content field in JSON string", () => {
    const event = makeEvent({
      messageContent: JSON.stringify({ content: "alt field" }),
    });
    const result = parseMessageEvent(event);
    expect(result!.body).toBe("alt field");
  });

  it("parses a text message with plain string content", () => {
    const event = makeEvent({
      messageContent: "plain string body",
    });
    const result = parseMessageEvent(event);
    expect(result!.body).toBe("plain string body");
  });

  it("returns null for non-text message types", () => {
    const event = makeEvent({ messageType: "image" });
    expect(parseMessageEvent(event)).toBeNull();
  });

  it("returns null for empty text body", () => {
    const event = makeEvent({ messageContent: { text: "   " } });
    expect(parseMessageEvent(event)).toBeNull();
  });

  it("returns null for missing messageId", () => {
    const event = makeEvent({ messageId: "" });
    expect(parseMessageEvent(event)).toBeNull();
  });

  it("returns null for missing chatId", () => {
    const event = makeEvent({ chatId: "" });
    expect(parseMessageEvent(event)).toBeNull();
  });

  it("returns null for missing sender", () => {
    const event = makeEvent({
      sender: { userId: "" },
    });
    // userId is empty string, which is falsy
    expect(parseMessageEvent(event)).toBeNull();
  });

  it("extracts mention user IDs", () => {
    const event = makeEvent({
      mentionUserList: [
        { userId: "u1" },
        { userId: "u2", openUserId: "ou2" },
      ],
    });
    const result = parseMessageEvent(event);
    expect(result!.mentionUserIds).toEqual(["u1", "u2"]);
  });

  it("falls back to openUserId for sender when userId is missing", () => {
    const event = makeEvent();
    // Simulate a sender with only openUserId (override at runtime)
    (event.message.sender as unknown as Record<string, unknown>).userId = undefined;
    (event.message.sender as unknown as Record<string, unknown>).openUserId = "open_sender_001";
    const result = parseMessageEvent(event);
    expect(result).not.toBeNull();
    expect(result!.senderId).toBe("open_sender_001");
  });

  it("normalizes group chatType", () => {
    const event = makeEvent({ chatType: "group" });
    expect(parseMessageEvent(event)!.chatType).toBe("group");
  });

  it("normalizes non-group chatType to direct", () => {
    const event = makeEvent({ chatType: "p2p" });
    expect(parseMessageEvent(event)!.chatType).toBe("direct");
  });

  it("returns null for null/undefined content", () => {
    const event = makeEvent({ messageContent: null as unknown });
    expect(parseMessageEvent(event)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkMessageGate
// ---------------------------------------------------------------------------

describe("checkMessageGate", () => {
  it("passes a normal direct message", () => {
    const msg = parseMessageEvent(makeEvent())!;
    const account = makeAccount({ requireMention: false });
    const result = checkMessageGate(msg, account);
    expect(result.pass).toBe(true);
  });

  it("blocks self-messages", () => {
    const event = makeEvent({
      sender: { userId: "bot_user_001" },
    });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount();
    const result = checkMessageGate(msg, account);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("self-message");
  });

  it("blocks sender not in whitelist when whitelist is set", () => {
    const msg = parseMessageEvent(makeEvent())!;
    const account = makeAccount({
      inboundWhitelist: ["allowed_user"],
    });
    const result = checkMessageGate(msg, account);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("sender-not-in-whitelist");
  });

  it("passes sender in whitelist", () => {
    const msg = parseMessageEvent(makeEvent())!;
    const account = makeAccount({
      inboundWhitelist: ["user_sender_001"],
      requireMention: false,
    });
    const result = checkMessageGate(msg, account);
    expect(result.pass).toBe(true);
  });

  it("blocks group message without mention when requireMention is true", () => {
    const event = makeEvent({ chatType: "group" });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount({ requireMention: true });
    const result = checkMessageGate(msg, account);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("group-no-mention");
  });

  it("passes group message with mention", () => {
    const event = makeEvent({
      chatType: "group",
      mentionUserList: [{ userId: "bot_user_001" }],
    });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount({ requireMention: true });
    const result = checkMessageGate(msg, account);
    expect(result.pass).toBe(true);
  });

  it("passes group message when requireMention is false", () => {
    const event = makeEvent({ chatType: "group" });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount({ requireMention: false });
    const result = checkMessageGate(msg, account);
    expect(result.pass).toBe(true);
  });

  it("skips self-message check when botUserId is not set", () => {
    const event = makeEvent({
      sender: { userId: "any_user" },
    });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount({ botUserId: undefined });
    const result = checkMessageGate(msg, account);
    expect(result.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isBotMentioned
// ---------------------------------------------------------------------------

describe("isBotMentioned", () => {
  it("returns true when bot is in mentionUserIds", () => {
    const event = makeEvent({
      mentionUserList: [{ userId: "bot_user_001" }],
    });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount();
    expect(isBotMentioned(msg, account)).toBe(true);
  });

  it("returns false when bot is not mentioned", () => {
    const event = makeEvent({
      mentionUserList: [{ userId: "other_user" }],
    });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount();
    expect(isBotMentioned(msg, account)).toBe(false);
  });

  it("returns false when botUserId is not set", () => {
    const event = makeEvent({
      mentionUserList: [{ userId: "bot_user_001" }],
    });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount({ botUserId: undefined });
    expect(isBotMentioned(msg, account)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDuplicate / dedup
// ---------------------------------------------------------------------------

describe("isDuplicate", () => {
  beforeEach(() => {
    _resetDedup();
  });

  it("returns false for first occurrence", () => {
    expect(isDuplicate("msg_1")).toBe(false);
  });

  it("returns true for second occurrence", () => {
    isDuplicate("msg_2");
    expect(isDuplicate("msg_2")).toBe(true);
  });

  it("tracks multiple independent messages", () => {
    expect(isDuplicate("msg_a")).toBe(false);
    expect(isDuplicate("msg_b")).toBe(false);
    expect(isDuplicate("msg_a")).toBe(true);
    expect(isDuplicate("msg_b")).toBe(true);
    expect(isDuplicate("msg_c")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildContext
// ---------------------------------------------------------------------------

describe("buildContext", () => {
  it("builds context for a direct message", () => {
    const msg = parseMessageEvent(makeEvent())!;
    const account = makeAccount();
    const ctx = buildContext(msg, account);

    expect(ctx.Provider).toBe("feihan");
    expect(ctx.Surface).toBe("feihan");
    expect(ctx.ChatType).toBe("direct");
    expect(ctx.AccountId).toBe("test-account");
    expect(ctx.Body).toBe("hello world");
    expect(ctx.From).toBe("feihan:user:user_sender_001");
    expect(ctx.To).toBe("feihan:bot:bot_user_001");
    expect(ctx.SessionKey).toBe("feihan:user:user_sender_001");
    expect(ctx.CommandAuthorized).toBe(true);
    expect(ctx._feihan.isGroup).toBe(false);
  });

  it("builds context for a group message", () => {
    const event = makeEvent({ chatType: "group", chatId: "chat_group_1" });
    const msg = parseMessageEvent(event)!;
    const account = makeAccount();
    const ctx = buildContext(msg, account);

    expect(ctx.ChatType).toBe("group");
    expect(ctx.From).toBe("feihan:chat:chat_group_1");
    expect(ctx.SessionKey).toBe("feihan:chat:chat_group_1");
    expect(ctx._feihan.isGroup).toBe(true);
    expect(ctx._feihan.chatId).toBe("chat_group_1");
  });

  it("falls back to appId when botUserId is not set", () => {
    const msg = parseMessageEvent(makeEvent())!;
    const account = makeAccount({ botUserId: undefined });
    const ctx = buildContext(msg, account);
    expect(ctx.To).toBe("feihan:bot:app_test");
  });
});

// ---------------------------------------------------------------------------
// processInboundMessage (integration)
// ---------------------------------------------------------------------------

describe("processInboundMessage", () => {
  beforeEach(() => {
    _resetDedup();
  });

  it("dispatches a valid direct message", async () => {
    const api = makeMockApi();
    const account = makeAccount({ requireMention: false });
    const event = makeEvent();
    const deliver = vi.fn().mockResolvedValue(undefined);

    const result = await processInboundMessage(api, account, event, { deliver });

    expect(result).toBe(true);
    expect(api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher).toHaveBeenCalledOnce();
    expect(api.runtime.channel.session.recordInboundSession).toHaveBeenCalledOnce();
  });

  it("filters self-messages", async () => {
    const api = makeMockApi();
    const account = makeAccount();
    const event = makeEvent({ sender: { userId: "bot_user_001" } });
    const deliver = vi.fn();

    const result = await processInboundMessage(api, account, event, { deliver });

    expect(result).toBe(false);
    expect(api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher).not.toHaveBeenCalled();
  });

  it("filters duplicate messages", async () => {
    const api = makeMockApi();
    const account = makeAccount({ requireMention: false });
    const msgId = "msg_dedup_test";
    const event = makeEvent({ messageId: msgId });
    const deliver = vi.fn();

    const first = await processInboundMessage(api, account, event, { deliver });
    expect(first).toBe(true);

    const second = await processInboundMessage(api, account, event, { deliver });
    expect(second).toBe(false);
  });

  it("filters group messages without mention when required", async () => {
    const api = makeMockApi();
    const account = makeAccount({ requireMention: true });
    const event = makeEvent({ chatType: "group" });
    const deliver = vi.fn();

    const result = await processInboundMessage(api, account, event, { deliver });

    expect(result).toBe(false);
  });

  it("dispatches group message with mention", async () => {
    const api = makeMockApi();
    const account = makeAccount({ requireMention: true });
    const event = makeEvent({
      chatType: "group",
      mentionUserList: [{ userId: "bot_user_001" }],
    });
    const deliver = vi.fn().mockResolvedValue(undefined);

    const result = await processInboundMessage(api, account, event, { deliver });

    expect(result).toBe(true);
  });

  it("returns false for unparseable event", async () => {
    const api = makeMockApi();
    const account = makeAccount();
    const event = makeEvent({ messageType: "image" });
    const deliver = vi.fn();

    const result = await processInboundMessage(api, account, event, { deliver });

    expect(result).toBe(false);
  });

  it("returns false when runtime dispatch is unavailable", async () => {
    const api = makeMockApi();
    // Remove dispatch function
    (api.runtime.channel.reply as Record<string, unknown>).dispatchReplyWithBufferedBlockDispatcher = undefined;
    const account = makeAccount({ requireMention: false });
    const event = makeEvent();
    const deliver = vi.fn();

    const result = await processInboundMessage(api, account, event, { deliver });

    expect(result).toBe(false);
  });

  it("calls deliver callback via dispatcher", async () => {
    const api = makeMockApi();
    // Simulate the dispatcher calling deliver
    const mockDispatch = vi.fn().mockImplementation(async (opts: Record<string, unknown>) => {
      const dispatcherOpts = opts.dispatcherOptions as Record<string, unknown>;
      const deliverFn = dispatcherOpts.deliver as (payload: { text?: string }) => Promise<void>;
      await deliverFn({ text: "AI response" });
    });
    api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher = mockDispatch;

    const account = makeAccount({ requireMention: false });
    const event = makeEvent({ chatId: "chat_deliver_test" });
    const deliver = vi.fn().mockResolvedValue(undefined);

    await processInboundMessage(api, account, event, { deliver });

    expect(deliver).toHaveBeenCalledWith("chat_deliver_test", "AI response");
  });

  it("does not call deliver for empty text payload", async () => {
    const api = makeMockApi();
    const mockDispatch = vi.fn().mockImplementation(async (opts: Record<string, unknown>) => {
      const dispatcherOpts = opts.dispatcherOptions as Record<string, unknown>;
      const deliverFn = dispatcherOpts.deliver as (payload: { text?: string }) => Promise<void>;
      await deliverFn({ text: undefined });
    });
    api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher = mockDispatch;

    const account = makeAccount({ requireMention: false });
    const event = makeEvent();
    const deliver = vi.fn();

    await processInboundMessage(api, account, event, { deliver });

    expect(deliver).not.toHaveBeenCalled();
  });

  it("records session with updateLastRoute for DM", async () => {
    const api = makeMockApi();
    const account = makeAccount({ requireMention: false });
    const event = makeEvent({ chatId: "chat_dm_001" });
    const deliver = vi.fn().mockResolvedValue(undefined);

    await processInboundMessage(api, account, event, { deliver });

    const sessionCall = (api.runtime.channel.session.recordInboundSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sessionCall.updateLastRoute).toEqual({
      sessionKey: expect.stringContaining("feihan:user:"),
      channel: "feihan",
      to: "chat_dm_001",
      accountId: "test-account",
    });
  });

  it("does not set updateLastRoute for group messages", async () => {
    const api = makeMockApi();
    const account = makeAccount({ requireMention: false });
    const event = makeEvent({ chatType: "group" });
    const deliver = vi.fn().mockResolvedValue(undefined);

    await processInboundMessage(api, account, event, { deliver });

    const sessionCall = (api.runtime.channel.session.recordInboundSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sessionCall.updateLastRoute).toBeUndefined();
  });

  it("logs dispatch error via onError callback", async () => {
    const api = makeMockApi();
    const mockDispatch = vi.fn().mockImplementation(async (opts: Record<string, unknown>) => {
      const dispatcherOpts = opts.dispatcherOptions as Record<string, unknown>;
      const onError = dispatcherOpts.onError as (err: unknown, info?: { kind?: string }) => void;
      onError(new Error("test failure"), { kind: "llm" });
    });
    api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher = mockDispatch;

    const account = makeAccount({ requireMention: false });
    const event = makeEvent();
    const deliver = vi.fn();

    await processInboundMessage(api, account, event, { deliver });

    expect(api.logger!.error).toHaveBeenCalledWith(
      expect.stringContaining("llm"),
    );
  });
});

// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";

// We test outbound logic by mocking the client manager.
// Mock shape matches @feihan-im/sdk's client.Im.v1.* API surface.

/** Marker class for mock auth errors. */
class MockAuthError extends Error {
  code = 40000006;
  constructor() { super("鉴权失败"); }
}

vi.mock("../core/feihan-client.js", () => {
  const mockClient = {
    client: {
      Im: {
        v1: {
          Message: {
            sendMessage: vi.fn().mockResolvedValue({ message_id: "sent_msg_001" }),
            readMessage: vi.fn().mockResolvedValue({}),
          },
          Chat: {
            createTyping: vi.fn().mockResolvedValue({}),
            deleteTyping: vi.fn().mockResolvedValue({}),
          },
        },
      },
      preheat: vi.fn().mockResolvedValue(undefined),
    },
    config: { accountId: "test-account" },
    connectionState: "connected",
  };

  return {
    getClient: vi.fn((accountId?: string) => {
      if (accountId === "missing") return undefined;
      return mockClient;
    }),
    isAuthError: vi.fn((err: unknown) => err instanceof MockAuthError),
    MessageType_TEXT: "text",
    __mockClient: mockClient,
  };
});

import { sendText, setTyping, clearTyping, readMessage, makeDeliver } from "./outbound.js";
import { getClient } from "../core/feihan-client.js";

// Access mock internals
const { __mockClient: mockClient } = await import("../core/feihan-client.js") as any;

describe("sendText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a text message successfully", async () => {
    const result = await sendText("chat_001", "Hello!", "test-account");
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("sent_msg_001");
    expect(result.provider).toBe("feihan");

    const sendCall = mockClient.client.Im.v1.Message.sendMessage.mock.calls[0][0];
    expect(sendCall.chat_id).toBe("chat_001");
    expect(sendCall.message_type).toBe("text");
    expect(sendCall.message_content.text.content).toBe("Hello!");
  });

  it("returns error when no client is connected", async () => {
    const result = await sendText("chat_001", "Hello!", "missing");
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("no connected client");
  });

  it("returns error when SDK throws non-auth error", async () => {
    mockClient.client.Im.v1.Message.sendMessage.mockRejectedValueOnce(new Error("API error"));
    const result = await sendText("chat_001", "Hello!");
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("send failed");
    // preheat should NOT have been called for non-auth errors
    expect(mockClient.client.preheat).not.toHaveBeenCalled();
  });

  it("retries once on auth error after preheat", async () => {
    // First call fails with auth error, second succeeds
    mockClient.client.Im.v1.Message.sendMessage
      .mockRejectedValueOnce(new MockAuthError())
      .mockResolvedValueOnce({ message_id: "retry_msg_001" });

    const logWarn = vi.fn();
    const result = await sendText("chat_001", "Hello!", "test-account", undefined, logWarn);
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("retry_msg_001");
    expect(mockClient.client.preheat).toHaveBeenCalledOnce();
    expect(logWarn).toHaveBeenCalled();
    expect(logWarn.mock.calls[0][0]).toContain("auth error on send");
  });

  it("returns error when retry also fails after auth error", async () => {
    // Both calls fail
    mockClient.client.Im.v1.Message.sendMessage
      .mockRejectedValueOnce(new MockAuthError())
      .mockRejectedValueOnce(new Error("still broken"));

    const result = await sendText("chat_001", "Hello!", "test-account");
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("after auth retry");
    expect(mockClient.client.preheat).toHaveBeenCalledOnce();
  });

  it("does not retry on non-auth SDK errors", async () => {
    mockClient.client.Im.v1.Message.sendMessage.mockRejectedValueOnce(new Error("network timeout"));
    const result = await sendText("chat_001", "Hello!");
    expect(result.ok).toBe(false);
    expect(mockClient.client.preheat).not.toHaveBeenCalled();
    expect(mockClient.client.Im.v1.Message.sendMessage).toHaveBeenCalledOnce();
  });

  it("passes reply_message_id when provided", async () => {
    await sendText("chat_001", "reply!", "test-account", "original_msg");
    const sendCall = mockClient.client.Im.v1.Message.sendMessage.mock.calls[0][0];
    expect(sendCall.reply_message_id).toBe("original_msg");
  });
});

describe("setTyping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls createTyping on the client", async () => {
    await setTyping("chat_001");
    expect(mockClient.client.Im.v1.Chat.createTyping).toHaveBeenCalledWith({ chat_id: "chat_001" });
  });

  it("does not throw when client is missing", async () => {
    await expect(setTyping("chat_001", "missing")).resolves.toBeUndefined();
  });
});

describe("clearTyping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls deleteTyping on the client", async () => {
    await clearTyping("chat_001");
    expect(mockClient.client.Im.v1.Chat.deleteTyping).toHaveBeenCalledWith({ chat_id: "chat_001" });
  });
});

describe("readMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls readMessage on the client", async () => {
    await readMessage("msg_001");
    expect(mockClient.client.Im.v1.Message.readMessage).toHaveBeenCalledWith({ message_id: "msg_001" });
  });
});

describe("makeDeliver", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a deliver function that sends text", async () => {
    const deliver = makeDeliver("test-account");
    await deliver("chat_001", "AI reply");
    expect(mockClient.client.Im.v1.Message.sendMessage).toHaveBeenCalledOnce();
  });

  it("throws when send fails", async () => {
    mockClient.client.Im.v1.Message.sendMessage.mockRejectedValueOnce(new Error("fail"));
    const deliver = makeDeliver("test-account");
    await expect(deliver("chat_001", "AI reply")).rejects.toThrow();
  });
});

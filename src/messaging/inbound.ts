// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

/**
 * Inbound message processing pipeline for Feihan IM.
 *
 * Pipeline: parse -> gate -> dedup -> build context -> dispatch
 *
 * Codes against the FeihanClient interface contract (task 99) —
 * the client is not imported here; this module receives parsed events.
 */

import type {
  FeihanAccountConfig,
  FeihanMessage,
  FeihanMessageEvent,
  PluginApi,
} from "../types.js";

// Extended PluginApi with runtime surfaces used by this module
export interface ExtendedPluginApi extends PluginApi {
  runtime?: {
    channel?: {
      reply?: {
        dispatchReplyWithBufferedBlockDispatcher?: (opts: unknown) => Promise<void>;
      };
      session?: {
        recordInboundSession?: (opts: unknown) => Promise<void>;
        resolveStorePath?: (store: unknown, opts: unknown) => string;
      };
      routing?: {
        resolveAgentRoute?: (opts: unknown) => unknown;
      };
    };
  };
  logger?: {
    debug?: (msg: string) => void;
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
}

// ---------------------------------------------------------------------------
// Parse — extract usable text body from incoming message
// ---------------------------------------------------------------------------

export interface ParsedInboundMessage {
  messageId: string;
  chatId: string;
  chatType: "direct" | "group";
  senderId: string;
  body: string;
  timestamp: number;
  mentionUserIds: string[];
}

/**
 * Normalize a raw Feihan message event into a structured inbound message.
 * Returns `null` if the event cannot be parsed into a usable message.
 *
 * Only text messages are supported in this phase — media/card/file are
 * follow-up work (task 08).
 */
export function parseMessageEvent(
  event: FeihanMessageEvent,
): ParsedInboundMessage | null {
  const msg = event?.message;
  if (!msg || !msg.messageId || !msg.chatId) return null;

  const body = extractTextBody(msg);
  if (body === null) return null;

  const chatType = msg.chatType === "group" ? "group" : "direct";

  const senderId =
    msg.sender?.userId || msg.sender?.openUserId || msg.sender?.unionUserId;
  if (!senderId) return null;

  const mentionUserIds = (msg.mentionUserList ?? [])
    .map((u) => u.userId || u.openUserId || u.unionUserId || "")
    .filter(Boolean);

  return {
    messageId: msg.messageId,
    chatId: msg.chatId,
    chatType,
    senderId,
    body,
    timestamp: msg.createdAt ?? Date.now(),
    mentionUserIds,
  };
}

/**
 * Extract plain-text content from a Feihan message.
 * Returns `null` for non-text or empty messages.
 */
function extractTextBody(msg: FeihanMessage): string | null {
  if (msg.messageType !== "text") return null;

  const content = msg.messageContent;
  if (typeof content === "string") {
    // Content may be JSON-encoded string (Feihan convention)
    try {
      const parsed = JSON.parse(content);
      // Feihan format: { text: { content: "Hello" } }
      if (parsed?.text && typeof parsed.text === "object" && typeof parsed.text.content === "string")
        return parsed.text.content.trim() || null;
      if (typeof parsed?.text === "string") return parsed.text.trim() || null;
      if (typeof parsed?.content === "string")
        return parsed.content.trim() || null;
      // Fall through to raw string
    } catch {
      // Not JSON — use raw string
    }
    return content.trim() || null;
  }

  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    // Feihan format: { text: { content: "Hello" } }
    if (obj.text && typeof obj.text === "object") {
      const textObj = obj.text as Record<string, unknown>;
      if (typeof textObj.content === "string") return textObj.content.trim() || null;
    }
    if (typeof obj.text === "string") return obj.text.trim() || null;
    if (typeof obj.content === "string") return obj.content.trim() || null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Gate — filter out messages the plugin should not process
// ---------------------------------------------------------------------------

export interface GateResult {
  pass: boolean;
  reason?: string;
}

/**
 * Determine whether a parsed inbound message should be processed.
 * Checks in order: self-message, whitelist, group mention requirement.
 */
export function checkMessageGate(
  msg: ParsedInboundMessage,
  account: FeihanAccountConfig,
): GateResult {
  // 1. Self-message filter: ignore messages from the bot itself
  if (account.botUserId && msg.senderId === account.botUserId) {
    return { pass: false, reason: "self-message" };
  }

  // 2. Whitelist filter: if whitelist is non-empty, only allow listed senders
  if (account.inboundWhitelist.length > 0) {
    if (!account.inboundWhitelist.includes(msg.senderId)) {
      return { pass: false, reason: "sender-not-in-whitelist" };
    }
  }

  // 3. Group mention filter: in group chats, require @mention if configured
  if (
    msg.chatType === "group" &&
    account.requireMention &&
    !isBotMentioned(msg, account)
  ) {
    return { pass: false, reason: "group-no-mention" };
  }

  return { pass: true };
}

/**
 * Check if the bot was @mentioned in a message.
 */
export function isBotMentioned(
  msg: ParsedInboundMessage,
  account: FeihanAccountConfig,
): boolean {
  if (!account.botUserId) return false;
  return msg.mentionUserIds.includes(account.botUserId);
}

// ---------------------------------------------------------------------------
// Dedup — skip already-processed message IDs
// ---------------------------------------------------------------------------

const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEDUP_CLEANUP_INTERVAL_MS = 60 * 1000; // clean every 1 minute
const DEDUP_MAX_SIZE = 10_000;

/** In-memory set of recently processed message IDs with TTL. */
const processedMessages = new Map<string, number>();
let lastCleanup = Date.now();

/**
 * Returns `true` if the message has already been processed (duplicate).
 * Records the message ID on first encounter.
 */
export function isDuplicate(messageId: string): boolean {
  cleanupIfNeeded();

  if (processedMessages.has(messageId)) return true;

  processedMessages.set(messageId, Date.now());
  return false;
}

function cleanupIfNeeded(): void {
  const now = Date.now();
  if (now - lastCleanup < DEDUP_CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const expiry = now - DEDUP_TTL_MS;
  for (const [id, ts] of processedMessages) {
    if (ts < expiry) processedMessages.delete(id);
  }

  // Hard cap to prevent unbounded growth
  if (processedMessages.size > DEDUP_MAX_SIZE) {
    const excess = processedMessages.size - DEDUP_MAX_SIZE;
    const iter = processedMessages.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key !== undefined) processedMessages.delete(key);
    }
  }
}

/** Reset dedup state — exposed for testing only. */
export function _resetDedup(): void {
  processedMessages.clear();
  lastCleanup = Date.now();
}

// ---------------------------------------------------------------------------
// Build context & dispatch
// ---------------------------------------------------------------------------

export interface InboundContext {
  Body: string;
  From: string;
  To: string;
  SessionKey: string;
  AccountId: string;
  ChatType: "direct" | "group";
  Provider: "feihan";
  Surface: "feihan";
  MessageSid: string;
  Timestamp: number;
  CommandAuthorized: boolean;
  _feihan: {
    accountId: string;
    isGroup: boolean;
    senderId: string;
    chatId: string;
  };
}

/**
 * Build the OpenClaw context payload from a parsed inbound message.
 */
export function buildContext(
  msg: ParsedInboundMessage,
  account: FeihanAccountConfig,
): InboundContext {
  const isGroup = msg.chatType === "group";

  // Session key: group chats key on chatId, DMs key on sender
  const sessionKey = isGroup
    ? `feihan:chat:${msg.chatId}`
    : `feihan:user:${msg.senderId}`;

  return {
    Body: msg.body,
    From: isGroup ? `feihan:chat:${msg.chatId}` : `feihan:user:${msg.senderId}`,
    To: `feihan:bot:${account.botUserId ?? account.appId}`,
    SessionKey: sessionKey,
    AccountId: account.accountId,
    ChatType: isGroup ? "group" : "direct",
    Provider: "feihan",
    Surface: "feihan",
    MessageSid: msg.messageId,
    Timestamp: msg.timestamp,
    CommandAuthorized: true,
    _feihan: {
      accountId: account.accountId,
      isGroup,
      senderId: msg.senderId,
      chatId: msg.chatId,
    },
  };
}

// ---------------------------------------------------------------------------
// Top-level dispatch
// ---------------------------------------------------------------------------

/**
 * Options for the deliver callback wired by the caller (e.g. the service
 * start handler in index.ts once task 06 connects the FeihanClient).
 */
export interface InboundDispatchOptions {
  /** Send a reply back to the Feihan chat. */
  deliver: (chatId: string, text: string) => Promise<void>;
}

/**
 * Process an inbound Feihan message event end-to-end:
 * parse -> gate -> dedup -> build context -> dispatch.
 *
 * Returns `true` if the message was dispatched, `false` if filtered.
 */
export async function processInboundMessage(
  api: ExtendedPluginApi,
  account: FeihanAccountConfig,
  event: FeihanMessageEvent,
  opts: InboundDispatchOptions,
): Promise<boolean> {
  const logger = api.logger;

  // Helper for safe logging
  const log = {
    debug: (msg: string) => { logger?.debug?.(msg); },
    info: (msg: string) => { logger?.info?.(msg); },
    warn: (msg: string) => { logger?.warn?.(msg); },
    error: (msg: string) => { logger?.error?.(msg); },
  };

  // 1. Parse
  const parsed = parseMessageEvent(event);
  if (!parsed) {
    log.debug(
      `[feihan] ignoring unparseable event (messageId=${event?.message?.messageId ?? "unknown"} messageType=${event?.message?.messageType ?? "undefined"})`,
    );
    return false;
  }

  // 2. Gate
  const gate = checkMessageGate(parsed, account);
  if (!gate.pass) {
    log.debug(
      `[feihan] gated message=${parsed.messageId} reason=${gate.reason} chat=${parsed.chatId}`,
    );
    return false;
  }

  // 3. Dedup
  if (isDuplicate(parsed.messageId)) {
    log.debug(
      `[feihan] duplicate message=${parsed.messageId} chat=${parsed.chatId}`,
    );
    return false;
  }

  // 4. Build context
  const ctx = buildContext(parsed, account);

  log.info(
    `[feihan] dispatching message=${parsed.messageId} chat=${parsed.chatId} sender=${parsed.senderId} type=${parsed.chatType}`,
  );

  // 5. Dispatch
  const runtime = api.runtime;
  if (!runtime?.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    log.warn("[feihan] runtime.channel.reply not available — cannot dispatch");
    return false;
  }

  // Record session for context continuity
  const cfgSession = (api.config as Record<string, unknown>)?.session as Record<string, unknown> | undefined;
  const storePath =
    runtime.channel.session?.resolveStorePath?.(
      cfgSession?.store,
      { agentId: "main" },
    ) ?? "";

  await runtime.channel.session?.recordInboundSession?.({
    storePath,
    sessionKey: ctx.SessionKey,
    ctx,
    updateLastRoute:
      ctx.ChatType === "direct"
        ? {
            sessionKey: ctx.SessionKey,
            channel: "feihan",
            to: parsed.chatId,
            accountId: account.accountId,
          }
        : undefined,
  });

  // Dispatch reply with buffered block dispatcher
  log.debug(
    `[feihan] dispatch starting for message=${parsed.messageId} session=${ctx.SessionKey}`,
  );

  await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx,
    cfg: api.config,
    dispatcherOptions: {
      deliver: async (payload: { text?: string }) => {
        log.info(
          `[feihan] deliver callback called for message=${parsed.messageId} hasText=${!!payload.text} textLen=${payload.text?.length ?? 0}`,
        );
        if (payload.text) {
          await opts.deliver(parsed.chatId, payload.text);
          log.info(
            `[feihan] deliver completed for message=${parsed.messageId} chat=${parsed.chatId}`,
          );
        }
      },
      onError: (err: unknown, info?: { kind?: string }) => {
        log.error(
          `[feihan] ${info?.kind ?? "reply"} error for message=${parsed.messageId}: ${err}`,
        );
      },
    },
  });

  log.info(
    `[feihan] dispatch finished for message=${parsed.messageId}`,
  );

  return true;
}

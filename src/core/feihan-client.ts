// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

/**
 * Feihan client manager — wraps the @feihan-im/sdk
 * and provides per-account lifecycle management.
 *
 * This module bridges the SDK's snake_case API with the plugin's camelCase
 * conventions and manages client instances by account ID.
 */

import { FeihanClient, LoggerLevel, ApiError } from "@feihan-im/sdk";
import type { Logger } from "@feihan-im/sdk";
import type { FeihanAccountConfig, ConnectionState, FeihanMessageEvent } from "../types.js";

// ---------------------------------------------------------------------------
// Auth error detection
// ---------------------------------------------------------------------------

/** Feihan auth failure error code (鉴权失败). */
const AUTH_ERROR_CODE = 40000006;

/**
 * Check whether an error is a Feihan auth/token failure.
 * Returns true for ApiError with code 40000006, which indicates
 * the token has expired or is otherwise invalid.
 */
export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.code === AUTH_ERROR_CODE;
}

// ---------------------------------------------------------------------------
// Constants — the new SDK doesn't re-export message type enums from its
// top-level barrel, so we define the constant locally. The value matches
// the SDK's MessageType_TEXT = 'text' in message_enum.ts.
// ---------------------------------------------------------------------------

export const MessageType_TEXT = "text";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The SDK client instance returned by FeihanClient.create().
 *
 * The new @feihan-im/sdk uses:
 *   - client.Im.v1.Message.sendMessage(req) — snake_case request fields
 *   - client.Im.v1.Message.Event.onMessageReceive(handler) — sync, void return
 *   - client.Im.v1.Chat.createTyping(req) — snake_case request fields
 *   - client.preheat() / client.close() — camelCase lifecycle methods
 */
export type SdkClient = FeihanClient;

/**
 * Local send-message request shape matching the SDK's SendMessageReq.
 * Only text is used for now; add specific fields (image, card, etc.)
 * as outbound capabilities grow.
 */
export interface SendMessageReq {
  chat_id?: string;
  message_type?: string;
  message_content?: {
    text?: { content?: string };
  };
  reply_message_id?: string;
}

/**
 * Raw event shape from the SDK's onMessageReceive handler.
 *
 * The new SDK delivers typed events with shape:
 *   { header: EventHeader, body: { message?: Message } }
 *
 * Message fields are snake_case. sender_id is a UserId object:
 *   { user_id?, union_user_id?, open_user_id? }
 */
export interface SdkMessageEvent {
  header?: {
    event_id?: string;
    event_type?: string;
    event_created_at?: string;
  };
  body?: {
    message?: {
      message_id?: string;
      message_type?: string;
      message_status?: string;
      message_content?: unknown;
      message_created_at?: string | number;
      chat_id?: string;
      chat_seq_id?: string | number;
      sender_id?: {
        user_id?: string;
        union_user_id?: string;
        open_user_id?: string;
      } | string;
      // These may appear in group chats
      chat_type?: string;
      mention_user_list?: Array<{
        user_id?: {
          user_id?: string;
          union_user_id?: string;
          open_user_id?: string;
        };
        user_name?: string;
      }>;
    };
  };
}

// ---------------------------------------------------------------------------
// Client state
// ---------------------------------------------------------------------------

export interface ManagedClient {
  client: SdkClient;
  config: FeihanAccountConfig;
  /** The raw handler reference, needed for offMessageReceive. */
  eventHandler?: (event: SdkMessageEvent) => void;
  /** Diagnostic connection state. Updated on create/destroy. */
  connectionState: ConnectionState;
}

const clients = new Map<string, ManagedClient>();

// ---------------------------------------------------------------------------
// Logger adapter — bridge plugin's simple log callback to SDK's Logger interface
// ---------------------------------------------------------------------------

function makeLoggerAdapter(
  log?: (msg: string, ctx?: Record<string, unknown>) => void,
): Logger {
  const emit = (level: string) => (msg: string, ...args: unknown[]) => {
    log?.(`[${level}] ${msg}${args.length ? " " + JSON.stringify(args) : ""}`);
  };
  return {
    debug: emit("debug"),
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export interface CreateClientOptions {
  config: FeihanAccountConfig;
  onMessage?: (event: FeihanMessageEvent, accountConfig: FeihanAccountConfig) => void;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

/**
 * Create and connect a Feihan SDK client for the given account.
 * Stores it in the client map for later retrieval.
 */
export async function createClient(opts: CreateClientOptions): Promise<ManagedClient> {
  const { config, onMessage, log } = opts;
  const accountId = config.accountId;

  // Tear down existing client for this account if any
  if (clients.has(accountId)) {
    await destroyClient(accountId);
  }

  const sdkClient = await FeihanClient.create(
    config.backendUrl,
    config.appId,
    config.appSecret,
    {
      enableEncryption: config.enableEncryption,
      requestTimeout: config.requestTimeout,
      logger: log ? makeLoggerAdapter(log) : undefined,
      logLevel: log ? LoggerLevel.Debug : LoggerLevel.Info,
    },
  );

  // Preheat warms the token and verifies connectivity
  await sdkClient.preheat();

  const managed: ManagedClient = { client: sdkClient, config, connectionState: "connected" };

  // Subscribe to incoming messages if handler provided
  if (onMessage) {
    const handler = (sdkEvent: SdkMessageEvent) => {
      const normalized = normalizeSdkEvent(sdkEvent);
      if (normalized) {
        onMessage(normalized, config);
      }
    };

    // New SDK: onMessageReceive is synchronous, returns void.
    // Store handler reference for offMessageReceive on teardown.
    sdkClient.Im.v1.Message.Event.onMessageReceive(
      handler as Parameters<typeof sdkClient.Im.v1.Message.Event.onMessageReceive>[0],
    );
    managed.eventHandler = handler;
  }

  clients.set(accountId, managed);
  return managed;
}

/**
 * Destroy and disconnect a client by account ID.
 */
export async function destroyClient(accountId: string): Promise<void> {
  const managed = clients.get(accountId);
  if (!managed) return;

  managed.connectionState = "disconnecting";

  // Unsubscribe from events using offMessageReceive
  if (managed.eventHandler) {
    managed.client.Im.v1.Message.Event.offMessageReceive(
      managed.eventHandler as Parameters<typeof managed.client.Im.v1.Message.Event.offMessageReceive>[0],
    );
  }
  try {
    await managed.client.close();
  } catch {
    // Best-effort close
  }
  clients.delete(accountId);
}

/**
 * Destroy all managed clients.
 */
export async function destroyAllClients(): Promise<void> {
  const ids = [...clients.keys()];
  await Promise.allSettled(ids.map((id) => destroyClient(id)));
}

/**
 * Get a managed client by account ID. Falls back to the first available client.
 */
export function getClient(accountId?: string): ManagedClient | undefined {
  if (accountId && clients.has(accountId)) return clients.get(accountId);
  if (clients.size > 0) return clients.values().next().value as ManagedClient;
  return undefined;
}

/**
 * Number of currently connected clients.
 */
export function clientCount(): number {
  return clients.size;
}

/**
 * Get diagnostic state for all managed clients.
 */
export function getClientStates(): Array<{ accountId: string; connectionState: ConnectionState }> {
  return [...clients.entries()].map(([id, m]) => ({
    accountId: id,
    connectionState: m.connectionState,
  }));
}

// ---------------------------------------------------------------------------
// Event normalization — SDK snake_case event -> plugin camelCase
// ---------------------------------------------------------------------------

/**
 * Convert a snake_case SDK event to the plugin's FeihanMessageEvent format.
 * Returns null if the event is malformed.
 *
 * The new SDK delivers events with lowercase field names:
 *   { header, body: { message: { message_id, sender_id: UserId, ... } } }
 *
 * sender_id is now a UserId object { user_id, union_user_id, open_user_id }
 * in the new SDK, but we keep backward compat with string for safety.
 */
export function normalizeSdkEvent(sdk: SdkMessageEvent): FeihanMessageEvent | null {
  const msg = sdk.body?.message;
  if (!msg) return null;

  // Extract user ID from sender_id — may be UserId object or legacy string
  const senderId = msg.sender_id;
  let userId = "";
  if (typeof senderId === "string") {
    userId = senderId;
  } else if (senderId && typeof senderId === "object") {
    userId =
      senderId.user_id ??
      senderId.open_user_id ??
      senderId.union_user_id ??
      "";
  }

  // Extract mention user IDs from the new SDK's text mention format
  const mentionUsers = (msg.mention_user_list ?? []).map((u) => ({
    userId: u.user_id?.user_id ?? u.user_id?.open_user_id ?? u.user_id?.union_user_id ?? "",
  }));

  // message_created_at may be Int64 (string) in the new SDK
  const createdAt =
    typeof msg.message_created_at === "string"
      ? parseInt(msg.message_created_at, 10) || Date.now()
      : msg.message_created_at ?? Date.now();

  return {
    message: {
      messageId: msg.message_id ?? "",
      messageType: msg.message_type ?? "",
      messageContent: msg.message_content,
      chatId: msg.chat_id ?? "",
      chatType: msg.chat_type ?? "direct",
      sender: {
        userId,
      },
      createdAt,
      mentionUserList: mentionUsers,
    },
  };
}

// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

/**
 * Outbound message delivery — send text/typing/read to Feihan chats.
 *
 * Pipeline: normalize target -> validate account/client -> send -> map errors
 *
 * Text-only for now; media/card/file delivery is follow-up (task 08).
 */

import {
  getClient,
  isAuthError,
  MessageType_TEXT,
  type ManagedClient,
  type SendMessageReq,
} from "../core/feihan-client.js";

// ---------------------------------------------------------------------------
// Send text
// ---------------------------------------------------------------------------

export interface SendTextResult {
  ok: boolean;
  messageId?: string;
  error?: Error;
  provider?: string;
}

/**
 * Send a text message to a Feihan chat.
 *
 * On auth error (code 40000006), forces a token refresh via preheat() and
 * retries once. This handles the SDK's token-refresh edge case without
 * requiring a gateway restart.
 */
export async function sendText(
  chatId: string,
  text: string,
  accountId?: string,
  replyMessageId?: string,
  logWarn?: (msg: string) => void,
): Promise<SendTextResult> {
  const managed = getClient(accountId);
  if (!managed) {
    return {
      ok: false,
      error: new Error(
        `[feihan] no connected client for account=${accountId ?? "default"}`,
      ),
    };
  }

  const req: SendMessageReq = {
    chat_id: chatId,
    message_type: MessageType_TEXT,
    message_content: {
      text: { content: text },
    },
    reply_message_id: replyMessageId,
  };

  try {
    const resp = await managed.client.Im.v1.Message.sendMessage(req);
    return { ok: true, messageId: resp.message_id, provider: "feihan" };
  } catch (err) {
    if (!isAuthError(err)) {
      return {
        ok: false,
        error: new Error(
          `[feihan] send failed for chat=${chatId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      };
    }

    // Auth token expired despite SDK auto-refresh — force refresh and retry once.
    // This avoids requiring a gateway restart when the SDK's background token
    // refresh hits an edge case (time sync drift, swallowed fetch failure, etc.).
    logWarn?.(
      `[feihan] auth error on send (chat=${chatId}, account=${accountId ?? "default"}) — refreshing token and retrying`,
    );

    try {
      await managed.client.preheat();
      const resp = await managed.client.Im.v1.Message.sendMessage(req);
      logWarn?.(
        `[feihan] auth retry succeeded (chat=${chatId}, account=${accountId ?? "default"})`,
      );
      return { ok: true, messageId: resp.message_id, provider: "feihan" };
    } catch (retryErr) {
      return {
        ok: false,
        error: new Error(
          `[feihan] send failed after auth retry for chat=${chatId}: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
        ),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

/**
 * Set typing indicator in a chat. Feihan typing lasts ~5s.
 */
export async function setTyping(
  chatId: string,
  accountId?: string,
): Promise<void> {
  const managed = getClient(accountId);
  if (!managed) return;
  try {
    await managed.client.Im.v1.Chat.createTyping({ chat_id: chatId });
  } catch {
    // Typing is best-effort — don't fail the message flow
  }
}

/**
 * Clear typing indicator.
 */
export async function clearTyping(
  chatId: string,
  accountId?: string,
): Promise<void> {
  const managed = getClient(accountId);
  if (!managed) return;
  try {
    await managed.client.Im.v1.Chat.deleteTyping({ chat_id: chatId });
  } catch {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Read receipt
// ---------------------------------------------------------------------------

/**
 * Mark a message as read.
 */
export async function readMessage(
  messageId: string,
  accountId?: string,
): Promise<void> {
  const managed = getClient(accountId);
  if (!managed) return;
  try {
    await managed.client.Im.v1.Message.readMessage({ message_id: messageId });
  } catch {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Delivery callback for inbound dispatch
// ---------------------------------------------------------------------------

/**
 * Create a deliver function scoped to an account, suitable for passing
 * to processInboundMessage's InboundDispatchOptions.
 */
export function makeDeliver(
  accountId?: string,
  logWarn?: (msg: string) => void,
): (chatId: string, text: string) => Promise<void> {
  return async (chatId: string, text: string) => {
    const result = await sendText(chatId, text, accountId, undefined, logWarn);
    if (!result.ok) {
      throw result.error ?? new Error("[feihan] send failed");
    }
  };
}

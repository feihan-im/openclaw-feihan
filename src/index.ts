// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { feihanPlugin } from "./channel.js";
import { listEnabledAccountConfigs, validateAccountConfig } from "./config.js";
import {
  createClient,
  destroyAllClients,
  clientCount,
} from "./core/feihan-client.js";
import { processInboundMessage } from "./messaging/inbound.js";
import { makeDeliver, setTyping, clearTyping, readMessage } from "./messaging/outbound.js";
import type { PluginApi, FeihanAccountConfig, FeihanMessageEvent } from "./types.js";

export default function register(api: PluginApi): void {
  api.registerChannel({ plugin: feihanPlugin });

  api.registerService({
    id: "feihan-sdk",
    start: async () => {
      if (clientCount() > 0) return;

      const accounts = listEnabledAccountConfigs(api.config);
      if (accounts.length === 0) {
        api.logger?.warn("[feihan] no enabled account config found — service idle");
        return;
      }

      for (const account of accounts) {
        const errors = validateAccountConfig(account);
        if (errors.length > 0) {
          api.logger?.warn(
            `[feihan] skipping account=${account.accountId}: ${errors.map((e) => e.message).join("; ")}`,
          );
          continue;
        }

        try {
          await startAccount(api, account);
          api.logger?.info(
            `[feihan] account=${account.accountId} connected (appId=${account.appId})`,
          );
        } catch (err) {
          api.logger?.error(
            `[feihan] account=${account.accountId} failed to start: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      api.logger?.info(`[feihan] service started with ${clientCount()} account(s)`);
    },
    stop: async () => {
      await destroyAllClients();
      api.logger?.info("[feihan] service stopped — all clients disconnected");
    },
  });

  api.logger?.info("[feihan] plugin registered");
}

/**
 * Start a single account — create client, subscribe to inbound events.
 */
async function startAccount(
  api: PluginApi,
  account: FeihanAccountConfig,
): Promise<void> {
  const deliver = makeDeliver(account.accountId, (msg) => api.logger?.warn(msg));

  await createClient({
    config: account,
    log: (msg: string) => api.logger?.debug(msg),
    onMessage: (event: FeihanMessageEvent, accountConfig: FeihanAccountConfig) => {
      // Fire-and-forget: process inbound with typing indicator
      handleInbound(api, accountConfig, event, deliver).catch((err) => {
        api.logger?.error(
          `[feihan] unhandled inbound error for account=${accountConfig.accountId}: ${err}`,
        );
      });
    },
  });
}

/**
 * Handle a single inbound message with typing indicator lifecycle.
 */
async function handleInbound(
  api: PluginApi,
  account: FeihanAccountConfig,
  event: FeihanMessageEvent,
  deliver: (chatId: string, text: string) => Promise<void>,
): Promise<void> {
  const chatId = event.message?.chatId;
  const messageId = event.message?.messageId;

  // Set typing indicator and mark message as read before processing
  if (chatId) {
    setTyping(chatId, account.accountId).catch(() => {});
  }
  if (messageId) {
    readMessage(messageId, account.accountId).catch(() => {});
  }

  try {
    await processInboundMessage(api, account, event, { deliver });
  } finally {
    // Clear typing after dispatch completes
    if (chatId) {
      clearTyping(chatId, account.accountId).catch(() => {});
    }
  }
}

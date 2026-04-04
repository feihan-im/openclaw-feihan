// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import {
  createChatChannelPlugin,
  createChannelPluginBase,
} from "openclaw/plugin-sdk/core";
import { createHybridChannelConfigBase } from "openclaw/plugin-sdk/channel-config-helpers";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { listAccountIds, resolveAccountConfig } from "./config.js";
import { sendText } from "./messaging/outbound.js";
import { parseTarget } from "./targets.js";
import type { FeihanAccountConfig } from "./types.js";

const BASE_FIELDS = ["appId", "appSecret", "backendUrl", "enabled", "enableEncryption", "requestTimeout"];

export const base = createChannelPluginBase<FeihanAccountConfig>({
  id: "feihan",

  meta: {
    id: "feihan",
    label: "Feihan",
    selectionLabel: "Feihan (飞函)",
    docsPath: "/channels/feihan",
    blurb: "Connect OpenClaw to Feihan",
    aliases: ["fh"],
  },

  capabilities: {
    chatTypes: ["direct", "group"],
  },

  config: {
    ...createHybridChannelConfigBase<FeihanAccountConfig>({
      sectionKey: "feihan",
      listAccountIds: (cfg) => listAccountIds(cfg),
      resolveAccount: (cfg, accountId) =>
        resolveAccountConfig(cfg, accountId ?? undefined),
      defaultAccountId: () => "default",
      inspectAccount(cfg, accountId) {
        const resolved = resolveAccountConfig(cfg, accountId ?? undefined);
        const hasConfig = Boolean(
          resolved.appId && resolved.appSecret && resolved.backendUrl,
        );
        return {
          enabled: resolved.enabled,
          configured: hasConfig,
          tokenStatus: hasConfig ? "available" : "missing",
        };
      },
      clearBaseFields: BASE_FIELDS,
    }),
  },

  setup: {
    validateInput: ({ input }) => {
      const missing: string[] = [];
      if (!input.appToken) missing.push("--app-token (App ID from Admin Console)");
      if (!input.token) missing.push("--token (App Secret from Admin Console)");
      if (!input.url) missing.push("--url (your Feihan server address)");
      if (missing.length > 0) {
        return [
          `Missing required flags: ${missing.join(", ")}`,
          "",
          "Usage:",
          `  openclaw channels add --channel feihan --app-token <APP_ID> --token <APP_SECRET> --url <BACKEND_URL>`,
          "",
          "You can find App ID and App Secret in:",
          "  Feihan Admin Console → Workplace → App Management → App Details",
        ].join("\n");
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const updated = structuredClone(cfg) as Record<string, unknown>;
      if (!updated.channels) updated.channels = {};
      const ch = updated.channels as Record<string, Record<string, unknown>>;
      if (!ch["feihan"]) ch["feihan"] = {};
      const section = ch["feihan"];

      // Map ChannelSetupInput keys to our config shape:
      //   appToken → appId, token → appSecret, url → backendUrl
      const appId = input.appToken;
      const appSecret = input.token;
      const backendUrl = input.url;

      if (accountId && accountId !== "default") {
        // Multi-account: write under accounts.<accountId>
        if (!section.accounts) section.accounts = {};
        const accounts = section.accounts as Record<string, Record<string, unknown>>;
        if (!accounts[accountId]) accounts[accountId] = {};
        const account = accounts[accountId];
        if (appId) account.appId = appId;
        if (appSecret) account.appSecret = appSecret;
        if (backendUrl) account.backendUrl = backendUrl;
      } else {
        // Single-account: write at top level
        if (appId) section.appId = appId;
        if (appSecret) section.appSecret = appSecret;
        if (backendUrl) section.backendUrl = backendUrl;
      }

      return updated as OpenClawConfig;
    },
  },

  setupWizard: {
    channel: "feihan",
    status: {
      configuredLabel: "Connected",
      unconfiguredLabel: "Not configured",
      resolveConfigured: ({ cfg }) => {
        const ids = listAccountIds(cfg);
        return ids.some((id) => {
          const resolved = resolveAccountConfig(cfg, id);
          return Boolean(resolved.appId && resolved.appSecret && resolved.backendUrl);
        });
      },
    },
    credentials: [
      {
        inputKey: "appToken",
        providerHint: "feihan",
        credentialLabel: "App ID",
        preferredEnvVar: "FEIHAN_APP_ID",
        envPrompt: "Use FEIHAN_APP_ID from environment?",
        keepPrompt: "Keep current App ID?",
        inputPrompt:
          "Enter App ID (from Feihan Admin Console → Workplace → App Management → App Details):",
        inspect: ({ cfg, accountId }) => {
          const resolved = resolveAccountConfig(cfg, accountId ?? undefined);
          return {
            accountConfigured: Boolean(resolved.appId),
            hasConfiguredValue: Boolean(resolved.appId),
          };
        },
      },
      {
        inputKey: "token",
        providerHint: "feihan",
        credentialLabel: "App Secret",
        preferredEnvVar: "FEIHAN_APP_SECRET",
        envPrompt: "Use FEIHAN_APP_SECRET from environment?",
        keepPrompt: "Keep current App Secret?",
        inputPrompt:
          "Enter App Secret (from the same App Details page, keep this value confidential):",
        inspect: ({ cfg, accountId }) => {
          const resolved = resolveAccountConfig(cfg, accountId ?? undefined);
          return {
            accountConfigured: Boolean(resolved.appSecret),
            hasConfiguredValue: Boolean(resolved.appSecret),
          };
        },
      },
      {
        inputKey: "url",
        providerHint: "feihan",
        credentialLabel: "Feihan Server URL",
        preferredEnvVar: "FEIHAN_BACKEND_URL",
        envPrompt: "Use FEIHAN_BACKEND_URL from environment?",
        keepPrompt: "Keep current Feihan Server URL?",
        inputPrompt:
          "Enter your Feihan server address (e.g. http://192.168.10.10:21000):",
        inspect: ({ cfg, accountId }) => {
          const resolved = resolveAccountConfig(cfg, accountId ?? undefined);
          return {
            accountConfigured: Boolean(resolved.backendUrl),
            hasConfiguredValue: Boolean(resolved.backendUrl),
          };
        },
      },
    ],
  },
});

// Cast needed: createChannelPluginBase returns Partial<config> but
// createChatChannelPlugin requires config to be defined. We always
// provide config above so the cast is safe.
export const feihanPlugin = createChatChannelPlugin<FeihanAccountConfig>({
  base: base as Parameters<typeof createChatChannelPlugin<FeihanAccountConfig>>[0]["base"],

  // DM security: who can message the bot
  security: {
    dm: {
      channelKey: "feihan",
      resolvePolicy: () => undefined,
      resolveAllowFrom: () => [],
      defaultPolicy: "allowlist",
    },
  },

  // Threading: how replies are delivered
  threading: { topLevelReplyToMode: "reply" },

  // Outbound: send messages to the platform
  outbound: {
    attachedResults: {
      channel: "feihan",
      sendText: async (ctx) => {
        const target = parseTarget(ctx.to);
        if (!target) {
          throw new Error(`[feihan] invalid send target: ${ctx.to}`);
        }
        const result = await sendText(
          target.id,
          ctx.text,
          ctx.accountId ?? undefined,
          ctx.replyToId ?? undefined,
        );
        if (!result.ok) {
          throw result.error ?? new Error("[feihan] send failed");
        }
        return { messageId: result.messageId ?? "" };
      },
    },
    base: {
      deliveryMode: "direct",
      resolveTarget: ({ to }) => {
        if (!to) return { ok: false as const, error: new Error("[feihan] --to is required") };
        const target = parseTarget(to);
        if (!target) {
          return {
            ok: false as const,
            error: new Error(
              `Feihan requires --to <user:ID|chat:ID>, got: ${JSON.stringify(to)}`,
            ),
          };
        }
        return { ok: true as const, to: `${target.kind}:${target.id}` };
      },
    },
  },
});

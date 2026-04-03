// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import {
  createChatChannelPlugin,
  createChannelPluginBase,
} from "openclaw/plugin-sdk/core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { listAccountIds, resolveAccountConfig } from "./config.js";
import { sendText } from "./messaging/outbound.js";
import { parseTarget } from "./targets.js";

type ResolvedAccount = {
  accountId: string | null;
  appId: string;
  appSecret: string;
  backendUrl: string;
  enableEncryption: boolean;
  requestTimeout: number;
  requireMention: boolean;
};

function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedAccount {
  const section = (cfg.channels as Record<string, any>)?.["feihan"];
  const accounts = section?.accounts;
  const defaultAccount = section?.defaultAccount;

  // If multi-account mode, resolve the specific account
  if (accounts && Object.keys(accounts).length > 0) {
    const targetId = accountId ?? defaultAccount ?? Object.keys(accounts)[0];
    const account = accounts[targetId];
    if (!account) {
      throw new Error(`feihan: account "${targetId}" not found`);
    }
    return {
      accountId: targetId,
      appId: account.appId,
      appSecret: account.appSecret,
      backendUrl: account.backendUrl,
      enableEncryption: account.enableEncryption ?? section.enableEncryption ?? true,
      requestTimeout: account.requestTimeout ?? section.requestTimeout ?? 30000,
      requireMention: account.requireMention ?? section.requireMention ?? true,
    };
  }

  // Single-account mode
  const appId = section?.appId;
  const appSecret = section?.appSecret;
  const backendUrl = section?.backendUrl;

  if (!appId || !appSecret || !backendUrl) {
    throw new Error("feihan: appId, appSecret, and backendUrl are required");
  }

  return {
    accountId: null,
    appId,
    appSecret,
    backendUrl,
    enableEncryption: section?.enableEncryption ?? true,
    requestTimeout: section?.requestTimeout ?? 30000,
    requireMention: section?.requireMention ?? true,
  };
}

export const feihanPlugin = createChatChannelPlugin<ResolvedAccount>({
  base: createChannelPluginBase({
    id: "feihan",
    setup: {
      resolveAccount,
      inspectAccount(cfg, accountId) {
        const section = (cfg.channels as Record<string, any>)?.["feihan"];
        const hasConfig = Boolean(
          section?.appId && section?.appSecret && section?.backendUrl,
        );
        return {
          enabled: Boolean(section?.enabled !== false),
          configured: hasConfig,
          tokenStatus: hasConfig ? "available" : "missing",
        };
      },
    },
  }),

  // Plugin metadata
  meta: {
    id: "feihan",
    label: "Feihan",
    selectionLabel: "Feihan (飞函)",
    docsPath: "/channels/feihan",
    blurb: "Connect OpenClaw to Feihan",
    aliases: ["feihan", "fh"],
  },

  // Capabilities
  capabilities: {
    chatTypes: ["direct", "group"] as const,
  },

  // Config
  config: {
    listAccountIds: (cfg: unknown) => listAccountIds(cfg),
    resolveAccount: (cfg: unknown, accountId?: string) =>
      resolveAccountConfig(cfg, accountId),
  },

  // Outbound messaging
  outbound: {
    deliveryMode: "direct" as const,
    resolveTarget: ({ to }: { to?: string }) => {
      const target = parseTarget(to);
      if (!target) {
        return {
          ok: false as const,
          error: new Error(
            `Feihan requires --to <user:ID|chat:ID>, got: ${JSON.stringify(to)}`,
          ),
        };
      }
      // Normalize to "kind:id" so sendText receives a consistent format
      return { ok: true as const, to: `${target.kind}:${target.id}` };
    },
    sendText: async ({
      to,
      text,
      accountId,
    }: {
      to: string;
      text: string;
      accountId?: string;
    }) => {
      // Re-parse the normalized target to extract the chat/user ID
      const target = parseTarget(to);
      if (!target) {
        return {
          ok: false,
          error: new Error(`[feihan] invalid send target: ${to}`),
        };
      }
      return sendText(target.id, text, accountId);
    },
  },

  // Setup wizard for openclaw onboard
  setupWizard: {
    channel: "feihan",
    status: {
      configuredLabel: "Connected",
      unconfiguredLabel: "Not configured",
      resolveConfigured: ({ cfg }: { cfg: OpenClawConfig }) => {
        const section = (cfg.channels as Record<string, any>)?.["feihan"];
        return Boolean(section?.appId && section?.appSecret && section?.backendUrl);
      },
    },
    credentials: [
      {
        inputKey: "appId",
        providerHint: "feihan",
        credentialLabel: "App ID",
        preferredEnvVar: "FEIHAN_APP_ID",
        envPrompt: "Use FEIHAN_APP_ID from environment?",
        keepPrompt: "Keep current App ID?",
        inputPrompt: "Enter your Feihan App ID:",
        inspect: ({ cfg }: { cfg: OpenClawConfig }) => {
          const section = (cfg.channels as Record<string, any>)?.["feihan"];
          return {
            accountConfigured: Boolean(section?.appId),
            hasConfiguredValue: Boolean(section?.appId),
          };
        },
      },
      {
        inputKey: "appSecret",
        providerHint: "feihan",
        credentialLabel: "App Secret",
        preferredEnvVar: "FEIHAN_APP_SECRET",
        envPrompt: "Use FEIHAN_APP_SECRET from environment?",
        keepPrompt: "Keep current App Secret?",
        inputPrompt: "Enter your Feihan App Secret:",
        inspect: ({ cfg }: { cfg: OpenClawConfig }) => {
          const section = (cfg.channels as Record<string, any>)?.["feihan"];
          return {
            accountConfigured: Boolean(section?.appSecret),
            hasConfiguredValue: Boolean(section?.appSecret),
          };
        },
      },
      {
        inputKey: "backendUrl",
        providerHint: "feihan",
        credentialLabel: "Backend URL",
        preferredEnvVar: "FEIHAN_BACKEND_URL",
        envPrompt: "Use FEIHAN_BACKEND_URL from environment?",
        keepPrompt: "Keep current Backend URL?",
        inputPrompt: "Enter your Feihan backend server URL:",
        inspect: ({ cfg }: { cfg: OpenClawConfig }) => {
          const section = (cfg.channels as Record<string, any>)?.["feihan"];
          return {
            accountConfigured: Boolean(section?.backendUrl),
            hasConfiguredValue: Boolean(section?.backendUrl),
          };
        },
      },
    ],
  },
});

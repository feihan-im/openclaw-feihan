// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { listAccountIds, resolveAccountConfig } from "./config.js";
import { sendText } from "./messaging/outbound.js";
import { parseTarget } from "./targets.js";

export const feihanPlugin = {
  id: "feihan",
  meta: {
    id: "feihan",
    label: "Feihan",
    selectionLabel: "Feihan (飞函)",
    docsPath: "/channels/feihan",
    blurb: "Feihan enterprise IM channel",
    aliases: ["feihan", "fh"],
  },
  capabilities: {
    chatTypes: ["direct", "group"] as const,
  },
  config: {
    listAccountIds: (cfg: unknown) => listAccountIds(cfg),
    resolveAccount: (cfg: unknown, accountId?: string) =>
      resolveAccountConfig(cfg, accountId),
  },
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
};

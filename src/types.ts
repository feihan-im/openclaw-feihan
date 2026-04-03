// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

// --- Plugin Config Types ---

export interface FeihanAccountConfig {
  accountId: string;
  enabled: boolean;
  appId: string;
  appSecret: string;
  backendUrl: string;
  enableEncryption: boolean;
  requestTimeout: number;
  requireMention: boolean;
  botUserId?: string;
  inboundWhitelist: string[];
}

export interface FeihanRawAccountConfig {
  appId?: string;
  appSecret?: string;
  backendUrl?: string;
  enableEncryption?: boolean;
  requestTimeout?: number;
  requireMention?: boolean;
  enabled?: boolean;
  botUserId?: string;
  inboundWhitelist?: string[];
}

export interface FeihanChannelConfig {
  appId?: string;
  appSecret?: string;
  backendUrl?: string;
  enableEncryption?: boolean;
  requestTimeout?: number;
  requireMention?: boolean;
  enabled?: boolean;
  botUserId?: string;
  inboundWhitelist?: string[];
  accounts?: Record<string, FeihanRawAccountConfig>;
}

// --- Feihan Event Types ---

export interface FeihanUserId {
  userId: string;
  unionUserId?: string;
  openUserId?: string;
}

export interface FeihanMessage {
  messageId: string;
  messageType: string;
  messageContent: unknown;
  chatId: string;
  chatType: string;
  sender: FeihanUserId;
  createdAt: number;
  mentionUserList?: FeihanUserId[];
}

export interface FeihanMessageEvent {
  message: FeihanMessage;
}

// --- Target Types ---

export interface ParsedTarget {
  kind: "user" | "chat";
  id: string;
}

// --- Connection Types ---

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting";

// --- OpenClaw Plugin API (minimal type surface) ---

export interface PluginApi {
  registerChannel(opts: { plugin: unknown }): void;
  registerService(opts: {
    id: string;
    start: () => Promise<void>;
    stop: () => Promise<void>;
  }): void;
  config: { channels?: { feihan?: FeihanChannelConfig } } & Record<
    string,
    unknown
  >;
  runtime: {
    channel: {
      reply: {
        dispatchReplyWithBufferedBlockDispatcher: (opts: unknown) => Promise<void>;
      };
      session: {
        recordInboundSession: (opts: unknown) => Promise<void>;
        resolveStorePath?: (store: unknown, opts: unknown) => string;
      };
      routing: {
        resolveAgentRoute: (opts: unknown) => unknown;
      };
    };
  };
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
}

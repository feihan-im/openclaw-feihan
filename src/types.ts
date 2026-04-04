// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

// --- Plugin Config Types ---

export interface FeihanAccountConfig {
  accountId: string;
  appId: string;
  appSecret: string;
  backendUrl: string;
  enabled: boolean;
  enableEncryption: boolean;
  requestTimeout: number;
}

export interface FeihanRawAccountConfig {
  appId?: string;
  appSecret?: string;
  backendUrl?: string;
  enabled?: boolean;
  enableEncryption?: boolean;
  requestTimeout?: number;
}

export interface FeihanChannelConfig {
  appId?: string;
  appSecret?: string;
  backendUrl?: string;
  enabled?: boolean;
  enableEncryption?: boolean;
  requestTimeout?: number;
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


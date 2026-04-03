// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

/**
 * Type declarations for openclaw/plugin-sdk.
 *
 * These types provide the minimal interface needed for the channel plugin.
 * The actual implementation is provided by the OpenClaw runtime at plugin load time.
 */

declare module "openclaw/plugin-sdk/core" {
 export interface OpenClawConfig {
  channels?: Record<string, unknown>;
  plugins?: {
   entries?: Record<string, { enabled?: boolean; config?: unknown }>;
  };
 }

 export interface ChannelPluginMeta {
  id: string;
  label: string;
  selectionLabel?: string;
  docsPath?: string;
  blurb?: string;
  aliases?: string[];
 }

 export interface ChannelPluginCapabilities {
  chatTypes?: readonly ("direct" | "group")[];
 }

 export interface ResolvedAccountResult {
  ok: true;
  to: string;
 }

 export interface ResolvedAccountError {
  ok: false;
  error: Error;
 }

 export type ResolvedAccount = ResolvedAccountResult | ResolvedAccountError;

 export interface OutboundAdapter {
  deliveryMode?: "direct" | "queue";
  resolveTarget?: (params: { to?: string }) => ResolvedAccount;
  sendText?: (params: {
   to: string;
   text: string;
   accountId?: string;
  }) => Promise<{ ok: boolean; error?: Error }>;
 }

 export interface AccountInspection {
  enabled: boolean;
  configured: boolean;
  tokenStatus: "available" | "missing" | "invalid";
 }

 export interface ChannelSetup {
  resolveAccount: (
   cfg: OpenClawConfig,
   accountId?: string | null,
  ) => unknown;
  inspectAccount?: (
   cfg: OpenClawConfig,
   accountId?: string | null,
  ) => AccountInspection;
 }

 export interface ChannelPluginBase {
  id: string;
  setup?: ChannelSetup;
 }

 export interface ChatChannelPlugin<TResolved = unknown> {
  base: ChannelPluginBase;
  meta?: ChannelPluginMeta;
  capabilities?: ChannelPluginCapabilities;
  config?: {
   listAccountIds?: (cfg: unknown) => string[];
   resolveAccount?: (cfg: unknown, accountId?: string) => unknown;
  };
  outbound?: OutboundAdapter;
  setupWizard?: unknown;
 }

 export interface PluginLogger {
  debug?: (msg: string) => void;
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
 }

 export interface PluginApi {
  config: OpenClawConfig;
  logger?: PluginLogger;
  pluginConfig?: unknown;
  registrationMode: "full" | "setup-only" | "setup-runtime" | "cli-metadata";
  runtime?: unknown;
  registerChannel(options: { plugin: unknown }): void;
  registerService(service: {
   id: string;
   start: () => Promise<void>;
   stop: () => Promise<void>;
  }): void;
  registerTool(options: unknown): void;
  registerHook(events: string[], handler: unknown): void;
  registerHttpRoute(options: unknown): void;
  registerGatewayMethod(name: string, handler: unknown): void;
  registerCli(registrar: unknown, options?: unknown): void;
  registerCommand(options: unknown): void;
 }

 export type { PluginApi };

 export interface DefineChannelPluginEntryOptions<TPlugin> {
  id: string;
  name: string;
  description: string;
  plugin: TPlugin;
  configSchema?: unknown;
  setRuntime?: (runtime: unknown) => void;
  registerCliMetadata?: (api: PluginApi) => void;
  registerFull?: (api: PluginApi) => void;
 }

 export interface DefinedChannelPluginEntry<TPlugin> {
  plugin: TPlugin;
 }

 export interface DefineSetupPluginEntry<TPlugin> {
  plugin: TPlugin;
 }

 export function createChannelPluginBase(options: {
  id: string;
  setup: ChannelSetup;
 }): ChannelPluginBase;

 export function createChatChannelPlugin<TResolved>(options: {
  base: ChannelPluginBase;
  meta?: ChannelPluginMeta;
  capabilities?: ChannelPluginCapabilities;
  config?: {
   listAccountIds?: (cfg: unknown) => string[];
   resolveAccount?: (cfg: unknown, accountId?: string) => unknown;
  };
  outbound?: OutboundAdapter;
  setupWizard?: unknown;
 }): ChatChannelPlugin<TResolved>;

 export function defineChannelPluginEntry<TPlugin>(
  options: DefineChannelPluginEntryOptions<TPlugin>,
 ): DefinedChannelPluginEntry<TPlugin>;

 export function defineSetupPluginEntry<TPlugin>(
  plugin: TPlugin,
 ): DefineSetupPluginEntry<TPlugin>;

 export function buildChannelConfigSchema(schema: unknown): unknown;
}

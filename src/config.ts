// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { FeihanChannelConfig, FeihanAccountConfig } from "./types.js";

const DEFAULTS = {
  enableEncryption: true,
  requestTimeout: 30_000,
} as const;

const ENV_PREFIX = "FEIHAN_";

function getChannelConfig(cfg: unknown): FeihanChannelConfig | undefined {
  const root = cfg as Record<string, unknown> | undefined;
  return root?.channels
    ? ((root.channels as Record<string, unknown>).feihan as
        | FeihanChannelConfig
        | undefined)
    : undefined;
}

function readEnvConfig(): Partial<FeihanAccountConfig> {
  const env = process.env;
  const result: Partial<FeihanAccountConfig> = {};

  if (env[`${ENV_PREFIX}APP_ID`]) result.appId = env[`${ENV_PREFIX}APP_ID`];
  if (env[`${ENV_PREFIX}APP_SECRET`])
    result.appSecret = env[`${ENV_PREFIX}APP_SECRET`];
  if (env[`${ENV_PREFIX}BACKEND_URL`])
    result.backendUrl = env[`${ENV_PREFIX}BACKEND_URL`];
  if (env[`${ENV_PREFIX}ENABLE_ENCRYPTION`] !== undefined)
    result.enableEncryption =
      env[`${ENV_PREFIX}ENABLE_ENCRYPTION`] !== "false";
  if (env[`${ENV_PREFIX}REQUEST_TIMEOUT`])
    result.requestTimeout = Number(env[`${ENV_PREFIX}REQUEST_TIMEOUT`]);

  return result;
}

export function listAccountIds(cfg: unknown): string[] {
  const ch = getChannelConfig(cfg);
  if (!ch) {
    // Check env vars as fallback
    if (process.env[`${ENV_PREFIX}APP_ID`]) return ["default"];
    return [];
  }
  if (ch.accounts) return Object.keys(ch.accounts);
  // env var fallback
  if (process.env[`${ENV_PREFIX}APP_ID`]) return ["default"];
  return [];
}

export function resolveAccountConfig(
  cfg: unknown,
  accountId?: string,
): FeihanAccountConfig {
  const ch = getChannelConfig(cfg);
  const id = accountId ?? "default";
  const envConfig = readEnvConfig();

  const raw = ch?.accounts?.[id];

  return {
    accountId: id,
    appId: raw?.appId ?? envConfig.appId ?? "",
    appSecret: raw?.appSecret ?? envConfig.appSecret ?? "",
    backendUrl: raw?.backendUrl ?? envConfig.backendUrl ?? "",
    enabled: raw?.enabled ?? true,
    enableEncryption:
      raw?.enableEncryption ?? envConfig.enableEncryption ?? DEFAULTS.enableEncryption,
    requestTimeout:
      raw?.requestTimeout ?? envConfig.requestTimeout ?? DEFAULTS.requestTimeout,
  };
}

export interface ConfigValidationError {
  field: string;
  message: string;
}

export function validateAccountConfig(
  config: FeihanAccountConfig,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (!config.appId) {
    errors.push({
      field: "appId",
      message: `Account "${config.accountId}": appId is required. Set it in channels.feihan.appId or FEIHAN_APP_ID env var.`,
    });
  }

  if (!config.appSecret) {
    errors.push({
      field: "appSecret",
      message: `Account "${config.accountId}": appSecret is required. Set it in channels.feihan.appSecret or FEIHAN_APP_SECRET env var.`,
    });
  }

  if (!config.backendUrl) {
    errors.push({
      field: "backendUrl",
      message: `Account "${config.accountId}": backendUrl is required. Set it in channels.feihan.backendUrl or FEIHAN_BACKEND_URL env var.`,
    });
  } else if (
    !config.backendUrl.startsWith("http://") &&
    !config.backendUrl.startsWith("https://")
  ) {
    errors.push({
      field: "backendUrl",
      message: `Account "${config.accountId}": backendUrl must start with http:// or https:// (got "${config.backendUrl}").`,
    });
  }

  if (
    typeof config.requestTimeout !== "number" ||
    !Number.isFinite(config.requestTimeout) ||
    config.requestTimeout <= 0
  ) {
    errors.push({
      field: "requestTimeout",
      message: `Account "${config.accountId}": requestTimeout must be a positive number in milliseconds (got ${config.requestTimeout}).`,
    });
  }

  return errors;
}

export function resolveAndValidateAccountConfig(
  cfg: unknown,
  accountId?: string,
): FeihanAccountConfig {
  const config = resolveAccountConfig(cfg, accountId);
  const errors = validateAccountConfig(config);

  if (errors.length > 0) {
    const messages = errors.map((e) => `  - ${e.message}`).join("\n");
    throw new Error(
      `[feihan] Invalid config for account "${config.accountId}":\n${messages}`,
    );
  }

  return config;
}

export function listEnabledAccountConfigs(cfg: unknown): FeihanAccountConfig[] {
  const ids = listAccountIds(cfg);
  return ids
    .map((id) => resolveAccountConfig(cfg, id))
    .filter((account) => account.enabled);
}

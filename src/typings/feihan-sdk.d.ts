// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

/**
 * Re-export types from @feihan-im/sdk used across the plugin.
 *
 * The published SDK ships its own type declarations. This file exists
 * only to keep the rest of the plugin importing from a single local
 * barrel, making future SDK swaps cheaper.
 */
export type {
  FeihanClient,
  FeihanClientOptions,
} from "@feihan-im/sdk";

export {
  LoggerLevel,
} from "@feihan-im/sdk";

export type {
  Logger,
  EventHeader,
} from "@feihan-im/sdk";

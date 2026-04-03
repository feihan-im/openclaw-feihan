// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

/**
 * Type declarations for openclaw/plugin-sdk/core.
 *
 * These types provide the minimal interface needed for the setup entry point.
 * The actual implementation is provided by the OpenClaw runtime at plugin load time.
 */

declare module "openclaw/plugin-sdk/core" {
  export interface PromptOptions {
    type: "text" | "password" | "confirm" | "select";
    message: string;
    default?: string | boolean;
    validate?: (value: string) => boolean | string;
  }

  export interface SetupContext {
    prompt: (options: PromptOptions) => Promise<string>;
    updateConfig: (key: string, value: string | boolean | number) => Promise<void>;
  }

  export interface SetupPluginEntry {
    onSetup: (context: SetupContext) => Promise<void>;
  }

  export function defineSetupPluginEntry(entry: SetupPluginEntry): SetupPluginEntry;
}

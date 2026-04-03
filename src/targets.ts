// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

/**
 * Target parsing & validation for the --to argument.
 *
 * Accepted formats:
 *   "chat:oc_abc123"         -> { kind: "chat", id: "oc_abc123" }
 *   "user:83870344313569283" -> { kind: "user", id: "83870344313569283" }
 *   "feihan:chat:oc_abc123"  -> { kind: "chat", id: "oc_abc123" }  (prefix stripped)
 *   "oc_abc123"              -> { kind: "chat", id: "oc_abc123" }   (bare ID defaults to chat)
 *
 * Returns null for empty, whitespace-only, or malformed targets (e.g. "user:" with no ID).
 */

import type { ParsedTarget } from "./types.js";

/**
 * Parse a raw --to string into a structured target.
 * Returns null if the input is missing, empty, or has no usable ID.
 */
export function parseTarget(to?: string): ParsedTarget | null {
  const raw = String(to ?? "").trim();
  if (!raw) return null;

  // Strip optional "feihan:" channel prefix (case-insensitive)
  const stripped = raw.replace(/^feihan:/i, "");

  if (stripped.startsWith("user:")) {
    const id = stripped.slice("user:".length).trim();
    return id ? { kind: "user", id } : null;
  }

  if (stripped.startsWith("chat:")) {
    const id = stripped.slice("chat:".length).trim();
    return id ? { kind: "chat", id } : null;
  }

  // Bare ID — default to chat (Feihan SDK uses ChatId for sending)
  return stripped ? { kind: "chat", id: stripped } : null;
}

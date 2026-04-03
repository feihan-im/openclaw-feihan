// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { parseTarget } from "./targets.js";

describe("parseTarget", () => {
  // --- Happy paths ---

  it('parses "user:<id>"', () => {
    expect(parseTarget("user:abc123")).toEqual({ kind: "user", id: "abc123" });
  });

  it('parses "chat:<id>"', () => {
    expect(parseTarget("chat:oc_xyz")).toEqual({ kind: "chat", id: "oc_xyz" });
  });

  it('strips "feihan:" prefix and parses "chat:<id>"', () => {
    expect(parseTarget("feihan:chat:oc_xyz")).toEqual({
      kind: "chat",
      id: "oc_xyz",
    });
  });

  it('strips "feihan:" prefix and parses "user:<id>"', () => {
    expect(parseTarget("feihan:user:abc")).toEqual({
      kind: "user",
      id: "abc",
    });
  });

  it("strips feihan: prefix case-insensitively", () => {
    expect(parseTarget("FEIHAN:chat:oc_1")).toEqual({
      kind: "chat",
      id: "oc_1",
    });
    expect(parseTarget("Feihan:user:u1")).toEqual({ kind: "user", id: "u1" });
  });

  it("defaults bare ID to chat", () => {
    expect(parseTarget("oc_abc123")).toEqual({
      kind: "chat",
      id: "oc_abc123",
    });
  });

  it("defaults bare numeric ID to chat", () => {
    expect(parseTarget("83870344313569283")).toEqual({
      kind: "chat",
      id: "83870344313569283",
    });
  });

  it("trims whitespace", () => {
    expect(parseTarget("  chat:oc_1  ")).toEqual({
      kind: "chat",
      id: "oc_1",
    });
    expect(parseTarget("  user:abc  ")).toEqual({ kind: "user", id: "abc" });
  });

  // --- Null/invalid cases ---

  it("returns null for undefined", () => {
    expect(parseTarget(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseTarget("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(parseTarget("   ")).toBeNull();
  });

  it('returns null for "user:" with no ID', () => {
    expect(parseTarget("user:")).toBeNull();
  });

  it('returns null for "chat:" with no ID', () => {
    expect(parseTarget("chat:")).toBeNull();
  });

  it('returns null for "user: " (whitespace-only ID)', () => {
    expect(parseTarget("user:  ")).toBeNull();
  });

  it('returns null for "feihan:" with nothing after', () => {
    expect(parseTarget("feihan:")).toBeNull();
  });
});

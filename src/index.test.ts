// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import register from "./index.js";
import type { PluginApi } from "./types.js";

vi.mock("./core/feihan-client.js", () => ({
  createClient: vi.fn(),
  destroyAllClients: vi.fn().mockResolvedValue(undefined),
  clientCount: vi.fn().mockReturnValue(0),
}));

vi.mock("./messaging/outbound.js", () => ({
  makeDeliver: vi.fn().mockReturnValue(vi.fn()),
  setTyping: vi.fn().mockResolvedValue(undefined),
  clearTyping: vi.fn().mockResolvedValue(undefined),
  readMessage: vi.fn().mockResolvedValue(undefined),
}));

import { createClient, clientCount } from "./core/feihan-client.js";

function createMockApi(config: unknown = {}): PluginApi {
  return {
    registerChannel: vi.fn(),
    registerService: vi.fn(),
    config: config as PluginApi["config"],
    runtime: {
      channel: {
        reply: { dispatchReplyWithBufferedBlockDispatcher: vi.fn() },
        session: { recordInboundSession: vi.fn() },
        routing: { resolveAgentRoute: vi.fn() },
      },
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
}

function extractStartFn(api: PluginApi): () => Promise<void> {
  const call = (api.registerService as ReturnType<typeof vi.fn>).mock.calls[0];
  return call[0].start;
}

describe("register", () => {
  beforeEach(() => {
    vi.mocked(clientCount).mockReturnValue(0);
    vi.mocked(createClient).mockResolvedValue({ client: {}, config: {} } as any);
  });

  it("registers channel and service", () => {
    const api = createMockApi();
    register(api);

    expect(api.registerChannel).toHaveBeenCalledOnce();
    expect(api.registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ plugin: expect.objectContaining({ id: "feihan" }) }),
    );

    expect(api.registerService).toHaveBeenCalledOnce();
    expect(api.registerService).toHaveBeenCalledWith(
      expect.objectContaining({ id: "feihan-sdk" }),
    );
  });

  it("logs plugin registration", () => {
    const api = createMockApi();
    register(api);
    expect(api.logger!.info).toHaveBeenCalledWith("[feihan] plugin registered");
  });
});

describe("service start — config validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientCount).mockReturnValue(0);
    vi.mocked(createClient).mockResolvedValue({ client: {}, config: {} } as any);
  });

  it("skips account with empty appId and logs warning", async () => {
    const api = createMockApi({
      channels: {
        feihan: {
          accounts: {
            broken: { appId: "", appSecret: "s", backendUrl: "https://x.io", enabled: true },
          },
        },
      },
    });
    register(api);
    await extractStartFn(api)();

    expect(api.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining("skipping account=broken"),
    );
    expect(api.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining("appId is required"),
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("skips account with invalid backendUrl scheme and logs warning", async () => {
    const api = createMockApi({
      channels: {
        feihan: {
          accounts: {
            bad: { appId: "a", appSecret: "s", backendUrl: "ftp://bad.url", enabled: true },
          },
        },
      },
    });
    register(api);
    await extractStartFn(api)();

    expect(api.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining("must start with http://"),
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("connects valid accounts normally", async () => {
    const api = createMockApi({
      channels: {
        feihan: { appId: "a", appSecret: "s", backendUrl: "https://ok.io" },
      },
    });
    register(api);
    await extractStartFn(api)();

    expect(createClient).toHaveBeenCalledOnce();
    expect(api.logger!.info).toHaveBeenCalledWith(
      expect.stringContaining("connected"),
    );
  });

  it("skips invalid account but connects valid one in multi-account config", async () => {
    const api = createMockApi({
      channels: {
        feihan: {
          accounts: {
            bad: { appId: "", appSecret: "s", backendUrl: "https://x.io", enabled: true },
            good: { appId: "a", appSecret: "s", backendUrl: "https://x.io", enabled: true },
          },
        },
      },
    });
    register(api);
    await extractStartFn(api)();

    // bad account skipped with warning
    expect(api.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining("skipping account=bad"),
    );
    // good account connected
    expect(createClient).toHaveBeenCalledOnce();
    expect(api.logger!.info).toHaveBeenCalledWith(
      expect.stringContaining("account=good connected"),
    );
  });
});

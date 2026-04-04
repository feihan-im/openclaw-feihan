// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SDK module before any imports
vi.mock("openclaw/plugin-sdk/core", () => ({
  defineChannelPluginEntry: (config: unknown) => config,
  createChatChannelPlugin: (config: unknown) => config,
  createChannelPluginBase: (config: unknown) => config,
}));

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

// Import after mocks are set up
import { createClient, clientCount } from "./core/feihan-client.js";

// Import the entry module - need to use dynamic import for esm
const entry = await import("./index.js");

interface MockPluginApi {
  registerChannel: ReturnType<typeof vi.fn>;
  registerService: ReturnType<typeof vi.fn>;
  config: { channels?: Record<string, unknown> };
  logger?: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
}

function createMockApi(config: unknown = {}): MockPluginApi {
  return {
    registerChannel: vi.fn(),
    registerService: vi.fn(),
    config: config as MockPluginApi["config"],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
}

function extractStartFn(api: MockPluginApi): () => Promise<void> {
  const call = (api.registerService as ReturnType<typeof vi.fn>).mock.calls[0];
  return call[0].start;
}

describe("entry module", () => {
  beforeEach(() => {
    vi.mocked(clientCount).mockReturnValue(0);
    vi.mocked(createClient).mockResolvedValue({ client: {}, config: {} } as any);
  });

  it("exports entry with correct id", () => {
    expect(entry.default.id).toBe("feihan");
  });

  it("exports entry with correct name", () => {
    expect(entry.default.name).toBe("Feihan");
  });

  it("exports entry with plugin", () => {
    expect(entry.default.plugin).toBeDefined();
    expect(entry.default.plugin.base.id).toBe("feihan");
  });

  it("exports registerFull function", () => {
    expect(entry.default.registerFull).toBeInstanceOf(Function);
  });

  it("registerFull registers service", () => {
    const api = createMockApi();
    entry.default.registerFull(api);

    expect(api.registerService).toHaveBeenCalledOnce();
    expect(api.registerService).toHaveBeenCalledWith(
      expect.objectContaining({ id: "feihan-sdk" }),
    );
  });

  it("registerFull logs plugin registration", () => {
    const api = createMockApi();
    entry.default.registerFull(api);
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
    entry.default.registerFull(api);
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
    entry.default.registerFull(api);
    await extractStartFn(api)();

    expect(api.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining("must start with http://"),
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("connects valid accounts normally", async () => {
    const api = createMockApi({
      channels: {
        feihan: { accounts: { default: { appId: "a", appSecret: "s", backendUrl: "https://ok.io" } } },
      },
    });
    entry.default.registerFull(api);
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
    entry.default.registerFull(api);
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

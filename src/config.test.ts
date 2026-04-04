// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listAccountIds,
  resolveAccountConfig,
  validateAccountConfig,
  resolveAndValidateAccountConfig,
  listEnabledAccountConfigs,
} from "./config.js";

describe("listAccountIds", () => {
  it("returns empty for missing config", () => {
    expect(listAccountIds({})).toEqual([]);
    expect(listAccountIds(undefined)).toEqual([]);
  });

  it("returns ['default'] for single-account config", () => {
    const cfg = { channels: { feihan: { accounts: { default: { appId: "app_1" } } } } };
    expect(listAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns account keys for multi-account config", () => {
    const cfg = {
      channels: {
        feihan: {
          accounts: {
            bot1: { appId: "a" },
            bot2: { appId: "b" },
          },
        },
      },
    };
    expect(listAccountIds(cfg)).toEqual(["bot1", "bot2"]);
  });

  it("falls back to env var when no config", () => {
    const orig = process.env.FEIHAN_APP_ID;
    process.env.FEIHAN_APP_ID = "env_app";
    try {
      expect(listAccountIds({})).toEqual(["default"]);
    } finally {
      if (orig === undefined) delete process.env.FEIHAN_APP_ID;
      else process.env.FEIHAN_APP_ID = orig;
    }
  });
});

describe("resolveAccountConfig", () => {
  it("resolves default account with defaults applied", () => {
    const cfg = {
      channels: {
        feihan: {
          accounts: {
            default: {
              appId: "app_1",
              appSecret: "secret_1",
              backendUrl: "https://your-backend-url.com",
            },
          },
        },
      },
    };
    const account = resolveAccountConfig(cfg);
    expect(account).toEqual({
      accountId: "default",
      appId: "app_1",
      appSecret: "secret_1",
      backendUrl: "https://your-backend-url.com",
      enabled: true,
      enableEncryption: true,
      requestTimeout: 30_000,
    });
  });

  it("resolves specific account from multi-account config", () => {
    const cfg = {
      channels: {
        feihan: {
          accounts: {
            bot1: {
              appId: "app_bot1",
              appSecret: "secret_bot1",
              backendUrl: "http://localhost:11000",
              enableEncryption: false,
            },
          },
        },
      },
    };
    const account = resolveAccountConfig(cfg, "bot1");
    expect(account.accountId).toBe("bot1");
    expect(account.appId).toBe("app_bot1");
    expect(account.enableEncryption).toBe(false);
  });

  it("falls back to env vars when config values are missing", () => {
    const origId = process.env.FEIHAN_APP_ID;
    const origSecret = process.env.FEIHAN_APP_SECRET;
    const origUrl = process.env.FEIHAN_BACKEND_URL;

    process.env.FEIHAN_APP_ID = "env_app";
    process.env.FEIHAN_APP_SECRET = "env_secret";
    process.env.FEIHAN_BACKEND_URL = "https://your-backend-url.com";

    try {
      const account = resolveAccountConfig({});
      expect(account.appId).toBe("env_app");
      expect(account.appSecret).toBe("env_secret");
      expect(account.backendUrl).toBe("https://your-backend-url.com");
    } finally {
      if (origId === undefined) delete process.env.FEIHAN_APP_ID;
      else process.env.FEIHAN_APP_ID = origId;
      if (origSecret === undefined) delete process.env.FEIHAN_APP_SECRET;
      else process.env.FEIHAN_APP_SECRET = origSecret;
      if (origUrl === undefined) delete process.env.FEIHAN_BACKEND_URL;
      else process.env.FEIHAN_BACKEND_URL = origUrl;
    }
  });

  it("config values take precedence over env vars", () => {
    process.env.FEIHAN_APP_ID = "env_app";
    const cfg = {
      channels: { feihan: { accounts: { default: { appId: "config_app", appSecret: "s", backendUrl: "http://x" } } } },
    };
    try {
      const account = resolveAccountConfig(cfg);
      expect(account.appId).toBe("config_app");
    } finally {
      delete process.env.FEIHAN_APP_ID;
    }
  });
});

describe("validateAccountConfig", () => {
  const validConfig = {
    accountId: "default",
    appId: "app_1",
    appSecret: "secret_1",
    backendUrl: "https://api.feihan.im",
    enabled: true,
    enableEncryption: true,
    requestTimeout: 30_000,
  };

  it("returns no errors for valid config", () => {
    expect(validateAccountConfig(validConfig)).toEqual([]);
  });

  it("returns error for missing appId", () => {
    const errors = validateAccountConfig({ ...validConfig, appId: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("appId");
    expect(errors[0].message).toContain("appId is required");
  });

  it("returns error for missing appSecret", () => {
    const errors = validateAccountConfig({ ...validConfig, appSecret: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("appSecret");
  });

  it("returns error for missing backendUrl", () => {
    const errors = validateAccountConfig({ ...validConfig, backendUrl: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("backendUrl");
    expect(errors[0].message).toContain("backendUrl is required");
  });

  it("returns error for invalid backendUrl scheme", () => {
    const errors = validateAccountConfig({
      ...validConfig,
      backendUrl: "ftp://bad.url",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("backendUrl");
    expect(errors[0].message).toContain("must start with http://");
  });

  it("returns error for invalid requestTimeout", () => {
    const errors = validateAccountConfig({
      ...validConfig,
      requestTimeout: -1,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("requestTimeout");
  });

  it("returns multiple errors at once", () => {
    const errors = validateAccountConfig({
      ...validConfig,
      appId: "",
      appSecret: "",
      backendUrl: "",
    });
    expect(errors).toHaveLength(3);
  });
});

describe("resolveAndValidateAccountConfig", () => {
  it("throws with actionable message on invalid config", () => {
    expect(() => resolveAndValidateAccountConfig({})).toThrow(
      /Invalid config for account "default"/,
    );
  });

  it("returns config when valid", () => {
    const cfg = {
      channels: {
        feihan: {
          accounts: {
            default: {
              appId: "app_1",
              appSecret: "secret_1",
              backendUrl: "https://your-backend-url.com",
            },
          },
        },
      },
    };
    const config = resolveAndValidateAccountConfig(cfg);
    expect(config.appId).toBe("app_1");
  });
});

describe("listEnabledAccountConfigs", () => {
  it("filters out disabled accounts", () => {
    const cfg = {
      channels: {
        feihan: {
          accounts: {
            bot1: {
              appId: "a",
              appSecret: "s",
              backendUrl: "http://x",
              enabled: true,
            },
            bot2: {
              appId: "b",
              appSecret: "s",
              backendUrl: "http://x",
              enabled: false,
            },
          },
        },
      },
    };
    const accounts = listEnabledAccountConfigs(cfg);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].accountId).toBe("bot1");
  });
});

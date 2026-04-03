// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { ApiError } from "@feihan-im/sdk";
import { normalizeSdkEvent, isAuthError, type SdkMessageEvent } from "./feihan-client.js";

describe("isAuthError", () => {
  it("returns true for ApiError with auth failure code 40000006", () => {
    const err = new ApiError(40000006, "鉴权失败", "log123");
    expect(isAuthError(err)).toBe(true);
  });

  it("returns false for ApiError with a different code", () => {
    const err = new ApiError(50000001, "server error", "log456");
    expect(isAuthError(err)).toBe(false);
  });

  it("returns false for a plain Error", () => {
    expect(isAuthError(new Error("auth failed"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
    expect(isAuthError("error string")).toBe(false);
    expect(isAuthError(40000006)).toBe(false);
  });

  it("returns false for an object with matching code but not ApiError instance", () => {
    const fakeErr = { code: 40000006, msg: "鉴权失败", message: "auth" };
    expect(isAuthError(fakeErr)).toBe(false);
  });
});

describe("normalizeSdkEvent", () => {
  it("converts snake_case SDK event to camelCase plugin format", () => {
    const sdkEvent: SdkMessageEvent = {
      header: { event_id: "evt_001", event_type: "im.v1.message.receive" },
      body: {
        message: {
          message_id: "msg_001",
          message_type: "text",
          message_content: { text: { content: "hello" } },
          chat_id: "chat_001",
          chat_type: "direct",
          sender_id: {
            user_id: "user_001",
            union_user_id: "union_001",
            open_user_id: "open_001",
          },
          message_created_at: 1711900000000,
          mention_user_list: [
            { user_id: { user_id: "user_002" } },
            { user_id: { user_id: "user_003" } },
          ],
        },
      },
    };

    const result = normalizeSdkEvent(sdkEvent);
    expect(result).not.toBeNull();
    expect(result!.message.messageId).toBe("msg_001");
    expect(result!.message.messageType).toBe("text");
    expect(result!.message.chatId).toBe("chat_001");
    expect(result!.message.chatType).toBe("direct");
    expect(result!.message.sender.userId).toBe("user_001");
    expect(result!.message.createdAt).toBe(1711900000000);
    expect(result!.message.mentionUserList).toHaveLength(2);
    expect(result!.message.mentionUserList![0].userId).toBe("user_002");
  });

  it("returns null for event without body.message", () => {
    expect(normalizeSdkEvent({ body: {} })).toBeNull();
    expect(normalizeSdkEvent({})).toBeNull();
  });

  it("defaults missing fields", () => {
    const sdkEvent: SdkMessageEvent = {
      body: { message: {} },
    };
    const result = normalizeSdkEvent(sdkEvent);
    expect(result).not.toBeNull();
    expect(result!.message.messageId).toBe("");
    expect(result!.message.chatType).toBe("direct");
    expect(result!.message.sender.userId).toBe("");
    expect(result!.message.mentionUserList).toEqual([]);
  });

  it("preserves messageContent as-is", () => {
    const content = { text: { content: "test" }, extra: true };
    const sdkEvent: SdkMessageEvent = {
      body: { message: { message_content: content } },
    };
    const result = normalizeSdkEvent(sdkEvent);
    expect(result!.message.messageContent).toBe(content);
  });

  it("handles sender_id as legacy flat string", () => {
    const sdkEvent: SdkMessageEvent = {
      body: {
        message: {
          message_id: "msg_002",
          sender_id: "flat_user_id" as unknown as SdkMessageEvent["body"] extends { message?: infer M } ? M extends { sender_id?: infer S } ? S : never : never,
        },
      },
    };
    const result = normalizeSdkEvent(sdkEvent);
    expect(result).not.toBeNull();
    expect(result!.message.sender.userId).toBe("flat_user_id");
  });

  it("handles message_created_at as Int64 string", () => {
    const sdkEvent: SdkMessageEvent = {
      body: {
        message: {
          message_id: "msg_003",
          message_created_at: "1711900000000",
        },
      },
    };
    const result = normalizeSdkEvent(sdkEvent);
    expect(result).not.toBeNull();
    expect(result!.message.createdAt).toBe(1711900000000);
  });

  it("falls back to open_user_id when user_id is missing", () => {
    const sdkEvent: SdkMessageEvent = {
      body: {
        message: {
          sender_id: {
            open_user_id: "open_123",
          },
        },
      },
    };
    const result = normalizeSdkEvent(sdkEvent);
    expect(result!.message.sender.userId).toBe("open_123");
  });
});

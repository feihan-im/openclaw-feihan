# @feihan-im/openclaw-plugin

[![npm version](https://img.shields.io/npm/v/@feihan-im/openclaw-plugin.svg)](https://www.npmjs.com/package/@feihan-im/openclaw-plugin)
[![CI](https://github.com/feihan-im/openclaw-feihan/actions/workflows/ci.yaml/badge.svg)](https://github.com/feihan-im/openclaw-feihan/actions/workflows/ci.yaml)
[![npm downloads](https://img.shields.io/npm/dm/@feihan-im/openclaw-plugin.svg)](https://www.npmjs.com/package/@feihan-im/openclaw-plugin)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/github/license/feihan-im/openclaw-feihan)](LICENSE)

中文 | [English](./README.en.md)

飞函 IM 频道插件，用于 OpenClaw。将飞函机器人接入 OpenClaw 的 AI Agent 管线，通过飞函与 Agent 对话。

## 功能

- 支持私聊和群聊
- 收发文本消息
- 输入状态指示和已读回执
- 多账号配置
- 群聊触发策略，支持仅 @提及 模式
- 入站白名单访问控制
- 消息去重
- 自身消息过滤
- 客户端自动重连与鉴权重试

## 前置条件

- 已安装并运行 **OpenClaw**
- **Node.js** v18 或更高版本
- 已准备好飞函应用的 `appId`、`appSecret` 和 `backendUrl`

## 安装

```bash
openclaw plugins install @feihan-im/openclaw-plugin
```

## 配置

交互式配置（推荐）：

```bash
openclaw channels add --channel feihan
```

或手动编辑 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
    "feihan": {
      "appId": "your_app_id",
      "appSecret": "your_app_secret",
      "backendUrl": "http://your-feihan-backend:21000"
    }
  }
}
```

然后重启网关：

```bash
openclaw gateway restart
```

### 多账号配置

```json
{
  "channels": {
    "feihan": {
      "appId": "111111",
      "appSecret": "secret-1",
      "backendUrl": "http://backend-1:21000",
      "accounts": {
        "bot2": {
          "enabled": true,
          "appId": "222222",
          "appSecret": "secret-2",
          "backendUrl": "http://backend-2:21000"
        }
      }
    }
  }
}
```

### 配置项参考

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `appId` | string | 必填 | 飞函应用 ID |
| `appSecret` | string | 必填 | 飞函应用密钥 |
| `backendUrl` | string | 必填 | 飞函后端地址 |
| `enableEncryption` | boolean | `true` | 是否启用加密传输 |
| `requestTimeout` | number | `30000` | API 请求超时时间（毫秒） |
| `requireMention` | boolean | `true` | 群聊中是否仅在被 @提及 时响应 |
| `botUserId` | string | 可选 | 机器人自身的用户 ID（用于过滤自身消息） |
| `inboundWhitelist` | string[] | `[]` | 非空时，仅接受这些用户 ID 的消息 |
| `enabled` | boolean | `true` | 启用/禁用该账号 |

### 环境变量

`default` 账号支持环境变量回退：

- `FEIHAN_APP_ID`
- `FEIHAN_APP_SECRET`
- `FEIHAN_BACKEND_URL`
- `FEIHAN_REQUIRE_MENTION`

## 许可证

Apache-2.0

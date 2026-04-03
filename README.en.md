# @feihan-im/openclaw-plugin

[![npm version](https://img.shields.io/npm/v/@feihan-im/openclaw-plugin.svg)](https://www.npmjs.com/package/@feihan-im/openclaw-plugin)
[![CI](https://github.com/feihan-im/openclaw-feihan/actions/workflows/ci.yaml/badge.svg)](https://github.com/feihan-im/openclaw-feihan/actions/workflows/ci.yaml)
[![npm downloads](https://img.shields.io/npm/dm/@feihan-im/openclaw-plugin.svg)](https://www.npmjs.com/package/@feihan-im/openclaw-plugin)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/github/license/feihan-im/openclaw-feihan)](LICENSE)

[中文](./README.md) | English

Feihan IM channel plugin for OpenClaw. Connects a Feihan bot to OpenClaw's AI agent pipeline so you can chat with your agent through Feihan.

## Features

- Direct chat and group chat support
- Inbound and outbound text messages
- Typing indicator and read receipt lifecycle
- Multi-account setup
- Group trigger policy with optional mention-only mode
- Inbound whitelist for access control
- Message deduplication
- Self-message filtering
- Automatic client reconnection with auth retry

## Prerequisites

- **OpenClaw** installed and running
- **Node.js** v18 or higher
- A Feihan application with `appId`, `appSecret`, and `backendUrl` ready

## Installation

```bash
openclaw plugins install @feihan-im/openclaw-plugin
```

## Configuration

Interactive setup (recommended):

```bash
openclaw channels add --channel feihan
```

Or manually edit `~/.openclaw/openclaw.json`:

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

Then restart the gateway:

```bash
openclaw gateway restart
```

### Multi-Account Setup

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

### Config Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `appId` | string | required | Feihan application ID |
| `appSecret` | string | required | Feihan application secret |
| `backendUrl` | string | required | Feihan backend URL |
| `enableEncryption` | boolean | `true` | Whether to use encrypted transport |
| `requestTimeout` | number | `30000` | API request timeout in milliseconds |
| `requireMention` | boolean | `true` | In group chats, only respond when @mentioned |
| `botUserId` | string | optional | Bot's own user ID (for self-message filtering) |
| `inboundWhitelist` | string[] | `[]` | If non-empty, only accept messages from these user IDs |
| `enabled` | boolean | `true` | Enable/disable this account |

### Environment Variables

The `default` account supports environment variable fallback:

- `FEIHAN_APP_ID`
- `FEIHAN_APP_SECRET`
- `FEIHAN_BACKEND_URL`
- `FEIHAN_REQUIRE_MENTION`

## License

Apache-2.0

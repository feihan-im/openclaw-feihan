# @feihan-im/openclaw-plugin

[![npm version](https://img.shields.io/npm/v/@feihan-im/openclaw-plugin.svg)](https://www.npmjs.com/package/@feihan-im/openclaw-plugin)
[![CI](https://github.com/feihan-im/openclaw-feihan/actions/workflows/ci.yaml/badge.svg)](https://github.com/feihan-im/openclaw-feihan/actions/workflows/ci.yaml)
[![npm downloads](https://img.shields.io/npm/dm/@feihan-im/openclaw-plugin.svg)](https://www.npmjs.com/package/@feihan-im/openclaw-plugin)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/github/license/feihan-im/openclaw-feihan)](LICENSE)

[中文](./README.md) | English

Feihan is a secure, self-hosted productivity platform for teams, integrating instant messaging, organizational structures, video conferencing, and file storage.

Feihan IM channel plugin for OpenClaw. Connects a Feihan bot to OpenClaw's AI agent pipeline so you can chat with your agent through Feihan. See the [Setup Tutorial](https://feihanim.cn/docs/admin/bots/openclaw) for how to connect Feihan to OpenClaw.

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

Run the following command, replacing the three placeholders with your Feihan app credentials:

```bash
openclaw channels add --channel feihan \
  --app-token <APP_ID> \
  --token <APP_SECRET> \
  --url <BACKEND_URL>
```

| Flag | What to fill in |
|------|-----------------|
| `--app-token` | Feihan App ID |
| `--token` | Feihan App Secret |
| `--url` | Your Feihan server address, e.g. `http://192.168.10.10:21000` |

Then restart the gateway:

```bash
openclaw gateway restart
```

### Managing Accounts

#### Adding an Account

To connect more than one Feihan bot, run the same command with an `--account` flag:

```bash
openclaw channels add --channel feihan \
  --account bot2 \
  --app-token <APP_ID> \
  --token <APP_SECRET> \
  --url <BACKEND_URL>
```

The first account is automatically named `default`.

#### Disabling an Account

Disable an account (keeps config for later re-enable):

```bash
openclaw channels remove --channel feihan --account bot2
```

To re-enable it, edit `~/.openclaw/openclaw.json` and set `"enabled": true` on the account entry (or remove the `"enabled"` field — accounts are enabled by default).

#### Removing an Account

Delete an account and its config entirely:

```bash
openclaw channels remove --channel feihan --account bot2 --delete
```

After any account change, restart the gateway with `openclaw gateway restart` for the changes to take effect.

### Advanced Configuration

To modify other settings (such as encryption or request timeout), edit `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "feihan": {
      "accounts": {
        "default": {
          "appId": "your_app_id",
          "appSecret": "your_app_secret",
          "backendUrl": "http://192.168.10.10:21000",
          "enableEncryption": true,
          "requestTimeout": 30000
        }
      }
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `appId` | string | required | Feihan application ID |
| `appSecret` | string | required | Feihan application secret |
| `backendUrl` | string | required | Feihan backend URL |
| `enabled` | boolean | `true` | Enable/disable this account |
| `enableEncryption` | boolean | `true` | Whether to use encrypted transport |
| `requestTimeout` | number | `30000` | API request timeout in milliseconds |

### Environment Variables

The `default` account supports environment variable fallback:

- `FEIHAN_APP_ID`
- `FEIHAN_APP_SECRET`
- `FEIHAN_BACKEND_URL`

## License

Apache-2.0

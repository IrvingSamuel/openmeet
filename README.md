# OpenMeet

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/IrvingSamuel/openmeet?display_name=tag)](https://github.com/IrvingSamuel/openmeet/releases)
[![Stars](https://img.shields.io/github/stars/IrvingSamuel/openmeet?style=social)](https://github.com/IrvingSamuel/openmeet/stargazers)
[![UI](https://img.shields.io/badge/UI-EN%20%7C%20PT%20%7C%20ES%20%7C%20FR%20%7C%20DE-0B1020)](messages/)

[English](README.md) · [Português](README.pt.md) · [Live demo](https://openmeet.chronos.com.pt) · [Contributing](CONTRIBUTING.md)

**Open-source white-label videoconferencing** — your brand on every room, self-hosted LiveKit SFU, live captions, and an AI copilot that turns meetings into summaries and outbound webhooks.

> **Public branch:** clone and follow **`release`** (default). `main` and `dev` are protected integration branches.

## Why OpenMeet

- **True white-label** — logo, palette, typography, and CSS tokens per room
- **Self-hosted media** — LiveKit SFU on your infrastructure, no seat tax
- **Meeting recording** — browser or LiveKit Egress; local disk or S3-compatible
- **AI that closes the loop** — live STT + post-meeting summary + tasks via webhooks / external tools
- **Auth modes** — local accounts and optional OIDC; `DEPLOYMENT_MODE=server|platform`
- **Multilingual UI** — English, Português, Español, Français, Deutsch (`messages/*.json`)
- **Browser-only** — WebRTC, no plugins

## Stack

- **Next.js 15** (App Router) on port `3332`
- **LiveKit SFU** — signaling, media, TURN
- **Postgres** + Drizzle ORM
- **Python copilot** — LiveKit Agents + Deepgram

## Quick start

```bash
git clone https://github.com/IrvingSamuel/openmeet.git
cd openmeet
cp .env.example .env   # fill in secrets
cd infra && docker compose up -d && cd ..
npm install
npm run db:push
npm run build
# or: npm run dev
```

Optional agent (needs `DEEPGRAM_API_KEY`):

```bash
cd agent
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Auth & deployment modes

| Variable | Purpose |
|----------|---------|
| `DEPLOYMENT_MODE` | `server` (self-host) or `platform` |
| `ALLOW_SIGNUP` | Allow local email/password registration |
| `OIDC_*` | Optional OIDC issuer / client for SSO |

Local auth works out of the box; OIDC is optional for enterprise SSO.

## Meeting recording

Enable in `/admin` → **Recording**:

| Setting | Options |
|---------|---------|
| Engine | `browser` (MediaRecorder) or `egress` (LiveKit Room Composite) |
| Control | `manual` or `auto` |
| Storage | `local` (`RECORDINGS_DIR`) or `s3` |

## Branch model

| Branch | Purpose |
|--------|---------|
| `release` | **Default.** Stable public surface & GitHub Releases |
| `main` | Protected integration trunk (PR only) |
| `dev` | Protected active development (PR only) |

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Internationalization

Locale-prefixed routes (`/en/...`, `/pt/...`, …) via [next-intl](https://next-intl.dev). Edit catalogs under `messages/`.

## Quality

```bash
npm run verify        # typecheck + lint + tests
npm run test:watch
npm run test:coverage
```

## Docs

- [Vision & scope](docs/00-visao-escopo.md) (PT)
- [Requirements](docs/01-requisitos.md) (PT)
- [Architecture](docs/02-arquitetura.md) (PT)
- [Roadmap](docs/03-roadmap.md) (PT)
- ADRs in `docs/adr/`

## Integrations

1. Outbound webhooks in `/admin` (signed with `X-OpenMeet-*` headers)
2. Instant meetings API: `POST /api/v1/instant-meetings` — Redoc at [`/api-docs`](https://openmeet.chronos.com.pt/api-docs)

## License

[MIT](LICENSE) — contributions welcome. If OpenMeet helps you, a ⭐ on GitHub goes a long way.

# Chronos Meet

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/IrvingSamuel/chronos-meet?display_name=tag)](https://github.com/IrvingSamuel/chronos-meet/releases)
[![Stars](https://img.shields.io/github/stars/IrvingSamuel/chronos-meet?style=social)](https://github.com/IrvingSamuel/chronos-meet/stargazers)
[![UI](https://img.shields.io/badge/UI-EN%20%7C%20PT%20%7C%20ES%20%7C%20FR%20%7C%20DE-0B1020)](messages/)

[English](README.md) · [Português](README.pt.md) · [Live demo](https://meet.chronos.com.pt) · [Contributing](CONTRIBUTING.md)

**Open-source white-label videoconferencing** — your brand on every room, self-hosted LiveKit SFU, live captions, and an AI copilot that turns meetings into Chronos tasks.

> **Public branch:** clone and follow **`release`** (default). `main` and `dev` are protected integration branches.

## Why Chronos Meet

- **True white-label** — logo, palette, typography, and CSS tokens per room
- **Self-hosted media** — LiveKit SFU on your infrastructure, no seat tax
- **Meeting recording** — browser or LiveKit Egress; local disk or S3-compatible (MinIO / Hetzner)
- **AI that closes the loop** — live STT + post-meeting summary + MCP tasks on Chronos boards
- **Multilingual UI** — English, Português, Español, Français, Deutsch (`messages/*.json`)
- **Browser-only** — WebRTC, no plugins

## Stack

- **Next.js 15** (App Router)
- **LiveKit SFU** — signaling, media, TURN
- **Postgres** + Drizzle ORM
- **Python copilot** — LiveKit Agents + Deepgram

## Quick start

```bash
git clone https://github.com/IrvingSamuel/chronos-meet.git
cd chronos-meet
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

## Meeting recording

Enable in `/admin` → **Recording**:

| Setting | Options |
|---------|---------|
| Engine | `browser` (MediaRecorder, light — preferred on shared VPS) or `egress` (LiveKit Room Composite) |
| Control | `manual` (host start/stop) or `auto` (starts when host joins; no stop) |
| Storage | `local` (`RECORDINGS_DIR`) or `s3` (MinIO / Hetzner / AWS) — prefer S3 for egress tests |

**Egress on this VPS:** short isolated tests only (then tear down). Needs `SYS_ADMIN` and keys in `infra/egress.yaml` matching LiveKit.

```bash
cd infra
docker compose -f docker-compose.egress.yml up -d   # start worker
# run one short recording…
docker compose -f docker-compose.egress.yml down  # stop when done
```

For frequent/production egress, use a dedicated media node (ADR-002).

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

## Chronos integration

1. OAuth client callback: `/api/auth/callback/chronos`
2. MCP token in the dashboard so the copilot can create tasks
3. Meet MCP tools at `POST /api/mcp`
4. Instant meetings API (Bearer or session): `POST /api/v1/instant-meetings` — Redoc at [`/api-docs`](https://meet.chronos.com.pt/api-docs), OpenAPI at `/api/openapi/instant-meetings`

## License

[MIT](LICENSE) — contributions welcome. If Chronos Meet helps you, a ⭐ on GitHub goes a long way.

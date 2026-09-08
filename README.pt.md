[English](README.md) · [Português](README.pt.md)

# OpenMeet

Videoconferência white-label open-source em `https://openmeet.chronos.com.pt`.

> **Branch pública:** use **`release`** (padrão no GitHub). `main` e `dev` são protegidas.

## Stack

- **Next.js 15** (App Router) na porta `3332`
- **LiveKit SFU** (Docker) — signaling, mídia, TURN
- **Postgres** `openmeet`
- **Copiloto** Python (LiveKit Agents + Deepgram)

## Quick start

```bash
cp .env.example .env   # preencher secrets
cd infra && docker compose up -d
npm install
npm run db:push
npm run build
pm2 start ecosystem.config.cjs
```

Agent (opcional, precisa `DEEPGRAM_API_KEY`):

```bash
cd agent
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
# PM2 sobe openmeet-agent via ecosystem
```

## Auth e modos de deploy

| Variável | Função |
|----------|--------|
| `DEPLOYMENT_MODE` | `server` (self-host) ou `platform` |
| `ALLOW_SIGNUP` | Permite registo local email/password |
| `OIDC_*` | OIDC opcional para SSO |

Auth local funciona de imediato; OIDC é opcional.

## Gravação

Activar em `/admin` → **Gravação**: motor `browser` ou `egress`; controlo manual/automático; storage local ou S3.

## Qualidade

```bash
npm run verify        # typecheck + lint + testes
npm run test:watch
npm run test:coverage
```

## UI

O design system vive em `src/app/globals.css` e `src/components/`. Cores, fontes e fundo derivam de `--brand-*` (white-label por sala).

## Docs

- [Visão e escopo](docs/00-visao-escopo.md)
- [Requisitos](docs/01-requisitos.md)
- [Arquitetura](docs/02-arquitetura.md)
- [Roadmap](docs/03-roadmap.md)
- ADRs em `docs/adr/`

## Integrações

1. Webhooks de saída em `/admin` (assinatura `X-OpenMeet-*`)
2. API de reuniões instantâneas: `POST /api/v1/instant-meetings` — Redoc em `/api-docs`

## Ops

- Capacidade: `scripts/capacity-snapshot.sh`
- Apps PM2: `openmeet` + `openmeet-agent` (porta `3332`)

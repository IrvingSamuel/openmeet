[English](README.md) · [Português](README.pt.md)

# Chronos Meet

Videoconferência white-label open-source da Chronos em `https://meet.chronos.com.pt`.

> **Branch pública:** use **`release`** (padrão no GitHub). `main` e `dev` são protegidas.

## Stack

- **Next.js 15** (App Router) na porta `3331`
- **LiveKit SFU** (Docker, host network) — signaling `:7880`, mídia UDP `50000–50200`, TURN/TLS `:5361`
- **Postgres** `chronos_meet` em `:5433`
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
# PM2 sobe chronos-meet-agent via ecosystem
```

## Qualidade

```bash
npm run verify        # typecheck + lint + testes
npm run test:watch    # vitest em watch
npm run test:coverage # cobertura v8
```

A suíte cobre os helpers de marca/layout/legendas, as primitivas de UI, o
lobby, o dashboard, o painel de marca e as rotas de sala (guards de sessão e
grants do token LiveKit). Testes de rota rodam em ambiente Node via
`// @vitest-environment node`.

## UI

O design system vive em `src/app/globals.css` (tokens, glass, aurora, grain) e
`src/components/`:

- `motion/primitives.tsx` — `Reveal`, `Magnetic`, `Spotlight`, `Tilt`,
  `Aurora`, `AnimatedNumber`, `TextScramble` e as transições de morph
  compartilhadas (`morphTransition`)
- `ui/` — `Button`, `Field`, `Modal`, `Toast`, `Surface`, ícones
- `room/` — grade que morfa entre grid e destaque (`Stage`), `ControlBar`,
  `SidePanel` (chat, participantes, transcrição) e legendas

Toda cor, fonte e fundo derivam das variáveis `--brand-*`, então o
white-label por sala repinta inclusive os componentes do LiveKit.

## Docs

- [Visão e escopo](docs/00-visao-escopo.md)
- [Requisitos](docs/01-requisitos.md)
- [Arquitetura](docs/02-arquitetura.md)
- [Roadmap](docs/03-roadmap.md)
- ADRs em `docs/adr/`

## Integração Chronos

1. Cliente OAuth já criado: `meet.chronos.com.pt` → callback `/api/auth/callback/chronos`
2. Login OAuth com scope `chronos:mcp` — o Meet usa o access token da conta para criar tarefas (sem token MCP manual)
3. Ferramentas Meet MCP em `POST /api/mcp` (`meet_create_room`, `meet_get_transcript`)

## Ops

- Cert reload: `scripts/reload-livekit-certs.sh` (hook pós-renovação CloudPanel)
- Capacidade: `scripts/capacity-snapshot.sh`
- Métricas: `http://127.0.0.1:6789/metrics`

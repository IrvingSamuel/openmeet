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

## Transmissão ao vivo (addon YouTube / RTMP)

Anfitriões e moderadores podem transmitir a reunião para o YouTube, ou para qualquer destino RTMP, com a **visão de um espectador**. O vídeo mostra apenas a grade de câmeras, o áudio da sala e uma faixa fixa de legendas no rodapé: sem barras laterais, barra inferior nem botões. A chave do YouTube é colada em cada reunião e nunca fica guardada.

O addon usa o [LiveKit Egress](https://docs.livekit.io/transport/self-hosting/egress/), que roda um Chrome headless e consome **cerca de 4 vCPU por transmissão**. Vem **desativado por padrão**. Quando o Egress está offline, `/admin` → **Transmissão** mostra estes mesmos passos e os anfitriões não conseguem iniciar uma transmissão.

**Instalação**

1. Crie a configuração do Egress. Preencha `api_key` / `api_secret` com os mesmos valores do `livekit.yaml` (`LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` do `.env`) e mantenha `health_port: 9187`. Se trocar a porta, ela não pode estar em uso por outro serviço e o `EGRESS_HEALTH_URL` deve acompanhar:

   ```bash
   cp infra/egress.yaml.example infra/egress.yaml
   ```

2. Suba o container. Precisa de Docker e usa `network_mode: host`:

   ```bash
   docker compose -f infra/docker-compose.egress.yml up -d
   ```

3. Libere a saída TCP **1935** (`rtmp://`), ou 443 para `rtmps://`.
4. Opcional, para estado em tempo real: adicione o webhook desta app ao `livekit.yaml` e reinicie o LiveKit. Sem ele, a app consulta o Egress por polling.

   ```yaml
   webhook:
     api_key: <LIVEKIT_API_KEY>
     urls:
       - http://127.0.0.1:3332/api/livekit/webhook
   ```

5. Opcional, no `.env` (reinicie a app depois):

   | Variável | Padrão | Função |
   |----------|--------|--------|
   | `LIVE_VIEW_BASE_URL` | `NEXT_PUBLIC_APP_URL` | URL que o Chrome do Egress usa para abrir `/<locale>/live-view/<meetingId>` |
   | `EGRESS_HEALTH_URL` | `http://127.0.0.1:9187/` | Health check do Egress (`none` desativa a verificação) |

6. Em `/admin` → **Transmissão**, confirme que o serviço aparece **online**, marque *Transmissão ao vivo ativa* e escolha 720p ou 1080p.

Na reunião, o anfitrião abre **Mais → Transmitir ao vivo** e cola a chave do YouTube Studio. Todos passam a ver o selo **AO VIVO**. Detalhes em [docs/05-live-stream.md](docs/05-live-stream.md).

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
- [Transmissão ao vivo](docs/05-live-stream.md)
- ADRs em `docs/adr/`

## Integrações

1. Webhooks de saída em `/admin` (assinatura `X-OpenMeet-*`)
2. API de reuniões instantâneas: `POST /api/v1/instant-meetings` — Redoc em `/api-docs`

## Ops

- Capacidade: `scripts/capacity-snapshot.sh`
- Apps PM2: `openmeet` + `openmeet-agent` (porta `3332`)

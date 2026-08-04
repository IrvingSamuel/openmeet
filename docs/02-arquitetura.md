# Chronos Meet — Arquitetura

## Visão geral

```
Browser (React + LiveKit SDK)
    │ HTTPS
nginx :443  meet.chronos.com.pt
    ├─ /           → Next.js :3331
    └─ /rtc,/twirp → livekit-server :7880
Browser ─UDP/SRTP─→ LiveKit UDP 50000-50200 (+ TURN/TLS :5361)

Next.js ──► Postgres :5433 (db chronos_meet)
Next.js ──► LiveKit (mint tokens, webhooks)
Next.js ──► chronos.com.pt (OAuth)

Agent (Python) ──► LiveKit (participante)
Agent ──► Deepgram / Gemini
Agent ──► chronos.com.pt MCP
Agent ──► Postgres
```

## Componentes

### Next.js (`/` na porta 3331)
- UI (lobby, sala, branding, dashboard).
- API routes: auth, rooms, tokens, webhooks, brand, health.
- Sessão cookie (iron-session ou similar).
- Drizzle ORM → Postgres.

### LiveKit Server (Docker, host network)
- Signaling WebSocket `:7880`.
- RTC TCP `:7881`.
- Mídia UDP `50000–50200`.
- TURN embutido TLS `:5361` (cert CloudPanel).
- Redis local para estado (pronto para multi-instância).
- Prometheus `:6789`.

### Copiloto (`agent/`)
- LiveKit Agents (Python).
- Entra na sala como participante oculto/assistente.
- STT → legendas (data channel) + DB.
- Pós-reunião: resumo + action items → MCP.

### Chronos (plataforma-mãe)
- OAuth IdP (cliente `meet.chronos.com.pt`).
- MCP tools existentes (`board_tasks_create`, `boards_get`, …).
- Nenhuma tabela Chronos é alterada pelo Meet.

## Modelo de dados (`chronos_meet`)

| Tabela | Papel |
|--------|-------|
| `chronos_identities` | User Chronos ↔ Meet + tokens |
| `rooms` | Sala lógica (slug, board_id, owner) |
| `room_brands` | Tokens de marca |
| `meetings` | Sessão (início/fim) |
| `participants` | Quem entrou/saiu |
| `transcript_segments` | Legendas |
| `meeting_summaries` | Resumo pós |
| `action_items` | Itens + `chronos_task_id` |
| `llm_usage` | Metering Gemini (feature, tokens estimados) |
| `app_settings` | Config system-wide (locale, chaves IA, webhooks outbound) |
| `recordings` | Schema antecipado (Fase 5) |

`meetings` também guarda cache de insights (`insights_cache`, `insights_cache_segment_count`, `insights_regen_count`) para evitar Gemini em cada abertura do painel.

### Administração e webhooks de saída

- UI em `/admin` (acesso via `ADMIN_EMAILS` no `.env`).
- Overrides de locale / Gemini / Deepgram em `app_settings` (fallback para env se vazio).
- Webhooks outbound JSON (`transcript.ready`, `chat.ready`, `summary.ready`, `tasks.generated`) com HMAC `X-Chronos-Meet-Signature`.
- Disparo: fim de reunião (transcript + chat) e após resumo (summary + tasks).

## Custos LLM (Gemini)

| Chamada | Modelo (env) | Cap output | Notas |
|---------|--------------|------------|-------|
| Insights + chat | `GEMINI_MODEL` → `gemini-2.5-flash-lite` | 512 / 1024 | Cache insights; chat com 20 segs / 6 msgs (40/10 se expandir) |
| Resumo pós | `GEMINI_SUMMARY_MODEL` → `gemini-2.5-flash` | 4096 | Transcript capped a 12k chars (amostra início/meio/fim) |

Quotas: máx. 20 chats Gemini / participante / reunião; máx. 3 regenerações de insights / reunião. Deepgram STT continua a ser o maior custo em escala (VAD Silero = backlog).

## Branding

`room_brands` → CSS variables no `<html>`:

```css
--brand-primary, --brand-secondary, --brand-tertiary,
--brand-font, --brand-bg, --brand-logo-url, ...
```

Preset Chronos (indigo/emerald/…) como default; override livre no painel.

## Deploy nesta VPS

| Processo | Como |
|----------|------|
| Next.js | PM2 `chronos-meet` → `:3331` |
| LiveKit + Redis | Docker Compose em `infra/` |
| Agent | PM2 `chronos-meet-agent` (ou docker) |
| nginx | vhost CloudPanel + locations `/rtc` `/twirp` |
| ufw | UDP 50000:50200, TCP 7881, TCP+UDP 5361, UDP 30000:40000 (TURN relay) |

## Portabilidade

Toda conexão ao SFU passa por env:

```
LIVEKIT_URL=wss://meet.chronos.com.pt
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Mover mídia = apontar env + DNS/nginx no novo nó.

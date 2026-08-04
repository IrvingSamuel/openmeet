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
| `app_settings` | Config system-wide (locale, chaves IA, webhooks outbound, gravação) |
| `recordings` | Gravações AV (browser/egress → local ou S3) |

`meetings` também guarda cache de insights (`insights_cache`, `insights_cache_segment_count`, `insights_regen_count`) para evitar Gemini em cada abertura do painel.

### Administração e webhooks de saída

- UI em `/admin` (acesso via `ADMIN_EMAILS` no `.env`).
- Overrides de locale / Gemini / Deepgram em `app_settings` (fallback para env se vazio).
- **Gravação** em `/admin` → tab Gravação: motor (`browser` | `egress`), controlo (`manual` | `auto`), storage (`local` | `s3`).
- Webhooks outbound JSON (`transcript.ready`, `chat.ready`, `summary.ready`, `tasks.generated`, `recording.ready`) com HMAC `X-Chronos-Meet-Signature`.
- Disparo: fim de reunião (transcript + chat), após resumo (summary + tasks), e quando a gravação fica `ready`.

### Gravação de reuniões

- Motor **browser**: MediaRecorder no cliente do moderador + upload de chunks para a API; **recomendado** na VPS actual (default).
- Motor **egress**: LiveKit Room Composite (`infra/docker-compose.egress.yml` + `infra/egress.yaml`).
  - Em produção / uso frequente: nó de mídia dedicado (ADR-002).
  - Nesta VPS (4 vCPU, swap pressionada): **só testes curtos** (1–3 min, 1 sala). Subir o worker, gravar, `down` a seguir.
  - Preferir storage **S3/MinIO** no `/admin` (há MinIO no host) em vez de disco local para saída do Egress.
  - Erros da API incluem `detail` (ex. timeout = worker Egress em baixo).
- Storage **local**: `RECORDINGS_DIR` (default `/var/chronos-meet/recordings`), download autenticado.
- Storage **s3**: endpoint compatível (MinIO, Hetzner Object Storage, AWS) via admin ou `RECORDING_S3_*`.
- Controlo **manual**: botão REC na ControlBar (host). Controlo **auto**: inicia ao entrar o moderador; sem stop até ao fim da reunião.

```bash
# Teste pontual de Egress nesta VPS (depois desligar)
cd infra
docker compose -f docker-compose.egress.yml up -d
# … 1 gravação curta …
docker compose -f docker-compose.egress.yml down
```

## Custos LLM (Gemini)

| Chamada | Modelo (env) | Cap output | Notas |
|---------|--------------|------------|-------|
| Insights + chat | `GEMINI_MODEL` → `gemini-3.5-flash-lite` | 512 / 1024 | Cache insights; chat com 20 segs / 6 msgs (40/10 se expandir) |
| Resumo pós | `GEMINI_SUMMARY_MODEL` → `gemini-3.5-flash-lite` | 4096 | Transcript capped a 12k chars (amostra início/meio/fim) |

Quotas: máx. 20 chats Gemini / participante / reunião; máx. 3 regenerações de insights / reunião. Deepgram STT continua a ser o maior custo em escala (VAD Silero = backlog).

## Branding

`room_brands` → CSS variables no `<html>`:

```css
--brand-primary, --brand-secondary, --brand-tertiary,        /* sólidos (borda/texto) */
--brand-primary-paint, --brand-secondary-paint, …,         /* sólido ou gradiente */
--brand-bg, --brand-bg-solid, --brand-font, --brand-logo-url,
--brand-pattern-url, --brand-pattern-size, --brand-pattern-tint,
--brand-bg-animation, --brand-bg-animation-speed, ...
```

Cada accent e o fundo podem ser sólido ou gradiente. Pattern de fundo (URL/upload) com tamanho %, px e tint. Animações lentas (`wave` / `beam` / `aurora` / `pulse`) via `BrandBackdrop` no lobby, reunião e preview.

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

# Chronos Meet — Requisitos

## Requisitos funcionais

### RF-01 Autenticação
- Login via OAuth2/OIDC do Chronos (`openid profile email chronos:mcp`).
- Sessão local no Meet após callback.
- Persistência de `chronos_identities` (mapa user Chronos ↔ Meet).

### RF-02 Salas
- Criar sala (slug único, título, política de acesso).
- Entrar em sala existente (host ou participante).
- Lobby com pré-flight de câmera/microfone.
- Emitir access token LiveKit com grants por papel.

### RF-03 Mídia
- Áudio e vídeo bidirecional via LiveKit SFU.
- Compartilhamento de tela.
- Mute/unmute, câmera on/off, leave.
- Seletor de dispositivos.
- Indicador de qualidade de conexão.
- Chat na sala (data channel ou API).

### RF-04 Branding
- Importar `logo_url` + `theme` do quadro Chronos como default.
- Override: paleta livre, fonte, background, wordmark, textos do lobby, favicon.
- Tokens injetados como variáveis CSS no `<html>`.

### RF-05 Copiloto de IA
- Legendas ao vivo em PT-BR (Deepgram Nova-3 multilingual).
- Persistência de `transcript_segments`.
- Resumo pós-reunião (Gemini 2.5 Flash).
- Extração de itens de ação e criação de tarefas no quadro via MCP (`board_tasks_create`).
- Gravar `chronos_task_id` em `action_items`.

### RF-06 Integração com quadro (Fase 4)
- Criar reunião a partir de um card.
- Convidar membros do quadro.
- Export ICS.
- Ferramentas MCP: `meet_create_room`, `meet_get_transcript`.

## Requisitos não-funcionais

### RNF-01 Capacidade (VPS atual: 4 vCPU / 15 GB)

| Métrica | Meta MVP | Notas |
|---------|----------|-------|
| Participantes por sala | ≤ 8 | Mesh de assinaturas SFU |
| Salas simultâneas | ≤ 3 | ~24 streams totais |
| Participantes totais simultâneos | ≤ 20–24 | Teto soft; instrumentar e revisar |
| Latência áudio (RTT LAN) | < 150 ms | Medir via LiveKit stats |
| Tempo até primeira frame | < 3 s | Após grant de mídia |

> Teto validado empiricamente na Fase 0/capacity-guard. Atualizar esta tabela após teste de carga.

### RNF-02 Disponibilidade
- App e SFU reiniciáveis via PM2 / Docker Compose.
- Health: Next `/api/health`, LiveKit `/`.

### RNF-03 Segurança
- TLS terminado no nginx (CloudPanel).
- Tokens LiveKit de curta duração, room-scoped.
- Webhooks LiveKit autenticados por API secret.
- Segredos apenas em `.env` (não commitados).

### RNF-04 Observabilidade
- Prometheus LiveKit em `:6789/metrics`.
- Logs estruturados do agent e da app.

### RNF-05 Portabilidade de mídia
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` via env desde o dia 1 — mover SFU sem refatorar a app.

## Dependências externas

| Serviço | Uso |
|---------|-----|
| chronos.com.pt OAuth | Login |
| chronos.com.pt MCP | Criar tarefas |
| Deepgram | STT streaming |
| Gemini | Resumo / extração |
| Groq (opcional) | Whisper batch pós-reunião |

## Capacidade medida (2026-07-28)

Snapshot via `scripts/capacity-snapshot.sh`:

- Load ~1.8 com LiveKit idle (~29 MB RSS) + Next + agent
- Memória: 15 GB total, ~5.8 GB available (cache inclusivo); swap quase cheia — **não subir Egress nesta VPS**
- Teto soft mantido: **≤ 20–24 participantes totais / ≤ 3 salas / ≤ 8 por sala**
- Revalidar após primeira reunião real com 4+ participantes

Prometheus: `http://127.0.0.1:6789/metrics`

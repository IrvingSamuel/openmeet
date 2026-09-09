# Legendas ao vivo — triagem, deploy e sintomas

Guia para diagnosticar atrasos ou ausência de legendas em **qualquer instância** OpenMeet (self-host ou cliente). O código do agent é o mesmo; a infraestrutura varia por deploy.

## Sintomas — o que perguntar ao usuário

Use estas perguntas para classificar o incidente:

| Pergunta | Se sim, indica… |
|----------|-----------------|
| A legenda **aparece minutos depois** com o texto certo da fala antiga? | Agent/STT tardio ou sala sem agent no início |
| Fica **sem legenda** e depois chega um bloco/rajada? | Backlog no loop STT ou agent entrou tarde |
| Só **falantes mais baixos** / quem interrompe perde legenda? | Filtro active speaker (legado) ou bleed dedupe |
| Problema no **overlay** (1 linha) mas o **painel Transcrição** está ok? | Filtro de UI (similaridade entre falantes) |
| Começou após **desmutar** o microfone? | Restart de STT / track ainda não publicado |
| Afeta **toda a sala** ou **uma pessoa**? | Sala = agent/capacidade; uma pessoa = identity/STT/filtro |

Peça: **slug da sala ou meetingId**, **horário UTC/local**, **navegador/dispositivo**, **número de participantes**.

---

## Coleta no ambiente (checklist remoto)

Execute no host onde roda o agent (PM2, systemd ou Docker):

### 1. Processo e versão

```bash
pm2 list | grep -i agent
pm2 logs openmeet-agent --lines 200
# ou: journalctl -u openmeet-agent -n 200
```

Confirme que o processo está `online` e que o código inclui logs `caption_published` / `caption_skip`.

### 2. Agent entrou na sala?

Durante ou após a reunião, nos logs:

```bash
grep -E 'joined room|stt start|caption_published|caption_skip|full capacity|deepgram' \
  /path/to/openmeet-agent-out.log | tail -80
```

| Log | Significado |
|-----|-------------|
| `joined room=meet_...` | Agent anexou STT à sala |
| `stt start identity=...` | Stream Deepgram aberto para aquele mic |
| `caption_published ...` | Legenda enviada ao data channel |
| `caption_skip reason=...` | Legenda descartada (motivo no log) |
| `worker is at full capacity` | Worker recusando novas salas por load |
| `DEEPGRAM_API_KEY missing` | Sem STT — agent encerra |

Na UI da reunião deve aparecer o participante **OpenMeet Agent**.

### 3. Variáveis de ambiente críticas

| Variável | Deve apontar para |
|----------|-------------------|
| `MEET_API_URL` | Next.js **loopback** da mesma instância (`http://127.0.0.1:PORT`) |
| `AGENT_SHARED_SECRET` | Mesmo valor do `.env` do Next |
| `LIVEKIT_URL` / `LIVEKIT_AGENT_URL` | LiveKit **desta** instância (loopback no server) |
| `LIVEKIT_API_KEY` / `SECRET` | Par usado pelo Next para emitir tokens |
| `DEEPGRAM_API_KEY` | Chave válida (ou Admin → Deepgram no painel) |
| `NEXT_PUBLIC_LIVEKIT_URL` | WSS público que o browser usa |

Misconfig de `MEET_API_URL` gera `persist_segment failed` — **não** bloqueia overlay ao vivo, mas indica deploy inconsistente.

### 4. CPU / RAM / capacidade

```bash
top -bn1 | head -20
free -h
grep 'full capacity\|below capacity' /path/to/openmeet-agent-out.log | tail -20
```

Host compartilhado com CPU alta → worker marca `unavailable`. Ajuste (ver secção Deploy):

- `AGENT_LOAD_MODE=hybrid` ou `jobs`
- `AGENT_LOAD_THRESHOLD=0.85` (ou maior se host dedicado)
- `AGENT_NUM_IDLE_PROCESSES=2` se RAM/CPU permitir

### 5. Banco — gap de timestamps

Se tiver acesso ao Postgres:

```sql
SELECT speaker_label, left(text, 60), created_at
FROM transcript_segments
WHERE meeting_id = '<uuid>'
ORDER BY created_at DESC
LIMIT 30;
```

Compare `created_at` com o horário real da fala:

- **Gap grande** → agent/STT/publicação tardia
- **Registos ok, overlay vazio** → problema de UI ou data channel no cliente

---

## Deploy checklist (nova instância / cliente)

### LiveKit + Next + Agent alinhados

1. LiveKit ≥ 1.13, `enable_data_tracks: true` (ver `infra/livekit.yaml`).
2. Next.js e agent na **mesma** máquina ou rede confiável; agent usa loopback para LiveKit e `MEET_API_URL`.
3. Nginx: `/rtc`, `/twirp`, `/agent` → `127.0.0.1:7880` (ver `docs/self-host-livekit.md`).
4. PM2: `ecosystem.config.cjs` — processos `openmeet` + `openmeet-agent`.

### Agent — variáveis recomendadas

```env
MEET_API_URL=http://127.0.0.1:3332
AGENT_SHARED_SECRET=<mesmo do Next>
LIVEKIT_AGENT_URL=ws://127.0.0.1:7880
DEEPGRAM_API_KEY=<sua chave>

# Capacidade (opcional)
AGENT_LOAD_MODE=hybrid
AGENT_LOAD_THRESHOLD=0.85
AGENT_MAX_CONCURRENT_JOBS=4
AGENT_NUM_IDLE_PROCESSES=1
AGENT_HTTP_PORT=8095

# Multi-produto no mesmo LiveKit: nome explícito + dispatch no token
# LIVEKIT_AGENT_NAME=openmeet
```

### Evitar misconfig comum

| Problema | Solução |
|----------|---------|
| Dois produtos no **mesmo** LiveKit com `agent_name=""` | Definir `LIVEKIT_AGENT_NAME` por produto e dispatch explícito |
| Porta 8095 em uso | `AGENT_HTTP_PORT=8096` (ou outra livre) |
| Agent fala com API pública via HTTPS | Usar `MEET_API_URL` loopback |
| Deepgram só no Admin, env vazio | OK se `/api/agent/config` responder 200 com secret |
| CPU de outros serviços derruba agent | `AGENT_LOAD_MODE=jobs` ou threshold mais alto |

### Pós-deploy — smoke test

1. Sala com 2 participantes, legendas ligadas.
2. Logs: `joined room`, `stt start`, `caption_published`.
3. Overlay e painel **Transcrição** mostram falas de ambos.
4. Desmutar após join muted → legenda em &lt;5s.

---

## Comportamento do agent (referência)

Pipeline: mic → Deepgram Nova-3 → data channel `captions` → UI.

Correções recentes no código:

- Publicação em **`FINAL_TRANSCRIPT`** (não só fim de silêncio).
- Persistência em DB **assíncrona** (não bloqueia o próximo segmento).
- Filtro **active speaker desligado** por default (`CAPTION_ACTIVE_SPEAKER_FILTER=false`).
- Logs estruturados: `caption_published`, `caption_skip reason=...`.

Dedupe de bleed (mic capturando outro falante) permanece ativo — segundo falante com texto quase igual em 3s pode ser suprimido.

---

## Quando escalar

Envie ao suporte Chronos / equipe de produto:

- Trecho de log (±5 min do incidente) com `joined room`, `caption_*`, `full capacity`
- meetingId ou slug + timezone
- Respostas ao questionário de sintomas acima
- Versão/deploy date da instância

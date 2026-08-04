# Chronos Meet — Roadmap

## Fase 0 — Infra
- [x] Docs + ADRs + git
- [x] LiveKit Docker (host network, UDP, TURN/TLS, Redis, Prometheus)
- [x] nginx `/rtc` `/twirp` + ufw
- [x] Validar `wss://meet.chronos.com.pt/rtc` (proxy OK)

## Fase 1 — Reunião funcionando
- [x] Next.js :3331 + PM2 `chronos-meet`
- [x] Postgres `chronos_meet` + Drizzle
- [x] OAuth Chronos (cliente `meet.chronos.com.pt`)
- [x] Rooms + tokens + webhooks
- [x] UI sala (grid, screen share, lobby, chat via LiveKit components)
- **Marco:** entrar em https://meet.chronos.com.pt → login → criar sala → `/r/{slug}`

## Fase 2 — Motor de marca
- [x] CSS variables + painel `/r/{slug}/brand` + import quadro

## Fase 3 — Copiloto
- [x] Agent worker (PM2 `chronos-meet-agent` :8095)
- [x] Persistência de transcript + API summary → Gemini + MCP tasks
- [x] Metadata LiveKit com `meetingId` + speaker por track
- [x] Insights ao vivo (data channel `insights` + painel Copiloto)
- [x] Ecrã pós-reunião `/r/{slug}/summary` com escolha de quadro/prazo/responsável/checklist
- [ ] Legendas ao vivo exigem `DEEPGRAM_API_KEY` no `.env`

## Fase 4 — Integração quadro
- [x] ICS, MCP Meet (`/api/mcp`), `boardId` na sala

## Fase 5 — Escala
- [ ] Nó de mídia dedicado, Egress, carga (backlog no quadro Chronos)

# ADR-002: Mídia na mesma VPS (MVP)

## Status

Aceito (2026-07-28)

## Contexto

VPS atual: 4 vCPU, 15 GB RAM (~8 GB em uso), sem GPU, load ~2, 23 apps PM2, Jitsi + MySQL ativos.

Opções:
1. Nó de mídia dedicado desde o dia 1
2. Tudo nesta VPS no MVP
3. Híbrido (mesmo host, config-driven para separar depois)

Usuário escolheu **tudo nesta VPS por enquanto**.

## Decisão

Rodar LiveKit + Redis + Next + Agent nesta VPS no MVP.

Garantir portabilidade desde o dia 1 via `LIVEKIT_URL` / `LIVEKIT_API_*` em env (padrão híbrido operacional sem refatoração).

## Consequências

### Positivas
- Time-to-first-meeting menor (sem provisionar outra máquina).
- Arquitetura já preparada para split.

### Negativas / mitigações
- Capacidade limitada (~20–24 participantes simultâneos) — documentada em `docs/01-requisitos.md` e revisada após teste de carga.
- Sem Egress/gravação no MVP.
- Instrumentar Prometheus `:6789` desde a Fase 0.
- Agent é processo separado (desligável sob pressão sem derrubar salas).

## Revisar quando

- Load médio > 3.5 por 1h sob carga de reuniões, ou
- Uso do motor **Egress** (recomendado em nó dedicado — ver `infra/docker-compose.egress.yml`), ou
- > 3 salas simultâneas frequentes.

## Gravação (actualização)

A gravação está disponível via `/admin`:
- **browser** (default) — leve o suficiente para a VPS actual; usar no dia-a-dia.
- **egress** — Room Composite; nesta VPS de 4 vCPU **apenas testes curtos** (subir worker → gravar 1–3 min → `docker compose … down`). Uso frequente exige nó dedicado.
- Falhas de start devolvem `error` + `detail` (ex. timeout = nenhum worker no Redis).

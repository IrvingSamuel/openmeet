# Chronos Meet — Visão e Escopo

## Visão

O **Chronos Meet** é a plataforma de videoconferência open-source da Chronos: white-label, autopersonalizável pela identidade visual do quadro do cliente, e integrada ao assistente pessoal Chronos.

Diferente de wrappers sobre Jitsi/Zoom/Meet, o produto é próprio — UI 100% nossa, SFU LiveKit self-hosted, e um copiloto de IA que transcreve a reunião em PT-BR, resume e transforma o que foi falado em tarefas no quadro Chronos.

## Problema

- Jitsi é poderoso, mas difícil de desenvolver por cima (XMPP, Prosody, UI acoplada).
- Zoom/Google Meet são black-boxes sem white-label real.
- Clientes Chronos querem reuniões que **parecem da empresa deles** (logo, cores, domínio) e que **fecham o ciclo** com o quadro (tarefas, membros, lousa).

## Objetivos do MVP

1. Duas ou mais pessoas se veem e se ouvem em `https://meet.chronos.com.pt`.
2. Login via OAuth Chronos (mesma identidade da plataforma).
3. Sala com branding importável do quadro (`logo_url` + `theme`) e override total.
4. Copiloto: legendas ao vivo em PT-BR, resumo pós-reunião, criação de tarefas via MCP.
5. Rodar nesta VPS (porta 3331 atrás do nginx CloudPanel) com capacidade documentada.

## Fora de escopo (MVP original)

- Domínio customizado por cliente (Fase 5+).
- Breakout rooms avançados, webinars, streaming RTMP.
- App mobile nativo (PWA/browser first).
- Migrar o Jitsi do Rezumme.

> **Actualização:** gravação (browser + Egress, local/S3) está disponível na Fase 5 via `/admin`. Egress continua recomendado em nó dedicado.

## Personas

| Persona | Necessidade |
|---------|-------------|
| Dono do quadro Chronos | Criar salas branded, ver resumos e tarefas geradas |
| Membro do quadro | Entrar com 1 clique, participar, ver legendas |
| Convidado externo | Entrar por link (lobby), sem conta Chronos (Fase 4+) |
| Agente/IDE (MCP) | Criar sala e ler transcript via ferramentas |

## Domínio e porta

- Público: `https://meet.chronos.com.pt`
- App Next.js: `127.0.0.1:3331`
- LiveKit signaling: `127.0.0.1:7880` (exposto via `/rtc`, `/twirp` no nginx)
- Mídia UDP: `50000–50200`
- TURN/TLS: `5361`

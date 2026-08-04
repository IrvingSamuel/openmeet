# ADR-003: Escolha de STT (legendas PT-BR)

## Status

Aceito (2026-07-28)

## Contexto

Sem GPU nesta VPS. Legendas ao vivo em português exigem STT streaming externo (ou serviço já residente).

Opções:
- Deepgram Nova-3 multilingual (~US$ 0,0092/min)
- Groq whisper-large-v3-turbo (batch barato, latência maior)
- OpenAI gpt-realtime-whisper
- rezummeai-high (:8090, Whisper CPU, 1.2 GB residente) — batch pós-reunião

## Decisão

| Fase | Provider | Motivo |
|------|----------|--------|
| Legendas ao vivo | **Deepgram Nova-3 multilingual** | Streaming, PT-BR, plugin LiveKit Agents |
| Batch pós-reunião (opcional) | **Groq whisper-large-v3-turbo** | Custo baixo quando latência não importa |
| Resumo / action items | **Gemini 2.5 Flash** | Já usado no Chronos; chave e medição existentes |

Avaliar na Fase 3 se `rezummeai-high` absorve o batch a custo marginal zero.

## Consequências

- Dependência de API key Deepgram no `.env`.
- Custo variável por minuto de áudio transcrito.
- Fallback: desligar agent sob pressão de CPU sem afetar mídia.

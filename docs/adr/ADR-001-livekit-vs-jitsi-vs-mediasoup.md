# ADR-001: Escolha do SFU — LiveKit

## Status

Aceito (2026-07-28)

## Contexto

Precisamos de um SFU open-source para Chronos Meet. Alternativas avaliadas:

1. **Jitsi** (já rodando em `meet.rezumme.com` nesta VPS)
2. **mediasoup** (biblioteca Node)
3. **LiveKit** (servidor Go + SDKs)

Critérios: white-label real, velocidade de desenvolvimento, Agents/IA, portabilidade, colisão com stack existente (UDP 10000 / coturn Rezumme).

## Decisão

**LiveKit** self-hosted.

## Consequências

### Positivas
- UI 100% nossa (`@livekit/components-react`); não lutamos contra a UI do Jitsi.
- LiveKit Agents prontos para STT/LLM/TTS no meio da chamada (diferencial do copiloto).
- Apache 2.0, SDKs maduros (TS/React/Python).
- Faixa UDP própria (50000–50200) — não colide com JVB do Rezumme.

### Negativas
- Novo serviço Docker + Redis + TURN a operar.
- Competição de CPU com MySQL/Jitsi nesta VPS (mitigado por teto de participantes).
- Egress/gravação fora do MVP (Chrome headless pesado demais).

### Alternativas rejeitadas
- **Jitsi wrap**: exatamente a dor (“difícil desenvolver por cima”) que o produto evita.
- **mediasoup**: máximo controle, mas signaling/reconexão/gravação do zero = meses a mais.
- **P2P mesh**: quebra acima de ~4 participantes.

## Referências

- Plano Chronos Meet (decisão do usuário: LiveKit)
- https://docs.livekit.io/

# Transmissão ao vivo (YouTube / RTMP)

Anfitriões e moderadores podem transmitir a reunião para o YouTube, ou para qualquer destino RTMP, com a **visão de um espectador**. O vídeo transmitido não tem barra lateral, barra inferior nem botões. Ele mostra apenas:

- a grade de câmeras (com destaque para o ecrã partilhado, quando houver);
- o áudio da sala;
- uma faixa fixa de legendas no rodapé, que nunca cobre as câmeras.

O recurso vem **desativado por padrão**. Cada transmissão consome cerca de 4 vCPU no servidor.

## Como funciona

1. O anfitrião abre **Mais → Transmitir ao vivo** e cola a chave de transmissão do YouTube Studio. A chave **não é guardada** no banco nem nos logs.
2. O OpenMeet chama `EgressClient.startRoomCompositeEgress` com uma saída RTMP e `customBaseUrl` apontando para `/<locale>/live-view/<meetingId>`.
3. O LiveKit Egress abre essa página num Chrome headless. Ele entra na sala como participante **oculto**, que não aparece para ninguém. Depois codifica a página (H.264 720p ou 1080p) e envia o vídeo ao YouTube.
4. Todos os participantes veem o badge **AO VIVO** no topo da sala.
5. A transmissão termina pelo botão do anfitrião, quando a reunião é encerrada para todos, ou quando a sala do LiveKit fecha.

O estado de cada transmissão fica na tabela `live_streams`.

## Ativar numa instalação

1. Copie e preencha `infra/egress.yaml` a partir de `infra/egress.yaml.example`. As chaves devem ser as mesmas do `livekit.yaml`.
2. Suba o Egress:

   ```bash
   docker compose -f infra/docker-compose.egress.yml up -d
   ```

3. Libere a saída TCP 1935 (`rtmp://`), ou 443 para `rtmps://`.
4. Opcional: defina `LIVE_VIEW_BASE_URL=http://127.0.0.1:3332` no `.env`. Sem isso, o sistema usa `NEXT_PUBLIC_APP_URL`. Se o Egress estiver noutro host, aponte também `EGRESS_HEALTH_URL` para o `health_port` dele (padrão `http://127.0.0.1:9187/`), ou use `none` para desativar a verificação. A porta precisa estar livre: o painel só considera o Egress online quando a resposta é o JSON de status dele, não uma página de outro serviço.
5. Confirme que o `livekit.yaml` envia webhooks para esta app:

   ```yaml
   webhook:
     api_key: <LIVEKIT_API_KEY>
     urls:
       - http://127.0.0.1:3332/api/livekit/webhook
   ```

   Sem o webhook, o estado é reconciliado por polling: `GET /api/meetings/<id>/live` consulta `listEgress`.

6. Em **/admin → Transmissão**, confirme que o serviço aparece **online**, marque *Transmissão ao vivo ativa* e escolha a qualidade. Se o Egress estiver offline, a própria aba mostra este guia de instalação, e o início de transmissões é recusado com o erro `egress_offline`.

## Legendas

As legendas vêm do agente de IA (tópico `captions`). Se as legendas estiverem desligadas na reunião, a faixa continua reservada no vídeo, mas fica vazia. O modal avisa o anfitrião sobre isso antes de iniciar.

## API

| Método | Rota | Quem |
| --- | --- | --- |
| `GET` | `/api/meetings/<id>/live` | qualquer participante (só estado) |
| `POST` | `/api/meetings/<id>/live` `{ "action": "start", "streamKey": "...", "rtmpUrl"?: "rtmp://..." }` | anfitrião / moderador |
| `POST` | `/api/meetings/<id>/live` `{ "action": "stop" }` | anfitrião / moderador |

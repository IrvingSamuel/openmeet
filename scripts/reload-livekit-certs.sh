#!/usr/bin/env bash
# Reload LiveKit after CloudPanel renews meet.chronos.com.pt TLS certs.
set -euo pipefail
COMPOSE_DIR="/home/chronos-meet/htdocs/meet.chronos.com.pt/infra"
cd "$COMPOSE_DIR"
docker compose restart livekit
echo "$(date -Is) livekit restarted for cert reload" >> /home/chronos-meet/logs/livekit-cert-reload.log

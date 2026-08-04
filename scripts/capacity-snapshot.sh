#!/usr/bin/env bash
# Snapshot LiveKit Prometheus metrics + host load for capacity docs.
set -euo pipefail
OUT="${1:-/home/chronos-meet/htdocs/meet.chronos.com.pt/docs/capacity-snapshot.txt}"
{
  echo "=== $(date -Is) ==="
  echo "-- load --"
  uptime
  echo "-- mem --"
  free -h
  echo "-- livekit container --"
  docker stats chronos-meet-livekit --no-stream 2>/dev/null || echo "container down"
  echo "-- sample metrics --"
  curl -s http://127.0.0.1:6789/metrics | rg -i 'livekit_room|livekit_node|process_resident|go_goroutines' | head -40
} | tee "$OUT"

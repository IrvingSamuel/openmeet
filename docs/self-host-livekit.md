# Self-hosting OpenMeet with LiveKit

This checklist covers the most common causes of **join failures** and **frequent disconnections** when running a fork (e.g. custom domain, separate LiveKit server).

## LiveKit server

- Use **LiveKit server ≥ 1.13**.
- Enable data tracks in your LiveKit config (required for reactions, hand raise, and related features):

```yaml
room:
  enable_data_tracks: true
```

See `infra/livekit.yaml` in this repo for a reference configuration.

## Environment alignment

- `NEXT_PUBLIC_LIVEKIT_URL` must point to the **same** LiveKit deployment that issues tokens (wss URL).
- TURN domain and TLS certificates must match the client domain (do not mix unrelated hostnames without valid certs).
- Token API (`serverUrl` in join response) and public env must agree.

## Network / firewall

Open these ranges on the host running LiveKit (adjust to your config):

| Service | Typical ports |
|---------|----------------|
| TURN UDP | 30000–40000 |
| WebRTC UDP | 50000–50200 (or your `rtc.port_range`) |
| Signaling | 7880 (often proxied via HTTPS/WSS) |

Corporate Wi‑Fi or strict mobile carriers may block UDP; TURN over TLS (443) helps but still needs UDP relay ports.

## Client build

- Deploy a build that includes the **room-reactions** Unicode regex fix (lazy compile) if you support older Safari/iOS.
- Use an error boundary on the meeting route so client exceptions show a recoverable UI instead of a blank Next.js error page.

## Background / mobile policy

OpenMeet defaults (recent versions):

- `disconnectOnPageLeave: false` — switching apps does not force disconnect via `pagehide` / `freeze`.
- `adaptiveStream.pauseVideoInBackground: true` — pauses remote video when the tab is hidden to reduce load.
- Explicit **Leave** still disconnects via `room.disconnect(true)`.

Reconnection fetches a **fresh JWT** before `room.connect()`. Short-lived tokens without refresh will fail manual/auto reconnect.

## Verification

1. Join from mobile Chrome/Safari — no client crash on entry.
2. Switch apps for ~30s — return still in room; video may pause and resume.
3. Brief Wi‑Fi loss — auto-reconnect or recovery modal with working reconnect.
4. Close tab or Leave — participant actually leaves the room.

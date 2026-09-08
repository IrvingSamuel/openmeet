# Contributing to Chronos Meet

Thanks for helping improve Chronos Meet. Public collaboration happens on the **`release`** branch (default). Development work uses protected branches.

## Branch model

| Branch | Role |
|--------|------|
| **`release`** | Default / public surface. Stable code consumers clone and star. |
| **`main`** | Integration trunk. Protected — changes via pull request only. |
| **`dev`** | Active development. Protected — changes via pull request only. |

Flow: feature branch → PR into `dev` → PR into `main` → promote to `release` + GitHub Release tag.

## Setup

```bash
git clone https://github.com/IrvingSamuel/openmeet.git
cd openmeet
cp .env.example .env   # fill secrets locally — never commit .env
cp infra/livekit.yaml.example infra/livekit.yaml
cp infra/egress.yaml.example infra/egress.yaml
# Set LIVEKIT_API_KEY / LIVEKIT_API_SECRET in .env, then copy the same values into livekit.yaml (keys + webhook.api_key) and egress.yaml
npm install
npm run verify
```

**Secrets policy:** never commit `.env`, `infra/livekit.yaml`, or `infra/egress.yaml`. Only the `*.example` templates belong in git. Generate LiveKit credentials with `openssl rand -hex 16` (key) and `openssl rand -hex 32` (secret).

Optional Python agent:

```bash
cd agent
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Pull requests

1. Branch from `dev` (or `main` for hotfixes).
2. Keep PRs focused and documented.
3. Run `npm run verify` before opening the PR.
4. Target `dev` unless maintainers ask otherwise.

## Translations

UI copy lives in `messages/{en,pt,es,fr,de}.json`. Keep keys identical across all five files.

## Code of conduct

Be respectful. Harassment or abusive behavior is not tolerated.

const fs = require("fs");
const path = require("path");

const ROOT = process.env.OPENMEET_ROOT || __dirname;

/** Minimal .env parser — no dotenv dependency required for PM2. */
function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const raw of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadEnvFile(path.join(ROOT, ".env"));
const appPort = fileEnv.PORT || process.env.PORT || "3332";

/** Agent must talk to LiveKit + Next on loopback (Cloudflare denies /twirp). */
const agentEnv = {
  ...fileEnv,
  PYTHONUNBUFFERED: "1",
  LIVEKIT_HTTP_URL:
    fileEnv.LIVEKIT_HTTP_URL || "http://127.0.0.1:7880",
  LIVEKIT_AGENT_URL:
    fileEnv.LIVEKIT_AGENT_URL || "ws://127.0.0.1:7880",
  // livekit-agents CLI reads LIVEKIT_URL from the environment.
  LIVEKIT_URL: fileEnv.LIVEKIT_AGENT_URL || "ws://127.0.0.1:7880",
  MEET_API_URL:
    fileEnv.MEET_API_URL?.startsWith("http://127.0.0.1") ||
    fileEnv.MEET_API_URL?.startsWith("http://localhost")
      ? fileEnv.MEET_API_URL
      : `http://127.0.0.1:${appPort}`,
};

module.exports = {
  apps: [
    {
      name: "openmeet",
      cwd: ROOT,
      script: "node_modules/next/dist/bin/next",
      args: `start -H 127.0.0.1 -p ${appPort}`,
      env: {
        ...fileEnv,
        NODE_ENV: "production",
        PORT: String(appPort),
        LIVEKIT_HTTP_URL:
          fileEnv.LIVEKIT_HTTP_URL || "http://127.0.0.1:7880",
      },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
    },
    {
      name: "openmeet-agent",
      cwd: path.join(ROOT, "agent"),
      script: "venv/bin/python",
      args: "main.py start",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      autorestart: true,
      env: agentEnv,
    },
  ],
};

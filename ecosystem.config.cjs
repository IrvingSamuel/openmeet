const fs = require("fs");
const path = require("path");

const ROOT = "/home/chronos-meet/htdocs/openmeet.chronos.com.pt";

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

module.exports = {
  apps: [
    {
      name: "openmeet",
      cwd: ROOT,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3332",
      env: {
        ...fileEnv,
        NODE_ENV: "production",
        PORT: "3332",
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
      // Job subprocesses inherit this env — critical for DEEPGRAM_API_KEY.
      env: {
        ...fileEnv,
        PYTHONUNBUFFERED: "1",
      },
    },
  ],
};

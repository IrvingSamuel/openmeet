// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLiveKitCreds, mintRoomToken } from "@/lib/livekit";

type Grants = {
  video?: {
    room?: string;
    roomJoin?: boolean;
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
    roomAdmin?: boolean;
  };
  sub?: string;
  name?: string;
  exp?: number;
};

function decode(jwt: string): Grants {
  const [, payload] = jwt.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

const ENV = { ...process.env };

beforeEach(() => {
  process.env.LIVEKIT_API_KEY = "APItestkey";
  process.env.LIVEKIT_API_SECRET = "supersecretsupersecretsupersecret";
  process.env.LIVEKIT_URL = "ws://127.0.0.1:7880";
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("getLiveKitCreds", () => {
  it("returns the configured credentials", () => {
    expect(getLiveKitCreds()).toEqual({
      apiKey: "APItestkey",
      apiSecret: "supersecretsupersecretsupersecret",
      url: "ws://127.0.0.1:7880",
    });
  });

  it("fails loudly when a variable is missing", () => {
    delete process.env.LIVEKIT_API_SECRET;
    expect(() => getLiveKitCreds()).toThrow(/LIVEKIT/);
  });
});

describe("mintRoomToken", () => {
  it("scopes the grant to a single room", async () => {
    const jwt = await mintRoomToken({
      roomName: "meet_abc",
      identity: "user_1",
      name: "Ana",
      role: "participant",
    });
    const claims = decode(jwt);
    expect(claims.video?.room).toBe("meet_abc");
    expect(claims.video?.roomJoin).toBe(true);
    expect(claims.sub).toBe("user_1");
    expect(claims.name).toBe("Ana");
  });

  it("grants room admin only to the host", async () => {
    const host = decode(
      await mintRoomToken({
        roomName: "meet_abc",
        identity: "user_1",
        name: "Ana",
        role: "host",
      }),
    );
    const guest = decode(
      await mintRoomToken({
        roomName: "meet_abc",
        identity: "guest_1",
        name: "Caio",
        role: "participant",
      }),
    );
    expect(host.video?.roomAdmin).toBe(true);
    expect(guest.video?.roomAdmin).toBeFalsy();
  });

  it("keeps the agent from publishing media but lets it send data", async () => {
    const agent = decode(
      await mintRoomToken({
        roomName: "meet_abc",
        identity: "agent",
        name: "Copiloto",
        role: "agent",
      }),
    );
    expect(agent.video?.canPublish).toBe(false);
    expect(agent.video?.canSubscribe).toBe(true);
    expect(agent.video?.canPublishData).toBe(true);
  });

  it("honours a custom ttl", async () => {
    const claims = decode(
      await mintRoomToken({
        roomName: "meet_abc",
        identity: "user_1",
        name: "Ana",
        role: "participant",
        ttlSeconds: 120,
      }),
    );
    const secondsLeft = (claims.exp ?? 0) - Math.floor(Date.now() / 1000);
    expect(secondsLeft).toBeGreaterThan(60);
    expect(secondsLeft).toBeLessThanOrEqual(120);
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telemetry/disconnect/route";

function post(body: string) {
  return POST(
    new Request("http://localhost/api/telemetry/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/telemetry/disconnect", () => {
  it("logs a valid beacon and returns 204", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const res = await post(
      JSON.stringify({
        event: "disconnected",
        slug: "ls9y8xbzf6",
        reason: 1,
        outcome: "recover",
        visibilityState: "hidden",
        wasFrozen: true,
        attempt: 0,
        userAgent: "Mozilla/5.0 Chrome/140",
      }),
    );

    expect(res.status).toBe(204);
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]![0]);
    expect(line.startsWith("[openmeet:disconnect] ")).toBe(true);
    const logged = JSON.parse(line.slice("[openmeet:disconnect] ".length));
    expect(logged).toMatchObject({
      event: "disconnected",
      slug: "ls9y8xbzf6",
      wasFrozen: true,
    });
  });

  it("logs client_error crashes to stderr with the error details", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await post(
      JSON.stringify({
        event: "client_error",
        slug: "ls9y8xbzf6",
        meetingId: "m1",
        userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile",
        error: {
          name: "TypeError",
          message: "Cannot read properties of undefined (reading 'sid')",
          stack: "TypeError: ...\n    at Stage (Stage.tsx:10)",
          componentStack: "\n    at Stage\n    at RoomShell",
          reloaded: false,
        },
      }),
    );

    expect(res.status).toBe(204);
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0]![0]);
    expect(line.startsWith("[openmeet:client-error] ")).toBe(true);
    const logged = JSON.parse(line.slice("[openmeet:client-error] ".length));
    expect(logged).toMatchObject({
      event: "client_error",
      slug: "ls9y8xbzf6",
      error: { name: "TypeError", reloaded: false },
    });
  });

  it("rejects client_error payloads with oversized stacks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await post(
      JSON.stringify({
        event: "client_error",
        slug: "x",
        error: { name: "Error", message: "boom", stack: "a".repeat(3000) },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects unknown events", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const res = await post(JSON.stringify({ event: "boom", slug: "x" }));
    expect(res.status).toBe(400);
    expect(info).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON and oversized bodies", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect((await post("{not json")).status).toBe(400);
    expect(
      (
        await post(
          JSON.stringify({ event: "disconnected", slug: "x", userAgent: "a".repeat(5000) }),
        )
      ).status,
    ).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const report = vi.fn();
vi.mock("@/lib/disconnect-telemetry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/disconnect-telemetry")>();
  return { ...actual, reportDisconnectTelemetry: (...args: unknown[]) => report(...args) };
});

import { MeetingRoomErrorBoundary } from "@/components/MeetingRoomErrorBoundary";

function Thrower({ error }: { error: Error }): never {
  throw error;
}

function renderBoundary(error: Error) {
  return render(
    <MeetingRoomErrorBoundary
      title="Algo deu errado na reunião"
      body="body"
      retryLabel="Tentar novamente"
      leaveLabel="Sair"
      onLeave={() => undefined}
      slug="abc"
      meetingId="m1"
    >
      <Thrower error={error} />
    </MeetingRoomErrorBoundary>,
  );
}

const originalLocation = window.location;
const reload = vi.fn();

beforeEach(() => {
  report.mockClear();
  reload.mockClear();
  window.sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.restoreAllMocks();
});

describe("MeetingRoomErrorBoundary", () => {
  it("shows the crash screen and reports the error to the server", () => {
    renderBoundary(new TypeError("Cannot read properties of undefined (reading 'sid')"));

    expect(screen.getByRole("alert")).toHaveTextContent("Algo deu errado na reunião");
    expect(reload).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toMatchObject({
      event: "client_error",
      slug: "abc",
      meetingId: "m1",
      error: {
        name: "TypeError",
        message: "Cannot read properties of undefined (reading 'sid')",
        reloaded: false,
      },
    });
  });

  it("reloads once on a stale chunk instead of showing the crash screen", () => {
    const chunkError = new Error("Loading chunk 7368 failed.");
    chunkError.name = "ChunkLoadError";

    renderBoundary(chunkError);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(report.mock.calls[0]![0]).toMatchObject({
      event: "client_error",
      error: { name: "ChunkLoadError", reloaded: true },
    });
  });

  it("shows the crash screen when a stale chunk fails again right after a reload", () => {
    window.sessionStorage.setItem("openmeet:chunk-reload-at", String(Date.now()));
    const chunkError = new Error("Loading chunk 7368 failed.");
    chunkError.name = "ChunkLoadError";

    renderBoundary(chunkError);

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

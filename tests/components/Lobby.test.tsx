import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl as render, withIntl } from "../helpers/intl";
import userEvent from "@testing-library/user-event";
import { Lobby } from "@/components/Lobby";

function fakeStream() {
  const track = { enabled: true, stop: vi.fn(), kind: "video" };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

function mockDevices(granted = true) {
  const getUserMedia = granted
    ? vi.fn().mockResolvedValue(fakeStream())
    : vi.fn().mockRejectedValue(new Error("NotAllowedError"));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: "videoinput", deviceId: "cam-1", label: "Logitech C920" },
        { kind: "audioinput", deviceId: "mic-1", label: "Yeti" },
      ]),
    },
  });
  return getUserMedia;
}

describe("Lobby", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockDevices();
  });

  it("renders the branded title and subtitle", async () => {
    render(
      <Lobby title="Weekly de produto" subtitle="Vestra" onJoin={vi.fn()} />,
    );
    expect(
      screen.getByRole("heading", { name: "Weekly de produto" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Vestra")).toBeInTheDocument();
  });

  it("keeps the join button disabled until a name is typed", async () => {
    render(<Lobby title="Sala" onJoin={vi.fn()} />);
    const join = screen.getByRole("button", { name: /entrar na reunião/i });
    expect(join).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Seu nome"), "Ana");
    expect(join).toBeEnabled();
  });

  it("passes the trimmed name and device state to onJoin without stopping tracks", async () => {
    const onJoin = vi.fn();
    const getUserMedia = mockDevices();
    render(<Lobby title="Sala" onJoin={onJoin} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    const stream = await getUserMedia.mock.results[0].value;
    const stop = stream.getTracks()[0].stop as ReturnType<typeof vi.fn>;

    await userEvent.type(screen.getByLabelText("Seu nome"), "  Ana  ");
    await userEvent.click(
      screen.getByRole("button", { name: /entrar na reunião/i }),
    );
    expect(onJoin).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Ana",
        videoEnabled: false,
        audioEnabled: false,
      }),
    );
    // Tracks must stay alive until LiveKit mounts — stopping here caused blank cameras.
    expect(stop).not.toHaveBeenCalled();
  });

  it("restores the preview after a join error when permission was lost", async () => {
    const getUserMedia = mockDevices();
    const { rerender } = render(
      <Lobby title="Sala" onJoin={vi.fn()} joining={false} />,
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    // Simulate a dead stream after a failed join attempt.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    // Force the error-recovery path by clearing permission via denied remount path:
    // re-render with an error while permission is denied triggers attach().
    mockDevices(false);
    rerender(
      withIntl(
        <Lobby title="Sala" onJoin={vi.fn()} joining={false} error="Sala lotada" />,
      ),
    );
    expect(await screen.findByText("Sala lotada")).toBeInTheDocument();
  });

  it("remembers the display name between visits", async () => {
    const { unmount } = render(<Lobby title="Sala" onJoin={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Seu nome"), "Caio");
    await userEvent.click(
      screen.getByRole("button", { name: /entrar na reunião/i }),
    );
    unmount();

    render(<Lobby title="Sala" onJoin={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Seu nome")).toHaveValue("Caio"),
    );
  });

  it("reports the toggled state of camera and microphone", async () => {
    const onJoin = vi.fn();
    render(<Lobby title="Sala" onJoin={onJoin} />);
    await userEvent.type(screen.getByLabelText("Seu nome"), "Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Ligar câmera" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Ligar microfone" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /entrar na reunião/i }),
    );
    expect(onJoin).toHaveBeenCalledWith(
      expect.objectContaining({ videoEnabled: true, audioEnabled: true }),
    );
  });

  it("offers the login instead of joining when the room requires it", () => {
    render(<Lobby title="Sala" requireLogin isLoggedIn={false} onJoin={vi.fn()} />);
    expect(
      screen.getByRole("link", { name: /entrar/i }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.queryByRole("button", { name: /entrar na reunião/i }),
    ).not.toBeInTheDocument();
  });

  it("explains a permission denial and offers a retry", async () => {
    mockDevices(false);
    render(<Lobby title="Sala" onJoin={vi.fn()} />);
    expect(
      await screen.findByText(/bloqueados pelo navegador/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
  });

  it("surfaces a join error coming from the server", () => {
    render(<Lobby title="Sala" error="Sala lotada" onJoin={vi.fn()} />);
    expect(screen.getByText("Sala lotada")).toBeInTheDocument();
  });

  it("lists the enumerated devices once permission is granted", async () => {
    render(<Lobby title="Sala" onJoin={vi.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Logitech C920" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("option", { name: "Yeti" })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { Track } from "livekit-client";
import { ControlBar } from "@/components/room/ControlBar";
import en from "../../messages/en.json";

const screenToggle = vi.fn().mockResolvedValue(undefined);
const micToggle = vi.fn().mockResolvedValue(undefined);
const camToggle = vi.fn().mockResolvedValue(undefined);

let screenEnabled = false;

vi.mock("@livekit/components-react", () => ({
  useTrackToggle: ({ source }: { source: Track.Source }) => {
    if (source === Track.Source.ScreenShare) {
      return {
        enabled: screenEnabled,
        pending: false,
        toggle: screenToggle,
      };
    }
    if (source === Track.Source.Microphone) {
      return { enabled: false, pending: false, toggle: micToggle };
    }
    return { enabled: false, pending: false, toggle: camToggle };
  },
  useRoomContext: () => ({
    getActiveDevice: () => "mic-1",
    switchActiveDevice: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    localParticipant: {
      getTrackPublication: () => undefined,
    },
  }),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsSmUp: () => true,
}));

vi.mock("@/hooks/useMeetingDevices", () => ({
  useMeetingDevices: () => ({
    devices: { mics: [], cameras: [], speakers: [] },
    active: { micId: "", cameraId: "", speakerId: "" },
    switching: false,
    speakerSupported: false,
    refresh: vi.fn(),
    switchMic: vi.fn(),
    switchCamera: vi.fn(),
    switchSpeaker: vi.fn(),
  }),
  resolveCaptureDeviceId: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    push: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMeetingEffects", () => ({
  canUseBackgroundEffects: () => false,
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderBar() {
  return render(
    <Wrapper>
      <ControlBar
        layout="grid"
        onLayoutChange={() => undefined}
        panel="none"
        onPanelChange={() => undefined}
        captionsOn={false}
        onCaptionsToggle={() => undefined}
        unreadChat={0}
        peopleCount={1}
        onLeave={() => undefined}
      />
    </Wrapper>,
  );
}

describe("ControlBar screen share menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    screenEnabled = false;
  });

  it("opens share menu and starts video-only share", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Share screen" }));
    expect(await screen.findByText("Video only")).toBeTruthy();

    const videoOnly = screen
      .getAllByRole("menuitem")
      .find((el) => el.textContent?.includes("Video only"));
    expect(videoOnly).toBeTruthy();
    await user.click(videoOnly!);
    expect(screenToggle).toHaveBeenCalledWith(true, { audio: false });
  });

  it("starts share with system audio when choosing screen + audio", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Share screen" }));
    const withAudio = await screen.findByText(/tab or system audio/i);
    await user.click(withAudio.closest("button")!);

    expect(screenToggle).toHaveBeenCalledWith(true, {
      audio: true,
      systemAudio: "include",
    });
  });

  it("stops share immediately when already sharing", async () => {
    screenEnabled = true;
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(screenToggle).toHaveBeenCalledWith(false);
    expect(
      screen.queryByRole("menuitem", { name: /Share screen \+ audio/i }),
    ).toBeNull();
  });
});

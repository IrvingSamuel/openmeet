import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { ControlBar } from "@/components/room/ControlBar";
import en from "../../messages/en.json";

const switchMic = vi.fn().mockResolvedValue(undefined);
const switchCamera = vi.fn().mockResolvedValue(undefined);
const switchSpeaker = vi.fn().mockResolvedValue(undefined);
const refresh = vi.fn().mockResolvedValue(undefined);

vi.mock("@livekit/components-react", () => ({
  useTrackToggle: () => ({
    enabled: true,
    pending: false,
    toggle: vi.fn(),
  }),
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
    devices: {
      mics: [
        {
          deviceId: "mic-1",
          kind: "audioinput",
          label: "Yeti",
          groupId: "g",
          toJSON() {
            return this;
          },
        },
        {
          deviceId: "mic-2",
          kind: "audioinput",
          label: "Built-in Mic",
          groupId: "g",
          toJSON() {
            return this;
          },
        },
      ],
      cameras: [
        {
          deviceId: "cam-1",
          kind: "videoinput",
          label: "Logitech",
          groupId: "g",
          toJSON() {
            return this;
          },
        },
      ],
      speakers: [
        {
          deviceId: "spk-1",
          kind: "audiooutput",
          label: "Headphones",
          groupId: "g",
          toJSON() {
            return this;
          },
        },
      ],
    },
    active: { micId: "mic-1", cameraId: "cam-1", speakerId: "spk-1" },
    switching: false,
    speakerSupported: true,
    refresh,
    switchMic,
    switchCamera,
    switchSpeaker,
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
  canUseBackgroundEffects: () => true,
  useMeetingEffects: () => ({ supported: true, reapply: vi.fn() }),
  audioOptionsFromPrefs: vi.fn(),
}));

vi.mock("@/hooks/useAudioLevel", () => ({
  useAudioLevel: () => 0,
}));

import { DEFAULT_MEDIA_PREFS } from "@/lib/media-prefs-schema";

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

function renderBar(
  extra: Partial<React.ComponentProps<typeof ControlBar>> = {},
) {
  return render(
    wrap(
      <ControlBar
        layout="grid"
        onLayoutChange={vi.fn()}
        panel="none"
        onPanelChange={vi.fn()}
        captionsOn={false}
        onCaptionsToggle={vi.fn()}
        unreadChat={0}
        peopleCount={1}
        onLeave={vi.fn()}
        onSendReaction={vi.fn()}
        mediaPrefs={DEFAULT_MEDIA_PREFS}
        mediaPrefsReady
        mediaPrefsAccountBound
        onMediaPrefsChange={vi.fn()}
        {...extra}
      />,
    ),
  );
}

describe("ControlBar device menus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders reactions and options buttons", () => {
    renderBar();
    expect(screen.getByLabelText("Reactions")).toBeTruthy();
    expect(screen.getByLabelText("Options")).toBeTruthy();
  });

  it("opens mic menu from the chevron and switches device", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(
      screen.getByLabelText("Select microphone and speaker"),
    );

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Yeti")).toBeTruthy();
    expect(within(menu).getByText("Headphones")).toBeTruthy();

    await user.click(within(menu).getByText("Built-in Mic"));
    expect(switchMic).toHaveBeenCalledWith("mic-2");
  });

  it("opens camera menu and switches camera", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByLabelText("Select camera"));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Logitech")).toBeTruthy();

    await user.click(within(menu).getByText("Logitech"));
    expect(switchCamera).toHaveBeenCalledWith("cam-1");
  });

  it("opens options modal with effects section", async () => {
    const user = userEvent.setup();
    const onMediaPrefsChange = vi.fn();
    renderBar({ onMediaPrefsChange });

    await user.click(screen.getByLabelText("Options"));
    expect(
      await screen.findByRole("dialog", { name: "Options" }),
    ).toBeTruthy();
    expect(screen.getByText("Effects")).toBeTruthy();
    expect(screen.getByText("Background blur")).toBeTruthy();

    await user.click(screen.getByText("Background blur"));
    expect(onMediaPrefsChange).toHaveBeenCalledWith(
      expect.objectContaining({ videoEffect: "blur" }),
    );
  });
});

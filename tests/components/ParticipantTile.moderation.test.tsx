// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Track } from "livekit-client";
import { renderWithIntl } from "../helpers/intl";
import { ParticipantTile } from "@/components/room/ParticipantTile";

vi.mock("@livekit/components-react", () => ({
  VideoTrack: () => null,
  isTrackReference: () => false,
  useIsMuted: () => false,
  useIsSpeaking: () => false,
  useParticipantInfo: ({ participant }: { participant: { identity: string; name?: string } }) => ({
    name: participant.name ?? participant.identity,
    identity: participant.identity,
  }),
}));

vi.mock("@/hooks/useElementFullscreen", () => ({
  useElementFullscreen: () => ({
    ref: { current: null },
    active: false,
    toggle: vi.fn(),
  }),
}));

function makeTrackRef(opts: {
  identity: string;
  isLocal?: boolean;
  source?: Track.Source;
}) {
  return {
    participant: {
      identity: opts.identity,
      name: opts.identity,
      isLocal: opts.isLocal ?? false,
    },
    source: opts.source ?? Track.Source.Camera,
    publication: undefined,
  } as never;
}

describe("ParticipantTile moderation controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides mute/camera controls when canModerate is false", () => {
    renderWithIntl(
      <ParticipantTile
        trackRef={makeTrackRef({ identity: "remote-1" })}
        canModerate={false}
        onMute={vi.fn()}
        onCameraOff={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("tile-mute")).toBeNull();
    expect(screen.queryByTestId("tile-camera-off")).toBeNull();
  });

  it("hides mute/camera controls on local participant", () => {
    renderWithIntl(
      <ParticipantTile
        trackRef={makeTrackRef({ identity: "me", isLocal: true })}
        canModerate
        onMute={vi.fn()}
        onCameraOff={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("tile-mute")).toBeNull();
    expect(screen.queryByTestId("tile-camera-off")).toBeNull();
  });

  it("hides mute/camera controls on screen share tiles", () => {
    renderWithIntl(
      <ParticipantTile
        trackRef={makeTrackRef({
          identity: "remote-1",
          source: Track.Source.ScreenShare,
        })}
        canModerate
        onMute={vi.fn()}
        onCameraOff={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("tile-mute")).toBeNull();
    expect(screen.queryByTestId("tile-camera-off")).toBeNull();
  });

  it("shows mute/camera controls for remote tiles when canModerate", async () => {
    const onMute = vi.fn();
    const onCameraOff = vi.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ParticipantTile
        trackRef={makeTrackRef({ identity: "remote-1" })}
        canModerate
        onMute={onMute}
        onCameraOff={onCameraOff}
      />,
    );

    const muteBtn = screen.getByTestId("tile-mute");
    const cameraBtn = screen.getByTestId("tile-camera-off");
    expect(muteBtn).toBeTruthy();
    expect(cameraBtn).toBeTruthy();

    await user.click(muteBtn);
    await user.click(cameraBtn);
    expect(onMute).toHaveBeenCalledTimes(1);
    expect(onCameraOff).toHaveBeenCalledTimes(1);
  });
});

describe("ParticipantTile pin for everyone", () => {
  it("hides the button when canModerate is false", () => {
    renderWithIntl(
      <ParticipantTile
        trackRef={makeTrackRef({ identity: "remote-1" })}
        canModerate={false}
        onGlobalPin={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("tile-global-pin")).toBeNull();
  });

  it("shows the button for moderators and calls the handler", async () => {
    const onGlobalPin = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <ParticipantTile
        trackRef={makeTrackRef({ identity: "remote-1" })}
        canModerate
        onGlobalPin={onGlobalPin}
      />,
    );
    await user.click(screen.getByTestId("tile-global-pin"));
    expect(onGlobalPin).toHaveBeenCalledTimes(1);
  });

  it("shows the pinned badge to everyone", () => {
    renderWithIntl(
      <ParticipantTile
        trackRef={makeTrackRef({ identity: "remote-1" })}
        globalPinned
      />,
    );
    expect(screen.getByTestId("tile-global-pin-badge")).toBeTruthy();
  });
});

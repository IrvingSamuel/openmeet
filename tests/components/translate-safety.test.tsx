// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Track } from "livekit-client";
import { withIntl } from "../helpers/intl";
import { ParticipantTile } from "@/components/room/ParticipantTile";
import { SidePanel } from "@/components/room/SidePanel";

type FakeParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  metadata?: string;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;
};

let participants: FakeParticipant[] = [];

vi.mock("@livekit/components-react", () => ({
  VideoTrack: () => null,
  isTrackReference: () => false,
  useIsMuted: () => false,
  useIsSpeaking: () => false,
  useParticipantInfo: ({ participant }: { participant: { identity: string; name?: string } }) => ({
    name: participant.name,
    identity: participant.identity,
  }),
  useParticipants: () => participants,
}));

vi.mock("@/hooks/useElementFullscreen", () => ({
  useElementFullscreen: () => ({ ref: { current: null }, active: false, toggle: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ push: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/hooks/useModerateParticipant", () => ({
  useModerateParticipant: () => ({ moderate: vi.fn(), busyIdentity: null }),
}));

vi.mock("@/hooks/useCopilotChat", () => ({
  useCopilotChat: () => ({}),
}));

/** What Google Translate does: every text node becomes <font><font>text</font></font>. */
function simulateTranslate(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (!node.nodeValue?.trim()) continue;
    const outer = document.createElement("font");
    const inner = document.createElement("font");
    inner.textContent = node.nodeValue;
    outer.appendChild(inner);
    node.parentNode!.replaceChild(outer, node);
  }
}

function tile(identity: string, name: string) {
  const trackRef = {
    participant: { identity, name, isLocal: true },
    source: Track.Source.Camera,
    publication: undefined,
  } as never;
  return withIntl(<ParticipantTile trackRef={trackRef} />);
}

function peoplePanel(raised: ReadonlySet<string>) {
  return withIntl(
    <SidePanel
      panel="people"
      onClose={() => undefined}
      captions={[]}
      insights={[]}
      chatMessages={[]}
      sendChat={async () => undefined}
      onChatRead={() => undefined}
      raisedIdentities={raised}
    />,
  );
}

beforeEach(() => {
  participants = [];
});

describe("room UI under browser page translation", () => {
  it("the simulation reproduces the crash on interleaved conditional text", () => {
    const Fragile = ({ name }: { name: string }) => (
      <span>
        {name}
        {" (você)"}
      </span>
    );
    const { container, rerender } = render(<Fragile name="" />);
    simulateTranslate(container);
    expect(() => rerender(<Fragile name="Alice" />)).toThrow(/child|node/i);
  });

  it("ParticipantTile survives the local name arriving after connect", () => {
    const { container, rerender } = render(tile("", ""));
    simulateTranslate(container);

    expect(() => rerender(tile("alice", "Alice"))).not.toThrow();
    expect(container.querySelector(".truncate")?.textContent).toContain("Alice");
  });

  it("SidePanel row survives raising and lowering a hand", () => {
    participants = [
      {
        identity: "alice",
        name: "Alice",
        isLocal: true,
        metadata: JSON.stringify({ role: "host" }),
        isMicrophoneEnabled: true,
        isCameraEnabled: false,
        isScreenShareEnabled: false,
      },
    ];
    const { container, rerender } = render(peoplePanel(new Set()));
    simulateTranslate(container);

    expect(() => rerender(peoplePanel(new Set(["alice"])))).not.toThrow();
    expect(container.querySelector('[aria-label="Mão levantada"]')).not.toBeNull();

    participants = [{ ...participants[0]!, isScreenShareEnabled: true }];
    expect(() => rerender(peoplePanel(new Set()))).not.toThrow();
  });
});

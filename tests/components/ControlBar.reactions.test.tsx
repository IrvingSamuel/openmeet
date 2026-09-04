import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { ControlBar } from "@/components/room/ControlBar";
import en from "../../messages/en.json";

vi.mock("@livekit/components-react", () => ({
  useTrackToggle: () => ({
    enabled: true,
    pending: false,
    toggle: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsSmUp: () => true,
}));

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ControlBar reactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders reactions button without crashing", () => {
    const { getByLabelText } = render(
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
        />,
      ),
    );
    expect(getByLabelText("Reactions")).toBeTruthy();
  });
});

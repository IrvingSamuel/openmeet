import { describe, expect, it } from "vitest";
import { DisconnectReason } from "livekit-client";
import { disconnectOutcome, shouldExitMeeting } from "@/lib/leavePolicy";

describe("shouldExitMeeting", () => {
  it("navigates away only on intentional leave", () => {
    expect(shouldExitMeeting({ intentionalLeave: true })).toBe("leave");
  });

  it("keeps the user in the room after an unexpected disconnect", () => {
    expect(shouldExitMeeting({ intentionalLeave: false })).toBe("recover");
  });
});

describe("disconnectOutcome", () => {
  it("treats intentional leave as leave", () => {
    expect(
      disconnectOutcome({
        intentionalLeave: true,
        reason: DisconnectReason.ROOM_DELETED,
      }),
    ).toBe("leave");
  });

  it("maps room deletion to ended", () => {
    expect(
      disconnectOutcome({
        intentionalLeave: false,
        reason: DisconnectReason.ROOM_DELETED,
      }),
    ).toBe("ended");
  });

  it("maps participant removal to removed", () => {
    expect(
      disconnectOutcome({
        intentionalLeave: false,
        reason: DisconnectReason.PARTICIPANT_REMOVED,
      }),
    ).toBe("removed");
  });

  it("maps duplicate identity to duplicate (no auto-reconnect ping-pong)", () => {
    expect(
      disconnectOutcome({
        intentionalLeave: false,
        reason: DisconnectReason.DUPLICATE_IDENTITY,
      }),
    ).toBe("duplicate");
  });

  it("offers recovery for SDK-initiated disconnects (e.g. Chrome freeze)", () => {
    expect(
      disconnectOutcome({
        intentionalLeave: false,
        reason: DisconnectReason.CLIENT_INITIATED,
      }),
    ).toBe("recover");
  });

  it("offers recovery for unknown disconnects", () => {
    expect(
      disconnectOutcome({
        intentionalLeave: false,
        reason: DisconnectReason.UNKNOWN_REASON,
      }),
    ).toBe("recover");
  });
});

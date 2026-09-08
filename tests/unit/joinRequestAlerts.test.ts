import { describe, expect, it } from "vitest";
import { diffJoinRequestAlerts } from "@/lib/joinRequestAlerts";

describe("diffJoinRequestAlerts", () => {
  it("notifies all pending on initial evaluation", () => {
    const result = diffJoinRequestAlerts({
      prevKnownIds: new Set(),
      currentRequests: [
        { id: "a", displayName: "Ana" },
        { id: "b", displayName: "Bob" },
      ],
      isInitial: true,
    });
    expect(result.toNotify.map((r) => r.id)).toEqual(["a", "b"]);
    expect([...result.nextKnownIds].sort()).toEqual(["a", "b"]);
  });

  it("notifies empty on initial with no pending", () => {
    const result = diffJoinRequestAlerts({
      prevKnownIds: new Set(),
      currentRequests: [],
      isInitial: true,
    });
    expect(result.toNotify).toEqual([]);
    expect(result.nextKnownIds.size).toBe(0);
  });

  it("notifies only new ids after initial", () => {
    const result = diffJoinRequestAlerts({
      prevKnownIds: new Set(["a"]),
      currentRequests: [
        { id: "a", displayName: "Ana" },
        { id: "c", displayName: "Caio" },
      ],
      isInitial: false,
    });
    expect(result.toNotify).toEqual([{ id: "c", displayName: "Caio" }]);
    expect([...result.nextKnownIds].sort()).toEqual(["a", "c"]);
  });

  it("drops removed ids from known without notifying", () => {
    const result = diffJoinRequestAlerts({
      prevKnownIds: new Set(["a", "b"]),
      currentRequests: [{ id: "a", displayName: "Ana" }],
      isInitial: false,
    });
    expect(result.toNotify).toEqual([]);
    expect([...result.nextKnownIds]).toEqual(["a"]);
  });

  it("notifies again after cancel when a new id appears", () => {
    const afterCancel = diffJoinRequestAlerts({
      prevKnownIds: new Set(["old"]),
      currentRequests: [],
      isInitial: false,
    });
    expect(afterCancel.nextKnownIds.size).toBe(0);

    const rejoin = diffJoinRequestAlerts({
      prevKnownIds: afterCancel.nextKnownIds,
      currentRequests: [{ id: "new", displayName: "Ana" }],
      isInitial: false,
    });
    expect(rejoin.toNotify).toEqual([{ id: "new", displayName: "Ana" }]);
  });
});

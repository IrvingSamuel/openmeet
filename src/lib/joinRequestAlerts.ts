export type JoinAlertRequest = {
  id: string;
  displayName: string;
};

export type JoinAlertDiffInput = {
  prevKnownIds: ReadonlySet<string>;
  currentRequests: readonly JoinAlertRequest[];
  /** True on the first evaluation for this room session (no prior seed). */
  isInitial: boolean;
};

export type JoinAlertDiffResult = {
  nextKnownIds: Set<string>;
  /** Requests the host should be notified about (chime / toast). */
  toNotify: JoinAlertRequest[];
};

/**
 * Diff pending join requests against previously known ids.
 * Never silently swallows the first batch — pending on boot are notified.
 */
export function diffJoinRequestAlerts(
  input: JoinAlertDiffInput,
): JoinAlertDiffResult {
  const nextKnownIds = new Set(input.currentRequests.map((r) => r.id));

  if (input.isInitial) {
    return {
      nextKnownIds,
      toNotify: [...input.currentRequests],
    };
  }

  const toNotify = input.currentRequests.filter(
    (r) => !input.prevKnownIds.has(r.id),
  );

  return { nextKnownIds, toNotify };
}

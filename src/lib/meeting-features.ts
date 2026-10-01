export type MeetingFeatures = {
  captions: boolean;
  transcription: boolean;
  summary: boolean;
};

export type MeetingFeaturesInput = {
  captions?: boolean | null;
  transcription?: boolean | null;
  summary?: boolean | null;
};

/** meetings.summaryStatus for meetings created with the summary turned off. Final state. */
export const SUMMARY_STATUS_DISABLED = "disabled";

export const DEFAULT_MEETING_FEATURES: MeetingFeatures = {
  captions: true,
  transcription: true,
  summary: true,
};

function pick(
  explicit: boolean | null | undefined,
  template: boolean | null | undefined,
): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (typeof template === "boolean") return template;
  return true;
}

/**
 * Explicit input wins, then the room template, then on. The summary is built
 * from saved transcript segments, so it is forced off without transcription.
 */
export function resolveMeetingFeatures(
  input: MeetingFeaturesInput = {},
  template?: MeetingFeaturesInput | null,
): MeetingFeatures {
  const captions = pick(input.captions, template?.captions);
  const transcription = pick(input.transcription, template?.transcription);
  const summary = transcription && pick(input.summary, template?.summary);
  return { captions, transcription, summary };
}

/** The agent's only jobs are publishing captions and saving transcript segments. */
export function agentRequired(f: MeetingFeatures): boolean {
  return f.captions || f.transcription;
}

type FeatureColumns = {
  captionsEnabled?: boolean | null;
  transcriptionEnabled?: boolean | null;
  summaryEnabled?: boolean | null;
};

export function featuresFromRow(row: FeatureColumns): MeetingFeatures {
  return resolveMeetingFeatures({
    captions: row.captionsEnabled,
    transcription: row.transcriptionEnabled,
    summary: row.summaryEnabled,
  });
}

export function featuresToColumns(f: MeetingFeatures) {
  return {
    captionsEnabled: f.captions,
    transcriptionEnabled: f.transcription,
    summaryEnabled: f.summary,
  };
}

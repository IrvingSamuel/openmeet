import { z } from "zod";
import { featuresFromRow } from "@/lib/meeting-features";

/** Public API (snake_case) AI feature toggles. Omitted = inherit / default on. */
export const apiFeatureFields = {
  captions_enabled: z.boolean().optional(),
  transcription_enabled: z.boolean().optional(),
  summary_enabled: z.boolean().optional(),
};

type ApiFeatureArgs = {
  captions_enabled?: boolean;
  transcription_enabled?: boolean;
  summary_enabled?: boolean;
};
export type { ApiFeatureArgs };

/** JSON Schema properties for MCP tools/list. */
export const apiFeatureJsonSchema = {
  captions_enabled: {
    type: "boolean",
    description: "Live captions (default true; omit to inherit from the room)",
  },
  transcription_enabled: {
    type: "boolean",
    description:
      "Save the transcript (default true; omit to inherit). Captions and transcription both off = no AI agent joins.",
  },
  summary_enabled: {
    type: "boolean",
    description:
      "Generate the AI summary after the meeting (default true; omit to inherit). Forced false when transcription is off.",
  },
} as const;

export function apiFeaturesToInput(body: {
  captions_enabled?: boolean;
  transcription_enabled?: boolean;
  summary_enabled?: boolean;
}) {
  return {
    captionsEnabled: body.captions_enabled,
    transcriptionEnabled: body.transcription_enabled,
    summaryEnabled: body.summary_enabled,
  };
}

export function apiFeaturesResponse(row: {
  captionsEnabled?: boolean | null;
  transcriptionEnabled?: boolean | null;
  summaryEnabled?: boolean | null;
}) {
  const f = featuresFromRow(row);
  return {
    captions_enabled: f.captions,
    transcription_enabled: f.transcription,
    summary_enabled: f.summary,
  };
}

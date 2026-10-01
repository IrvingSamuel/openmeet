import { describe, expect, it } from "vitest";
import {
  agentRequired,
  featuresFromRow,
  featuresToColumns,
  resolveMeetingFeatures,
} from "@/lib/meeting-features";

describe("resolveMeetingFeatures", () => {
  it("defaults everything on", () => {
    expect(resolveMeetingFeatures()).toEqual({
      captions: true,
      transcription: true,
      summary: true,
    });
  });

  it("explicit values win over the room template", () => {
    expect(
      resolveMeetingFeatures(
        { captions: true, summary: true },
        { captions: false, transcription: true, summary: false },
      ),
    ).toEqual({ captions: true, transcription: true, summary: true });
  });

  it("omitted values inherit from the room template", () => {
    expect(
      resolveMeetingFeatures(
        {},
        { captions: false, transcription: true, summary: false },
      ),
    ).toEqual({ captions: false, transcription: true, summary: false });
  });

  it("null input inherits like undefined", () => {
    expect(
      resolveMeetingFeatures({ captions: null }, { captions: false }).captions,
    ).toBe(false);
  });

  it("forces summary off without transcription", () => {
    expect(
      resolveMeetingFeatures({ transcription: false, summary: true }),
    ).toEqual({ captions: true, transcription: false, summary: false });
    expect(
      resolveMeetingFeatures({ summary: true }, { transcription: false }),
    ).toEqual({ captions: true, transcription: false, summary: false });
  });
});

describe("agentRequired", () => {
  it("is false only when captions and transcription are both off", () => {
    expect(
      agentRequired({ captions: false, transcription: false, summary: false }),
    ).toBe(false);
    expect(
      agentRequired({ captions: true, transcription: false, summary: false }),
    ).toBe(true);
    expect(
      agentRequired({ captions: false, transcription: true, summary: true }),
    ).toBe(true);
  });
});

describe("row helpers", () => {
  it("round-trips columns and normalizes legacy rows", () => {
    const f = { captions: false, transcription: true, summary: false };
    expect(featuresFromRow(featuresToColumns(f))).toEqual(f);
    expect(featuresFromRow({})).toEqual({
      captions: true,
      transcription: true,
      summary: true,
    });
    expect(
      featuresFromRow({ transcriptionEnabled: false, summaryEnabled: true })
        .summary,
    ).toBe(false);
  });
});

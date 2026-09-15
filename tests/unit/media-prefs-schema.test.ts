import { describe, expect, it } from "vitest";
import {
  coerceMediaPrefs,
  DEFAULT_MEDIA_PREFS,
  mediaPrefsFieldsSchema,
  mediaPrefsFieldsToPatch,
} from "@/lib/media-prefs-schema";

describe("media-prefs-schema", () => {
  it("coerces unknown input to defaults", () => {
    expect(coerceMediaPrefs(null)).toEqual(DEFAULT_MEDIA_PREFS);
    expect(coerceMediaPrefs({ videoEffect: "nope" }).videoEffect).toBe("none");
  });

  it("accepts a valid patch", () => {
    const parsed = mediaPrefsFieldsSchema.safeParse({
      videoEffect: "virtual",
      blurRadius: 12,
      virtualBackgroundUrl: "/virtual-backgrounds/office.jpg",
      noiseSuppression: false,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(mediaPrefsFieldsToPatch(parsed.data)).toMatchObject({
      videoEffect: "virtual",
      blurRadius: 12,
      noiseSuppression: false,
    });
  });

  it("rejects out-of-range blur", () => {
    expect(mediaPrefsFieldsSchema.safeParse({ blurRadius: 99 }).success).toBe(
      false,
    );
  });
});

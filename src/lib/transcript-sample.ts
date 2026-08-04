/** Cap transcript chars sent to Gemini for post-meeting summaries (~3k tokens). */
export const SUMMARY_TRANSCRIPT_CHAR_CAP = 12_000;

/**
 * Keep beginning + middle + end of a long transcript within a char budget.
 * Short transcripts are returned unchanged.
 */
export function sampleTranscriptForSummary(
  transcript: string,
  cap = SUMMARY_TRANSCRIPT_CHAR_CAP,
): string {
  const trimmed = transcript.trim();
  if (trimmed.length <= cap) return trimmed;

  const third = Math.floor(cap / 3);
  const head = trimmed.slice(0, third);
  const midStart = Math.floor((trimmed.length - third) / 2);
  const mid = trimmed.slice(midStart, midStart + third);
  const tail = trimmed.slice(-third);
  return [
    head,
    "\n\n[… trecho intermédio omitido para economia de tokens …]\n\n",
    mid,
    "\n\n[… trecho omitido …]\n\n",
    tail,
  ].join("");
}

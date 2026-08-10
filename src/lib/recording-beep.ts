/** Soft recording start/stop cues — short chime + optional spoken line (no external assets). */

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

function tone(
  ctx: AudioContext,
  opts: {
    freq: number;
    start: number;
    dur: number;
    gain: number;
    type?: OscillatorType;
  },
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = opts.freq;
  g.gain.setValueAtTime(0.0001, opts.start);
  g.gain.exponentialRampToValueAtTime(opts.gain, opts.start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(opts.start);
  osc.stop(opts.start + opts.dur + 0.03);
}

/** Distinct two-tone cues: ascending = start, descending = stop. */
export function playRecordingBeep(
  kind: "start" | "stop",
  volume: "normal" | "quiet" = "normal",
) {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);
  const now = ctx.currentTime;
  const base = volume === "quiet" ? 0.035 : 0.1;
  if (kind === "start") {
    // Soft ascending chime ~1.2s
    tone(ctx, { freq: 523.25, start: now, dur: 0.28, gain: base * 0.85 });
    tone(ctx, {
      freq: 659.25,
      start: now + 0.22,
      dur: 0.32,
      gain: base,
    });
    tone(ctx, {
      freq: 783.99,
      start: now + 0.48,
      dur: 0.55,
      gain: base * 0.75,
    });
  } else {
    // Soft descending chime ~1.2s
    tone(ctx, { freq: 783.99, start: now, dur: 0.28, gain: base * 0.85 });
    tone(ctx, {
      freq: 659.25,
      start: now + 0.22,
      dur: 0.32,
      gain: base,
    });
    tone(ctx, {
      freq: 523.25,
      start: now + 0.48,
      dur: 0.55,
      gain: base * 0.7,
    });
  }
}

function speakLine(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1;
    utter.volume = 0.85;
    // Prefer a voice matching the page language when available.
    const lang = document.documentElement.lang || undefined;
    if (lang) utter.lang = lang;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore TTS failures — chime alone is enough
  }
}

/**
 * Chime (~1s) plus a short spoken line matching the toast.
 * Call from the UI on recording start/stop so locale matches the toast.
 */
export function announceRecordingChange(
  kind: "start" | "stop",
  spokenText: string,
  volume: "normal" | "quiet" = "normal",
) {
  playRecordingBeep(kind, volume);
  // Slight delay so the chime leads, then speech (~1–2s total with chime).
  window.setTimeout(() => speakLine(spokenText), 350);
}

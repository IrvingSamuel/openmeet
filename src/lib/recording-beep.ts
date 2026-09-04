/** Soft recording start/stop cues — MP3s where available; Web Audio fallback otherwise. */

import {
  playMeetingSound,
  unlockMeetingSounds,
} from "@/lib/meeting-sounds";

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

/** Near-silent tick so iOS keeps the AudioContext alive after resume. */
function primeCtx(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.00001;
    osc.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    osc.start(t);
    osc.stop(t + 0.02);
  } catch {
    // ignore
  }
}

/**
 * Create/resume shared Web Audio so chimes can play after a user gesture (esp. mobile).
 * Call resume() immediately (sync start) so it counts as part of the gesture.
 */
async function ensureAudioRunning(): Promise<AudioContext | null> {
  const ctx = getCtx();
  if (!ctx) return null;
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      // resume may fail (autoplay policy); state stays suspended
    }
  }
  if (ctx.state !== "running") return null;
  return ctx;
}

/**
 * Unlock meeting chimes from a user gesture so remote events can play later.
 * Must be invoked synchronously from pointerdown/click (not after await).
 */
export function unlockMeetingChimes(): void {
  unlockMeetingSounds();
  const ctx = getCtx();
  if (!ctx) return;
  // Start resume inside the gesture stack; prime when running.
  const kickoff =
    ctx.state === "running" ? Promise.resolve() : ctx.resume();
  void kickoff
    .then(() => {
      if (ctx.state === "running") primeCtx(ctx);
    })
    .catch(() => undefined);
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

async function withRunningCtx(
  play: (ctx: AudioContext, now: number) => void,
): Promise<void> {
  const ctx = await ensureAudioRunning();
  if (!ctx) return;
  play(ctx, ctx.currentTime);
}

/** Distinct two-tone cues: ascending = start, descending = stop. */
export function playRecordingBeep(
  kind: "start" | "stop",
  volume: "normal" | "quiet" = "normal",
) {
  void withRunningCtx((ctx, now) => {
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
  });
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
 * Recording cue: MP3 on start (no TTS — overlaps long clip); Web Audio + TTS on stop.
 */
export function announceRecordingChange(
  kind: "start" | "stop",
  spokenText: string,
  volume: "normal" | "quiet" = "normal",
) {
  if (kind === "start") {
    playMeetingSound("inicioGravacao");
    return;
  }
  playRecordingBeep("stop", volume);
  window.setTimeout(() => speakLine(spokenText), 350);
}

/** Join-request knock — host-only call sites. */
export function playJoinRequestChime() {
  playMeetingSound("solicitacaoEntrada");
}

/** Participant left cue. */
export function playParticipantLeftChime() {
  playMeetingSound("saidaMembro");
}

/** Hand-raise cue (local gesture or remote attribute change). */
export function playHandRaiseChime() {
  playMeetingSound("maoLevantada");
}

/** Screen-share start (abertura livestream). */
export function playScreenShareChime() {
  playMeetingSound("abertura");
}

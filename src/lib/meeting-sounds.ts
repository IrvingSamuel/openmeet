/** MP3 meeting cues under /public/sounds — HTMLAudio for reliable mobile playback. */

export type MeetingSoundId =
  | "abertura"
  | "error"
  | "inicioGravacao"
  | "maoLevantada"
  | "saidaMembro"
  | "solicitacaoEntrada";

const SOUND_URLS: Record<MeetingSoundId, string> = {
  abertura: "/sounds/abertura-livestream.mp3",
  error: "/sounds/error.mp3",
  inicioGravacao: "/sounds/inicio-gravacao.mp3",
  maoLevantada: "/sounds/mao-levantada.mp3",
  saidaMembro: "/sounds/saida-de-membro.mp3",
  solicitacaoEntrada: "/sounds/solicitacao-entrada.mp3",
};

let inMeeting = false;
const cache = new Map<MeetingSoundId, HTMLAudioElement>();

function getAudio(id: MeetingSoundId): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let el = cache.get(id);
  if (!el) {
    el = new Audio(SOUND_URLS[id]);
    el.preload = "auto";
    cache.set(id, el);
  }
  return el;
}

/** Enable error-toast sound only while MeetingRoom is mounted. */
export function setMeetingSoundContext(active: boolean): void {
  inMeeting = active;
}

export function isMeetingSoundContextActive(): boolean {
  return inMeeting;
}

/**
 * Unlock / preload sounds from a user gesture so later remote events can play.
 * Call synchronously from pointerdown/click.
 */
export function unlockMeetingSounds(): void {
  if (typeof window === "undefined") return;
  for (const id of Object.keys(SOUND_URLS) as MeetingSoundId[]) {
    const el = getAudio(id);
    if (!el) continue;
    try {
      el.muted = true;
      el.volume = 0;
      const p = el.play();
      if (p && typeof p.then === "function") {
        void p
          .then(() => {
            el.pause();
            el.currentTime = 0;
            el.muted = false;
            el.volume = 1;
          })
          .catch(() => {
            el.muted = false;
            el.volume = 1;
          });
      } else {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
        el.volume = 1;
      }
    } catch {
      el.muted = false;
      el.volume = 1;
    }
  }
}

/** Play a meeting MP3. Overlapping plays use a clone so cues can stack. */
export function playMeetingSound(id: MeetingSoundId): void {
  if (typeof window === "undefined") return;
  const base = getAudio(id);
  if (!base) return;

  try {
    // Prefer a fresh clone when the base element is already playing.
    const el =
      !base.paused && !base.ended
        ? (base.cloneNode(true) as HTMLAudioElement)
        : base;
    el.muted = false;
    el.volume = 1;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  } catch {
    // ignore autoplay / decode failures
  }
}

/** Error cue only inside an active meeting (Toast.error path). */
export function playMeetingErrorSound(): void {
  if (!inMeeting) return;
  playMeetingSound("error");
}

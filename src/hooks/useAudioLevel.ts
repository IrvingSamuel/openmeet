"use client";

import { useEffect, useRef, useState } from "react";

/**
 * RMS level (0..1) of an audio stream, sampled on rAF.
 * Returns 0 when there is no stream or the browser blocks Web Audio.
 */
export function useAudioLevel(stream: MediaStream | null, enabled = true) {
  const [level, setLevel] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || !enabled) {
      setLevel(0);
      return;
    }
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) {
      setLevel(0);
      return;
    }

    type AudioContextCtor = typeof AudioContext;
    const Ctor: AudioContextCtor | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: AudioContextCtor })
            .webkitAudioContext
        : undefined;
    if (!Ctor) return;

    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    let disposed = false;

    function tick() {
      if (disposed) return;
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);
      setLevel(Math.min(1, rms * 3.2));
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      source.disconnect();
      ctx.close().catch(() => undefined);
    };
  }, [stream, enabled]);

  return level;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type RemoteTrack,
} from "livekit-client";

export type RecordingClientConfig = {
  enabled: boolean;
  engine: "egress" | "browser";
  controlMode: "manual" | "auto";
  autoRecordingId?: string | null;
};

type ActiveRecording = {
  id: string;
  status: string;
  engine: string;
} | null;

const TOPIC = "recording";

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return "video/webm";
}

async function mixRoomToStream(room: Room): Promise<{
  stream: MediaStream;
  stop: () => void;
}> {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const sources: MediaStreamAudioSourceNode[] = [];

  function attachAudio(track: LocalTrack | RemoteTrack) {
    if (track.kind !== Track.Kind.Audio) return;
    const media = track.mediaStreamTrack;
    if (!media) return;
    try {
      const ms = new MediaStream([media]);
      const node = audioCtx.createMediaStreamSource(ms);
      node.connect(dest);
      sources.push(node);
    } catch {
      // ignore
    }
  }

  for (const pub of room.localParticipant.trackPublications.values()) {
    if (pub.track) attachAudio(pub.track);
  }
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.track) attachAudio(pub.track);
    }
  }

  const videos: HTMLVideoElement[] = [];
  function collectVideos() {
    for (const v of videos) {
      v.srcObject = null;
      v.remove();
    }
    videos.length = 0;
    const tracks: MediaStreamTrack[] = [];
    const add = (track: LocalTrack | RemoteTrack | undefined) => {
      if (!track || track.kind !== Track.Kind.Video) return;
      const mst = track.mediaStreamTrack;
      if (mst) tracks.push(mst);
    };
    for (const pub of room.localParticipant.trackPublications.values()) {
      add(pub.track);
    }
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        add(pub.track);
      }
    }
    for (const mst of tracks.slice(0, 4)) {
      const el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.autoplay = true;
      el.srcObject = new MediaStream([mst]);
      void el.play().catch(() => undefined);
      videos.push(el);
    }
  }
  collectVideos();

  let raf = 0;
  const draw = () => {
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const n = Math.max(videos.length, 1);
    const cols = n <= 1 ? 1 : n <= 2 ? 2 : 2;
    const rows = Math.ceil(n / cols);
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;
    videos.forEach((v, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      try {
        ctx.drawImage(v, col * cellW, row * cellH, cellW, cellH);
      } catch {
        // ignore
      }
    });
    raf = requestAnimationFrame(draw);
  };
  draw();

  const refreshTimer = window.setInterval(collectVideos, 3000);

  const videoStream = canvas.captureStream(15);
  const mixed = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  return {
    stream: mixed,
    stop: () => {
      cancelAnimationFrame(raf);
      window.clearInterval(refreshTimer);
      for (const v of videos) {
        v.srcObject = null;
      }
      for (const s of sources) {
        try {
          s.disconnect();
        } catch {
          // ignore
        }
      }
      void audioCtx.close().catch(() => undefined);
      for (const t of mixed.getTracks()) t.stop();
    },
  };
}

export function useMeetingRecorder(opts: {
  room: Room | undefined;
  meetingId: string | undefined;
  isHost: boolean;
  config: RecordingClientConfig | null;
}) {
  const { room, meetingId, isHost, config } = opts;
  const [active, setActive] = useState<ActiveRecording>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopMixRef = useRef<(() => void) | null>(null);
  const autoStartedRef = useRef(false);

  const publishState = useCallback(
    (payload: { recording: boolean; recordingId?: string | null }) => {
      if (!room) return;
      const data = new TextEncoder().encode(JSON.stringify(payload));
      void room.localParticipant
        .publishData(data, { reliable: true, topic: TOPIC })
        .catch(() => undefined);
    },
    [room],
  );

  useEffect(() => {
    if (!room) return;
    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== TOPIC) return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as {
          recording?: boolean;
          recordingId?: string;
        };
        if (msg.recording && msg.recordingId) {
          setActive({
            id: msg.recordingId,
            status: "recording",
            engine: config?.engine ?? "browser",
          });
        } else if (msg.recording === false) {
          setActive(null);
        }
      } catch {
        // ignore
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, config?.engine]);

  const uploadChunk = useCallback(
    async (recordingId: string, blob: Blob) => {
      if (!meetingId) return;
      await fetch(
        `/api/meetings/${meetingId}/recording/chunk?recordingId=${recordingId}`,
        {
          method: "POST",
          headers: { "Content-Type": blob.type || "application/octet-stream" },
          body: blob,
        },
      );
    },
    [meetingId],
  );

  const startBrowserCapture = useCallback(
    async (recordingId: string) => {
      if (!room) throw new Error("no_room");
      const mixed = await mixRoomToStream(room);
      stopMixRef.current = mixed.stop;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(mixed.stream, {
        mimeType,
        videoBitsPerSecond: 1_500_000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          void uploadChunk(recordingId, ev.data);
        }
      };
      recorder.start(4000);
    },
    [room, uploadChunk],
  );

  const stopBrowserCapture = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const rec = recorderRef.current!;
        rec.onstop = () => resolve();
        rec.stop();
      });
    }
    recorderRef.current = null;
    stopMixRef.current?.();
    stopMixRef.current = null;
  }, []);

  const start = useCallback(
    async (asAuto = false) => {
      if (!meetingId || !isHost || !config?.enabled) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/meetings/${meetingId}/recording${asAuto ? "?auto=1" : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start", auto: asAuto }),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          const detail =
            typeof data.detail === "string" && data.detail.trim()
              ? data.detail.trim()
              : null;
          throw new Error(
            detail
              ? `${data.error || "start_failed"}: ${detail}`
              : data.error || "start_failed",
          );
        }
        const recording = data.recording as {
          id: string;
          status: string;
          engine: string;
        };
        setActive(recording);
        publishState({ recording: true, recordingId: recording.id });
        if (recording.engine === "browser") {
          await startBrowserCapture(recording.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [meetingId, isHost, config?.enabled, publishState, startBrowserCapture],
  );

  const stop = useCallback(async () => {
    if (!meetingId || !isHost) return;
    if (config?.controlMode === "auto") return;
    setBusy(true);
    setError(null);
    try {
      await stopBrowserCapture();
      const res = await fetch(`/api/meetings/${meetingId}/recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail =
          typeof data.detail === "string" && data.detail.trim()
            ? data.detail.trim()
            : null;
        throw new Error(
          detail
            ? `${data.error || "stop_failed"}: ${detail}`
            : data.error || "stop_failed",
        );
      }
      setActive(null);
      publishState({ recording: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [meetingId, isHost, config?.controlMode, publishState, stopBrowserCapture]);

  useEffect(() => {
    if (!isHost || !config?.enabled || !meetingId || !room) return;
    if (config.controlMode !== "auto") return;
    if (autoStartedRef.current) return;
    if (room.state !== "connected") return;
    autoStartedRef.current = true;

    if (config.engine === "egress" && config.autoRecordingId) {
      setActive({
        id: config.autoRecordingId,
        status: "recording",
        engine: "egress",
      });
      publishState({
        recording: true,
        recordingId: config.autoRecordingId,
      });
      return;
    }
    if (config.engine === "browser") {
      void start(true);
    }
  }, [isHost, config, meetingId, room, room?.state, publishState, start]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      stopMixRef.current?.();
    };
  }, []);

  return {
    active: Boolean(active),
    recordingId: active?.id ?? null,
    busy,
    error,
    canToggle: Boolean(
      isHost && config?.enabled && config.controlMode === "manual",
    ),
    showBadge: Boolean(config?.enabled && active),
    start: () => start(false),
    stop,
  };
}

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

export const DISPLAY_CAPTURE_DENIED = "display_capture_denied";

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

function mixLiveKitAudio(room: Room): {
  dest: MediaStreamAudioDestinationNode;
  audioCtx: AudioContext;
  sources: MediaStreamAudioSourceNode[];
  attachAudio: (track: LocalTrack | RemoteTrack) => void;
  stop: () => void;
} {
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const sources: MediaStreamAudioSourceNode[] = [];
  const attached = new Set<string>();

  function attachAudio(track: LocalTrack | RemoteTrack) {
    if (track.kind !== Track.Kind.Audio) return;
    const media = track.mediaStreamTrack;
    if (!media || attached.has(media.id)) return;
    try {
      const ms = new MediaStream([media]);
      const node = audioCtx.createMediaStreamSource(ms);
      node.connect(dest);
      sources.push(node);
      attached.add(media.id);
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

  return {
    dest,
    audioCtx,
    sources,
    attachAudio,
    stop: () => {
      for (const s of sources) {
        try {
          s.disconnect();
        } catch {
          // ignore
        }
      }
      void audioCtx.close().catch(() => undefined);
    },
  };
}

async function requestDisplayStream(): Promise<MediaStream> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getDisplayMedia
  ) {
    throw new Error(DISPLAY_CAPTURE_DENIED);
  }

  const richConstraints = {
    video: {
      frameRate: 30,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    systemAudio: "include",
  } as DisplayMediaStreamOptions;

  try {
    return await navigator.mediaDevices.getDisplayMedia(richConstraints);
  } catch (err) {
    // Retry without Chromium-only flags (Firefox / Safari / older Chrome).
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      throw new Error(DISPLAY_CAPTURE_DENIED);
    }
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });
    } catch (fallbackErr) {
      if (
        fallbackErr instanceof DOMException &&
        (fallbackErr.name === "NotAllowedError" ||
          fallbackErr.name === "AbortError")
      ) {
        throw new Error(DISPLAY_CAPTURE_DENIED);
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(DISPLAY_CAPTURE_DENIED);
      }
      throw new Error(DISPLAY_CAPTURE_DENIED);
    }
  }
}

async function captureMeetingDisplay(
  room: Room,
  onDisplayEnded: () => void,
): Promise<{
  stream: MediaStream;
  stop: () => void;
}> {
  const display = await requestDisplayStream();
  const videoTrack = display.getVideoTracks()[0];
  if (!videoTrack) {
    for (const t of display.getTracks()) t.stop();
    throw new Error(DISPLAY_CAPTURE_DENIED);
  }

  const audioMix = mixLiveKitAudio(room);

  // Fold tab/system audio from display into the same mix (single audio track for MediaRecorder).
  for (const at of display.getAudioTracks()) {
    try {
      const node = audioMix.audioCtx.createMediaStreamSource(new MediaStream([at]));
      node.connect(audioMix.dest);
      audioMix.sources.push(node);
    } catch {
      // ignore
    }
  }

  const onTrackSubscribed = (track: RemoteTrack) => {
    audioMix.attachAudio(track);
  };
  const onLocalTrackPublished = (publication: {
    track?: LocalTrack;
  }) => {
    if (publication.track) audioMix.attachAudio(publication.track);
  };

  room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
  room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);

  const mixed = new MediaStream([
    videoTrack,
    ...audioMix.dest.stream.getAudioTracks(),
  ]);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
    audioMix.stop();
    for (const t of display.getTracks()) {
      try {
        t.stop();
      } catch {
        // ignore
      }
    }
  };

  videoTrack.addEventListener("ended", () => {
    stop();
    onDisplayEnded();
  });

  return { stream: mixed, stop };
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
  const [needsScreenCaptureConfirm, setNeedsScreenCaptureConfirm] =
    useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopMixRef = useRef<(() => void) | null>(null);
  const autoPromptShownRef = useRef(false);
  const stopRef = useRef<(opts?: { force?: boolean }) => Promise<void>>(
    async () => undefined,
  );

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

  const stopBrowserCapture = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const rec = recorderRef.current!;
        rec.onstop = () => resolve();
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
    }
    recorderRef.current = null;
    stopMixRef.current?.();
    stopMixRef.current = null;
  }, []);

  const rollbackServerRecording = useCallback(async () => {
    if (!meetingId) return;
    try {
      await fetch(`/api/meetings/${meetingId}/recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
    } catch {
      // ignore
    }
  }, [meetingId]);

  const start = useCallback(
    async (asAuto = false) => {
      if (!meetingId || !isHost || !config?.enabled) return;
      setBusy(true);
      setError(null);
      setNeedsScreenCaptureConfirm(false);

      let displayReady = false;
      let serverStarted = false;
      let published = false;

      try {
        // Capture first when browser engine so deny never creates a DB row.
        let pendingCapture: Awaited<
          ReturnType<typeof captureMeetingDisplay>
        > | null = null;

        if (config.engine === "browser") {
          if (!room) throw new Error("no_room");
          pendingCapture = await captureMeetingDisplay(room, () => {
            void stopRef.current({ force: true });
          });
          displayReady = true;
          stopMixRef.current = pendingCapture.stop;
        }

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
        serverStarted = true;
        const recording = data.recording as {
          id: string;
          status: string;
          engine: string;
        };

        if (recording.engine === "browser") {
          if (!pendingCapture) {
            throw new Error(DISPLAY_CAPTURE_DENIED);
          }
          const mimeType = pickMimeType();
          const recorder = new MediaRecorder(pendingCapture.stream, {
            mimeType,
            videoBitsPerSecond: 2_500_000,
          });
          recorderRef.current = recorder;
          recorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) {
              void uploadChunk(recording.id, ev.data);
            }
          };
          recorder.start(4000);
        } else {
          // Egress — discard unused display if somehow acquired.
          pendingCapture?.stop();
          stopMixRef.current = null;
        }

        setActive(recording);
        publishState({ recording: true, recordingId: recording.id });
        published = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (displayReady) {
          stopMixRef.current?.();
          stopMixRef.current = null;
          if (recorderRef.current) {
            try {
              recorderRef.current.stop();
            } catch {
              // ignore
            }
            recorderRef.current = null;
          }
        }
        if (serverStarted) {
          await rollbackServerRecording();
        }
        if (published) {
          setActive(null);
          publishState({ recording: false });
        }
        setError(message);
        // Re-show auto prompt if user denied during auto confirm.
        if (
          asAuto &&
          config.engine === "browser" &&
          message === DISPLAY_CAPTURE_DENIED
        ) {
          setNeedsScreenCaptureConfirm(true);
        }
      } finally {
        setBusy(false);
      }
    },
    [
      meetingId,
      isHost,
      config?.enabled,
      config?.engine,
      room,
      publishState,
      uploadChunk,
      rollbackServerRecording,
    ],
  );

  const stop = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!meetingId || !isHost) return;
      if (config?.controlMode === "auto" && !opts?.force) return;
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
    },
    [meetingId, isHost, config?.controlMode, publishState, stopBrowserCapture],
  );

  stopRef.current = stop;

  // Auto mode: egress can start silently; browser needs a user gesture for getDisplayMedia.
  useEffect(() => {
    if (!isHost || !config?.enabled || !meetingId || !room) return;
    if (config.controlMode !== "auto") return;
    if (room.state !== "connected") return;

    if (config.engine === "egress" && config.autoRecordingId) {
      if (autoPromptShownRef.current) return;
      autoPromptShownRef.current = true;
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
      if (autoPromptShownRef.current || active) return;
      autoPromptShownRef.current = true;
      setNeedsScreenCaptureConfirm(true);
    }
  }, [
    isHost,
    config,
    meetingId,
    room,
    room?.state,
    publishState,
    active,
  ]);

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
    needsScreenCaptureConfirm,
    canToggle: Boolean(
      isHost && config?.enabled && config.controlMode === "manual",
    ),
    showBadge: Boolean(config?.enabled && active),
    start: () => start(false),
    startAuto: () => start(true),
    stop: () => stop(),
  };
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
} from "@livekit/track-processors";
import {
  LocalParticipant,
  LocalVideoTrack,
  Participant,
  Room,
  RoomEvent,
  Track,
  type TrackPublication,
} from "livekit-client";
import type { MediaPrefs } from "@/lib/media-prefs-schema";
import { resolveCaptureDeviceId } from "@/hooks/useMeetingDevices";

export function canUseBackgroundEffects(): boolean {
  try {
    return supportsBackgroundProcessors();
  } catch {
    return false;
  }
}

function audioKey(prefs: MediaPrefs): string {
  return `${prefs.noiseSuppression}|${prefs.echoCancellation}|${prefs.autoGainControl}`;
}

function videoKey(prefs: MediaPrefs): string {
  return `${prefs.videoEffect}|${prefs.blurRadius}|${prefs.virtualBackgroundUrl ?? ""}`;
}

async function applyVideoEffect(
  track: LocalVideoTrack,
  processor: BackgroundProcessorWrapper,
  prefs: MediaPrefs,
) {
  if (prefs.videoEffect === "blur") {
    await processor.switchTo({
      mode: "background-blur",
      blurRadius: prefs.blurRadius,
    });
    return;
  }
  if (prefs.videoEffect === "virtual" && prefs.virtualBackgroundUrl) {
    await processor.switchTo({
      mode: "virtual-background",
      imagePath: prefs.virtualBackgroundUrl,
    });
    return;
  }
  await processor.switchTo({ mode: "disabled" });
}

async function ensureProcessor(
  track: LocalVideoTrack,
  processorRef: { current: BackgroundProcessorWrapper | null },
): Promise<BackgroundProcessorWrapper | null> {
  if (!canUseBackgroundEffects()) return null;
  if (processorRef.current) {
    if (track.getProcessor() !== processorRef.current) {
      await track.setProcessor(processorRef.current);
    }
    return processorRef.current;
  }
  const processor = BackgroundProcessor({ mode: "disabled" });
  await track.setProcessor(processor);
  processorRef.current = processor;
  return processor;
}

function getLocalCameraTrack(room: Room): LocalVideoTrack | null {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
  const track = pub?.track;
  if (track && track instanceof LocalVideoTrack) return track;
  return null;
}

/**
 * Apply account/browser media prefs to the local LiveKit camera + mic tracks.
 *
 * Important: do NOT republish the microphone on unrelated room events
 * (remote mute, etc.) — that tears down the audio track the captions agent
 * is subscribed to.
 */
export function useMeetingEffects(room: Room | null, prefs: MediaPrefs | null) {
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const audioKeyRef = useRef("");
  const videoKeyRef = useRef("");
  const applyingAudioRef = useRef(false);

  const syncVideo = useCallback(async (force = false) => {
    if (!room || !prefsRef.current) return;
    const track = getLocalCameraTrack(room);
    if (!track || track.isMuted) return;

    const key = videoKey(prefsRef.current);
    if (!force && key === videoKeyRef.current && track.getProcessor()) {
      return;
    }

    try {
      const processor = await ensureProcessor(track, processorRef);
      if (!processor) return;
      await applyVideoEffect(track, processor, prefsRef.current);
      videoKeyRef.current = key;
    } catch (err) {
      console.error("[openmeet] video effect failed", err);
    }
  }, [room]);

  const syncAudio = useCallback(async () => {
    if (!room || !prefsRef.current) return;
    const p = prefsRef.current;
    const key = audioKey(p);
    if (key === audioKeyRef.current) return;
    if (applyingAudioRef.current) return;

    const lp = room.localParticipant;
    // Wait until the user actually has the mic on — do not stamp the key
    // early or a later unmute will skip applying constraints.
    if (!lp.isMicrophoneEnabled) return;

    // First hydrate with default browser constraints: LiveKit already enabled
    // NS/EC/AGC. Republishing here would tear down the track the captions
    // agent is subscribed to — stamp and skip.
    if (
      !audioKeyRef.current &&
      p.noiseSuppression &&
      p.echoCancellation &&
      p.autoGainControl
    ) {
      audioKeyRef.current = key;
      return;
    }

    applyingAudioRef.current = true;
    const deviceId = resolveCaptureDeviceId(room, "audioinput");
    try {
      await lp.setMicrophoneEnabled(true, {
        deviceId,
        noiseSuppression: p.noiseSuppression,
        echoCancellation: p.echoCancellation,
        autoGainControl: p.autoGainControl,
      });
      audioKeyRef.current = key;
    } catch (err) {
      console.error("[openmeet] audio constraints failed", err);
    } finally {
      applyingAudioRef.current = false;
    }
  }, [room]);

  // Apply when prefs change (options UI / account hydrate).
  useEffect(() => {
    if (!room || !prefs) return;
    void syncVideo();
    void syncAudio();
  }, [
    room,
    prefs,
    prefs?.videoEffect,
    prefs?.blurRadius,
    prefs?.virtualBackgroundUrl,
    prefs?.noiseSuppression,
    prefs?.echoCancellation,
    prefs?.autoGainControl,
    syncVideo,
    syncAudio,
  ]);

  // Re-attach video processor only for local camera publish / device switch /
  // local unmute. Never restart mic from room-wide mute events.
  useEffect(() => {
    if (!room) return;

    const onLocalPublished = (pub: TrackPublication, participant: Participant) => {
      if (!(participant instanceof LocalParticipant)) return;
      if (pub.source === Track.Source.Camera) {
        videoKeyRef.current = "";
        void syncVideo(true);
      } else if (pub.source === Track.Source.Microphone) {
        // Fresh mic track — allow constraints to apply once.
        void syncAudio();
      }
    };

    const onLocalUnmuted = (
      pub: TrackPublication,
      participant: Participant,
    ) => {
      if (!(participant instanceof LocalParticipant)) return;
      if (pub.source === Track.Source.Camera) {
        void syncVideo(true);
      } else if (pub.source === Track.Source.Microphone) {
        void syncAudio();
      }
    };

    const onDeviceChanged = (kind: MediaDeviceKind) => {
      if (kind === "videoinput") {
        videoKeyRef.current = "";
        void syncVideo(true);
      }
      // audioinput switch is handled by LiveKit; only re-apply if prefs key
      // was never stamped (e.g. mic was off during hydrate).
      if (kind === "audioinput") {
        void syncAudio();
      }
    };

    room.on(RoomEvent.LocalTrackPublished, onLocalPublished);
    room.on(RoomEvent.TrackUnmuted, onLocalUnmuted);
    room.on(RoomEvent.ActiveDeviceChanged, onDeviceChanged);

    return () => {
      room.off(RoomEvent.LocalTrackPublished, onLocalPublished);
      room.off(RoomEvent.TrackUnmuted, onLocalUnmuted);
      room.off(RoomEvent.ActiveDeviceChanged, onDeviceChanged);
    };
  }, [room, syncVideo, syncAudio]);

  useEffect(() => {
    return () => {
      processorRef.current = null;
      if (!room) return;
      const track = getLocalCameraTrack(room);
      if (track) {
        void track.stopProcessor().catch(() => undefined);
      }
    };
  }, [room]);

  return {
    supported: canUseBackgroundEffects(),
    reapply: () => {
      videoKeyRef.current = "";
      // Do not clear audioKeyRef here — callers should change prefs to
      // re-apply audio, avoiding accidental mic republish.
      void syncVideo(true);
    },
  };
}

/** Build AudioCaptureOptions from prefs + device id (for MeetingRoom ensure-media). */
export function audioOptionsFromPrefs(
  prefs: MediaPrefs | null | undefined,
  deviceId?: string,
) {
  const base = prefs ?? {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
  };
  return {
    ...(deviceId ? { deviceId } : {}),
    noiseSuppression: base.noiseSuppression,
    echoCancellation: base.echoCancellation,
    autoGainControl: base.autoGainControl,
  };
}

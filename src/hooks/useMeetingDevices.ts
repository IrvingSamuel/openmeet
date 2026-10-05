"use client";

import { useCallback, useEffect, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

export type MeetingDeviceLists = {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
};

export type ActiveDeviceIds = {
  cameraId: string;
  micId: string;
  speakerId: string;
};

function supportsAudioOutput(): boolean {
  if (typeof HTMLMediaElement === "undefined") return false;
  return "setSinkId" in HTMLMediaElement.prototype;
}

function readActiveIds(room: Room): ActiveDeviceIds {
  return {
    cameraId: room.getActiveDevice("videoinput") ?? "",
    micId: room.getActiveDevice("audioinput") ?? "",
    speakerId: room.getActiveDevice("audiooutput") ?? "",
  };
}

async function enumerate(): Promise<MeetingDeviceLists> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
    return { cameras: [], mics: [], speakers: [] };
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === "videoinput"),
    mics: all.filter((d) => d.kind === "audioinput"),
    speakers: all.filter((d) => d.kind === "audiooutput"),
  };
}

/**
 * Enumerate and switch mic / camera / speaker during a LiveKit meeting.
 * Speaker switching requires `HTMLMediaElement.setSinkId` (not available on
 * Safari iOS); callers should hide the speaker UI when `speakerSupported` is false.
 */
export function useMeetingDevices(room: Room | null) {
  const [devices, setDevices] = useState<MeetingDeviceLists>({
    cameras: [],
    mics: [],
    speakers: [],
  });
  const [active, setActive] = useState<ActiveDeviceIds>({
    cameraId: "",
    micId: "",
    speakerId: "",
  });
  const [switching, setSwitching] = useState(false);
  const [speakerSupported] = useState(supportsAudioOutput);

  const refresh = useCallback(async () => {
    try {
      const next = await enumerate();
      setDevices(next);
    } catch {
      // Permission / platform quirks — keep last known list.
    }
    if (room) setActive(readActiveIds(room));
  }, [room]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!room) return;

    const onActiveChanged = (kind: MediaDeviceKind, deviceId: string) => {
      setActive((prev) => {
        if (kind === "videoinput") return { ...prev, cameraId: deviceId };
        if (kind === "audioinput") return { ...prev, micId: deviceId };
        if (kind === "audiooutput") return { ...prev, speakerId: deviceId };
        return prev;
      });
    };

    const onDeviceChange = () => {
      void refresh();
    };

    room.on(RoomEvent.ActiveDeviceChanged, onActiveChanged);
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    setActive(readActiveIds(room));

    return () => {
      room.off(RoomEvent.ActiveDeviceChanged, onActiveChanged);
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        onDeviceChange,
      );
    };
  }, [room, refresh]);

  const switchDevice = useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      if (!room || !deviceId) return;
      setSwitching(true);
      try {
        await room.switchActiveDevice(kind, deviceId);
        setActive(readActiveIds(room));
      } finally {
        setSwitching(false);
      }
    },
    [room],
  );

  const switchCamera = useCallback(
    (deviceId: string) => switchDevice("videoinput", deviceId),
    [switchDevice],
  );
  const switchMic = useCallback(
    (deviceId: string) => switchDevice("audioinput", deviceId),
    [switchDevice],
  );
  const switchSpeaker = useCallback(
    (deviceId: string) => {
      if (!speakerSupported) return Promise.resolve();
      return switchDevice("audiooutput", deviceId);
    },
    [switchDevice, speakerSupported],
  );

  return {
    devices,
    active,
    switching,
    speakerSupported,
    refresh,
    switchCamera,
    switchMic,
    switchSpeaker,
  };
}

/** Prefer LiveKit's current device, falling back to the lobby-chosen id. */
export function resolveCaptureDeviceId(
  room: Room,
  kind: "audioinput" | "videoinput",
  fallback?: string,
): string | undefined {
  const active = room.getActiveDevice(kind);
  if (active) return active;
  if (fallback) return fallback;
  return undefined;
}

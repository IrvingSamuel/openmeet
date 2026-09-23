"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";

export type ModerateAction = "mute" | "camera_off" | "remove";

/**
 * Soft mute / camera-off / remove via LiveKit RoomService.
 * After mute/camera_off the remote participant can re-enable tracks locally.
 */
export function useModerateParticipant(opts: {
  roomSlug?: string;
  meetingId?: string;
  enabled?: boolean;
}) {
  const { roomSlug, meetingId, enabled = true } = opts;
  const toast = useToast();
  const t = useTranslations("room.sidePanel");
  const tToast = useTranslations("common.toast");
  const tErrors = useTranslations("common.errors");
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null);

  const moderate = useCallback(
    async (identity: string, action: ModerateAction) => {
      if (!roomSlug || !enabled) return false;
      if (action === "remove") {
        const ok = window.confirm(t("removeConfirm"));
        if (!ok) return false;
      }
      setBusyIdentity(`${identity}:${action}`);
      try {
        const res = await fetch(
          `/api/meetings/by-slug/${encodeURIComponent(roomSlug)}/moderate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, identity, meetingId }),
          },
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toast.error(
            (json as { error?: string }).error || t("moderateFailed"),
          );
          return false;
        }
        if (action === "mute") toast.push(tToast("micMuted"));
        if (action === "camera_off") toast.push(tToast("cameraOff"));
        if (action === "remove") toast.push(tToast("participantRemoved"));
        return true;
      } catch {
        toast.error(tErrors("networkModerate"));
        return false;
      } finally {
        setBusyIdentity(null);
      }
    },
    [roomSlug, meetingId, enabled, toast, t, tToast, tErrors],
  );

  return { moderate, busyIdentity };
}

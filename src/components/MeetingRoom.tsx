"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useChat,
  useConnectionState,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import {
  ConnectionState,
  DisconnectReason,
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
  type AudioCaptureOptions,
  type RoomConnectOptions,
  type RoomOptions,
  type VideoCaptureOptions,
  type RemoteParticipant,
} from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useTranslations } from "next-intl";
import { cn, formatDuration } from "@/lib/utils";
import { disconnectOutcome, releaseLocalMedia, shouldExitMeeting } from "@/lib/leavePolicy";
import { diffJoinRequestAlerts } from "@/lib/joinRequestAlerts";
import { EASE_OUT_EXPO } from "@/components/motion/primitives";
import { Stage, type StageLayout } from "@/components/room/Stage";
import { ControlBar, type SidePanel as PanelKind } from "@/components/room/ControlBar";
import { SidePanel } from "@/components/room/SidePanel";
import { ReactionBurstOverlay } from "@/components/room/ReactionBurstOverlay";
import { CaptionsOverlay, useCaptions, useCopilotInsights } from "@/components/room/Captions";
import { Badge } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { LogoMark } from "@/components/layout/Logo";
import { IconCopy, IconCheck } from "@/components/ui/icons";
import { BrandBackdrop } from "@/components/brand/BrandBackdrop";
import { isAgentParticipant } from "@/lib/participants";
import { useIsLgUp } from "@/hooks/useMediaQuery";
import { announceRecordingChange, playJoinRequestChime, playParticipantLeftChime, playScreenShareChime } from "@/lib/recording-beep";
import { setMeetingSoundContext } from "@/lib/meeting-sounds";
import {
  DISPLAY_CAPTURE_DENIED,
  useMeetingRecorder,
  type RecordingClientConfig,
} from "@/hooks/useMeetingRecorder";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { useHandRaise } from "@/hooks/useHandRaise";
import { useRoomReactions } from "@/hooks/useRoomReactions";
import { useRoomVisibility } from "@/hooks/useRoomVisibility";
import { useRouter } from "@/i18n/navigation";
import type { BgAnimation } from "@/lib/brand";

type RoomRole = "host" | "participant" | "agent";

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: { pauseVideoInBackground: true },
  dynacast: false,
  disconnectOnPageLeave: false,
};

const CONNECT_OPTIONS: RoomConnectOptions = {
  autoSubscribe: true,
  peerConnectionTimeout: 45_000,
  websocketTimeout: 45_000,
};

const MAX_AUTO_RECONNECT = 2;
const AUTO_RECONNECT_DELAY_MS = 2000;

export type RefreshSessionResult = {
  token: string;
  serverUrl: string;
};

export function MeetingRoom({
  token,
  serverUrl,
  roomTitle,
  roomSlug,
  logoUrl,
  bgAnimation,
  patternUrl,
  patternTintActive,
  meetingId,
  role = "participant",
  recordingConfig = null,
  onLeave,
  onEndForAll,
  initialVideo = false,
  initialAudio = false,
  videoDeviceId,
  audioDeviceId,
  onRefreshSession,
}: {
  token: string;
  serverUrl: string;
  roomTitle?: string;
  roomSlug: string;
  logoUrl?: string | null;
  bgAnimation?: BgAnimation | null;
  patternUrl?: string | null;
  patternTintActive?: boolean;
  meetingId?: string;
  role?: RoomRole;
  recordingConfig?: RecordingClientConfig | null;
  onLeave?: () => void;
  onEndForAll?: () => void | Promise<void>;
  initialVideo?: boolean;
  initialAudio?: boolean;
  videoDeviceId?: string;
  audioDeviceId?: string;
  onRefreshSession?: () => Promise<RefreshSessionResult | null>;
}) {
  const toast = useToast();
  const intentionalLeave = useRef(false);
  const onLeaveRef = useRef(onLeave);
  const toastRef = useRef(toast);
  onLeaveRef.current = onLeave;
  toastRef.current = toast;

  useEffect(() => {
    setMeetingSoundContext(true);
    return () => setMeetingSoundContext(false);
  }, []);

  // One Room for the lifetime of this mount — prevents the ~15s
  // CLIENT_REQUEST_LEAVE loop caused by recreating Room / re-calling connect
  // when unstable callback identities re-trigger useLiveKitRoom effects.
  const [room] = useState(() => new Room(ROOM_OPTIONS));
  const [connect, setConnect] = useState(true);
  const [activeToken, setActiveToken] = useState(token);
  const [activeServerUrl, setActiveServerUrl] = useState(serverUrl);
  const [autoReconnectBusy, setAutoReconnectBusy] = useState(false);
  const autoReconnectAttempts = useRef(0);
  const onRefreshSessionRef = useRef(onRefreshSession);
  onRefreshSessionRef.current = onRefreshSession;
  const [forcedExit, setForcedExit] = useState<"ended" | "removed" | null>(
    null,
  );

  useEffect(() => {
    return () => {
      // Do NOT set intentionalLeave here — React remounts / LiveKitRoom cleanup
      // must not navigate the user to the dashboard as a "leave".
      void releaseLocalMedia(room).finally(() => {
        void room.disconnect(true);
      });
    };
  }, [room]);

  const video = useMemo<boolean | VideoCaptureOptions>(() => {
    if (!initialVideo) return false;
    return videoDeviceId ? { deviceId: videoDeviceId } : true;
  }, [initialVideo, videoDeviceId]);

  const audio = useMemo<boolean | AudioCaptureOptions>(() => {
    if (!initialAudio) return false;
    return audioDeviceId ? { deviceId: audioDeviceId } : true;
  }, [initialAudio, audioDeviceId]);

  const finishLeave = useCallback(() => {
    if (
      shouldExitMeeting({ intentionalLeave: intentionalLeave.current }) ===
      "leave"
    ) {
      onLeaveRef.current?.();
    }
  }, []);

  const tRoom = useTranslations("room");
  const tErrors = useTranslations("common.errors");

  useEffect(() => {
    setActiveToken(token);
    setActiveServerUrl(serverUrl);
  }, [token, serverUrl]);

  const performReconnect = useCallback(async () => {
    intentionalLeave.current = false;
    setForcedExit(null);

    let nextToken = activeToken;
    let nextServerUrl = activeServerUrl;

    const refreshed = await onRefreshSessionRef.current?.();
    if (refreshed?.token) {
      nextToken = refreshed.token;
      nextServerUrl = refreshed.serverUrl || serverUrl;
      setActiveToken(nextToken);
      setActiveServerUrl(nextServerUrl);
    }

    try {
      await room.connect(nextServerUrl, nextToken, CONNECT_OPTIONS);
      setConnect(true);
      return true;
    } catch (err) {
      console.error("[openmeet] reconnect failed", err);
      toastRef.current.error(tErrors("reconnectFailed"));
      return false;
    }
  }, [room, activeToken, activeServerUrl, serverUrl, tErrors]);

  const scheduleAutoReconnect = useCallback(() => {
    if (intentionalLeave.current) return;

    const run = async (attempt: number) => {
      const roomState = () => room.state;
      if (attempt > MAX_AUTO_RECONNECT) {
        setAutoReconnectBusy(false);
        return;
      }
      if (roomState() === ConnectionState.Connected) {
        setAutoReconnectBusy(false);
        return;
      }
      setAutoReconnectBusy(true);
      await new Promise((resolve) =>
        window.setTimeout(resolve, AUTO_RECONNECT_DELAY_MS),
      );
      if (intentionalLeave.current || roomState() === ConnectionState.Connected) {
        setAutoReconnectBusy(false);
        return;
      }
      const ok = await performReconnect();
      if (ok || roomState() === ConnectionState.Connected) {
        autoReconnectAttempts.current = 0;
        setAutoReconnectBusy(false);
        return;
      }
      await run(attempt + 1);
    };

    autoReconnectAttempts.current = 0;
    void run(1);
  }, [performReconnect, room]);

  useEffect(() => {
    const onConnected = () => {
      autoReconnectAttempts.current = 0;
      setAutoReconnectBusy(false);
    };
    room.on(RoomEvent.Connected, onConnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
    };
  }, [room]);

  const requestLeave = useCallback(() => {
    if (intentionalLeave.current) return;
    intentionalLeave.current = true;
    setConnect(false);
    void (async () => {
      try {
        await releaseLocalMedia(room);
        await room.disconnect(true);
      } catch (err) {
        console.error("[openmeet] leave disconnect failed", err);
      } finally {
        finishLeave();
      }
    })();
  }, [room, finishLeave]);

  const requestEndForAll = useCallback(() => {
    if (intentionalLeave.current) return;
    intentionalLeave.current = true;
    setConnect(false);
    void (async () => {
      try {
        // Await deleteRoom (via parent) BEFORE local teardown / navigation so
        // other participants receive ROOM_DELETED instead of staying connected.
        await Promise.resolve(onEndForAll?.());
      } catch (err) {
        console.error("[openmeet] end for all failed", err);
        intentionalLeave.current = false;
        setConnect(true);
        toastRef.current.error(tRoom("endForAllFailed"));
        return;
      }
      try {
        await releaseLocalMedia(room);
        await room.disconnect(true);
      } catch (err) {
        console.error("[openmeet] end disconnect failed", err);
      }
    })();
  }, [room, onEndForAll, tRoom]);

  useEffect(() => {
    const onDisconnected = (reason?: DisconnectReason) => {
      const outcome = disconnectOutcome({
        intentionalLeave: intentionalLeave.current,
        reason,
      });
      if (outcome === "ended" || outcome === "removed") {
        setForcedExit(outcome);
        setConnect(false);
        return;
      }
      if (intentionalLeave.current) {
        finishLeave();
        return;
      }
      if (reason != null && reason !== DisconnectReason.CLIENT_INITIATED) {
        toastRef.current.push(tRoom("disconnectNotice"));
      }
      scheduleAutoReconnect();
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room, finishLeave, scheduleAutoReconnect, tRoom]);

  // Stable forever — must not appear as a changing dep inside useLiveKitRoom.
  const handleDisconnected = useCallback(() => {
    // Intentional leave / forced exit handled elsewhere.
  }, []);

  const handleMediaDeviceFailure = useCallback((failure?: unknown) => {
    const label =
      failure != null ? String(failure) : tRoom("mediaUnavailable");
    toastRef.current.error(tRoom("mediaDeviceError", { label }));
  }, [tRoom]);

  const handleError = useCallback((err: Error) => {
    console.error("[openmeet] LiveKit error", err);
    toastRef.current.error(err.message || tErrors("connectionError"));
  }, [tErrors]);

  const handleReconnect = useCallback(() => {
    autoReconnectAttempts.current = 0;
    setAutoReconnectBusy(true);
    void performReconnect().finally(() => setAutoReconnectBusy(false));
  }, [performReconnect]);

  return (
    <div
      className="relative h-[100svh] w-full overflow-hidden bg-[var(--brand-bg-solid)]"
      data-lk-theme="default"
    >
      <BrandBackdrop
        animation={bgAnimation || "none"}
        patternUrl={patternUrl}
        patternTintActive={patternTintActive}
        intensity={0.45}
      />
      <LiveKitRoom
        room={room}
        token={activeToken}
        serverUrl={activeServerUrl}
        connect={connect}
        video={video}
        audio={audio}
        connectOptions={CONNECT_OPTIONS}
        onDisconnected={handleDisconnected}
        onMediaDeviceFailure={handleMediaDeviceFailure}
        onError={handleError}
        className="relative z-[1] h-full"
      >
        <RoomShell
          roomTitle={roomTitle}
          roomSlug={roomSlug}
          logoUrl={logoUrl}
          meetingId={meetingId}
          isHost={role === "host"}
          recordingConfig={recordingConfig}
          forcedExit={forcedExit}
          onLeave={requestLeave}
          onEndForAll={requestEndForAll}
          onReconnect={handleReconnect}
          onConfirmLeave={requestLeave}
          autoReconnectBusy={autoReconnectBusy}
          wantVideo={!!initialVideo}
          wantAudio={!!initialAudio}
          videoDeviceId={videoDeviceId}
          audioDeviceId={audioDeviceId}
          leavingRef={intentionalLeave}
        />
        <RoomAudioRenderer />
        <StartAudioLabel />
      </LiveKitRoom>
    </div>
  );
}


function StartAudioLabel() {
  const t = useTranslations("room");
  return <StartAudio label={t("enableAudio")} />;
}

function RoomShell({
  roomTitle,
  roomSlug,
  logoUrl,
  meetingId,
  isHost,
  recordingConfig,
  forcedExit,
  onLeave,
  onEndForAll,
  onReconnect,
  onConfirmLeave,
  autoReconnectBusy = false,
  wantVideo,
  wantAudio,
  videoDeviceId,
  audioDeviceId,
  leavingRef,
}: {
  roomTitle?: string;
  roomSlug: string;
  logoUrl?: string | null;
  meetingId?: string;
  isHost: boolean;
  recordingConfig: RecordingClientConfig | null;
  forcedExit: "ended" | "removed" | null;
  onLeave: () => void;
  onEndForAll: () => void | Promise<void>;
  onReconnect: () => void;
  onConfirmLeave: () => void;
  autoReconnectBusy?: boolean;
  wantVideo: boolean;
  wantAudio: boolean;
  videoDeviceId?: string;
  audioDeviceId?: string;
  leavingRef: MutableRefObject<boolean>;
}) {
  const room = useRoomContext();
  const state = useConnectionState();
  const participants = useParticipants();
  const toast = useToast();
  const t = useTranslations("room");
  const tLabels = useTranslations("common.labels");
  const tToast = useTranslations("common.toast");
  const isLgUp = useIsLgUp();
  // Cleared on tab-return so reconnect backup does not re-open mic/cam.
  const [mediaWanted, setMediaWanted] = useState({
    video: wantVideo,
    audio: wantAudio,
  });
  const recorder = useMeetingRecorder({
    room,
    meetingId,
    isHost,
    config: recordingConfig,
  });

  const {
    requests: joinRequests,
    busyId: joinBusyId,
    decide: decideJoin,
  } = useJoinRequests(roomSlug, isHost);

  const { raisedIdentities, localHandRaised, toggleHand } = useHandRaise(room);

  const { bursts: reactionBursts, sendReaction } = useRoomReactions();

  const knownJoinIds = useRef<Set<string>>(new Set());
  const joinAlertsReady = useRef(false);

  useEffect(() => {
    if (recorder.error) {
      toast.error(
        recorder.error === DISPLAY_CAPTURE_DENIED
          ? t("recordingScreenDenied")
          : recorder.error,
      );
    }
  }, [recorder.error, toast, t]);

  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (recorder.active && !wasRecordingRef.current) {
      const msg = t("recordingStarted");
      toast.success(msg);
      announceRecordingChange("start", msg);
    } else if (!recorder.active && wasRecordingRef.current) {
      const msg = t("recordingStopped");
      toast.success(msg);
      announceRecordingChange("stop", msg);
    }
    wasRecordingRef.current = recorder.active;
  }, [recorder.active, toast, t]);
  const [panel, setPanel] = useState<PanelKind>("none");
  const captions = useCaptions(meetingId);
  const {
    insights,
    loading: insightsLoading,
    fromCache: insightsFromCache,
    regenCount: insightsRegenCount,
    refreshInsights,
  } = useCopilotInsights(meetingId, panel === "copilot");
  const { chatMessages, send, isSending } = useChat();
  const [historyMessages, setHistoryMessages] = useState<
    import("@livekit/components-react").ReceivedChatMessage[]
  >([]);

  const humans = useMemo(
    () => participants.filter((p) => !isAgentParticipant(p)),
    [participants],
  );

  const [layout, setLayout] = useState<StageLayout>("grid");
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  function handlePin(key: string | null) {
    setPinnedKey(key);
    if (key) setLayout("spotlight");
  }

  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const hasScreenShare = screenShareTracks.some((t) => t.publication);
  const prevHasScreenShare = useRef(false);
  useEffect(() => {
    if (hasScreenShare && !prevHasScreenShare.current) {
      setLayout("spotlight");
      playScreenShareChime();
    } else if (!hasScreenShare && prevHasScreenShare.current) {
      setLayout("grid");
    }
    prevHasScreenShare.current = hasScreenShare;
  }, [hasScreenShare]);

  const [captionsOn, setCaptionsOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const [readChat, setReadChat] = useState(0);
  const hasConnectedOnce = useRef(false);
  const mediaEnsureGen = useRef(0);
  const prevChatLen = useRef(0);

  // Hydrate chat history for late joiners
  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    fetch(`/api/meetings/chat?meetingId=${encodeURIComponent(meetingId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.messages) return;
        const seeded = (
          json.messages as Array<{
            id: string;
            body: string;
            displayName: string;
            livekitIdentity: string;
            createdAt: string;
          }>
        ).map((m) => ({
          id: m.id,
          message: m.body,
          timestamp: new Date(m.createdAt).getTime(),
          from: {
            identity: m.livekitIdentity,
            name: m.displayName,
            isLocal: false,
          },
        })) as import("@livekit/components-react").ReceivedChatMessage[];
        setHistoryMessages(seeded);
        setReadChat(seeded.length);
        prevChatLen.current = seeded.length;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const allChatMessages = useMemo(() => {
    const liveIds = new Set(chatMessages.map((m) => m.id));
    const hist = historyMessages.filter((m) => !liveIds.has(m.id));
    return [...hist, ...chatMessages];
  }, [historyMessages, chatMessages]);

  const unread = Math.max(0, allChatMessages.length - readChat);

  const handleChatRead = useCallback(() => {
    setReadChat(allChatMessages.length);
  }, [allChatMessages.length]);
  const showRecovery =
    state === ConnectionState.Disconnected &&
    !forcedExit &&
    !leavingRef.current &&
    !autoReconnectBusy;

  // Join request chime always; toast when People panel is closed
  useEffect(() => {
    if (!isHost) return;
    const isInitial = !joinAlertsReady.current;
    joinAlertsReady.current = true;

    const { nextKnownIds, toNotify } = diffJoinRequestAlerts({
      prevKnownIds: knownJoinIds.current,
      currentRequests: joinRequests,
      isInitial,
    });
    knownJoinIds.current = nextKnownIds;
    if (toNotify.length === 0) return;

    playJoinRequestChime();
    if (panel === "people") return;

    if (toNotify.length === 1) {
      toast.push(tToast("joinRequest", { name: toNotify[0].displayName }));
    } else {
      toast.push(tToast("joinRequestMany", { count: toNotify.length }));
    }
  }, [joinRequests, panel, isHost, toast, tToast]);

  const pendingLeaveAlerts = useRef<Map<string, number>>(new Map());

  // Participant left toast + chime (debounced to ignore brief reconnects)
  useEffect(() => {
    if (state !== ConnectionState.Connected) return;

    const scheduleLeaveAlert = (participant: RemoteParticipant) => {
      if (leavingRef.current) return;
      if (isAgentParticipant(participant)) return;
      const identity = participant.identity;
      const name =
        participant.name || participant.identity || tLabels("someone");

      const existing = pendingLeaveAlerts.current.get(identity);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        pendingLeaveAlerts.current.delete(identity);
        if (leavingRef.current) return;
        playParticipantLeftChime();
        toast.push(tToast("participantLeft", { name }));
      }, 3000);

      pendingLeaveAlerts.current.set(identity, timer);
    };

    const onConnected = (participant: RemoteParticipant) => {
      const timer = pendingLeaveAlerts.current.get(participant.identity);
      if (timer) {
        window.clearTimeout(timer);
        pendingLeaveAlerts.current.delete(participant.identity);
      }
    };

    const onLeft = (participant: RemoteParticipant) => {
      scheduleLeaveAlert(participant);
    };

    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    room.on(RoomEvent.ParticipantConnected, onConnected);
    return () => {
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
      room.off(RoomEvent.ParticipantConnected, onConnected);
      for (const timer of pendingLeaveAlerts.current.values()) {
        window.clearTimeout(timer);
      }
      pendingLeaveAlerts.current.clear();
    };
  }, [room, state, toast, tToast, tLabels, leavingRef]);

  // Chat toast when panel closed
  useEffect(() => {
    if (allChatMessages.length <= prevChatLen.current) {
      prevChatLen.current = allChatMessages.length;
      return;
    }
    const latest = allChatMessages[allChatMessages.length - 1];
    prevChatLen.current = allChatMessages.length;
    if (panel === "chat" || latest?.from?.isLocal) return;
    const name = latest?.from?.name || latest?.from?.identity || tLabels("someone");
    toast.push(
      tToast("chatMessage", {
        name,
        message: (latest?.message || "").slice(0, 80),
      }),
    );
  }, [allChatMessages, panel, toast, tLabels, tToast]);

  async function sendChat(message: string) {
    await send(message);
    if (meetingId) {
      const lp = room.localParticipant;
      void fetch("/api/meetings/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          body: message,
          displayName: lp.name || lp.identity,
          livekitIdentity: lp.identity,
        }),
      }).catch(() => undefined);
    }
  }

  // Backup publisher: useLiveKitRoom only enables devices on SignalConnected.
  // After reconnect / DUPLICATE_IDENTITY races, that event can be missed and
  // the room stays Connected with cam/mic off. Respects mediaWanted so a
  // privacy mute on tab-return is not undone by reconnect.
  useEffect(() => {
    if (state !== ConnectionState.Connected) return;
    if (leavingRef.current) return;
    const gen = ++mediaEnsureGen.current;
    const lp = room.localParticipant;
    const videoOpts = videoDeviceId ? { deviceId: videoDeviceId } : undefined;
    const audioOpts = audioDeviceId ? { deviceId: audioDeviceId } : undefined;

    void (async () => {
      try {
        if (leavingRef.current || gen !== mediaEnsureGen.current) return;
        if (mediaWanted.audio && !lp.isMicrophoneEnabled) {
          await lp.setMicrophoneEnabled(true, audioOpts);
          if (gen !== mediaEnsureGen.current) {
            await lp.setMicrophoneEnabled(false);
            return;
          }
        }
        if (leavingRef.current || gen !== mediaEnsureGen.current) return;
        if (mediaWanted.video && !lp.isCameraEnabled) {
          await lp.setCameraEnabled(true, videoOpts);
          if (gen !== mediaEnsureGen.current) {
            await lp.setCameraEnabled(false);
          }
        }
      } catch (err) {
        console.error("[openmeet] ensure media failed", err);
      }
    })();
  }, [
    state,
    room,
    mediaWanted.audio,
    mediaWanted.video,
    videoDeviceId,
    audioDeviceId,
    leavingRef,
  ]);

  const muteLocalMediaForPrivacy = useCallback(() => {
    if (leavingRef.current) return;
    setMediaWanted({ video: false, audio: false });
    mediaEnsureGen.current += 1;
    const lp = room.localParticipant;
    void (async () => {
      try {
        await Promise.allSettled([
          lp.setMicrophoneEnabled(false),
          lp.setCameraEnabled(false),
        ]);
      } catch (err) {
        console.error("[openmeet] privacy mute failed", err);
      }
    })();
  }, [room, leavingRef]);

  // Keep reconnect backup in sync with in-call toggles after a privacy mute.
  useEffect(() => {
    const lp = room.localParticipant;
    const sync = () => {
      setMediaWanted({
        video: lp.isCameraEnabled,
        audio: lp.isMicrophoneEnabled,
      });
    };
    lp.on(ParticipantEvent.TrackMuted, sync);
    lp.on(ParticipantEvent.TrackUnmuted, sync);
    lp.on(ParticipantEvent.LocalTrackPublished, sync);
    lp.on(ParticipantEvent.LocalTrackUnpublished, sync);
    return () => {
      lp.off(ParticipantEvent.TrackMuted, sync);
      lp.off(ParticipantEvent.TrackUnmuted, sync);
      lp.off(ParticipantEvent.LocalTrackPublished, sync);
      lp.off(ParticipantEvent.LocalTrackUnpublished, sync);
    };
  }, [room]);

  useRoomVisibility(room, () => {
    muteLocalMediaForPrivacy();
    toast.push(t("backToMeeting"));
  });

  useEffect(() => {
    if (state === ConnectionState.Connected) hasConnectedOnce.current = true;
  }, [state]);

  useEffect(() => {
    if (panel === "chat") setReadChat(allChatMessages.length);
  }, [panel, allChatMessages.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "m") {
        e.preventDefault();
        room.localParticipant.setMicrophoneEnabled(
          !room.localParticipant.isMicrophoneEnabled,
        );
      } else if (key === "v") {
        e.preventDefault();
        room.localParticipant.setCameraEnabled(
          !room.localParticipant.isCameraEnabled,
        );
      } else if (key === "g") {
        setLayout((l) => (l === "grid" ? "spotlight" : "grid"));
      } else if (key === "c") {
        setCaptionsOn((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <InitialConnectOverlay
        state={state}
        logoUrl={logoUrl}
        hasConnectedOnce={hasConnectedOnce.current}
      />
      <ReconnectBanner state={state} hasConnectedOnce={hasConnectedOnce.current} />
      <ForcedExitOverlay
        kind={forcedExit}
        roomSlug={roomSlug}
        meetingId={meetingId}
        onLeave={onConfirmLeave}
      />
      <DisconnectRecovery
        open={showRecovery}
        onReconnect={onReconnect}
        onLeave={onConfirmLeave}
      />

      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-3 pt-safe sm:px-4">
        <div className="flex min-w-0 items-center gap-2 pt-3 sm:gap-3 sm:pt-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-8 max-w-[100px] object-contain sm:max-w-[140px]"
            />
          ) : (
            <LogoMark className="h-8 w-8" animated={false} />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium tracking-tight text-ink">
              {roomTitle || room.name}
              {isHost ? (
                <span className="ml-2 hidden text-[11px] font-normal text-ink-faint sm:inline">
                  · {tLabels("host")}
                </span>
              ) : null}
            </p>
            <MeetingClock />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 sm:pt-4">
          {recorder.active ? (
            <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full border border-rose-500/50 bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.35)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
              </span>
              REC
            </span>
          ) : null}
          <ConnectionBadge state={state} count={humans.length} />
          <button
            onClick={copyLink}
            aria-label={t("copyMeetingLink")}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white/[0.05] text-ink-muted transition-colors hover:text-ink"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? "ok" : "copy"}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.16 }}
              >
                {copied ? (
                  <IconCheck className="h-4 w-4 text-emerald-300" />
                ) : (
                  <IconCopy className="h-4 w-4" />
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </header>

      <main className="relative z-10 isolate flex min-h-0 flex-1 gap-3 p-2 sm:p-4">
        <div className="relative min-w-0 flex-1">
          <Stage
            layout={layout}
            pinnedKey={pinnedKey}
            onPin={handlePin}
            raisedIdentities={raisedIdentities}
          />
          <ReactionBurstOverlay bursts={reactionBursts} />
          <CaptionsOverlay captions={captions} visible={captionsOn} />
          {!isLgUp ? (
            <SidePanel
              panel={panel}
              overlay
              roomSlug={roomSlug}
              meetingId={meetingId}
              isHost={isHost}
              captions={captions}
              insights={insights}
              insightsLoading={insightsLoading}
              insightsFromCache={insightsFromCache}
              insightsRegenCount={insightsRegenCount}
              onRefreshInsights={refreshInsights}
              chatMessages={allChatMessages}
              sendChat={sendChat}
              chatSending={isSending}
              onClose={() => setPanel("none")}
              onChatRead={handleChatRead}
              copilotDisplayName={
                room.localParticipant.name || room.localParticipant.identity
              }
              copilotIdentity={room.localParticipant.identity}
              joinRequests={joinRequests}
              joinBusyId={joinBusyId}
              onJoinDecide={decideJoin}
              raisedIdentities={raisedIdentities}
            />
          ) : null}
        </div>

        {isLgUp ? (
          <SidePanel
            panel={panel}
            roomSlug={roomSlug}
            meetingId={meetingId}
            isHost={isHost}
            captions={captions}
            insights={insights}
            insightsLoading={insightsLoading}
            insightsFromCache={insightsFromCache}
            insightsRegenCount={insightsRegenCount}
            onRefreshInsights={refreshInsights}
            chatMessages={allChatMessages}
            sendChat={sendChat}
            chatSending={isSending}
            onClose={() => setPanel("none")}
            onChatRead={handleChatRead}
            copilotDisplayName={
              room.localParticipant.name || room.localParticipant.identity
            }
            copilotIdentity={room.localParticipant.identity}
            joinRequests={joinRequests}
            joinBusyId={joinBusyId}
            onJoinDecide={decideJoin}
            raisedIdentities={raisedIdentities}
          />
        ) : null}
      </main>

      {/* Controls stay above the video stage — isolation keeps <video> compositing contained */}
      <div className="pointer-events-none relative z-50 flex shrink-0 justify-center px-2 pb-safe">
        <div className="pointer-events-auto pb-3 sm:pb-5">
          <ControlBar
            layout={layout}
            onLayoutChange={setLayout}
            panel={panel}
            onPanelChange={setPanel}
            captionsOn={captionsOn}
            onCaptionsToggle={() => setCaptionsOn((v) => !v)}
            unreadChat={unread}
            peopleCount={humans.length}
            pendingJoinRequests={joinRequests.length}
            insightCount={insights.length}
            isHost={isHost}
            recordingActive={recorder.active}
            recordingBusy={recorder.busy}
            canToggleRecording={recorder.canToggle}
            onToggleRecording={() => {
              if (recorder.active) void recorder.stop();
              else void recorder.start();
            }}
            onLeave={onLeave}
            onEndForAll={onEndForAll}
            handRaised={localHandRaised}
            onToggleHand={toggleHand}
            onSendReaction={sendReaction}
          />
        </div>
      </div>

      <AnimatePresence>
        {recorder.needsScreenCaptureConfirm ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[55] grid place-items-center bg-[var(--brand-bg)]/92 px-6 backdrop-blur-xl"
          >
            <div className="w-full max-w-md rounded-3xl glass-strong p-8 text-center shadow-lift">
              <h2 className="text-xl font-semibold tracking-tight">
                {t("recordingScreenPromptCta")}
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                {t("recordingScreenPrompt")}
              </p>
              <div className="mt-7 flex justify-center">
                <Button
                  size="lg"
                  loading={recorder.busy}
                  onClick={() => void recorder.startAuto()}
                >
                  {t("recordingScreenPromptCta")}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Full-screen only on the very first connect — never during mid-call reconnect. */
function InitialConnectOverlay({
  state,
  logoUrl,
  hasConnectedOnce,
}: {
  state: ConnectionState;
  logoUrl?: string | null;
  hasConnectedOnce: boolean;
}) {
  const t = useTranslations("meta");
  const show =
    !hasConnectedOnce &&
    (state === ConnectionState.Connecting ||
      state === ConnectionState.SignalReconnecting);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(16px)" }}
          transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
          className="absolute inset-0 z-40 grid place-items-center bg-[var(--brand-bg)]/92 backdrop-blur-xl"
        >
          <div className="flex flex-col items-center gap-5">
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="relative"
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-14 object-contain" />
              ) : (
                <LogoMark className="h-14 w-14" />
              )}
              <span
                aria-hidden
                className={cn(
                  "absolute -inset-6 rounded-full border border-brand-secondary/40",
                  "animate-pulse-ring",
                )}
              />
            </motion.div>
            <p className="text-sm text-ink-muted">
              {t("establishingConnection")}
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Non-blocking chip — controls remain usable while the SDK recovers. */
function ReconnectBanner({
  state,
  hasConnectedOnce,
}: {
  state: ConnectionState;
  hasConnectedOnce: boolean;
}) {
  const t = useTranslations("room");
  const recovering =
    hasConnectedOnce &&
    (state === ConnectionState.Reconnecting ||
      state === ConnectionState.SignalReconnecting ||
      state === ConnectionState.Connecting);

  return (
    <AnimatePresence>
      {recovering ? (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="pointer-events-none absolute inset-x-0 top-16 z-50 flex justify-center px-4"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-4 py-2 text-xs font-medium text-amber-100 backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
            {t("reconnectBanner")}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ForcedExitOverlay({
  kind,
  roomSlug,
  meetingId,
  onLeave,
}: {
  kind: "ended" | "removed" | null;
  roomSlug: string;
  meetingId?: string;
  onLeave: () => void;
}) {
  const t = useTranslations("room.forcedExit");
  const tActions = useTranslations("common.actions");
  const router = useRouter();
  const summaryHref =
    kind === "ended" && meetingId
      ? `/m/${roomSlug}/summary?meetingId=${meetingId}`
      : null;

  return (
    <AnimatePresence>
      {kind ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] grid place-items-center bg-[var(--brand-bg)]/92 px-6 backdrop-blur-xl"
        >
          <div className="w-full max-w-md rounded-3xl glass-strong p-8 text-center shadow-lift">
            <h2 className="text-xl font-semibold tracking-tight">
              {kind === "ended" ? t("endedTitle") : t("removedTitle")}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {kind === "ended" ? t("endedBody") : t("removedBody")}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {summaryHref ? (
                <Button
                  size="lg"
                  onClick={() => {
                    router.push(summaryHref);
                  }}
                >
                  {t("viewSummary")}
                </Button>
              ) : null}
              <Button
                size="lg"
                variant={summaryHref ? "outline" : undefined}
                onClick={onLeave}
              >
                {tActions("leave")}
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DisconnectRecovery({
  open,
  onReconnect,
  onLeave,
}: {
  open: boolean;
  onReconnect: () => void;
  onLeave: () => void;
}) {
  const t = useTranslations("room.disconnectRecovery");
  const tActions = useTranslations("common.actions");
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] grid place-items-center bg-[var(--brand-bg)]/92 px-6 backdrop-blur-xl"
        >
          <div className="w-full max-w-md rounded-3xl glass-strong p-8 text-center shadow-lift">
            <h2 className="text-xl font-semibold tracking-tight">
              {t("title")}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {t("body")}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={onReconnect}>
                {tActions("reconnect")}
              </Button>
              <Button size="lg" variant="outline" onClick={onLeave}>
                {tActions("leave")}
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MeetingClock() {
  const [start] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [start]);
  return (
    <p className="font-mono text-[11px] tabular-nums text-ink-faint">
      {formatDuration(elapsed)}
    </p>
  );
}

function ConnectionBadge({
  state,
  count,
}: {
  state: ConnectionState;
  count: number;
}) {
  const tBadges = useTranslations("common.badges");
  const map: Record<
    string,
    { label: string; tone: "success" | "warn" | "danger" }
  > = {
    [ConnectionState.Connected]: { label: tBadges("live"), tone: "success" },
    [ConnectionState.Connecting]: { label: tBadges("connecting"), tone: "warn" },
    [ConnectionState.Reconnecting]: { label: tBadges("reconnecting"), tone: "warn" },
    [ConnectionState.Disconnected]: { label: tBadges("disconnected"), tone: "danger" },
    [ConnectionState.SignalReconnecting]: {
      label: tBadges("reconnecting"),
      tone: "warn",
    },
  };
  const info = map[state] ?? { label: "—", tone: "warn" as const };
  return (
    <>
      <Badge tone={info.tone} pulse className="hidden sm:inline-flex">
        {info.label} · {count}
      </Badge>
      <Badge tone={info.tone} pulse className="inline-flex sm:hidden">
        {count}
      </Badge>
    </>
  );
}

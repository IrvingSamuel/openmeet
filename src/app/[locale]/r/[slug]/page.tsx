"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { Lobby, type JoinOptions } from "@/components/Lobby";
import { MeetingRoom } from "@/components/MeetingRoom";
import { brandStyleString, type BrandTokens } from "@/lib/brand";
import { Aurora } from "@/components/motion/primitives";
import { LogoMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";

type RoomPayload = {
  room: { id: string; slug: string; title: string; accessPolicy: string };
  brand: (BrandTokens & { customCss?: string | null }) | null;
};

type Session = {
  token: string;
  serverUrl: string;
  meetingId?: string;
  role: "host" | "participant" | "agent";
  video: boolean;
  audio: boolean;
  videoDeviceId?: string;
  audioDeviceId?: string;
  recording?: {
    enabled: boolean;
    engine: "egress" | "browser";
    controlMode: "manual" | "auto";
    autoRecordingId?: string | null;
  } | null;
};

function tabInstanceId() {
  const existing = window.sessionStorage.getItem("chronos-meet:tab-id");
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  window.sessionStorage.setItem("chronos-meet:tab-id", id);
  return id;
}

export default function RoomPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const tErrors = useTranslations("lobby.errors");
  const slug = params.slug;

  const [data, setData] = useState<RoomPayload | null>(null);
  const [me, setMe] = useState<{ isLoggedIn: boolean; name?: string }>({
    isLoggedIn: false,
  });
  const [session, setSession] = useState<Session | null>(null);
  const [joining, setJoining] = useState(false);
  const [waitingRequestId, setWaitingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const meetingIdRef = useRef<string | undefined>(undefined);
  const pendingJoinOpts = useRef<JoinOptions | null>(null);
  const consumingApprovalRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled) setMe(payload);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!data?.brand) return;
    document.documentElement.style.cssText = brandStyleString(data.brand);
    return () => {
      document.documentElement.style.cssText = "";
    };
  }, [data]);

  const enterWithToken = useCallback(
    (
      json: {
        token: string;
        serverUrl: string;
        meetingId?: string;
        role?: string;
        recording?: Session["recording"];
      },
      opts: JoinOptions,
    ) => {
      meetingIdRef.current = json.meetingId;
      setWaitingRequestId(null);
      pendingJoinOpts.current = null;
      setSession({
        token: json.token,
        serverUrl: json.serverUrl,
        meetingId: json.meetingId,
        role: json.role === "host" ? "host" : "participant",
        video: opts.videoEnabled,
        audio: opts.audioEnabled,
        videoDeviceId: opts.videoDeviceId,
        audioDeviceId: opts.audioDeviceId,
        recording: json.recording ?? null,
      });
    },
    [],
  );

  const requestToken = useCallback(
    async (opts: JoinOptions, requestId?: string) => {
      const res = await fetch(`/api/rooms/${slug}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: opts.displayName,
          clientInstanceId: tabInstanceId(),
          requestId,
        }),
      });
      const json = await res.json();
      return { res, json };
    },
    [slug],
  );

  const join = useCallback(
    async (opts: JoinOptions) => {
      setError(null);
      setJoining(true);
      pendingJoinOpts.current = opts;
      try {
        const { res, json } = await requestToken(opts);
        if (!res.ok) {
          setError(
            json.error === "denied"
              ? tErrors("denied")
              : json.error === "login_required"
                ? tErrors("loginRequired")
                : json.error || tErrors("joinFailed"),
          );
          return;
        }
        if (json.status === "pending" && json.requestId) {
          setWaitingRequestId(json.requestId);
          return;
        }
        enterWithToken(json, opts);
      } catch {
        setError(tErrors("networkFailed"));
      } finally {
        setJoining(false);
      }
    },
    [enterWithToken, requestToken, tErrors],
  );

  // Poll waiting-room approval
  useEffect(() => {
    if (!waitingRequestId || !pendingJoinOpts.current) return;
    let cancelled = false;
    const opts = pendingJoinOpts.current;
    consumingApprovalRef.current = false;
    const instance = tabInstanceId();

    const tick = async () => {
      try {
        const statusRes = await fetch(
          `/api/rooms/${slug}/join-requests/${waitingRequestId}?clientInstanceId=${encodeURIComponent(instance)}`,
        );
        if (!statusRes.ok || cancelled) return;
        const statusJson = await statusRes.json();
        if (statusJson.status === "denied" || statusJson.status === "cancelled") {
          setWaitingRequestId(null);
          setError(statusJson.status === "denied" ? tErrors("denied") : null);
          return;
        }
        if (statusJson.status === "approved") {
          if (consumingApprovalRef.current) return;
          consumingApprovalRef.current = true;
          setJoining(true);
          const { res, json } = await requestToken(opts, waitingRequestId);
          if (cancelled) return;
          if (!res.ok) {
            setError(json.error || tErrors("joinFailed"));
            setWaitingRequestId(null);
            consumingApprovalRef.current = false;
            return;
          }
          if (json.token) {
            enterWithToken(json, opts);
          } else {
            consumingApprovalRef.current = false;
          }
        }
      } catch {
        /* keep polling */
      } finally {
        if (!cancelled) setJoining(false);
      }
    };

    void tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [waitingRequestId, slug, requestToken, enterWithToken, tErrors]);

  const cancelWait = useCallback(async () => {
    const requestId = waitingRequestId;
    setWaitingRequestId(null);
    pendingJoinOpts.current = null;
    consumingApprovalRef.current = false;
    setError(null);
    if (!requestId) return;
    try {
      await fetch(`/api/rooms/${slug}/join-requests/${requestId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientInstanceId: tabInstanceId() }),
      });
    } catch {
      /* local state already cleared */
    }
  }, [waitingRequestId, slug]);

  const leave = useCallback(
    async (mode: "leave" | "end" = "leave") => {
      const meetingId = meetingIdRef.current;

      if (mode === "end" && meetingId) {
        const res = await fetch("/api/meetings/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(json.error || "end_failed");
        }
        meetingIdRef.current = undefined;
        // Summary can run in the background — room is already emptied.
        fetch("/api/meetings/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId }),
        }).catch(() => undefined);
        setSession(null);
        router.push(`/r/${slug}/summary?meetingId=${meetingId}`);
        return;
      }

      meetingIdRef.current = undefined;
      setSession(null);
      router.push("/dashboard");
    },
    [router, slug],
  );

  if (notFound) return <RoomNotFound />;
  if (!data) return <RoomSkeleton />;

  return (
    <>
      {data.brand?.customCss ? <style>{data.brand.customCss}</style> : null}
      {session ? (
        <MeetingRoom
          token={session.token}
          serverUrl={session.serverUrl}
          roomTitle={data.room.title}
          roomSlug={data.room.slug}
          logoUrl={data.brand?.logoUrl}
          bgAnimation={data.brand?.bgAnimation}
          patternUrl={data.brand?.patternUrl}
          patternTintActive={
            Boolean(
              data.brand?.patternTint && data.brand.patternTint !== "none",
            )
          }
          meetingId={session.meetingId}
          role={session.role}
          recordingConfig={session.recording ?? null}
          initialVideo={session.video}
          initialAudio={session.audio}
          videoDeviceId={session.videoDeviceId}
          audioDeviceId={session.audioDeviceId}
          onLeave={() => leave("leave")}
          onEndForAll={() => leave("end")}
        />
      ) : (
        <Lobby
          title={data.brand?.lobbyTitle || data.room.title}
          subtitle={data.brand?.lobbySubtitle}
          logoUrl={data.brand?.logoUrl}
          bgAnimation={data.brand?.bgAnimation}
          patternUrl={data.brand?.patternUrl}
          patternTintActive={
            Boolean(
              data.brand?.patternTint && data.brand.patternTint !== "none",
            )
          }
          requireLogin={data.room.accessPolicy === "members"}
          showHostLoginHint={
            data.room.accessPolicy === "invite" && !me.isLoggedIn
          }
          isLoggedIn={me.isLoggedIn}
          joining={joining}
          waiting={Boolean(waitingRequestId)}
          error={error}
          onJoin={join}
          onCancelWait={() => {
            void cancelWait();
          }}
        />
      )}
    </>
  );
}

function RoomSkeleton() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <Aurora intensity={0.5} />
      <div className="relative w-full max-w-md space-y-4">
        <Skeleton className="mx-auto h-10 w-40" />
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

function RoomNotFound() {
  const t = useTranslations("lobby.notFound");
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <Aurora intensity={0.4} />
      <div className="relative space-y-4">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-ink-muted">{t("description")}</p>
        <Link href="/dashboard">
          <Button>{t("goToDashboard")}</Button>
        </Link>
      </div>
    </div>
  );
}

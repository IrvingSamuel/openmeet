"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Aurora,
  PageTransition,
  Reveal,
  morphTransition,
  springSoft,
} from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge, Card, Divider, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import {
  IconArrowRight,
  IconBolt,
  IconCalendar,
  IconCheck,
  IconCopy,
  IconFileText,
  IconLogout,
  IconMore,
  IconPalette,
  IconPencil,
  IconPlus,
  IconSettings,
  IconShield,
  IconSparkles,
  IconTrash,
  IconVideo,
} from "@/components/ui/icons";
import { cn, formatDuration, initials, timeAgo } from "@/lib/utils";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

type Me = {
  isLoggedIn: boolean;
  name?: string;
  email?: string;
  isAdmin?: boolean;
};

type Room = {
  id: string;
  slug: string;
  title: string;
  boardId?: string | null;
  accessPolicy?: string;
  kind?: string;
  createdAt: string;
};

type MeetingHistoryItem = {
  id: string;
  status: string;
  summaryStatus: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  actionItemCount: number;
  hasSummary: boolean;
  summaryPreview: string | null;
  summaryUrl: string | null;
  relation?: "owner" | "participant";
  room: { id: string; slug: string; title: string } | null;
};

function useTimeAgoFormatter() {
  const t = useTranslations("common.timeAgo");
  return useCallback(
    (input: string | Date) =>
      timeAgo(input, {
        justNow: t("justNow"),
        minutes: (n) => t("minutes", { count: n }),
        hours: (n) => t("hours", { count: n }),
        days: (n) => t("days", { count: n }),
        months: (n) => t("months", { count: n }),
        years: (n) => t("years", { count: n }),
      }),
    [t],
  );
}

export default function DashboardPage() {
  const toast = useToast();
  const router = useRouter();
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tHeader = useTranslations("header");
  const [me, setMe] = useState<Me | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [meetings, setMeetings] = useState<MeetingHistoryItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [renameRoom, setRenameRoom] = useState<Room | null>(null);
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingInstant, setStartingInstant] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const meData: Me = await fetch("/api/auth/me").then((r) => r.json());
    setMe(meData);
    if (!meData.isLoggedIn) {
      setRooms([]);
      setMeetings([]);
      return;
    }
    const [roomsRes, meetingsRes] = await Promise.all([
      fetch("/api/rooms"),
      fetch("/api/meetings?limit=40"),
    ]);
    setRooms(roomsRes.ok ? ((await roomsRes.json()).rooms ?? []) : []);
    setMeetings(
      meetingsRes.ok ? ((await meetingsRes.json()).meetings ?? []) : [],
    );
  }, []);

  useEffect(() => {
    refresh().catch(() => toast.error(t("loadFailed")));
  }, [refresh, toast, t]);

  const filtered = useMemo(() => {
    if (!rooms) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.title.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q),
    );
  }, [rooms, query]);

  const filteredMeetings = useMemo(() => {
    if (!meetings) return null;
    const q = query.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter((m) => {
      const roomTitle = m.room?.title?.toLowerCase() ?? "";
      const roomSlug = m.room?.slug?.toLowerCase() ?? "";
      const preview = m.summaryPreview?.toLowerCase() ?? "";
      return (
        roomTitle.includes(q) ||
        roomSlug.includes(q) ||
        preview.includes(q)
      );
    });
  }, [meetings, query]);

  const endedCount = useMemo(
    () => (meetings ? meetings.filter((m) => m.status === "ended").length : null),
    [meetings],
  );

  async function copyLink(slug: string) {
    const url = `${window.location.origin}/r/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      setTimeout(() => setCopied(null), 1800);
      toast.success(tCommon("toast.linkCopied"));
    } catch {
      toast.error(tCommon("toast.clipboardBlocked"));
    }
  }

  async function startInstantMeeting() {
    setStartingInstant(true);
    try {
      const res = await fetch("/api/rooms/instant", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("instantFailed"));
        return;
      }
      toast.success(t("instantStarted"));
      router.push(`/m/${data.slug || data.meeting?.slug}`);
    } catch {
      toast.error(t("instantNetworkFailed"));
    } finally {
      setStartingInstant(false);
    }
  }

  async function confirmDeleteRoom() {
    if (!deleteRoom) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/rooms/${deleteRoom.slug}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t("deleteFailed"));
        return;
      }
      toast.success(t("roomDeleted", { title: deleteRoom.title }));
      setDeleteRoom(null);
      await refresh();
    } catch {
      toast.error(t("deleteNetworkFailed"));
    } finally {
      setDeleting(false);
    }
  }

  // Hold the shell back until the session resolves, otherwise anonymous
  // visitors briefly see the authenticated header before the sign-in card.
  if (me === null) return <SessionLoading />;
  if (!me.isLoggedIn) return <SignedOut />;

  return (
    <div className="relative min-h-screen">
      <Aurora intensity={0.55} />
      <PageTransition className="relative mx-auto max-w-6xl px-6 pb-24 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <InstallPrompt />
            <Link href="/settings">
              <Button
                size="sm"
                variant="ghost"
                icon={<IconSettings className="h-4 w-4" />}
              >
                <span className="hidden sm:inline">{tHeader("settings")}</span>
              </Button>
            </Link>
            {me.isAdmin ? (
              <Link href="/admin">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<IconShield className="h-4 w-4" />}
                >
                  <span className="hidden sm:inline">{tHeader("admin")}</span>
                </Button>
              </Link>
            ) : null}
            <a href="/api/auth/logout">
              <Button
                size="sm"
                variant="ghost"
                icon={<IconLogout className="h-4 w-4" />}
              >
                <span className="hidden sm:inline">{tCommon("actions.logout")}</span>
              </Button>
            </a>
          </div>
        </header>

        <Reveal className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-secondary">
                {t("eyebrow")}
              </p>
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                {me ? (
                  <span>
                    {(() => {
                      const name = (me.name || me.email || "").split(" ")[0];
                      const marker = "";
                      const [before = "", after = ""] = t("greeting", {
                        name: marker,
                      }).split(marker);
                      return (
                        <>
                          {before}
                          <span className="text-brand-gradient">{name}</span>
                          {after}
                        </>
                      );
                    })()}
                  </span>
                ) : (
                  <Skeleton className="h-10 w-64" />
                )}
              </h1>
              <p className="mt-2 max-w-md text-sm text-ink-muted">
                {t("subtitle")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="lg"
                variant="outline"
                icon={<IconBolt />}
                loading={startingInstant}
                onClick={() => void startInstantMeeting()}
              >
                {t("instantMeeting")}
              </Button>
              <motion.div layoutId="create-room-surface" transition={morphTransition}>
                <Button
                  size="lg"
                  icon={<IconPlus />}
                  onClick={() => setCreateOpen(true)}
                >
                  {t("newRoom")}
                </Button>
              </motion.div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05} className="mt-10">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label={t("statRooms")}
              value={rooms ? String(rooms.length) : null}
              icon={<IconVideo />}
            />
            <StatCard
              label={t("statMeetings")}
              value={endedCount !== null ? String(endedCount) : null}
              icon={<IconFileText />}
            />
            <StatCard
              label={t("statCopilot")}
              value={t("statConnected")}
              tone="success"
              icon={<IconSparkles />}
            />
          </div>
        </Reveal>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{t("yourRooms")}</h2>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filterPlaceholder")}
            wrapperClassName="w-full max-w-xs"
            aria-label={t("filterAria")}
          />
        </div>

        <Divider className="my-5" />

        <motion.ul layout transition={morphTransition} className="space-y-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered === null ? (
              [0, 1, 2].map((i) => (
                <motion.li key={`sk-${i}`} exit={{ opacity: 0 }}>
                  <Skeleton className="h-[86px] w-full" />
                </motion.li>
              ))
            ) : filtered.length === 0 ? (
              <motion.li
                key="empty"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <EmptyState
                  filtered={Boolean(query)}
                  onCreate={() => setCreateOpen(true)}
                />
              </motion.li>
            ) : (
              filtered.map((room) => (
                <motion.li
                  key={room.id}
                  layout
                  layoutId={`room-${room.id}`}
                  initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
                  transition={morphTransition}
                >
                  <RoomRow
                    room={room}
                    copied={copied === room.slug}
                    onCopy={() => copyLink(room.slug)}
                    onRename={() => setRenameRoom(room)}
                    onDelete={() => setDeleteRoom(room)}
                  />
                </motion.li>
              ))
            )}
          </AnimatePresence>
        </motion.ul>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("meetingHistory")}
            </h2>
            <p className="mt-1 text-sm text-ink-faint">
              {t("meetingHistoryHint")}
            </p>
          </div>
        </div>

        <Divider className="my-5" />

        <motion.ul layout transition={morphTransition} className="space-y-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredMeetings === null ? (
              [0, 1, 2].map((i) => (
                <motion.li key={`msk-${i}`} exit={{ opacity: 0 }}>
                  <Skeleton className="h-[92px] w-full" />
                </motion.li>
              ))
            ) : filteredMeetings.length === 0 ? (
              <motion.li
                key="meetings-empty"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <MeetingsEmptyState filtered={Boolean(query)} />
              </motion.li>
            ) : (
              filteredMeetings.map((meeting) => (
                <motion.li
                  key={meeting.id}
                  layout
                  initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={morphTransition}
                >
                  <MeetingRow meeting={meeting} />
                </motion.li>
              ))
            )}
          </AnimatePresence>
        </motion.ul>
      </PageTransition>

      <CreateRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async (slug) => {
          setCreateOpen(false);
          toast.success(t("roomCreated", { slug }));
          await refresh();
        }}
      />

      <RenameRoomModal
        room={renameRoom}
        onClose={() => setRenameRoom(null)}
        onRenamed={async (patch) => {
          setRenameRoom(null);
          toast.success(t("roomUpdated", { title: patch.title }));
          await refresh();
        }}
      />

      <Modal
        open={Boolean(deleteRoom)}
        onClose={() => {
          if (!deleting) setDeleteRoom(null);
        }}
        title={t("deleteModal.title")}
        description={
          deleteRoom
            ? t("deleteModal.description", { title: deleteRoom.title })
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => setDeleteRoom(null)}
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button
              loading={deleting}
              onClick={() => void confirmDeleteRoom()}
              icon={<IconTrash className="h-4 w-4" />}
            >
              {t("deleteModal.submit")}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">{t("deleteModal.warning")}</p>
      </Modal>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "warn";
}) {
  return (
    <Card spotlight className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {label}
        </p>
        <span
          className={cn(
            "text-brand-secondary",
            tone === "success" && "text-emerald-300",
            tone === "warn" && "text-amber-300",
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight text-ink">
        {value ?? <Skeleton className="h-6 w-24" />}
      </p>
    </Card>
  );
}

function RoomRow({
  room,
  copied,
  onCopy,
  onRename,
  onDelete,
}: {
  room: Room;
  copied: boolean;
  onCopy: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const formatAgo = useTimeAgoFormatter();
  const toast = useToast();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const moreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPos = useCallback(() => {
    const el = moreRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = 192;
    const pad = 8;
    setMenuPos({
      top: rect.bottom + pad,
      left: Math.max(
        pad,
        Math.min(rect.left, window.innerWidth - menuWidth - pad),
      ),
    });
  }, []);

  useEffect(() => {
    if (!moreOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (
        moreRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", updateMenuPos);
    window.addEventListener("scroll", updateMenuPos, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", updateMenuPos);
      window.removeEventListener("scroll", updateMenuPos, true);
    };
  }, [moreOpen, updateMenuPos]);

  async function startFromTemplate() {
    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${room.slug}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("startFromRoomFailed"));
        return;
      }
      router.push(`/m/${data.slug}`);
    } catch {
      toast.error(t("startFromRoomNetworkFailed"));
    } finally {
      setStarting(false);
    }
  }

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={springSoft}
      className="group relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border border-line bg-white/[0.03] px-4 py-4 transition-colors hover:border-brand-primary/40 sm:px-5"
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-px bg-brand-gradient opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-sm font-semibold text-white shadow-glow">
        {initials(room.title)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium tracking-tight text-ink">
          {room.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs text-ink-faint">
          <span>/r/{room.slug}</span>
          <span aria-hidden>·</span>
          <span>{formatAgo(room.createdAt)}</span>
          {room.boardId ? (
            <Badge tone="brand">{tCommon("badges.linkedBoard")}</Badge>
          ) : null}
          <Badge>{t("brandTemplateBadge")}</Badge>
          {room.accessPolicy === "invite" ? (
            <Badge tone="warn">{tCommon("badges.private")}</Badge>
          ) : room.accessPolicy === "public" ? (
            <Badge>{tCommon("badges.public")}</Badge>
          ) : (
            <Badge>{tCommon("badges.members")}</Badge>
          )}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        <div className="hidden items-center gap-2 md:flex">
          <Button
            size="sm"
            variant="ghost"
            onClick={onRename}
            icon={<IconPencil className="h-4 w-4" />}
            aria-label={t("renameRoom")}
          >
            {tCommon("actions.rename")}
          </Button>
          <Link href={`/r/${room.slug}/brand`}>
            <Button size="sm" variant="ghost" icon={<IconPalette className="h-4 w-4" />}>
              {t("brand")}
            </Button>
          </Link>
          <a href={`/api/rooms/${room.slug}/ics`}>
            <Button
              size="sm"
              variant="ghost"
              icon={<IconCalendar className="h-4 w-4" />}
              aria-label={t("downloadIcs")}
            >
              {t("ics")}
            </Button>
          </a>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            icon={<IconTrash className="h-4 w-4" />}
            aria-label={t("deleteRoom")}
          >
            {tCommon("actions.delete")}
          </Button>
        </div>

        <div ref={moreRef} className="relative md:hidden">
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("moreActions")}
            aria-expanded={moreOpen}
            onClick={() => {
              if (moreOpen) {
                setMoreOpen(false);
                return;
              }
              updateMenuPos();
              setMoreOpen(true);
            }}
            icon={<IconMore className="h-4 w-4" />}
          >
            {tCommon("actions.more")}
          </Button>
          {typeof document !== "undefined" &&
            createPortal(
              <AnimatePresence>
                {moreOpen && menuPos ? (
                  <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={springSoft}
                    style={{ top: menuPos.top, left: menuPos.left }}
                    className="fixed z-[80] w-48 overflow-hidden rounded-2xl border border-line bg-[color-mix(in_srgb,var(--brand-bg)_94%,black)] p-1.5 shadow-lift backdrop-blur-xl"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-ink-muted hover:bg-white/[0.06] hover:text-ink"
                      onClick={() => {
                        setMoreOpen(false);
                        onRename();
                      }}
                    >
                      <IconPencil className="h-4 w-4" />{" "}
                      {tCommon("actions.rename")}
                    </button>
                    <Link
                      href={`/r/${room.slug}/brand`}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-ink-muted hover:bg-white/[0.06] hover:text-ink"
                      onClick={() => setMoreOpen(false)}
                    >
                      <IconPalette className="h-4 w-4" /> {t("brand")}
                    </Link>
                    <a
                      href={`/api/rooms/${room.slug}/ics`}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-ink-muted hover:bg-white/[0.06] hover:text-ink"
                      onClick={() => setMoreOpen(false)}
                    >
                      <IconCalendar className="h-4 w-4" /> {t("ics")}
                    </a>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10"
                      onClick={() => {
                        setMoreOpen(false);
                        onDelete();
                      }}
                    >
                      <IconTrash className="h-4 w-4" />{" "}
                      {tCommon("actions.delete")}
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>,
              document.body,
            )}
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={onCopy}
          icon={
            copied ? (
              <IconCheck className="h-4 w-4 text-emerald-300" />
            ) : (
              <IconCopy className="h-4 w-4" />
            )
          }
          aria-label={t("copyRoomLink")}
        >
          {copied ? tCommon("actions.copied") : tCommon("actions.link")}
        </Button>
        <Button
          size="sm"
          loading={starting}
          onClick={() => void startFromTemplate()}
          iconRight={<IconArrowRight className="h-4 w-4" />}
        >
          {t("startMeeting")}
        </Button>
      </div>
    </motion.div>
  );
}

function SummaryStatusBadge({
  status,
  hasSummary,
}: {
  status: string;
  hasSummary: boolean;
}) {
  const tCommon = useTranslations("common");
  if (status === "ready" || hasSummary) {
    return <Badge tone="success">{tCommon("badges.summaryReady")}</Badge>;
  }
  if (status === "running") {
    return <Badge tone="brand">{tCommon("badges.summaryGenerating")}</Badge>;
  }
  if (status === "failed") {
    return <Badge tone="warn">{tCommon("badges.summaryFailed")}</Badge>;
  }
  if (status === "pending") {
    return <Badge>{tCommon("badges.noSummary")}</Badge>;
  }
  return <Badge>{status}</Badge>;
}

function MeetingRow({ meeting }: { meeting: MeetingHistoryItem }) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const formatAgo = useTimeAgoFormatter();
  const title = meeting.room?.title || tCommon("labels.room");
  const slug = meeting.room?.slug;
  const when = meeting.endedAt || meeting.startedAt;
  const duration =
    meeting.durationMs != null && meeting.durationMs > 0
      ? formatDuration(meeting.durationMs)
      : null;
  const canOpen = Boolean(meeting.summaryUrl);

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={springSoft}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-white/[0.03] px-4 py-4 transition-colors hover:border-brand-primary/40 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-px bg-brand-gradient opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-white/[0.04] text-brand-secondary">
          <IconFileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium tracking-tight text-ink">{title}</p>
            {meeting.relation === "participant" ? (
              <Badge>{t("participatedBadge")}</Badge>
            ) : null}
            {meeting.status === "active" ? (
              <Badge tone="brand" pulse>
                {tCommon("badges.inProgress")}
              </Badge>
            ) : meeting.status === "scheduled" ? (
              <Badge>{tCommon("badges.scheduled")}</Badge>
            ) : (
              <SummaryStatusBadge status={meeting.summaryStatus} hasSummary={meeting.hasSummary} />
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            {slug ? <span className="font-mono">/r/{slug}</span> : null}
            {slug ? <span aria-hidden>·</span> : null}
            <span>{formatAgo(when)}</span>
            {duration ? (
              <>
                <span aria-hidden>·</span>
                <span>{duration}</span>
              </>
            ) : null}
            {meeting.actionItemCount > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {t("taskCount", { count: meeting.actionItemCount })}
                </span>
              </>
            ) : null}
          </p>
          {meeting.summaryPreview ? (
            <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
              {meeting.summaryPreview}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex w-full items-center gap-2 pl-14 sm:w-auto sm:justify-end sm:pl-0">
        {canOpen ? (
          <Link href={meeting.summaryUrl!} className="w-full sm:w-auto">
            <Button
              size="sm"
              full
              className="sm:w-auto"
              icon={<IconFileText className="h-4 w-4" />}
              iconRight={<IconArrowRight className="h-4 w-4" />}
            >
              {t("viewSummary")}
            </Button>
          </Link>
        ) : (
          <Button size="sm" variant="ghost" disabled full className="sm:w-auto">
            {t("noLink")}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function MeetingsEmptyState({ filtered }: { filtered: boolean }) {
  const t = useTranslations("dashboard");
  return (
    <div className="rounded-3xl border border-dashed border-line-strong px-8 py-12 text-center">
      <p className="text-base font-medium text-ink">
        {filtered ? t("emptyMeetingsFilteredTitle") : t("emptyMeetingsTitle")}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
        {filtered ? t("emptyMeetingsFilteredBody") : t("emptyMeetingsBody")}
      </p>
    </div>
  );
}

function EmptyState({
  filtered,
  onCreate,
}: {
  filtered: boolean;
  onCreate: () => void;
}) {
  const t = useTranslations("dashboard");
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-line-strong px-8 py-16 text-center">
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow"
      >
        <IconVideo />
      </motion.div>
      <p className="text-base font-medium text-ink">
        {filtered ? t("emptyRoomsFilteredTitle") : t("emptyRoomsTitle")}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
        {filtered ? t("emptyRoomsFilteredBody") : t("emptyRoomsBody")}
      </p>
      {!filtered ? (
        <Button className="mt-6" icon={<IconPlus />} onClick={onCreate}>
          {t("createFirstRoom")}
        </Button>
      ) : null}
    </div>
  );
}

function CreateRoomModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const t = useTranslations("dashboard.createModal");
  const tCommon = useTranslations("common");
  const [title, setTitle] = useState("");
  const [boardId, setBoardId] = useState("");
  const [accessPolicy, setAccessPolicy] = useState<
    "public" | "members" | "invite"
  >("members");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          boardId: boardId || undefined,
          accessPolicy,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t("createFailed"));
        return;
      }
      setTitle("");
      setBoardId("");
      setAccessPolicy("members");
      onCreated(json.room?.slug ?? "");
    } catch {
      setError(t("networkFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      layoutId="create-room-surface"
      title={t("title")}
      description={t("description")}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          required
          autoFocus
          label={t("titleLabel")}
          placeholder={tCommon("placeholders.weeklyProduct")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label={t("boardIdLabel")}
          placeholder={tCommon("placeholders.optional")}
          hint={t("boardIdHint")}
          value={boardId}
          onChange={(e) => setBoardId(e.target.value)}
        />
        <Select
          label={tCommon("labels.access")}
          value={accessPolicy}
          onChange={(e) =>
            setAccessPolicy(e.target.value as "public" | "members" | "invite")
          }
          hint={
            accessPolicy === "invite"
              ? tCommon("accessPolicy.hintInvite")
              : accessPolicy === "public"
                ? tCommon("accessPolicy.hintPublic")
                : tCommon("accessPolicy.hintMembers")
          }
        >
          <option value="members">{tCommon("accessPolicy.members")}</option>
          <option value="public">{tCommon("accessPolicy.public")}</option>
          <option value="invite">{tCommon("accessPolicy.invite")}</option>
        </Select>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tCommon("actions.cancel")}
          </Button>
          <Button type="submit" loading={busy} disabled={!title.trim()}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameRoomModal({
  room,
  onClose,
  onRenamed,
}: {
  room: Room | null;
  onClose: () => void;
  onRenamed: (patch: { title: string; accessPolicy?: string }) => void;
}) {
  const t = useTranslations("dashboard.renameModal");
  const tCommon = useTranslations("common");
  const [title, setTitle] = useState("");
  const [accessPolicy, setAccessPolicy] = useState<
    "public" | "members" | "invite"
  >("members");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (room) {
      setTitle(room.title);
      setAccessPolicy(
        (room.accessPolicy as "public" | "members" | "invite") || "members",
      );
      setError(null);
    }
  }, [room]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;
    const next = title.trim();
    const policyChanged = accessPolicy !== (room.accessPolicy || "members");
    if ((!next || next === room.title) && !policyChanged) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(room.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: next !== room.title ? next : undefined,
          accessPolicy: policyChanged ? accessPolicy : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || t("updateFailed"));
        return;
      }
      onRenamed({
        title: json.room?.title ?? next,
        accessPolicy: json.room?.accessPolicy ?? accessPolicy,
      });
    } catch {
      setError(t("networkFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(room)}
      onClose={onClose}
      title={t("title")}
      description={
        room ? t("description", { slug: room.slug }) : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          required
          autoFocus
          label={t("nameLabel")}
          placeholder={tCommon("placeholders.weeklyProduct")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Select
          label={tCommon("labels.access")}
          value={accessPolicy}
          onChange={(e) =>
            setAccessPolicy(e.target.value as "public" | "members" | "invite")
          }
        >
          <option value="members">{tCommon("accessPolicy.members")}</option>
          <option value="public">{tCommon("accessPolicy.public")}</option>
          <option value="invite">{tCommon("accessPolicy.invite")}</option>
        </Select>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tCommon("actions.cancel")}
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={
              !title.trim() ||
              (title.trim() === room?.title &&
                accessPolicy === (room?.accessPolicy || "members"))
            }
          >
            {t("submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SessionLoading() {
  const t = useTranslations("meta");
  return (
    <div className="relative grid min-h-screen place-items-center">
      <Aurora intensity={0.5} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="relative flex flex-col items-center gap-4"
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <LogoMark className="h-11 w-11" />
        </motion.div>
        <p className="text-sm text-ink-faint">{t("verifyingSession")}</p>
      </motion.div>
    </div>
  );
}

function SignedOut() {
  const t = useTranslations("dashboard.signedOut");
  return (
    <div className="relative grid min-h-screen place-items-center px-6">
      <Aurora intensity={0.8} />
      <PageTransition className="relative w-full max-w-md">
        <Card glow className="text-center">
          <LogoMark className="mx-auto h-12 w-12" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("body")}</p>
          <a href="/api/auth/login" className="mt-7 block">
            <Button full size="lg" iconRight={<IconArrowRight />}>
              {t("login")}
            </Button>
          </a>
          <Link
            href="/"
            className="mt-4 inline-block text-xs text-ink-faint transition-colors hover:text-ink"
          >
            {t("backHome")}
          </Link>
        </Card>
      </PageTransition>
    </div>
  );
}

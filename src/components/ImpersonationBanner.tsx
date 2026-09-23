"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";

type MeImpersonation = {
  isLoggedIn?: boolean;
  name?: string | null;
  email?: string | null;
  impersonating?: boolean;
  impersonatorEmail?: string | null;
};

/**
 * Global banner while a server admin is impersonating another account (Ops).
 * Stop hits /api/ops/impersonate/stop.
 */
export function ImpersonationBanner() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<MeImpersonation | null>(null);
  const [stopping, setStopping] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: MeImpersonation | null) => setMe(json))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  const stop = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const res = await fetch("/api/ops/impersonate/stop", { method: "POST" });
      if (!res.ok) {
        setStopping(false);
        return;
      }
      router.replace("/ops");
      router.refresh();
      refresh();
    } catch {
      setStopping(false);
    }
  }, [stopping, router, refresh]);

  if (!me?.impersonating) return null;

  const who = me.name || me.email || "user";
  const asAdmin = me.impersonatorEmail || "admin";

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] flex items-center justify-between gap-3 border-b border-amber-400/30 bg-amber-500/95 px-4 py-2 text-sm text-ink shadow-lg backdrop-blur-md"
      style={{ color: "#1a1208" }}
    >
      <p className="min-w-0 truncate font-medium">
        Impersonating <strong>{who}</strong>
        <span className="opacity-80">
          {" "}
          (as {asAdmin}
          {locale ? ` · ${locale}` : ""})
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        loading={stopping}
        onClick={() => void stop()}
        className="shrink-0 !bg-white/90 !text-ink"
      >
        Stop
      </Button>
    </div>
  );
}

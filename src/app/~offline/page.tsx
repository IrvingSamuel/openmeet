"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Aurora } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";
import pt from "../../../messages/pt.json";

const catalogs = { en, pt, es, fr, de } as const;
type OfflineLocale = keyof typeof catalogs;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveLocale(): OfflineLocale {
  const cookie = readCookie("NEXT_LOCALE");
  if (cookie && cookie in catalogs) return cookie as OfflineLocale;

  const lang = navigator.language?.toLowerCase() ?? "";
  if (lang.startsWith("pt")) return "pt";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("de")) return "de";
  return "en";
}

export default function OfflinePage() {
  const { locale, copy } = useMemo(() => {
    const next = resolveLocale();
    return { locale: next, copy: catalogs[next].offline };
  }, []);

  return (
    <div className="relative grid min-h-[100svh] place-items-center px-6">
      <Aurora intensity={0.5} />
      <div className="relative max-w-md text-center">
        <LogoMark className="mx-auto h-12 w-12" animated={false} />
        <div className="mt-4 flex justify-center">
          <Wordmark />
        </div>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">{copy.body}</p>
        <div className="mt-8">
          <Link href={`/${locale}`}>
            <Button>{copy.backHome}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

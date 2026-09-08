"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { usePlatformBrand } from "@/components/layout/PlatformBrandContext";

const DEFAULT_LOGO = "/OpenMeet_Logo.png";

function isExternalUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/**
 * Platform mark — uses instance logo when configured.
 */
export function LogoMark({
  className,
  animated = true,
  src: srcOverride,
}: {
  className?: string;
  animated?: boolean;
  /** Override (e.g. meeting brand logo). */
  src?: string | null;
}) {
  const brand = usePlatformBrand();
  const src = srcOverride || brand.logoUrl || DEFAULT_LOGO;
  const external = isExternalUrl(src);

  return (
    <motion.span
      className={cn(
        "relative inline-flex overflow-hidden rounded-lg",
        className,
      )}
      animate={animated ? { scale: [1, 1.04, 1] } : undefined}
      transition={
        animated
          ? { duration: 4.5, ease: "easeInOut", repeat: Infinity }
          : undefined
      }
    >
      {external ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          aria-hidden
        />
      ) : (
        <Image
          src={src}
          alt=""
          width={80}
          height={80}
          className="h-full w-full object-cover"
          priority
          aria-hidden
          unoptimized={src.startsWith("/brand-assets/")}
        />
      )}
    </motion.span>
  );
}

export function Wordmark({
  className,
  label,
  accent,
}: {
  className?: string;
  /** @deprecated Prefer platform wordmark; kept for rare overrides. */
  label?: string;
  /** @deprecated Prefer platform wordmark. */
  accent?: string;
}) {
  const brand = usePlatformBrand();

  if (label !== undefined || accent !== undefined) {
    return (
      <span
        className={cn(
          "text-[15px] font-semibold tracking-tight text-ink",
          className,
        )}
      >
        {label ?? ""}
        {accent ? <span className="text-brand-gradient">{accent}</span> : null}
      </span>
    );
  }

  const name = brand.wordmark || "OpenMeet";
  return (
    <span
      className={cn(
        "text-[15px] font-semibold tracking-tight text-ink",
        className,
      )}
    >
      <span className="text-brand-gradient">{name}</span>
    </span>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { springSoft } from "@/components/motion/primitives";
import { IconClose, IconMenu } from "@/components/ui/icons";

type NavItem = { href: string; label: string };

export function SiteHeader({
  items,
  actions,
}: {
  items?: NavItem[];
  actions?: ReactNode;
}) {
  const t = useTranslations("header");
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [condensed, setCondensed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems =
    items ??
    ([
      { href: "/#recursos", label: t("navFeatures") },
      { href: "/#copiloto", label: t("navCopilot") },
      { href: "/#marca", label: t("navBrand") },
      { href: "/#infra", label: t("navInfra") },
    ] satisfies NavItem[]);

  useMotionValueEvent(scrollY, "change", (v) => setCondensed(v > 24));

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <>
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-safe"
      >
        <motion.nav
          layout
          transition={springSoft}
          className={cn(
            "mt-3 flex w-full max-w-3xl items-center gap-1 rounded-full border px-2 py-2 transition-colors duration-500 md:w-auto",
            condensed || mobileOpen
              ? "glass-strong border-line-strong shadow-lift"
              : "border-transparent bg-transparent",
          )}
        >
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-full px-3 py-1.5"
          >
            <LogoMark className="h-7 w-7" />
            <Wordmark />
          </Link>

          <div
            className="mx-1 hidden items-center md:flex"
            onMouseLeave={() => setHovered(null)}
          >
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onMouseEnter={() => setHovered(item.href)}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-200",
                    active || hovered === item.href
                      ? "text-ink"
                      : "text-ink-muted",
                  )}
                >
                  {hovered === item.href ? (
                    <motion.span
                      layoutId="nav-pill"
                      transition={springSoft}
                      className="absolute inset-0 rounded-full bg-white/[0.08]"
                    />
                  ) : null}
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2 pl-1 pr-1 md:ml-0">
            <div className="hidden items-center gap-2 sm:flex">
              <LanguageSwitcher />
              {actions}
            </div>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white/[0.08] hover:text-ink md:hidden"
              aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <IconClose /> : <IconMenu />}
            </button>
          </div>
        </motion.nav>
      </motion.header>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            key="mobile-nav"
            className="fixed inset-0 z-40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label={t("closeMenu")}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.nav
              initial={{ y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={springSoft}
              className="absolute inset-x-4 top-[4.75rem] overflow-hidden rounded-3xl glass-strong p-3 shadow-lift"
            >
              <ul className="space-y-1">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="block rounded-2xl px-4 py-3 text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t border-line px-2 pb-2 pt-3 sm:hidden">
                <div className="flex flex-col gap-3">
                  <LanguageSwitcher />
                  {actions}
                </div>
              </div>
            </motion.nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

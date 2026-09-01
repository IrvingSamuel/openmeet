"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Reveal,
  morphTransition,
  springSoft,
} from "@/components/motion/primitives";
import { SectionHeading } from "@/components/ui/Surface";
import { IconCheck, IconSparkles } from "@/components/ui/icons";

const STEP_KEYS = ["capture", "transcribe", "reason", "act"] as const;

export function CopilotFlow() {
  const t = useTranslations("landing.copilot");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-20% 0px -20% 0px" });
  const [step, setStep] = useState(0);

  const steps = [
    {
      key: "capture",
      label: t("stepCaptureLabel"),
      caption: t("stepCaptureCaption"),
    },
    {
      key: "transcribe",
      label: t("stepTranscribeLabel"),
      caption: t("stepTranscribeCaption"),
    },
    {
      key: "reason",
      label: t("stepReasonLabel"),
      caption: t("stepReasonCaption"),
    },
    {
      key: "act",
      label: t("stepActLabel"),
      caption: t("stepActCaption"),
    },
  ] as const;

  useEffect(() => {
    if (!inView) return;
    const id = setInterval(
      () => setStep((s) => (s + 1) % STEP_KEYS.length),
      3200,
    );
    return () => clearInterval(id);
  }, [inView]);

  return (
    <section id="copiloto" className="relative py-28">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent"
      />
      <div ref={ref} className="mx-auto max-w-7xl px-6">
        <Reveal>
          <SectionHeading
            eyebrow={t("eyebrow")}
            title={
              <>
                {t("titleBefore")}{" "}
                <span className="text-brand-gradient">{t("titleGradient")}</span>
              </>
            }
            description={t("description")}
            align="center"
          />
        </Reveal>

        <div className="mt-16 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <ol className="relative space-y-1">
            <div
              aria-hidden
              className="absolute left-[19px] top-3 h-[calc(100%-24px)] w-px bg-line"
            />
            {steps.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setStep(i)}
                    className="relative flex w-full items-start gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    {active ? (
                      <motion.span
                        layoutId="copilot-active"
                        transition={springSoft}
                        className="absolute inset-0 rounded-2xl border border-line-strong bg-white/[0.05]"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors duration-300",
                        active
                          ? "border-brand-secondary bg-brand-primary text-white shadow-glow"
                          : done
                            ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                            : "border-line-strong bg-black/40 text-ink-faint",
                      )}
                    >
                      {done ? <IconCheck className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className="relative z-10">
                      <span className="block text-sm font-semibold text-ink">
                        {s.label}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-muted">
                        {s.caption}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <motion.div
            layout
            transition={morphTransition}
            className="relative min-h-[380px] overflow-hidden rounded-3xl glass p-6"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(90% 60% at 80% 0%, color-mix(in srgb, var(--brand-primary) 20%, transparent), transparent 70%)",
              }}
            />
            <AnimatePresence mode="wait">
              <motion.div
                key={steps[step].key}
                initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -14, filter: "blur(10px)" }}
                transition={{ duration: 0.45 }}
                className="relative"
              >
                <StagePanel step={step} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function StagePanel({ step }: { step: number }) {
  const t = useTranslations("landing.copilot");

  if (step === 0) {
    return (
      <div className="space-y-4">
        <PanelTitle>agent.join(room)</PanelTitle>
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-black/30 p-5">
          <motion.span
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow"
          >
            <IconSparkles />
          </motion.span>
          <div>
            <p className="text-sm font-semibold text-ink">{t("connectedTitle")}</p>
            <p className="text-xs text-ink-muted">{t("connectedBody")}</p>
          </div>
        </div>
        <Waveform />
      </div>
    );
  }

  if (step === 1) {
    const transcript = [t("transcript1"), t("transcript2"), t("transcript3")];
    return (
      <div className="space-y-4">
        <PanelTitle>stt.stream — pt-BR</PanelTitle>
        <div className="space-y-2.5">
          {transcript.map((line, i) => (
            <motion.p
              key={line}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.18 * i, duration: 0.45 }}
              className="rounded-xl border border-line bg-black/30 px-4 py-3 font-mono text-xs leading-relaxed text-ink-muted"
            >
              {line}
            </motion.p>
          ))}
        </div>
        <Waveform />
      </div>
    );
  }

  if (step === 2) {
    const items = [
      { k: t("synthDecision"), v: t("synthDecisionValue") },
      { k: t("synthRisk"), v: t("synthRiskValue") },
      { k: t("synthOwner"), v: t("synthOwnerValue") },
      { k: t("synthDeadline"), v: t("synthDeadlineValue") },
    ];
    return (
      <div className="space-y-4">
        <PanelTitle>llm.summarize</PanelTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item, i) => (
            <motion.div
              key={item.k}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.12 * i, ...springSoft }}
              className="rounded-2xl border border-line bg-black/30 p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-secondary">
                {item.k}
              </p>
              <p className="mt-1.5 text-sm text-ink">{item.v}</p>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  const tasks = [
    { title: t("task1Title"), owner: "Duda", due: t("task1Due") },
    { title: t("task2Title"), owner: "Caio", due: t("task2Due") },
    { title: t("task3Title"), owner: "Ana", due: t("task3Due") },
  ];

  return (
    <div className="space-y-4">
      <PanelTitle>mcp.board_tasks_create</PanelTitle>
      <div className="space-y-2.5">
        {tasks.map((task, i) => (
          <motion.div
            key={task.title}
            initial={{ opacity: 0, y: 20, rotateX: -20 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: 0.14 * i, ...springSoft }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-black/30 p-4"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-400/15 text-emerald-300">
              <IconCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {task.title}
              </p>
              <p className="text-xs text-ink-faint">
                {task.owner} · {t("duePrefix")} {task.due}
              </p>
            </div>
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-ink-faint">
              chronos
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
      {children}
    </p>
  );
}

function Waveform() {
  return (
    <div className="flex h-14 items-end justify-center gap-[3px] rounded-2xl border border-line bg-black/30 px-4 py-3">
      {Array.from({ length: 40 }).map((_, i) => {
        const peak = 12 + ((i * 11 + 5) % 34);
        return (
          <motion.span
            key={i}
            className="block w-[3px] shrink-0 rounded-full bg-brand-secondary/70"
            initial={{ height: 8 }}
            animate={{ height: [8, peak, 8] }}
            transition={{
              duration: 0.85 + (i % 6) * 0.12,
              repeat: Infinity,
              delay: i * 0.03,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

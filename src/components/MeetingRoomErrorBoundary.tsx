"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  children: ReactNode;
  title: string;
  body: string;
  retryLabel: string;
  leaveLabel: string;
  onLeave?: () => void;
  /** Optional correlation for console logs (meeting slug). */
  slug?: string;
  /** Optional correlation for console logs (meeting id). */
  meetingId?: string;
};

type State = {
  error: Error | null;
  /** Bumped on retry so children remount a clean LiveKit session. */
  retryKey: number;
};

export class MeetingRoomErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { slug, meetingId } = this.props;
    console.error("[MeetingRoomErrorBoundary]", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      componentStack: info.componentStack,
      slug: slug ?? null,
      meetingId: meetingId ?? null,
    });
  }

  private retry = () => {
    this.setState((prev) => ({
      error: null,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    const { error, retryKey } = this.state;
    if (error) {
      const { title, body, retryLabel, leaveLabel, onLeave } = this.props;

      return (
        <div
          className="grid min-h-[100svh] place-items-center bg-[var(--brand-bg-solid)] px-6"
          role="alert"
        >
          <div className="w-full max-w-md rounded-3xl glass-strong p-8 text-center shadow-lift">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              {title}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">{body}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={this.retry}>
                {retryLabel}
              </Button>
              {onLeave ? (
                <Button size="lg" variant="outline" onClick={onLeave}>
                  {leaveLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    return <div key={retryKey}>{this.props.children}</div>;
  }
}

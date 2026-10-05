"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import {
  clientErrorDetails,
  reportDisconnectTelemetry,
} from "@/lib/disconnect-telemetry";
import {
  canAutoReload,
  isChunkLoadError,
  markAutoReload,
} from "@/lib/chunk-reload";

type Props = {
  children: ReactNode;
  title: string;
  body: string;
  retryLabel: string;
  leaveLabel: string;
  onLeave?: () => void;
  /** Meeting slug, used to correlate console logs and telemetry. */
  slug?: string;
  /** Meeting id, used to correlate console logs and telemetry. */
  meetingId?: string;
};

type State = {
  error: Error | null;
  /** A stale chunk after a redeploy: the page reloads instead of showing the crash screen. */
  reloading: boolean;
  /** Bumped on retry so children remount a clean LiveKit session. */
  retryKey: number;
};

export class MeetingRoomErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      error,
      reloading: isChunkLoadError(error) && canAutoReload(),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { slug, meetingId } = this.props;
    const reload = this.state.reloading && markAutoReload();
    console.error("[MeetingRoomErrorBoundary]", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      componentStack: info.componentStack,
      slug: slug ?? null,
      meetingId: meetingId ?? null,
      reloading: reload,
    });
    if (slug) {
      reportDisconnectTelemetry({
        event: "client_error",
        slug,
        meetingId,
        error: { ...clientErrorDetails(error, info.componentStack), reloaded: reload },
      });
    }
    if (reload) {
      window.location.reload();
    } else if (this.state.reloading) {
      this.setState({ reloading: false });
    }
  }

  private retry = () => {
    this.setState((prev) => ({
      error: null,
      reloading: false,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    const { error, reloading, retryKey } = this.state;
    if (error && reloading) {
      return <div className="min-h-[100svh] bg-[var(--brand-bg-solid)]" aria-busy="true" />;
    }
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

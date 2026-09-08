"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  children: ReactNode;
  title: string;
  body: string;
  retryLabel: string;
  leaveLabel: string;
  onLeave?: () => void;
};

export class MeetingRoomErrorBoundary extends Component<
  Props,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

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
            <Button size="lg" onClick={this.retry}>{retryLabel}</Button>
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
}

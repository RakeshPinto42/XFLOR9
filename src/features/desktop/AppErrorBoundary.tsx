"use client";

import { Component, type ReactNode } from "react";

/**
 * Crash isolation for one window. If an application fails (an error while drawing, or its code
 * couldn't be loaded), only its window shows the problem; the desktop, the other windows and
 * anything playing carry on. Restart mounts the application again; Close closes its window.
 */
interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}
interface State {
  error: Error | null;
  attempt: number;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    // Kept to the console for diagnosis; nothing about it leaves the browser.
    console.error(`[xplor9] ${this.props.title} stopped working:`, error);
  }

  restart = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    const { error, attempt } = this.state;
    if (!error) return <div key={attempt} className="contents">{this.props.children}</div>;
    const loadFailed = /chunk|dynamically imported module|failed to fetch|importing a module script/i.test(`${error.name} ${error.message}`);
    return (
      <div className="xp-crash" role="alert" data-testid="app-crashed">
        <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden>
          <circle cx="24" cy="24" r="20" fill="#e2492f" stroke="#7c1d0e" strokeWidth="2" />
          <path d="M16 16l16 16M32 16L16 32" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        </svg>
        <div className="min-w-0">
          <h3>{this.props.title} has stopped working</h3>
          <p>
            {loadFailed
              ? "Its program couldn't be loaded. Check your internet connection, then restart it."
              : "Something went wrong inside it. Your other programs, and anything that's playing, carry on."}
          </p>
          <p>
            If restarting doesn&apos;t help,{" "}
            <button type="button" className="xp-link" onClick={() => window.location.reload()}>
              reload XPLOR9
            </button>{" "}
            (your open windows come back).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="xp-button xp-button--primary" onClick={this.restart}>
              Restart {this.props.title}
            </button>
            <button type="button" className="xp-button" onClick={this.props.onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
}

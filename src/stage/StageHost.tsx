"use client";

import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { chooseMode, QUALITY_LABELS, QUALITY_PREFERENCES, type QualityMode } from "@/engine/quality";
import { useLocalStore } from "@/lib/storage/store";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { FullStage } from "./FullStage";
import type { SceneEntry } from "./registry";
import { debugRequested, qualityPreference, readSignals, subscribeSignals } from "./signals";

const noSubscribe = () => () => {};

/**
 * Hosts the scene for the current page in Full, Lite or Still mode. Lives in its own chunk
 * (with three.js) and stays mounted while moving between pages that have scenes.
 */
export function StageHost({ scene }: { scene: SceneEntry }) {
  const pref = useLocalStore(qualityPreference);
  // Device signals are re-read when the reduced-motion setting changes.
  const signalsKey = useSyncExternalStore(subscribeSignals, () => JSON.stringify(readSignals()), () => "");
  const decision = signalsKey ? chooseMode(pref, JSON.parse(signalsKey)) : null;
  const debug = useSyncExternalStore(noSubscribe, debugRequested, () => false);
  // Set when Full can't continue (context lost, load error, too slow): fall back for this visit.
  const [fallback, setFallbackState] = useState<{ reason: string } | null>(null);
  // The first reason wins: leaving Full disposes the renderer, which itself fires a
  // "context lost" event that must not overwrite why we left (found in testing).
  const setFallback = (next: { reason: string }) => setFallbackState((prev) => prev ?? next);
  const [showPanel, setShowPanel] = useState(false);

  // While a scene is showing, the site header and footer get a readable backdrop (globals.css).
  useEffect(() => {
    document.documentElement.dataset.stageActive = "true";
    return () => {
      delete document.documentElement.dataset.stageActive;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`" && !(e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) setShowPanel((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!decision) return null;
  const mode: QualityMode = fallback && decision.mode === "full" ? "lite" : decision.mode;
  const reason = fallback && decision.mode === "full" ? fallback.reason : decision.reason;

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-screen" data-testid="stage" data-mode={mode} data-scene={scene.id} aria-hidden="true">
        {mode === "full" ? (
          <SceneErrorBoundary key={scene.id} onError={() => setFallback({ reason: "The 3D scene couldn't load, so a still view is shown." })}>
            <FullStage
              scene={scene}
              debug={debug}
              onFallback={(r) => setFallback({ reason: r })}
            />
          </SceneErrorBoundary>
        ) : (
          <PosterView scene={scene} animate={mode === "lite"} />
        )}
      </div>
      <QualityPanel mode={mode} reason={reason} pref={pref} />
      {(debug || showPanel) && <DiagnosticsPanel mode={mode} reason={reason} scene={scene} />}
    </>
  );
}

/** Lite and Still: an image rendered from the scene itself. Lite adds gentle CSS rain and glow. */
function PosterView({ scene, animate }: { scene: SceneEntry; animate: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed scene image; next/image adds nothing here */}
      <img src={scene.poster} alt="" className="h-full w-full object-cover" data-testid="stage-poster" />
      {animate && <div className="stage-lite-rain absolute inset-0" data-testid="stage-lite-motion" />}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.45))]" />
    </div>
  );
}

function QualityPanel({ mode, reason, pref }: { mode: QualityMode; reason: string; pref: string }) {
  return (
    <section
      aria-label="Scene quality"
      className="fixed bottom-4 left-4 z-20 max-w-xs rounded-2xl bg-ink/85 p-3 text-sm text-panel shadow-lg backdrop-blur"
    >
      <fieldset>
        <legend className="mb-1.5 font-semibold">Scene quality</legend>
        <div className="flex flex-wrap gap-1.5">
          {QUALITY_PREFERENCES.map((p) => (
            <label
              key={p}
              className="cursor-pointer rounded-full border border-panel/40 px-3 py-1 has-[:checked]:bg-panel has-[:checked]:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
            >
              <input type="radio" name="scene-quality" value={p} checked={pref === p} onChange={() => qualityPreference.set(p)} className="sr-only" />
              {QUALITY_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-2 text-xs text-panel/80" aria-live="polite" data-testid="stage-reason">
        Showing {QUALITY_LABELS[mode]}. {reason}
      </p>
    </section>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[stage] scene failed", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

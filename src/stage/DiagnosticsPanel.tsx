"use client";

import { useSyncExternalStore } from "react";
import type { QualityMode } from "@/engine/quality";
import { stageStats } from "./diagnostics";
import type { SceneEntry } from "./registry";

/** Developer diagnostics (development, ?stage-debug, or the ` key). Stats are also exposed as data for tests. */
export function DiagnosticsPanel({ mode, reason, scene }: { mode: QualityMode; reason: string; scene: SceneEntry }) {
  const s = useSyncExternalStore(stageStats.subscribe, stageStats.get, stageStats.server);
  const rows: [string, string | number][] = [
    ["Scene", scene.id],
    ["Mode", mode],
    ["Why", reason],
    ["Level", s.level],
    ["FPS", s.fps],
    ["Frame", `${s.frameMs} ms`],
    ["Draw calls", s.drawCalls],
    ["Triangles", s.triangles.toLocaleString()],
    ["Geometries", s.geometries],
    ["Textures", s.textures],
    ["Pixel ratio", s.dpr],
  ];
  return (
    <aside
      aria-label="Scene diagnostics"
      className="fixed right-4 top-20 z-20 w-64 rounded-xl bg-black/80 p-3 font-mono text-xs text-[#c8ffe4] shadow-lg"
      data-testid="stage-diagnostics"
      data-stats={JSON.stringify({ ...s, mode })}
    >
      <p className="mb-1 font-semibold">Stage diagnostics</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[#c8ffe4]/70">{k}</dt>
            <dd className="truncate" title={String(v)}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {mode === "full" && <p className="mt-2 text-[#c8ffe4]/70">Drag to orbit, scroll to zoom. Press ` to hide.</p>}
    </aside>
  );
}

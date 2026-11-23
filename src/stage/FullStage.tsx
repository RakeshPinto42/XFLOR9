"use client";

import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { AdaptiveQuality, QUALITY_LEVELS } from "@/engine/adaptive";
import { stageStats } from "./diagnostics";
import type { SceneEntry, SceneProps } from "./registry";

/**
 * Full mode: one WebGL canvas for whichever scene the page asks for. Rendering pauses while the
 * tab is hidden; frame times drive adaptive quality; loss of the GPU context falls back to Lite.
 */
export function FullStage({
  scene,
  debug,
  onFallback,
}: {
  scene: SceneEntry;
  debug: boolean;
  onFallback: (reason: string) => void;
}) {
  const [levelIndex, setLevelIndex] = useState(0);
  const level = QUALITY_LEVELS[levelIndex];
  const [visible, setVisible] = useState(true);
  // One lazy component per scene id (stable across renders).
  const Scene = useMemo(() => lazy(scene.load) as ComponentType<SceneProps>, [scene]);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => () => stageStats.reset(), []);

  return (
    <>
      <Canvas
        className={debug ? "" : "pointer-events-none"}
        frameloop={visible ? "always" : "never"}
        dpr={[1, level.maxDpr]}
        // "percentage" = PCF shadows (three r187 removed the soft PCF variant R3F uses for `true`).
        shadows={level.shadows ? "percentage" : false}
        gl={{ antialias: true, powerPreference: "high-performance", outputColorSpace: SRGBColorSpace, toneMapping: ACESFilmicToneMapping }}
        camera={{ fov: 45, near: 0.05, far: 60, position: [0, 1.4, 4.2] }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onFallback("The graphics card stopped the 3D view, so a still view is shown.");
          });
        }}
      >
        <Suspense fallback={null}>
          <Scene level={level} />
        </Suspense>
        <Adaptive
          onLevel={setLevelIndex}
          onTooSlow={() => onFallback("3D was running slowly on this device, so Lite is shown instead.")}
        />
        <StatsProbe level={level.name} />
        <CaptureHook />
        {debug && <OrbitControls makeDefault target={[0, 1.1, 0]} />}
      </Canvas>
      <LoadingOverlay />
    </>
  );
}

function Adaptive({ onLevel, onTooSlow }: { onLevel: (i: number) => void; onTooSlow: () => void }) {
  const adaptive = useRef(new AdaptiveQuality());
  // Test hook: ?stage-simulate-slow=<ms> adds that much to every measured frame.
  const extra = useRef(0);
  useEffect(() => {
    const v = Number(new URLSearchParams(window.location.search).get("stage-simulate-slow"));
    extra.current = Number.isFinite(v) && v > 0 ? Math.min(v, 200) : 0;
  }, []);
  useFrame((_, delta) => {
    const event = adaptive.current.frame(delta * 1000 + extra.current);
    if (!event) return;
    if (event.type === "suggest-lite") onTooSlow();
    else onLevel(event.level);
  });
  return null;
}

function StatsProbe({ level }: { level: string }) {
  const { gl } = useThree();
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, delta) => {
    acc.current.frames += 1;
    acc.current.time += delta;
    if (acc.current.time < 0.5) return;
    const { frames, time } = acc.current;
    acc.current = { frames: 0, time: 0 };
    stageStats.set({
      fps: Math.round(frames / time),
      frameMs: Math.round((time / frames) * 1000 * 10) / 10,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      dpr: gl.getPixelRatio(),
      level,
    });
  });
  return null;
}

/**
 * With ?stage-capture, exposes a function that renders the current frame and returns it as a
 * WebP data URL. Used by scripts/stage/capture-poster.ts to make the Lite/Still images from
 * the real scene (so the fallbacks always match it).
 */
function CaptureHook() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("stage-capture")) return;
    const w = window as unknown as { __xplor9CaptureScene?: (quality?: number) => string };
    w.__xplor9CaptureScene = (quality = 0.86) => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/webp", quality);
    };
    return () => {
      delete w.__xplor9CaptureScene;
    };
  }, [gl, scene, camera]);
  return null;
}

/** Loading progress for scene assets, shown as ordinary page content (not inside the canvas). */
function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="absolute inset-x-0 bottom-24 grid place-items-center" role="status" data-testid="stage-loading">
      <p className="rounded-full bg-ink/80 px-4 py-2 text-sm font-semibold text-panel">Loading the scene… {Math.round(progress)}%</p>
    </div>
  );
}

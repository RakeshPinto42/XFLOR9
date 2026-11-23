"use client";

import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, lazy, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { assetProgress, knownAssets } from "./assets";
import { parseScene } from "@/engine/scene/format";
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
  // One lazy component per scene id (stable across renders): loads the renderer and the scene
  // file together, and validates the file first (an invalid file falls back to Lite with a reason).
  const Scene = useMemo(
    () =>
      lazy(async () => {
        const [renderer, file] = await Promise.all([scene.load(), scene.document()]);
        const document = parseScene(file.default, knownAssets());
        const Renderer = renderer.default;
        function SceneFromFile(props: Omit<SceneProps, "document">) {
          return <Renderer {...props} document={document} />;
        }
        return { default: SceneFromFile };
      }) as ComponentType<Omit<SceneProps, "document">>,
    [scene],
  );

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
          <Scene level={level} debug={debug} />
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

const WARM_UP_SECONDS = 2;

function Adaptive({ onLevel, onTooSlow }: { onLevel: (i: number) => void; onTooSlow: () => void }) {
  const adaptive = useRef(new AdaptiveQuality());
  // Test hook: ?stage-simulate-slow=<ms> adds that much to every measured frame.
  const extra = useRef(0);
  useEffect(() => {
    const v = Number(new URLSearchParams(window.location.search).get("stage-simulate-slow"));
    extra.current = Number.isFinite(v) && v > 0 ? Math.min(v, 200) : 0;
  }, []);
  // Frames while assets download/decode (and a short warm-up after, for shader compilation) say
  // nothing about the device's steady-state speed, so they aren't judged.
  const settledAt = useRef<number | null>(null);
  useFrame((state, delta) => {
    if (assetProgress.get().active) {
      settledAt.current = null;
      return;
    }
    settledAt.current ??= state.clock.elapsedTime;
    if (state.clock.elapsedTime - settledAt.current < WARM_UP_SECONDS) return;
    const event = adaptive.current.frame(delta * 1000 + extra.current);
    if (!event) return;
    if (event.type === "suggest-lite") onTooSlow();
    else onLevel(event.level);
  });
  return null;
}

function StatsProbe({ level }: { level: string }) {
  const { gl } = useThree();
  const getState = useThree((s) => s.get);
  const acc = useRef({ frames: 0, time: 0 });
  const frame = useRef({ calls: 0, triangles: 0 });
  // Count every render pass of a frame (post-processing renders several): three's automatic
  // reset would otherwise leave only the last full-screen pass (1 draw call) in the counters.
  useEffect(() => {
    const info = getState().gl.info;
    info.autoReset = false;
    return () => {
      info.autoReset = true;
    };
  }, [getState]);
  useFrame((_, delta) => {
    // useFrame runs before this frame renders: the counters now hold the whole previous frame.
    frame.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
    acc.current.frames += 1;
    acc.current.time += delta;
    if (acc.current.time < 0.5) return;
    const { frames, time } = acc.current;
    acc.current = { frames: 0, time: 0 };
    stageStats.set({
      fps: Math.round(frames / time),
      frameMs: Math.round((time / frames) * 1000 * 10) / 10,
      drawCalls: frame.current.calls,
      triangles: frame.current.triangles,
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
  // Models from the asset manifest report byte progress; anything loaded through three's
  // default loading manager (e.g. drei helpers) reports through useProgress.
  const models = useSyncExternalStore(assetProgress.subscribe, assetProgress.get, assetProgress.server);
  const other = useProgress();
  if (!models.active && !other.active) return null;
  const percent = models.active && models.total > 0 ? (models.loaded / models.total) * 100 : other.progress;
  return (
    <div className="absolute inset-x-0 bottom-24 grid place-items-center" role="status" data-testid="stage-loading">
      <p className="rounded-full bg-ink/80 px-4 py-2 text-sm font-semibold text-panel">Loading the scene… {Math.round(percent)}%</p>
    </div>
  );
}

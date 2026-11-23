"use client";

import { use, useEffect, useMemo } from "react";
import { Mesh, type Material, type Object3D, type Texture } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import manifestJson from "../../content/assets/manifest.json";
import { parseAssetManifest, type AssetRecord } from "@/engine/assets";
import { GlbError, readGlbSummary, unsupportedRequired } from "@/engine/glb";
import { ResourceTracker } from "@/engine/resources";

/**
 * Loading 3D models from the asset manifest. Each model is fetched once (with byte progress),
 * checked for supported extensions BEFORE parsing, decoded with our self-hosted Draco decoder,
 * shared between users, and disposed when the last user unmounts.
 */

const MANIFEST = new Map(parseAssetManifest(manifestJson).map((a) => [a.id, a]));

export function assetRecord(id: string): AssetRecord {
  const rec = MANIFEST.get(id);
  if (!rec) throw new Error(`Unknown asset "${id}" (not in content/assets/manifest.json)`);
  return rec;
}

let loader: GLTFLoader | null = null;
function gltfLoader(): GLTFLoader {
  if (loader) return loader;
  const dracoLoader = new DRACOLoader();
  // Our own origin, version-matched to three (scripts/assets/sync-draco.ts). The WebAssembly
  // decoder is the default when available (setDecoderConfig is deprecated in r187).
  dracoLoader.setDecoderPath("/draco/");
  loader = new GLTFLoader().setDRACOLoader(dracoLoader);
  return loader;
}

// ---- progress (shown by the stage's loading overlay) --------------------------------------
type Progress = { active: boolean; loaded: number; total: number };
let progress: Progress = { active: false, loaded: 0, total: 0 };
const inflight = new Map<string, { loaded: number; total: number }>();
const listeners = new Set<() => void>();
function publish() {
  let loaded = 0;
  let total = 0;
  for (const p of inflight.values()) {
    loaded += p.loaded;
    total += p.total;
  }
  progress = { active: inflight.size > 0, loaded, total };
  listeners.forEach((l) => l());
}
export const assetProgress = {
  get: () => progress,
  server: (): Progress => ({ active: false, loaded: 0, total: 0 }),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

async function fetchWithProgress(id: string, url: string, expectedBytes: number): Promise<ArrayBuffer> {
  inflight.set(id, { loaded: 0, total: expectedBytes });
  publish();
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Couldn't download ${id} (HTTP ${res.status})`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      inflight.set(id, { loaded, total: Math.max(expectedBytes, loaded) });
      publish();
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out.buffer;
  } finally {
    inflight.delete(id);
    publish();
  }
}

export class UnsupportedAssetError extends Error {}

const cache = new Map<string, Promise<GLTF>>();

/** Loads (once) and returns the model. Rejects clearly if it needs an unsupported extension. */
export function loadModel(id: string): Promise<GLTF> {
  const existing = cache.get(id);
  if (existing) return existing;
  const rec = assetRecord(id);
  const promise = (async () => {
    const buffer = await fetchWithProgress(id, rec.file.path, rec.file.bytes);
    let missing: string[];
    try {
      missing = unsupportedRequired(readGlbSummary(buffer));
    } catch (e) {
      throw new UnsupportedAssetError(`${id}: ${e instanceof GlbError ? e.message : "not a valid GLB"}`);
    }
    if (missing.length) throw new UnsupportedAssetError(`${id} needs ${missing.join(", ")}, which XPLOR9 can't decode yet.`);
    return gltfLoader().parseAsync(buffer, "");
  })();
  // A failed load stays cached for this visit: React's use() must see the SAME rejected promise to
  // surface the error (a fresh promise on every retry would suspend forever; found in testing).
  // Reloading the page retries.
  cache.set(id, promise);
  return promise;
}

const MAP_KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap"] as const;

function disposeObject(root: Object3D) {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    const materials: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materials) {
      for (const key of MAP_KEYS) (m as unknown as Record<string, Texture | undefined>)[key]?.dispose();
      m.dispose();
    }
  });
}

const users = new ResourceTracker<string>((id) => {
  const p = cache.get(id);
  cache.delete(id);
  void p?.then((gltf) => disposeObject(gltf.scene)).catch(() => {});
});

/**
 * Suspends until the model is ready; returns this component's own copy of the scene graph
 * (geometry, materials and textures are shared, not duplicated). Shadows on by default.
 */
export function useModel(id: string, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): Object3D {
  const gltf = use(loadModel(id));
  useEffect(() => {
    users.acquire(id, () => id);
    return () => {
      users.release(id);
    };
  }, [id]);
  const { castShadow = true, receiveShadow = true } = opts;
  return useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = castShadow;
        o.receiveShadow = receiveShadow;
      }
    });
    return copy;
  }, [gltf, castShadow, receiveShadow]);
}

/** Assets currently held by scenes (for diagnostics). */
export function heldAssets(): AssetRecord[] {
  return users.keys().map((id) => assetRecord(id));
}

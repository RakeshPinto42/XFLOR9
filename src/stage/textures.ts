"use client";

import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import { BoxGeometry, PlaneGeometry, RepeatWrapping, SRGBColorSpace, type BufferGeometry, type Texture } from "three";
import { textureRecord } from "./assets";

/**
 * PBR texture sets from the asset manifest. Each set is loaded ONCE and shared by every surface
 * (separate texture objects per surface would each become a separate GPU texture). True scale
 * comes from the geometry instead: the helpers below set UVs so 1 UV unit = the texture's
 * real-world size in metres.
 *
 *   const plaster = useTextureSet("mossy-plaster");
 *   const wall = useMemo(() => worldBox(6, 3, 0.25, plaster.tile), [plaster.tile]);
 *   <mesh geometry={wall}><meshStandardMaterial {...plaster.maps} /></mesh>
 */
export interface TextureSet {
  maps: { map: Texture; normalMap: Texture; aoMap: Texture; roughnessMap: Texture; metalnessMap: Texture };
  /** Real-world metres covered by one repeat of the texture. */
  tile: number;
}

const prepared = new WeakSet<Texture>();

export function useTextureSet(id: string): TextureSet {
  const rec = textureRecord(id);
  const path = (m: string) => rec.maps.find((x) => x.map === m)?.path ?? "";
  const [diff, nor, arm] = useTexture([path("diff"), path("nor_gl"), path("arm")]);
  return useMemo(() => {
    for (const [t, colour] of [[diff, true], [nor, false], [arm, false]] as const) {
      if (prepared.has(t)) continue;
      t.wrapS = t.wrapT = RepeatWrapping;
      if (colour) t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
      prepared.add(t);
    }
    return { maps: { map: diff, normalMap: nor, aoMap: arm, roughnessMap: arm, metalnessMap: arm }, tile: rec.realWorldMetres };
  }, [diff, nor, arm, rec.realWorldMetres]);
}

function scaleUVs(geometry: BufferGeometry, sx: number, sy: number, from = 0, count = Infinity) {
  const uv = geometry.getAttribute("uv");
  const end = Math.min(uv.count, from + count);
  for (let i = from; i < end; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  // aoMap uses the same UVs
  geometry.setAttribute("uv1", uv.clone());
  return geometry;
}

/** A plane whose texture keeps real-world scale. */
export function worldPlane(width: number, height: number, tile: number, segments: [number, number] = [1, 1]): PlaneGeometry {
  return scaleUVs(new PlaneGeometry(width, height, segments[0], segments[1]), width / tile, height / tile) as PlaneGeometry;
}

/** A box whose texture keeps real-world scale on every face. */
export function worldBox(width: number, height: number, depth: number, tile: number): BoxGeometry {
  const g = new BoxGeometry(width, height, depth);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 vertices per face (1 segment).
  const faces: [number, number][] = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  faces.forEach(([a, b], i) => scaleUVs(g, a / tile, b / tile, i * 4, 4));
  return g;
}

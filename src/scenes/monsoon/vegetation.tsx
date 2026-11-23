"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { atmosphere, seeded } from "./atmosphere";

// ---------- generated textures (original artwork, drawn once at load) ----------------------

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}
function toTexture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const GREENS = ["#24502c", "#2d5f34", "#386f3a", "#437d3e", "#1f4626", "#4f8a44"];

/** A cluster of glossy, pointed leaves (mango/neem-like canopy). */
function leafClusterTexture() {
  const [c, x] = canvas(256, 256);
  const rnd = seeded(101);
  for (let i = 0; i < 26; i++) {
    const cx = 40 + rnd() * 176;
    const cy = 40 + rnd() * 176;
    const len = 46 + rnd() * 40;
    const wid = len * (0.26 + rnd() * 0.08);
    const ang = rnd() * Math.PI * 2;
    x.save();
    x.translate(cx, cy);
    x.rotate(ang);
    x.beginPath();
    x.moveTo(-len / 2, 0);
    x.quadraticCurveTo(0, -wid, len / 2, 0);
    x.quadraticCurveTo(0, wid, -len / 2, 0);
    x.fillStyle = GREENS[Math.floor(rnd() * GREENS.length)];
    x.fill();
    x.strokeStyle = "rgba(160,190,140,0.35)";
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(-len / 2, 0);
    x.lineTo(len / 2, 0);
    x.stroke();
    x.restore();
  }
  return toTexture(c);
}

/** A coconut frond: a central rib with many narrow leaflets angled forward. */
function frondTexture() {
  const [c, x] = canvas(128, 512);
  const rnd = seeded(202);
  x.strokeStyle = "#5c5a33";
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(64, 512);
  x.lineTo(64, 0);
  x.stroke();
  for (let y = 500; y > 8; y -= 9) {
    const t = y / 512;
    const len = 58 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 6;
    for (const side of [-1, 1]) {
      x.strokeStyle = GREENS[Math.floor(rnd() * 4)];
      x.lineWidth = 3.2;
      x.beginPath();
      x.moveTo(64, y);
      x.quadraticCurveTo(64 + side * len * 0.6, y - 10, 64 + side * len, y - 26 - rnd() * 8);
      x.stroke();
    }
  }
  return toTexture(c);
}

/** A broad banana leaf with a pale midrib and the wind tears typical of banana plants. */
function bananaLeafTexture() {
  const [c, x] = canvas(256, 512);
  const rnd = seeded(303);
  x.beginPath();
  x.moveTo(128, 506);
  x.bezierCurveTo(250, 420, 250, 90, 128, 6);
  x.bezierCurveTo(6, 90, 6, 420, 128, 506);
  x.fillStyle = "#3c6b33";
  x.fill();
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, "rgba(10,30,10,0.45)");
  g.addColorStop(0.5, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(10,30,10,0.45)");
  x.fillStyle = g;
  x.fill();
  // Tears: transparent cuts running from the midrib to the edge.
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 9; i++) {
    const y = 60 + rnd() * 400;
    const side = rnd() < 0.5 ? -1 : 1;
    x.lineWidth = 2.5;
    x.beginPath();
    x.moveTo(128 + side * (20 + rnd() * 30), y);
    x.lineTo(128 + side * 140, y - 18);
    x.stroke();
  }
  x.globalCompositeOperation = "source-over";
  x.strokeStyle = "#a8b783";
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(128, 506);
  x.lineTo(128, 10);
  x.stroke();
  return toTexture(c);
}

/** Wet bark with vertical grain; palm trunks add growth rings. */
function barkTexture(rings: boolean) {
  const [c, x] = canvas(128, 256);
  const rnd = seeded(rings ? 404 : 505);
  x.fillStyle = rings ? "#5a5148" : "#3f3830";
  x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 160; i++) {
    x.strokeStyle = `rgba(${rnd() < 0.5 ? "20,16,12" : "110,100,88"},${0.15 + rnd() * 0.25})`;
    x.lineWidth = 1 + rnd() * 2;
    const px = rnd() * 128;
    x.beginPath();
    x.moveTo(px, 0);
    x.lineTo(px + (rnd() - 0.5) * 10, 256);
    x.stroke();
  }
  if (rings)
    for (let y = 0; y < 256; y += 10 + rnd() * 6) {
      x.fillStyle = "rgba(25,20,15,0.45)";
      x.fillRect(0, y, 128, 2);
    }
  const t = toTexture(c);
  t.wrapS = t.wrapT = 1000; // RepeatWrapping
  return t;
}

// ---------- wind ----------------------------------------------------------------------------

/**
 * Adds wind sway to a standard material. Displacement grows with height inside the plant
 * (`aboveGround` from the vertex's world height) and varies by position, so neighbouring plants
 * don't move in lockstep. Uses the shared clock and gusts from the atmosphere.
 */
function windy(material: MeshStandardMaterial, strength: number, flutter: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = atmosphere.uniforms.uTime;
    shader.uniforms.uWind = atmosphere.uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 anchor = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 worldNow = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vec3 anchor = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 worldNow = (modelMatrix * vec4(position, 1.0)).xyz;
        #endif
        float h = max(0.0, worldNow.y);
        float phase = anchor.x * 0.37 + anchor.z * 0.21;
        float sway = sin(uTime * 1.1 + phase) * 0.6 + sin(uTime * 2.3 + phase * 1.7) * 0.3;
        float flick = sin(uTime * 7.0 + worldNow.x * 3.1 + worldNow.z * 2.7) * ${flutter.toFixed(3)};
        transformed.x += (sway * ${strength.toFixed(3)} * h * 0.06 + flick) * uWind;
        transformed.z += (sway * ${strength.toFixed(3)} * h * 0.03 - flick * 0.5) * uWind;`,
      );
  };
  return material;
}

// ---------- layout types ---------------------------------------------------------------------

export interface Tree {
  kind: "canopy" | "palm" | "banana" | "bush";
  x: number;
  z: number;
  scale: number;
  seed: number;
}

/** Writes instance transforms (and per-instance colour variation) into an InstancedMesh. */
function useInstances(ref: React.RefObject<InstancedMesh | null>, matrices: Matrix4[], colours?: Color[]) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    colours?.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, matrices, colours]);
}

// ---------- the vegetation (all trees of each kind share one draw call per part) -------------

export function Vegetation({ trees }: { trees: Tree[] }) {
  const textures = useMemo(
    () => ({ cluster: leafClusterTexture(), frond: frondTexture(), banana: bananaLeafTexture(), bark: barkTexture(false), palmBark: barkTexture(true) }),
    [],
  );
  const materials = useMemo(
    () => ({
      cluster: windy(new MeshStandardMaterial({ map: textures.cluster, alphaTest: 0.45, side: DoubleSide, roughness: 0.55, color: "#e9f2e4" }), 0.5, 0.025),
      frond: windy(new MeshStandardMaterial({ map: textures.frond, alphaTest: 0.4, side: DoubleSide, roughness: 0.6 }), 1.2, 0.02),
      banana: windy(new MeshStandardMaterial({ map: textures.banana, alphaTest: 0.35, side: DoubleSide, roughness: 0.5 }), 0.9, 0.05),
      bark: new MeshStandardMaterial({ map: textures.bark, roughness: 0.8, color: "#a59a8c" }),
      palmBark: windy(new MeshStandardMaterial({ map: textures.palmBark, roughness: 0.75 }), 0.35, 0),
      stem: windy(new MeshStandardMaterial({ color: "#5c7a3e", roughness: 0.6 }), 0.5, 0),
    }),
    [textures],
  );

  const geometries = useMemo(() => {
    // A frond bent downward along its length.
    const frond = new PlaneGeometry(0.85, 3.4, 1, 10);
    frond.translate(0, 1.7, 0);
    const p = frond.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = y / 3.4;
      p.setZ(i, t * t * 1.6);
      p.setY(i, y - t * t * 0.9);
    }
    frond.rotateX(-Math.PI / 2 + 0.35);
    frond.computeVertexNormals();
    // A banana leaf: broad, arching up then drooping.
    const banana = new PlaneGeometry(0.75, 2.1, 1, 8);
    banana.translate(0, 1.05, 0);
    const b = banana.getAttribute("position");
    for (let i = 0; i < b.count; i++) {
      const t = b.getY(i) / 2.1;
      b.setZ(i, Math.sin(t * Math.PI * 0.9) * 0.5 + t * t * 0.6);
    }
    banana.computeVertexNormals();
    const trunk = new CylinderGeometry(0.14, 0.24, 1, 8, 1);
    trunk.translate(0, 0.5, 0);
    const stem = new CylinderGeometry(0.09, 0.13, 1, 6, 1);
    stem.translate(0, 0.5, 0);
    return { cluster: new PlaneGeometry(1.25, 1.25), frond, banana, trunk, stem };
  }, []);

  // ---- instance transforms from the layout (deterministic) ----
  const built = useMemo(() => {
    const o = new Object3D();
    const cluster: Matrix4[] = [];
    const clusterColour: Color[] = [];
    const frond: Matrix4[] = [];
    const banana: Matrix4[] = [];
    const trunk: Matrix4[] = [];
    const stem: Matrix4[] = [];
    const palmTrunks: BufferGeometry[] = [];
    const push = (list: Matrix4[]) => {
      o.updateMatrix();
      list.push(o.matrix.clone());
    };
    const tint = new Color();

    for (const t of trees) {
      const r = seeded(t.seed);
      const s = t.scale;
      if (t.kind === "canopy" || t.kind === "bush") {
        const bush = t.kind === "bush";
        const height = bush ? 0.2 : 3.4 * s;
        if (!bush) {
          // Trunk plus a few limbs reaching into the canopy.
          o.position.set(t.x, 0, t.z);
          o.rotation.set(0, r() * 6, 0);
          o.scale.set(s * 1.4, height, s * 1.4);
          push(trunk);
          for (let k = 0; k < 4; k++) {
            o.position.set(t.x, height * 0.85, t.z);
            o.rotation.set((r() - 0.5) * 1.6, r() * 6, (r() - 0.5) * 1.6);
            o.scale.set(s * 0.55, 2.3 * s, s * 0.55);
            push(trunk);
          }
        }
        // Dense canopy: leaf clusters filling a squashed ellipsoid.
        const rx = (bush ? 1.1 : 3.4) * s;
        const ry = (bush ? 0.8 : 2.6) * s;
        const cy = bush ? 0.6 : height + ry * 0.75;
        const n = Math.round((bush ? 34 : 260) * s);
        for (let k = 0; k < n; k++) {
          const u = r() * Math.PI * 2;
          const v = Math.acos(2 * r() - 1);
          const rad = Math.cbrt(0.35 + r() * 0.65);
          o.position.set(t.x + Math.sin(v) * Math.cos(u) * rx * rad, cy + Math.cos(v) * ry * rad, t.z + Math.sin(v) * Math.sin(u) * rx * rad);
          o.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
          const sc = (0.9 + r() * 0.6) * (bush ? 0.8 : 1.1) * Math.max(0.8, s);
          o.scale.set(sc, sc, sc);
          push(cluster);
          // Outer leaves slightly lighter (wet sheen), inner ones darker.
          const shade = 0.55 + rad * 0.55 + (r() - 0.5) * 0.15;
          clusterColour.push(tint.setRGB(shade * 0.92, shade, shade * 0.88).clone());
        }
      } else if (t.kind === "palm") {
        // Curved trunk leaning a little, crowned by drooping fronds.
        const height = 9 * s;
        const lean = new Vector3((r() - 0.5) * 2.4, 0, (r() - 0.5) * 2.4);
        const curve = new CatmullRomCurve3([
          new Vector3(t.x, 0, t.z),
          new Vector3(t.x + lean.x * 0.25, height * 0.4, t.z + lean.z * 0.25),
          new Vector3(t.x + lean.x * 0.7, height * 0.8, t.z + lean.z * 0.7),
          new Vector3(t.x + lean.x, height, t.z + lean.z),
        ]);
        const tube = new TubeGeometry(curve, 16, 0.17 * s, 7, false);
        const uv = tube.getAttribute("uv");
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * height * 0.8, uv.getY(i));
        palmTrunks.push(tube);
        const top = curve.getPoint(1);
        const fronds = 13 + Math.floor(r() * 4);
        for (let k = 0; k < fronds; k++) {
          o.position.copy(top);
          o.rotation.set((r() - 0.5) * 0.5, (k / fronds) * Math.PI * 2 + r() * 0.3, 0, "YXZ");
          const sc = s * (0.85 + r() * 0.3);
          o.scale.set(sc, sc, sc);
          push(frond);
        }
      } else if (t.kind === "banana") {
        const height = 1.7 * s;
        o.position.set(t.x, 0, t.z);
        o.rotation.set(0, 0, (r() - 0.5) * 0.15);
        o.scale.set(s, height, s);
        push(stem);
        const leaves = 7 + Math.floor(r() * 3);
        for (let k = 0; k < leaves; k++) {
          o.position.set(t.x, height * (0.8 + r() * 0.25), t.z);
          o.rotation.set(-0.35 - r() * 0.7, (k / leaves) * Math.PI * 2 + r() * 0.4, 0, "YXZ");
          const sc = s * (0.8 + r() * 0.4);
          o.scale.set(sc, sc, sc);
          push(banana);
        }
      }
    }
    return { cluster, clusterColour, frond, banana, trunk, stem, palmTrunk: palmTrunks.length ? mergeGeometries(palmTrunks) : null };
  }, [trees]);

  const clusterRef = useRef<InstancedMesh>(null);
  const frondRef = useRef<InstancedMesh>(null);
  const bananaRef = useRef<InstancedMesh>(null);
  const trunkRef = useRef<InstancedMesh>(null);
  const stemRef = useRef<InstancedMesh>(null);
  useInstances(clusterRef, built.cluster, built.clusterColour);
  useInstances(frondRef, built.frond);
  useInstances(bananaRef, built.banana);
  useInstances(trunkRef, built.trunk);
  useInstances(stemRef, built.stem);

  return (
    <group>
      <instancedMesh ref={clusterRef} args={[geometries.cluster, materials.cluster, built.cluster.length]} castShadow receiveShadow />
      <instancedMesh ref={frondRef} args={[geometries.frond, materials.frond, built.frond.length]} castShadow />
      <instancedMesh ref={bananaRef} args={[geometries.banana, materials.banana, built.banana.length]} castShadow receiveShadow />
      <instancedMesh ref={trunkRef} args={[geometries.trunk, materials.bark, built.trunk.length]} castShadow receiveShadow />
      <instancedMesh ref={stemRef} args={[geometries.stem, materials.stem, built.stem.length]} castShadow />
      {built.palmTrunk && <mesh geometry={built.palmTrunk} material={materials.palmBark} castShadow receiveShadow />}
    </group>
  );
}

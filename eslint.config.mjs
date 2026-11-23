import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // 3D scenes update three.js objects (materials, lights, instance buffers) every frame inside
    // useFrame: React Three Fiber's documented pattern. These objects live outside React state
    // on purpose, so the React Compiler's immutability rule doesn't apply to them.
    files: ["src/scenes/**/*.{ts,tsx}"],
    rules: { "react-hooks/immutability": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Security-suite build output and Playwright artefacts
    ".next-security/**",
    ".cache/**",
    // Vendored, version-matched copy of three.js's Draco decoder (scripts/assets/sync-draco.ts)
    "public/draco/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;

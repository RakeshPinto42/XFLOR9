import { READER_FONT_FACES, READER_FONT_STACK } from "./readerFonts";

/** Reader preferences (theme, text size). Tiny, so they live in localStorage, not IndexedDB. */

export type ReaderTheme = "light" | "warm" | "dark";

export interface ReaderSettings {
  theme: ReaderTheme;
  /** Text size as a percentage of the default. */
  fontScale: number;
}

export const FONT_SCALE_MIN = 80;
export const FONT_SCALE_MAX = 200;
export const FONT_SCALE_STEP = 10;
export const DEFAULT_SETTINGS: ReaderSettings = { theme: "light", fontScale: 100 };

/** Colours chosen for long reading; each pair is well above WCAG AAA contrast (7:1). */
export const THEMES: Record<ReaderTheme, { label: string; bg: string; text: string; muted: string; link: string }> = {
  light: { label: "Light", bg: "#fffcf4", text: "#1f2433", muted: "#5b6175", link: "#1f4fb8" },
  warm: { label: "Warm paper", bg: "#f2e4c4", text: "#3a2c1a", muted: "#6b5536", link: "#7a3c0c" },
  dark: { label: "Dark", bg: "#141a2c", text: "#e9e3d3", muted: "#a9a493", link: "#9fc2ff" },
};

export function clampFontScale(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_SETTINGS.fontScale;
  const stepped = Math.round(v / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, stepped));
}

/** Validates saved settings (localStorage may hold anything). */
export function parseSettings(raw: unknown): ReaderSettings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    theme: r.theme === "warm" || r.theme === "dark" ? r.theme : "light",
    fontScale: typeof r.fontScale === "number" ? clampFontScale(r.fontScale) : DEFAULT_SETTINGS.fontScale,
  };
}

/**
 * Stylesheet injected into every book page. It sets our fonts, theme colours and text size;
 * the book's own layout (headings, italics, indents) is otherwise kept.
 *
 * `origin` must be the site's origin (e.g. "https://xplor9.example"): book pages are blob:
 * documents, and relative URLs like "/fonts/..." cannot be resolved from a blob: address,
 * so font files would silently fail to load (found in browser testing).
 */
export function bookStylesheet({ theme, fontScale }: ReaderSettings, origin: string): string {
  const t = THEMES[theme];
  const faces = READER_FONT_FACES.replaceAll('url("/fonts/', `url("${origin}/fonts/`);
  return `${faces}
html {
  color-scheme: ${theme === "dark" ? "dark" : "light"};
  font-size: ${clampFontScale(fontScale)}% !important;
  background: ${t.bg} !important;
}
body {
  background: ${t.bg} !important;
  color: ${t.text} !important;
  font-family: ${READER_FONT_STACK} !important;
  font-size: 1.15rem !important;
  line-height: 1.7 !important;
  font-kerning: normal;
  text-rendering: optimizeLegibility;
}
p, li, blockquote, dd { line-height: 1.7 !important; text-align: start !important; hyphens: auto; widows: 2; orphans: 2; }
h1, h2, h3, h4, h5, h6 { color: ${t.text} !important; line-height: 1.3 !important; font-family: ${READER_FONT_STACK} !important; }
a:link, a:visited { color: ${t.link} !important; }
img, svg { max-width: 100%; height: auto; }
pre { white-space: pre-wrap !important; }
::selection { background: ${theme === "dark" ? "#3d4f86" : "#ffd98a"}; }
`;
}

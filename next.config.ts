import type { NextConfig } from "next";

/**
 * Who may embed the isolated reader (/isolated/*). Production: the configured main origin.
 * Local development: any localhost port (the reader itself runs on 127.0.0.1, a different origin).
 */
const MAIN_ORIGIN = process.env.NEXT_PUBLIC_XPLOR9_ORIGIN || "http://localhost:*";
/** The reader's own origin, named explicitly for fonts (see font-src below). */
const READER_ORIGIN = process.env.NEXT_PUBLIC_XPLOR9_READER_ORIGIN || "http://127.0.0.1:*";
const isDev = process.env.NODE_ENV === "development";

/**
 * Policy for the isolated reader page. Its origin holds no user data, so the main protection is
 * the separate origin itself; this header adds: only XPLOR9 may frame it, no plugins, no forms,
 * no base-URL tricks, and network access only to its own origin and in-memory blobs.
 */
const ISOLATED_READER_CSP = [
  // 'self': book pages are blob: documents that inherit this policy, and their parent is the
  // reader itself. WebKit enforces the inherited rule; without 'self' it refuses every page.
  `frame-ancestors 'self' ${MAIN_ORIGIN}`,
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`, // Next.js bootstraps with inline scripts
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' blob: data:",
  // Book pages are blob: documents that inherit this policy; Firefox doesn't match 'self' there,
  // so the reader origin is named explicitly or every reader font is blocked (found in R5).
  `font-src 'self' blob: data: ${READER_ORIGIN}`,
  "media-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src blob:",
  "child-src blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The security suite builds (with its test-only harness page) into a separate folder, so a
  // normal `next start`/deploy can never pick up that build.
  distDir: process.env.XPLOR9_DIST_DIR || ".next",
  // Development only: the isolated reader runs on 127.0.0.1 while the app runs on localhost.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The modules now open as windows on the desktop; old addresses open the right window.
  async redirects() {
    return ["radio", "tv", "music", "games", "video"].map((app) => ({ source: `/${app}`, destination: `/?open=${app}`, permanent: false }));
  },
  async headers() {
    return [
      {
        source: "/isolated/:path*",
        headers: [
          { key: "Content-Security-Policy", value: ISOLATED_READER_CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

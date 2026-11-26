import { useId } from "react";
import type { AppId } from "./apps";

/**
 * Original desktop icons, drawn for XPLOR9 in the glossy style of early-2000s icons
 * (soft gradients, a dark outline, light from the top left). 48×48 artboard, scaled freely.
 */

const outline = "#1c2a4a";

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

const ICONS: Record<AppId | "start" | "folder" | "volume" | "muted" | "note" | "shutdown" | "logoff", (p: { uid: string }) => React.ReactNode> = {
  radio: ({ uid }) => (
    <>
      <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6b648" />
        <stop offset="1" stopColor="#c46f12" />
      </linearGradient>
      <path d="M13 14 L33 6" stroke={outline} strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="14" width="40" height="28" rx="5" fill={`url(#${uid}-a)`} stroke={outline} strokeWidth="1.5" />
      <circle cx="16" cy="28" r="8" fill="#3b2a1a" stroke={outline} />
      <circle cx="16" cy="28" r="5" fill="none" stroke="#7a5a35" strokeDasharray="1.5 1.5" />
      <rect x="28" y="20" width="12" height="7" rx="1.5" fill="#fff6d8" stroke={outline} />
      <path d="M31 20 v7 M34 20 v7 M37 20 v7" stroke="#c46f12" strokeWidth="0.8" />
      <circle cx="31" cy="34" r="2.5" fill="#fff6d8" stroke={outline} />
      <circle cx="38" cy="34" r="2.5" fill="#fff6d8" stroke={outline} />
      <rect x="5" y="15" width="38" height="10" rx="4" fill={`url(#${uid}-shine)`} />
    </>
  ),
  tv: ({ uid }) => (
    <>
      <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9b6a3e" />
        <stop offset="1" stopColor="#5b3a1c" />
      </linearGradient>
      <radialGradient id={`${uid}-g`} cx="0.4" cy="0.35" r="0.8">
        <stop offset="0" stopColor="#7fd2ff" />
        <stop offset="1" stopColor="#1b3f8f" />
      </radialGradient>
      <path d="M18 9 L24 14 L31 6" stroke={outline} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x="3" y="14" width="42" height="28" rx="4" fill={`url(#${uid}-a)`} stroke={outline} strokeWidth="1.5" />
      <rect x="7" y="18" width="27" height="20" rx="5" fill={`url(#${uid}-g)`} stroke={outline} />
      <circle cx="40" cy="22" r="2" fill="#e8d6b0" stroke={outline} strokeWidth="0.8" />
      <circle cx="40" cy="29" r="2" fill="#e8d6b0" stroke={outline} strokeWidth="0.8" />
      <path d="M38 35 h4" stroke="#e8d6b0" strokeWidth="1.2" />
      <path d="M9 21 q8 -3 16 0" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M10 42 l-2 4 M38 42 l2 4" stroke={outline} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  music: ({ uid }) => (
    <>
      <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff8a4a" />
        <stop offset="1" stopColor="#d2420f" />
      </linearGradient>
      <rect x="3" y="10" width="42" height="28" rx="3" fill={`url(#${uid}-a)`} stroke={outline} strokeWidth="1.5" />
      <rect x="8" y="14" width="32" height="13" rx="2" fill="#fff5e6" stroke={outline} strokeWidth="0.8" />
      <circle cx="16" cy="20.5" r="4" fill="#3a2a22" stroke={outline} />
      <circle cx="32" cy="20.5" r="4" fill="#3a2a22" stroke={outline} />
      <circle cx="16" cy="20.5" r="1.5" fill="#fff5e6" />
      <circle cx="32" cy="20.5" r="1.5" fill="#fff5e6" />
      <rect x="20" y="18.5" width="8" height="4" fill="#6b4a32" />
      <path d="M12 38 l4 -7 h16 l4 7" fill="#b8340b" stroke={outline} strokeWidth="1.2" />
      <rect x="4" y="11" width="40" height="6" rx="2" fill={`url(#${uid}-shine)`} />
    </>
  ),
  video: ({ uid }) => (
    <>
      <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5d7cff" />
        <stop offset="1" stopColor="#2b3fae" />
      </linearGradient>
      <rect x="4" y="9" width="40" height="30" rx="3" fill="#2a2f3c" stroke={outline} strokeWidth="1.5" />
      <path d="M4 14 h40 M4 34 h40" stroke="#555d72" />
      {[8, 15, 22, 29, 36].map((x) => (
        <g key={x}>
          <rect x={x} y="10.2" width="4" height="2.6" rx="0.6" fill="#d9dce6" />
          <rect x={x} y="35.2" width="4" height="2.6" rx="0.6" fill="#d9dce6" />
        </g>
      ))}
      <rect x="9" y="16" width="30" height="16" rx="2" fill={`url(#${uid}-a)`} stroke={outline} strokeWidth="0.8" />
      <path d="M21 19.5 L30 24 L21 28.5 Z" fill="#fff" stroke={outline} strokeWidth="0.8" strokeLinejoin="round" />
      <rect x="10" y="17" width="28" height="6" rx="2" fill={`url(#${uid}-shine)`} />
    </>
  ),
  games: ({ uid }) => (
    <>
      <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9c7cf0" />
        <stop offset="1" stopColor="#5532b5" />
      </linearGradient>
      <path d="M8 18 h32 a7 7 0 0 1 6.5 9 l-3 10 a5 5 0 0 1 -8.5 1.5 L31 34 H17 l-4 4.5 A5 5 0 0 1 4.5 37 l-3 -10 A7 7 0 0 1 8 18 Z" fill={`url(#${uid}-a)`} stroke={outline} strokeWidth="1.5" />
      <path d="M13 23 v8 M9 27 h8" stroke="#f3ecff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="34" cy="24.5" r="2.4" fill="#ffcf3f" stroke={outline} strokeWidth="0.8" />
      <circle cx="38.5" cy="29" r="2.4" fill="#5fe08b" stroke={outline} strokeWidth="0.8" />
      <path d="M9 19 h30 a6 6 0 0 1 5 3" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" fill="none" />
    </>
  ),
  saanp: ({ uid }) => (
    <>
      <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c6f06a" />
        <stop offset="1" stopColor="#7fb52a" />
      </linearGradient>
      <rect x="4" y="4" width="40" height="40" rx="7" fill="#1d2a12" stroke={outline} strokeWidth="1.5" />
      <path d="M11 34 h12 v-8 h-8 v-9 h20" fill="none" stroke={`url(#${uid}-a)`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="35" cy="17" r="2" fill="#1d2a12" />
      <ellipse cx="34" cy="33" rx="4" ry="5" fill="#ffb21f" stroke={outline} strokeWidth="0.8" />
      <path d="M34 28 q2 -3 4 -2" stroke="#3a8a2a" strokeWidth="1.6" fill="none" />
    </>
  ),
  mines: () => (
    <>
      <rect x="4" y="4" width="40" height="40" rx="5" fill="#d9dee8" stroke={outline} strokeWidth="1.5" />
      <path d="M4 24 h40 M24 4 v40" stroke="#9aa4b8" strokeWidth="1" />
      <circle cx="24" cy="24" r="9" fill="#1b2030" />
      <path d="M24 10 v28 M10 24 h28 M14 14 l20 20 M34 14 l-20 20" stroke="#1b2030" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="21" cy="21" r="2.6" fill="#fff" />
      <path d="M33 5 v11" stroke="#1b2030" strokeWidth="1.6" />
      <path d="M33 5 l8 3 -8 3z" fill="#e2492f" />
    </>
  ),
  reading: ({ uid }) => (
    <>
      <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2f8f6a" />
        <stop offset="1" stopColor="#1d6249" />
      </linearGradient>
      <path d="M6 10 h14 a4 4 0 0 1 4 4 v26 a3 3 0 0 0 -3 -3 H6 Z" fill="#fffaf0" stroke={outline} strokeWidth="1.4" />
      <path d="M42 10 H28 a4 4 0 0 0 -4 4 v26 a3 3 0 0 1 3 -3 h15 Z" fill="#fffaf0" stroke={outline} strokeWidth="1.4" />
      <path d="M9 16 h11 M9 20 h11 M9 24 h9 M28 16 h11 M28 20 h11 M28 24 h8" stroke="#9aa3b5" strokeWidth="1" />
      <path d="M4 12 v29 h17 a3 3 0 0 1 3 2 a3 3 0 0 1 3 -2 h17 V12" fill="none" stroke={`url(#${uid}-a)`} strokeWidth="3" />
      <path d="M33 10 v10 l2.5 -2 l2.5 2 V10" fill="#d8402a" stroke={outline} strokeWidth="0.8" />
    </>
  ),
  notepad: () => (
    <>
      <rect x="10" y="7" width="28" height="36" rx="2" fill="#fffef4" stroke={outline} strokeWidth="1.4" />
      <rect x="10" y="7" width="28" height="7" fill="#7fa7e8" stroke={outline} strokeWidth="1.2" />
      {[14, 20, 26, 32].map((x) => (
        <path key={x} d={`M${x} 4 v6`} stroke="#8a8f99" strokeWidth="2" strokeLinecap="round" />
      ))}
      <path d="M14 20 h20 M14 25 h20 M14 30 h20 M14 35 h13" stroke="#9ab" strokeWidth="1" />
      <path d="M30 40 L42 24 L45 26 L33 42 L29 43 Z" fill="#ffd23f" stroke={outline} strokeWidth="1" />
    </>
  ),
  control: ({ uid }) => (
    <>
      <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e9eef8" />
        <stop offset="1" stopColor="#aab6cc" />
      </linearGradient>
      <rect x="4" y="8" width="40" height="30" rx="3" fill={`url(#${uid}-a)`} stroke={outline} strokeWidth="1.4" />
      {[
        [12, 22],
        [24, 16],
        [36, 27],
      ].map(([x, y]) => (
        <g key={x}>
          <path d={`M${x} 13 v20`} stroke="#5a6478" strokeWidth="2" strokeLinecap="round" />
          <rect x={x - 4} y={y - 2.5} width="8" height="5" rx="1.5" fill="#2f6fe0" stroke={outline} strokeWidth="0.8" />
        </g>
      ))}
      <path d="M18 38 l-3 5 h18 l-3 -5" fill="#8d99b0" stroke={outline} strokeWidth="1" />
    </>
  ),
  folder: () => (
    <>
      <path d="M4 12 h14 l4 4 h22 v24 H4 Z" fill="#f4c94c" stroke={outline} strokeWidth="1.4" />
      <path d="M4 20 h40 v20 H4 Z" fill="#ffdc6a" stroke={outline} strokeWidth="1.2" />
    </>
  ),
  start: () => (
    <>
      <circle cx="24" cy="24" r="20" fill="#f2601d" stroke="#7a2a06" strokeWidth="2" />
      <text x="24" y="33" textAnchor="middle" fontSize="27" fontWeight="900" fill="#fff" fontFamily="var(--font-shrikhand), serif">
        9
      </text>
    </>
  ),
  volume: () => (
    <>
      <path d="M8 18 h8 l10 -9 v30 l-10 -9 H8 Z" fill="#e8ecf5" stroke={outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M31 17 q5 7 0 14 M35 12 q9 12 0 24" stroke="#e8ecf5" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  muted: () => (
    <>
      <path d="M8 18 h8 l10 -9 v30 l-10 -9 H8 Z" fill="#e8ecf5" stroke={outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M31 18 l12 12 M43 18 l-12 12" stroke="#ff5a4a" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  note: () => <path d="M18 34 V10 l20 -4 v24 M18 34 a5 4 0 1 1 -2 -3 M38 30 a5 4 0 1 1 -2 -3" fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />,
  shutdown: () => (
    <>
      <rect x="4" y="4" width="40" height="40" rx="8" fill="#e2492f" stroke="#7c1d0e" strokeWidth="2" />
      <path d="M17 15 a12 12 0 1 0 14 0" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M24 10 v14" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  logoff: () => (
    <>
      <rect x="4" y="4" width="40" height="40" rx="8" fill="#f2b632" stroke="#7a5a08" strokeWidth="2" />
      <path d="M20 14 h-6 v20 h6 M22 24 h14 M31 18 l6 6 l-6 6" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

/** Decorative: the visible label next to it names the thing. */
export function DesktopIcon({ name, size = 32, className }: { name: IconName; size?: number; className?: string }) {
  // Gradient ids must be unique per document; useId is stable between server and client.
  const uid = `ic-${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable="false" className={className}>
      <Defs id={uid} />
      {ICONS[name]({ uid })}
    </svg>
  );
}

/**
 * Station "logo": initials on a module colour. We deliberately don't load station favicons:
 * they come from thousands of third-party hosts, which would reveal visitors' IP addresses
 * to those hosts and often break. Privacy-first and always renders.
 */
const COLOURS = ["bg-radio text-ink", "bg-tv text-panel", "bg-music text-ink", "bg-games text-panel", "bg-reading text-ink"];

export function StationBadge({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => [...w][0])
      .join("")
      .toUpperCase() || "FM";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const box = size === "sm" ? "h-10 w-10 text-sm" : "h-12 w-12 text-base";
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-lg font-pixel ${box} ${COLOURS[hash % COLOURS.length]}`}
    >
      {initials}
    </span>
  );
}

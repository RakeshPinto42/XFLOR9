/** Small inline icon set (no icon library dependency). Decorative: always pair with a text label. */
const PATHS = {
  play: "M8 5.5v13l11-6.5z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  retry: "M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z",
  volume: "M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2zM18.4 6a8.5 8.5 0 0 1 0 12L17 16.6a6.5 6.5 0 0 0 0-9.2z",
  muted: "M4 9h4l5-4v14l-5-4H4zM16.3 9.3l1.4-1.4L20 10.2l2.3-2.3 1.4 1.4-2.3 2.3 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3z",
  close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z",
  heart: "M12 20.5 4.3 13a4.8 4.8 0 0 1 6.8-6.8l.9.9.9-.9a4.8 4.8 0 1 1 6.8 6.8z",
  heartOutline:
    "M12 20.5 4.3 13a4.8 4.8 0 0 1 6.8-6.8l.9.9.9-.9a4.8 4.8 0 1 1 6.8 6.8zm0-2.8 6.3-6.2a2.8 2.8 0 0 0-4-4L12 9.8 9.7 7.5a2.8 2.8 0 0 0-4 4z",
  search: "M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3-1.5 1.5-4.3-4.3A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z",
  bookmark: "M6 3h12v18l-6-4.5L6 21z",
  bookmarkOutline: "M6 3h12v18l-6-4.5L6 21zm2 2v12l4-3 4 3V5z",
  list: "M4 5h2v2H4zM8 5h12v2H8zM4 11h2v2H4zM8 11h12v2H8zM4 17h2v2H4zM8 17h12v2H8z",
  trash: "M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7zm3 2v8h2v-8zm4 0v8h2v-8z",
  prev: "M6 5h2v14H6zM20 5v14L9.5 12z",
  next: "M16 5h2v14h-2zM4 5v14l10.5-7z",
  sliders: "M4 6h9v2H4zM17 6h3v2h-3zM13 4h4v6h-4zM4 16h3v2H4zM11 16h9v2h-9zM7 14h4v6H7z",
  stop: "M6 6h12v12H6z",
  expand: "M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z",
  external: "M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H7v10h10v-4h2v6H5z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden focusable="false">
      <path d={PATHS[name]} fillRule="evenodd" />
    </svg>
  );
}

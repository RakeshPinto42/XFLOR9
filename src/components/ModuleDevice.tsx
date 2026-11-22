import type { ModuleId } from "@/lib/modules";

/** Hand-drawn (pure CSS) device for each module. Decorative, hidden from screen readers. */
export function ModuleDevice({ id }: { id: ModuleId }) {
  switch (id) {
    case "radio":
      return (
        <div className="device device--radio" aria-hidden>
          <div className="grille" />
          <div className="dial" />
        </div>
      );
    case "tv":
      return (
        <div className="device device--tv" aria-hidden>
          <div className="crt-screen" />
          <div className="knobs">
            <span />
            <span />
          </div>
        </div>
      );
    case "music":
      return (
        <div className="device device--music" aria-hidden>
          <div className="label" />
          <div className="window">
            <span className="reel" />
            <span className="reel" />
          </div>
        </div>
      );
    case "games":
      return (
        <div className="device device--games" aria-hidden>
          <div className="lcd" />
          <div className="controls">
            <span className="dpad" />
            <span className="ab">
              <span />
              <span />
            </span>
          </div>
        </div>
      );
    case "reading":
      return (
        <div className="device device--reading" aria-hidden>
          {SPINES.map((s, i) => (
            <span key={i} style={{ height: s.h, ["--spine" as string]: s.c }} />
          ))}
        </div>
      );
  }
}

const SPINES = [
  { h: "6.4rem", c: "#8fcfb4" },
  { h: "7.4rem", c: "#16204a" },
  { h: "5.6rem", c: "#5fae8e" },
  { h: "6.9rem", c: "#f7f0df" },
  { h: "6rem", c: "#8fcfb4" },
];

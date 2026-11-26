"use client";

import { useState } from "react";
import { DesktopIcon } from "@/features/desktop/icons";
import { wm } from "@/features/desktop/store";
import { playSystemSound } from "@/features/desktop/systemSounds";
import { useLocalStore } from "@/lib/storage/store";
import { arcadePrefs, bestStore } from "./arcadeStore";
import { LEVELS, SPEEDS, type Level } from "./scores";
import "./arcade.css";

/**
 * Arcade (D2): the games launcher. Categories on the left, the games as large icons (double-click
 * or Play opens each in its own window), details for the chosen game, and best scores.
 */

type GameId = "saanp" | "mines";
type Category = "all" | "arcade" | "puzzle" | "recent";
const GAMES: { id: GameId; name: string; category: "arcade" | "puzzle"; blurb: string; controls: string }[] = [
  {
    id: "saanp",
    name: "Saanp",
    category: "arcade",
    blurb: "Guide the snake to the mangoes. Every mango makes it longer; don't hit the wall or yourself.",
    controls: "Arrow keys or W A S D, Space to pause. A direction pad on touch screens.",
  },
  {
    id: "mines",
    name: "Mines",
    category: "puzzle",
    blurb: "Open every safe square. Numbers tell you how many mines are next door. Three levels.",
    controls: "Click to open, right-click or F to flag, arrow keys to move.",
  },
];
const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All games" },
  { id: "arcade", label: "Arcade" },
  { id: "puzzle", label: "Puzzle" },
  { id: "recent", label: "Recently played" },
];

export function GamesHub() {
  const [category, setCategory] = useState<Category>("all");
  const [selected, setSelected] = useState<GameId>("saanp");
  const best = useLocalStore(bestStore);
  const prefs = useLocalStore(arcadePrefs);
  const list = category === "recent" ? prefs.recent.map((id) => GAMES.find((g) => g.id === id)!).filter(Boolean) : GAMES.filter((g) => category === "all" || g.category === category);
  const game = GAMES.find((g) => g.id === selected)!;
  const launch = (id: GameId) => {
    if (!wm.isOpen(id)) playSystemSound("open");
    wm.open(id);
  };

  return (
    <div className="arc" data-testid="arcade">
      <h1 className="sr-only">Arcade</h1>
      <nav className="arc-side" aria-label="Game categories">
        <p className="xp-sidebar-heading">Categories</p>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className="arc-cat" aria-current={category === c.id ? "true" : undefined} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
        <p className="xp-sidebar-heading">Best scores</p>
        <dl className="arc-scores">
          <dt>Saanp</dt>
          <dd>{best.saanp}</dd>
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <div key={l} className="contents">
              <dt>Mines, {LEVELS[l].name.toLowerCase()}</dt>
              <dd>{best.mines[l] === null ? "–" : `${best.mines[l]}s`}</dd>
            </div>
          ))}
        </dl>
      </nav>

      <div className="arc-main">
        <section className="arc-shelf" aria-label={CATEGORIES.find((c) => c.id === category)!.label}>
          {list.length === 0 ? (
            <p className="mx-mini-empty">Games you play appear here.</p>
          ) : (
            <ul className="arc-tiles">
              {list.map((g) => (
                <li key={g.id}>
                  <button type="button" className="arc-tile" aria-pressed={selected === g.id} onClick={() => setSelected(g.id)} onDoubleClick={() => launch(g.id)} aria-label={`${g.name}: ${g.blurb}`}>
                    <DesktopIcon name={g.id} size={56} />
                    <span className="arc-tile-name">{g.name}</span>
                    <span className="arc-tile-cat">{g.category === "arcade" ? "Arcade" : "Puzzle"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="arc-detail" aria-label={`About ${game.name}`}>
          <DesktopIcon name={game.id} size={64} />
          <div className="min-w-0 flex-1">
            <h2>{game.name}</h2>
            <p>{game.blurb}</p>
            <p className="arc-controls">{game.controls}</p>
            <p className="arc-controls">
              {game.id === "saanp" ? `Speed: ${SPEEDS[prefs.speed].name}. Best score ${best.saanp}.` : `Level: ${LEVELS[prefs.level].name}. Best time ${best.mines[prefs.level] === null ? "none yet" : `${best.mines[prefs.level]}s`}.`}
            </p>
          </div>
          <button type="button" className="xp-button xp-button--primary" onClick={() => launch(game.id)}>
            Play {game.name}
          </button>
        </section>
        <p className="arc-note">Original games made for XPLOR9. Best scores stay in this browser.</p>
      </div>
    </div>
  );
}

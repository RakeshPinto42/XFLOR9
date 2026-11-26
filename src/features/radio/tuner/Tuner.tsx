"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Icon } from "@/components/Icon";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import { playStation, stationPlayability, stationSource } from "../playback";
import { favourites, toggleFavouriteStation } from "../radioStores";
import { useLocalStore } from "@/lib/storage/store";
import type { Station } from "../types";
import { indexFromScale, scaleLabels, scalePercent } from "./dial";
import { TuningKnob } from "./TuningKnob";

const TUNE_DELAY_MS = 700; // like a real set: settle on a station, then it comes in

interface Props {
  stations: Station[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Shown on the display, e.g. "India · Hindi", "Favourites". */
  band: string;
  loading: boolean;
  /** Extra controls on the deck (volume, presets). */
  children?: React.ReactNode;
}

/**
 * The retro tuner. The dial has one position per station in the list being viewed.
 * If the radio is on, turning to a station tunes in after a short pause; if it's off,
 * turning only moves the needle and Play starts the selected station.
 */
export function Tuner({ stations, selectedIndex, onSelect, band, loading, children }: Props) {
  const player = usePlayback();
  const favs = useLocalStore(favourites);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const count = stations.length;
  const selected: Station | undefined = stations[selectedIndex];
  const radioOn = player.status === "loading" || player.status === "playing" || player.status === "buffering";
  const isCurrent = !!selected && player.source?.id === stationSource(selected).id;
  const playability = selected ? stationPlayability(selected) : "unavailable";
  const playable = playability === "playable" || playability === "unverified";
  const isFav = !!selected && favs.some((f) => f.id === selected.id);

  useEffect(() => () => clearTimer(), []);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  /** Move the dial; if the radio is on, tune in once the dial rests. */
  function select(index: number) {
    onSelect(index);
    clearTimer();
    const target = stations[index];
    if (!radioOn || !target) {
      setPending(false);
      return;
    }
    const p = stationPlayability(target);
    if (p !== "playable" && p !== "unverified") {
      setPending(false);
      return;
    }
    setPending(true);
    timer.current = setTimeout(() => {
      setPending(false);
      if (getPlaybackEngine().getState().source?.id !== stationSource(target).id) playStation(target);
    }, TUNE_DELAY_MS);
  }

  function onMainButton() {
    if (!selected) return;
    clearTimer();
    setPending(false);
    if (isCurrent) getPlaybackEngine().toggle();
    else playStation(selected);
  }

  function windowIndex(e: PointerEvent<HTMLDivElement>) {
    const r = windowRef.current!.getBoundingClientRect();
    return indexFromScale((e.clientX - r.left) / r.width, count);
  }

  // ---------- display text ----------
  const status = (() => {
    if (loading) return "Scanning…";
    if (!selected) return "No signal";
    if (!playable) return "Can't play here";
    if (pending) return "Tuning…";
    if (isCurrent) {
      if (player.status === "playing") return "Live";
      if (player.status === "loading") return player.reconnecting ? "Reconnecting…" : "Tuning…";
      if (player.status === "buffering") return "Buffering";
      if (player.status === "paused") return "Paused";
      if (player.status === "error") return "No reception";
    }
    return radioOn ? "Ready" : "Standby";
  })();
  const channel = count ? `CH ${String(selectedIndex + 1).padStart(2, "0")}/${String(count).padStart(2, "0")}` : "CH --/--";
  const detail = selected
    ? [selected.languages[0] && cap(selected.languages[0]), selected.country, selected.bitrate ? `${selected.bitrate} kbps` : null, selected.codecLabel || null]
        .filter(Boolean)
        .join(" · ")
    : "";
  const valueText = selected ? `Station ${selectedIndex + 1} of ${count}: ${selected.name}` : "No stations";
  const active = isCurrent && radioOn;
  // The lamp shows whether the radio is on air at all (whichever station), like a real set.
  const live = player.source?.kind === "radio" && player.status === "playing";

  return (
    <section aria-label="Radio tuner" className="rt-deck">
      <div className="rt-deck-head">
        <span>
          <span className="rt-brand">XPLOR9</span> Tuner
        </span>
        <span className="rt-lamp" data-on={live || undefined}>
          <span aria-hidden /> {live ? "On air" : "Off air"}
        </span>
      </div>

      {/* Dial window: pointer shortcut; the knob is the accessible control. */}
      <div
        ref={windowRef}
        className="rt-dial"
        aria-hidden
        onPointerDown={(e) => {
          if (!count) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          select(windowIndex(e));
        }}
        onPointerMove={(e) => {
          if (dragging.current && count) {
            const i = windowIndex(e);
            if (i !== selectedIndex) select(i);
          }
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {scaleLabels(count).map((i) => (
          <span key={`l${i}`} className="rt-dial-label" style={{ left: `${scalePercent(i, count)}%` }}>
            {i + 1}
          </span>
        ))}
        {stations.map((s, i) => (
          <span
            key={s.id}
            className="rt-dial-tick"
            data-major={scaleLabels(count).includes(i) ? "" : undefined}
            data-selected={i === selectedIndex ? "" : undefined}
            style={{ left: `${scalePercent(i, count)}%` }}
          />
        ))}
        {count > 0 && <span className="rt-dial-needle" style={{ left: `${scalePercent(selectedIndex, count)}%` }} />}
      </div>

      <div className="rt-face">
        <div className="rt-lcd" aria-live="polite" aria-atomic="true">
          <div className="rt-lcd-top">
            <span>{channel}</span>
            <span className="truncate">{band}</span>
            <span className="shrink-0">{status}</span>
          </div>
          <p className="rt-lcd-name">{selected?.name ?? (loading ? "…" : "No stations")}</p>
          <p className="rt-lcd-detail">{detail || " "}</p>
        </div>
        <TuningKnob count={count} index={selectedIndex} onChange={select} valueText={valueText} />
      </div>

      <div className="rt-transport">
        <button type="button" className="rt-key" onClick={() => select(Math.max(0, selectedIndex - 1))} disabled={selectedIndex <= 0} aria-label="Previous station">
          <Icon name="prev" />
        </button>
        <button
          type="button"
          className="rt-key rt-key--main"
          onClick={onMainButton}
          disabled={!selected || !playable}
          aria-label={selected ? `${active ? "Pause" : "Play"} ${selected.name}` : "Play"}
        >
          <Icon name={active ? "pause" : "play"} className="h-6 w-6" />
        </button>
        <button type="button" className="rt-key" onClick={() => select(Math.min(count - 1, selectedIndex + 1))} disabled={selectedIndex >= count - 1} aria-label="Next station">
          <Icon name="next" />
        </button>
        <button
          type="button"
          className="rt-key"
          onClick={() => selected && toggleFavouriteStation(selected)}
          disabled={!selected}
          aria-pressed={isFav}
          aria-label={selected ? `${isFav ? "Remove" : "Add"} ${selected.name} ${isFav ? "from" : "to"} favourites` : "Favourite"}
        >
          <Icon name={isFav ? "heart" : "heartOutline"} className={`h-5 w-5 ${isFav ? "text-[#ff7a55]" : ""}`} />
        </button>
        {children}
      </div>
    </section>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

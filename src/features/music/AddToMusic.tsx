"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalStore } from "@/lib/storage/store";
import { addVideo, savePlaylist, type AddedVideo } from "./library";
import { musicLibrary } from "./musicStores";

/**
 * "Add to a Music playlist" for the video playing in TV or Video: pick a saved playlist, or make
 * a new one. Only single YouTube videos can be added (Music needs YouTube's player to say when a
 * song ends); for anything else the button is disabled and says why.
 */
export function AddToMusic({ video }: { video: AddedVideo | null }) {
  const lib = useLocalStore(musicLibrary);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    // On the whole page: Safari doesn't move focus to a button when it's clicked.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside = root.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) root.current?.querySelector<HTMLElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const addTo = (playlistId: string, current = musicLibrary.get()) => {
    if (!video) return;
    const r = addVideo(current, playlistId, video);
    if (!r.ok) return setMessage({ ok: false, text: r.reason });
    musicLibrary.set(r.lib);
    const target = r.lib.playlists.find((p) => p.id === playlistId)!;
    setMessage({ ok: true, text: r.added ? `Added to “${target.name}”.` : `Already in “${target.name}”.` });
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const r = savePlaylist(musicLibrary.get(), name, [], () => crypto.randomUUID());
    if (!r.ok) return setMessage({ ok: false, text: r.reason });
    setName("");
    addTo(r.id, r.lib);
  };

  const why = "Only single YouTube videos can be added to Music (not films from the Internet Archive or whole YouTube playlists).";
  return (
    <span ref={root} className="mx-add">
      <button
        type="button"
        className="mx-key"
        aria-expanded={open}
        disabled={!video}
        title={video ? undefined : why}
        onClick={() => {
          setOpen((o) => !o);
          setMessage(null);
        }}
      >
        + Music
        <span className="sr-only"> (add to a Music playlist)</span>
      </button>
      {open && video && (
        <div className="mx-pop" role="dialog" aria-label="Add to a Music playlist">
          <p className="mx-pop-title">Add “{video.title}” to a Music playlist</p>
          {lib.playlists.length > 0 && (
            <ul className="mx-pop-list">
              {lib.playlists.map((p) => (
                <li key={p.id}>
                  <button type="button" className="xp-button w-full !justify-start" onClick={() => addTo(p.id)}>
                    {p.name} ({p.items.length})
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="mx-pop-form" onSubmit={create}>
            <label htmlFor="mx-new-playlist" className="block">
              New playlist
            </label>
            <div className="flex gap-1">
              <input id="mx-new-playlist" className="xp-input min-w-0 flex-1" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus={lib.playlists.length === 0} />
              <button type="submit" className="xp-button">
                Create and add
              </button>
            </div>
          </form>
          {message && (
            <p role={message.ok ? "status" : "alert"} className="mx-pop-note">
              {message.text}
            </p>
          )}
        </div>
      )}
    </span>
  );
}

/** A YouTube video as Music keeps it, or null if it can't be added (not a single YouTube video). */
export function addableVideo(source: { provider: string; videoId?: string }, title: string, by: string, from: AddedVideo["from"]): AddedVideo | null {
  return source.provider === "youtube" && source.videoId ? { videoId: source.videoId, title, by, from } : null;
}

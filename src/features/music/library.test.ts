import { describe, expect, it } from "vitest";
import { MAX_ITEMS } from "./playlist";
import {
  EMPTY_LIBRARY,
  MAX_PLAYLISTS,
  addVideo,
  addedId,
  deletePlaylist,
  parseLibrary,
  removeFromPlaylist,
  removeVideo,
  renamePlaylist,
  savePlaylist,
  type AddedVideo,
  type MusicLibrary,
} from "./library";

let n = 0;
const newId = () => `p-${++n}`;
const song: AddedVideo = { videoId: "dQw4w9WgXcQ", title: "Ek Ladki Ko Dekha", by: "Saregama Music", from: "video" };
const programme: AddedVideo = { videoId: "abcdefghijk", title: "Malgudi Days: Swami", by: "Doordarshan", from: "tv" };

function withPlaylist(name = "Road trip", items: string[] = []): { lib: MusicLibrary; id: string } {
  const r = savePlaylist(EMPTY_LIBRARY, name, items, newId);
  if (!r.ok) throw new Error(r.reason);
  return { lib: r.lib, id: r.id };
}

describe("saved playlists", () => {
  it("saves under a name; saving the same name again replaces its songs", () => {
    const { lib, id } = withPlaylist("  Road trip ", ["lag-ja-gale", "tujhse-naraz"]);
    expect(lib.playlists).toEqual([{ id, name: "Road trip", items: ["lag-ja-gale", "tujhse-naraz"] }]);
    const again = savePlaylist(lib, "road TRIP", ["chura-liya"], newId);
    expect(again.ok && again.replaced).toBe(true);
    expect(again.ok && again.lib.playlists).toEqual([{ id, name: "Road trip", items: ["chura-liya"] }]);
  });

  it("needs a name, and keeps to the limits", () => {
    expect(savePlaylist(EMPTY_LIBRARY, " \u0007 ", [], newId)).toMatchObject({ ok: false });
    let lib = EMPTY_LIBRARY;
    for (let i = 0; i < MAX_PLAYLISTS; i++) {
      const r = savePlaylist(lib, `List ${i}`, [], newId);
      if (r.ok) lib = r.lib;
    }
    expect(savePlaylist(lib, "One more", [], newId)).toMatchObject({ ok: false, reason: expect.stringContaining("up to 50") });
    const big = savePlaylist(EMPTY_LIBRARY, "Big", Array.from({ length: MAX_ITEMS + 10 }, (_, i) => `t-${i}`), newId);
    expect(big.ok && big.lib.playlists[0].items).toHaveLength(MAX_ITEMS);
  });

  it("renames (not to another playlist's name) and deletes", () => {
    const { lib: one, id } = withPlaylist("Road trip");
    const two = savePlaylist(one, "Rainy day", [], newId);
    if (!two.ok) throw new Error();
    expect(renamePlaylist(two.lib, id, "rainy day")).toMatchObject({ ok: false, reason: expect.stringContaining("Rainy day") });
    const renamed = renamePlaylist(two.lib, id, "Long drive");
    expect(renamed.ok && renamed.lib.playlists.map((p) => p.name)).toEqual(["Long drive", "Rainy day"]);
    expect(deletePlaylist(two.lib, id).playlists.map((p) => p.name)).toEqual(["Rainy day"]);
  });

  it("removes one entry by its place (the same song may be there twice)", () => {
    const { lib, id } = withPlaylist("Road trip", ["a", "b", "a"]);
    expect(removeFromPlaylist(lib, id, 2).playlists[0].items).toEqual(["a", "b"]);
  });
});

describe("videos added from Video and TV", () => {
  it("adds a video once; adding it again changes nothing", () => {
    const { lib, id } = withPlaylist();
    const r1 = addVideo(lib, id, song);
    if (!r1.ok) throw new Error();
    expect(r1.added).toBe(true);
    expect(r1.lib.playlists[0].items).toEqual([addedId(song.videoId)]);
    expect(r1.lib.videos).toEqual([song]);
    const r2 = addVideo(r1.lib, id, song);
    expect(r2.ok && !r2.added && r2.lib).toBe(r1.lib);
  });

  it("the same video in two playlists is kept once; removing it from Music takes it out of both", () => {
    const { lib, id } = withPlaylist("A");
    const b = savePlaylist(lib, "B", [], newId);
    if (!b.ok) throw new Error();
    let l = b.lib;
    for (const pid of [id, b.id]) {
      const r = addVideo(l, pid, song);
      if (r.ok) l = r.lib;
    }
    const r = addVideo(l, id, programme);
    if (r.ok) l = r.lib;
    expect(l.videos).toHaveLength(2);
    const removed = removeVideo(l, song.videoId);
    expect(removed.videos).toEqual([programme]);
    expect(removed.playlists.map((p) => p.items)).toEqual([[addedId(programme.videoId)], []]);
  });

  it("refuses videos that aren't single YouTube videos, and missing playlists", () => {
    const { lib, id } = withPlaylist();
    expect(addVideo(lib, id, { ...song, videoId: "PL123" })).toMatchObject({ ok: false });
    expect(addVideo(lib, "gone", song)).toMatchObject({ ok: false, reason: expect.stringContaining("no longer exists") });
  });
});

describe("reading the library back from storage", () => {
  it("keeps valid data and drops anything damaged, duplicated or unknown", () => {
    const raw = {
      videos: [song, song, { videoId: "<script>", title: "x" }, { videoId: "abcdefghijk", title: "" }, { ...programme, title: "Malgudi\u0000 Days", from: "radio" }],
      playlists: [
        { id: "p-1", name: "Road\u0007 trip", items: ["lag-ja-gale", addedId(song.videoId), "yt:zzzzzzzzzzz", "javascript:alert(1)", 4] },
        { id: "p-1", name: "Duplicate id", items: [] },
        { id: "BAD ID", name: "x", items: [] },
        { id: "p-2", name: "", items: "not a list" },
        null,
      ],
    };
    expect(parseLibrary(raw)).toEqual({
      videos: [song, { ...programme, title: "Malgudi Days", from: "video" }],
      playlists: [
        { id: "p-1", name: "Road trip", items: ["lag-ja-gale", addedId(song.videoId)] },
        { id: "p-2", name: "Playlist", items: [] },
      ],
    });
    expect(parseLibrary("nonsense")).toEqual(EMPTY_LIBRARY);
    expect(parseLibrary(null)).toEqual(EMPTY_LIBRARY);
  });
});

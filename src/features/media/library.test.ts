import { describe, expect, it } from "vitest";
import { addRecentId, MAX_RECENTS, parseIdList, toggleId } from "./library";

describe("media library lists", () => {
  it("keeps only valid, unique ids from stored data", () => {
    expect(parseIdList(["godaan", "godaan", 3, "<script>", "the-general"], 10)).toEqual(["godaan", "the-general"]);
    expect(parseIdList({ not: "a list" }, 10)).toEqual([]);
    expect(parseIdList(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
  it("toggles favourites and keeps recents most-recent-first without repeats", () => {
    expect(toggleId(["a"], "b")).toEqual(["b", "a"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
    expect(addRecentId(["a", "b"], "b")).toEqual(["b", "a"]);
    const many = Array.from({ length: MAX_RECENTS }, (_, i) => `p${i}`);
    expect(addRecentId(many, "new")).toHaveLength(MAX_RECENTS);
  });
});

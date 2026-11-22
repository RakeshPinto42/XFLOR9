import { describe, expect, it } from "vitest";
import { DEFAULT_LIMIT, parseStationQuery, toRadioBrowserParams } from "./query";

const parse = (qs: string) => parseStationQuery(new URLSearchParams(qs));

describe("parseStationQuery", () => {
  it("applies defaults", () => {
    expect(parse("")).toEqual({
      ok: true,
      query: { order: "popular", offset: 0, limit: DEFAULT_LIMIT },
    });
  });

  it("normalises valid filters", () => {
    const r = parse("q=%20mirchi%20&country=in&language=Hindi&tag=Bollywood&order=votes&offset=24&limit=12");
    expect(r).toEqual({
      ok: true,
      query: {
        name: "mirchi",
        countryCode: "IN",
        language: "hindi",
        tag: "bollywood",
        order: "votes",
        offset: 24,
        limit: 12,
      },
    });
  });

  it("accepts non-Latin filter text", () => {
    expect(parse("language=%E0%A4%B9%E0%A4%BF%E0%A4%82%E0%A4%A6%E0%A5%80").ok).toBe(true); // हिंदी
    expect(parse(`tag=${encodeURIComponent("தமிழ்")}`).ok).toBe(true);
  });

  it.each([
    ["country=IND", "two-letter"],
    ["country=1N", "two-letter"],
    ["order=random", "Sort"],
    ["limit=0", "Limit"],
    ["limit=51", "Limit"],
    ["limit=abc", "Limit"],
    ["offset=-1", "Offset"],
    ["offset=1.5", "Offset"],
    ["offset=999999", "Offset"],
    [`q=${"a".repeat(81)}`, "80 characters"],
    ["tag=%3Cscript%3E", "genre"],
    ["language=a%00b", "language"],
  ])("rejects %s", (qs, fragment) => {
    const r = parse(qs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(fragment);
  });
});

describe("toRadioBrowserParams", () => {
  it("always filters to https, recently-checked stations", () => {
    const p = toRadioBrowserParams({ order: "popular", offset: 0, limit: 24 });
    expect(p.get("is_https")).toBe("true");
    expect(p.get("hidebroken")).toBe("true");
  });

  it("asks for one extra row to detect another page", () => {
    expect(toRadioBrowserParams({ order: "popular", offset: 48, limit: 24 }).get("limit")).toBe("25");
  });

  it("uses the parameter names verified against the live API", () => {
    const p = toRadioBrowserParams({
      name: "mirchi",
      countryCode: "IN",
      language: "hindi",
      tag: "bollywood",
      order: "name",
      offset: 0,
      limit: 10,
    });
    expect(Object.fromEntries(p)).toEqual({
      name: "mirchi",
      countrycode: "IN",
      language: "hindi",
      languageExact: "true",
      tag: "bollywood",
      tagExact: "true",
      order: "name",
      reverse: "false",
      hidebroken: "true",
      is_https: "true",
      offset: "0",
      limit: "11",
    });
  });

  it("sorts popular stations by clicks, most first", () => {
    const p = toRadioBrowserParams({ order: "popular", offset: 0, limit: 5 });
    expect([p.get("order"), p.get("reverse")]).toEqual(["clickcount", "true"]);
  });
});

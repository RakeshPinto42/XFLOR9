/** Real Radio Browser record captured from the live API (Nov 2026), used as a base for test variants. */
export const LIVE_STATION = {
  changeuuid: "18f6e510-58f2-4e63-b86f-5475de16f8ab",
  stationuuid: "e928bf7b-7de2-4447-87ec-369d1be1b9f5",
  serveruuid: null,
  name: "Bollywood Gaane Purane",
  url: "https://stream.zeno.fm/6n6ewddtad0uv",
  url_resolved: "https://stream.zeno.fm/6n6ewddtad0uv",
  homepage: "https://gaanepurane.my-free.website/",
  favicon: "https://mytuner.global.ssl.fastly.net/media/tvos_radios/ppqbgfej6skx.jpeg",
  tags: "",
  country: "India",
  countrycode: "IN",
  iso_3166_2: "",
  state: "",
  language: "",
  languagecodes: "",
  votes: 43607,
  lastchangetime: "2026-01-14 22:54:03",
  lastchangetime_iso8601: "2026-01-14T22:54:03Z",
  codec: "MP3",
  bitrate: 128,
  hls: 0,
  lastcheckok: 1,
  lastchecktime: "2026-11-22 02:47:29",
  lastchecktime_iso8601: "2026-11-22T02:47:29Z",
  clickcount: 453,
  clicktrend: 453,
  ssl_error: 0,
  geo_lat: null,
  geo_long: null,
  has_extended_info: false,
};

let n = 0;
/** A valid variant of the live record with a fresh uuid and the given overrides. */
export function rawStation(overrides: Record<string, unknown> = {}) {
  n += 1;
  const uuid = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return { ...LIVE_STATION, stationuuid: uuid, ...overrides };
}

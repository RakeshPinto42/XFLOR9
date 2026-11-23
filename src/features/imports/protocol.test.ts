import { describe, expect, it } from "vitest";
import { mainOriginFor, readerOriginFor } from "./origins";
import { PROTOCOL, isFrom, parseHostMessage, parseReaderMessage } from "./protocol";

const id = "0b5f6c2e-1234-4abc-9def-123456789abc";
const open = (over: Record<string, unknown> = {}) => ({
  protocol: PROTOCOL,
  type: "open",
  requestId: id,
  format: "epub",
  name: "My book.epub",
  bytes: new ArrayBuffer(16),
  position: null,
  ...over,
});

describe("parseHostMessage", () => {
  it("accepts a valid open and nav message", () => {
    expect(parseHostMessage(open())).not.toBeNull();
    expect(parseHostMessage({ protocol: PROTOCOL, type: "nav", requestId: id, action: "next" })).not.toBeNull();
  });

  it.each([
    ["wrong protocol", open({ protocol: "x" })],
    ["unknown type", { protocol: PROTOCOL, type: "eval", requestId: id, code: "alert(1)" }],
    ["extra field", open({ html: "<script>" })],
    ["bytes not an ArrayBuffer", open({ bytes: "AAAA" })],
    ["empty file", open({ bytes: new ArrayBuffer(0) })],
    ["unsupported format", open({ format: "html" })],
    ["bad position", open({ position: "javascript:alert(1)" })],
    ["control characters in name", open({ name: "a\u0000b" })],
    ["bad request id", open({ requestId: "<x>" })],
    ["bad nav action", { protocol: PROTOCOL, type: "nav", requestId: id, action: "eval" }],
    ["not an object", "open"],
  ])("rejects %s", (_, msg) => expect(parseHostMessage(msg)).toBeNull());

  it("rejects files above the size limit", () => {
    expect(parseHostMessage(open({ bytes: new ArrayBuffer(32) }), 16)).toBeNull();
  });
});

describe("parseReaderMessage", () => {
  it("accepts valid messages", () => {
    expect(parseReaderMessage({ protocol: PROTOCOL, type: "ready" })).not.toBeNull();
    expect(parseReaderMessage({ protocol: PROTOCOL, type: "opened", requestId: id, title: "T", sections: 3 })).not.toBeNull();
    expect(
      parseReaderMessage({ protocol: PROTOCOL, type: "relocated", requestId: id, fraction: 0.4, position: "epubcfi(/6/4!/4/2/1:0)", chapter: null }),
    ).not.toBeNull();
    expect(parseReaderMessage({ protocol: PROTOCOL, type: "error", requestId: id, code: "entry-too-large" })).not.toBeNull();
  });

  it.each([
    ["error with free text", { protocol: PROTOCOL, type: "error", requestId: id, code: "entry-too-large", message: "<img onerror>" }],
    ["unknown error code", { protocol: PROTOCOL, type: "error", requestId: id, code: "pwned" }],
    ["fraction out of range", { protocol: PROTOCOL, type: "relocated", requestId: id, fraction: 2, position: "epubcfi(/6/4!/4)", chapter: null }],
    ["non-CFI position", { protocol: PROTOCOL, type: "relocated", requestId: id, fraction: 0.1, position: "/etc/passwd", chapter: null }],
    ["huge title", { protocol: PROTOCOL, type: "opened", requestId: id, title: "x".repeat(500), sections: 1 }],
    ["ready with extra data", { protocol: PROTOCOL, type: "ready", extra: 1 }],
  ])("rejects %s", (_, msg) => expect(parseReaderMessage(msg)).toBeNull());
});

describe("isFrom", () => {
  const win = {};
  it("requires the exact origin and the exact source window", () => {
    expect(isFrom({ origin: "http://127.0.0.1:3009", source: win as MessageEventSource }, "http://127.0.0.1:3009", win)).toBe(true);
    expect(isFrom({ origin: "http://evil.test", source: win as MessageEventSource }, "http://127.0.0.1:3009", win)).toBe(false);
    expect(isFrom({ origin: "http://127.0.0.1:3009", source: {} as MessageEventSource }, "http://127.0.0.1:3009", win)).toBe(false);
  });
  it("never accepts wildcard or null origins", () => {
    expect(isFrom({ origin: "*", source: win as MessageEventSource }, "*", win)).toBe(false);
    expect(isFrom({ origin: "null", source: win as MessageEventSource }, "null", win)).toBe(false);
    expect(isFrom({ origin: "x", source: win as MessageEventSource }, null, win)).toBe(false);
  });
});

describe("origins", () => {
  const loc = (hostname: string, port = "3009") => ({ protocol: "http:", hostname, port });
  it("pairs localhost with 127.0.0.1 for local development", () => {
    expect(readerOriginFor(loc("localhost"), null, null)).toBe("http://127.0.0.1:3009");
    expect(mainOriginFor(loc("127.0.0.1"), null, null)).toBe("http://localhost:3009");
  });
  it("fails closed in production without configuration", () => {
    expect(readerOriginFor(loc("xplor9.example", ""), null, null)).toBeNull();
    expect(mainOriginFor(loc("reader.xplor9.example", ""), null, null)).toBeNull();
  });
  it("uses configured origins and refuses identical ones", () => {
    expect(readerOriginFor(loc("xplor9.example", ""), "https://reader.xplor9.example", "https://xplor9.example")).toBe("https://reader.xplor9.example");
    expect(readerOriginFor(loc("xplor9.example", ""), "https://xplor9.example", "https://xplor9.example")).toBeNull();
    expect(mainOriginFor({ protocol: "https:", hostname: "reader.xplor9.example", port: "" }, "https://xplor9.example", "https://reader.xplor9.example")).toBe(
      "https://xplor9.example",
    );
    // The reader page refuses to run on any origin other than the configured reader origin
    expect(mainOriginFor({ protocol: "https:", hostname: "xplor9.example", port: "" }, "https://xplor9.example", "https://reader.xplor9.example")).toBeNull();
  });
});

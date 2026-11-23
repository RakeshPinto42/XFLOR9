import type { ReaderSettings } from "@/features/reading/reader/settings";
import { EPUB_LIMITS, IMPORT_ERROR_CODES, PDF_LIMITS, type ImportErrorCode } from "./limits";

/**
 * Messages between XPLOR9 (host) and the isolated reader. Both sides:
 *  1. check event.origin against ONE exact expected origin (never "*"),
 *  2. check event.source is the expected window (the iframe / the parent),
 *  3. accept only these message types, with every field validated and no unknown fields.
 * Anything else is ignored.
 */
export const PROTOCOL = "xplor9.reader.v1";

export type ImportFormat = "epub" | "pdf";

export type HostToReader =
  | {
      protocol: typeof PROTOCOL;
      type: "open";
      requestId: string;
      format: ImportFormat;
      name: string;
      bytes: ArrayBuffer;
      position: string | null;
      settings: ReaderSettings;
    }
  | { protocol: typeof PROTOCOL; type: "nav"; requestId: string; action: "next" | "prev" }
  | { protocol: typeof PROTOCOL; type: "settings"; requestId: string; settings: ReaderSettings };

export type ReaderToHost =
  | { protocol: typeof PROTOCOL; type: "ready" }
  | { protocol: typeof PROTOCOL; type: "opened"; requestId: string; title: string; sections: number }
  | { protocol: typeof PROTOCOL; type: "relocated"; requestId: string; fraction: number; position: string; chapter: string | null }
  | { protocol: typeof PROTOCOL; type: "error"; requestId: string; code: ImportErrorCode };

const REQUEST_ID = /^[a-z0-9-]{8,64}$/;
const CFI = /^epubcfi\([^)\u0000-\u001f]{1,2000}\)$/;
const PDF_PAGE = /^pdf:page=([1-9]\d{0,5})$/;

/** A saved reading position: an EPUB CFI, or a PDF page ("pdf:page=12"). */
export function isPosition(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (CFI.test(v)) return true;
  const m = PDF_PAGE.exec(v);
  return !!m && Number(m[1]) <= PDF_LIMITS.maxPages;
}

export const pdfPosition = (page: number) => `pdf:page=${page}`;
export function pdfPageOf(position: string | null): number | null {
  const m = position ? PDF_PAGE.exec(position) : null;
  return m ? Number(m[1]) : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const keysExactly = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => k in o);
const shortText = (v: unknown, max: number) => typeof v === "string" && v.length <= max && !/[\u0000-\u0008\u000b-\u001f]/.test(v);

function isSettings(v: unknown): v is ReaderSettings {
  return (
    isObj(v) &&
    keysExactly(v, ["theme", "fontScale"]) &&
    (v.theme === "light" || v.theme === "warm" || v.theme === "dark") &&
    typeof v.fontScale === "number" &&
    Number.isInteger(v.fontScale) &&
    v.fontScale >= 80 &&
    v.fontScale <= 200
  );
}

const maxBytesFor = (format: ImportFormat) => (format === "pdf" ? PDF_LIMITS.maxFileBytes : EPUB_LIMITS.maxFileBytes);

export function parseHostMessage(data: unknown, maxBytes?: number): HostToReader | null {
  if (!isObj(data) || data.protocol !== PROTOCOL || typeof data.requestId !== "string" || !REQUEST_ID.test(data.requestId))
    return null;
  if (data.type === "open") {
    if (!keysExactly(data, ["protocol", "type", "requestId", "format", "name", "bytes", "position", "settings"])) return null;
    if (data.format !== "epub" && data.format !== "pdf") return null;
    if (!shortText(data.name, 200)) return null;
    const limit = maxBytes ?? maxBytesFor(data.format);
    if (!(data.bytes instanceof ArrayBuffer) || data.bytes.byteLength === 0 || data.bytes.byteLength > limit) return null;
    if (data.position !== null && !isPosition(data.position)) return null;
    if (data.position !== null && (data.format === "pdf") !== PDF_PAGE.test(data.position)) return null;
    if (!isSettings(data.settings)) return null;
    return data as HostToReader;
  }
  if (data.type === "nav") {
    if (!keysExactly(data, ["protocol", "type", "requestId", "action"])) return null;
    return data.action === "next" || data.action === "prev" ? (data as HostToReader) : null;
  }
  if (data.type === "settings") {
    return keysExactly(data, ["protocol", "type", "requestId", "settings"]) && isSettings(data.settings) ? (data as HostToReader) : null;
  }
  return null;
}

export function parseReaderMessage(data: unknown): ReaderToHost | null {
  if (!isObj(data) || data.protocol !== PROTOCOL) return null;
  if (data.type === "ready") return keysExactly(data, ["protocol", "type"]) ? (data as ReaderToHost) : null;
  if (typeof data.requestId !== "string" || !REQUEST_ID.test(data.requestId)) return null;
  switch (data.type) {
    case "opened":
      return keysExactly(data, ["protocol", "type", "requestId", "title", "sections"]) &&
        shortText(data.title, 200) &&
        Number.isInteger(data.sections) &&
        (data.sections as number) >= 0 &&
        (data.sections as number) <= Math.max(EPUB_LIMITS.maxEntries, PDF_LIMITS.maxPages)
        ? (data as ReaderToHost)
        : null;
    case "relocated":
      return keysExactly(data, ["protocol", "type", "requestId", "fraction", "position", "chapter"]) &&
        typeof data.fraction === "number" &&
        Number.isFinite(data.fraction) &&
        data.fraction >= 0 &&
        data.fraction <= 1 &&
        isPosition(data.position) &&
        (data.chapter === null || shortText(data.chapter, 200))
        ? (data as ReaderToHost)
        : null;
    case "error":
      return keysExactly(data, ["protocol", "type", "requestId", "code"]) && IMPORT_ERROR_CODES.includes(data.code as ImportErrorCode)
        ? (data as ReaderToHost)
        : null;
    default:
      return null;
  }
}

/** True only for a message from exactly the expected origin and window. */
export function isFrom(event: Pick<MessageEvent, "origin" | "source">, origin: string | null, source: unknown): boolean {
  return !!origin && origin !== "*" && origin !== "null" && event.origin === origin && !!source && event.source === source;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

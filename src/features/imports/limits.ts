/**
 * Hard limits for imported files (pre-R4 security review, 2026-11-23).
 * "Actual" sizes are counted while decompressing; ZIP metadata is never trusted on its own.
 */
export const EPUB_LIMITS = {
  /** Size of the .epub file itself. */
  maxFileBytes: 100 * 1024 * 1024,
  maxEntries: 10_000,
  /** Actual decompressed bytes of any single file inside the EPUB. */
  maxEntryBytes: 50 * 1024 * 1024,
  /** Actual decompressed bytes of all files together. */
  maxTotalBytes: 300 * 1024 * 1024,
  /** Actual decompressed bytes may be at most this many times the compressed size (per file). */
  maxCompressionRatio: 100,
  /** Compressed entries smaller than this are exempt from the ratio rule (tiny files compress oddly). */
  ratioExemptBelowBytes: 64 * 1024,
  maxPathLength: 512,
  /** The background worker is stopped if it hasn't finished in this time. */
  workerTimeoutMs: 20_000,
} as const;

export const PDF_LIMITS = {
  maxFileBytes: 300 * 1024 * 1024,
  maxPages: 5_000,
  /** Opening the document, or drawing one page, is abandoned after this long. */
  timeoutMs: 20_000,
  /** Largest canvas drawn for one page (pixels), whatever the zoom. */
  maxCanvasPixels: 16_000_000,
  /** Largest image PDF.js will decode (pixels). */
  maxImageSize: 25_000_000,
} as const;

export type ImportErrorCode =
  | "too-large"
  | "not-zip"
  | "too-many-files"
  | "entry-too-large"
  | "total-too-large"
  | "suspicious-compression"
  | "bad-path"
  | "duplicate-path"
  | "not-epub"
  | "parse-failed"
  | "timeout"
  | "too-many-pages"
  | "password-protected"
  | "storage-full"
  | "unsupported";

export const IMPORT_ERROR_CODES: readonly ImportErrorCode[] = [
  "too-large",
  "not-zip",
  "too-many-files",
  "entry-too-large",
  "total-too-large",
  "suspicious-compression",
  "bad-path",
  "duplicate-path",
  "not-epub",
  "parse-failed",
  "timeout",
  "too-many-pages",
  "password-protected",
  "storage-full",
  "unsupported",
];

/** Plain-language messages shown by XPLOR9 (never text supplied by the file or the reader frame). */
export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  "too-large": "This file is too large to open (limits: EPUB 100 MB, PDF 300 MB).",
  "not-zip": "This doesn't look like an EPUB or PDF file. It may be damaged or a different format.",
  "too-many-files": "This EPUB contains too many files to open safely.",
  "entry-too-large": "Part of this EPUB expands to an unsafe size, so it wasn't opened.",
  "total-too-large": "This EPUB expands to an unsafe total size, so it wasn't opened.",
  "suspicious-compression": "This EPUB is compressed in a suspicious way, so it wasn't opened.",
  "bad-path": "This EPUB contains files with unsafe names, so it wasn't opened.",
  "duplicate-path": "This EPUB contains duplicate files, so it wasn't opened.",
  "not-epub": "This file is missing parts every EPUB needs. It may be damaged.",
  "parse-failed": "This book couldn't be read. It may be damaged or use features XPLOR9 doesn't support.",
  timeout: "This file took too long to check, so it wasn't opened.",
  "too-many-pages": "This PDF has too many pages to open safely (limit 5,000).",
  "password-protected": "This PDF is password-protected. Remove the password and import it again.",
  "storage-full": "There isn't enough storage space in this browser for this file. Delete some imported books and try again.",
  unsupported: "This file type isn't supported yet.",
};

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(IMPORT_ERROR_MESSAGES[code]);
    this.name = "ImportError";
  }
}

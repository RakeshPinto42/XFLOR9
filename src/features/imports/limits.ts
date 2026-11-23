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
  "unsupported",
];

/** Plain-language messages shown by XPLOR9 (never text supplied by the file or the reader frame). */
export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  "too-large": "This file is too large to open (EPUB limit 100 MB).",
  "not-zip": "This doesn't look like an EPUB file. It may be damaged or a different format.",
  "too-many-files": "This EPUB contains too many files to open safely.",
  "entry-too-large": "Part of this EPUB expands to an unsafe size, so it wasn't opened.",
  "total-too-large": "This EPUB expands to an unsafe total size, so it wasn't opened.",
  "suspicious-compression": "This EPUB is compressed in a suspicious way, so it wasn't opened.",
  "bad-path": "This EPUB contains files with unsafe names, so it wasn't opened.",
  "duplicate-path": "This EPUB contains duplicate files, so it wasn't opened.",
  "not-epub": "This file is missing parts every EPUB needs. It may be damaged.",
  "parse-failed": "This EPUB couldn't be read. It may be damaged.",
  timeout: "This file took too long to check, so it wasn't opened.",
  unsupported: "This file type isn't supported yet.",
};

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(IMPORT_ERROR_MESSAGES[code]);
    this.name = "ImportError";
  }
}

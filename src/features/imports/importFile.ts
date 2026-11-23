"use client";

import { addImport, type ImportRecord } from "@/features/reading/storage/readingDb";
import { EPUB_LIMITS, ImportError, PDF_LIMITS } from "./limits";
import type { ImportFormat } from "./protocol";

/**
 * Importing a file on the MAIN origin. The file is never parsed here (that happens only in the
 * isolated reader); we only check its name, size and first bytes, then store it locally.
 */

/** Space kept free so XPLOR9's own data (progress, bookmarks) can still be saved. */
const SPACE_MARGIN_BYTES = 20 * 1024 * 1024;
/** Warn when the browser's storage for XPLOR9 is this full. */
export const STORAGE_WARN_RATIO = 0.8;

/** Format from the first bytes. EPUB = ZIP ("PK\x03\x04"); PDF header may follow up to 1 KB of junk. */
export function sniffFormat(head: Uint8Array): ImportFormat | null {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return "epub";
  const text = String.fromCharCode(...head.subarray(0, 1024));
  return text.includes("%PDF-") ? "pdf" : null;
}

export function formatFromName(name: string): ImportFormat | null {
  if (/\.epub$/i.test(name)) return "epub";
  if (/\.pdf$/i.test(name)) return "pdf";
  return null;
}

/** Checks name, size and content type. Returns the format or throws ImportError. */
export async function checkFile(file: Blob & { name: string }): Promise<ImportFormat> {
  const byName = formatFromName(file.name);
  if (!byName) throw new ImportError("unsupported");
  const limit = byName === "pdf" ? PDF_LIMITS.maxFileBytes : EPUB_LIMITS.maxFileBytes;
  if (file.size === 0) throw new ImportError("not-zip");
  if (file.size > limit) throw new ImportError("too-large");
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (sniffFormat(head) !== byName) throw new ImportError("not-zip");
  return byName;
}

export interface StorageInfo {
  usage: number;
  quota: number;
}

export async function storageInfo(): Promise<StorageInfo | null> {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return typeof usage === "number" && typeof quota === "number" && quota > 0 ? { usage, quota } : null;
  } catch {
    return null;
  }
}

const isQuotaError = (err: unknown) =>
  err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");

/** Validates and stores a file in this browser. Throws ImportError with a user-facing code. */
export async function importFile(file: File): Promise<ImportRecord> {
  const format = await checkFile(file);
  const info = await storageInfo();
  if (info && info.quota - info.usage < file.size + SPACE_MARGIN_BYTES) throw new ImportError("storage-full");
  let record: ImportRecord;
  try {
    record = await addImport(file, file.name, format);
  } catch (err) {
    throw isQuotaError(err) ? new ImportError("storage-full") : err;
  }
  // Ask the browser not to clear imported books under storage pressure (best effort; may be declined).
  void navigator.storage?.persist?.().catch(() => false);
  return record;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

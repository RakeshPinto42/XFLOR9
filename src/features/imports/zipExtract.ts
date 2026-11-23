import { Unzip, UnzipInflate, UnzipPassThrough, strFromU8 } from "fflate";
import { EPUB_LIMITS, ImportError } from "./limits";

/**
 * Validates and extracts an EPUB (ZIP) with enforced limits. Runs in a Web Worker in the
 * isolated reader origin, so a hostile file can't freeze the page.
 *
 * Every limit on decompressed size is enforced by COUNTING THE BYTES ACTUALLY PRODUCED while
 * decompressing. Declared sizes in ZIP headers are only used to reject early; a file that lies
 * about its sizes is still stopped at the real limit.
 */

export type Limits = { [K in keyof typeof EPUB_LIMITS]: number };

export interface ExtractedEpub {
  files: Map<string, Uint8Array>;
  totalBytes: number;
}

export function extractEpub(bytes: Uint8Array, limits: Limits = EPUB_LIMITS): ExtractedEpub {
  if (bytes.byteLength > limits.maxFileBytes) throw new ImportError("too-large");
  // ZIP local file header signature "PK\x03\x04"
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04)
    throw new ImportError("not-zip");
  // Early, cheap rejection from the central directory's entry count (still counted for real below).
  const declaredEntries = centralDirectoryEntryCount(bytes);
  if (declaredEntries !== null && declaredEntries > limits.maxEntries) throw new ImportError("too-many-files");

  const files = new Map<string, Uint8Array>();
  let entries = 0;
  let totalBytes = 0;
  let failure: ImportError | null = null;

  const unzip = new Unzip((file) => {
    if (failure) return;
    entries += 1;
    if (entries > limits.maxEntries) {
      failure = new ImportError("too-many-files");
      return;
    }
    const name = file.name;
    if (!isSafePath(name, limits.maxPathLength)) {
      failure = new ImportError("bad-path");
      return;
    }
    if (name.endsWith("/")) return; // directory entry: nothing to read
    if (files.has(name)) {
      failure = new ImportError("duplicate-path");
      return;
    }
    // Early rejection from declared sizes (cheap); the real enforcement is below.
    if (typeof file.originalSize === "number" && file.originalSize > limits.maxEntryBytes) {
      failure = new ImportError("entry-too-large");
      return;
    }

    const chunks: Uint8Array[] = [];
    let produced = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = new ImportError("not-zip");
        return;
      }
      produced += chunk.byteLength;
      totalBytes += chunk.byteLength;
      if (produced > limits.maxEntryBytes) failure = new ImportError("entry-too-large");
      else if (totalBytes > limits.maxTotalBytes) failure = new ImportError("total-too-large");
      else if (
        typeof file.size === "number" &&
        file.size >= limits.ratioExemptBelowBytes &&
        produced > file.size * limits.maxCompressionRatio
      )
        failure = new ImportError("suspicious-compression");
      if (failure) {
        file.terminate(); // stop decompressing this entry immediately
        return;
      }
      chunks.push(chunk);
      if (final) files.set(name, concat(chunks, produced));
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  try {
    // Feed small slices: fflate handles all entries within one push recursively, and thousands of
    // tiny entries in one push overflowed the call stack (found in browser testing). Small slices
    // also let a failure stop work early.
    const SLICE = 64 * 1024;
    for (let i = 0; i < bytes.byteLength && !failure; i += SLICE) {
      unzip.push(bytes.subarray(i, i + SLICE), i + SLICE >= bytes.byteLength);
    }
  } catch {
    if (!failure) failure = new ImportError("not-zip");
  }
  if (failure) throw failure;
  if (files.size === 0) throw new ImportError("not-zip");

  // Structural checks every EPUB must pass.
  const mimetype = files.get("mimetype");
  if (!mimetype || strFromU8(mimetype).trim() !== "application/epub+zip") throw new ImportError("not-epub");
  if (!files.has("META-INF/container.xml")) throw new ImportError("not-epub");

  return { files, totalBytes };
}

/** Relative paths only: no absolute paths, drive letters, backslashes, "..", or control characters. */
export function isSafePath(name: string, maxLength: number = EPUB_LIMITS.maxPathLength): boolean {
  if (!name || name.length > maxLength) return false;
  if (name.startsWith("/") || name.includes("\\") || /^[a-zA-Z]:/.test(name)) return false;
  if (/[\u0000-\u001f\u007f]/.test(name)) return false;
  return !name.split("/").some((part) => part === ".." || part === ".");
}

/** Total entries recorded in the End Of Central Directory record, or null if not found / ZIP64. */
export function centralDirectoryEntryCount(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stop = Math.max(0, bytes.byteLength - 22 - 0xffff); // EOCD is within the last 64 KB + 22 bytes
  for (let i = bytes.byteLength - 22; i >= stop; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      const total = view.getUint16(i + 10, true);
      return total === 0xffff ? null : total;
    }
  }
  return null;
}

function concat(chunks: Uint8Array[], length: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

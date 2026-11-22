/**
 * Prepares a curated public-domain EPUB for the XPLOR9 catalogue.
 *
 * What it changes (and nothing else):
 *   - removes the embedded cover image and the cover page, because scanned cover
 *     artwork can carry its own copyright (decision 2026-11-23);
 *   - removes references to those two files (manifest, spine, guide, cover meta,
 *     and <link rel="icon" type="image/x-cover"> tags in chapters).
 * Book text and the Project Gutenberg licence are left byte-for-byte untouched.
 *
 * Usage:  node scripts/books/prepare-epub.ts <source.epub> <output.epub>
 * Prints a JSON report (removed files, size, sha256) for the catalogue record.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export interface StripReport {
  removedFiles: string[];
  remainingImages: string[];
  editedFiles: string[];
}

const IMAGE = /\.(jpe?g|png|gif|svg|webp)$/i;

/** Removes the cover image and cover page from an unzipped EPUB (path → bytes). */
export function stripCover(files: Map<string, Uint8Array>): StripReport {
  const container = text(files, "META-INF/container.xml");
  const opfPath = container.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath || !files.has(opfPath)) throw new Error("EPUB has no package (OPF) file");
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  let opf = text(files, opfPath);

  // Cover image: EPUB2 <meta name="cover" content="ID"> or EPUB3 properties="cover-image".
  const coverIds = new Set<string>();
  const metaId = opf.match(/<meta\s+name="cover"\s+content="([^"]+)"\s*\/>/)?.[1];
  if (metaId) coverIds.add(metaId);
  for (const m of opf.matchAll(/<item\b[^>]*\bid="([^"]+)"[^>]*\bproperties="[^"]*cover-image[^"]*"[^>]*\/>/g)) coverIds.add(m[1]);

  // Cover page: the guide's type="cover" target.
  const coverPageHref = opf.match(/<reference\b[^>]*type="cover"[^>]*href="([^"#]+)[^"]*"[^>]*\/>/)?.[1];

  const removeHrefs = new Set<string>();
  const removeIds = new Set<string>(coverIds);
  for (const m of opf.matchAll(/<item\b[^>]*\/>/g)) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
    if (!id || !href) continue;
    if (coverIds.has(id) || href === coverPageHref) {
      removeIds.add(id);
      removeHrefs.add(href);
    }
  }
  if (removeHrefs.size === 0) throw new Error("No cover found to remove; refusing to guess");

  // Edit the package file.
  for (const id of removeIds) {
    opf = opf.replace(new RegExp(`\\s*<item\\b[^>]*\\bid="${escape(id)}"[^>]*/>`, "g"), "");
    opf = opf.replace(new RegExp(`\\s*<itemref\\b[^>]*\\bidref="${escape(id)}"[^>]*/>`, "g"), "");
  }
  opf = opf.replace(/\s*<meta\s+name="cover"\s+content="[^"]+"\s*\/>/g, "");
  opf = opf.replace(/\s*<reference\b[^>]*type="cover"[^>]*\/>/g, "");
  // Drop the build tool's comment describing the removed image.
  opf = opf.replace(/\s*<!--Image:[^>]*-->/g, "");
  files.set(opfPath, strToU8(opf));
  const editedFiles = [opfPath];

  // Remove cover icon links from content documents; nothing else in them changes.
  for (const [path, bytes] of files) {
    if (!/\.(x?html?|ncx)$/i.test(path) || removeHrefs.has(path.slice(base.length))) continue;
    const before = strFromU8(bytes);
    let after = before;
    for (const href of removeHrefs) {
      after = after.replace(new RegExp(`\\s*<link\\b[^>]*href="${escape(href)}"[^>]*/>`, "g"), "");
    }
    if (after !== before) {
      files.set(path, strToU8(after));
      editedFiles.push(path);
    }
  }

  const removedFiles = [...removeHrefs].map((h) => base + h);
  for (const f of removedFiles) files.delete(f);

  // Safety checks: no dangling references, every manifest file present.
  for (const [path, bytes] of files) {
    if (!/\.(x?html?|ncx|opf)$/i.test(path)) continue;
    const s = strFromU8(bytes);
    for (const href of removeHrefs) {
      if (s.includes(`"${href}`)) throw new Error(`${path} still references removed file ${href}`);
    }
  }
  const finalOpf = text(files, opfPath);
  for (const m of finalOpf.matchAll(/<item\b[^>]*\bhref="([^"]+)"/g)) {
    if (!files.has(base + decodeURIComponent(m[1]))) throw new Error(`Manifest lists missing file ${m[1]}`);
  }
  for (const m of finalOpf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)) {
    if (!new RegExp(`\\bid="${escape(m[1])}"`).test(finalOpf)) throw new Error(`Spine refers to missing item ${m[1]}`);
  }

  return { removedFiles, remainingImages: [...files.keys()].filter((p) => IMAGE.test(p)), editedFiles };
}

/** EPUB rule: "mimetype" must be the first entry and stored without compression. */
export function zipEpub(files: Map<string, Uint8Array>): Uint8Array {
  const mimetype = files.get("mimetype");
  if (!mimetype || strFromU8(mimetype).trim() !== "application/epub+zip") throw new Error("Not an EPUB (bad mimetype)");
  const entries: Zippable = { mimetype: [mimetype, { level: 0 }] };
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (path !== "mimetype") entries[path] = [bytes, { level: 9 }];
  }
  return zipSync(entries, { mtime: new Date("2026-11-23T00:00:00Z") }); // fixed time: reproducible output
}

export function unzipEpub(bytes: Uint8Array): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(bytes)).filter(([p]) => !p.endsWith("/")));
}

function text(files: Map<string, Uint8Array>, path: string): string {
  const b = files.get(path);
  if (!b) throw new Error(`Missing ${path}`);
  return strFromU8(b);
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// ---------- CLI ----------
if (process.argv[1]?.endsWith("prepare-epub.ts")) {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) {
    console.error("Usage: node scripts/books/prepare-epub.ts <source.epub> <output.epub>");
    process.exit(1);
  }
  const original = readFileSync(src);
  const files = unzipEpub(original);
  const report = stripCover(files);
  if (report.remainingImages.length) console.warn("Note: images remain:", report.remainingImages);
  const result = zipEpub(files);
  // Re-open the result to prove it is a readable EPUB.
  const reopened = unzipEpub(result);
  if (strFromU8(reopened.get("mimetype")!).trim() !== "application/epub+zip") throw new Error("Output failed to reopen");
  writeFileSync(out, result);
  console.log(
    JSON.stringify(
      {
        source: src,
        sourceSha256: sha256(original),
        output: out,
        bytes: result.byteLength,
        sha256: sha256(result),
        ...report,
      },
      null,
      2,
    ),
  );
}

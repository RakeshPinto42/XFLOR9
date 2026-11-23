/// <reference lib="webworker" />
/**
 * Background worker (isolated reader origin): validates and extracts an EPUB with enforced
 * limits, so even a zip bomb can't freeze the page. The page stops this worker on timeout.
 */
import { ImportError } from "../limits";
import { extractEpub } from "../zipExtract";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent) => {
  const data = event.data as { type?: unknown; bytes?: unknown };
  if (!data || data.type !== "extract" || !(data.bytes instanceof ArrayBuffer)) return;
  try {
    const { files } = extractEpub(new Uint8Array(data.bytes));
    self.postMessage({ ok: true, entries: [...files.entries()] });
  } catch (err) {
    self.postMessage({ ok: false, code: err instanceof ImportError ? err.code : "parse-failed" });
  }
};

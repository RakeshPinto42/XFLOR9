"use client";

import { useCallback, useState } from "react";
import { DEFAULT_SETTINGS } from "@/features/reading/reader/settings";
import { IMPORT_ERROR_MESSAGES } from "./limits";
import { ReaderFrame, useReaderBridge } from "./IsolatedReaderHost";

/** TEST-ONLY: pick a local file and open it in the isolated reader (used by tests/security). */
export function IsolationHarness() {
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState(0);
  return (
    <div className="fixed inset-0 z-30 flex flex-col gap-3 bg-plastic p-4">
      <label className="text-sm font-semibold">
        Test file
        <input
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          data-testid="file-input"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setKey((k) => k + 1);
          }}
          className="ml-2"
        />
      </label>
      <div className="flex min-h-0 flex-1 flex-col gap-2">{file && <HarnessReader key={key} file={file} />}</div>
    </div>
  );
}

function HarnessReader({ file }: { file: File }) {
  const format = /\.pdf$/i.test(file.name) ? "pdf" : "epub";
  const load = useCallback(() => file.arrayBuffer(), [file]);
  const { frameRef, readerOrigin, state, nav } = useReaderBridge({ load, name: file.name, format, position: null, settings: DEFAULT_SETTINGS });
  if (!readerOrigin) return <p role="alert">The separate reader isn&apos;t configured.</p>;
  return (
    <>
      <div className="flex items-center gap-3 text-sm" data-testid="host-status">
        <span data-testid="host-state">{state.status}</span>
        {state.status === "error" && state.error && (
          <span role="alert" data-testid="host-error" data-code={state.error}>
            {IMPORT_ERROR_MESSAGES[state.error]}
          </span>
        )}
        {state.title && <span data-testid="host-title">{state.title}</span>}
        {state.status === "ready" && <span data-testid="host-fraction">{Math.round(state.fraction * 100)}%</span>}
        <button type="button" onClick={() => nav("prev")} disabled={state.status !== "ready"}>
          Previous
        </button>
        <button type="button" onClick={() => nav("next")} disabled={state.status !== "ready"}>
          Next
        </button>
      </div>
      <ReaderFrame frameRef={frameRef} readerOrigin={readerOrigin} title="Imported book" className="min-h-0 w-full flex-1 rounded-xl border-2 border-ink/15" />
    </>
  );
}

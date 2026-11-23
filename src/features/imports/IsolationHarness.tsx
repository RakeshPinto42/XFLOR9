"use client";

import { useState } from "react";
import { IsolatedReaderHost } from "./IsolatedReaderHost";

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
          accept=".epub,application/epub+zip"
          data-testid="file-input"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setKey((k) => k + 1);
          }}
          className="ml-2"
        />
      </label>
      <div className="min-h-0 flex-1">{file && <IsolatedReaderHost key={key} file={file} />}</div>
    </div>
  );
}

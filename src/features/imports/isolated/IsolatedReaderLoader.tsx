"use client";

import dynamic from "next/dynamic";

/** Browser-only: the isolated reader (foliate, DOMPurify, worker) never loads on other pages. */
export const IsolatedReaderLoader = dynamic(() => import("./IsolatedReader").then((m) => m.IsolatedReader), {
  ssr: false,
});

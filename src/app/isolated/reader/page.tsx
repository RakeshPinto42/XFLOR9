import type { Metadata } from "next";
import { IsolatedReaderLoader } from "@/features/imports/isolated/IsolatedReaderLoader";

export const metadata: Metadata = { title: "Reader", robots: { index: false, follow: false } };

/**
 * Isolated reader for imported files. Served on the separate reader origin only; the page
 * refuses to run elsewhere, and the HTTP header frame-ancestors limits who can embed it.
 */
export default function IsolatedReaderPage() {
  return <IsolatedReaderLoader />;
}

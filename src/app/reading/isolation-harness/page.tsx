import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IsolationHarness } from "@/features/imports/IsolationHarness";

export const metadata: Metadata = { title: "Isolation test harness", robots: { index: false, follow: false } };

/**
 * TEST-ONLY page for the security suite. It exists only in builds made with
 * NEXT_PUBLIC_XPLOR9_SECURITY_HARNESS=1 (tests/security). Normal builds return 404, so this is
 * not a user-facing import feature.
 */
export default function IsolationHarnessPage() {
  if (process.env.NEXT_PUBLIC_XPLOR9_SECURITY_HARNESS !== "1") notFound();
  return <IsolationHarness />;
}

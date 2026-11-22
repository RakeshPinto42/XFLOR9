import { NextResponse } from "next/server";
import { RadioBrowserError } from "./client";

/** Every radio API error has the same JSON shape: { error: { code, message } }. */
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps upstream failures to a clear response; details go to the server log, not the visitor. */
export function upstreamError(err: unknown) {
  console.error("[radio]", err);
  if (err instanceof RadioBrowserError && err.code === "bad-request")
    return apiError(400, "invalid-request", "That request isn't valid for the station directory.");
  return apiError(
    502,
    "directory-unavailable",
    "The station directory isn't responding. Try again in a minute.",
  );
}

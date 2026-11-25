"use client";

import dynamic from "next/dynamic";
import type { DesktopData } from "./AppContent";

/** The desktop runs in the browser only: until it starts, the screen is black (a computer switching on). */
const Desktop = dynamic(() => import("./Desktop").then((m) => m.Desktop), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-black" role="status" aria-label="Starting XPLOR9" />,
});

export function DesktopLoader({ data }: { data: DesktopData }) {
  return <Desktop data={data} />;
}

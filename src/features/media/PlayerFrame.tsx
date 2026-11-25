"use client";

import type { ReactNode } from "react";

/** The provider's player in a CRT-style frame (TV and Music). */
export function PlayerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="crt-screen mx-auto mt-2 aspect-[4/3] w-full max-w-3xl bg-black p-[3%]" data-testid="tv-player" data-placement="frame">
      <div className="relative h-full w-full overflow-hidden rounded-[10%/12%]">{children}</div>
    </div>
  );
}

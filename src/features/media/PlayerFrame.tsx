"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ScreenRect } from "./screenState";

/**
 * On the 3D glass (follows the screen; shown once the camera arrives) or in its own CRT frame.
 * The element structure is the same either way, so switching never reloads the player.
 */
export function PlayerFrame({ onGlass, visible, rect, children }: { onGlass: boolean; visible: boolean; rect: ScreenRect | null; children: ReactNode }) {
  const glass = onGlass && rect !== null;
  const style: CSSProperties | undefined = glass
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }
    : undefined;
  return (
    <div
      className={glass ? "tv-glass fixed z-10 overflow-hidden bg-black transition-opacity duration-500" : "crt-screen mx-auto mt-2 aspect-[4/3] w-full max-w-3xl bg-black p-[3%]"}
      style={style}
      data-testid="tv-player"
      data-placement={glass ? "glass" : "frame"}
    >
      <div className={glass ? "h-full w-full" : "relative h-full w-full overflow-hidden rounded-[10%/12%]"}>{children}</div>
    </div>
  );
}

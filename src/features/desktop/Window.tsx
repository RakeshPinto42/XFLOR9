"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { DesktopApp } from "./apps";
import { DesktopIcon } from "./icons";
import { wm } from "./store";
import { playSystemSound } from "./systemSounds";
import { clampRect, resizeFrom, type Edge, type Rect, type WindowState } from "./windows";

const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** Follow the pointer by moving the element itself; the store is updated once, on release. */
function startDrag(e: React.PointerEvent, el: HTMLElement, apply: (dx: number, dy: number) => Rect, done: (r: Rect) => void) {
  if (e.button !== 0) return;
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const sx = e.clientX;
  const sy = e.clientY;
  let last: Rect | null = null;
  document.documentElement.dataset.dragging = "true"; // frames ignore the pointer while dragging
  const move = (ev: PointerEvent) => {
    last = apply(ev.clientX - sx, ev.clientY - sy);
    el.style.left = `${last.x}px`;
    el.style.top = `${last.y}px`;
    el.style.width = `${last.w}px`;
    el.style.height = `${last.h}px`;
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
    delete document.documentElement.dataset.dragging;
    if (last) done(last);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}

/**
 * One application window: title bar (drag to move, double-click to maximise), minimise /
 * maximise / close, and eight resize handles. On a phone (compact) every window fills the
 * desktop and can't be dragged. A minimised window stays mounted (hidden), so its radio,
 * video or game keeps going.
 */
export function Window({ win, app, focused, compact, children }: { win: WindowState; app: DesktopApp; focused: boolean; compact: boolean; children: ReactNode }) {
  const el = useRef<HTMLElement>(null);

  // Keyboard and screen-reader users land in the window that just opened or came to the front
  // (unless focus is already inside it, e.g. a game that focused its board).
  useEffect(() => {
    const node = el.current;
    if (!focused || win.minimized || !node || node.contains(document.activeElement)) return;
    node.focus({ preventScroll: true });
  }, [focused, win.minimized]);
  const maximized = win.maximized || compact;

  const drag = (e: React.PointerEvent, apply: (dx: number, dy: number) => Rect, done: (r: Rect) => void) => {
    if (el.current) startDrag(e, el.current, apply, done);
  };

  const onTitleDown = (e: React.PointerEvent) => {
    wm.focus(app.id);
    if (maximized || (e.target as HTMLElement).closest("button")) return;
    const start = { x: win.x, y: win.y, w: win.w, h: win.h };
    drag(
      e,
      (dx, dy) => clampRect({ ...start, x: start.x + dx, y: start.y + dy }, wm.area()),
      (r) => {
        wm.move(app.id, r.x, r.y);
        wm.commit(app.id);
      },
    );
  };

  const onEdgeDown = (edge: Edge) => (e: React.PointerEvent) => {
    wm.focus(app.id);
    const start = { x: win.x, y: win.y, w: win.w, h: win.h };
    drag(
      e,
      (dx, dy) => resizeFrom(start, edge, dx, dy, app.min),
      (r) => {
        wm.resize(app.id, r);
        wm.commit(app.id);
      },
    );
  };

  const minimize = () => {
    playSystemSound("minimize");
    wm.minimize(app.id);
    // Focus moves to the window's taskbar button, where it can be restored from.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.xp-task[data-task-for="${app.id}"]`)?.focus());
  };
  const close = () => {
    wm.close(app.id);
    // Focus goes back to the Start button rather than being lost with the window.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".xp-start")?.focus());
  };

  return (
    <section
      ref={el}
      role="dialog"
      tabIndex={-1}
      aria-modal="false"
      aria-labelledby={`win-${app.id}-title`}
      hidden={win.minimized}
      data-app={app.id}
      data-focused={focused || undefined}
      data-maximized={maximized || undefined}
      className="xp-window"
      style={maximized ? { zIndex: win.z } : { zIndex: win.z, left: win.x, top: win.y, width: win.w, height: win.h }}
      onPointerDownCapture={() => !focused && wm.focus(app.id)}
      onKeyDown={(e) => {
        // Escape inside a window never closes it (apps use Escape themselves); Alt+F4 isn't available in a browser.
        if (e.key === "F4" && e.altKey) {
          e.preventDefault();
          close();
        }
      }}
    >
      <header className="xp-titlebar" onPointerDown={onTitleDown} onDoubleClick={(e) => !compact && !(e.target as HTMLElement).closest("button") && wm.toggleMaximize(app.id)}>
        <DesktopIcon name={app.id} size={18} className="shrink-0" />
        <h2 id={`win-${app.id}-title`} className="xp-title">
          {app.title}
        </h2>
        <div className="xp-caption-buttons">
          <button type="button" className="xp-cap xp-cap--min" aria-label={`Minimise ${app.title}`} onClick={minimize}>
            <svg viewBox="0 0 10 10" aria-hidden>
              <rect x="1.5" y="7" width="6" height="2" fill="currentColor" />
            </svg>
          </button>
          {!compact && (
            <button type="button" className="xp-cap" aria-label={win.maximized ? `Restore ${app.title}` : `Maximise ${app.title}`} onClick={() => wm.toggleMaximize(app.id)}>
              <svg viewBox="0 0 10 10" aria-hidden>
                {win.maximized ? (
                  <path d="M3 1.5h5.5V7M1.5 3.5h5v5h-5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                ) : (
                  <path d="M1.5 1.5h7v7h-7z M1.5 2.5h7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                )}
              </svg>
            </button>
          )}
          <button type="button" className="xp-cap xp-cap--close" aria-label={`Close ${app.title}`} onClick={close}>
            <svg viewBox="0 0 10 10" aria-hidden>
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>
      <div className="xp-window-body">{children}</div>
      {!maximized && EDGES.map((edge) => <div key={edge} aria-hidden className={`xp-resize xp-resize--${edge}`} onPointerDown={onEdgeDown(edge)} />)}
    </section>
  );
}

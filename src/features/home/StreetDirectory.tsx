"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, type MouseEvent } from "react";
import { MODULES, type ModuleId } from "@/lib/modules";
import { streetView } from "./streetState";

/** How long the camera walks towards a chosen sign before the page changes. */
const WALK_MS = 700;

/**
 * The homepage's ways in. The list is the real, keyboard- and screen-reader-friendly navigation and
 * works without 3D. While the 3D street runs, each signboard also gets a pointer target laid over
 * it; both light the sign and walk the camera up to it before going.
 */
export function StreetDirectory() {
  const router = useRouter();
  const { signs } = useSyncExternalStore(streetView.subscribe, streetView.get, streetView.server);

  const choose = (e: MouseEvent, id: ModuleId, href: string) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Only walk when the street is drawn and the visitor didn't ask for a new tab or less motion.
    if (!signs[id] || reduced || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    streetView.go(id);
    window.setTimeout(() => router.push(href), WALK_MS);
  };

  return (
    <>
      {/* Pointer targets over the painted signs (the list below is the accessible route). */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[5]">
        {MODULES.map((m) => {
          const r = signs[m.id];
          if (!r || r.width < 8) return null;
          return (
            <Link
              key={m.id}
              href={m.href}
              tabIndex={-1}
              data-testid={`sign-${m.id}`}
              onMouseEnter={() => streetView.hover(m.id)}
              onMouseLeave={() => streetView.hover(null)}
              onClick={(e) => choose(e, m.id, m.href)}
              className="pointer-events-auto absolute cursor-pointer"
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            />
          );
        })}
      </div>

      <section aria-labelledby="lane-heading" className="pointer-events-none relative z-10 mx-auto flex min-h-[calc(100dvh-8rem)] max-w-6xl flex-col justify-end px-4 pb-16 sm:px-6 sm:pb-10">
        <p className="font-pixel text-xs tracking-widest text-panel/80 [text-shadow:0_1px_6px_rgb(0_0_0/0.8)]">MONSOON LANE · 7:40 PM</p>
        <h1 id="lane-heading" className="mt-1 font-display text-4xl text-panel [text-shadow:0_2px_12px_rgb(0_0_0/0.7)] sm:text-5xl">
          Where to tonight?
        </h1>
        <ul className="pointer-events-auto mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {MODULES.map((m) => (
            <li key={m.id}>
              <Link
                href={m.href}
                onMouseEnter={() => streetView.hover(m.id)}
                onMouseLeave={() => streetView.hover(null)}
                onFocus={() => streetView.hover(m.id)}
                onBlur={() => streetView.hover(null)}
                onClick={(e) => choose(e, m.id, m.href)}
                className="group flex items-baseline gap-2 text-panel [text-shadow:0_1px_8px_rgb(0_0_0/0.8)]"
              >
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `var(--color-${m.id})` }} />
                <span className="text-xl font-semibold underline-offset-4 group-hover:underline group-focus-visible:underline">{m.name}</span>
                <span className="sr-only">: {m.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

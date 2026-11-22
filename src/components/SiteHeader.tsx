"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES } from "@/lib/modules";

const DOT: Record<string, string> = {
  radio: "bg-radio",
  tv: "bg-tv",
  music: "bg-music",
  games: "bg-games",
  reading: "bg-reading",
};

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-ink/15">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="logo-mark text-3xl leading-none" aria-label="XPLOR9 home">
          XPLOR9
        </Link>
        <nav aria-label="Modules" className="-mx-1 flex-1 basis-full sm:basis-auto">
          <ul className="flex flex-wrap gap-1">
            {MODULES.map((m) => {
              const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
              return (
                <li key={m.id}>
                  <Link
                    href={m.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.95rem] font-semibold transition-colors ${
                      active ? "bg-ink text-panel" : "hover:bg-ink/10"
                    }`}
                  >
                    <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[m.id]}`} />
                    {m.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A window's menu bar (Game, Level, Help…), shared by every app that has one. Menus open on click,
 * move between each other with ←/→ while open, items with ↑/↓, Enter runs one, Escape closes.
 * Every item runs a real action; a checked item shows which option is in force.
 */
export interface MenuItem {
  label: string;
  run: () => void;
  checked?: boolean;
  disabled?: boolean;
  /** Shown on the right, e.g. "F2". */
  hint?: string;
}
export interface Menu {
  label: string;
  items: (MenuItem | "separator")[];
}

export function MenuBar({ menus, label }: { menus: Menu[]; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    root.current?.querySelector<HTMLElement>(`[data-menu="${open}"] .xp-menu [role^=menuitem]:not([aria-disabled="true"])`)?.focus();
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(null);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (focusMenu?: number) => {
    setOpen(null);
    if (focusMenu !== undefined) root.current?.querySelectorAll<HTMLElement>(".xp-menubar-top")[focusMenu]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (open === null) return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>(`[data-menu="${open}"] .xp-menu [role^=menuitem]:not([aria-disabled="true"])`) ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus();
    if (e.key === "Escape") close(open);
    else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "ArrowRight") setOpen((open + 1) % menus.length);
    else if (e.key === "ArrowLeft") setOpen((open - 1 + menus.length) % menus.length);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={root} className="xp-menubar" role="menubar" aria-label={label} onKeyDown={onKeyDown}>
      {menus.map((m, mi) => (
        <div key={m.label} className="relative" data-menu={mi}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === mi}
            className="xp-menubar-top"
            onClick={() => setOpen((o) => (o === mi ? null : mi))}
            onPointerEnter={() => open !== null && setOpen(mi)}
          >
            {m.label}
          </button>
          {open === mi && (
            <div className="xp-menu" role="menu" aria-label={m.label}>
              {m.items.map((it, k) =>
                it === "separator" ? (
                  <div key={`sep-${k}`} role="separator" className="xp-menu-sep" />
                ) : (
                  <button
                    key={it.label}
                    type="button"
                    role={it.checked === undefined ? "menuitem" : "menuitemradio"}
                    aria-checked={it.checked}
                    aria-disabled={it.disabled || undefined}
                    className="xp-menu-item"
                    onClick={() => {
                      if (it.disabled) return;
                      close(mi);
                      it.run();
                    }}
                  >
                    <span className="xp-menu-check" aria-hidden>
                      {it.checked ? "●" : ""}
                    </span>
                    <span className="flex-1">{it.label}</span>
                    {it.hint && <span className="xp-menu-hint">{it.hint}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

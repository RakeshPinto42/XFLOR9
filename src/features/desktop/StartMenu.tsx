"use client";

import { useEffect, useRef } from "react";
import { APPS, type AppId } from "./apps";
import { DesktopIcon } from "./icons";
import { openControlPanel, useDesktopPrefs, type ControlTab } from "./store";

/**
 * The start menu: programs on the left, settings on the right, Log off / Turn off at the foot.
 * A real menu for keyboards: arrow keys move, Enter opens, Escape closes and returns to Start.
 */
export function StartMenu({ onOpen, onClose, onLogOff, onTurnOff }: { onOpen: (id: AppId) => void; onClose: () => void; onLogOff: () => void; onTurnOff: () => void }) {
  const prefs = useDesktopPrefs();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const settings = (tab: ControlTab) => () => {
    openControlPanel(tab);
    onClose();
  };

  return (
    <div id="start-menu" ref={root} className="xp-start-menu" role="menu" aria-label="Start menu" onKeyDown={onKeyDown}>
      <div className="xp-start-head">
        <span className="xp-user-tile" aria-hidden>
          {prefs.userName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate">{prefs.userName}</span>
      </div>
      <div className="xp-start-body">
        <ul className="xp-start-programs" role="none">
          {APPS.filter((a) => a.id !== "control").map((a) => (
            <li key={a.id} role="none">
              <button type="button" role="menuitem" className="xp-start-item" onClick={() => onOpen(a.id)}>
                <DesktopIcon name={a.id} size={32} />
                <span className="min-w-0">
                  <span className="block truncate font-bold">{a.title}</span>
                  <span className="block truncate text-[11px] opacity-70">{a.blurb}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <ul className="xp-start-places" role="none">
          <li role="none">
            <button type="button" role="menuitem" className="xp-start-item" onClick={settings("display")}>
              <DesktopIcon name="control" size={24} />
              <span className="font-bold">Control Panel</span>
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="xp-start-item" onClick={settings("display")}>
              <DesktopIcon name="folder" size={24} />
              Wallpaper and colours
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="xp-start-item" onClick={settings("sound")}>
              <DesktopIcon name="volume" size={24} className="xp-dark-glyph" />
              Sound
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="xp-start-item" onClick={settings("about")}>
              <DesktopIcon name="start" size={24} />
              About XPLOR9
            </button>
          </li>
        </ul>
      </div>
      <div className="xp-start-foot">
        <button type="button" role="menuitem" className="xp-foot-button" onClick={onLogOff}>
          <DesktopIcon name="logoff" size={22} />
          Log off
        </button>
        <button type="button" role="menuitem" className="xp-foot-button" onClick={onTurnOff}>
          <DesktopIcon name="shutdown" size={22} />
          Turn off computer
        </button>
      </div>
    </div>
  );
}

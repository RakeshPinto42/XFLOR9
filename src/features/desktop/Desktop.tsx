"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getPlaybackEngine } from "@/lib/playback/browser";
import { getMixer } from "@/lib/sound/browser";
import { AppContent, type DesktopData } from "./AppContent";
import { APPS, APP_BY_ID, isAppId, type AppId } from "./apps";
import { BootSequence, PoweredOff, ShutDownDialog, ShuttingDown, Welcome } from "./Boot";
import { DesktopIcon } from "./icons";
import { StartMenu } from "./StartMenu";
import { openControlPanel, setDesktopPrefs, useDesktop, useDesktopPrefs, wm } from "./store";
import { playSystemSound, playWhenReady } from "./systemSounds";
import { Taskbar } from "./Taskbar";
import { Window } from "./Window";
import { focusedId } from "./windows";
import "./desktop.css";

type Phase = "boot" | "welcome" | "desktop" | "shutting-down" | "off";
/** Logged in during this tab's session: a reload goes straight back to the desktop. */
const SESSION_KEY = "xplor9.session";

const COMPACT = "(max-width: 640px)";
const subscribeCompact = (l: () => void) => {
  const m = window.matchMedia(COMPACT);
  m.addEventListener("change", l);
  return () => m.removeEventListener("change", l);
};
const useCompact = () => useSyncExternalStore(subscribeCompact, () => window.matchMedia(COMPACT).matches, () => false);

function readSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "in";
  } catch {
    return false;
  }
}
function writeSession(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(SESSION_KEY, "in");
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the visitor just sees the welcome screen again after a reload.
  }
}

function initialPhase(): Phase {
  if (isAppId(new URLSearchParams(window.location.search).get("open"))) return "desktop";
  return readSession() ? "desktop" : "boot";
}

export function Desktop({ data }: { data: DesktopData }) {
  const prefs = useDesktopPrefs();
  const desktop = useDesktop();
  const compact = useCompact();
  // Client only (see DesktopLoader): where to start depends on this tab's session and the address.
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [startOpen, setStartOpen] = useState(false);
  const [shutdownAsk, setShutdownAsk] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<AppId | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const lastPointer = useRef("");

  // A direct link to an app (old /radio, /tv… addresses land here) opens it and skips the start-up.
  useEffect(() => {
    getMixer(); // listens for the first gesture, so sound can start
    const open = new URLSearchParams(window.location.search).get("open");
    if (!isAppId(open)) return;
    writeSession(true);
    wm.open(open);
    window.history.replaceState(null, "", "/");
  }, []);

  // The desktop area is the window minus the taskbar; windows are kept inside it.
  useEffect(() => {
    const el = area.current;
    if (!el || phase !== "desktop") return;
    const ro = new ResizeObserver(() => wm.setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    wm.setArea({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [phase]);

  const openApp = useCallback((id: AppId) => {
    if (!wm.isOpen(id)) playSystemSound("open");
    wm.open(id);
    setStartOpen(false);
    setMenu(null);
  }, []);

  const login = () => {
    writeSession(true);
    setPhase("desktop");
    // The click on the name is the gesture that lets sound start.
    playWhenReady("startup");
  };

  const endSession = (next: Phase) => {
    getPlaybackEngine().stop();
    wm.closeAll();
    writeSession(false);
    setStartOpen(false);
    setShutdownAsk(false);
    setPhase(next);
  };
  const logOff = () => {
    playSystemSound("logoff");
    endSession("welcome");
  };
  const turnOff = (restart: boolean) => {
    playSystemSound("shutdown");
    endSession("shutting-down");
    window.setTimeout(() => setPhase(restart ? "boot" : "off"), 1800);
  };

  // Keyboard: Ctrl+Esc opens the start menu (as it always did); Escape closes menus.
  useEffect(() => {
    if (phase !== "desktop") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.ctrlKey) {
        e.preventDefault();
        setStartOpen((o) => !o);
      } else if (e.key === "Escape") {
        setMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // Closing the start menu by clicking anywhere else.
  useEffect(() => {
    if (!startOpen && !menu) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (startOpen && !t.closest("#start-menu, .xp-start")) setStartOpen(false);
      if (menu && !t.closest(".xp-context")) setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [startOpen, menu]);

  const focused = focusedId(desktop);
  const theme = prefs.theme;

  return (
    <div className="xp-root" data-theme={theme} data-wallpaper={prefs.wallpaper}>
      {phase === "boot" && (
        <BootSequence
          full={!prefs.bootSeen}
          onDone={() => {
            if (!prefs.bootSeen) setDesktopPrefs({ bootSeen: true });
            setPhase("welcome");
          }}
        />
      )}
      {phase === "welcome" && <Welcome name={prefs.userName} onLogin={login} />}
      {phase === "shutting-down" && <ShuttingDown />}
      {phase === "off" && <PoweredOff onPowerOn={() => setPhase("boot")} />}

      {phase === "desktop" && (
        <>
          <h1 className="sr-only">XPLOR9 desktop</h1>
          <div
            ref={area}
            className="xp-desktop"
            onContextMenu={(e) => {
              if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest(".xp-icons")) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              setMenu({ x: Math.min(e.clientX - rect.left, rect.width - 220), y: Math.min(e.clientY - rect.top, rect.height - 150) });
            }}
            onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
          >
            <ul className="xp-icons" aria-label="Desktop">
              {APPS.filter((a) => a.onDesktop).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="xp-icon"
                    aria-pressed={selected === a.id}
                    // A double-click opens, as it always did; one tap opens on touch screens.
                    onPointerDown={(e) => (lastPointer.current = e.pointerType)}
                    onClick={(e) => {
                      setSelected(a.id);
                      // detail 0 = Enter or Space from the keyboard.
                      if (lastPointer.current === "touch" || lastPointer.current === "pen" || e.detail === 0) openApp(a.id);
                      lastPointer.current = "";
                    }}
                    onDoubleClick={() => openApp(a.id)}
                    aria-label={`${a.title}: ${a.blurb}`}
                  >
                    <DesktopIcon name={a.id} size={44} />
                    <span className="xp-icon-label">{a.title}</span>
                  </button>
                </li>
              ))}
            </ul>

            {desktop.windows.map((w) => (
              <Window key={w.id} win={w} app={APP_BY_ID[w.id as AppId]} focused={focused === w.id} compact={compact}>
                <AppContent id={w.id as AppId} data={data} />
              </Window>
            ))}

            {menu && (
              <div className="xp-context" role="menu" aria-label="Desktop menu" style={{ left: menu.x, top: menu.y }}>
                {[
                  { label: "Change wallpaper…", run: () => openControlPanel("display") },
                  { label: "Sound…", run: () => openControlPanel("sound") },
                  { label: "Minimise all windows", run: () => desktop.windows.forEach((w) => wm.minimize(w.id as AppId)) },
                  { label: "About XPLOR9", run: () => openControlPanel("about") },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="xp-context-item"
                    onClick={() => {
                      item.run();
                      setMenu(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {startOpen && (
            <StartMenu
              onOpen={openApp}
              onClose={() => {
                setStartOpen(false);
                document.querySelector<HTMLElement>(".xp-start")?.focus();
              }}
              onLogOff={logOff}
              onTurnOff={() => {
                setStartOpen(false);
                setShutdownAsk(true);
              }}
            />
          )}
          <Taskbar
            startOpen={startOpen}
            onStart={() => {
              if (!startOpen) playSystemSound("menu");
              setStartOpen((o) => !o);
            }}
          />
          {shutdownAsk && <ShutDownDialog onLogOff={logOff} onRestart={() => turnOff(true)} onTurnOff={() => turnOff(false)} onCancel={() => setShutdownAsk(false)} />}
        </>
      )}
    </div>
  );
}

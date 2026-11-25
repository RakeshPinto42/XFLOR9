# Desktop architecture (D1)

## How it fits together

| Layer | Location | Owns |
|---|---|---|
| Page | `src/app/page.tsx` | Validates the TV, Music and official-channel catalogues at build time and hands them to the desktop |
| Loader | `src/features/desktop/DesktopLoader.tsx` | Runs the desktop in the browser only (it depends on this tab's session and the address) |
| Desktop | `src/features/desktop/Desktop.tsx` | Phases (boot → welcome → desktop → shutting down → off), icons, context menu, start menu, taskbar, deep links (`?open=`) |
| Window rules | `src/features/desktop/windows.ts` | Pure functions: open, focus/z-order, minimise, maximise, move, resize, keep the title bar reachable. Unit-tested |
| Window store | `src/features/desktop/store.ts` | Live window state, remembered window places and desktop preferences (localStorage) |
| Window frame | `src/features/desktop/Window.tsx` | Title bar, caption buttons, drag and 8-way resize (the element follows the pointer; the store is updated on release) |
| Apps | `src/features/desktop/apps.ts`, `AppContent.tsx` | App list (one source for icons, start menu, taskbar) and each app's component, loaded on first open |
| Sound | `src/features/desktop/systemSounds.ts`, `src/lib/sound/`, `src/engine/audio/mixer.ts` | Synthesised system sounds on the shared mixer's effects bus; master volume and mute also scale the radio |
| One sound at a time | `src/lib/playback/mediaFocus.ts` | TV, Music videos, Video and the shared audio player pause each other |

## Choices and trade-offs

- **Own window manager instead of a library.** The rules are ~150 lines of tested pure functions;
  libraries for this are either abandoned or bring styling we'd fight.
- **Minimised windows stay mounted** (hidden), so media and games keep running. Windows keep a fixed
  DOM order (z-order is CSS only), so a frame is never moved in the DOM and never reloads.
- **Reading Room in a same-origin frame.** It keeps working exactly as before (its routes, reader
  isolation, imports) with no rewrite; the cost is a page-within-a-window look, to be restyled.
- **Phones:** below 640 px every window fills the desktop, icons form a grid, taskbar buttons are
  icon-only, one tap opens an app.
- **Sound:** nothing plays before the visitor's first gesture; the welcome screen's click is that
  gesture and plays the start-up sound. Sound defaults to on; Mute (tray or Control Panel) silences
  system sounds and the radio. YouTube's and the Internet Archive's players have their own volume.

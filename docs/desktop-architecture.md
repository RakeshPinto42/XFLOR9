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
| Your data (P2) | `src/features/data/` (`registry.ts`, `backup.ts`, `localData.ts`), `apps/DataPanel.tsx` | Which app owns each stored setting; the backup file format and its validation; restore (all or nothing), storage used, clearing. Control Panel → Your data |
| One sound at a time, one tray | `src/lib/playback/mediaFocus.ts` | TV, Music videos, Video and the shared audio player pause each other; each window publishes what it plays (`useMediaSession`) and the tray shows the latest (`chooseNowPlaying`) |
| Saved playlists (P3) | `src/features/music/library.ts`, `musicStores.ts`, `AddToMusic.tsx` | Saved Music playlists and videos added from Video and TV (`xplor9.music.library`, validated on read) |

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

## Your data: backup, restore and clearing (P2)

- **One registry** (`src/features/data/registry.ts`) says which app owns every browser-storage key;
  a unit test fails if a key in `STORAGE_KEYS` belongs to no app, so new settings can't be missed
  by backups. The Reading Room's IndexedDB (progress, bookmarks, favourites, recent, imported books)
  belongs to the Reading Room.
- **The backup is one JSON file** (`xplor9-backup-YYYY-MM-DD.json`, format `xplor9-backup`,
  version 1). `checksum` is SHA-256 over `apps`; imported books' bytes are base64 in `files`,
  each checked against its own SHA-256, its size and its file signature (EPUB = ZIP, PDF = `%PDF-`).
  The file is built from parts (a Blob), so large books never become one string. Books total at
  most 280 MB per backup, files at most 400 MB.
- **Restore checks everything first**: JSON, format, version (a newer version is refused), checksum,
  every Reading Room record through the same validators the Reading Room uses, no duplicates, every
  book present and intact. Settings unknown to this version are left out and counted. A failed check
  changes nothing.
- **Restore is all or nothing** for the ticked apps: settings are snapshotted, then written; the
  Reading Room is replaced in one IndexedDB transaction; if that fails, the settings are put back.
  Restore *replaces* each ticked app's data (restoring twice gives the same result). A backup made
  without imported books keeps the books already in the browser.
- **Settings are stored and restored as the exact text** the apps wrote; each app already validates
  what it reads from storage, which stays the trust boundary for settings.
- **After a restore or clear XPLOR9 restarts** (open windows come back through session restore) and
  the Control Panel reopens on Your data with the result, rather than refreshing every app in place.
- **Automatic clean-up:** the panel can ask the browser to keep XPLOR9's data (`navigator.storage.persist`);
  the browser decides.

## One media system (P3)

- **Every player publishes a session** (title, status, toggle, stop, which window) through
  `useMediaSession` in `mediaFocus.ts`, which also does "one sound at a time". The shared audio
  player (radio, records) isn't published; the tray reads it directly.
- **The tray shows one player**: the one that most recently took the speakers if it still has
  something, else one that's playing, else the shared player, else any window's (`chooseNowPlaying`,
  unit-tested). Players that can't be controlled from outside (Internet Archive) offer Stop only.
- **Saved playlists** hold the same ids as the playing playlist: catalogue track ids, or
  `yt:<videoId>` for a video added from Video or TV, whose title and channel are kept with the
  playlists (`musicLibrary`). Video and TV write only there, never to the playing playlist, so they
  work without Music being open. Only single YouTube videos can be added: Music advances when
  YouTube's player reports the end.

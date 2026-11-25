# XPLOR9

Your childhood. Reconnected. A nostalgic personal computer from 1990–2010: radio, television, music, video, games and a reading room, in windows on a desktop.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

## Structure

- `src/features/desktop/`: the XPLOR9 computer: boot and welcome screens, desktop, windows, taskbar, start menu, Control Panel, Notepad, system sounds.
- `src/features/{radio,tv,music,video,games,reading}/`: the applications.
- `src/lib/`: playback engine, sound settings, local-only storage. Nothing leaves the browser.
- `src/app/`: `/` (the desktop), `/reading/*` (Reading Room and reader), `/api/radio/*`. Old `/radio`, `/tv`, `/music`, `/games` addresses open the matching window.

Planning: [docs/roadmap.md](docs/roadmap.md), [docs/desktop-architecture.md](docs/desktop-architecture.md), [docs/known-issues.md](docs/known-issues.md).

Content rules: only public-domain, properly licensed or officially embeddable content. Radio streams are played directly from the broadcaster (HTTPS only, never proxied).

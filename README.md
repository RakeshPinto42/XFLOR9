# XPLOR9

Your childhood. Reconnected. A nostalgic personal computer from 1990–2010: radio, television, music, video, games and a reading room, in windows on a desktop.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

## YouTube search (optional)

Video can search all of YouTube through XPLOR9's server (the key never reaches the browser).
Without a key, search says it isn't set up; everything else works.

1. In Google Cloud, create a project, enable **YouTube Data API v3**, and create an **API key**.
   Restrict the key to the YouTube Data API v3.
2. Put it in `.env.local` (never committed):

   ```
   YOUTUBE_API_KEY=your-key
   # optional: searches per day, default 90 (each costs 100 of the free 10,000 daily units)
   YOUTUBE_SEARCH_DAILY_LIMIT=90
   ```
3. Restart `npm run dev` (or set the same variables in your host's settings).

Repeated searches are cached for hours, each visitor is limited to 20 searches a minute, and the
daily budget resets at midnight Pacific time, when Google resets the quota.

## Structure

- `src/features/desktop/`: the XPLOR9 computer: boot and welcome screens, desktop, windows, taskbar, start menu, Control Panel, Notepad, system sounds.
- `src/features/{radio,tv,music,video,games,reading}/`: the applications.
- `src/lib/`: playback engine, sound settings, local-only storage. Nothing leaves the browser.
- `src/app/`: `/` (the desktop), `/reading/*` (Reading Room and reader), `/api/radio/*`. Old `/radio`, `/tv`, `/music`, `/games` addresses open the matching window.

Planning: [docs/roadmap.md](docs/roadmap.md), [docs/desktop-architecture.md](docs/desktop-architecture.md), [docs/known-issues.md](docs/known-issues.md).

Content rules: only public-domain, properly licensed or officially embeddable content. Radio streams are played directly from the broadcaster (HTTPS only, never proxied).

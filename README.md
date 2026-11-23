# XPLOR9

Your childhood. Reconnected. Radio, TV, music, games and a reading room inspired by Indian 90s and 2000s entertainment.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

## Structure

- `src/lib/modules.ts`: the five modules (name, route, status). Flip a status to make a module live.
- `src/lib/storage/`: local-only persistence. Nothing leaves the browser.
- `src/components/`: shared shell (header, CRT intro, module devices, placeholder pages).
- `src/app/`: routes for `/`, `/radio`, `/tv`, `/music`, `/games`, `/reading`.

Planning: [docs/roadmap.md](docs/roadmap.md) (master roadmap), [docs/creative-direction.md](docs/creative-direction.md) (creative standard), [docs/known-issues.md](docs/known-issues.md). Engine: [docs/scene-format.md](docs/scene-format.md) (scene files), [docs/asset-pipeline.md](docs/asset-pipeline.md), [docs/audio-architecture.md](docs/audio-architecture.md), [docs/character-system.md](docs/character-system.md).

Content rules: only public-domain, properly licensed or officially embeddable content. Radio streams are played directly from the broadcaster (HTTPS only, never proxied).

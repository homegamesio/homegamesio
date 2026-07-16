# homegamesio

The public website for the Homegames platform (homegames.io): landing page, game catalog, game/developer pages, in-browser play, and a full browser-based **Developer Studio**. It's plain HTML + vanilla JS (no framework); all data comes from the [api](../api) at `https://api.homegames.io`, and hosted multiplayer sessions come from Homenames at `https://core.homegames.io:7400`.

## Pages

| Page | What it does |
|---|---|
| `index.html` | Landing: featured games, live multiplayer sessions, Studio promo |
| `catalog.html` | Browse/search published games (featured/NSFW filters, pagination) |
| `game.html?id=` | Game detail: versions, download, comments, active sessions, view source, inline play |
| `dev.html?id=` | Public developer profile (bio, image, BTC address, published games) |
| `play.html` | The player. Local mode (`?localGame=&ref=` → fetches a local-play manifest + asset bundle, runs `HomegamesClient.LocalSession` fully in-browser) or hosted mode (`?ws=` / date-bound opaque share code `?s=` → WebSocket to a hosted session) |
| `studio.html` + `studio.js` | The Developer Studio (below) |
| `view.html?game=&sha=` | Read-only source viewer with syntax highlighting |
| `admin.html` + `admin.js` | Admin moderation console (login form; requires `isAdmin`): stats, users/games/assets/comments, publish approve/reject, featured/NSFW toggles, support messages, session pinning |
| `docs.html` | The human-facing "How to make Homegames games" tutorial, with an "ask something" box (questions go to `POST api.homegames.io/docs/ask`, answered by the [worker](../worker)'s local LLM) |
| `how_it_works.html` | End-to-end "what is this / how does it work" explainer |
| `self-hosting.html` | Guide to running a Homegames server at home |
| `about.html`, `terms.html`, `privacy.html`, `reset-password.html`, `self-hosting.html` (stub) | Supporting pages |

## The Developer Studio

A browser IDE (three-column "blades" layout) backed by the API's `/studio/*` endpoints:

- **Accounts**: signup/login, JWT auto-refreshed every 12 minutes (tokens expire ~15 min), email verification by code — publishing and uploads are gated on verified.
- **Guest mode**: edit a template in-memory with local preview, draft in `localStorage`; signup claims the guest game.
- **Games**: create from templates (Git-backed via Forgejo behind the API), file tree + tabbed editor, save = commit, version history/restore/clone.
- **AI edits**: currently disabled (`AI_FEATURES_ENABLED = false` in studio.js; the API endpoint is gated too) — local models aren't good/fast enough for full game generation. The plumbing ("Ask AI to edit" → `POST /studio/games/:id/llm-modify` → [worker](../worker) → new commit) remains for when it's re-enabled.
- **Assets**: upload (drag/drop), draw on canvas, record audio, browse/tag/describe, public/private, NSFW flags.
- **Preview**: local (in-tab `LocalSession`, instant reload) or online (hosted session with a shareable link).
- **Publish**: `POST /studio/games/:id/publish` → server-side validation (AST scan + Docker sandbox) → public catalog listing on pass (featured games are hand-picked by an admin).

## Build & serve

```sh
npm install     # needs sibling ../homegames-client and ../homegames-common (file: deps)
npm run build   # webpack: client.js → web/bundle.js
```

`client.js` is the only webpacked entry (→ `bundle.js`, used by the main site pages); `studio.js`, `admin.js`, and `reset-password.js` ship unbundled as their own entry points.

Two serving mechanisms exist:

- **`app.js`** — a plain Node server (port 81) that routes the pages and also serves `/homegames-client.js` and `/socket-worker.js` out of the `homegames-client` package and `/authoring-guide` from `homegames-common/docs/squishjs-game-authoring.md`. Useful for local dev.
- **`deploy.sh`** — production: uploads `bundle.js` to the `homegames.io` S3 bucket and invalidates CloudFront (distribution id in `prod.env`). Note it only pushes `bundle.js` — HTML and other JS are deployed by other means.

All URLs are hardcoded in the JS (`config.js` is an empty gitignored module): `api.homegames.io`, `core.homegames.io:7400`, `builds.homegames.io` (desktop installers), `homegames.link` / `public.homegames.link`, demo at `picodeg.io`.

## Related repos

- **[api](../api)** — powers every data call on the site (auth, games, studio, assets, admin, publishing)
- **[homegames-client](../homegames-client)** — the browser game runtime (`/homegames-client.js`, `LocalSession`) used by play.html and studio previews
- **[homegames-common](../homegames-common)** — canonical source of the authoring guide served at `/authoring-guide`
- **[homegames-core](../homegames-core)** — behind `core.homegames.io` for hosted sessions

## Known cruft (as of this writing)

- `dashboard.html` and `game-studio.html` call functions that no longer exist — dead pages, superseded by the studio.
- `app.js` routes to several HTML files that don't exist (`podcast.html`, `map.html`, `blog.html`, `asset-catalog.html`, ...) and the Dockerfile `EXPOSE 80` doesn't match `app.js`'s port 81 — the Node-server path is partly stale relative to the S3/CloudFront deploy.
- The Leaflet map feature (`loadMap`, `assets/countries.json`, etc.) is vestigial — the Leaflet files it references aren't in the repo.
- `authoring-guide.md` at the repo root is a committed duplicate of the homegames-common doc (the served route uses the common copy; the root copy can drift).
- Root `bundle.js` is a committed build artifact (webpack writes to gitignored `web/`); it must be rebuilt and re-committed before `deploy.sh` or you ship stale JS.
- `package.json` says MIT, but the project is GPL-3.0 (`license.txt` is authoritative).

## License

GPL-3.0

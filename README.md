# Homegames.io

The public-facing website for the Homegames platform. Includes the game catalog, developer profiles, game pages, and the browser-based developer studio for building and publishing games.

## What it does

- **Game catalog** — browse, search, and filter published games with NSFW filtering and featured game support
- **Game pages** — view game details, published versions, active sessions, and source code
- **Developer profiles** — profile pages with bio, profile image, BTC address, and published games
- **Developer studio** — a full browser-based IDE for creating games, with file editing, version history, live preview, asset management, game publishing, and thumbnail/description management
- **Asset catalog** — browse and search public assets (images, audio, fonts) with NSFW filtering
- **Admin tools** — game featuring, developer/game deletion, and support message management (via browser console login)

## Structure

- `client.js` — main site JavaScript (catalog, game pages, dev profiles, admin tools)
- `studio.js` — developer studio JavaScript
- `studio.html` — developer studio HTML and CSS
- `catalog.html`, `dev.html`, `game.html`, etc. — individual page templates
- `app.css` — shared styles
- `webpack.config.js` — builds `client.js` into `web/bundle.js`

## Setup

Requires: Node.js >= 18

```
npm install
npm run build
```

Serve the files with any static web server. The site expects the Homegames API to be running — configure the API URL in `client.js`.

## Related repos

- **api** — backend API that powers all data on this site
- **homegames-core** — game session server for the "Try it" feature
- **squish** — game state serialization library used by studio templates

## License

GPL-3.0

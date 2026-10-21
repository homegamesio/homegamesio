# homegamesio

The website is built from configured local game directories, individual game folders or portable ZIPs. The home page shows an ordered featured selection; All Games contains the full collection. These listings and individual game pages are generated HTML: names, descriptions, authors, play links and pack downloads work without JavaScript. Search progressively filters that HTML. Playing games and using Studio require JavaScript.

Game content comes from the static build. There are no catalog, account, profile, comment, publishing, play-count, public-room-feed or docs-question API requests. RTC invitations still use the configured signaling service and may use STUN/TURN. The active API no longer registers the old content/account endpoints; the home server's default Library now reads local games.

## Select games and build

Edit [site.config.json](site.config.json), or pass a config file:

```json
{
  "gamesDirs": ["../homegames-core/src/games"],
  "featuredGames": [
    "weed-smoke-willie",
    "pulsefront",
    "aquarium",
    "vegas-trail",
    "house-band",
    "draw-your-own-boss"
  ],
  "signalingUrl": "wss://api.homegames.io/rtc"
}
```

`gamesDirs` discovers immediate child game folders in each directory, in name order. Add as many directories as needed. The optional `games` array adds individual game folders or portable ZIPs after those discoveries. Paths resolve relative to the config file, and repeated paths are included once. All selected games appear in **All Games** and get their own details page and downloadable pack.

`featuredGames` contains folder/ZIP slugs in the exact order to show on the home page. It does not filter All Games. Slugs are lowercase folder names with spaces/punctuation replaced by hyphens and ZIP extensions removed. Every featured slug must exist in the selected collection; unknown or duplicate entries fail the build. An empty or omitted list shows no featured cards. The default config discovers all eligible games in Core's `src/games` and features the six above.

From this repository:

```bash
npm ci
npm run build
npm run build -- --config /path/to/site.json
npm run build -- --game ../homegames-core/src/games/tic-tac-toe --featured tic-tac-toe
npm run build -- --games ../homegames-core/src/games/tic-tac-toe ../homegames-core/src/games/checkers --featured checkers tic-tac-toe
npm run build -- --game "/path/with spaces/my-game" --game /path/to/another.zip --no-featured
npm run build -- --games-dir ../homegames-core/src/games --games-dir /path/to/more-games
node app.js
```

CLI game paths resolve from the current directory and **replace** the configured sources. `--featured slug ...` replaces the configured featured list, and `--no-featured` clears it. Source overrides keep the configured featured selection unless you override it too. For partial builds, choose matching featured slugs or use `--no-featured`. Names with spaces must be quoted; lists use separate arguments, not comma splitting.

Directory discovery reports and excludes games marked `isTest`, the local-only Tremulous test, the historical dynamic internal fixtures `iron-keep` and `sprite-test`, and archived folders without `index.js` or `homegame.json` before portable validation. Unknown metadata errors still fail the build. Selecting an excluded folder explicitly with `--game` performs full validation and fails on unsupported metadata. Other packaging errors fail the build and are reported together; they are never silently skipped. An empty directory selects no games. Optional `limit` / `--limit` truncates the full collection (not just featured games); omit it to include everything. Zero with an empty featured list builds an empty collection with Studio still available. A failed build preserves the previous successful `web/` release.

The builder uses the installed browser bundle, validates every selected game without executing its code, packages the games and Studio templates, generates HTML, and compiles the small website script. A successful build replaces `web/`; validation/build failures preserve the previous output. `node app.js` serves that generated output on port 81 (override `PORT`). Rebuild after editing website sources. `HOMEGAMES_SITE_DIR` can select another generated site directory.

For changes spanning the sibling `homegames-client`, `homegames-common`, and `homepad` checkouts, run **`npm run build:local`** (the same game-selection arguments work). This compiles the client with the local shared library and controller mappings and then builds the website, without replacing installed npm dependencies or editing lockfiles. Ordinary builds require portable projects, Studio editing and the mobile touch fix that prevents a tap from toggling buttons twice. Published Client 0.2.1 lacks that fix and is rejected. `HOMEGAMES_CLIENT_BUNDLE=/absolute/path/to/homegames-client.js` can select an explicitly built bundle for builds and the website tests.

`deploy.sh` always rebuilds the site. When testing an unpublished client, pass `HOMEGAMES_CLIENT_BUNDLE` to **the deploy command itself** as well; running `build:local` first does not change which package a subsequent deployment uses. For a normal release, publish the updated Client and install it before deploying.

## Game pack contract

- New game folders use `index.js` with literal `static metadata()` containing a stable UUID `gameId`, `name` and positive integer `maxPlayers`. The Squish import selects the runtime; omit `squishVersion`, `services` and `homegame.json`. `maxPlayers:1` is solo; higher values enable invitations (including the host in the count). The builder preserves authored identity across folder renames. Existing v1 `homegame.json` projects and custom entry paths remain supported without automatic conversion. Only older source folders without a `gameId` receive the historical deterministic v1 envelope; keep those folder names stable until deliberately migrating their identity.
- Packs use the same ordinary ZIP format as Studio import/export: source, authored media, manifest and integrity inventory. License/attribution files in the project are preserved. Existing ZIP inputs must be valid portable exports, not arbitrary source archives. Extracted ZIP folders can also be edited and built; their generated inventory is recalculated from the current files.
- Source folder/ZIP names become unique URL slugs. Duplicate slugs or game UUIDs fail the build. Each input is validated with the browser's supported runtime (Squish 1.5.1, `squish-151`, with `squish-150` retained for existing projects).
- Assets must be bundled files referenced by project-relative paths, or generated locally using the normal `Asset(info, bytes)` API. Relative JSON data modules are supported for large embedded art; JavaScript retains its 1 MiB limit. Hosted asset IDs, missing media, unsupported imports and symlinks fail with the input path in the error. The builder does not download missing assets or silently omit invalid games.
- Catalog artwork comes from `metadata().thumbnail`, for example `thumbnail: './assets/thumbnail.png'`. This is a bundled image path and does not need an entry in `metadata().assets`. The builder copies its exact bytes under a content-hashed filename with the detected image extension. Pages load a smaller copy (`artwork` in `games.json`): at most 720px wide, saved as JPEG or PNG, whichever is smaller, and only when that beats the original. App icons and installed-game matching keep using the original bytes. Formats the resizer can't read (SVG, WebP, AVIF, GIF) are shown as-is. An invalid declaration fails the build; omitting it uses the letter placeholder. The site logo is likewise resized to 240px from `assets/homegames-logo.png` at build time.
- Only explicitly selected games ship. Tremulous is also rejected by its known path/name because it is a local-only experiment. This website exclusion does not modify the separate server-download builder.

The collection is written to `games.json`, with the ordered featured slugs in `featuredGames`; each game has `/games/<slug>.html` and a content-versioned ZIP under `/games/`. Its declared thumbnail supplies card artwork; otherwise the card uses the game's initial. The home page uses the featured list, while the catalog lists every selected game. There are no NSFW filters, per-game publishing records, or account-backed developer pages.

## Playing, editing and sharing

Catalog links open `/game-app.html?game=<uuid>&revision=<hash>&builtin=<slug>`. This player validates the static pack, keeps the verified ZIP with a shared cached runtime and runs it in an opaque-origin iframe using the existing portable runtime and save bridge. Built-in progress uses the game UUID and save schema, so a content update does not automatically erase saves. Download save / Load save back up progress separately from source. Each game must implement saving; the runtime does not automatically persist arbitrary game state. The current three board games do not save an unfinished match.

Share creates a private RTC invitation on demand. The host browser runs the game and stays open. There is no public room listing or database-backed game registration. `/play.html#room=…` joins the host; `/play.html` also supports manual offer/answer pairing. Automatic signaling currently remains a lifecycle dependency; this change does not implement host migration or automatic WebSocket failover.

Open a copy in Studio forks the built-in pack with a new game UUID and local project ID, saves it into IndexedDB and changes the URL to that local project. Reloading opens that existing fork. Ordinary ZIP imports preserve their portable game UUID. Studio edits stay in the working copy until Save (or Cmd/Ctrl+S), which atomically stores the game and a snapshot in the History pane beside Files. Typing, previewing and adding assets do not save the game. Browsing a snapshot keeps unfinished edits in memory; Restore brings that snapshot into the editor and Save records it. Existing snapshots remain available. Studio edits, snapshots and saves remain local. Export ZIP creates a portable backup that another person can import into Studio; Download HTML creates a playable file with its runtime. Neither exports full snapshot history or current progress. Joined players can request editable source when the host provides project export; a play invitation is not a source-access restriction.

**Share a copy** in Studio and newly exported HTML players sends the complete portable project over a private RTC data channel. The invitation opens `/game-app.html?game=<uuid>&revision=<hash>#copy=…`. The recipient sees the game and size, then chooses **Receive game**. Acknowledged 64 KiB chunks, SHA-256, archive inventory and identity checks precede persistence. The API only exchanges connection signals; configured TURN may relay the encrypted connection. Receiving does not execute the game. The sender stays open until the complete copy arrives; saved copies remain independent.

### Individual HTML games and Home Screen apps

Catalog artwork, titles and **Play** links open the game directly. **Details** opens its static information page. The optional **Add to Home Screen** link there opens installation instructions over the game. Each link includes the game's UUID, revision and catalog slug. The player downloads the pinned static ZIP, checks its identity, stores the ZIP and shared player runtime locally before displaying **Ready offline**. No API or peer is needed. Existing `/play.html?game=<slug>` links redirect to this flow.

Catalog games and downloaded HTML use the shared Homegames menu in `homegames-common/player-toolbar.js`. It provides session invitations, **Share with friends** for independent copies, downloads, editing, saves and other supported tools. The trusted parent owns these controls around an opaque game frame. Browser-saved games retain their project and installation/save/export identities when the player updates. Previously downloaded HTML files retain their embedded runtime and need to be exported again to receive updates.

On iPhone/iPad, choose **Add to Home Screen** on the game’s details page, follow Safari's **Share → Add to Home Screen** instructions (enable **Open as Web App** if offered), then open the icon once while online. The catalog slug and revision in the app's start URL let a fresh app download its own copy automatically. The game is saved for offline use as it opens. Subsequent launches read the saved copy first, even if the website/catalog is unavailable. Installed copies keep their selected revision; they are not silently replaced when the catalog changes. A first install still needs that version's ZIP on the static host, or an imported backup.

The recipient's browser combines the verified project with the static site's trusted player to create a self-contained HTML bundle. **Download game HTML** saves that file with its source, images, sounds and runtime. Open it directly in a desktop browser to play offline or **Share a copy** onward. **Download game ZIP** provides the editable source for an explicit import into the existing Studio. Importing an HTML bundle into the game player extracts and validates its ZIP as data and rebuilds its wrapper; it never executes imported wrapper scripts.

The same game-only page keeps the ZIP and runtime locally and launch that game directly on later visits, including offline. Its locally generated app manifest gives each game UUID/revision a separate identity and launch URL. The static server knows no user-created games: it serves one generic player, runtime, icons and worker. Game ZIPs, runtime files and game-specific manifests are written to the recipient's Cache Storage, not uploaded. The manifest uses the game's name and thumbnail when available, with the Homegames icon as fallback. The ordinary catalog and Studio are outside this worker's scope.

For a game received from a peer, use Safari's **Share → Add to Home Screen** on the game's receiving page, open the new icon, then **Receive game** while the sender remains available. The app's launch fragment carries the invitation for that first connection. Alternatively import a downloaded HTML or ZIP inside the app. Safari and the installed app have separate storage: saving in Safari alone does not populate the installed app. A raw file in Files is not itself an iOS installation package. First setup needs HTTPS (localhost works for development); receiving needs connectivity and a sender. Physical iOS installation remains a release check; automated WebKit coverage is not device certification.

After receipt/import, **Play** explicitly starts the opaque player. Later launches of that saved game's URL start it directly. Peer/file copies have a fresh installation identity; catalog games retain the existing built-in game identity so browser progress from the old player remains available. Progress uses the existing save bridge; **Download save / Load save** moves compatible progress separately. Copies do not transfer the sender's progress or Studio snapshots. Browser data may be cleared or evicted: keep HTML and progress backups. If browser persistence fails after the HTML is built, its download remains available and the UI does not claim it was saved.

Game apps use the game's `metadata().name` for their page title, install manifest and Apple Home Screen title. `metadata().thumbnail` supplies the icon: the build produces square PNGs at 180, 192 and 512 pixels, preserving the full image on a dark background. Public PNG/JPEG thumbnails also have ordinary HTTP icon URLs for OS icon loaders. The small offline artwork catalog lets an older unnamed copy of a catalog game recover its display name without modifying its source, revision or save identity. Weed Smoke Willie now declares its name explicitly for future game packs and HTML downloads.

Imported games with different artwork generate PNG icons in local Cache Storage; those images are never uploaded. Missing or unsupported thumbnails retain the Homegames fallback. The install dialog previews the chosen icon and name. Chromium and WebKit tests cover catalog/imported icons, legacy names and cold offline relaunches. The actual iPhone Add to Home Screen sheet and icon refresh remain a physical-device check, especially for private icons served from local storage. After deploying, try adding the updated game from Safari; keep the existing app until its local progress and game files are backed up.

Studio remains the existing authoring tool and local project library. Its separate worker caches the editor, templates, examples and guide; imports retain their runtime. Game-copy receipt does not add a Studio project or open the editor. `/studio-local.html` remains a compatibility redirect, and old Studio copy invitations forward to the game player.

Transfer limits follow the portable format: up to 65 MiB compressed archive / 64 MiB expanded project, with per-file/source/media constraints. The sender offers at most four concurrent recipients. Transfers use acknowledged 64 KiB chunks, an inactivity timeout and no automatic partial-download resume.

Studio uses static templates for New game and the configured signaling endpoint for invitations. **Learn → Interactive examples** opens eight optional experiments: shapes, clicks, movement, dragging, sound, playing together, animation, and winning/restarting a round. Each lesson has a concrete action, a challenge, its own settings, and a reset button. Movement supports keyboard and on-screen buttons; dragging supports mouse and touch. See how it works shows the relevant source without requiring code to start. Open a copy in Studio creates a new game identity and project with the selected settings, preserving the previous draft. Only Play together enables sharing; it also demonstrates player names arriving and updating. The home page links directly to `/studio.html?examples=1`.

Game detail pages show **Edit this game** beside Play. This opens `/studio.html?builtin=<id>`, imports an editable local copy with a fresh game identity, and opens its entry file. The shared player toolbar has the same action (shortened to **Edit** on small screens): it saves the exact loaded package, including source, binary assets, licenses and available game exports, as a new Studio project. Website players navigate to it; downloaded HTML opens Studio in a new tab and transfers its archive directly between windows. The transfer checks the sender window, origin and a per-transfer token, validates the archive as data, and acknowledges only after persistence. Game bytes never travel in the URL or to a server. Self-hosted HTML targets the Studio on the originating site. Opening Studio offline requires having opened Studio online once in the same browser. If popups are blocked, Studio's **Import game** accepts the HTML itself or its source ZIP; it extracts the archive without executing the HTML wrapper. The original game and its play progress stay separate, and no preview starts automatically. Reloading the resulting `?project=<id>` URL reopens the saved copy.

Examples are ordinary portable projects in `examples/`, with bundled sounds and MIT notices. The build validates them and emits content-versioned ZIPs plus `studio-examples.json`. The shared authoring guide is copied into the build at `/authoring-guide.md`.

## Release output

`web/` is the complete static website: generated game pages/packs, player, Studio, templates, documentation, policy pages, icons and fonts, `site-config.js`, and a content-versioned browser runtime with its license notices. Account/admin/source-viewer/reset pages are excluded. The local preview serves only this directory, so retired pages return 404. A static `404.html` offers routes back to games and Studio; configure the production CDN to use it for missing pages.

```bash
# Alternate staging destination; same configuration/validation as npm run build:
node scripts/prepare-rtc-site.js /tmp/homegames-site --config /path/to/site.json

# Publishes to the existing homegames.io S3/CloudFront target:
DISTRIBUTION_ID=your-distribution ./deploy.sh
# Or use another config; the same build flags also work with deploy.sh:
DISTRIBUTION_ID=your-distribution ./deploy.sh --config /path/to/site.json
```

The deploy script uploads game/runtime/template/example dependencies before the current pages and collection manifest, uploads the Studio and game-player service workers last, deletes every other object in the bucket that the build no longer produces (old pages, source files and assets from earlier versions of the site), and invalidates CloudFront. It never deletes `builds/` (server downloads) or the `games/`, `game-app-icons/`, `studio-templates/`, `studio-examples/` and `homegames-client.*` files that already-open pages and installed games may still need. Removing a game from the config removes it from the next listings; withdrawing previously distributed files is a separate operation.

The production CloudFront distribution now maps origin HTTP 404 to `/404.html`, returns HTTP 404, and uses a five-second minimum error cache TTL (verified October 18, 2026). Preserve this setting when replacing the distribution. Uploading `404.html` alone does not configure the CDN's error response. This is a missing-page response, not a redirect or a successful HTTP 200 response.

Self-hosting releases are built/published by the sibling `homegames` repository. Website download links read the static `/builds/manifest.json`. For local preview, `HOMEGAMES_BUILDS_DIR` selects the release-artifact folder. Building this website does not deploy it or change the API/database.

### Studio learning resources

Learn contains eight interactive examples, a getting-started tutorial, a searchable API reference, and sixteen code recipes. Snippets live in `studio-snippets.js`, split into metadata, constructor and class-method blocks. `test/studio-snippets.test.js` compiles them with Squish and checks their gameplay behavior. Interactive examples are complete portable games under `examples/`; their previews and editable copies use the same source. Keep both guides aligned with the actual Studio workflow.

The API reference is sourced from `homegames-common/docs/homegames-context.md`. `npm run build:local` uses the sibling checkout's guide as well as its client. Other builds use the installed common package, or an explicit `HOMEGAMES_AUTHORING_GUIDE` file override.

### Studio storage and reusable assets

**Edit this game** prepares the latest Studio offline shell before saving its project and navigating. Shell updates activate once every required file is cached, even when another Studio tab remains open. Studio waits for preparation at boot and reloads before opening a project if its controller changed; updates never force-reload a running editor. This prevents a cached version-2 editor from opening a database upgraded by the version-3 player. Projects, snapshots, assets and game saves are not cleared during an update. A tab still running an older release may need one reload after the new shell activates.

**Settings** in the Studio header contains the light/dark appearance preference, **Download backup**, **Restore backup**, and browser storage controls. **Games** opens a switcher over the editor; opening or dismissing it keeps the current working copy intact. Selecting another game uses the existing unsaved-change guard. A `.homegames-backup` file contains every Studio project (including unfinished source), all snapshots, original library assets, Studio preview saves and exports, theme/player-name preferences, any legacy recoverable draft, and the current project/file/editor selection. Identities, history, binary bytes and timestamps are preserved. The current preview stops and drains its saves before capture. Unsaved source is included without creating a save or adding a snapshot to History. File blocks are deduplicated and SHA-256 checked; the format uses bounded raw binary blocks, never executable HTML or a decompression step. The current limit is 512 MiB; exceeding it reports an error instead of omitting files.

Restore checks the complete backup first, shows its counts/date, then replaces Studio only after the user chooses **Restore backup**. Version 4 consolidates Studio preview saves/exports with projects and assets so the replacement and a full **Undo last restore** copy commit in one IndexedDB transaction. A quota/write failure leaves every previous record intact. Older preview data is copied once from the separate save/export databases without deleting originals. A workspace generation prevents stale tabs from overwriting restored data. A pending-restore marker resumes editor/preferences restoration after an interrupted reload. The previous workspace remains available until the next restore; recovery snapshots do not recursively enter subsequent backup files.

Backups contain this Studio's data, not another origin's installed-game storage, browser permissions, live multiplayer sessions, or downloaded files outside Studio. Open Studio on the destination once to load its trusted application/runtime; browser/offline caches are recreated rather than imported as executable code. After that, backup/restore also works offline. Individual game ZIP/HTML exports remain available through **Import game** and the editor.

**Settings → Manage storage** shows the browser's usage/quota estimate, plus each game's source/asset byte count and snapshot storage. The quota is an origin-wide browser allowance, not free disk space. Per-game counts exclude database overhead and offline runtime caches. You can open, export or delete a game there; deletion removes its snapshots and Studio preview data atomically and rejects stale selections changed by another tab. Browser persistence can be requested; keep a full Studio backup too.

**My Assets** is an independent library in the Studio database. Upload, Draw, Record and Keyboard save originals there, even with no game open. Choose a destination game and **Add to game** to copy an original into its `assets/` folder. Existing paths are kept; collisions get a numbered filename. The confirmation offers the matching `new Asset(...)` code. **Game assets** shows the selected game's copies, with **Save to My Assets** for reuse in another game. Deleting an original leaves copies intact, and deleting a game leaves library originals intact. Asset downloads are available individually. Version 3 of the database adds library stores without altering older projects or snapshots.

**Download ZIP / Export ZIP** normally creates a playable portable pack. If the current source is unfinished or invalid, Studio downloads a `.studio.zip` draft backup instead. It contains the exact source and binary assets and restores through the same **Import game** control without executing code. Draft backups use a versioned marker and checked, uncompressed ZIP entries; they must be fixed before play or HTML export. Restoring either type adds a separate local project. Neither ZIP includes snapshot history, play progress or unrelated library originals.

## Project history

`history.html` is a timeline with inline diagrams and progressive interaction, using the site’s local Homegames logo and handwritten font. Its six architecture snapshots show local servers, the picodeg.io demo, TLS and connection helpers, hosted Core/API, browser-hosted gameplay with hosted content, and the current portable/P2P direction. Each diagram identifies where the simulation and files live and cites inspected commits or working-tree files. The early demo/TLS overlap and uncertain deployment details are explicit.

The page is included in the static build and linked from the home page. All diagrams and references remain readable without JavaScript and in print; the only shared visual assets are the locally served logo and font. With JavaScript, readers can select an era or show all six. It uses Git author dates, labels the archived 2020 RTC experiment and 2025 agent-assisted game experiments as branch work, and distinguishes the October 14, 2026 working-tree snapshot from committed history or deployed releases. Update that final chapter and its review date as the refactor lands; keep historical entries tied to inspected commits.

## Checks

```bash
npm test
# After npm run build, with Node 20+ and Playwright available:
node test/static-site-browser.cjs
node test/studio-examples-browser.cjs
node test/rtc-copy-browser.cjs
```

`PLAYWRIGHT_MODULE` and `CHROME_PATH` can point the browser check at existing installations. It tests generated HTML with JavaScript disabled, local search, downloads, isolated play, a private RTC guest, Studio copy/export/import, narrow-screen layout and absence of external HTTP content requests. RTC uses a local signaling fixture with no ICE servers in this test; it is not a WAN/TURN certification.

On machines where Chrome's mDNS host candidates cannot connect through the local fixture, run with `RTC_TEST_DISABLE_MDNS=1`. This test-only flag disables Chrome's local-IP masking for that browser run; it does not change production RTC behavior. The October 12 local acceptance run required this flag.

The Examples browser check exercises changes to shape, click state and sound; a two-player RTC counter; ZIP export; separate project identities; preserving edits through experimentation and reload; mobile layout; and failed-download recovery. Both browser checks use generated files and block external HTTP content requests.

The copy browser check sends an archive larger than the RTC packet limit from a downloaded HTML file into a separate persistent profile. It checks downloadable HTML/ZIP, per-game manifests, Chrome installability, direct cold offline launch with both sender and origin stopped, onward sharing from the received HTML, separate app storage, expired invitations, failed-storage HTML recovery, ignored imported wrapper scripts, and distinct game launch identities. `BROWSER_ENGINE=webkit SENDER_ENGINE=chromium` exercises Chrome → WebKit → Chrome; this is not a physical iOS Home Screen installation test. Chrome disables mDNS for the local no-ICE fixture. WebKit-only peers did not connect with masked candidates. WAN/TURN testing remains required.

The catalog installation check (`node test/catalog-install-browser.cjs`) builds a fixture collection and follows real static links with mobile layouts. It verifies separate game manifests, a fresh installed-app profile, automatic first download, wrong-game rejection, download retry, image/audio/input, and a cold offline restart plus HTML download with the origin stopped. `BROWSER_ENGINE=webkit` selects WebKit; this does not replace physical iPhone/iPad installation testing.

The ordinary website/Examples checks disable worker registration to keep their HTTP interception and failed-download injection observable. The copy checks use real service workers and persistent profiles. The retired `/studio-local.html` is only a redirect to the existing Studio; its old editor code and styles are excluded from the build and removed by deployment.

Homegames-authored code and cleared media are MIT licensed. Imported projects and third-party dependencies/media retain their own notices. Full runtime notices are embedded in the browser bundle and downloadable HTML. See [the release-readiness assessment](docs/code-audit.md#first-release-assessment-players-and-curious-beginners) for evidence and remaining release checks.

Games can persist named byte exports through their session; downloads and RTC copies include `user-exports/`. See [the constructor contract](../homegames-common/docs/ARCHITECTURE.md#game-defined-user-exports).

The storage/asset regression runs after a site build:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node test/studio-storage-browser.cjs
```

It uses disposable browser data to cover binary assets, filename collisions, independent library/game copies, valid and unfinished ZIP restore, deletion conflicts, mobile layout, offline Studio, and unavailable storage estimates. `UPDATE_STUDIO_PREVIEW=1` refreshes the home page's local Studio screenshot from the same fixture.

Full-backup format tests run with `npm test`. To check real IndexedDB atomicity without additional test dependencies, run `node scripts/prepare-workspace-test.js` after a local site build, open `/workspace-regression.html`, and choose **Run storage tests**. The checks use unique temporary databases for complete transfer, undo, stale writers, injected quota failure, preview adapters, deletion and legacy migration. Rebuild the site afterward to remove the temporary test page/bundle before deployment.

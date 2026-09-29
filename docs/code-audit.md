# Documentation audit against the implementation

Reviewed 2026-09-17–19 using the local working trees. The objective was to explain the product accurately, trace user-visible behavior to executable code, and improve the public documentation in `homegamesio`. Existing edits were present in nearly every repository. Those working-tree changes are part of the evidence; the commit IDs below alone do not reproduce this audit.

This is a source audit, not confirmation of production deployment, release availability, certificate service health, or compatibility on every OS/browser. No accounts were created, messages sent, games published, or production configuration changed.

**2026-09-19 follow-up:** the user authorized tests and a session refactor after this audit. Shared dispatch/view ownership, cancellable local loading, explicit save identity and unified child idle policy are now implemented in the working trees. The [refactor record](../../homegames-core/docs/session-refactor.md) contains the before-refactor characterization evidence, regression coverage and validation results. Items 2 and 4 below preserve their original findings and state the resolution; this is not evidence of a production rollout.

A second authorized cleanup unified local player records and runtime teardown and removed redundant browser resource state: another 186 production lines removed without adding production modules. Seven additional tests cover multiple views, controller slots, inspector behavior and teardown/asset regressions; the full suite now passes 348 tests. The same refactor record tracks the updated implementation and browser validation.

## Reviewed repositories

| Local repository | HEAD at review | Relevant responsibility |
| --- | --- | --- |
| homegamesio | `7206fc51c146` | Website, Studio, player, public documentation |
| api | `603fc0ea0c01` | Accounts, catalog, assets, Studio, publication, session forwarding |
| worker | `f1c9bf0b5b18` | Certificate/AI/docs jobs and model bridge |
| homegames-core | `6f095ca95a7f` | Dashboard, session HTTP service, game processes, TLS, browser host |
| homegames-common | `dc06deae5f5c` | Config, shared runtime, lifecycle, loader, local-play format, saves |
| homegames-client | `a6e94fe5f200` | Browser rendering/input, local runtime, save store |
| squish | `44bca96d069e` | Scene nodes and serializer; clean working tree at review |
| homepad | `204962bba8c8` | Controller normalization and bindings |
| homegames | `5fa74b1c291e` | Supervisor and distributable server builder |
| homegames.link | `69aacd105514` | LAN discovery, redirects, DNS |
| homegames-web | `a618bf8e0ad7` | Separate browser host still in the tree |

The tutorial declares Squish 142. Its constructor/serialization behavior was also checked against the installed `homegames-common/node_modules/squish-142` implementation, rather than assuming the `squish` source checkout (1.4.5) described every older package. Installed packages or prebuilt browser bundles may differ from a fresh npm installation.

## What was corrected or expanded

| Topic | Code-backed conclusion | Evidence |
| --- | --- | --- |
| Local vs multiplayer | Multiplayer metadata enables hosted UI but does not prohibit solo local play or HTML download. `contentGenerator` excludes those paths. | [common/local-play.js](../../homegames-common/local-play.js): `checkLocalPlayable`, `checkDownloadable`; [client.js](../client.js): `renderGamePage`, `playGameInline` |
| Two different downloads | A game download is composed HTML with code/runtime/assets; the server download contains core, dependencies, Node runtimes, launchers, and prefetched assets. Neither exports a player's current save. | [API handlers](../../api/handlers.js): `handleGetLocalDownload`; [local-play.js](../../homegames-common/local-play.js): `buildLocalHtml`; [build-bundle.js](../../homegames/build-bundle.js) |
| Initial network requirement | Website local play first fetches a manifest and asset bundle. “Play offline” is not a guarantee that the website can be opened offline. | [play.html](../play.html): `startLocal` |
| Session start | API forwards a game/version reference; core fetches published source through catalog endpoints. No shared API/core temp directory is needed for this path. | [handlers.js](../../api/handlers.js): `handleCreateSession`; [Homenames.js](../../homegames-core/src/Homenames.js): `downloadSessionGame`, `handleCreateSession`; [fetchGameSource.js](../../homegames-core/src/library/fetchGameSource.js) |
| Private sessions | `private` filters the public list. Joining by URL is not gated by invitations or an account. | [client.js](../client.js): create-session body; [Homenames.js](../../homegames-core/src/Homenames.js): `handleListSessions`; [child_game_server.js](../../homegames-core/src/child_game_server.js) |
| Link expiry | A share-code checksum binds the URL to a UTC date. Decode accepts today or yesterday; the URL does not encode a durable session ID or provide encryption/authentication. | [client.js](../client.js): `encodeShareCode`; [play.html](../play.html): `decodeShareCode`; [studio.js](../studio.js): `encodeShareCode` |
| Session lifetime | Follow-up: one child-owned policy for fork/Docker; default 30-second observed-empty grace, periodic checks, spectators/pinning reset idle time. No exact reconnect promise. | [session-lifetime.js](../../homegames-common/session-lifetime.js); [game-session-manager.js](../../homegames-common/game-session-manager.js): `_startLifecycleMonitor`; [child_game_server.js](../../homegames-core/src/child_game_server.js): `checkPulse` |
| Accounts | Signup uses display name/email/password. Login uses display name or email. Verification is required for creation, saves/restores, uploads, publishing, and AI submission, not just publication. | [auth.js](../../api/auth.js); [router.js](../../api/router.js): `requiresVerified`; [studio.js](../studio.js): `claimGuestGame`, verification and token refresh |
| Guest/draft/preview | Guest work is browser-local; successful account claim creates and saves a repository-backed game. HEAD previews include in-memory edits; running previews restart on edits. | [studio.js](../studio.js): guest/draft functions, `claimGuestGame`, `fetchAllFilesForPreview`, `debouncedUpdatePreview` |
| Saving and restoring source | Saves and restores write files sequentially, creating multiple commits; partial completion is possible. Restore does not rewind history. | [studio-handlers.js](../../api/studio-handlers.js): `handleSaveVersion`, `handleRestoreVersion` |
| Archiving | Studio filters `archived`; public catalog search does not filter on it. Archive is not unpublish. | [studio-handlers.js](../../api/studio-handlers.js): `handleArchiveGame`, `handleStudioListGames`; [search.js](../../api/search.js) |
| AI availability | UI flag is true in this checkout. API still defaults AI edits off unless `AI_EDITS_ENABLED=true`. Worker/model availability is another condition. | [studio.js](../studio.js): `AI_FEATURES_ENABLED`, job lock/poll/finish; [config.js](../../api/config.js); [studio-handlers.js](../../api/studio-handlers.js): `handleSubmitLLMRequest`; [worker/index.js](../../worker/index.js) |
| Docs assistant | Separate feature flag, question limits, queue, timeout, and reference document. It is not a live code inspector. | [docs-assistant.js](../../api/docs-assistant.js); [worker/index.js](../../worker/index.js); [worker config](../../worker/lib/config.js) |
| Publication requirements | Description/thumbnail/template change checked before queueing; worker checks metadata, README, license, JS AST, sizes/symlinks, and requires Docker validation. | [studio-handlers.js](../../api/studio-handlers.js): `handleSubmitPublishRequest`; [api/worker.js](../../api/worker.js): `validatePublishRequest`; [ast-scanner.js](../../api/ast-scanner.js); [validate.js](../../homegames-core/docker/validate.js) |
| Publish limits/status | One submission per 10 minutes per user. Statuses include PENDING, PROCESSING, PUBLISHED, FAILED. Featuring is separate. | Same handlers/worker, [search.js](../../api/search.js), [studio.js](../studio.js): publish polling |
| Asset privacy | Public listing flag is independent of download-by-ID. An unlisted asset is not access-controlled. | [router.js](../../api/router.js): public `GET /assets/:id`; [handlers.js](../../api/handlers.js): `handleGetAsset`; [studio.js](../studio.js): asset publish toggle |
| Asset bundling | Local manifests statically extract declarations; Studio preview uses its own literal-declaration extractor. Binary keys are 32 bytes. Missing data may fail an entire load. | [local-play.js](../../homegames-common/local-play.js); [local-play-shared.js](../../homegames-common/local-play-shared.js); [studio.js](../studio.js): `extractDeclaredAssets`, `fetchPreviewAssetBundle`; [handlers.js](../../api/handlers.js): `buildLocalAssetBundle` |
| Browser globals | Local module loading uses `new Function` in the page environment. It does not remove browser globals or provide a security sandbox. Hosted Node execution differs. | [client game-loader.js](../../homegames-client/src/game-loader.js); [local-session.js](../../homegames-client/src/local-session.js): `_boot` |
| Scene notifications | Wrapper tree methods notify; raw `node` mutations need notification. Ticks do not imply a state notification. Fixed the start-screen recipe to call the wrapper's `clearChildren`, and added the missing notification in the particle recipe. | Squish `src/BaseNode.js`, `src/InternalGameNode.js`, `src/Squisher.js`; installed 142 equivalents |
| Repeated input | Held clicks and keys can repeat. The complete first-game example now latches presses and releases them on mouseup/disconnect. | [input.js](../../homegames-client/src/input.js); [local-dispatch.js](../../homegames-client/src/local-dispatch.js); [game-session.js](../../homegames-common/game-session.js) |
| Controller support | Homepad normalizes controls; shared `GameInput` turns declared bindings into key callbacks or delivers analog state. Controller count does not automatically equal player count. | [gamepad-input.js](../../homegames-client/src/gamepad-input.js); [game-input.js](../../homegames-common/game-input.js); [homepad mapping](../../homepad/map-inputs.js) |
| Shapes/text | 142 Text ignores constructor `onClick`; newer source differs. The current renderer uses polygon paths, does not draw the circle encoding as an arc, and uses `color` alpha as global opacity. | Installed 142 `GameNode.js`; [renderer.js](../../homegames-client/src/renderer.js); [current GameNode.js](../../squish/src/GameNode.js) |
| Player visibility | A scoped frame can omit other players' nodes; absence of a scoped frame falls back to the full scene. Spectators also use this path. No unconditional secrecy claim is warranted. | Squish `Squisher.squishHelper`; [game-session.js](../../homegames-common/game-session.js): `_sendPlayerFrame`; [local-session.js](../../homegames-client/src/local-session.js): `_captureFrame` |
| Progress saves | Game opt-in, JSON data, debounce/cap; host files are per game/version, browser saves are separate. No general cloud-account save sync. | [save-games.js](../../homegames-common/save-games.js); [child_game_server.js](../../homegames-core/src/child_game_server.js): `buildSaveOptions`; [local-session.js](../../homegames-client/src/local-session.js); [save-store.js](../../homegames-client/src/save-store.js) |
| Home server topology | Supervisor starts core; core serves the browser itself and uses child game processes/containers. `homegames-web` is not required for this path. | [launcher](../../homegames/index.js); [game_server.js](../../homegames-core/game_server.js); [web-client.js](../../homegames-core/src/util/web-client.js); [homegames-web](../../homegames-web/app_server.js) |
| Bundles/platforms | Current builder creates `Play Mac.app`, Windows batch, Linux script; runtime targets are macOS arm64/x64, Windows x64, Linux x64. Linux ARM is not included. | [build-bundle.js](../../homegames/build-bundle.js): `RUNTIME_TARGETS`, launcher generation |
| Config/ports | Env overrides user overlay overrides base. Bundle defaults are 7001/7100/7002–7099 with link/TLS off and fork allowed. Common's no-file defaults retain 9801/7400/8300–8400 and link/TLS on. | [common/index.js](../../homegames-common/index.js): `DEFAULT_CONFIG`, `getConfigValue`, `getConfig`; [build-bundle.js](../../homegames/build-bundle.js): `writeBundleConfig`; [launcher](../../homegames/index.js) |
| Downloaded library | Dashboard uses app-data `hg-games` directly; `LOCAL_GAME_DIRECTORY` adds own games. Legacy `DOWNLOADED_GAME_DIRECTORY` is not consumed by this dashboard setup. | [HomegamesDashboard.js](../../homegames-core/src/dashboard/HomegamesDashboard.js); [LocalLibrary.js](../../homegames-core/src/library/LocalLibrary.js) |
| Docker choice | Docker preferred; fork requires explicit permission when Docker unavailable. Bundle opts in. Memory limit is not equivalent to isolation for a forked process. | [game-session-manager.js](../../homegames-common/game-session-manager.js): `startSession`, `_forkAllowed`; [build-bundle.js](../../homegames/build-bundle.js) |
| Discovery | Public-IP matching and LAN redirects, not a tunnel. Core sends 10-second heartbeats; link excludes stale hosts after 90 seconds by default. | [link-helper.js](../../homegames-core/src/util/link-helper.js); [link/server.js](../../homegames.link/server.js) |
| Certificates | Core holds TLS key, submits CSR, polls request status, validates cert/key pair. Initial activation needs restart; renewals can reload TLS. Network identity is tied to the service's observed public IP. | [cert-manager.js](../../homegames-core/src/util/cert-manager.js); [socket.js](../../homegames-core/src/util/socket.js); [certificate worker](../../worker/lib/certificates.js); [certificate policy](../../worker/lib/cert-policy.js) |
| Settings restart | UI offers an explicit restart after certificate readiness. Launcher handles core exit codes 75/76. Direct `npm start` has no supervisor. | [settings-modal.js](../../homegames-core/src/dashboard/settings-modal.js); [HomegamesDashboard.js](../../homegames-core/src/dashboard/HomegamesDashboard.js); [launcher](../../homegames/index.js) |
| Management networking | Homenames does not specify a loopback bind. Some internal operations have a shared-secret check; session creation does not become authenticated merely because Studio requires login. | [Homenames.js](../../homegames-core/src/Homenames.js): listener and session dispatch |
| Site build/deploy | Webpack writes `web/bundle.js`; Node serves it. `deploy.sh` uploads root `bundle.js` only, not docs HTML. Raw reference is served from common. | [webpack.config.js](../webpack.config.js); [app.js](../app.js); [deploy.sh](../deploy.sh) |

## End-to-end implementation paths

### Guest to published game

`Studio template → browser draft / LocalSession → signup + verification → create game + Forgejo repo → sequential file commits → choose final commit → publish request → RabbitMQ publish_requests → api/worker.js → AST + Docker checks → gameVersions.published → public search`.

Listing metadata lives separately from the files. Restoring, archiving, and previewing do not implicitly change publication. The source viewer/local manifest paths check published commits before returning source. Online preview is a separate submission of file contents to Homenames.

### Published game to player

Local: `game/version → API manifest + asset bundle → browser module loader → LocalSession → Squisher → canvas`. Download: the API composes those ingredients with the client bundle into an HTML attachment.

Hosted: `game/version → API session request → Homenames fetch/cache source → session manager → Docker or allowed fork → WebSocket client`. Input passes through shared session dispatch; scene frames and asset bundles travel back directly to the browser.

### Home server

`homegames supervisor → core → config overlay + optional certificate/link setup → main dashboard listener + Homenames → local library/catalog installation → local-play redirect or shared child session`. Discovery joins devices only where direct LAN reachability exists. Central catalog, DNS/cert services, and reporting are separate network dependencies.

## Remaining implementation issues and limits

These originated as documentation-audit findings. Explicitly marked resolutions below were implemented only after the subsequent refactor request; the others remain limits on what the docs can promise.

1. **Squish maps disagree.** Common's `game-loader.js`/dependencies list 142, 143, 145; the browser's `src/squish-map.js` lists 142, 143, 144. In the reviewed install, common cannot resolve `squish-144`, while the client resolves that alias to the sibling `squish/index.js` checkout (version 1.4.5). Installed links and old bundles can mask the mismatch. Reconcile maps/packages and rebuild the client and runner before claiming support for those newer versions. The tutorial remains on 142.
2. **Resolved in follow-up: competing idle policies.** Originally, the manager counted Docker health polls while children applied different Docker/fork exit rules. The shared `SessionLifetime` now runs in the child for both paths; the manager supervises and releases resources. Automated tests cover pinning, spectators, elapsed time and real fork/standalone exits. A rebuilt Docker image is required; actual container launch was not tested.
3. **Docker availability caching conflicts with retry intent.** The manager tries to re-probe failures, but `docker-helper.isDockerAvailable` caches false for the process lifetime. Starting Docker later can require a core restart. The image also needs the staged dependencies prepared by `docker/build-image.sh`; blindly building a raw Docker directory is not equivalent.
4. **Resolved in follow-up: missing launch identity.** Website play/download and Studio originally fell back to class names and a common local version. These paths now pass catalog/Studio identities and selected versions, as do core manifests. Tests cover distinct games sharing a class and explicit version compatibility. One browser slot per game remains; old class-name saves are not automatically migrated, and browser storage is still fallible.
5. **Broadcast-save restore is not universal.** The home dashboard requests a creator's saved envelope. Website `POST /sessions` forwards no client save; the downloaded HTML builder likewise does not export a current save. Disk saves for the same host game/version are shared across sessions.
6. **Local execution and player visibility are not security boundaries.** Browser source executes in the page's environment; player-frame fallbacks and spectators can receive full scene data. AST checks and a short validation run do not prove arbitrary code safe or every game cheat-proof.
7. **Publishing preconditions depend on worker packaging.** The GPL text comparison is conditional on the worker's reference text being loaded (`GPL3_NORMALIZED`). A deployment must actually supply that file and Docker validation. Documentation describes the intended submission requirements, not an assertion that every deployment enforces them correctly.
8. **Source defaults and launcher defaults differ.** Core/common can fall back to 9801 while the supervisor's independent missing-config port fallback is 7001. An explicit base config avoids the initial browser-open mismatch. `sample_config.js` and `npm run develop` are stale guides to the current boot path.
9. **Not every port/config label is accurate.** Homenames is not loopback-bound; dashboard “Enable multiplayer” is specifically the discovery/TLS workflow. LAN shared play can work before enabling that option. The main server is not one process doing all execution.
10. **Deployment and licenses need separate decisions.** HTML deployment is not implemented by `deploy.sh`; missing-page routes remain; website license text and package metadata disagree. The public guides no longer apply one blanket license statement to all platform repositories.
11. **Installed Squish browser initialization logs errors.** Session smoke testing found caught `process is not defined` errors from installed Squish `Asset.js` modules. The local and hosted fixture games rendered and accepted input, but a clean browser console/dependency setup is still a separate packaging issue.

The audit did not inspect private deployment secrets or use existing `.env` files to infer live feature availability. In particular, UI AI controls being enabled is not proof of a functioning production model service. The shared `homegames-common/docs/homegames-context.md` was not rewritten here; generated answers can still reflect its older claims.

## Validation record

Completed checks:

- `git diff --check` passed.
- All three public guides passed HTML nesting, duplicate-ID, local-link/fragment, and inline JavaScript syntax checks: 63 unique IDs across the pages and 123 link entries, with all local targets/fragments resolved. External destinations were not live-tested. README and audit relative file links also resolve in the sibling workspace.
- The pages' script blocks are unchanged from the pre-edit working-tree copies. Existing theme, download, and docs-assistant behavior was preserved.
- The complete `TapGame` example was extracted from the final HTML and executed with installed `squish-142` and the real browser `LocalDispatcher`. Checks passed for repeated held input, two players, release/disconnect cleanup, and the updated score after serialization and decoding. The API's `scanSource` accepted the example. This is not the full Docker publication validator.
- `npm run build` passed in `homegamesio` with webpack 5.96.1. Webpack reported the existing unset-mode warning and defaulted to production. This did not validate a fresh browser-client dependency installation.
- All three guides were reviewed in the browser at desktop size and a 390-pixel phone viewport. Navigation, section anchors, light/dark themes, code blocks, and tables were checked. Each phone page's document width stayed at 390 pixels; wide code/tables scroll within their containers. No browser console errors were reported during the final page checks.

The preview used the existing Node page router with only its listen address/port changed to local `127.0.0.1:18761` for the check. No production forms or account/session actions were exercised. Live authentication, publishing, certificate issuance, fresh multi-OS installs, and production deployments are outside this validation scope. The documentation changes have not been deployed.

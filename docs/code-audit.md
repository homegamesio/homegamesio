> Historical audit from October 11–17, 2026. Findings below record the code at that time and are not current release instructions. For current behavior, use the [website README](../README.md) and [shared architecture reference](../../homegames-common/docs/ARCHITECTURE.md).

# Documentation and static website audit — October 12, 2026

> Later checkpoint: the [October 14 plan audit](../../homegames-core/docs/local-ownership-audit.md) supersedes this report's release-readiness statements, runtime list and remaining-route claims. It includes newly executed checks and unresolved isolation, workspace recovery and play/copy permission requirements. Historical test results below retain their original scope.

This review uses the **current local source, including pre-existing uncommitted changes**, as evidence. It supersedes the previous documentation audit's description of account-backed Studio, browser version-map mismatch and unfiltered scene fallbacks. It does not establish deployed versions or production service availability.

## Reviewed documentation

- `homegamesio/README.md`, `docs.html`, `how_it_works.html`, `self-hosting.html`, the licensing/account paragraphs in `terms.html`, and this record.
- `homegames-common/README.md`, `docs/SYSTEM.md`, `ARCHITECTURE.md`, `FLOWS.md`, `DATA-MODEL.md`, `INFRA.md`, `OPERATIONS.md`, and the platform/infrastructure portions of `homegames-context.md`.
- Built-in template READMEs already describe browser-local editing and ZIP backup; no change was needed.

Existing in-progress portable/runtime work and prior documentation edits were preserved. The October 11 review changed documentation only. The October 12 follow-up implements the static website collection, generated game pages, player/Studio integration and complete build/deployment preparation described below. No deployment, database migration or account deletion was performed.

The maintainer subsequently clarified the target architecture: static built-in games and downloads, an API limited to connectivity helpers, player-owned portable games/assets, and retirement of accounts/profiles/central publishing. The docs record that direction separately from today's retained services. The GPL/MIT licensing policy below is also a maintainer decision, not something inferred from runtime behavior.

## Findings and implementation evidence

| Corrected documentation | Source of truth |
| --- | --- |
| Studio needs no account to create, edit, save, export or invite players. Its old content API transport rejects actions; auth/profile entry points are retired and AI is disabled. | [studio.js](../studio.js), [studio.html](../studio.html), [studio-portable.js](../studio-portable.js) |
| Projects and named snapshots use IndexedDB, with generation checks and atomic backup/restore. They are not Forgejo commits or cloud backups. | [studio-project-store.js](../studio-project-store.js), [studio-portable.js](../studio-portable.js) |
| New game loads static templates; imports get a new installation, and new template copies get a new game identity. | [template builder](../scripts/build-studio-templates.js), [studio-portable.js](../studio-portable.js), [templates](../templates) |
| Portable ZIPs contain manifest/source/media/inventory; validation does not execute source or run the old publication sandbox. Assets use project-relative file paths. | [portable-project.js](../../homegames-common/portable-project.js), [portable-runtime.js](../../homegames-common/portable-runtime.js) |
| Studio/HTML games run in opaque-origin iframes. Progress uses a separate installation/schema-scoped IndexedDB bridge and explicit save import/export. Source snapshots do not restore progress. | [portable-html.js](../../homegames-common/portable-html.js), [portable-saves.js](../../homegames-common/portable-saves.js) |
| Website games come from an explicit build-time list of local folders/portable ZIPs. Home/catalog/detail pages contain generated HTML and work without JavaScript; search is progressive enhancement. NSFW/featured filters and the public-room feed are removed. | [site.config.json](../site.config.json), [build-game-library.js](../scripts/build-game-library.js), [render-game-pages.js](../scripts/render-game-pages.js), [client.js](../client.js) |
| Website Play validates a static pack and runs it in an opaque-origin iframe with installation/schema-scoped saves. Share creates a private RTC invitation; it does not register a public catalog game. Signaling does not run games or carry gameplay frames. Retained backend public-room support is separate. | [play.js](../play.js), [portable-html.js](../../homegames-common/portable-html.js), [API integration](../../api/index.js), [rtc-signaling.js](../../homegames-common/rtc-signaling.js) |
| Open a copy in Studio imports a built-in pack into a new browser-local project. ZIP export/import preserves editable source/media; it does not publish or update the website collection. | [studio-portable.js](../studio-portable.js), [studio-project-store.js](../studio-project-store.js) |
| Manual pairing can bypass Homegames signaling but has network limits and no live camera/microphone path. Automatic RTC currently closes peers if signaling ends; a direct media/data path does not remove that lifecycle dependency. | [rtc-manual.js](../../homegames-client/src/rtc-manual.js), [rtc-session.js](../../homegames-client/src/rtc-session.js) |
| Every recipient's scene is filtered, including inherited scopes, players without scoped nodes and spectators. No full-scene fallback or privacy anchor is needed. | [session-runtime.js](../../homegames-common/session-runtime.js), [game-session.js](../../homegames-common/game-session.js), [local-session.js](../../homegames-client/src/local-session.js) |
| Browser versions are 142/143/145; Node also includes local 146. `detectSquishVersion` is exported. | [browser map](../../homegames-client/src/squish-map.js), [Node loader](../../homegames-common/game-loader.js), [common dependencies](../../homegames-common/package.json) |
| Core supports browser play and optional Node/WebSocket hosting. Fork fallback is explicit opt-in; direct-start games default to browser mode. | [game_server.js](../../homegames-core/game_server.js), [dashboard](../../homegames-core/src/dashboard/HomegamesDashboard.js), [session manager](../../homegames-common/game-session-manager.js) |
| Source and packaged ports/defaults differ; config overlays user settings on a base, with environment precedence. Launcher opens Core's reported ready URL. | [common config](../../homegames-common/index.js), [core config](../../homegames-core/config.json), [bundle builder](../../homegames/build-bundle.js), [launcher](../../homegames/index.js) |
| Account/content/publishing source and data remain, but the active API does not register those endpoints. Hosted projects are not automatically migrated. | [API router](../../api/router.js), [handlers](../../api/handlers.js), [studio handlers](../../api/studio-handlers.js), [publish worker](../../api/worker.js) |
| The background worker handles durable certificate/docs/legacy AI jobs; no particular Mac/EC2 topology is implied. | [worker entry](../../worker/index.js), [worker configuration](../../worker/lib/config.js), [job store](../../worker/lib/jobs.js) |
| The complete static build includes pages, packs, Studio/templates, local assets, policies and the raw common guide. Node preview serves that same output. Deployment uploads dependencies before pages and the manifest, preserves release downloads, and removes known retired account/content page objects. | [build-site.js](../scripts/build-site.js), [app.js](../app.js), [deploy.sh](../deploy.sh), [prepare-rtc-site.js](../scripts/prepare-rtc-site.js) |

## October 12 implementation verification

- `npm run build` produced the complete static site from the three explicitly configured games: Tic-Tac-Toe, Connect Four and Checkers. No production upload was run.
- Automated unit/build/HTTP checks cover configuration paths/limits, validation, archive round trips, source/license preservation, thumbnail media detection, literal HTML escaping, complete output, failed-build preservation, empty selections, retired routes and release downloads.
- A real Chrome acceptance run browsed the home/catalog/game pages with JavaScript disabled, followed real game links and downloaded a validated ZIP. With JavaScript enabled it checked search, isolated game play, a private RTC guest, Studio copy/export/import and 390-pixel layout. No external HTTP content requests or page errors occurred.
- The RTC check uses local signaling with no ICE servers. Chrome's default mDNS host candidates did not connect in this local fixture; the completed run used the test-only `RTC_TEST_DISABLE_MDNS=1` option. Production RTC behavior was not changed, and WAN/TURN connectivity remains unverified.
- Generated game pages contain no scripts. Build-time metadata is escaped as text; the downloaded pack remains the original editable project. Documentation and deploy shell syntax checks accompany the build tests.

## Independent RTC game copies and apps

Studio remains the existing authoring editor. Game-copy invitations now open the generic game-only `/game-app.html` receiver, with a UUID/revision identifying the local copy. No second Studio or Pocket library ships. `/studio-local.html` remains a compatibility redirect; old Studio copy invitations redirect to the game player.

- **Share a copy** in Studio and newly exported HTML sends a portable project over a private RTC channel. Consent precedes allocation; acknowledged 64 KiB chunks, SHA-256, inventory and identity validation precede storage. No game source runs on receipt. The API carries connection signals only.
- The recipient's browser builds a self-contained HTML with the verified project and trusted static player. It can download the HTML, keep/play locally, download the editable ZIP, and share onward from the received HTML itself. Imported HTML wrappers are ignored; only their embedded ZIP is validated and rebuilt. A browser-storage failure leaves the completed HTML downloadable.
- A separate scoped worker caches the generic game player. Each game UUID/revision has a locally generated manifest, individual app identity and direct launch URL. Complete HTML bundles remain in Cache Storage across shell updates. The server receives no game upload and needs no game registry. Game apps currently use the shared Homegames icon with their own names.
- First Play requires a click; subsequent launches of a kept game's URL start that game directly. Saves use the existing isolated bridge with a fresh installation ID. Studio projects are created only by explicitly importing a ZIP for editing.
- Safari and installed iOS apps have separate storage. The per-game manifest retains the invitation fragment so the new app can receive its own copy while the sender is available; importing a saved HTML/ZIP is also supported. First setup requires a secure origin. Physical Add to Home Screen remains a release gate.

Verification: the website's 24 unit/build/HTTP checks and 13 portable-project checks cover packaging and validation. Chrome and Chrome → WebKit → Chrome acceptance runs passed with an archive larger than 11 MiB: downloaded HTML sender, consent/cancellation, identical source/media/license ZIP, downloadable playable HTML, onward sharing from that file, sender shutdown, cold offline launch with the actual origin shut down, graphics/input/sound, separate app storage, disconnect during persistence, expired invitations, full-storage HTML recovery, data-only HTML import, two independent game identities/launch URLs and explicit Studio restore. Chrome's manifest and installability checks returned no errors. Mobile receive/play screenshots were inspected. Completed runs recorded no uncaught page errors or external HTTP content requests; the server saw only GET/HEAD, and signaling messages contained no game archives.

Limits: local signaling uses no STUN/TURN and Chrome disables mDNS in the fixture. WebKit coverage is engine evidence, not actual iOS installation certification; the fresh-app storage case is simulated with a separate browser context. Physical installation, device storage behavior, separate-network and relay-only TURN paths remain release checks. No production upload or commit was made.

## First-release assessment: players and curious beginners

**The local release candidate has working first-time journeys. It is not yet cleared for a public launch or for retiring the remaining services.** This assessment is based on the current working trees and generated artifacts, not the deployed website. No announcement, upload, commit, account deletion or production certificate request was made.

### What was exercised

| Journey | Observed result | Limit of the evidence |
| --- | --- | --- |
| Find a game → read its page → download a pack | Generated home/catalog/detail HTML works with JavaScript disabled. Search works when enabled. Downloaded ZIP validates and retains its revision. | Default website selection is three board games. Content availability on the public CDN was not checked. |
| Play → invite a friend | Chrome runs an isolated game, creates a private invitation and connects another browser client. Closing the host retires the room. | Local signaling with no ICE servers; test-only mDNS disabling. No WAN, relay-only TURN, Safari or Firefox acceptance. |
| Follow an old invitation | The expired/invalid reason stays visible after transport closure, with an instruction to get a new invitation and a retry action. | Other real network and browser permission failures still need real-device checks. |
| Make something without knowing code | Four optional Studio experiments run: shape, click state, bundled sound, shared counter. Changing controls changes the actual source. Two clients see the same click count. | Audio start and rendered state were observed in Chrome; no human listening/teaching study was performed. |
| Keep a creation | Open a copy makes a separate local project and game identity. An edited project survives opening/closing examples, creating another copy, switching back and reloading. Exported ZIP validates and includes changed source and audio. | Projects belong to that browser; ZIP backups remain necessary. Source backup and game progress are separate. |
| Recover from an example download failure | Inline error, disabled copy action, retry by reopening, previous draft preserved. | Failure injection disables offline caching; offline Studio is covered by the copy checks above. |
| Use a small screen | Catalog and Examples were checked at 390 px, including controls, dismissal and absence of horizontal overflow. Desktop screenshots were inspected. | Viewport emulation is not a real iPhone/Android, touch-keyboard or screen-reader evaluation. |
| Run the self-hosted download offline | A fresh four-runtime bundle contains 239 local asset files. All 82 visible built-in manifests/media responses passed; native Mac startup and a child WebSocket game passed with external networking blocked, including previously enabled online preferences. | Manifests/media checks do not certify every game rule or every gameplay path. Windows/Linux/Intel Mac launch was not executed here. |
| Add a portable game to that download | Chrome imported a ZIP on localhost, rendered its asset, joined two local RTC clients and checked shared input. Migrated Slaps, Sponge, Testions, VegasTrail and Masterpiece also rendered. | Separate physical LAN devices and fresh-machine firewall behavior remain unverified. |

Website checks: `npm test` passed **16/16**; `test/static-site-browser.cjs` and `test/studio-examples-browser.cjs` passed against the generated site with external HTTP content blocked and no uncaught page errors. Portable project checks passed **13/13**. The offline artifact checked was `/tmp/homegames-offline-ready`; it is a local preview, not a newly signed/notarized or published release. It predates the website-only Examples presentation option added to the shared HTML generator.

### Changes made during this first-time review

- Added **Examples** to Studio and a direct home-page entry. The four stages have small controls, optional code, and a separate editable copy. Earlier stages omit multiplayer controls; the last stage introduces Share. Sound files travel with each project. Build/deploy now packages these examples as static versioned ZIPs.
- Corrected the Examples dialog background, centering and mobile preview size; allowed page zoom in Studio; verified native keyboard dismissal and async preview cleanup.
- Preserved invitation failure reasons and added recovery guidance. Added no-JavaScript guidance to Play and a static missing-page screen with useful destinations. Node preview serves that screen with HTTP 404; the production CDN still needs its error-page configuration checked.
- Removed an unnecessary public-IP request from local player settings. Earlier offline work migrated built-in dependencies, added local ZIP installation, propagated offline preferences into child sessions and verified native Mac launch/shutdown.

### Gates before announcing the release

1. **Internet and household connectivity.** Against the intended deployed API, verify private RTC host/guest across separate networks and a relay-only TURN path. With the release download, verify a second device on the LAN, homegames.link enablement, actual certificate issuance, restart, and later offline launch. The API enables RTC unless `RTC_ENABLED=false`; a static website build does not establish that deployment setting.
2. **Download users.** Build/sign/notarize the final artifact after source/license changes. Download it through the actual website on clean Apple Silicon/Intel Mac, Windows and Linux environments. Check launch, browser opening, firewall prompts, play, shutdown/restart, and retained user data after replacing the installation. The historical notarized candidate does not cover these new bytes.
3. **Retirement and release contents.** The API still exposes account, profile, hosted source/assets and publication routes. Finish their intended retirement with an explicit disposition for existing hosted projects/data before removing the backing services. Reconcile GPL/MIT declarations and verify distribution notices/media; this review did not establish an exhaustive rights inventory. Do not describe the backend as already reduced to connectivity helpers.
4. **An unfamiliar person completes the experience.** Give a player the site URL with “play something and invite me.” Give a beginner “make something react, keep a copy, then reopen it.” Observe without directing them. A successful scripted browser run cannot establish that people understand or enjoy it. Use the resulting specific stumbling points to decide the last fixes.

The current website has three familiar board games with letter placeholders for artwork. That is a small working collection, not a demonstration of the full self-hosted library. Choosing the strongest release selection and adding representative game artwork would improve the announcement's first impression; neither requires adding more platform features. The player also exposes several backup/developer controls; grouping those is optional polish. The current board games do not save unfinished matches, even though the runtime offers progress backup for games that implement saving.

The handoff can end feature development, but hosted signaling, TURN, certificate issuance, domain names and downloadable artifacts still need an owner and upkeep. Already-downloaded local games reduce that dependency; they do not make the public connectivity services self-maintaining.

## October 11 documentation verification (historical)

- `git diff --check` passed for both repositories.
- All three HTML guides passed nesting and duplicate-ID checks: **67 IDs**. **114 local link/fragment entries** resolved, excluding external destinations and generated release downloads. Markdown file-link targets resolved across the two documentation sets and sibling repositories.
- Inline JavaScript syntax passed. Script blocks and styles are byte-for-byte unchanged from the pre-review working-tree copies.
- The complete `TapGame` tutorial was extracted, validated with the real portable validator, and exported/imported as a ZIP with an identical revision. With installed Squish 142 and the shared dispatcher/runtime, held-click suppression, two players, release/disconnect cleanup and decoded updated score passed.
- A project-relative image declaration was validated using actual PNG bytes from the scrolling template.
- All three guides were previewed through the local Node router at desktop width and a **390-pixel viewport**. The revised sections and tables/code blocks were inspected. Document width stayed at viewport width; wide tables/code scroll within their containers.
- After the architecture/licensing clarification, the guide structure/IDs/links, Markdown file targets, inline JavaScript and both repositories' whitespace checks passed again. The terms page also passed nesting/ID checks; its scripts/styles are unchanged. The follow-up wording changes did not receive a second browser-layout pass.

The October 11 documentation-only edit did not run a full runtime suite, fresh dependency installation, Docker validation, production API mutation, external-link availability check or WAN/TURN test. Website JavaScript was not rebuilt in that original review; the October 12 build and browser checks above supersede that limitation for the new website. Neither review re-certifies every example or historical gameplay test in the extended authoring reference.

The October 12 self-hosting update replaces default dashboard catalog requests with local library scans, migrates built-in media/helper dependencies into game folders, adds validated localhost ZIP import and local RTC, and adds an offline launch override. All 82 visible built-in manifests/media passed an offline bundle smoke test; a generated Mac launcher and Chrome ZIP/RTC flow also passed. These changes are local and do not alter published downloads.

## Remaining implementation and deployment boundaries

1. **Retained account data.** The active API does not expose auth, profiles, moderation, source/assets or publication. Storage migration/removal and stopping old deployed services remain operational work; current Studio provides no general hosted-project importer.
2. **Portable integration gaps.** Isolated preview inspection/second simulated player and full-catalog offline caching remain incomplete. The self-hosted localhost dashboard now installs portable ZIPs into its local library. Existing downloaded HTML retains its embedded runtime.
3. **Production rollout.** The full website build and deploy script are ready locally but have not been deployed. RTC API compatibility, internet/TURN connectivity and the desired release game list need verification against the actual deployment. Removing a game from the build stops listing it; withdrawing already distributed archives/pages is separate work.
4. **License metadata and policy text.** The maintainer specified GPL or MIT; the inventory below records unresolved metadata and third-party notices. The terms page's non-commercial restriction was removed and its account paragraph now distinguishes account-free Studio from retained services. Other service/privacy commitments were not inferred from code or rewritten; the privacy page's account-management description still needs reconciliation with the intended retirement.
5. **Deployment reality.** Node now serves only the generated site, so excluded account/content routes return 404. Its Dockerfile's exposed port still differs from the server default. Live DNS, host placement, service names, enabled features and backup schedules were not inferred from source defaults or private environment files.
6. **Legacy validation conditions.** The publish worker's exact GPL comparison is conditional on loading its reference text. Portable validation has a different contract and does not run a gameplay sandbox. Neither path proves every game behavior works.

## Licensing policy and current notices

**October 17 update:** the maintainer authorized MIT for first-party code and cleared Homegames media, confirmed contributor permissions, and chose Squish 1.5.0 as the only runtime in new builds. Source licenses, package metadata, templates and current website wording have been migrated. Third-party notices remain intact and runtime notices are embedded in the client/HTML. The inventory below is the earlier audit snapshot; see the current [MIT release checklist](../../homegames-core/docs/mit-release.md) for publication and artifact verification.

Homegames-authored components should use GPL or MIT. This is not a declaration that every component is dual-licensed or that all current notices already match. The original documentation review did not change licenses. On October 13, the maintainer confirmed GPLv3 for common, core and Squish: their manifests/lockfiles now declare `GPL-3.0-only`, and common includes the same GPLv3 license text already present in core and Squish. Third-party attribution is unchanged.

| Component | Current local evidence |
| --- | --- |
| `homegames-common`, `homegames-core`, `squish` | Package metadata declares `GPL-3.0-only`; all three root `LICENSE.md` files contain GPLv3. |
| `homegamesio` | [package.json](../package.json) declares MIT; [license.txt](../license.txt) is GPLv3. Static Studio templates carry GPLv3 license files. |
| `homegames-web` | Package metadata declares ISC; its root license file contains GPLv3. |
| `homegames` launcher | Package metadata declares ISC; no root license file. |
| `homegames-client` | Package metadata declares `GPL-3.0`; its root license contains GPLv3. |
| `homepad`, `homegames.link` | Package metadata declares MIT; no root license file in either checkout. |
| `api`, `worker` | Package metadata has no license field; no root license file. |
| Tremulous local test (outside publication scope) | The maintainer has designated this adaptation as a separate local-only experiment, not for publication. Its [upstream notice](../../homegames-core/src/games/tremulous/assets/TREMULOUS-COPYING.txt) identifies media as CC BY-SA 2.5 and lists code exceptions; those notices remain intact. |

Tremulous is excluded from the intended website and downloadable-release content. The October 12 website builder rejects its known slug/name, rejects test-game metadata, and includes only explicitly selected inputs. The separate server-download builder's exclusions have not been changed or verified by this website work.

Resolving this means selecting and consistently recording the applicable license for each Homegames-authored component, including the GPL version where relevant. A strict GPL/MIT-only distribution would also require reviewing dependencies/media and replacing or obtaining appropriate rights for material under other licenses; editing a package field does not accomplish that. This is an observed-notice inventory, not an exhaustive dependency or asset audit.

The old terms page limited use to personal/non-commercial purposes despite naming GPLv3. It now points to each component's license and allows the commercial uses those licenses permit; see the [GNU explanation](https://www.gnu.org/philosophy/selling.en.html) and [MIT license](https://opensource.org/license/mit). Existing third-party notices remain applicable.

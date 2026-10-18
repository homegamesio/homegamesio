'use strict';

if (typeof window !== 'undefined') window.StudioBackup = require('./studio-backup');
if (typeof window !== 'undefined') window.StudioWorkspace = require('./studio-workspace');

// Content lives in the website build. Only the game runtime talks to RTC.
let libraryPromise;
function validateLibrary(data) {
    if (data?.formatVersion !== 1 || !Array.isArray(data.games)) throw new Error('Unsupported game collection');
    const ids = new Set();
    for (const game of data.games) {
        if (!/^[a-z0-9-]{1,100}$/.test(game.id) || ids.has(game.id)
            || !/^[a-f0-9]{64}$/.test(game.revision) || typeof game.gameId !== 'string'
            || game.archive !== `/games/${game.id}.${game.revision.slice(0, 16)}.zip`
            || typeof game.name !== 'string' || typeof game.description !== 'string' || typeof game.author !== 'string'
            || typeof game.multiplayer !== 'boolean'
            || (game.thumbnail !== null && !/^\/games\/[a-z0-9-]+\.[a-f0-9]{16}\.(png|jpg|jpeg|gif|webp|avif|bmp)$/i.test(game.thumbnail))) throw new Error('Invalid game collection');
        ids.add(game.id);
    }
    return data.games;
}
function loadLibrary() {
    if (!libraryPromise) libraryPromise = fetch('/games.json', { cache: 'no-cache' }).then(async response => {
        if (!response.ok) throw new Error('Could not load the game collection');
        return validateLibrary(await response.json());
    }).catch(error => { libraryPromise = null; throw error; });
    return libraryPromise;
}
async function findGame(id) {
    const game = (await loadLibrary()).find(game => game.id === id);
    if (!game) throw new Error('This game is not included in this website. Browse the collection or import your game pack in Studio.');
    return game;
}
async function loadProject(id, portable) {
    const game = await findGame(id), response = await fetch(game.archive);
    if (!response.ok) throw new Error('Could not download the game pack');
    if (Number(response.headers?.get('content-length')) > portable.limits.archiveBytes) throw new Error('Game pack is too large');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > portable.limits.archiveBytes) throw new Error('Game pack is too large');
    const project = await portable.importArchive(bytes);
    if (project.revision !== game.revision || project.manifest.gameId !== game.gameId) throw new Error('Game files do not match this collection. Reload the page and try again.');
    return { game, project };
}
function filterGames(games, query) {
    const text = query.trim().toLocaleLowerCase();
    return games.filter(game => `${game.name} ${game.description} ${game.author}`.toLocaleLowerCase().includes(text));
}
function initCatalog() {
    const input = document.getElementById('search-box'), form = document.getElementById('catalog-search');
    const cards = [...document.querySelectorAll('#catalog [data-game]')], status = document.getElementById('catalog-status');
    const render = () => {
        const query = input.value.trim().toLocaleLowerCase(); let count = 0;
        for (const card of cards) { card.hidden = !card.dataset.search.toLocaleLowerCase().includes(query); if (!card.hidden) count++; }
        status.textContent = count ? `${count} game${count === 1 ? '' : 's'}` : 'No games match. Try another search or make a game in Studio.';
    };
    form.hidden = false; input.value = new URLSearchParams(location.search).get('query') || ''; render();
    const updateSearch = () => {
        render();
        const url = new URL(location.href), query = input.value.trim();
        if (query) url.searchParams.set('query', query);
        else url.searchParams.delete('query');
        if (url.href !== location.href) history.replaceState(null, '', url);
    };
    input.addEventListener('input', updateSearch);
    form.onsubmit = event => { event.preventDefault(); updateSearch(); };
    window.addEventListener('popstate', () => { input.value = new URLSearchParams(location.search).get('query') || ''; render(); });
}
const api = { validateLibrary, loadLibrary, findGame, loadProject, filterGames, initCatalog };
if (typeof window !== 'undefined') Object.assign(window, api, { HomegamesLibrary: api });
if (typeof module !== 'undefined') module.exports = api;

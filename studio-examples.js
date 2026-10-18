// Each lesson is a portable game: the preview and the copy use the same files.
'use strict';
window.StudioExamples = (() => {
    const p = HomegamesClient.PortableProject, encoder = new TextEncoder(), decoder = new TextDecoder();
    const byId = id => document.getElementById(id), dialog = byId('studio-examples');
    const cache = new Map(), settings = new Map();
    let catalog, runtime, selected = 0, generation = 0, frame, saveHost, project, copying = false;
    const defaults = item => ({ size: 24, shape: 'square', color: 'gold', points: 1, sound: 'chime', players: 4, speed: 3, grid: 0, goal: 5, ...item.defaults });
    const colors = { gold: [247, 187, 90, 255], coral: [241, 112, 111, 255], mint: [125, 220, 185, 255] };
    const status = text => { byId('example-status').textContent = text; };
    async function fetchOk(url) { const response = await fetch(url, { cache: 'no-cache' }); if (!response.ok) throw new Error('Could not load this example. Try again when you’re connected.'); return response; }
    async function dispose() {
        const old = frame, host = saveHost; frame = saveHost = null;
        if (old) { old.hidden = true; try { await host?.close(); } finally { old.remove(); } }
    }
    async function load(item) {
        if (!cache.has(item.id)) cache.set(item.id, (async () => {
            if (!/^[a-z0-9-]+$/.test(item.id) || !/^[a-f0-9]{64}$/.test(item.revision) || item.archive !== `${item.id}.${item.revision.slice(0,16)}.zip`) throw new Error('Invalid example catalog');
            const value = await p.importArchive(new Uint8Array(await (await fetchOk('/studio-examples/' + item.archive)).arrayBuffer()));
            if (value.revision !== item.revision) throw new Error('This example changed. Reload Studio to get its latest files.');
            return value;
        })().catch(error => { cache.delete(item.id); throw error; }));
        return cache.get(item.id);
    }
    function codePeek(source) {
        return ['settings', 'code'].map(part => {
            const match = source.match(new RegExp(`// @example-${part}:start\\n([\\s\\S]*?)\\n[ \\t]*// @example-${part}:end`));
            if (!match) throw new Error('This example is missing its code preview. Reload Studio.');
            const lines = match[1].split('\n');
            const indent = Math.min(...lines.filter(line => line.trim()).map(line => line.match(/^ */)[0].length));
            return lines.map(line => line.slice(indent)).join('\n').trim();
        }).join('\n\n');
    }
    async function render() {
        const token = ++generation, item = catalog[selected], values = { ...settings.get(item.id) }; project = null;
        byId('example-copy').disabled = true; byId('example-retry').hidden = true;
        byId('example-preview').setAttribute('aria-busy', 'true');
        byId('example-code').textContent = ''; status('Loading example…');
        try {
            await dispose();
            const original = await load(item);
            const files = Object.fromEntries(original.reader.listFiles().map(name => [name, original.reader.readFile(name)]));
            let source = decoder.decode(files['index.js']);
            source = source.replace(/const SQUARE_SIZE = \d+;/, `const SQUARE_SIZE = ${values.size};`)
                .replace(/const SQUARE_COLOR = \[[\d, ]+\];/, `const SQUARE_COLOR = ${JSON.stringify(colors[values.color])};`)
                .replace(/const SHAPE = '\w+';/, `const SHAPE = '${values.shape}';`)
                .replace(/const POINTS_PER_CLICK = \d+;/, `const POINTS_PER_CLICK = ${values.points};`)
                .replace(/const SOUND = '\w+';/, `const SOUND = '${values.sound}';`)
                .replace(/const MOVE_STEP = \d+;/, `const MOVE_STEP = ${values.speed};`)
                .replace(/const GRID_SIZE = \d+;/, `const GRID_SIZE = ${values.grid};`)
                .replace(/const TARGET_SCORE = \d+;/, `const TARGET_SCORE = ${values.goal};`)
                .replace(/maxPlayers: \d+/, `maxPlayers: ${item.id === 'together' ? values.players : 1}`);
            files['index.js'] = encoder.encode(source);
            const snippet = codePeek(source), next = await p.create(files);
            if (!runtime) runtime = fetchOk(byId('studio-runtime').src).then(r => r.text()).catch(error => { runtime = null; throw error; });
            const installationId = crypto.randomUUID();
            const documentSource = await p.runtimeDocument(next, { clientBundleSource: await runtime, installationId,
                sharing: item.id === 'together' ? { signalingUrl: window.HomegamesSiteConfig?.signalingUrl || 'wss://api.homegames.io/rtc', joinUrl: new URL('/play.html', location.href).href } : false });
            if (token !== generation || !dialog.open) return;
            frame = p.createFrame(document, documentSource); frame.title = item.title;
            saveHost = p.attachPlayerHost(window, frame, { installationId, packageRevision: next.revision,
                gameId: next.manifest.gameId, versionId: 'save-schema:1' });
            byId('example-preview').replaceChildren(frame); byId('example-code').textContent = snippet;
            project = next; byId('example-copy').disabled = copying;
            status('Open a copy to edit the source. Save keeps your later changes.');
        } catch (error) {
            if (token === generation) { status(error.message); byId('example-retry').hidden = false; }
        } finally {
            if (token === generation) byId('example-preview').setAttribute('aria-busy', 'false');
        }
    }
    function control(label, key, choices, values) {
        const wrapper = document.createElement('label'); wrapper.textContent = label;
        const input = document.createElement('select'); input.setAttribute('aria-label', label);
        for (const [value, text] of choices) { const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option); }
        input.value = values[key]; input.onchange = () => { values[key] = typeof values[key] === 'number' ? Number(input.value) : input.value; render(); };
        wrapper.append(input); return wrapper;
    }
    function select(index) {
        if (copying || index < 0 || index >= catalog.length) return;
        selected = index; const item = catalog[index];
        if (!settings.has(item.id)) settings.set(item.id, defaults(item));
        const values = settings.get(item.id);
        [...byId('examples-nav').children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
        byId('example-progress').textContent = `Experiment ${index + 1} of ${catalog.length}`;
        byId('example-title').textContent = item.title; byId('example-description').textContent = item.description;
        byId('example-hint').textContent = item.hint; byId('example-challenge').textContent = item.challenge;
        const reference = document.createElement('a'); reference.href = '/docs.html#' + item.guide; reference.target = '_blank'; reference.rel = 'noopener'; reference.textContent = 'Read more in the guide ↗'; byId('example-reference').replaceChildren(reference);
        const controls = byId('example-controls'); controls.replaceChildren();
        if (item.control === 'size') {
            controls.append(control('Shape', 'shape', [['square', 'Square'], ['triangle', 'Triangle']], values));
            const label = document.createElement('label'), output = document.createElement('span'), input = document.createElement('input');
            output.textContent = `Shape size · ${values.size}`; input.type = 'range'; input.min = 10; input.max = 40; input.value = values.size; input.setAttribute('aria-label', 'Shape size');
            input.oninput = () => { values.size = Number(input.value); output.textContent = `Shape size · ${values.size}`; };
            input.onchange = render; label.append(output, input); controls.append(label);
        }
        if (item.control === 'points') controls.append(control('Each click adds', 'points', [[1,'1'],[2,'2'],[5,'5']], values));
        if (item.control === 'speed') controls.append(control('Step size', 'speed', [[1,'Small'],[3,'Medium'],[6,'Big']], values));
        if (item.control === 'animation') controls.append(control('Speed', 'speed', [[12,'Slow'],[24,'Medium'],[48,'Fast']], values));
        if (item.control === 'goal') controls.append(control('Taps to win', 'goal', [[3,'3'],[5,'5'],[10,'10']], values));
        if (item.control === 'grid') controls.append(control('Snap to grid', 'grid', [[0,'Off'],[5,'Small grid'],[10,'Big grid']], values));
        if (item.control === 'sound') controls.append(control('Sound', 'sound', [['chime','Chime'],['pop','Pop']], values));
        if (item.control === 'players') controls.append(control('Room for', 'players', [[2,'2 players'],[4,'4 players'],[8,'8 players']], values));
        controls.append(control('Color', 'color', [['gold','Gold'],['coral','Coral'],['mint','Mint']], values));
        byId('example-back').disabled = index === 0;
        byId('example-next').hidden = index === catalog.length - 1;
        render();
    }
    async function open() {
        if (!dialog.open) dialog.showModal();
        const token = ++generation;
        byId('example-copy').disabled = true; byId('example-retry').hidden = true; status('Loading examples…');
        try {
            if (!catalog) { const data = await (await fetchOk('/studio-examples.json')).json(); if (data.formatVersion !== 1 || !Array.isArray(data.examples) || !data.examples.length) throw new Error('Invalid example catalog'); catalog = data.examples; }
            if (token !== generation || !dialog.open) return;
            byId('examples-nav').replaceChildren();
            catalog.forEach((item, index) => {
                const button = document.createElement('button'), number = document.createElement('span');
                number.className = 'example-number'; number.textContent = String(index + 1).padStart(2,'0');
                button.append(number, document.createTextNode(item.title)); button.onclick = () => select(index); byId('examples-nav').append(button);
            });
            select(selected);
        } catch (error) {
            if (token === generation && dialog.open) { status(error.message); byId('example-retry').hidden = false; }
        }
    }
    byId('examples-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { generation++; project = null; dispose().catch(error => status(error.message)); });
    byId('example-next').onclick = () => select(selected + 1);
    byId('example-back').onclick = () => select(selected - 1);
    byId('example-reset').onclick = () => { if (catalog && !copying) { settings.delete(catalog[selected].id); select(selected); } };
    byId('example-retry').onclick = () => catalog ? render() : open();
    byId('example-copy').onclick = async () => {
        if (!project || copying) return; copying = true; byId('example-copy').disabled = true;
        try { await StudioPortable.copyExample(project); dialog.close(); }
        catch (error) { status(error.message); }
        finally { copying = false; byId('example-copy').disabled = !project; }
    };
    return { open };
})();

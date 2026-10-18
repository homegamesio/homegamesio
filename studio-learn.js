'use strict';
window.StudioLearn = (() => {
    const $ = id => document.getElementById(id);
    let guideText, guidePromise, snippetsReady = false;
    const text = (tag, value, className) => {
        const el = document.createElement(tag); el.textContent = value;
        if (className) el.className = className;
        return el;
    };
    // Render only the reference's small Markdown vocabulary. All source text
    // stays textContent; embedded HTML and unsafe link schemes are never used.
    function inline(parent, value) {
        for (const part of value.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)) {
            if (part.startsWith('`') && part.endsWith('`')) parent.append(text('code', part.slice(1, -1)));
            else if (part.startsWith('**') && part.endsWith('**')) {
                const strong = document.createElement('strong'); inline(strong, part.slice(2, -2)); parent.append(strong);
            }
            else {
                const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
                if (link) { const a = text('a', link[1]); a.href = link[2]; a.target = '_blank'; a.rel = 'noopener'; parent.append(a); }
                else parent.append(document.createTextNode(part));
            }
        }
    }
    function markdown(value) {
        const body = document.createDocumentFragment(), lines = value.split('\n');
        for (let i = 0; i < lines.length;) {
            const line = lines[i];
            if (!line.trim() || /^---+$/.test(line.trim())) { i++; continue; }
            if (/^\s*```/.test(line)) {
                const code = []; i++;
                while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
                i++; const pre = document.createElement('pre'); pre.append(text('code', code.join('\n'))); body.append(pre); continue;
            }
            const heading = line.match(/^#{2,6}\s+(.+)/);
            if (heading) { const el = document.createElement('h3'); inline(el, heading[1]); body.append(el); i++; continue; }
            if (/^\|/.test(line)) {
                const wrap = text('div', '', 'learn-table'), table = document.createElement('table');
                while (i < lines.length && /^\|/.test(lines[i])) {
                    const cells = lines[i++].split('|').slice(1, -1).map(cell => cell.trim());
                    if (cells.every(cell => /^:?-+:?$/.test(cell))) continue;
                    const row = document.createElement('tr');
                    for (const cell of cells) { const td = document.createElement(table.children.length ? 'td' : 'th'); inline(td, cell); row.append(td); }
                    table.append(row);
                }
                wrap.append(table); body.append(wrap); continue;
            }
            if (/^\s*(?:[-*]|\d+\.)\s/.test(line)) {
                const list = document.createElement(/^\d+\./.test(line) ? 'ol' : 'ul');
                while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s/.test(lines[i])) {
                    let item = lines[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/, '');
                    while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(?:[-*]|\d+\.|```)/.test(lines[i])) item += ' ' + lines[i++].trim();
                    const li = document.createElement('li'); inline(li, item); list.append(li);
                }
                body.append(list); continue;
            }
            const paragraph = document.createElement('p');
            const words = [lines[i++].replace(/^>\s?/, '')];
            while (i < lines.length && lines[i].trim() && !/^(?:\s*```|#{1,6} |\||[-*] |\d+\. |---)/.test(lines[i])) words.push(lines[i++].replace(/^>\s?/, ''));
            inline(paragraph, words.join(' ')); body.append(paragraph);
        }
        return body;
    }
    function topicBrowser(entries, search, list, detail, render, selectedId) {
        let selected = entries.find(item => item.id === selectedId) || entries[0];
        function show(item) {
            selected = item; detail.replaceChildren(); render(item, detail); detail.scrollTop = 0;
            list.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === item.id)));
        }
        function filter() {
            const query = search.value.trim().toLocaleLowerCase();
            const matches = entries.filter(item => `${item.title} ${item.category} ${item.search || ''}`.toLocaleLowerCase().includes(query));
            list.replaceChildren();
            if (!matches.length) {
                list.append(text('p', 'No matching topics.', 'learn-empty'));
                detail.replaceChildren(text('p', 'Try another word, such as “sound”, “save” or “players”.', 'learn-empty')); return;
            }
            let category;
            for (const item of matches) {
                if (item.category !== category) { category = item.category; list.append(text('h3', category)); }
                const button = text('button', item.label || item.title); button.type = 'button'; button.dataset.topic = item.id;
                button.onclick = () => show(item); list.append(button);
            }
            show(matches.includes(selected) ? selected : matches[0]);
        }
        search.oninput = filter; filter();
    }
    function codeBlock(parent, label, code, recipeTitle) {
        const section = text('section', '', 'learn-code-block');
        const header = document.createElement('header'); header.append(text('h4', label));
        const copy = text('button', 'Copy', 'dash-btn'); copy.type = 'button'; copy.setAttribute('aria-label', `Copy ${label} for ${recipeTitle}`);
        copy.onclick = () => copySnippet(code, copy); header.append(copy);
        const pre = document.createElement('pre'); pre.append(text('code', code)); section.append(header, pre); parent.append(section);
    }
    function renderRecipe(item, detail) {
        detail.append(text('h3', item.title), text('p', item.description));
        if (item.note) detail.append(text('p', item.note, 'learn-note'));
        if (item.imports?.length) {
            const hint = text('p', `Add ${item.imports.join(', ')} to your existing Squish import. Keep the version already used by your game.`, 'learn-note'); detail.append(hint);
        }
        if (item.constructorArgs) {
            const hint = document.createElement('p'); inline(hint, `Change the constructor signature to \`constructor(${item.constructorArgs})\`. Keep \`super()\` first.`); detail.append(hint);
        }
        if (item.metadata) codeBlock(detail, 'In metadata()’s return object', item.metadata, item.title);
        codeBlock(detail, 'In constructor(), after this.base', item.setup, item.title);
        if (item.methods) codeBlock(detail, 'Methods inside your game class', item.methods, item.title);
        const link = text('a', 'Read more in the guide ↗'); link.href = '/docs.html#' + item.reference; link.target = '_blank'; link.rel = 'noopener'; detail.append(link);
    }
    function openSnippets() {
        if (!snippetsReady) {
            topicBrowser(StudioSnippets.map(item => ({ ...item, search: [item.description, item.note, item.setup, item.methods].filter(Boolean).join(' ') })),
                $('snippets-search'), $('snippets-list'), $('snippets-content'), renderRecipe);
            snippetsReady = true;
        }
        $('snippets-modal').showModal();
    }
    function guideSections(source) {
        const entries = []; let current, api = false, fence = false;
        for (const line of source.split('\n')) {
            if (/^```/.test(line)) fence = !fence;
            if (!fence && /^# PART II/.test(line)) { api = true; current = null; continue; }
            if (!fence && /^## /.test(line)) {
                const label = line.slice(3).replace(/`/g, '');
                const title = label.replace(/^\d+\. /, '');
                current = { id: String(entries.length), title, label, category: api ? 'Game API' : 'Studio & platform', lines: [] };
                if (api || /^(The Developer Studio|Making games|Browser projects)/.test(title)) entries.push(current);
            } else if (current) current.lines.push(line);
        }
        return entries.map(item => ({ ...item, search: item.lines.join('\n') })).sort((a, b) => (a.category === 'Game API' ? 0 : 1) - (b.category === 'Game API' ? 0 : 1));
    }
    async function loadGuide() {
        $('guide-copy').disabled = true;
        $('guide-content').replaceChildren(text('p', 'Loading reference…'));
        try {
            if (!guidePromise) guidePromise = fetch('/authoring-guide.md').then(response => {
                if (!response.ok) throw new Error('Could not load the reference.'); return response.text();
            }).catch(error => { guidePromise = null; throw error; });
            guideText = await guidePromise;
            const entries = guideSections(guideText);
            if (!entries.length) throw new Error('The reference is unavailable.');
            topicBrowser(entries, $('guide-search'), $('guide-topics'), $('guide-content'), (item, detail) => {
                detail.append(text('h3', item.label), markdown(item.search));
            }, entries.find(item => item.title === 'What a Homegames game is')?.id);
            $('guide-copy').disabled = false;
        } catch (error) {
            $('guide-content').replaceChildren(text('p', 'Could not load the reference. Reconnect and try again.'));
            const retry = text('button', 'Retry', 'dash-btn'); retry.onclick = loadGuide; $('guide-content').append(retry);
        }
    }
    $('guide-btn').onclick = () => { $('guide-modal').showModal(); loadGuide(); };
    $('guide-copy').onclick = () => { if (guideText) copySnippet(guideText, $('guide-copy')); };
    $('snippets-btn').onclick = openSnippets;
    for (const [id, close] of [['guide-modal', 'guide-close'], ['snippets-modal', 'snippets-close']]) {
        const dialog = $(id); $(close).onclick = () => dialog.close();
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const bounds = dialog.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
        });
    }
    return { openSnippets };
})();

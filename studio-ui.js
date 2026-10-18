'use strict';
// Shared Studio menus keep the library, editor and preview on the same controls.
window.StudioUI = (() => {
    // Backups and storage share one modal and operation lock. A restore must
    // finish before any other storage action can touch the current workspace.
    const settingsDialog = document.getElementById('studio-settings');
    const settingsButton = document.getElementById('studio-settings-open');
    let settingsBusy = false, refreshSettings;
    function showSettings() {
        if (settingsDialog.open) return;
        document.getElementById('studio-games').close();
        document.getElementById('studio-learn-menu').open = false;
        settingsDialog.showModal();
        settingsButton.setAttribute('aria-expanded', 'true');
    }
    const settings = {
        async open() {
            showSettings();
            if (refreshSettings) await refreshSettings();
        },
        close() { if (!settingsBusy) settingsDialog.close(); },
        setRefresh(callback) { refreshSettings = callback; },
        async run(task) {
            if (settingsBusy) return;
            settingsBusy = true;
            showSettings();
            settingsDialog.setAttribute('aria-busy', 'true');
            const focused = document.activeElement;
            const controls = [...settingsDialog.querySelectorAll('button, input, select')].map(el => [el, el.disabled]);
            controls.forEach(([el]) => { el.disabled = true; });
            try { return await task(); }
            finally {
                settingsBusy = false;
                settingsDialog.removeAttribute('aria-busy');
                controls.forEach(([el, disabled]) => { el.disabled = disabled; });
                if (settingsDialog.open && (document.activeElement === document.body || document.activeElement === settingsDialog)) {
                    const target = settingsDialog.contains(focused) && !focused.closest('[hidden]') && !focused.disabled
                        ? focused : document.getElementById('studio-settings-close');
                    target.focus({ preventScroll: true });
                }
            }
        }
    };
    settingsButton.onclick = () => settings.open();
    document.getElementById('studio-settings-close').onclick = settings.close;
    settingsDialog.addEventListener('cancel', event => { if (settingsBusy) event.preventDefault(); });
    settingsDialog.addEventListener('close', () => settingsButton.setAttribute('aria-expanded', 'false'));
    settingsDialog.addEventListener('click', event => {
        if (event.target !== settingsDialog) return;
        const bounds = settingsDialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) settings.close();
    });

    function menu(label, id, items = []) {
        const element = document.createElement('details');
        element.className = 'studio-menu'; if (id) element.id = id;
        const summary = document.createElement('summary'); summary.textContent = label;
        const panel = document.createElement('div'); panel.className = 'studio-menu-panel';
        panel.append(...items); element.append(summary, panel);
        return { element, panel };
    }
    function describe(button, description) {
        const hint = document.createElement('small'); hint.textContent = description; button.append(hint); return button;
    }
    // The embedded player exposes the same actions as the full player. Studio
    // owns the presentation so game downloads don't appear a second time here.
    function previewToolbar(panel, status) {
        const actions = new Map();
        let playerForm, playerInput, playerStatus, changeName;
        return {
            setTitle() {}, setStatus: status,
            setPlayerName(name, change) {
                changeName = change;
                if (!change) { playerForm?.remove(); playerForm = null; return; }
                if (playerForm) { if (document.activeElement !== playerInput) playerInput.value = name; return; }
                playerForm = document.createElement('form'); playerForm.className = 'studio-player-name';
                const label = document.createElement('label'); label.textContent = 'Your name';
                playerInput = document.createElement('input'); playerInput.type = 'text'; playerInput.value = name; playerInput.maxLength = 32;
                const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Save name';
                playerStatus = document.createElement('p'); playerStatus.setAttribute('role','status');
                label.append(playerInput); playerForm.append(label, submit, playerStatus);
                playerForm.onsubmit = event => { event.preventDefault(); try { playerInput.value = changeName(playerInput.value); playerStatus.textContent = 'Name updated'; } catch (error) { playerStatus.textContent = error.message; } };
                panel.append(playerForm);
            },
            setAction(key, action) {
                if (!['share', 'manual-connect', 'exports'].includes(key)) return;
                let button = actions.get(key);
                if (!action) { button?.remove(); actions.delete(key); return; }
                if (!button) { button = document.createElement('button'); button.type = 'button'; panel.append(button); actions.set(key, button); }
                button.textContent = key === 'exports' ? 'View game exports' : action.label;
                button.disabled = !!action.disabled; button.title = action.title || ''; 
                button.onclick = () => Promise.resolve().then(action.run).catch(error => status(error.message));
            },
            dispose() { playerForm?.remove(); playerForm = null; for (const button of actions.values()) button.remove(); actions.clear(); }
        };
    }
    document.addEventListener('click', event => {
        for (const element of document.querySelectorAll('.studio-menu[open]')) {
            if (!element.contains(event.target) || (event.target.closest('button,a') && !event.target.closest('form'))) element.open = false;
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const open = [...document.querySelectorAll('.studio-menu[open]')];
        if (!open.length) return;
        event.preventDefault(); event.stopImmediatePropagation();
        for (const element of open) element.open = false;
        open.at(-1).querySelector('summary').focus();
    });
    return { menu, describe, previewToolbar, settings };
})();

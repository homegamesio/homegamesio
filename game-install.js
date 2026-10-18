'use strict';
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HomegamesInstall = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
    // Browser capability wins over OS detection. Detection only chooses help
    // when the browser does not expose a native installation prompt.
    function guide({ userAgent = '', platform = '', maxTouchPoints = 0, prompt = false, installed = false, standalone = false } = {}) {
        const ios = /iPad|iPhone|iPod/i.test(userAgent) || (/Mac/i.test(platform + userAgent) && maxTouchPoints > 1);
        const mac = !ios && /Mac/i.test(platform + userAgent), windows = /Win/i.test(platform + userAgent);
        const edge = /Edg\//.test(userAgent), chrome = /Chrome\/|Chromium\//.test(userAgent) && !/OPR\//.test(userAgent);
        const safari = /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|EdgiOS\/|FxiOS\/|OPR\/|OPiOS\//.test(userAgent);
        if (installed || standalone) return { title: 'Your game app is installed', steps: standalone
            ? ['You are playing in the app. You can keep a separate game file below.']
            : ['Open the game from its new icon.'], copyLink: false };
        if (prompt) return { title: windows ? 'Install on Windows' : mac ? 'Install on your Mac' : 'Install on this device',
            steps: ['Choose Install in the browser prompt to give this game its own app icon.'], copyLink: false };
        if (ios) return { title: 'Add to your Home Screen', steps: [
            safari ? 'Open Safari’s Share menu. It may be inside the ⋯ menu.' : 'Open your browser’s Share menu. If Add to Home Screen is missing, open this link in Safari.',
            'Choose Add to Home Screen, keep Open as Web App on if shown, then tap Add.',
            'Open the new game icon once while online.'
        ], copyLink: !safari };
        if (mac && safari) return { title: 'Add to your Mac’s Dock', steps: [
            'In Safari, choose File → Add to Dock (macOS Sonoma 14 or later).',
            'Choose Add, then open the game from your Dock.'
        ], copyLink: false };
        if (edge || chrome) return { title: windows ? 'Install on Windows' : mac ? 'Install on your Mac' : 'Install on this device', steps: [
            /Android/i.test(userAgent) ? 'Open the browser menu and choose Add to Home screen or Install app.'
                : edge ? 'Choose the app install icon in the address bar, or ⋯ → More tools → Apps → Install this site as an app.'
                    : 'Choose the install icon in the address bar, or ⋮ → Cast, save, and share → Install page as app.',
            'Confirm Install, then open the new game icon.'
        ], copyLink: false };
        return { title: mac ? 'Add to your Mac’s Dock' : 'Get a game app', steps: mac ? [
            'Open this game link in Safari (macOS Sonoma 14 or later).',
            'Choose File → Add to Dock, then Add.'
        ] : ['Open this game link in Microsoft Edge or Google Chrome.', 'Use the browser’s Install app option, then open the new game icon.'], copyLink: true };
    }

    function createController(window, onChange = () => {}) {
        let deferred = null, installed = false, prompting = false;
        const display = window.matchMedia?.('(display-mode: standalone)');
        const standalone = () => display?.matches || window.navigator.standalone === true;
        const canPrompt = () => !!deferred && !installed && !standalone() && !prompting;
        const before = event => { event.preventDefault(); if (!installed && !standalone()) deferred = event; onChange(); };
        const complete = () => { installed = true; deferred = null; onChange(); };
        window.addEventListener('beforeinstallprompt', before);
        window.addEventListener('appinstalled', complete);
        display?.addEventListener?.('change', onChange);
        return {
            canPrompt, isInstalled: () => installed || standalone(),
            guide: () => guide({ userAgent: window.navigator.userAgent, platform: window.navigator.platform,
                maxTouchPoints: window.navigator.maxTouchPoints, prompt: canPrompt(), installed, standalone: standalone() }),
            async prompt() {
                if (!canPrompt()) return null;
                const event = deferred; deferred = null; prompting = true;
                try {
                    // Must run before the first await to preserve the click gesture.
                    const result = event.prompt(); onChange();
                    const choice = await result;
                    return choice?.outcome ? choice : await event.userChoice;
                } finally { prompting = false; onChange(); }
            },
            dispose() {
                deferred = null;
                window.removeEventListener('beforeinstallprompt', before);
                window.removeEventListener('appinstalled', complete);
                display?.removeEventListener?.('change', onChange);
            }
        };
    }
    return { guide, createController };
});

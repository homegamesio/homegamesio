(function () {
    'use strict';
    let dialog, returnFocus;
    const prompt = 'Use the attached Homegames guide to make a game where [describe your game]. Open https://homegames.io/studio.html in your interactive browser, build and play-test it there, and iterate until it works. Download both the full game HTML and source ZIP from Studio’s Export & share menu and give me those files. If you do not have browser control, tell me before starting.';

    function createGuide() {
        dialog = document.createElement('dialog');
        dialog.id = 'chatgpt-guide';
        dialog.setAttribute('aria-labelledby', 'chatgpt-guide-title');
        dialog.innerHTML = `
            <header class="chatgpt-guide-header">
                <h2 id="chatgpt-guide-title">Use with ChatGPT</h2>
                <button type="button" class="chatgpt-guide-close" aria-label="Close ChatGPT guide" autofocus>×</button>
            </header>
            <div class="chatgpt-guide-body">
                <p class="chatgpt-guide-intro">Describe your idea. Build, play, and refine it in Homegames Studio with ChatGPT.</p>
                <ol class="chatgpt-guide-steps">
                    <li>
                        <h3>Get the guide</h3>
                        <p>The game-making instructions and Homegames documentation, in one file.</p>
                        <a class="chatgpt-guide-action" href="/homegames-chatgpt.txt" download="homegames-chatgpt.txt">Download instructions (.txt)</a>
                    </li>
                    <li>
                        <h3>Attach it to your chat</h3>
                        <p>Open a ChatGPT chat with browser control, attach the file, and paste this prompt. Replace the brackets with your game idea.</p>
                        <label for="chatgpt-guide-prompt">Starter prompt</label>
                        <textarea id="chatgpt-guide-prompt" rows="6" spellcheck="false"></textarea>
                        <div class="chatgpt-guide-actions">
                            <button type="button" class="chatgpt-guide-action" id="chatgpt-guide-copy">Copy prompt</button>
                            <a class="chatgpt-guide-link" href="https://chatgpt.com/" target="_blank" rel="noopener">Open ChatGPT ↗</a>
                        </div>
                        <p id="chatgpt-guide-status" role="status"></p>
                    </li>
                    <li>
                        <h3>Bring your game home</h3>
                        <p>Ask for changes in the same chat. When you're happy, download the game HTML to play, or import the source ZIP into Studio to keep editing.</p>
                    </li>
                </ol>
                <p class="chatgpt-guide-note">ChatGPT needs an interactive browser to test games in Studio. Attach the guide yourself; opening ChatGPT does not send it your files or your current game.</p>
            </div>`;
        document.body.appendChild(dialog);
        const input = dialog.querySelector('textarea');
        input.value = prompt;
        dialog.querySelector('.chatgpt-guide-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => returnFocus?.focus());
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
        });
        dialog.querySelector('#chatgpt-guide-copy').addEventListener('click', async () => {
            const status = dialog.querySelector('#chatgpt-guide-status');
            try {
                await navigator.clipboard.writeText(input.value);
                status.textContent = 'Copied! Paste it into your chat with the instructions attached.';
            } catch (_) {
                input.focus();
                input.select();
                status.textContent = 'Select and copy the prompt above, then paste it into your chat.';
            }
        });
        return dialog;
    }

    document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-chatgpt-guide]');
        if (!trigger) return;
        event.preventDefault();
        const menu = trigger.closest('details');
        returnFocus = menu ? menu.querySelector('summary') : trigger;
        if (menu) menu.open = false;
        const guide = dialog || createGuide();
        guide.querySelector('#chatgpt-guide-status').textContent = '';
        guide.showModal();
    });
}());

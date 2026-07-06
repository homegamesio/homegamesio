// Standalone password-reset flow. Step 1: request a code to your email.
// Step 2: enter the code + a new password. Mirrors the code-based verification
// flow (no link, so nothing for email clients to prefetch).

const API_URL = 'https://api.homegames.io';
const $ = (id) => document.getElementById(id);

const api = (method, path, body) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}${path}`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.response)); } catch (e) { resolve(xhr.response); }
        } else {
            let err; try { err = JSON.parse(xhr.response); } catch (e) { err = xhr.response; }
            reject(err);
        }
    };
    xhr.send(body ? JSON.stringify(body) : null);
});

const setMsg = (text, cls) => { const el = $('msg'); el.textContent = text || ''; el.className = 'msg' + (cls ? ' ' + cls : ''); };

const sendCode = () => {
    const email = $('email').value.trim();
    if (!email) { setMsg('Enter your email', 'err'); return; }
    $('send-btn').disabled = true;
    // Server always returns 200 (anti-enumeration), so reveal nothing specific.
    api('POST', '/auth/forgot', { email })
        .then(() => {
            $('step-request').classList.add('hidden');
            $('step-reset').classList.remove('hidden');
            setMsg('If an account exists for that email, a reset code is on its way. Enter it below.', 'ok');
            $('code').focus();
        })
        .catch(() => {
            // Even on transport error, advance — the code may still have sent.
            $('step-request').classList.add('hidden');
            $('step-reset').classList.remove('hidden');
            setMsg('If an account exists for that email, a reset code is on its way.', 'ok');
        })
        .finally(() => { $('send-btn').disabled = false; });
};

const doReset = () => {
    const email = $('email').value.trim();
    const code = $('code').value.trim();
    const newPassword = $('new-password').value;
    if (!code || !newPassword) { setMsg('Enter the code and a new password', 'err'); return; }
    if (newPassword.length < 8) { setMsg('Password must be at least 8 characters', 'err'); return; }
    $('reset-btn').disabled = true;
    api('POST', '/auth/reset', { email, code, newPassword })
        .then(() => {
            setMsg('Password updated. Redirecting to login…', 'ok');
            setTimeout(() => { window.location.href = '/studio'; }, 1500);
        })
        .catch((err) => { setMsg((err && err.error) || 'Reset failed', 'err'); })
        .finally(() => { $('reset-btn').disabled = false; });
};

$('send-btn').onclick = sendCode;
$('reset-btn').onclick = doReset;
$('email').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCode(); });
$('new-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doReset(); });

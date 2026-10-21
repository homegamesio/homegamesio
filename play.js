'use strict';
(async () => {
    const $ = id => document.getElementById(id);
    const status = (text, details = {}) => {
        if (sessionFrame) sessionFrame.setStatus(text, details);
        else $('status').textContent = text;
    }, fail = error => status(error.message || String(error), { attention: true });
    const invitation = HomegamesClient.readInvitation();
    let client, pairing, sessionFrame;
    window.addEventListener('pagehide', () => { client?.stop(); pairing?.dispose(); sessionFrame?.dispose(); });
    try {
        if (invitation) {
            let joinError = null;
            
            sessionFrame = HomegamesClient.createSessionFrame('game-container', 'Shared game', '/catalog.html', {
                getLink: () => client.getShareLink(), getSharingLink: mode => client.getSharingLink(mode), hintText: 'The host needs to keep their game open.',
                onOpen: () => client?.setInputEnabled(false), onClose: () => client?.setInputEnabled(true)
            }, { status: 'Connecting to host…' });
            $('status').remove(); sessionFrame.toolbar.statusElement.id = 'status';
            client = new HomegamesClient({ containerId: sessionFrame.containerId,
                transport: HomegamesClient.createRtcTransport({ ...invitation, joinUrl: new URL('/play.html', location.href).href }),
                share: { signalingUrl: invitation.signalingUrl, receiveUrl: new URL('/game-app.html', location.href).href },
                onAspectRatio: ratio => sessionFrame.toolbar.setAspectRatio(ratio),
                onReady: () => { joinError = null; sessionFrame.toolbar.setAction('retry', null); sessionFrame.setStatus('Connected to host'); },
                onError: error => {
                    joinError = error;
                    const message = error.message || String(error);
                    const help = /room is full/i.test(message) ? 'Wait for a space, or browse games to start your own.'
                        : /invitation has ended|invalid/i.test(message) ? 'Ask the host to share a new invitation.'
                        : 'Check your connection and that the host still has the game open, then try again.';
                    sessionFrame.setStatus(`${message}. ${help}`, { attention: true }); sessionFrame.toolbar.setAction('retry', { label: 'Try again', run: () => location.reload() });
                },
                onClose: () => {
                    // A failed join reports its reason before closing the transport.
                    if (joinError) return;
                    sessionFrame.setStatus('The host disconnected. Ask them to reopen the game and share a new invitation.', { attention: true }); sessionFrame.toolbar.setAction('retry', { label: 'Try again', run: () => location.reload() });
                } });
            client.start(); return;
        }
        const id = new URLSearchParams(location.search).get('game');
        if (!id) {
            sessionFrame = HomegamesClient.createSessionFrame('game-container', 'Homegames', '/catalog.html', null, {
                status: 'Choose a game or connect manually',
                onOpen: () => client?.setInputEnabled(false), onClose: () => client?.setInputEnabled(true)
            });
            $('status').remove(); sessionFrame.toolbar.statusElement.id = 'status';
            pairing = HomegamesClient.createManualPairing({ container: document.body, getSession: () => null,
                onOpen: () => client?.setInputEnabled(false), onClose: () => client?.setInputEnabled(true),
                join: transport => { client?.stop(); client = new HomegamesClient({ containerId: sessionFrame.containerId, transport,
                    onAspectRatio: ratio => sessionFrame.toolbar.setAspectRatio(ratio),
                    onReady: () => status('Connected manually to host'), onClose: () => status('Host disconnected', { attention: true }), onError: fail }); client.start(); } });
            sessionFrame.toolbar.setAction('manual-connect', { label: 'Manual connection', run: () => pairing.show() }); return;
        }
        const game = await HomegamesLibrary.findGame(id);
        location.replace('/game-app.html?' + new URLSearchParams({ game: game.gameId, revision: game.revision, builtin: game.id }));
    } catch (error) { fail(error); }
})();

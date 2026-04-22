/**
 * WebSocket Web Worker for HomegamesClient.
 *
 * Runs in a dedicated worker thread. Handles WebSocket lifecycle
 * so binary message processing doesn't block the main thread.
 *
 * Protocol (main thread → worker):
 *   { type: 'connect', wsUrl }           — open WebSocket
 *   { type: 'send', data }               — send string to WebSocket
 *   { type: 'sendReady', id, clientInfo, spectating, requestedGame }
 *   { type: 'close' }                    — close WebSocket
 *
 * Protocol (worker → main thread):
 *   ArrayBuffer                           — binary data from server
 *   { type: 'open' }                     — WebSocket opened
 *   { type: 'close' }                    — WebSocket closed
 *   { type: 'error', message }           — WebSocket error
 */

let socket = null;

const connect = (wsUrl) => {
    if (socket) {
        try { socket.close(); } catch (e) {}
    }

    socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        postMessage({ type: 'open' });
    };

    socket.onmessage = (event) => {
        // Forward binary data directly (zero-copy via transferable)
        if (event.data instanceof ArrayBuffer) {
            postMessage(event.data, [event.data]);
        } else {
            // String messages (rare — error messages from server)
            postMessage({ type: 'string', data: event.data });
        }
    };

    socket.onclose = () => {
        postMessage({ type: 'close' });
        socket = null;
    };

    socket.onerror = (err) => {
        postMessage({ type: 'error', message: err.message || 'WebSocket error' });
    };
};

onmessage = (msg) => {
    const data = msg.data;

    if (data.type === 'connect') {
        connect(data.wsUrl);

    } else if (data.type === 'sendReady') {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const readyMsg = {
                type: 'ready',
                id: data.id || null,
                spectating: data.spectating || false,
                clientInfo: data.clientInfo || {},
            };
            if (data.requestedGame) {
                readyMsg.clientInfo.requestedGame = data.requestedGame;
            }
            socket.send(JSON.stringify(readyMsg));
        }

    } else if (data.type === 'send') {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(data.data);
        }

    } else if (data.type === 'close') {
        if (socket) {
            socket.close();
            socket = null;
        }
    }
};

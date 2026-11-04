const PORT = Number(process.env.NILX_DEVICE_PORT || 9222);
const expression = process.argv.slice(2).join(' ') || 'document.title';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((target) => target.type === 'page' && target.title.includes('Nilx Drive'))
    || list.find((target) => target.type === 'page');
if (!page) throw new Error('No page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (event) => reject(new Error(event.message || 'ws error'));
});
let id = 0;
const pending = new Map();
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    ws.send(JSON.stringify({ id: callId, method, params }));
});
const result = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true
});
if (result.exceptionDetails) {
    console.error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    process.exit(1);
}
console.log(JSON.stringify(result.result.value, null, 2));
ws.close();

const PORT = Number(process.env.NILX_DEVICE_PORT || 9222);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((target) => target.type === 'page' && target.title.includes('Nilx Drive'))
    || list.find((target) => target.type === 'page' && target.url.includes('127.0.0.1'))
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
const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Page.bringToFront');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
const deadline = Date.now() + 45000;
let ready = false;
while (Date.now() < deadline) {
    ready = await evaluate(`Boolean(window.NilxDrive?.getSnapshot) && document.getElementById('loading-screen').hidden === true`);
    if (ready) break;
    await sleep(500);
}
console.log('READY', ready);
console.log(JSON.stringify(await evaluate(`(() => ({
  title: document.title,
  state: window.NilxDrive?.getState?.(),
  screen: window.NilxDrive?.ui?.currentScreen,
  fatalHidden: document.getElementById('fatal-layer').hidden,
  fatalText: document.getElementById('fatal-message').textContent,
  loadingHidden: document.getElementById('loading-screen').hidden,
  menuHidden: document.getElementById('menu-screen').hidden,
  rows: document.querySelectorAll('#vehicle-list .vehicle-row').length,
  worlds: document.querySelectorAll('#world-list .world-card').length,
  snapshot: window.NilxDrive?.getSnapshot?.(),
  gl: (() => { try { return Boolean(document.getElementById('game-canvas').getContext('webgl2')); } catch (e) { return String(e); } })()
}))()`), null, 2));
const logs = await evaluate(`(() => window.__nilxLogs || [])()`);
console.log('LOGS', logs);
ws.close();

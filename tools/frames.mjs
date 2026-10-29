// Captura N frames del canvas mientras se mantiene una tecla.
// Uso: node frames.mjs <puerto> <prefijo> <tecla> <frames>
import { writeFileSync } from 'node:fs';
const [,, portArg, prefijo, tecla, nFrames] = process.argv;
const PORT = portArg || '9224';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  }
};
await new Promise(r => ws.onopen = r);
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result.value;
}
const sleep = (ms) => `new Promise(r=>setTimeout(r,${ms}))`;
await evalJS(sleep(2500)); // boot + caída

const rect = JSON.parse(await evalJS(`(()=>{const r=document.getElementById('lienzo').getBoundingClientRect();
  return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()`));

await send('Input.dispatchKeyEvent', { type: 'keyDown', key: tecla, code: tecla });
for (let i = 0; i < +nFrames; i++) {
  await evalJS(sleep(120));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
  });
  writeFileSync(`${prefijo}${i}.png`, Buffer.from(shot.data, 'base64'));
  console.log(`${prefijo}${i}.png`);
}
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: tecla, code: tecla });
process.exit(0);

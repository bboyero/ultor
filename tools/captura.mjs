// Captura el canvas del juego tal y como se ve (recorte exacto vía CDP).
// Uso: node captura.mjs <puerto> <salida.png>
// Requiere Chrome con --remote-debugging-port=<puerto> apuntando al juego.
import { writeFileSync } from 'node:fs';

const [,, portArg, outFile] = process.argv;
const PORT = portArg || '9223';

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

const { result } = await send('Runtime.evaluate', {
  expression: `(()=>{const r=document.getElementById('lienzo').getBoundingClientRect();
    return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()`,
  returnByValue: true,
});
const rect = JSON.parse(result.value);
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
});
writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
console.log(outFile, rect.w + 'x' + rect.h);
process.exit(0);

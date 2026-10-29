// E2E del juego en Chrome vía CDP: espera el boot, mantiene una tecla,
// comprueba el estado y captura el canvas. Uso: node e2e.mjs <puerto> <salida.png>
import { writeFileSync } from 'node:fs';
const [,, portArg, outFile] = process.argv;
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'exception');
  return r.result.value;
}
const sleep = (ms) => `new Promise(r=>setTimeout(r,${ms}))`;

console.log('boot:', await evalJS(`(async()=>{await ${sleep(2500)}; return __E ? 'E listo mapaY='+__E.mapaY+' PY='+__E.PY : 'E NO LISTO';})()`));

// flujo: esperar cada fase y pulsar cuando toca
async function esperarFase(f) {
  for (let i = 0; i < 60; i++) {
    if (await evalJS(`__E && __E.fase`) === f) return;
    await evalJS(sleep(200));
  }
  throw new Error('la fase ' + f + ' no llega');
}
async function tecla(key, code) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}
await esperarFase('present');
await tecla('a', 'KeyA');               // PULSA PARA CONTINUAR
await esperarFase('windows');
await tecla('3', 'Digit3');             // JUGAR
for (let i = 0; i < 60; i++) {          // la partida arranca y el héroe cae
  if ((await evalJS(`__E.veces`)) > 0 && !(await evalJS(`__E.cayendo`))) break;
  await evalJS(sleep(200));
}

// mantener ArrowRight ~1 s
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
await evalJS(sleep(1000));
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
console.log('tras andar 1s:', await evalJS(`({mapaX:__E.mapaX, PX:__E.PX, secuencia:__E.secuencia, reposo:__E.reposo, vida:__E.vida})`));

// y soltar: debe parar (animación END -> reposo)
await evalJS(sleep(600));
console.log('tras soltar:', await evalJS(`({reposo:__E.reposo, secuencia:__E.secuencia})`));

// salto: ARRIBA + DERECHA ~600 ms
const pyAntes = await evalJS(`__E.PY`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp' });
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
await evalJS(sleep(600));
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
await evalJS(sleep(300));
console.log('tras saltar:', await evalJS(`({PY:__E.PY, saltando:__E.saltando, vida:__E.vida})`), '(PY antes: ' + pyAntes + ')');

const rect = JSON.parse(await evalJS(`(()=>{const r=document.getElementById('lienzo').getBoundingClientRect();
  return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()`));
const shot = await send('Page.captureScreenshot', {
  format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
});
writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
console.log(outFile, rect.w + 'x' + rect.h);
process.exit(0);

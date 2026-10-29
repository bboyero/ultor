// smoke test hito 2: arranque + andar hacia la derecha (scroll del mundo)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const fakeCtx = {
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  putImageData: () => {},
};
globalThis.document = { getElementById: () => ({ getContext: () => fakeCtx }) };
globalThis.fetch = async (url) => {
  const b = readFileSync(join('assets', url.replace('assets/', '')));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
globalThis.window = { addEventListener: () => {} };
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = { textContent: "" };
globalThis.performance = { now: () => Date.now() };

const { E, Pvirtual, Pfondo, tick } = await import('./js/main.js');
E.acelerado = true; // los bucles de animación no duermen en los tests
await new Promise((r) => setTimeout(r, 100));

// 1) estado inicial
console.log('inicio: mapaX=%d mapaY=%d PX=%d PY=%d posX=%d posY=%d vida=%d',
  E.mapaX, E.mapaY, E.PX, E.PY, E.PosEnbaldosa, E.PosEnbaldosaY, E.vida);
// 2) barra de vida
const f180 = Pvirtual[180 * 320 + 10];
console.log('barra y=180 x=10:', f180, f180 === 98 ? 'OK' : 'FALLA');
// 3) andar a la derecha 120 frames
E.keys[0x4D] = 1;
for (let i = 0; i < 120 && !E.salir; i++) await tick();
E.keys[0x4D] = 0;
console.log('tras andar: mapaX=%d PX=%d posX=%d secuencia=%d reposo=%s vida=%d',
  E.mapaX, E.PX, E.PosEnbaldosa, E.secuencia, E.reposo, E.vida);
if (E.PX <= 0) { console.error('EL MUNDO NO SE MOVIO'); process.exit(1); }
// 4) parar (animación END) y quedarse en reposo
for (let i = 0; i < 30; i++) await tick();
console.log('tras parar: reposo=%s secuencia=%d', E.reposo, E.secuencia);
// 5) héroe visible en pantalla
let hero = 0;
for (let y = 101; y < 143; y++) for (let x = 155; x < 179; x++)
  if (Pvirtual[y * 320 + x]) hero++;
console.log('héroe: %d px', hero);
if (hero < 100) { console.error('HEROE INVISIBLE'); process.exit(1); }
console.log('TODO OK');

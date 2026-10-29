// smoke test del hito 1: arranca main.js con stubs y comprueba Pvirtual
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
const { Pvirtual, E } = await import('./js/main.js');
await new Promise((r) => setTimeout(r, 100));
// barra de vida en y=180, x=0..99: color 98
const fila = [...Pvirtual.subarray(180 * 320, 180 * 320 + 320)];
console.log('fila180[10,50,90]:', fila[10], fila[50], fila[90]);
if (fila[10] !== 98 || fila[50] !== 98) { console.error('BARRA FALLA'); process.exit(1); }
// héroe en (155..179, 101..143): debe haber píxeles != 0 y != los de la duna
let hero = 0, total = 0;
for (let y = 101; y < 143; y++) for (let x = 155; x < 179; x++) { total++; if (Pvirtual[y * 320 + x]) hero++; }
console.log('héroe: %d/%d px', hero, total);
if (hero < 100) { console.error('HEROE FALLA'); process.exit(1); }
// mapa parseado
console.log('mapa:', E.largo, 'x', E.alto, '| caract[0..5]:', [...E.caract.subarray(0, 6)]);
console.log('TODO OK');

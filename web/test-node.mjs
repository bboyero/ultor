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
// 6) salto (ARRIBA + DERECHA) — con techo encima (fila 8): la subida se corta
// y el héroe baja; el resultado neto depende de la geometría (fiel al original)
const pyAntes = E.PY;
E.keys[0x48] = 1; E.keys[0x4D] = 1;
await tick(); await tick();
E.keys[0x48] = 0; E.keys[0x4D] = 0;
console.log('tras saltar: PY %d -> %d, saltando=%s secuencia=%d vida=%d',
  pyAntes, E.PY, E.saltando, E.secuencia, E.vida);
if (E.saltando) { console.error('SALTO NO TERMINO'); process.exit(1); }
if (E.vida !== 25) { console.error('SALTO MATO AL HEROE'); process.exit(1); }
// 7) correr (ESPACIO)
const pxAntes = E.PX;
E.keys[0x39] = 1; E.keys[0x4D] = 1;
for (let i = 0; i < 60; i++) await tick();
E.keys[0x39] = 0; E.keys[0x4D] = 0;
console.log('tras correr: PX %d -> %d corriendo=%s', pxAntes, E.PX, E.corriendo);
if (E.PX - pxAntes < 60) { console.error('CORRER NO AVANZO'); process.exit(1); }
// 8) agacharse
E.keys[0x50] = 1;
await tick(); await tick();
const agachado1 = E.agachado;
E.keys[0x50] = 0;
for (let i = 0; i < 10; i++) await tick();
console.log('agacharse: agachado=%s -> false=%s', agachado1, E.agachado);
if (!agachado1 || E.agachado) { console.error('AGACHARSE FALLA'); process.exit(1); }
// 9) puntillas (ALT)
E.keys[0x38] = 1;
for (let i = 0; i < 5; i++) await tick();
const puntillas1 = E.puntillas;
E.keys[0x38] = 0;
for (let i = 0; i < 10; i++) await tick();
console.log('puntillas: activas=%s -> false=%s', puntillas1, E.puntillas);
if (!puntillas1 || E.puntillas) { console.error('PUNTILLAS FALLA'); process.exit(1); }
// 10) combate: guardia + puñetazo + patada + salir de guardia
E.keys[0x1D] = 1;
await tick();
console.log('guardia: activa=%s', E.guardia);
if (!E.guardia) { console.error('GUARDIA FALLA'); process.exit(1); }
E.keys[0x38] = 1;
await tick();
E.keys[0x38] = 0;
E.keys[0x38] = 1; E.keys[0x50] = 1;
await tick();
E.keys[0x38] = 0; E.keys[0x50] = 0;
console.log('tras puñetazo y patada: guardia=%s vida=%d', E.guardia, E.vida);
E.keys[0x1D] = 0;
for (let i = 0; i < 20; i++) await tick();
console.log('tras soltar CTRL: guardia=%s reposo=%s Hx=%d', E.guardia, E.reposo, E.Hx);
if (E.guardia) { console.error('NOGUARDIA FALLA'); process.exit(1); }
// 11) trepar: buscar una repisa (borde) en el mapa y subir
let repisa = null;
for (let y = 1; y < E.alto - 15 && !repisa; y++)
  for (let x = 0; x < E.largo - 15 && !repisa; x++) {
    const suelo = E.caract[(y + 9) * E.largo + x + 10];
    const rep = E.caract[(y + 5) * E.largo + x + 11];
    const hueco = E.caract[(y + 5) * E.largo + x + 10];
    if (suelo !== 0 && (rep === 1 || rep === 2) && hueco === 0) repisa = [x, y];
  }
if (!repisa) { console.error('NO HAY REPISAS EN EL MAPA'); process.exit(1); }
E.mapaX = repisa[0]; E.mapaY = repisa[1]; E.PosEnbaldosa = 0; E.PosEnbaldosaY = 0;
const myAntes = E.mapaY;
E.keys[0x48] = 1;
await tick();
E.keys[0x48] = 0;
console.log('trepar en (%d,%d): mapaY %d -> %d, subiendo=%s',
  repisa[0], repisa[1], myAntes, E.mapaY, E.subiendo);
if (E.mapaY >= myAntes) { console.error('TREPAR NO SUBIO'); process.exit(1); }
if (E.subiendo) { console.error('SUBE NO TERMINO'); process.exit(1); }
console.log('TODO OK');

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
const escuchas = {};
globalThis.window = { addEventListener: (t, fn) => { escuchas[t] = fn; }, removeEventListener: () => {}, AudioContext: class {
  createBuffer(ch, len, rate) { return { len, rate, data: new Float32Array(len), getChannelData() { return this.data; } }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
  resume() {} get destination() { return {}; }
} };
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = { textContent: "", classList: { add() {}, remove() {} } };
globalThis.performance = { now: () => Date.now() };

const { E, Pvirtual, Pfondo, tick } = await import('./js/main.js');
E.acelerado = true; // los bucles de animación no duermen en los tests
await new Promise((r) => setTimeout(r, 100));

// 1) estado inicial — con los 75 enemigos reales ahora activos, los
// neutralizamos para las pruebas de movimiento (la IA se prueba aparte)
for (const m of E.MALO) m.muertoE = true;
console.log('inicio: mapaX=%d mapaY=%d PX=%d PY=%d posX=%d posY=%d vida=%d (enemigos=%d)',
  E.mapaX, E.mapaY, E.PX, E.PY, E.PosEnbaldosa, E.PosEnbaldosaY, E.vida, E.MALO.length);
// 2) HUD del BACKUP: vida (4 filas y=190, color 96), crono (y=190 x=104, color 145)
const f190 = Pvirtual[190 * 320 + 5];
const fCrono = Pvirtual[190 * 320 + 110];
const fPuntos = Pvirtual[190 * 320 + 230];
console.log('vida y=190 x=5: %d (esperado 96) | crono x=110: %d (145) | puntos x=230: %d',
  f190, fCrono, fPuntos);
if (f190 !== 96 || fCrono !== 145) { console.error('HUD FALLA'); process.exit(1); }
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
// 12) enemigos: IA de persecución — héroe y enemigo en el suelo del arranque
// (mapaY=3: suelo en la fila 12; Ey=149 → su sensor mira la fila 12, OY=101=Hy)
E.mapaX = 0; E.mapaY = 3; E.PosEnbaldosa = 0; E.PosEnbaldosaY = 0; E.PX = 0; E.PY = 48;
Object.assign(E.MALO[0], { Ex: 200, Ey: 149, Oex: 200, vidaE: 5, muertoE: false,
  esaltando: false, ecae: false, Aguardia: false, ataca: false, ereposo: false,
  secuenciaE: 0, sentidoE: false });
for (let i = 0; i < 30; i++) await tick();
const seMovio = E.MALO[0].Ex < 200 - 5;
const x0 = E.MALO[0].Ex - E.PX, y0 = E.MALO[0].Ey - E.PY;
console.log('enemigo persiguiendo: Ex=%d (héroe en x=%d) | pantalla (%d,%d) | estado: aguardia=%s ataca=%s',
  E.MALO[0].Ex, E.Hx, x0, y0, E.MALO[0].Aguardia, E.MALO[0].ataca);
if (!seMovio) { console.error('IA DE PERSECUCION FALLA'); process.exit(1); }
if (!(x0 > -50 && x0 < 320 && y0 > -40 && y0 < 176)) { console.error('ENEMIGO FUERA DE PANTALLA'); process.exit(1); }
// 13) muerte de un enemigo (E_muerte)
E.MALO[0].vidaE = 0;
for (let i = 0; i < 40; i++) await tick();
console.log('enemigo 0: muertoE=%s', E.MALO[0].muertoE);
if (!E.MALO[0].muertoE) { console.error('E_MUERTE FALLA'); process.exit(1); }
// 14) sonido: las 13 muestras decodificadas y play() sin crash
const { numeroSamples, play } = await import('./js/sonido.js');
console.log('sonido: %d muestras decodificadas', numeroSamples());
if (numeroSamples() !== 13) { console.error('SONIDO FALLA'); process.exit(1); }
for (const n of ['paso1', 'paso2', 'ahh', 'combat', 'combatG', 'puno', 'up', 'saltoF', 'golpe0', 'golpe1'])
  play(n); // el nuevo corta al anterior (semántica del original)
console.log('play() sin errores');
// 15) minimapa (TAB): punto blanco del héroe
E.keys[0x0F] = 1; await tick(); E.keys[0x0F] = 0;
await tick();
const dot = Pvirtual[(E.mapaY + 8) * 320 + E.mapaX + 10];
console.log('minimapa: punto del héroe (esperado 255) = %d', dot);
if (dot !== 255) { console.error('MINIMAPA FALLA'); process.exit(1); }
E.keys[0x0F] = 1; await tick(); E.keys[0x0F] = 0; await tick(); // desactivar
// 16) idle: bostezo a los 128 frames y picar nariz a los 250
E.vecesparado = 127;
await tick();
console.log('idle bostezo: vecesparado=%d secuencia=%d', E.vecesparado, E.secuencia);
E.vecesparado = 250;
await tick();
console.log('idle picar: vecesparado=%d secuencia=%d', E.vecesparado, E.secuencia);
// 17) muerte del héroe: animación + GAME.DAC + salir
const { actualizaVIDA } = await import('./js/main.js');
for (const m of E.MALO) m.muertoE = true; // dejar limpio antes de morir
E.vida = 0;
const muerteP = actualizaVIDA();
setTimeout(() => escuchas.keydown && escuchas.keydown({ preventDefault() {} }), 20);
await muerteP;
console.log('muerte: salir=%s (game over mostrado + fundido a negro, como el original)', E.salir);
if (!E.salir) { console.error('MUERTE NO TERMINO'); process.exit(1); }
// 18) scroll vertical: el refill de las filas 174-175 debe ser EXACTO
const { ponefondoARRIBA } = await import('./js/main.js');
E.salir = false;
let mal = 0;
for (let rep = 0; rep < 8; rep++) {
  ponefondoARRIBA(1);
  // la fila r de pantalla muestra el mundo (posX+x, posY+r): verificación
  // general píxel a píxel de las filas 174-175 tras el scroll+refill
  for (let x = 0; x < 320; x++) {
    const wx = E.PosEnbaldosa + x;
    const tx = E.mapaX + (wx >> 4);
    for (const r of [174, 175]) {
      const wy = E.PosEnbaldosaY + r;
      const ty = E.mapaY + (wy >> 4);
      const nro = E.mapa[ty * E.largo + tx];
      const esperado = E.fondo[nro * 256 + (wy & 15) * 16 + (wx & 15)];
      if (Pfondo[r * 320 + x] !== esperado) { mal++; if (mal < 4) console.log('fila %d x=%d: %d != %d', r, x, Pfondo[r * 320 + x], esperado); }
    }
  }
}
console.log('refill vertical: %s (%d diferencias de 5120)', mal === 0 ? 'OK' : 'FALLA', mal);
if (mal > 0) { console.error('SCROLL VERTICAL CON RAYAS'); process.exit(1); }
// 19) lo mismo para el scroll hacia arriba (salto): filas 0-1
const { ponefondoABAJO } = await import('./js/main.js');
let mal2 = 0;
for (let rep = 0; rep < 8; rep++) {
  ponefondoABAJO(1);
  for (let x = 0; x < 320; x++) {
    const wx = E.PosEnbaldosa + x;
    const tx = E.mapaX + (wx >> 4);
    for (const r of [0, 1]) {
      const wy = E.PosEnbaldosaY + r;
      const ty = E.mapaY + (wy >> 4);
      const nro = E.mapa[ty * E.largo + tx];
      const esperado = E.fondo[nro * 256 + (wy & 15) * 16 + (wx & 15)];
      if (Pfondo[r * 320 + x] !== esperado) mal2++;
    }
  }
}
console.log('refill ABAJO: %s (%d diferencias)', mal2 === 0 ? 'OK' : 'FALLA', mal2);
if (mal2 > 0) { console.error('SCROLL HACIA ARRIBA CON RAYAS'); process.exit(1); }
console.log('TODO OK');

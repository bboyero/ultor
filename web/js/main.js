// ULTOR — port JavaScript. Hito 2: movimiento (andar, girar, caer) con el
// scroll del mundo fiel a JUEGO.PAS. El héroe está casi fijo (Hx=155):
// es el MUNDO el que se desplaza (PX/PY + PosEnbaldosa + mapaX/mapaY).

const W = 320, MAXY = 176, PANEL_Y = 175;
const maxParallax = 101;

import { cargarSonido, play, desbloquear } from './sonido.js';

// Scancodes (POLL.PAS KeyTable)
const SC = {
  ESC: 0x01, TAB: 0x0F, CTRL: 0x1D, ALT: 0x38, SPACE: 0x39,
  ARR: 0x48, IZQ: 0x4B, DER: 0x4D, ABJ: 0x50, T: 0x14,
};
// Tiles (JUEGO.PAS)
const BASE = 1, SOLIDO = 2, MORTAL = 3, DESLIZDER = 4, DESLIZIZQ = 5;

// Dimensiones de los sprites de HOMBRE.DAT en el orden exacto de carga()
const SPRITES = [
  ['ANDA', 24, 43, 9], ['GIRA', 18, 43, 3], ['BEGIN', 23, 43, 3],
  ['END', 23, 43, 3], ['SALTA', 28, 47, 7], ['GUARD', 31, 42, 4],
  ['TGUAR', 34, 40, 5], ['ANDA2', 21, 43, 7], ['END2', 21, 43, 3],
  ['BEGIN2', 21, 43, 3], ['PICA', 18, 43, 2], ['PUNO', 41, 41, 3],
  ['DELAY', 18, 43, 3], ['CORRE', 34, 40, 8], ['CAE', 24, 47, 4],
  ['CAID2', 20, 43, 7], ['SALTQ', 23, 51, 8], ['COLG', 19, 49, 7],
  ['SUBa', 20, 56, 5], ['SUBb', 28, 47, 2], ['SUBc', 38, 33, 1],
  ['SUBd', 17, 41, 3], ['PATAD', 40, 43, 3], ['MUEa', 38, 37, 1],
  ['MUEb', 40, 33, 2], ['MUEc', 53, 18, 2], ['SANGRE', 16, 29, 5],
];
const DIM = {}; // nombre -> {X, Y, F, off}

const E = {
  paleta: new Uint8Array(768), lut: new Uint8Array(256 * 4),
  mapa: null, caract: null, largo: 0, alto: 0,
  fondo: null, hombre: null, duna: null, panel: null,
  // estado del juego (valores de arranque del original)
  mapaX: 0, mapaY: 1, PX: 0, PY: 16,
  PosEnbaldosa: 0, PosEnbaldosaY: 0,
  Hx: 155, Hy: 117 - 16, vida: 25,
  secuencia: 8, reposo: true, sentido: true,
  saltando: false, cayendo: false, subiendo: false,
  corriendo: false, guardia: false, puntillas: false, agachado: false,
  ctrlduna: 0, Movfondo: false, BAJAalturas: 0,
  veces: 0, salir: false, keys: new Uint8Array(128),
  Xcorrecion: 0,
  YO: null,          // recuadro del héroe para las intersecciones de combate
  MALO: [],          // los 10 enemigos (Ex, Ey, Oex, vidaE...)
  num: 0,            // enemigo en curso (como la variable global del Pascal)
  recibiendo: false, // el héroe acaba de recibir (no le pegan dos veces seguidas)
  mapeado: false,    // minimapa (TAB)
  vecesparado: 0,    // frames de inactividad (bostezo a 128, picar a 250)
  gameover: null,    // GAME.DAC decodificado (249x74) para la muerte
  acelerado: false, // tests de Node: los bucles de animación no duermen
};

// ritmo de frame de los bucles bloqueantes del original (DOS los pintaba en
// tiempo real; en JS se duerme 1 frame por iteración — el flag acelera tests)
const dormir = (ms = 1000 / 60) =>
  E.acelerado ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

// Buffers: Pvirtual (320×200 índices) y Pfondo (320×240 para absorber los
// desbordes del refill vertical del original — fiel, sin crash)
const Pvirtual = new Uint8Array(W * 200);
const Pfondo = new Uint8Array(W * 240);

function putPixel(x, y, c) {
  if (x < 0 || x >= W || y < 0 || y >= 200 || c === 0) return;
  Pvirtual[y * W + x] = c;
}

// putico / puticoatras: píxel 0 transparente, color real = valor-5
function blitSprite(dx, dy, datos, X, Y, flip) {
  let off = 0;
  for (let a = 0; a < Y; a++)
    for (let b = 0; b < X; b++, off++) {
      const v = datos[off];
      if (v !== 0) putPixel(dx + (flip ? X - 1 - b : b), dy + a, v - 5);
    }
}

function Hline(x, y, c, l) {
  for (let i = 0; i < l; i++) putPixel(x + i, y, c);
}

// ---------------- fondo ----------------

// scroll (2px a la izquierda): cada fila copia [2..319] -> [0..317]
function scrollH(p) {
  for (let y = 0; y < MAXY; y++) p.copyWithin(y * W, y * W + 2, y * W + W);
}
// scrollATRAS (2px a la derecha)
function scrollAtras(p) {
  for (let y = 0; y < MAXY; y++) p.copyWithin(y * W + 2, y * W, y * W + W - 2);
}
// scrollARRIBA: filas 2..177 -> 0..175 (continuo, 2px arriba)
function scrollARRIBA(p) {
  p.copyWithin(0, 2 * W, MAXY * W);
}
// scrollABAJO: SOLO filas impares 173,171,.. -> 175,173,.. (bug "peine" del
// original, replicado). Las lecturas bajo la fila 0 dan 0 (en DOS leían
// basura que luego se sobrescribía; invisible igualmente).
function scrollABAJO(p) {
  for (let k = 0; k < MAXY - 1; k++) {
    const src = 173 - 2 * k, dst = 175 - 2 * k;
    if (src < 0) continue;
    p.copyWithin(dst * W, src * W, src * W + W);
  }
}

// ponbaldosa: columna de 2px de una baldosa (resto filas, stride 16->320)
function ponbaldosa(src, dst, resto) {
  for (let i = 0; i < resto; i++) {
    Pfondo[dst + i * W] = E.fondo[src + i * 16];
    Pfondo[dst + i * W + 1] = E.fondo[src + i * 16 + 1];
  }
}

function nroBaldosa(x, y) { return E.mapa[y * E.largo + x]; }
function caractEn(x, y) { return E.caract[y * E.largo + x]; }

// ponefondo(avances): el mundo avanza 2px hacia la derecha (cámara va a la
// derecha). Refill de la columna x=318 con la estructura exacta del original.
function ponefondo(avances) {
  for (let rep = 0; rep < avances; rep++) {
    if (essolido() && !E.subiendo) return;
    E.PX += 2;
    scrollH(Pfondo);
    const px = E.PosEnbaldosa, py = E.PosEnbaldosaY;
    let nro = nroBaldosa(E.mapaX + 20, E.mapaY);
    let aux = nro * 256 + px + py * 16;
    let dst = 318; // fila 0, columna 318
    ponbaldosa(aux, dst, 15 - py + 1);
    dst += W * (15 - py + 1); // doble avance del original (replicado)
    for (let altura = 0; altura <= 10; altura++) {
      nro = nroBaldosa(E.mapaX + 20, E.mapaY + 1 + altura);
      aux = nro * 256 + px;
      ponbaldosa(aux, dst, 16);
      dst += W * 16;
    }
    E.PosEnbaldosa += 2;
    if (E.PosEnbaldosa > 15) { E.PosEnbaldosa = 0; E.mapaX++; }
    E.Movfondo = !E.Movfondo;
    if (E.Movfondo) E.ctrduna = (E.ctrduna + 1) % 640;
  }
}

// ponefondoATRAS: mundo retrocede (cámara a la izquierda). Refill columna 0.
function ponefondoATRAS(avances) {
  for (let rep = 0; rep < avances; rep++) {
    if (essolido() && !E.subiendo) return;
    E.PX -= 2;
    scrollAtras(Pfondo);
    E.PosEnbaldosa -= 2;
    if (E.PosEnbaldosa < 0) { E.PosEnbaldosa = 14; E.mapaX--; }
    const px = E.PosEnbaldosa, py = E.PosEnbaldosaY;
    let nro = nroBaldosa(E.mapaX, E.mapaY);
    let aux = nro * 256 + px + py * 16;
    let dst = 0;
    ponbaldosa(aux, dst, 15 - py + 1);
    dst += W * (15 - py + 1);
    for (let altura = 0; altura <= 10; altura++) {
      nro = nroBaldosa(E.mapaX, E.mapaY + 1 + altura);
      aux = nro * 256 + px;
      ponbaldosa(aux, dst, 16);
      dst += W * 16;
    }
    E.Movfondo = !E.Movfondo;
    if (E.Movfondo) E.ctrduna = (E.ctrduna + 639) % 640;
  }
}

// ---------------- sensores ----------------

function essolido() {
  const { mapaX, mapaY, PosEnbaldosa, PosEnbaldosaY } = E;
  let col = mapaX + 10;
  if (E.sentido) col++; else if (PosEnbaldosa === 0) col--;
  let fila = mapaY + 8;
  if (E.subiendo) fila -= 4;
  if (PosEnbaldosaY > 6) fila++;
  for (let i = 0; i < 3; i++)
    if (caractEn(col, fila - i) === SOLIDO) return true;
  return false;
}

function essolidoUP() {
  const t = caractEn(E.mapaX + 10, E.mapaY + 6);
  return t === SOLIDO || t === MORTAL;
}

// haysuelo: suelo = baldosa no vacía JUSTO en la fila de baldosa (posenbaldosaY=0)
async function haysuelo() {
  const t = caractEn(E.mapaX + 10, E.mapaY + 9);
  if (t === MORTAL) { E.vida = 0; await actualizaVIDA(); }
  return t !== 0 && E.PosEnbaldosaY === 0;
}

// poneH: héroe + sensores + enemigos (el corazón del frame del original:
// primero el héroe, luego los sensores que pueden salir, luego MOVenemigo)
async function poneH(PHx, PHy, que, sprite) {
  if (E.mapeado) ponemapa();
  const d = DIM[sprite];
  const off = d.off + d.X * d.Y * que;
  blitSprite(PHx, PHy, E.hombre.subarray(off, off + d.X * d.Y), d.X, d.Y, !E.sentido);
  if (!E.saltando && !E.cayendo && !E.subiendo && E.vida > 0) {
    const t = caractEn(E.mapaX + 10 + (E.PosEnbaldosa > 10 ? 1 : 0), E.mapaY + 9);
    if (t === 0) { E.BAJAalturas = 0; await cae(); return; }
    if (t === MORTAL) { E.vida = 0; await actualizaVIDA(); }
    else if (t === DESLIZDER) { ponefondo(2); return; }
    else if (t === DESLIZIZQ) { ponefondoATRAS(2); return; }
  }
  for (E.num = 0; E.num < E.MALO.length; E.num++) await MOVenemigo();
}

// enemigos: el bucle MOVenemigo del original, para las rutas que no pasan
// por poneH (frame, carrera, combate, silencio, caída)
async function enemigos() {
  for (E.num = 0; E.num < E.MALO.length; E.num++) await MOVenemigo();
}

async function actualizaVIDA() {
  if (E.vida < 0) E.vida = 0;
  Hline(0, 180, 255, 25 * 4);
  Hline(0, 180, 98, E.vida * 4);
  if (E.vida === 0) await muerte();
}

// muerte: animación MUEa/b/c + GAME.DAC centrado (el game.dat 156x70 del
// original no existe; se usa el DAC 249x74 con la semántica putico: 0
// transparente, color-5) + 2 segundos y fuera
async function muerte() {
  play('muerto');
  for (let i = 0; i < 3; i++) await poneYsend(E.Hx, E.Hy + 6, 0, 'MUEa');
  for (let i = 0; i < 3; i++) await poneYsend(E.Hx, E.Hy + 10, 0, 'MUEb');
  for (let i = 0; i < 3; i++) await poneYsend(E.Hx, E.Hy + 10, 1, 'MUEb');
  for (let i = 0; i < 3; i++) await poneYsend(E.Hx, E.Hy + 25, 0, 'MUEc');
  for (let i = 0; i < 3; i++) await poneYsend(E.Hx, E.Hy + 25, 1, 'MUEc');
  if (E.gameover) {
    const gx = (320 - 249) >> 1, gy = (176 - 74) >> 1;
    for (let a = 0; a < 74; a++)
      for (let b = 0; b < 249; b++) {
        const v = E.gameover[a * 249 + b];
        if (v !== 0) Pvirtual[(gy + a) * W + gx + b] = Math.max(1, v - 5);
      }
  }
  present();
  await dormir(2000);
  E.salir = true;
}

// picando: animaciones de inactividad (bostezo a los 128 frames, picar
// nariz a los 250; el contador es byte y da la vuelta como en el Pascal)
async function picando() {
  E.vecesparado = (E.vecesparado + 1) & 255;
  if (E.vecesparado > 250 && E.vecesparado < 255) {
    play('pica');
    for (let ronda = 0; ronda < 4; ronda++) {
      E.secuencia = 0;
      do {
        if (E.veces & 1) E.secuencia++;
        await poneYsend(E.Hx + 3, E.Hy, E.secuencia, 'PICA');
      } while (E.secuencia !== DIM.PICA.F - 1);
    }
    E.secuencia = 8;
  } else if (E.vecesparado === 128) {
    E.secuencia = 0;
    while (E.secuencia < DIM.DELAY.F - 1) {
      await poneYsend(E.Hx + 3, E.Hy, E.secuencia, 'DELAY');
      if (E.veces & 1) E.secuencia++;
    }
    for (let i = 0; i < 16; i++) await poneYsend(E.Hx + 3, E.Hy, E.secuencia, 'DELAY');
    await poneYsend(E.Hx + 3, E.Hy, DIM.DELAY.F - 2, 'DELAY');
    E.secuencia = 8;
  }
}

// ponemapa: minimapa completo (se construye una vez; los colores van
// DIRECTOS, sin el -5 de los sprites)
let Vmapa = null;
function ponemapa() {
  if (!Vmapa) {
    Vmapa = new Uint8Array(E.largo * E.alto);
    for (let y = 0; y < E.alto; y++)
      for (let x = 0; x < E.largo; x++) {
        const t = E.caract[y * E.largo + x];
        if (t === SOLIDO) Vmapa[y * E.largo + x] = 200;
        else if (t === BASE) Vmapa[y * E.largo + x] = 145;
        else if (t === MORTAL) Vmapa[y * E.largo + x] = 32;
        else if (t === DESLIZDER) Vmapa[y * E.largo + x] = 183;
        else if (t === DESLIZIZQ) Vmapa[y * E.largo + x] = 120;
      }
  }
  for (let y = 0; y < E.alto; y++)
    for (let x = 0; x < E.largo; x++) {
      const v = Vmapa[y * E.largo + x];
      if (v !== 0) Pvirtual[y * W + x] = v;
    }
  for (const m of E.MALO) {
    const c = m.muertoE ? 111 : 96;
    const px = Math.floor(m.Ex / 16), py = Math.floor(m.Ey / 16) + 2;
    if (px >= 0 && px < W && py >= 0 && py < MAXY) Pvirtual[py * W + px] = c;
  }
  Pvirtual[(E.mapaY + 8) * W + E.mapaX + 10] = 255;
}

// girar de sentido (3 frames de GIRA)
async function gira() {
  let secuencia = 0;
  while (secuencia < DIM.GIRA.F - 1) {
    poneYsend(E.Hx + 3, E.Hy, secuencia, 'GIRA');
    if (E.veces & 1) secuencia++;
    await dormir();
  }
  poneYsend(E.Hx + 3, E.Hy, secuencia, 'GIRA');
  E.secuencia = 8; E.sentido = !E.sentido;
}

// arranca (BEGIN) / para (END)
async function arranca() {
  E.secuencia = 0;
  while (E.secuencia < DIM.BEGIN.F - 1) {
    poneYsend(E.Hx, E.Hy, E.secuencia, 'BEGIN');
    if (E.veces & 1) { E.secuencia++; if (E.sentido) ponefondo(1); else ponefondoATRAS(1); }
    await dormir();
  }
  E.reposo = false; E.secuencia = 0;
}
async function para() {
  E.secuencia = 0;
  while (E.secuencia < DIM.END.F - 1) {
    poneYsend(E.Hx, E.Hy, E.secuencia, 'END');
    if (E.veces & 1) { E.secuencia++; if (E.sentido) ponefondo(1); else ponefondoATRAS(1); }
    await dormir();
  }
  E.reposo = true; E.secuencia = 8;
}

async function derecha() {
  if (!E.sentido) { await gira(); return; }
  E.sentido = true;
  if (E.reposo) await arranca();
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > 7) E.secuencia = 0; }
  ponefondo(1);
}
async function izquierda() {
  if (E.sentido) { await gira(); return; }
  E.sentido = false;
  if (E.reposo) await arranca();
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > 7) E.secuencia = 0; }
  ponefondoATRAS(1);
}

// caída: el mundo sube mientras no haya suelo; BAJAalturas>100 → daño
async function cae() {
  E.cayendo = true; E.secuencia = 0; E.reposo = false;
  let sino = false;
  while (!(await haysuelo())) {
    ponefondoARRIBA(1);
    await dibujarFrame('CAE', E.secuencia, E.Hx, E.Hy);
    if (E.veces & 1) {
      E.secuencia++; if (E.secuencia === 2) break; E.BAJAalturas++;
      if (E.BAJAalturas === 15) { play('ahh'); E.BAJAalturas = 100; }
    }
    await dormir();
  }
  E.secuencia = 2;
  if (E.sentido) ponefondo(1); else ponefondoATRAS(1);
  while (!(await haysuelo())) {
    ponefondoARRIBA(1);
    if (sino) await dibujarFrame('CAE', E.secuencia, E.Hx, E.Hy);
    sino = !sino;
    if (E.veces & 1) {
      E.secuencia++;
      if (E.secuencia === 4) { E.secuencia = 2; E.BAJAalturas++; }
    }
    if (E.mapaY > E.alto) break; // halt(1) del original
    await dormir();
  }
  if (E.BAJAalturas > 100) {
    E.vida -= (E.BAJAalturas - 100); await actualizaVIDA(); play('saltoF');
    let s = 0;
    while (s < DIM.CAID2.F - 1) { poneYsend(E.Hx, E.Hy, s, 'CAID2'); if (E.veces & 1) s++; await dormir(); }
    poneYsend(E.Hx, E.Hy, s, 'CAID2');
  }
  E.cayendo = false; E.secuencia = 0;
}

// ponefondoARRIBA (usado por la caída): el mundo sube 2px. El refill de
// píxeles de las filas 174-175 del original queda tapado por la duna
// (filas 75..175) — invisible; solo se replican el scroll y las coordenadas.
function ponefondoARRIBA(avances) {
  for (let rep = 0; rep < avances; rep++) {
    scrollARRIBA(Pfondo);
    E.PY += 2;
    E.PosEnbaldosaY += 2;
    if (E.PosEnbaldosaY > 15) { E.PosEnbaldosaY = 0; E.mapaY++; }
  }
}

// copiarFila: move32 del original (n bytes de una fila)
function copiarFila(src, dst, n) {
  for (let i = 0; i < n; i++) {
    if (dst + i < Pfondo.length) Pfondo[dst + i] = E.fondo[src + i];
  }
}

// ponefondoABAJO: el mundo baja 2px (cámara sube, al saltar). Refill de las
// filas 0-1 (visibles) con la estructura del original.
function ponefondoABAJO(avances) {
  for (let rep = 0; rep < avances; rep++) {
    if (E.saltando && essolidoUP()) return;
    scrollABAJO(Pfondo);
    E.PY -= 2;
    E.PosEnbaldosaY -= 2;
    if (E.PosEnbaldosaY < 0) { E.PosEnbaldosaY = 14; E.mapaY--; }
    if (E.mapaY < 0) E.mapaY = 0;
    const px = E.PosEnbaldosa, py = E.PosEnbaldosaY;
    let nro = nroBaldosa(E.mapaX, E.mapaY);
    let aux = nro * 256 + px + py * 16;
    copiarFila(aux, 0, 16);           // fila 0 cols 0..15
    copiarFila(aux + 16, W, 16);      // fila 1 cols 0..15
    let resto = 16 - px;
    let col = 16 - px;
    for (let anchura = 0; anchura <= 19; anchura++) {
      const mover = Math.min(320 - resto, 16);
      if (mover > 0) {
        nro = nroBaldosa(E.mapaX + 1 + anchura, E.mapaY);
        aux = nro * 256 + py * 16;
        copiarFila(aux, col, mover);         // fila 0
        copiarFila(aux + 16, W + col, mover); // fila 1
      }
      col += 16; resto += 16;
    }
  }
}

// poneYsend: copia fondo→virtual, duna, sprite y presenta (1 "vez")
async function poneYsend(HX, HY, que, sprite) {
  Pvirtual.set(Pfondo.subarray(0, MAXY * W));
  ponDuna();
  await poneH(HX, HY, que, sprite);
  ponPanel();
  present();
  E.veces++;
}

// dibujarFrame: como poneYsend pero el héroe no pasa sensores (cayendo=true)
async function dibujarFrame(sprite, que, HX, HY) {
  const d = DIM[sprite];
  Pvirtual.set(Pfondo.subarray(0, MAXY * W));
  ponDuna();
  blitSprite(HX, HY, E.hombre.subarray(d.off + d.X * d.Y * que, d.off + d.X * d.Y * (que + 1)), d.X, d.Y, !E.sentido);
  await enemigos();
  ponPanel();
  present();
  E.veces++;
}

// ---------------- duna / panel / present ----------------

function ponDuna() {
  const c = E.ctrduna;
  for (let i = 0; i < 100; i++) {
    const src = i * 640 + c;
    for (let x = 0; x < W; x++) Pvirtual[75 * W + i * W + x] = E.duna[src + x];
  }
  // fila 175 (fila 100 del parallax) queda negra, como el buffer original
}

function ponPanel() {
  Pvirtual.set(E.panel, 175 * W);
  Hline(0, 180, 255, 25 * 4);
  Hline(0, 180, 98, E.vida * 4);
}

function present() {
  const ctx = document.getElementById('lienzo').getContext('2d');
  const img = ctx.createImageData(W, 200);
  const px = img.data;
  for (let i = 0; i < W * 200; i++) {
    const o = Pvirtual[i] * 4;
    px[i * 4] = E.lut[o]; px[i * 4 + 1] = E.lut[o + 1];
    px[i * 4 + 2] = E.lut[o + 2]; px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------- bucle ----------------

// frame: un fotograma del salto (scroll horizontal + vertical + sprite SALTA)
async function frame() {
  const av = E.corriendo ? 2 : 1;
  if (E.sentido) { ponefondo(av); if (E.corriendo) ponefondo(1); }
  else { ponefondoATRAS(av); if (E.corriendo) ponefondoATRAS(1); }
  if (E.secuencia < 4) ponefondoABAJO(av); else ponefondoARRIBA(av);
  const d = DIM.SALTA;
  Pvirtual.set(Pfondo.subarray(0, MAXY * W));
  ponDuna();
  blitSprite(E.Hx - 2, E.Hy - 4, E.hombre.subarray(d.off + d.X * d.Y * E.secuencia, d.off + d.X * d.Y * (E.secuencia + 1)), d.X, d.Y, !E.sentido);
  await enemigos();
  ponPanel();
  present();
  E.veces++;
  await dormir();
}

// salto: 7 frames de SALTA (sube 4, baja 3)
async function salto() {
  E.saltando = true;
  ponefondoABAJO(4);
  for (E.secuencia = 0; E.secuencia < DIM.SALTA.F; E.secuencia++) {
    await frame(); await frame();
    if (E.secuencia === 4 || E.secuencia === 5) await frame();
  }
  E.saltando = false; E.secuencia = 1;
}

// saltoq: salto quieto (ARRIBA sin dirección)
async function saltoq() {
  E.secuencia = 0;
  while (E.secuencia < DIM.SALTQ.F - 1) {
    await poneYsend(E.Hx + 3, E.Hy - 8, E.secuencia, 'SALTQ');
    if (E.veces & 1) E.secuencia++;
  }
  for (let i = 0; i < 4; i++) {
    ponefondoABAJO(1);
    await poneYsend(E.Hx + 3, E.Hy - 8, E.secuencia, 'SALTQ');
  }
}

// carrera (ESPACIO): corre con el sprite CORRE y avanza 4px por frame
function correDER() {
  E.sentido = true;
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > DIM.CORRE.F - 1) E.secuencia = 0; }
  ponefondo(4);
}
function correIZQ() {
  E.sentido = false;
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > DIM.CORRE.F - 1) E.secuencia = 0; }
  ponefondoATRAS(4);
}
async function carrera() {
  const d = DIM.CORRE;
  Pvirtual.set(Pfondo.subarray(0, MAXY * W));
  ponDuna();
  blitSprite(E.Hx, E.Hy + 3, E.hombre.subarray(d.off + d.X * d.Y * E.secuencia, d.off + d.X * d.Y * (E.secuencia + 1)), d.X, d.Y, !E.sentido);
  await enemigos();
  ponPanel();
  present();
  E.veces++;
  if (!E.keys[SC.SPACE]) { E.corriendo = false; E.secuencia = 0; return; }
  if (E.keys[SC.ARR] && (E.keys[SC.DER] || E.keys[SC.IZQ])) { await salto(); return; }
  if (E.keys[SC.DER]) correDER();
  else if (E.keys[SC.IZQ]) correIZQ();
  await dormir();
}

// silencio (ALT): andar de puntillas con ANDA2/BEGIN2/END2
async function silenARRANCA() {
  for (E.secuencia = 0; E.secuencia < DIM.BEGIN2.F; E.secuencia++) {
    if (E.sentido) ponefondo(1); else ponefondoATRAS(1);
    await poneYsend(E.Hx + E.Xcorrecion, E.Hy, E.secuencia, 'BEGIN2');
  }
  E.reposo = false; E.secuencia = 0;
}
async function silenPARA() {
  for (E.secuencia = 0; E.secuencia < DIM.END2.F; E.secuencia++) {
    if (E.sentido) ponefondo(1); else ponefondoATRAS(1);
    await poneYsend(E.Hx + E.Xcorrecion, E.Hy, E.secuencia, 'END2');
  }
  E.reposo = true; E.secuencia = DIM.ANDA2.F - 1;
}
async function silenDER() {
  E.sentido = true;
  if (E.reposo) await silenARRANCA();
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > DIM.ANDA2.F - 2) E.secuencia = 0; }
  ponefondo(1);
}
async function silenIZQ() {
  E.sentido = false;
  if (E.reposo) await silenARRANCA();
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > DIM.ANDA2.F - 2) E.secuencia = 0; }
  ponefondoATRAS(1);
}
async function silencio() {
  E.Xcorrecion = E.sentido ? 2 : 1;
  if (E.reposo) E.secuencia = DIM.ANDA2.F - 1;
  const d = DIM.ANDA2;
  Pvirtual.set(Pfondo.subarray(0, MAXY * W));
  ponDuna();
  blitSprite(E.Hx + E.Xcorrecion, E.Hy, E.hombre.subarray(d.off + d.X * d.Y * E.secuencia, d.off + d.X * d.Y * (E.secuencia + 1)), d.X, d.Y, !E.sentido);
  await enemigos();
  ponPanel();
  present();
  E.veces++;
  if (!E.keys[SC.ALT]) {
    E.puntillas = false;
    if (!E.reposo) await silenPARA();
    E.secuencia = 8;
    return;
  }
  if (E.keys[SC.DER]) await silenDER();
  else if (E.keys[SC.IZQ]) await silenIZQ();
  else if (!E.reposo) await silenPARA();
  await dormir();
}

// agacharse (ABAJO): se agacha con CAID2 y se levanta al soltar
async function agacharse() {
  if (!E.agachado) {
    await poneYsend(E.Hx + 3, E.Hy, 1, 'CAID2');
    await poneYsend(E.Hx + 3, E.Hy, 2, 'CAID2');
    E.agachado = true;
  } else if (!E.keys[SC.ABJ]) {
    E.secuencia = 3;
    while (E.secuencia < DIM.CAID2.F - 1) {
      await poneYsend(E.Hx + 3, E.Hy, E.secuencia, 'CAID2');
      if (E.veces & 1) E.secuencia++;
    }
    await poneYsend(E.Hx + 3, E.Hy, E.secuencia, 'CAID2');
    E.secuencia = 8;
    E.agachado = false;
  } else await poneYsend(E.Hx + 3, E.Hy, 2, 'CAID2');
}

// ---------------- trepar / colgarse ----------------

// borde/borde3: ¿hay repisa delante a la altura de la cabeza y hueco encima?
function borde() {
  const col = (E.sentido ? E.mapaX + 11 : E.mapaX + 9) + (E.PosEnbaldosa > 10 ? 1 : 0);
  const t = caractEn(col, E.mapaY + 5);
  if (t === BASE || t === SOLIDO) {
    const encima = caractEn(E.mapaX + 10 + (E.PosEnbaldosa > 10 ? 1 : 0), E.mapaY + 5);
    return encima === 0;
  }
  return false;
}
function borde3() {
  const col = (E.sentido ? E.mapaX + 11 : E.mapaX + 9) + (E.PosEnbaldosa > 10 ? 1 : 0);
  const t = caractEn(col, E.mapaY + 6);
  if (t === BASE || t === SOLIDO) {
    const encima = caractEn(E.mapaX + 10 + (E.PosEnbaldosa > 10 ? 1 : 0), E.mapaY + 6);
    return encima === 0;
  }
  return false;
}

// colgarse: animación COLG + (de4) sube el mundo 4
async function colgarse(de4) {
  play('up');
  if (de4) ponefondoABAJO(4);
  E.secuencia = 0;
  E.Xcorrecion = E.sentido ? 6 : -7;
  while (E.secuencia < DIM.COLG.F - 1) {
    await poneYsend(E.Hx + E.Xcorrecion, E.Hy - 6, E.secuencia, 'COLG');
    if (E.veces & 1) E.secuencia++;
  }
  await poneYsend(E.Hx + E.Xcorrecion, E.Hy - 6, E.secuencia, 'COLG');
}

// sube: secuencia completa de trepar (SUBa → SUBb → subir mundo → SUBc → SUBd)
async function sube() {
  E.subiendo = true;
  E.secuencia = 0;
  while (E.secuencia < DIM.SUBa.F - 1) {
    await poneYsend(E.Hx, E.Hy - 17, E.secuencia, 'SUBa');
    if (E.veces & 1) E.secuencia++;
  }
  await poneYsend(E.Hx, E.Hy - 17, E.secuencia, 'SUBa');
  E.secuencia = 0;
  while (E.secuencia < DIM.SUBb.F - 1) {
    await poneYsend(E.Hx, E.Hy - 21, E.secuencia, 'SUBb');
    if (E.veces & 1) E.secuencia++;
  }
  ponefondoABAJO(1);
  await poneYsend(E.Hx, E.Hy - 21, E.secuencia, 'SUBb');
  if (E.sentido) ponefondo(2); else ponefondoATRAS(2);
  ponefondoABAJO(7);
  await poneYsend(E.Hx - 3, E.Hy - 10, 0, 'SUBc');
  if (E.sentido) ponefondo(4); else ponefondoATRAS(4);
  E.secuencia = 0;
  while (E.secuencia < DIM.SUBd.F - 1) {
    await poneYsend(E.Hx, E.Hy - 30, E.secuencia, 'SUBd');
    if (E.veces & 1) E.secuencia++;
  }
  await poneYsend(E.Hx, E.Hy - 30, E.secuencia, 'SUBd');
  ponefondoABAJO(16);
  E.subiendo = false;
}

// ---------------- combate ----------------

// intersección de recuadros (fórmula del original)
function hayInterseccion(a, b) {
  const anchura1 = a.x2 - a.x1 + 1, altura1 = a.y2 - a.y1 + 1;
  const anchura2 = b.x2 - b.x1 + 1, altura2 = b.y2 - b.y1 + 1;
  const anchuraMayor = b.y1 > a.y1 ? altura1 : altura2;
  const alturaMayor = b.x1 > a.x1 ? anchura1 : anchura2;
  return (Math.abs(a.x1 - b.x1) < anchuraMayor) && (Math.abs(a.y1 - b.y1) < alturaMayor);
}

async function enguardia() {
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.GUARD.X, y2: E.Hy + DIM.GUARD.Y };
  E.guardia = true;
  play('combat');
  if (!E.sentido) E.Hx -= 7;
  E.secuencia = 0;
  while (E.secuencia < DIM.GUARD.F - 2) {
    await poneYsend(E.Hx, E.Hy + 1, E.secuencia, 'GUARD');
    if (E.veces & 1) E.secuencia++;
  }
  await poneYsend(E.Hx, E.Hy + 1, E.secuencia, 'GUARD');
}

async function noguardia() {
  E.secuencia = DIM.GUARD.F - 2;
  while (E.secuencia > 0) {
    if (E.veces & 1) E.secuencia--;
    await poneYsend(E.Hx, E.Hy + 1, E.secuencia, 'GUARD');
  }
  await poneYsend(E.Hx, E.Hy + 1, E.secuencia, 'GUARD');
  E.guardia = false;
  E.Hx = 155;
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.ANDA.X, y2: E.Hy + DIM.ANDA.Y };
  await para();
}

async function combatGIRA() {
  play('combatG');
  const d = DIM.TGUAR;
  for (E.secuencia = 0; E.secuencia < d.F; E.secuencia++) {
    Pvirtual.set(Pfondo.subarray(0, MAXY * W));
    ponDuna();
    blitSprite(E.Hx - 1, E.Hy + 3, E.hombre.subarray(d.off + d.X * d.Y * E.secuencia, d.off + d.X * d.Y * (E.secuencia + 1)), d.X, d.Y, !E.sentido);
    ponPanel();
    present();
    E.veces++;
    await dormir();
  }
  E.sentido = !E.sentido;
  E.secuencia = DIM.GUARD.F - 2;
}

// dadoSI_NO: el golpe alcanza a los enemigos (por ahora sin IA, solo estructura)
function dadoSI_NO() {
  for (let num = 0; num < E.MALO.length; num++) {
    const m = E.MALO[num];
    const EL = { x1: m.Ex - E.PX, y1: m.Ey - E.PY, x2: m.Ex - E.PX + 23, y2: m.Ey - E.PY + 43 };
    if (m.vidaE > 0 && hayInterseccion(E.YO, EL)) {
      play('puno');
      m.vidaE--;
      if (E.sentido) m.Ex += 15; else m.Ex -= 15;
    }
  }
}

async function punetazo() {
  E.Xcorrecion = E.sentido ? 0 : 9;
  E.secuencia = 0;
  while (E.secuencia < DIM.PUNO.F - 1) {
    await poneYsend(E.Hx - E.Xcorrecion, E.Hy + 2, E.secuencia, 'PUNO');
    if (E.veces & 1) E.secuencia++;
  }
  await poneYsend(E.Hx - E.Xcorrecion, E.Hy + 2, E.secuencia, 'PUNO');
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.PUNO.X, y2: E.Hy + DIM.PUNO.Y };
  dadoSI_NO();
  await poneYsend(E.Hx - E.Xcorrecion, E.Hy + 2, DIM.PUNO.F - 2, 'PUNO');
}

async function patada() {
  E.Xcorrecion = E.sentido ? 6 : 3;
  E.secuencia = 0;
  while (E.secuencia < DIM.PATAD.F - 1) {
    await poneYsend(E.Hx - E.Xcorrecion, E.Hy, E.secuencia, 'PATAD');
    if (E.veces & 1) E.secuencia++;
  }
  await poneYsend(E.Hx - E.Xcorrecion, E.Hy, E.secuencia, 'PATAD');
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.PATAD.X, y2: E.Hy + DIM.PATAD.Y };
  dadoSI_NO();
  await poneYsend(E.Hx - E.Xcorrecion, E.Hy, DIM.PATAD.F - 2, 'PATAD');
}

// combate: el estado de guardia, frame a frame
async function combate() {
  const d = DIM.GUARD;
  Pvirtual.set(Pfondo.subarray(0, MAXY * W));
  ponDuna();
  blitSprite(E.Hx, E.Hy + 1, E.hombre.subarray(d.off + d.X * d.Y * E.secuencia, d.off + d.X * d.Y * (E.secuencia + 1)), d.X, d.Y, !E.sentido);
  await enemigos();
  ponPanel();
  present();
  E.veces++;
  if (!E.keys[SC.CTRL]) await noguardia();
  else if (E.keys[SC.DER] && !E.sentido) await combatGIRA();
  else if (E.keys[SC.IZQ] && E.sentido) await combatGIRA();
  else if (E.keys[SC.ALT]) {
    if (E.keys[SC.ABJ]) await patada();
    else await punetazo();
  }
}

// ---------------- enemigos ----------------

// E_putico / E_puticoatras: sprites de enemigo (espejo con el desfase del
// original en E_puticoatras: primer byte se lee fuera del sprite = 0)
function E_putico(PEx, PEy, datos, X, Y) {
  for (let a = 0; a < Y; a++)
    for (let b = 0; b < X; b++) {
      const v = datos[a * X + b];
      if (v !== 0) putPixel(PEx + b, PEy + a, v - 5);
    }
}
function E_puticoatras(PEx, PEy, datos, X, Y) {
  let off = X * Y;
  for (let a = Y - 1; a >= 0; a--)
    for (let b = 0; b < X; b++) {
      const v = off < X * Y ? datos[off] : 0;
      if (v !== 0) putPixel(PEx + b, PEy + a, v - 5);
      off--;
    }
}

// poneE: enemigo de coordenadas mundo a pantalla (recorte de 50/320/40/176)
function poneE(PEx, PEy, que, sprite) {
  const d = DIM[sprite];
  const x = PEx - E.PX, y = PEy - E.PY;
  if (x < -50 || x > 320 || y < -40 || y > 176) return;
  const datos = E.hombre.subarray(d.off + d.X * d.Y * que, d.off + d.X * d.Y * (que + 1));
  if (E.MALO[E.num].sentidoE) E_putico(x, y, datos, d.X, d.Y);
  else E_puticoatras(x, y, datos, d.X, d.Y);
}

function E_haysuelo() {
  const m = E.MALO[E.num];
  const col = Math.floor(m.Ex / 16) + (m.Ex % 16 > 10 ? 1 : 0);
  const t = caractEn(col, Math.floor(m.Ey / 16) + 3);
  return t === BASE || t === SOLIDO || t === MORTAL;
}
function haysueloNEXT() {
  const m = E.MALO[E.num];
  let col = Math.floor(m.Ex / 16) + (m.Ex % 16 > 10 ? 1 : 0);
  if (m.sentidoE) col++; else col--;
  const t = caractEn(col, Math.floor(m.Ey / 16) + 3);
  return t === BASE || t === SOLIDO;
}

function E_cae() {
  const m = E.MALO[E.num];
  m.Ey += 4;
  m.E_ctrlcaida++;
  if (m.E_ctrlcaida === 3) m.ecae = false;
  poneE(m.Ex, m.Ey, 0, 'CAE');
}

function E_salta() {
  const m = E.MALO[E.num];
  if (E.veces & 1) {
    if (m.sentidoE) m.Ex += 6; else m.Ex -= 6;
    if (m.secuenciaE === 4 || m.secuenciaE === 5) {
      if (m.sentidoE) m.Ex += 4; else m.Ex -= 4;
    }
    if (m.secuenciaE < DIM.SALTA.F - 1) m.secuenciaE++;
    else m.esaltando = false;
  }
  poneE(m.Ex - 2, m.Ey - 4, m.secuenciaE, 'SALTA');
}

function E_noguardia() {
  const m = E.MALO[E.num];
  m.noguardia = true;
  poneE(m.Ex, m.Ey + 1, m.secuenciaE, 'GUARD');
  if (E.veces & 1) {
    if (m.secuenciaE !== 0) m.secuenciaE--;
    else { m.secuenciaE = 0; m.noguardia = false; }
  }
}

function E_Guardia() {
  const m = E.MALO[E.num];
  poneE(m.Ex, m.Ey + 1, m.secuenciaE, 'GUARD');
  if (E.veces & 1) {
    if (m.secuenciaE !== DIM.GUARD.F - 2) m.secuenciaE++;
    else { m.ataca = true; m.secuenciaE = 0; }
  }
}

async function E_ataca() {
  const m = E.MALO[E.num];
  const OX = m.Ex - E.PX, OY = m.Ey - E.PY;
  const excorrecion = m.sentidoE ? 0 : 9;
  if (E.recibiendo) { poneE(m.Ex - excorrecion, m.Ey + 2, m.secuenciaE, 'PUNO'); return; }
  if (E.veces & 1) {
    if (m.secuenciaE !== DIM.PUNO.F - 1) m.secuenciaE++;
    else m.secuenciaE--;
  }
  poneE(m.Ex - excorrecion, m.Ey + 2, m.secuenciaE, 'PUNO');
  if (m.secuenciaE === DIM.PUNO.F - 1 && E.vida > 0) {
    const EL = { x1: OX, y1: OY, x2: OX + DIM.PUNO.X, y2: OY + DIM.PUNO.Y };
    if (E.vida > 0 && hayInterseccion(E.YO, EL)) {
      E.vida--; await actualizaVIDA(); play('golpe1'); E.recibiendo = true;
      let scorreccion;
      if (m.sentidoE) { ponefondo(2); scorreccion = 33; }
      else { ponefondoATRAS(2); scorreccion = -33; }
      // knockback + sangre (5 frames, como el original)
      for (let distancia = 0; distancia <= 4; distancia++) {
        Pvirtual.set(Pfondo.subarray(0, MAXY * W));
        ponDuna();
        await poneH(E.Hx, E.Hy, 3, 'GUARD');
        await poneH(E.Hx + scorreccion, E.Hy + 13, distancia, 'SANGRE');
        ponPanel();
        present();
        E.veces++;
        await dormir();
      }
      E.recibiendo = false;
      return;
    }
  }
  if (!(((OX > E.Hx) && (OX - 30 <= E.Hx)) || ((OX < E.Hx) && (OX + 30 >= E.Hx)))) {
    E_noguardia(); m.secuenciaE = DIM.GUARD.F - 2; m.ataca = false; m.Aguardia = false;
  } else if (E.Hy !== OY) { m.ataca = false; m.Aguardia = false; }
}

function E_muerte() {
  const m = E.MALO[E.num];
  if (E.veces & 1) m.secuenciaE++;
  switch (m.secuenciaE) {
    case 0: play('golpe0'); poneE(m.Ex, m.Ey + 6, 0, 'MUEa'); break;
    case 1: poneE(m.Ex, m.Ey + 10, 0, 'MUEb'); break;
    case 2: poneE(m.Ex, m.Ey + 10, 1, 'MUEb'); break;
    case 3: poneE(m.Ex, m.Ey + 25, 0, 'MUEc'); break;
    case 4: poneE(m.Ex, m.Ey + 25, 1, 'MUEc'); break;
    default: m.muertoE = true;
  }
}

// MOVenemigo: la máquina de estados de cada enemigo (patrulla/guardia/ataque)
async function MOVenemigo() {
  const m = E.MALO[E.num];
  if (!m.muertoE) {
    if (m.vidaE <= 0) { E_muerte(); return; }
    if (m.esaltando) { E_salta(); return; }
    if (m.ecae) { E_cae(); return; }
    if (!E_haysuelo()) { m.E_ctrlcaida = 0; m.ecae = true; E_cae(); return; }
    if (m.ataca) { await E_ataca(); return; }
    if (m.Aguardia) { E_Guardia(); return; }
    if (m.noguardia) { E_noguardia(); return; }
    // busca: si está a mi altura, me sigue; si no, patrulla Ex<->Oex
    const OX = m.Ex - E.PX, OY = m.Ey - E.PY;
    if (OY === E.Hy) {
      if (OX > E.Hx) {
        m.sentidoE = false;
        if (OX - 15 <= E.Hx && haysueloNEXT()) {
          m.Aguardia = true; if (!m.sentidoE) m.Ex -= 7; m.secuenciaE = 0; return;
        }
        if (haysueloNEXT()) { m.Ex -= 2; m.ereposo = false; }
        else if (E_haysuelo()) { m.esaltando = true; m.secuenciaE = 0; return; }
      } else {
        m.sentidoE = true;
        if (OX + 15 >= E.Hx && haysueloNEXT()) {
          m.Aguardia = true; if (!m.sentidoE) m.Ex -= 7; m.secuenciaE = 0; return;
        }
        if (haysueloNEXT()) { m.Ex += 2; m.ereposo = false; }
        else { m.esaltando = true; m.secuenciaE = 0; return; }
      }
    } else {
      if (Math.abs(m.Ex - m.Oex) > 5) {
        if (m.Ex > m.Oex) { m.Ex -= 2; m.ereposo = false; m.sentidoE = false; }
        else { m.Ex += 2; m.ereposo = false; m.sentidoE = true; }
      } else m.ereposo = true;
    }
    if (E.veces & 1) { m.secuenciaE++; if (m.secuenciaE > 7) m.secuenciaE = 0; }
    if (m.ereposo) m.secuenciaE = 8;
    poneE(m.Ex, m.Ey, m.secuenciaE, 'ANDA');
  } else poneE(m.Ex, m.Ey + 25, 1, 'MUEc');
}

async function tick() {
  if (E.salir) return;
  // guarda del repeat del original: dibujo + input solo en estado normal
  if (!E.guardia && !E.puntillas && !E.cayendo && !E.corriendo && !E.agachado) {
    Pvirtual.set(Pfondo.subarray(0, MAXY * W));
    ponDuna();
    await poneH(E.Hx, E.Hy, E.secuencia, 'ANDA');
    if (E.secuencia === 4) play('paso1');
    else if (E.secuencia === 0) play('paso2');
    ponPanel();
    present();
    E.veces++;
    // input (despacho del repeat del original)
    if (E.keys[SC.ARR] && (E.keys[SC.DER] || E.keys[SC.IZQ])) await salto();
    else if (E.keys[SC.SPACE]) { E.corriendo = true; E.secuencia = 0; }
    else if (E.keys[SC.DER] && !E.keys[SC.IZQ]) await derecha();
    else if (E.keys[SC.IZQ] && !E.keys[SC.DER]) await izquierda();
    else if (E.keys[SC.ABJ]) await agacharse();
    else if (E.keys[SC.CTRL]) await enguardia();
    else if (E.keys[SC.ALT]) { E.puntillas = true; E.secuencia = 0; }
    else if (E.keys[SC.ARR]) {
      if (borde()) { E.subiendo = true; await saltoq(); await colgarse(true); await sube(); }
      else if (borde3()) { E.subiendo = true; await colgarse(false); await sube(); }
      else { E.subiendo = true; await saltoq(); E.subiendo = false; }
    } else if (E.keys[SC.TAB]) { E.mapeado = !E.mapeado; await dormir(100); }
    else if (!E.reposo) await para();
    else await picando();
  } else if (E.corriendo) await carrera();
  else if (E.guardia) await combate();
  else if (E.puntillas) await silencio();
  else if (E.agachado) await agacharse();
}

// teclado: KeyTable por scancode (POLL.PAS)
function initTeclado() {
  const map = {
    Escape: SC.ESC, Tab: SC.TAB, ControlLeft: SC.CTRL, ControlRight: SC.CTRL,
    AltLeft: SC.ALT, Space: SC.SPACE, ArrowUp: SC.ARR, ArrowLeft: SC.IZQ,
    ArrowRight: SC.DER, ArrowDown: SC.ABJ, KeyT: SC.T,
  };
  window.addEventListener('keydown', (e) => {
    if (map[e.code] !== undefined) { E.keys[map[e.code]] = 1; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (map[e.code] !== undefined) E.keys[map[e.code]] = 0;
  });
}

// ---------------- boot ----------------

async function fetchBuf(name) {
  const r = await fetch('assets/' + name);
  if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// cargarGameOver: decodifica GAME.DAC (RLE: c&192==192 → run c&63 + valor)
async function cargarGameOver() {
  try {
    const r = await fetch('assets/GAME.DAC');
    if (!r.ok) return;
    const b = new Uint8Array(await r.arrayBuffer());
    const bytes = b[4] | (b[5] << 8), alto = b[2] | (b[3] << 8);
    const pix = new Uint8Array(249 * alto); // 249 útiles por fila (Xmax)
    let ctrl = 7, off = 0;
    for (let i = 0; i < alto; i++) {
      let n = 0;
      while (n < bytes) {
        const c = b[ctrl++];
        if ((c & 192) === 192) {
          const run = c & 63, v = b[ctrl++];
          const fin = Math.min(off + run, (i + 1) * 249);
          pix.fill(v, off, fin); off = fin; n += run;
        } else { if (off < (i + 1) * 249) pix[off++] = c; n++; }
      }
    }
    E.gameover = pix;
  } catch (e) { /* sin GAME.DAC el héroe muere sin pantalla de game over */ }
}

async function boot() {
  const [pal, mapaB, fondo, hombre, duna, panel, enemigos] = await Promise.all([
    fetchBuf('PALETA.L01'), fetchBuf('MAPA.DAT'), fetchBuf('FONDO.DAT'),
    fetchBuf('HOMBRE.DAT'), fetchBuf('DUNA2.DAT'), fetchBuf('PANEL.DAT'),
    fetchBuf('ENEMIGO.DAT'),
  ]);
  for (let i = 0; i < 256; i++) {
    const r = pal[i * 3], g = pal[i * 3 + 1], b = pal[i * 3 + 2];
    E.lut[i * 4] = (r << 2) | (r >> 4);
    E.lut[i * 4 + 1] = (g << 2) | (g >> 4);
    E.lut[i * 4 + 2] = (b << 2) | (b >> 4);
    E.lut[i * 4 + 3] = 255;
  }
  E.largo = mapaB[0] | (mapaB[1] << 8);
  E.alto = mapaB[2] | (mapaB[3] << 8);
  const celdas = E.largo * E.alto;
  E.mapa = new Uint16Array(mapaB.buffer, mapaB.byteOffset + 4, celdas);
  E.caract = mapaB.subarray(4 + celdas * 2, 4 + celdas * 3);
  E.fondo = fondo; E.duna = duna; E.panel = panel;
  let off = 0;
  for (const [nombre, X, Y, F] of SPRITES) { DIM[nombre] = { X, Y, F, off }; off += X * Y * F; }
  E.hombre = hombre;
  // enemigos: 10 × (Ex, Ey) u16 (el resto del .DAT es de la versión antigua)
  for (let i = 0; i < 10; i++) {
    const Ex = enemigos[i * 4] | (enemigos[i * 4 + 1] << 8);
    const Ey = enemigos[i * 4 + 2] | (enemigos[i * 4 + 3] << 8);
    E.MALO.push({
      Ex, Ey, Oex: Ex, vidaE: 5, secuenciaE: 0, E_ctrlcaida: 0,
      sentidoE: false, Aguardia: false, noguardia: false, ataca: false,
      ereposo: false, esaltando: false, ecae: false, muertoE: false,
    });
  }
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.ANDA.X, y2: E.Hy + DIM.ANDA.Y };

  // fondo_completo (arranque: mapaX=0, mapaY=1)
  let py = 0;
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 20; j++) {
      const nro = E.mapa[(E.mapaY + i) * E.largo + E.mapaX + j];
      const tile = nro * 256;
      for (let k = 0; k < 16; k++)
        Pfondo.set(fondo.subarray(tile + k * 16, tile + k * 16 + 16), (py + k) * W + j * 16);
    }
    py += 16;
  }

  initTeclado();
  window.__E = E; // diagnóstico por CDP
  cargarSonido().catch(() => {}); // sin SONIDO.DAT el juego sigue mudo
  cargarGameOver(); // sin GAME.DAC el héroe muere sin pantalla de game over
  // WebAudio se desbloquea con el primer gesto (política de los navegadores)
  const unlock = () => { desbloquear(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  await poneYsend(E.Hx, E.Hy, E.secuencia, 'ANDA');
  // bucle: 1 tick por frame (60 fps); los bucles bloqueantes del original
  // (caída, arrancar...) duermen su frame por iteración dentro de tick.
  // En modo test (acelerado) no arranca: el test llama a tick() a mano.
  if (!E.acelerado) {
    while (!E.salir) {
      await tick();
      await dormir();
    }
  }
}

boot().catch((err) => { console.error(err); document.body.textContent = 'ERROR: ' + err; });

export { E, Pvirtual, Pfondo, tick, salto, frame, cae, ponefondoABAJO, ponefondoARRIBA, actualizaVIDA };

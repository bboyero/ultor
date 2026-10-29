// ULTOR — port JavaScript. Hito 2: movimiento (andar, girar, caer) con el
// scroll del mundo fiel a JUEGO.PAS. El héroe está casi fijo (Hx=155):
// es el MUNDO el que se desplaza (PX/PY + PosEnbaldosa + mapaX/mapaY).

const W = 320, MAXY = 176, PANEL_Y = 175;
const maxParallax = 101;

import { cargarSonido, play, desbloquear } from './sonido.js';
import { initTouch } from './entrada-tactil.js';
import { pararMusica, empezarMusica } from './musica.js';
import { cargarDACs, creditos, presentacion, windows, config, opciones,
  pausa, abandonar, final, muertePantalla, fadeOUT, fadeIN, ponPaleta,
  mostrarDAC } from './menus.js';

// Scancodes (POLL.PAS KeyTable)
const SC = {
  P: 0x19,
  ESC: 0x01, TAB: 0x0F, CTRL: 0x1D, ALT: 0x38, SPACE: 0x39,
  ARR: 0x48, IZQ: 0x4B, DER: 0x4D, ABJ: 0x50, T: 0x14,
};
// Tiles (JUEGO.PAS)
const BASE = 1, SOLIDO = 2, MORTAL = 3, DESLIZDER = 4, DESLIZIZQ = 5;

// Dimensiones de los sprites de HOMBRE.DAT en el orden exacto de carga()
const SPRITES = [
  // orden EXACTO de carga() del BACKUP (suma = 179237 = HOMBRE.DAT completo)
  ['ANDA', 24, 43, 9], ['GIRA', 18, 43, 3], ['BEGIN', 23, 43, 3],
  ['END', 23, 43, 3], ['SALTA', 28, 47, 7], ['GUARD', 31, 42, 3],
  ['TGUAR', 34, 40, 5], ['END2', 21, 43, 3], ['BEGIN2', 21, 43, 3],
  ['PICA', 18, 43, 2], ['PUNO', 41, 41, 3], ['DELAY', 18, 43, 3],
  ['CORRE', 34, 43, 9], ['CAE', 24, 47, 4], ['CAID2', 20, 43, 7],
  ['SALTQ', 23, 51, 8], ['COLG', 19, 49, 7], ['SUBa', 20, 56, 5],
  ['SUBb', 28, 47, 2], ['SUBc', 38, 33, 1], ['SUBd', 17, 41, 3],
  ['PATAD', 40, 43, 5], ['MUEa', 38, 37, 1], ['MUEb', 40, 33, 2],
  ['MUEc', 53, 18, 2], ['CEND', 28, 43, 4], ['REC1', 31, 42, 3],
  ['REC4', 42, 40, 3], ['PAT1', 45, 43, 8], ['PAT2', 56, 42, 7],
  ['AVAN', 22, 42, 3], ['PAT3', 52, 43, 4], ['REC2', 25, 43, 4],
];
const DIM = {}; // nombre -> {X, Y, F, off}
// sprites de los MALOS (ENEMIGO.DAT: 2 clases × 48683 B)
const MALOSPRITES = [
  ['REC1e', 31, 42, 3], ['REC4e', 42, 40, 3], ['PUNOe', 41, 41, 3],
  ['MUEae', 38, 37, 1], ['MUEbe', 41, 33, 2], ['MUECe', 53, 18, 2],
  ['ANDAe', 24, 43, 9], ['GUARDe', 31, 42, 3], ['PAT1e', 52, 43, 5],
  ['REC2e', 25, 43, 4],
];
const CLASE_OFF = 48683; // offset de la clase 1 en ENEMIGO.DAT
const DIME = {}; // offsets relativos dentro de cada clase

const E = {
  paleta: new Uint8Array(768), lut: new Uint8Array(256 * 4),
  mapa: null, caract: null, largo: 0, alto: 0,
  fondo: null, hombre: null, duna: null, panel: null,
  // estado del juego (valores de arranque del original)
  mapaX: 0, mapaY: 2, PX: 0, PY: 32,
  PosEnbaldosa: 0, PosEnbaldosaY: 0,
  Hx: 155, Hy: 117 - 16, vida: 25,
  secuencia: 8, reposo: true, sentido: true,
  saltando: false, cayendo: false, subiendo: false,
  corriendo: false, guardia: false, puntillas: false, agachado: false,
  ctrduna: 0, Movfondo: false, BAJAalturas: 0,
  veces: 0, salir: false, keys: new Uint8Array(128),
  Xcorrecion: 0,
  YO: null,          // recuadro del héroe para las intersecciones de combate
  MALO: [],          // los 10 enemigos (Ex, Ey, Oex, vidaE...)
  num: 0,            // enemigo en curso (como la variable global del Pascal)
  recibiendo: false, // el héroe acaba de recibir (no le pegan dos veces seguidas)
  atacando: false,   // el héroe está dando un golpe
  tmp_recibe: 0,     // tipo de golpe que he dado (0 puño, 1 patada, 3 barriga)
  mapeado: false,    // minimapa (TAB)
  vecesparado: 0,    // frames de inactividad (bostezo a 128, picar a 250)
  puntos: 0,         // marcadores (puntos por golpes y enemigos)
  cronometro: 0,     // cuenta segundos (maxtime=1000 ≈ 16,7 min)
  aleatorio: 1234,   // LCG de como_me_dara (qué golpe me dará el enemigo)
  enemigo: null,     // ENEMIGO.DAT crudo (sprites de los malos, 2 clases)
  ultimaAC: -1,      // (cronometro div 16) del último repintado del crono
  MALOSmuertos: 0,
  numero: null,      // NUMERO.DAT: 10 dígitos de 8x8 (64 B cada uno)
  gameover: null,    // GAME.DAC decodificado (249x74) para la muerte
  acelerado: false, // tests de Node: los bucles de animación no duermen
  fps: 26,          // frames_por_seg del BACKUP (configurable 0..64 en config)
  fase: '',         // diagnóstico del flujo (creditos/present/windows/juego)
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
// scrollABAJO: el mundo baja 2 filas (cámara sube). El original solo movía
// las filas IMPARES (bug "peine" que dejaba líneas horizontales visibles);
// aquí se desplazan todas y el refill de ponefondoABAJO cubre las filas 0-1.
function scrollABAJO(p) {
  for (let y = MAXY - 1; y >= 2; y--) p.copyWithin(y * W, (y - 2) * W, (y - 2) * W + W);
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
    dst += W * (15 - py + 1); // el Pascal suma esto porque su ASM no movía
                              // la variable; MI ponbaldosa ya avanza dst
    dst -= W * (15 - py + 1); // → compensar (neto: sin doble avance)
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
    dst -= W * (15 - py + 1); // compensar (neto: sin doble avance)
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
    if (E.PosEnbaldosaY !== 0) { E.BAJAalturas = 0; await cae(); return; }
    if (t === 0) { E.BAJAalturas = 0; await cae(); return; }
    if (t === MORTAL) { E.vida = 0; await actualizaVIDA(); }
    else if (t === DESLIZDER) { ponefondo(2); return; }
    else if (t === DESLIZIZQ) { ponefondoATRAS(2); return; }
    else if (t === 255) { await final(); } // salida: la baldosa de salida del nivel
  }
  for (E.num = 0; E.num < E.MALO.length; E.num++) await MOVenemigo();
}

// enemigos: el bucle MOVenemigo del original, para las rutas que no pasan
// por poneH (frame, carrera, combate, silencio, caída)
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
  await muertePantalla(); // GAME.DAC + espera + fundido (BACKUP muerte())
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

// ponefondoARRIBA (usado por la caída): el mundo sube 2px y se rellenan las
// filas 174-175 (visibles con la duna arriba, como en el BACKUP)
function ponefondoARRIBA(avances) {
  for (let rep = 0; rep < avances; rep++) {
    scrollARRIBA(Pfondo);
    E.PY += 2;
    const px = E.PosEnbaldosa, py = E.PosEnbaldosaY;
    // primera baldosa: filas 174-175 cols 0..15 (filas py y py+1 de la baldosa)
    let nro = nroBaldosa(E.mapaX, E.mapaY + 11);
    let aux = nro * 256 + px + py * 16;
    copiarFila(aux, 174 * W, 16);            // fila 174 cols 0..15
    copiarFila(aux + 16, 175 * W, 16);       // fila 175 cols 0..15
    let resto = 16 - px;
    let col = 16 - px;
    for (let anchura = 0; anchura <= 19; anchura++) {
      const mover = Math.min(320 - resto, 16);
      if (mover > 0) {
        nro = nroBaldosa(E.mapaX + 1 + anchura, E.mapaY + 11);
        aux = nro * 256 + py * 16;
        copiarFila(aux, 174 * W + col, mover);           // fila 174
        copiarFila(aux + 16, 175 * W + col, mover);      // fila 175
      }
      col += 16; resto += 16;
    }
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
  // BACKUP: parallaxDES = Pvirtual (¡la duna va ARRIBA, filas 0..100!) y
  // solo se dibuja si mapaY < profundo (8): en las cloacas profundas no hay cielo
  if (E.mapaY >= 8) return;
  const c = E.ctrduna;
  for (let i = 0; i < 100; i++) {
    const src = i * 640 + c;
    for (let x = 0; x < W; x++) Pvirtual[i * W + x] = E.duna[src + x];
  }
  // fila 100 (fila 100 del parallax) queda negra, como el buffer original
}

function ponPanel() {
  // PANEL.DAC en (0,176) con semántica putico (0 transparente, color-5)
  for (let a = 0; a < 24; a++)
    for (let b = 0; b < W; b++) {
      const v = E.panel[a * W + b];
      if (v !== 0) Pvirtual[(176 + a) * W + b] = Math.max(1, v - 5);
    }
  // vida: 4 filas en y=190, color por vida div 5 (BACKUP actualizaVIDA)
  const colores = [32, 59, 69, 84, 96, 96];
  const cv = colores[Math.min(5, (E.vida / 5) | 0)];
  for (let i = 0; i < 4; i++) { Hline(1, 190 + i, 255, 100); Hline(1, 190 + i, cv, E.vida * 4); }
  // crono: 4 filas en y=190, x=104, maxtime=1000 (BACKUP actualizaCRONO)
  for (let i = 0; i < 4; i++) {
    Hline(104, 190 + i, 255, 62);
    Hline(104, 190 + i, 145, ((1000 - E.cronometro) / 16) | 0);
  }
  // vida del enemigo actual: 4 filas en y=195 (BACKUP actualizaVIDA_E)
  const ve = E.num < E.MALO.length ? Math.max(0, E.MALO[E.num].vidaE) : 0;
  for (let i = 0; i < 4; i++) { Hline(1, 195 + i, 255, 100); Hline(1, 195 + i, 145, ve * 4); }
  // marcadores: puntos en (225,188) con NUMERO.DAT (dígitos 8x8, -5 como los sprites)
  if (E.numero) {
    let s = String(E.puntos);
    while (s.length < 8) s = '0' + s;
    for (let i = 0; i < 8; i++) {
      const ch = s.charCodeAt(i) - 48;
      if (ch < 0 || ch > 9) continue;
      for (let a = 0; a < 8; a++)
        for (let b = 0; b < 8; b++) {
          const v = E.numero[ch * 64 + a * 8 + b];
          if (v !== 0) Pvirtual[(188 + a) * W + 225 + 8 * i + b] = v - 5;
        }
    }
  }
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
  E.sentido = true; E.reposo = false;
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > DIM.CORRE.F - 2) E.secuencia = 0; }
  ponefondo(4);
}
function correIZQ() {
  E.sentido = false; E.reposo = false;
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > DIM.CORRE.F - 2) E.secuencia = 0; }
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
  if (!E.keys[SC.SPACE]) { E.corriendo = false; E.secuencia = 8; E.reposo = true; return; }
  if (E.keys[SC.ARR] && (E.keys[SC.DER] || E.keys[SC.IZQ])) { await salto(); return; }
  if (E.keys[SC.DER]) correDER();
  else if (E.keys[SC.IZQ]) correIZQ();
  else if (!E.reposo) await correPARA();
  await dormir();
}
// correPARA: animación CEND al parar de correr (BACKUP)
async function correPARA() {
  E.secuencia = 0;
  while (E.secuencia <= DIM.CEND.F - 1) {
    await poneYsend(E.Hx, E.Hy, E.secuencia, 'CEND');
    if (E.veces & 1) { E.secuencia++; if (E.sentido) ponefondo(1); else ponefondoATRAS(1); }
  }
  E.reposo = true; E.secuencia = 8;
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

// actualizaVIDA_E: barra de vida del enemigo actual (y=186)
function actualizaVIDA_E() {
  Hline(0, 186, 0, 5 * 4);
  Hline(0, 186, 145, E.MALO[E.num].vidaE * 4);
}

// dadoSI_NO(dano): el golpe alcanza a los enemigos (BACKUP)
function dadoSI_NO(dano) {
  for (let num = 0; num < E.MALO.length; num++) {
    const m = E.MALO[num];
    const EL = { x1: m.Ex - E.PX, y1: m.Ey - E.PY, x2: m.Ex - E.PX + 23, y2: m.Ey - E.PY + 43 };
    if (m.vidaE > 0 && hayInterseccion(E.YO, EL) && !m.Erecibiendo) {
      play('puno');
      m.tipo_recibe = E.tmp_recibe;
      m.Erecibiendo = true; m.secuenciaE = 0;
      m.vidaE -= dano; actualizaVIDA_E();
      if (E.sentido) incENE(8 * dano); else decENE(8 * dano);
      E.puntos += dano * 8;
    }
  }
}

// incENE/decENE: el enemigo retrocede comprobando el suelo
function incENE(cuantos) {
  const m = E.MALO[E.num];
  for (let i = 1; i <= (cuantos / 2) | 0; i++) {
    const col = Math.floor(m.Ex / 16) + 1;
    const fila = Math.floor(m.Ey / 16) + 3;
    const t = caractEn(col, fila);
    if (!(t === BASE || t === SOLIDO)) break;
    if (caractEn(col, fila - 1) === SOLIDO) break;
    m.Ex += 2;
  }
}
function decENE(cuantos) {
  const m = E.MALO[E.num];
  for (let i = 1; i <= (cuantos / 2) | 0; i++) {
    const col = Math.floor(m.Ex / 16);
    const fila = Math.floor(m.Ey / 16) + 3;
    const t = caractEn(col, fila);
    if (!(t === BASE || t === SOLIDO)) break;
    if (caractEn(col, fila - 1) === SOLIDO) break;
    m.Ex -= 2;
  }
}

// recibe(tipo): YO recibo un golpe (0 puñetazo REC1 -1, 3 barriga REC2 -2)
async function recibe(tipo) {
  E.recibiendo = true;
  let PTRO, recX, recY, recF, corrige;
  if (tipo === 0) {
    PTRO = 'REC1'; recX = DIM.REC1.X; recY = DIM.REC1.Y; recF = DIM.REC1.F;
    E.vida--; await actualizaVIDA(); play('golpe1'); corrige = 1;
  } else {
    PTRO = 'REC2'; recX = DIM.REC2.X; recY = DIM.REC2.Y; recF = DIM.REC2.F;
    E.vida -= 2; await actualizaVIDA(); play('golpe2'); corrige = 0;
  }
  if (E.MALO[E.num].sentidoE) ponefondo(3);
  else ponefondoATRAS(3);
  const sectmp = E.secuencia;
  E.secuencia = 0;
  while (E.secuencia <= recF - 1) {
    await poneYsend(E.Hx, E.Hy + corrige, E.secuencia, PTRO);
    if (E.veces & 1) E.secuencia++;
  }
  E.secuencia = sectmp; E.recibiendo = false;
}

async function punetazo() {
  E.atacando = true;
  let ajst;
  if (!E.sentido) { E.Xcorrecion = -9; ajst = 0; }
  else { E.Xcorrecion = 0; ajst = 25; }
  E.secuencia = 0;
  while (E.secuencia <= DIM.PUNO.F - 1) {
    await poneYsend(E.Hx + E.Xcorrecion, E.Hy + 2, E.secuencia, 'PUNO');
    if (E.veces & 1) E.secuencia++;
  }
  E.YO = { x1: E.Hx + E.Xcorrecion + ajst, y1: E.Hy + 6,
           x2: E.Hx + E.Xcorrecion + ajst + DIM.PUNO.X - 25, y2: E.Hy + 6 + DIM.PUNO.Y - 35 };
  E.tmp_recibe = 0; dadoSI_NO(1);
  await poneYsend(E.Hx + E.Xcorrecion, E.Hy + 2, DIM.PUNO.F - 2, 'PUNO');
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.GUARD.X, y2: E.Hy + DIM.GUARD.Y };
  E.secuencia = 2; E.reposo = true; E.atacando = false;
}

async function patada() { // arriba, dano 2
  E.atacando = true;
  let ajst;
  if (!E.sentido) { E.Xcorrecion = -3; ajst = 0; }
  else { E.Xcorrecion = -6; ajst = 25; }
  E.secuencia = 0;
  while (E.secuencia <= DIM.PATAD.F - 1) {
    await poneYsend(E.Hx + E.Xcorrecion, E.Hy, E.secuencia, 'PATAD');
    if (E.veces & 1) E.secuencia++;
    if (E.secuencia === 3) {
      E.YO = { x1: E.Hx + E.Xcorrecion + ajst, y1: E.Hy,
               x2: E.Hx + E.Xcorrecion + ajst + DIM.PATAD.X - 25, y2: E.Hy + DIM.PATAD.Y - 25 };
      E.tmp_recibe = 1; dadoSI_NO(2);
    }
  }
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.GUARD.X, y2: E.Hy + DIM.GUARD.Y };
  E.secuencia = 2; E.reposo = true; E.atacando = false;
}

async function patada1() { // arriba con giro, dano 3
  E.atacando = true;
  let ajst;
  if (!E.sentido) { E.Xcorrecion = -13; ajst = 0; }
  else { E.Xcorrecion = 0; ajst = 25; }
  E.secuencia = 0;
  while (E.secuencia <= DIM.PAT1.F - 1) {
    await poneYsend(E.Hx + E.Xcorrecion, E.Hy, E.secuencia, 'PAT1');
    if (E.veces & 1) E.secuencia++;
    if (E.secuencia === 3) {
      E.YO = { x1: E.Hx + E.Xcorrecion + ajst, y1: E.Hy,
               x2: E.Hx + E.Xcorrecion + ajst + DIM.PAT1.X - 25, y2: E.Hy + DIM.PAT1.Y - 25 };
      E.tmp_recibe = 1; dadoSI_NO(3);
    }
  }
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.GUARD.X, y2: E.Hy + DIM.GUARD.Y };
  E.secuencia = 2; E.reposo = true; E.atacando = false;
}

async function patada2() { // barrido, dano 1
  E.atacando = true;
  let ajst;
  if (!E.sentido) { E.Xcorrecion = -13; ajst = 0; }
  else { E.Xcorrecion = 0; ajst = 30; }
  E.secuencia = 0;
  await poneYsend(E.Hx + E.Xcorrecion, E.Hy, 0, 'PAT1'); // 1er frame = pat1
  while (E.secuencia <= DIM.PAT2.F - 1) {
    await poneYsend(E.Hx + E.Xcorrecion, E.Hy, E.secuencia, 'PAT2');
    if (E.veces & 1) E.secuencia++;
    if (E.secuencia === 4) {
      E.YO = { x1: E.Hx + E.Xcorrecion + ajst, y1: E.Hy + 25,
               x2: E.Hx + E.Xcorrecion + ajst + DIM.PAT2.X - 30, y2: E.Hy + 25 + DIM.PAT2.Y - 25 };
      E.tmp_recibe = 0; dadoSI_NO(1);
    }
  }
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.GUARD.X, y2: E.Hy + DIM.GUARD.Y };
  E.secuencia = 2; E.reposo = true; E.atacando = false;
}

async function patada3() { // a la barriga, dano 3
  E.atacando = true;
  let ajst;
  if (!E.sentido) { E.Xcorrecion = -13; ajst = 0; }
  else { E.Xcorrecion = 0; ajst = 22; }
  E.secuencia = 0;
  await poneYsend(E.Hx + E.Xcorrecion, E.Hy, 0, 'PAT1'); // 1er frame = pat1
  while (E.secuencia <= DIM.PAT3.F - 1) {
    await poneYsend(E.Hx + E.Xcorrecion, E.Hy, E.secuencia, 'PAT3');
    if (E.veces & 1) E.secuencia++;
    if (E.secuencia === 3) {
      E.YO = { x1: E.Hx + E.Xcorrecion + ajst, y1: E.Hy + 15,
               x2: E.Hx + E.Xcorrecion + ajst + DIM.PAT3.X - 26, y2: E.Hy + 15 + DIM.PAT3.Y - 35 };
      E.tmp_recibe = 3; dadoSI_NO(3);
    }
  }
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.GUARD.X, y2: E.Hy + DIM.GUARD.Y };
  E.secuencia = 2; E.reposo = true; E.atacando = false;
}

async function combatDER() {
  if (!E.sentido) { await combatGIRA(); return; }
  E.sentido = true; E.reposo = false;
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > DIM.AVAN.F - 1) E.secuencia = 0; }
  ponefondo(1);
}
async function combatIZQ() {
  if (E.sentido) { await combatGIRA(); return; }
  E.sentido = false; E.reposo = false;
  if (E.veces & 1) { E.secuencia++; if (E.secuencia > DIM.AVAN.F - 1) E.secuencia = 0; }
  ponefondoATRAS(1);
}

// combate: el estado de guardia, frame a frame (BACKUP)
async function combate() {
  Pvirtual.set(Pfondo.subarray(0, MAXY * W));
  ponDuna();
  if (E.reposo) {
    const d = DIM.GUARD;
    blitSprite(E.Hx, E.Hy + 1, E.hombre.subarray(d.off + d.X * d.Y * 2, d.off + d.X * d.Y * 3), d.X, d.Y, !E.sentido);
  } else {
    const d = DIM.AVAN;
    blitSprite(E.Hx, E.Hy + 1, E.hombre.subarray(d.off + d.X * d.Y * E.secuencia, d.off + d.X * d.Y * (E.secuencia + 1)), d.X, d.Y, !E.sentido);
  }
  await enemigos();
  ponPanel();
  present();
  E.veces++;
  if (!E.keys[SC.CTRL]) await noguardia();
  else if (E.keys[SC.DER]) await combatDER();
  else if (E.keys[SC.IZQ]) await combatIZQ();
  else if (E.keys[SC.ALT]) {
    if (E.keys[SC.ARR]) await patada();
    else if (E.keys[SC.ABJ]) await patada2();
    else await punetazo();
  } else if (E.keys[SC.SPACE]) {
    if (E.keys[SC.ARR]) await patada1();
    else if (E.keys[SC.ABJ]) await patada3();
  }
  if (!E.keys[SC.DER] && !E.keys[SC.IZQ]) E.reposo = true;
}

// ---------------- enemigos (BACKUP) ----------------

// E_putico/E_puticoatras: sprites de los malos SIN el -5 (en el BACKUP el
// ajuste está comentado) y espejo desde el último byte (sin el desfase viejo)
function E_putico(PEx, PEy, datos, X, Y) {
  for (let a = 0; a < Y; a++)
    for (let b = 0; b < X; b++) {
      const v = datos[a * X + b];
      if (v !== 0) putPixel(PEx + b, PEy + a, v);
    }
}
function E_puticoatras(PEx, PEy, datos, X, Y) {
  let off = X * Y - 1;
  for (let a = Y - 1; a >= 0; a--)
    for (let b = 0; b < X; b++, off--) {
      const v = datos[off];
      if (v !== 0) putPixel(PEx + b, PEy + a, v);
    }
}

// poneE: enemigo de mundo a pantalla con su sprite de clase
function poneE(PEx, PEy, que, nombre) {
  const m = E.MALO[E.num];
  const de = DIME[nombre];
  const x = PEx - E.PX, y = PEy - E.PY;
  if (x < -50 || x > 320 || y < -40 || y > 176) return;
  if (de) {
    const base = (m.clase === 1 ? CLASE_OFF : 0) + de.off;
    const datos = E.enemigo.subarray(base + de.X * de.Y * que, base + de.X * de.Y * (que + 1));
    if (m.sentidoE) E_putico(x, y, datos, de.X, de.Y);
    else E_puticoatras(x, y, datos, de.X, de.Y);
  } else {
    // sprites del héroe (p. ej. SALTA en E_salta)
    const d = DIM[nombre];
    const datos = E.hombre.subarray(d.off + d.X * d.Y * que, d.off + d.X * d.Y * (que + 1));
    if (m.sentidoE) E_putico(x, y, datos, d.X, d.Y);
    else E_puticoatras(x, y, datos, d.X, d.Y);
  }
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
  if (!(t === BASE || t === SOLIDO)) return false;
  return caractEn(col, Math.floor(m.Ey / 16) + 2) !== SOLIDO;
}

function E_cae() {
  const m = E.MALO[E.num];
  m.Ey += 4;
  m.E_ctrlcaida++;
  if (m.E_ctrlcaida === 3) m.ecae = false;
  poneE(m.Ex, m.Ey, 0, 'CAEe');
}

function E_noguardia() {
  const m = E.MALO[E.num];
  m.alguien_al_lado = 0;
  poneE(m.Ex, m.Ey + 1, m.secuenciaE, 'GUARDe');
  m.noguardia = true;
  if (E.veces & 1) {
    if (m.secuenciaE !== 0) m.secuenciaE--;
    else { m.secuenciaE = 0; m.noguardia = false; }
  }
}

// como_me_dara: LCG del original — 0 puñetazo, 1 patada
function como_me_dara() {
  let ax = E.aleatorio + E.aleatorio;
  if (E.aleatorio > 32767) ax ^= 0x2293; // el carry del original
  E.aleatorio = ax & 0xFFFF;
  E.MALO[E.num].tipo_ataca = E.aleatorio < 35000 ? 0 : 1;
}

function E_Guardia() {
  const m = E.MALO[E.num];
  poneE(m.Ex, m.Ey + 1, m.secuenciaE, 'GUARDe');
  if (E.veces & 1) {
    if (m.secuenciaE !== DIME.GUARDe.F - 2) m.secuenciaE++;
    else { m.ataca = true; m.secuenciaE = 0; como_me_dara(); }
  }
}

// E_recibe: el malo recibe (REC1e puño, REC4e patadas, REC2e barriga)
function E_recibe() {
  const m = E.MALO[E.num];
  let nombre, corrige;
  if (m.tipo_recibe === 0) { nombre = 'REC1e'; corrige = 1; if (m.secuenciaE === 0) play('golpe1'); }
  else if (m.tipo_recibe === 1 || m.tipo_recibe === 2) { nombre = 'REC4e'; corrige = 2; if (m.secuenciaE === 0) play('golpe1'); }
  else { nombre = 'REC2e'; corrige = 0; if (m.secuenciaE === 0) play('golpe2'); }
  const excorrecion = m.sentidoE ? 0 : 9;
  poneE(m.Ex + excorrecion, m.Ey + corrige, m.secuenciaE, nombre);
  if (E.veces & 1) {
    m.secuenciaE++;
    if (m.secuenciaE >= DIME[nombre].F) { m.Erecibiendo = false; m.secuenciaE = 0; }
  }
}

// E_punetazo/E_patada: los ataques del malo (llaman a recibe si aciertan)
function E_punetazo() {
  const m = E.MALO[E.num];
  const OX = m.Ex - E.PX, OY = m.Ey - E.PY;
  m.Egolpeando = true;
  let ajst;
  if (!m.sentidoE) { E.eXcorrecion = -9; ajst = 0; }
  else { E.eXcorrecion = 0; ajst = 25; }
  poneE(m.Ex + E.eXcorrecion, m.Ey + 2, m.secuenciaE, 'PUNOe');
  if (E.veces & 1) m.secuenciaE++;
  if (m.secuenciaE === DIME.PUNOe.F) {
    m.secuenciaE = 0; como_me_dara(); m.Egolpeando = false;
    const EL = { x1: OX + E.eXcorrecion + ajst, y1: OY + 6,
                 x2: OX + DIME.PUNOe.X - 25, y2: OY + DIME.PUNOe.Y - 35 };
    if (!E.recibiendo && !E.subiendo && hayInterseccion(E.YO, EL) && E.vida > 0) recibe(0);
  }
}
function E_patada() {
  const m = E.MALO[E.num];
  const OX = m.Ex - E.PX, OY = m.Ey - E.PY;
  m.Egolpeando = true;
  let ajst;
  if (!m.sentidoE) { E.eXcorrecion = -9; ajst = 0; }
  else { E.eXcorrecion = 0; ajst = 22; }
  poneE(m.Ex + E.eXcorrecion, m.Ey, m.secuenciaE, 'PAT1e');
  if (E.veces & 1) m.secuenciaE++;
  if (m.secuenciaE === DIME.PAT1e.F - 1) {
    const EL = { x1: OX + E.eXcorrecion + ajst, y1: OY + 20,
                 x2: OX + DIME.PAT1e.X - 22, y2: OY + DIME.PAT1e.Y - 35 };
    if (!E.recibiendo && !E.subiendo && hayInterseccion(E.YO, EL) && E.vida > 0) recibe(3);
  } else if (m.secuenciaE === DIME.PAT1e.F) {
    m.secuenciaE = 0; como_me_dara(); m.Egolpeando = false;
  }
}

async function E_ataca() {
  const m = E.MALO[E.num];
  if (m.tipo_ataca === 0) E_punetazo();
  else E_patada();
  const OX = m.Ex - E.PX, OY = m.Ey - E.PY;
  if (!(((OX > E.Hx) && (OX - 25 <= E.Hx)) || ((OX < E.Hx) && (OX + 25 >= E.Hx)))) {
    m.secuenciaE = DIME.GUARDe.F - 2;
    m.ataca = false; m.Aguardia = false; m.noguardia = true;
  } else if (!((E.Hy >= OY - 40) && (E.Hy <= OY + 40))) {
    m.secuenciaE = DIME.GUARDe.F - 2;
    m.ataca = false; m.Aguardia = false; m.noguardia = true;
  }
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

function E_muerte() {
  const m = E.MALO[E.num];
  m.alguien_al_lado = 0;
  if (E.veces & 1) m.secuenciaE++;
  switch (m.secuenciaE) {
    case 0: play('golpe0'); poneE(m.Ex, m.Ey + 6, 0, 'MUEae'); break;
    case 1: poneE(m.Ex, m.Ey + 10, 0, 'MUEbe'); break;
    case 2: poneE(m.Ex, m.Ey + 10, 1, 'MUEbe'); break;
    case 3: poneE(m.Ex, m.Ey + 25, 0, 'MUECe'); break;
    case 4: poneE(m.Ex, m.Ey + 25, 1, 'MUECe'); break;
    default:
      m.muertoE = true;
      E.puntos += (5 - (m.clase || 0)) * 32;
      E.MALOSmuertos++;
  }
}

// MOVenemigo: la máquina de estados del BACKUP (bucle interno num=0..maxENE)
async function MOVenemigo() {
  for (E.num = 0; E.num < E.MALO.length; E.num++) {
    const m = E.MALO[E.num];
    if (!m.muertoE) {
      if (m.vidaE <= 0) { E_muerte(); continue; }
      if (m.Erecibiendo) { E_recibe(); continue; }
      if (m.ecae) { E_cae(); continue; }
      if (!E_haysuelo()) { m.E_ctrlcaida = 0; m.ecae = true; E_cae(); continue; }
      if (m.ataca) { await E_ataca(); continue; }
      if (m.Aguardia) { E_Guardia(); continue; }
      if (m.noguardia) { E_noguardia(); continue; }
      // busca: a mi nivel (Hy dentro de OY±40) me sigue; si no, patrulla
      const OX = m.Ex - E.PX, OY = m.Ey - E.PY;
      if (E.Hy >= OY - 40 && E.Hy <= OY + 40) {
        if (OX > E.Hx) {
          m.sentidoE = false;
          if (OX - 15 <= E.Hx && haysueloNEXT()) {
            m.Aguardia = true; m.alguien_al_lado = 1;
            if (!m.sentidoE) m.Ex -= 7;
            m.secuenciaE = 0; continue;
          }
          if (haysueloNEXT()) { m.Ex -= 2; m.ereposo = false; }
          else m.ereposo = true;
        } else {
          m.sentidoE = true;
          if (OX + 15 >= E.Hx && haysueloNEXT()) {
            m.Aguardia = true; m.alguien_al_lado = 2;
            if (!m.sentidoE) m.Ex -= 7;
            m.secuenciaE = 0; continue;
          }
          if (haysueloNEXT()) { m.Ex += 2; m.ereposo = false; }
          else m.ereposo = true;
        }
      } else {
        if (Math.abs(m.Ex - m.Oex) > 5) {
          if (m.Ex > m.Oex) { m.Ex -= 2; m.ereposo = false; m.sentidoE = false; }
          else { m.Ex += 2; m.ereposo = false; m.sentidoE = true; }
        } else m.ereposo = true;
      }
      if (E.veces & 1) { m.secuenciaE++; if (m.secuenciaE > 7) m.secuenciaE = 0; }
      if (m.ereposo) m.secuenciaE = 8;
      poneE(m.Ex, m.Ey, m.secuenciaE, 'ANDAe');
    } else {
      poneE(m.Ex, m.Ey + 25, 1, 'MUECe');
    }
  }
}

// enemigos: el bucle para las rutas que no pasan por poneH
async function enemigos() {
  await MOVenemigo();
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
    if (E.veces % E.fps === 0) {
    E.cronometro++; // el original cuenta segundos (INT 1C cada ~1 s)
    if (((E.cronometro / 16) | 0) !== E.ultimaAC) E.ultimaAC = (E.cronometro / 16) | 0;
  }
  if (E.cronometro >= 1000) {
    // tiempo agotado: craneo.dac + game.dac (BACKUP actualizaCRONO)
    await fadeOUT(600);
    mostrarDAC('CRANEO.DAC', 0, 0);
    present();
    await fadeIN();
    E.salir = true;
  }
  // input (despacho del repeat del original)
    if (E.keys[SC.ARR] && (E.keys[SC.DER] || E.keys[SC.IZQ])) await salto();
    else if (E.keys[SC.SPACE]) { E.corriendo = true; E.reposo = true; E.secuencia = 8; }
    else if (E.keys[SC.DER] && !E.keys[SC.IZQ]) await derecha();
    else if (E.keys[SC.IZQ] && !E.keys[SC.DER]) await izquierda();
    else if (E.keys[SC.ABJ]) await agacharse();
    else if (E.keys[SC.CTRL]) await enguardia();
    else if (E.keys[SC.ARR]) {
      if (borde()) { E.subiendo = true; await saltoq(); await colgarse(true); await sube(); }
      else if (borde3()) { E.subiendo = true; await colgarse(false); await sube(); }
      else { E.subiendo = true; await saltoq(); E.subiendo = false; }
    } else if (E.keys[SC.TAB]) { E.mapeado = !E.mapeado; await dormir(100); }
    else if (E.keys[SC.P]) await pausa();
    else if (!E.reposo) await para();
    else await picando();
  } else if (E.corriendo) await carrera();
  else if (E.guardia) await combate();
  else if (E.agachado) await agacharse();
  if (E.keys[SC.ESC]) { E.keys[SC.ESC] = 0; if (await abandonar()) E.salir = true; }
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
  const [pal, mapaB, fondo, hombre, duna, panel, numero] = await Promise.all([
    fetchBuf('PALETA.L01'), fetchBuf('MAPA.DAT'), fetchBuf('FONDO.DAT'),
    fetchBuf('HOMBRE.DAT'), fetchBuf('DUNA2.DAT'), fetchBuf('PANEL.DAC'),
    fetchBuf('NUMERO.DAT'),
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
  E.fondo = fondo; E.duna = duna;
  E.paletaJuego = pal; // PALETA.L01 (ponpaleta('paleta.l01',0) del BACKUP)
  {
    const r = await fetch('assets/ENEMIGO.DAT');
    if (r.ok) E.enemigo = new Uint8Array(await r.arrayBuffer());
    let off = 0;
    for (const [nombre, X, Y, F] of MALOSPRITES) { DIME[nombre] = { X, Y, F, off }; off += X * Y * F; }
  }
  E.numero = numero;
  // PANEL.DAC: RLE (c&192==192 → run c&63 + valor), 320x24 sin paleta
  {
    const bytes = panel[4] | (panel[5] << 8);
    const alto = panel[2] | (panel[3] << 8);
    const pix = new Uint8Array(bytes * alto);
    let ctrl = 7, off = 0;
    for (let i = 0; i < alto; i++) {
      let n = 0;
      while (n < bytes) {
        const c = panel[ctrl++];
        if ((c & 192) === 192) {
          const run = c & 63, v = panel[ctrl++];
          pix.fill(v, off, off + run); off += run; n += run;
        } else { pix[off++] = c; n++; }
      }
    }
    E.panel = pix;
  }
  let off = 0;
  for (const [nombre, X, Y, F] of SPRITES) { DIM[nombre] = { X, Y, F, off }; off += X * Y * F; }
  E.hombre = hombre;
  // enemigos desde ENEMIGO.LOC (8 registros de 30 B): Ex,Ey,Oex u16 + 12
  // flags + vidaE (byte 18) + 10 + CLASE (byte 29). maxENE=74 pero el
  // fichero solo tiene 8: los 66 restantes quedan muertos.
  E.MALOplantilla = [];
  {
    const loc = await fetchBuf('ENEMIGO.LOC');
    for (let i = 0; i < 74; i++) {
      const r = i * 30;
      const vivo = r + 30 <= loc.length;
      E.MALOplantilla.push({ vivo, ...(vivo ? {
        Ex: loc[r] | (loc[r + 1] << 8),
        Ey: loc[r + 2] | (loc[r + 3] << 8),
        Oex: loc[r + 4] | (loc[r + 5] << 8),
        vidaE: loc[r + 18], clase: loc[r + 29],
      } : { Ex: 0, Ey: 0, Oex: 0, vidaE: 0, clase: 0 }) });
      E.MALO.push(vivo ? {
        Ex: loc[r] | (loc[r + 1] << 8),
        Ey: loc[r + 2] | (loc[r + 3] << 8),
        Oex: loc[r + 4] | (loc[r + 5] << 8),
        vidaE: loc[r + 18],
        clase: loc[r + 29],
        secuenciaE: 0, E_ctrlcaida: 0,
        sentidoE: false, Aguardia: false, noguardia: false, ataca: false,
        ereposo: false, esaltando: false, ecae: false, muertoE: false,
        Erecibiendo: false, Egolpeando: false, tipo_recibe: 0,
        tipo_ataca: 0, alguien_al_lado: 0,
      } : {
        Ex: 0, Ey: 0, Oex: 0, vidaE: 0, clase: 0, muertoE: true,
        secuenciaE: 0, E_ctrlcaida: 0, sentidoE: false, Aguardia: false,
        noguardia: false, ataca: false, ereposo: true, esaltando: false,
        ecae: false, Erecibiendo: false, Egolpeando: false, tipo_recibe: 0,
        tipo_ataca: 0, alguien_al_lado: 0,
      });
    }
  }
  E.YO = { x1: E.Hx, y1: E.Hy, x2: E.Hx + DIM.ANDA.X, y2: E.Hy + DIM.ANDA.Y };

  initTeclado();
  try { initTouch(); } catch (err) { console.error('táctil:', err); }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  }
  window.__E = E; window.__P = Pvirtual; // diagnóstico por CDP
  cargarSonido().catch(() => {}); // sin SONIDO.DAT el juego sigue mudo
  cargarGameOver(); // sin GAME.DAC el héroe muere sin pantalla de game over
  // WebAudio se desbloquea con el primer gesto (política de los navegadores)
  const unlock = () => { desbloquear(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  await cargarDACs().catch(() => {});
  ponPaleta(pal);
  // re-presentación a 60 Hz: la lógica va a 26 fps (como el DOS) pero el
  // monitor del navegador es de 60 — repintar el mismo frame entre ticks
  // evita el judder ("parpadeos"). En el DOS el CRT hacía esto mismo a 70 Hz.
  if (!E.acelerado) {
    const repintar = () => { present(); requestAnimationFrame(repintar); };
    requestAnimationFrame(repintar);
  }
  // flujo del BACKUP: creditos -> present -> windows (menú) -> jugar/...
  if (!E.acelerado) {
    while (true) {
      E.fase = 'creditos';
      await creditos();
      E.fase = 'fade1';
      await fadeOUT(600);
      E.fase = 'present';
      await presentacion();
      E.fase = 'fade2';
      await fadeOUT(400);
      E.fase = 'windows';
      await empezarMusica('menu');
      const op = await windows();
      await pararMusica();
      if (op === 3) break;              // salir (quit2dos)
      if (op === 2) { await config(); continue; }
      if (op === 4) { await opciones(); continue; }
      E.fase = 'juego';
      await empezarMusica('juego');
      await iniciarPartida();           // 1 = jugar
      await pararMusica();
    }
  } else {
    // modo test: directo a la partida (el test llama a tick() a mano)
    await iniciarPartida(true);
  }
}

// fondoCompleto: 11x20 baldosas desde (mapaX, mapaY) al buffer Pfondo
function fondoCompleto() {
  let py = 0;
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 20; j++) {
      const nro = E.mapa[(E.mapaY + i) * E.largo + E.mapaX + j];
      const tile = nro * 256;
      for (let k = 0; k < 16; k++)
        Pfondo.set(E.fondo.subarray(tile + k * 16, tile + k * 16 + 16), (py + k) * W + j * 16);
    }
    py += 16;
  }
}

// iniciarPartida: el jugar() del BACKUP (reinicio del estado + bucle del juego)
async function iniciarPartida(soloIniciar) {
  E.puntos = 0; E.MALOSmuertos = 0; E.cronometro = 0; E.ultimaAC = -1;
  E.mapaX = 0; E.mapaY = 2; E.PX = 0; E.PY = 32;
  E.PosEnbaldosa = 0; E.PosEnbaldosaY = 0;
  E.Hx = 155; E.Hy = 117 - 16; E.vida = 25;
  E.saltando = E.cayendo = E.subiendo = E.corriendo = E.guardia = E.puntillas = E.agachado = false;
  E.sentido = true; E.reposo = true; E.secuencia = 8; E.salir = false;
  E.ctrduna = 0; E.Movfondo = false; E.BAJAalturas = 0; E.vecesparado = 0;
  E.mapeado = false; E.veces = 0;
  // enemigos de nuevo (plantilla de ENEMIGO.LOC)
  for (let i = 0; i < E.MALO.length; i++) {
    const t = E.MALOplantilla[i];
    Object.assign(E.MALO[i], {
      Ex: t.Ex, Ey: t.Ey, Oex: t.Oex, vidaE: t.vidaE, clase: t.clase,
      muertoE: !t.vivo, secuenciaE: 0, E_ctrlcaida: 0,
      sentidoE: false, Aguardia: false, noguardia: false, ataca: false,
      ereposo: true, esaltando: false, ecae: false,
      Erecibiendo: false, Egolpeando: false, tipo_recibe: 0, tipo_ataca: 0,
      alguien_al_lado: 0,
    });
  }
  document.body.classList.add('en-juego');
  Pfondo.fill(0);
  fondoCompleto();
  ponPaleta(E.paletaJuego);
  await fadeIN(600); // el original funde a la paleta del juego al empezar
  await poneYsend(E.Hx, E.Hy, E.secuencia, 'ANDA');
  if (soloIniciar) return;
  // bucle del juego: ritmo frames_por_seg (26 por defecto, como el DOS)
  while (!E.salir) {
    await tick();
    await dormir(1000 / E.fps);
  }
  document.body.classList.remove('en-juego');
}

boot().catch((err) => { console.error(err); document.body.textContent = 'ERROR: ' + err; });

export { E, Pvirtual, Pfondo, tick, salto, frame, cae, ponefondoABAJO, ponefondoARRIBA, ponefondo, ponefondoATRAS, actualizaVIDA, dormir, present };

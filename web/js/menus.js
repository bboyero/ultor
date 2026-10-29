// Menús y pantallas del BACKUP: DAC2VGA (RLE + putico color-5), fundidos de
// paleta, el fuego del menú (FGO), créditos, present, windows, config,
// opciones, pausa, abandonar, final y muerte.
import { E, Pvirtual, present, dormir } from './main.js';

const W = 320;
const DACs = {};
let fuente = null; // MINI.DAT (8x8, 2048 B)
let fuego = null;  // buffer 320x20 del fuego del menú
let vecesFGO = 0, Cror = 0, TxTaponer = 0;
const dedicatorias = [
  ' DEDICADO A: JORGE,ALEX,ELENA', '  IGOR,ZURI,AITOR,JAVI,INIGO,',
  '   MACARENA,JAVI,MARTA,EDER', ' GUILLERMO,JORGE,KIKE,ENRIQUE',
  ' AITOR,GABRIELA,INAKI,GAIZKAR', '  GORKA,ADRIAN,GABRIEL,IRENE',
  ' AINARA,GARIKOIZ,ASIER,BORJA', 'MARIA,DAVID,BEGONA,FERNAN,JUAN',
  ' ALEX,MIGUEL,FEDE,MIGUEL,LUIS', 'RICARDO,JOSE,OSCAR,ANDER,GORKA',
  'IGOR,ANA,JAVI,ASIER,ANA,DAVID',
];

// ---------------- DAC ----------------

async function fetchBuf(nombre) {
  const r = await fetch('assets/' + nombre);
  if (!r.ok) throw new Error(nombre + ': HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// decodifica un .DAC (RLE: c&192==192 → run c&63 + valor; paleta 768 al final)
function decodificarDAC(b) {
  const Xmax = b[0] | (b[1] << 8), Ymax = b[2] | (b[3] << 8);
  const bytes = b[4] | (b[5] << 8), haypaleta = b[6];
  const pix = new Uint8Array(bytes * Ymax);
  let ctrl = 7, off = 0;
  for (let i = 0; i < Ymax; i++) {
    let n = 0;
    while (n < bytes) {
      const c = b[ctrl++];
      if ((c & 192) === 192) {
        const run = c & 63, v = b[ctrl++];
        pix.fill(v, off, off + run); off += run; n += run;
      } else { pix[off++] = c; n++; }
    }
  }
  const pal = haypaleta === 1 ? b.subarray(b.length - 768) : null;
  return { pix, w: bytes, h: Ymax, pal };
}

export async function cargarDACs() {
  const nombres = ['ULTOR.DAC', 'PRESENT.DAC', 'MENU1.DAC', 'MENU2.DAC', 'PAD.DAC',
    'PAD1H0.DAC', 'PAD1H1.DAC', 'PAD1H2.DAC', 'PAUSA.DAC', 'ABANDONA.DAC',
    'FINAL.DAC', 'GAME.DAC', 'CRANEO.DAC', 'TUMBA.DAC', 'PERIODIC.DAC'];
  for (const n of nombres) {
    try { DACs[n] = decodificarDAC(await fetchBuf(n)); } catch (e) { /* pantalla opcional */ }
  }
  window.__DACs = DACs; window.__mostrarDAC = mostrarDAC; // diagnóstico
  try { fuente = await fetchBuf('MINI.DAT'); } catch (e) { /* sin fuente */ }
}

// DAC2VGA: putico con 0 transparente y color-5 (la semántica del original)
function mostrarDAC(nombre, x, y) {
  const d = DACs[nombre];
  if (!d) return;
  if (d.pal) { E.paleta.set(d.pal); window.__palE = E.paleta; } // el DAC2VGA del original carga su paleta en `paleta`
  for (let a = 0; a < d.h; a++)
    for (let b = 0; b < d.w; b++) {
      const v = d.pix[a * d.w + b];
      if (v !== 0) {
        const px = x + b, py = y + a;
        if (px >= 0 && px < W && py >= 0 && py < 200)
          Pvirtual[py * W + px] = Math.max(1, v - 5);
      }
    }
}

// ---------------- fundidos de paleta ----------------

function aplicarLUT(pal) {
  for (let i = 0; i < 256; i++) {
    const r = pal[i * 3], g = pal[i * 3 + 1], b = pal[i * 3 + 2];
    E.lut[i * 4] = (r << 2) | (r >> 4);
    E.lut[i * 4 + 1] = (g << 2) | (g >> 4);
    E.lut[i * 4 + 2] = (b << 2) | (b >> 4);
  }
}

export function ponPaleta(pal768) {
  E.paleta.set(pal768);
  aplicarLUT(pal768);
}

// fadeOUT: escala cada canal de la paleta hasta 0 (64 pasos del original)
export async function fadeIN(ms = 900) {
  // fundido determinista: cada paso pinta el objetivo escalado por k.
  // (La versión acumulativa anterior podía quedarse a medio brillo.)
  const destino = new Uint8Array(768);
  destino.set(E.paleta);
  const t0 = performance.now();
  for (;;) {
    const k = Math.min(1, (performance.now() - t0) / ms);
    for (let i = 0; i < 256; i++) {
      const r = Math.round(destino[i * 3] * k);
      const g = Math.round(destino[i * 3 + 1] * k);
      const b = Math.round(destino[i * 3 + 2] * k);
      E.lut[i * 4] = (r << 2) | (r >> 4);
      E.lut[i * 4 + 1] = (g << 2) | (g >> 4);
      E.lut[i * 4 + 2] = (b << 2) | (b >> 4);
    }
    present();
    if (k >= 1) return;
    await dormir(16);
  }
}

// fadeOUT: escala la paleta mostrada hasta negro (determinista)
export async function fadeOUT(ms = 900) {
  const origen = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    origen[i * 3] = E.lut[i * 4] >> 2;
    origen[i * 3 + 1] = E.lut[i * 4 + 1] >> 2;
    origen[i * 3 + 2] = E.lut[i * 4 + 2] >> 2;
  }
  const t0 = performance.now();
  for (;;) {
    const k = Math.max(0, 1 - (performance.now() - t0) / ms);
    for (let i = 0; i < 256; i++) {
      const r = Math.round(origen[i * 3] * k);
      const g = Math.round(origen[i * 3 + 1] * k);
      const b = Math.round(origen[i * 3 + 2] * k);
      E.lut[i * 4] = (r << 2) | (r >> 4);
      E.lut[i * 4 + 1] = (g << 2) | (g >> 4);
      E.lut[i * 4 + 2] = (b << 2) | (b >> 4);
    }
    present();
    if (k <= 0) return;
    await dormir(16);
  }
}

// ---------------- espera de tecla ----------------

function esperaTecla() {
  return new Promise((res) => {
    const fn = (e) => { window.removeEventListener('keydown', fn); e.preventDefault(); res(); };
    window.addEventListener('keydown', fn);
  });
}

// ---------------- texto y fuego ----------------

function pontextXY(Tx, Ty, texto, color) {
  if (!fuente) return;
  for (let cont = 0; cont < texto.length; cont++) {
    const c = texto.charCodeAt(cont) << 3;
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < 8; i++)
        if (fuente[c + i] & (128 >> j)) {
          const x = Tx + j, y = Ty + i;
          if (x >= 0 && x < W && y >= 0 && y < 200) Pvirtual[y * W + x] = color;
        }
    Tx += 4;
  }
}

function preparaFuego() {
  fuego = new Uint8Array(W * 20);
  vecesFGO = 0; Cror = 0; TxTaponer = 0;
}

// fuego_en_si: blur celular del unit FGO + los textos de dedicatoria que arden
function fuegoEnSi() {
  for (let y = 1; y <= 18; y++)
    for (let x = 1; x <= 129; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          s += fuego[(y + dy) * W + x + dx];
        }
      let aponer = ((s / 8) | 0) - 1;
      if (aponer < 0) aponer = 255;      // el WORD -1 del Pascal (65535) se
                                         // guarda como byte 255: la chispa
      else if (aponer < 32) aponer = 32; // inicial que enciende el fuego
      fuego[(y - 1) * W + x] = aponer;
      // putpixel2: píxel doble en pantalla en (x*2+15, y+175)
      const v = fuego[y * W + x];
      const px = x * 2 + 15, py = y + 175;
      if (px < W && py < 200 && px + 1 < W) {
        Pvirtual[py * W + px] = v;
        Pvirtual[py * W + px + 1] = v;
      }
    }
  vecesFGO++; Cror--;
  if (vecesFGO > 10 && vecesFGO < 30) {
    if (vecesFGO === 11) Cror = 63;
    // el texto se escribe EN el buffer del fuego (luego el blur lo quema)
    const msj = dedicatorias[TxTaponer];
    for (let cont = 0; cont < msj.length; cont++) {
      const c = msj.charCodeAt(cont) << 3;
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 8; i++)
          if (fuente && (fuente[c + i] & (128 >> j)))
            fuego[10 * W + 5 + cont * 4 + j + i * W] = Cror;
    }
    if (vecesFGO === 29) {
      TxTaponer = (TxTaponer + 1) % dedicatorias.length;
      vecesFGO = 0;
    }
  }
}

// ---------------- pantallas del flujo ----------------

export async function creditos() {
  mostrarDAC('ULTOR.DAC', 17, 0);
  present();
  await fadeIN(400); // el original mostraba esto con la paleta por defecto,
                     // pero con la suya propia se ve como debe
  await dormir(2000);
  // la cortinilla del original (baja la pantalla fila a fila)
  for (let y = 68; y >= 0; y--) {
    Pvirtual.copyWithin(0, 0, 320 * (200 - y));
    Pvirtual.copyWithin(320 * y, 0, 320 * (200 - y));
    present();
    await dormir(1);
  }
  Pvirtual.fill(0);
  present();
}

export async function presentacion() {
  mostrarDAC('PRESENT.DAC', 0, 0);
  pontextXY(120, 10, 'PULSA PARA CONTINUAR', 255);
  present();
  await fadeIN();
  await esperaTecla();
}

export async function windows() {
  // listener ANTES del fadeIN (las teclas pueden llegar durante el fundido)
  let salida = 0;
  const fn = (e) => {
    const map = { Digit1: 2, Digit2: 4, Digit3: 1, Digit5: 3, Escape: 3 };
    if (map[e.code] !== undefined) {
      salida = map[e.code];
      window.removeEventListener('keydown', fn);
    }
  };
  window.addEventListener('keydown', fn);
  mostrarDAC('MENU1.DAC', 0, 0);
  preparaFuego();
  present();
  await fadeIN();
  // bucle del menú: fuego + teclas 1=config 2=opciones 3=jugar 5/ESC=salir
  while (salida === 0) {
    fuegoEnSi();
    present();
    await dormir(1000 / 26);
  }
  await fadeOUT(400);
  Pvirtual.fill(0);
  return salida;
}

export async function config() {
  let y = 0;
  let salir = false;
  const fn = (e) => {
    if (e.code === 'ArrowUp') y = (y + 3) % 4;
    else if (e.code === 'ArrowDown') y = (y + 1) % 4;
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const dir = e.code === 'ArrowRight' ? 1 : -1;
      if (y === 3) E.fps = Math.max(0, Math.min(64, E.fps + dir));
    }
    else if (e.code === 'Escape' || e.code === 'Enter') salir = true;
  };
  window.addEventListener('keydown', fn);
  mostrarDAC('MENU2.DAC', 0, 0);
  present();
  await fadeIN();
  while (!salir) {
    Pvirtual.fill(0);
    mostrarDAC('MENU2.DAC', 0, 0);
    // cursor y barras (volúmenes fijos, velocidad E.fps)
    const filas = [31, 41, 51, 61];
    for (let i = 0; i < 4; i++) {
      const val = i === 3 ? Math.min(128, E.fps * 2) : 128;
      for (let r = 0; r < 6; r++) {
        for (let x = 130; x < 130 + val; x++) Pvirtual[(filas[i] + r) * W + x] = 0xA0;
      }
      if (i === y) Pvirtual[((y + 3) * 10) * W + 12 * 10] = 255;
    }
    for (let r = 0; r < 6; r++)
      for (let x = 130; x < 130 + Math.min(128, E.fps * 2); x++)
        Pvirtual[(61 + r) * W + x] = 0xA0;
    present();
    await dormir(1000 / 26);
  }
  window.removeEventListener('keydown', fn);
  await fadeOUT(400);
  Pvirtual.fill(0);
}

export async function opciones() {
  let stdIN = 0;
  let salir = false;
  const fn = (e) => {
    if (e.code === 'ArrowLeft') stdIN = (stdIN + 2) % 3;
    else if (e.code === 'ArrowRight') stdIN = (stdIN + 1) % 3;
    else if (e.code === 'Escape' || e.code === 'Enter') salir = true;
  };
  window.addEventListener('keydown', fn);
  mostrarDAC('PAD.DAC', 0, 0);
  present();
  await fadeIN();
  while (!salir) {
    Pvirtual.fill(0);
    mostrarDAC('PAD.DAC', 0, 0);
    mostrarDAC('PAD1H' + stdIN + '.DAC', 4, 61);
    present();
    await dormir(1000 / 26);
  }
  window.removeEventListener('keydown', fn);
  await fadeOUT(400);
  Pvirtual.fill(0);
}

export async function pausa() {
  mostrarDAC('PAUSA.DAC', 115, 78);
  present();
  await esperaTecla();
}

export async function abandonar() {
  mostrarDAC('ABANDONA.DAC', 69, 56);
  present();
  let salir = false;
  await new Promise((res) => {
    const fn = (e) => {
      if (e.code === 'KeyS') { salir = true; res(); }
      else if (e.code === 'KeyN') { res(); }
    };
    window.addEventListener('keydown', fn);
  });
  return salir;
}

export async function final() {
  if (E.salir) return;
  await fadeOUT(600);
  mostrarDAC('FINAL.DAC', 0, 0);
  await fadeIN();
  E.salir = true;
  await esperaTecla();
  mostrarDAC('GAME.DAC', 35, 50);
  present();
  await dormir(2000);
  // estadísticas en la tumba
  mostrarDAC('TUMBA.DAC', 0, 0);
  present();
  await dormir(500);
}

export async function muertePantalla() {
  // la animación MUEa/b/c la hace main.js; aquí la pantalla game.dac
  mostrarDAC('GAME.DAC', 35, 50);
  present();
  E.salir = true;
  await esperaTecla();
  await fadeOUT(600);
  Pvirtual.fill(0);
}

export { mostrarDAC, pontextXY };

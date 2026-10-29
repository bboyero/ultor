// ULTOR — port JavaScript (primer hito: cargar datos y dibujar la primera
// escena tal y como la pinta JUEGO.PAS: fondo_completo + duna + panel + héroe)
//
// Pipeline original (cada "vez" = un frame VGA):
//   move32(Pfondo→Pvirtual) → ponduna (Pparallax) →
//   movedes0(Pparallax → Pvirtual+320*75) → poneH (sprite) → move32→VGA
// Paleta: PALETA.L01 (768 B, 6 bits). Sprites: píxel 0 transparente, color-5.

const W = 320, MAXY = 176;            // modo 13h; zona de juego 0..175
const maxParallax = 101;              // filas de duna que tapan la pantalla

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

// Estado global (la versión definitiva vivirá en estado.js como en HARMFUL)
const E = {
  paleta: new Uint8Array(768),  lut: new Uint8Array(256 * 4),
  mapa: null, caract: null, largo: 0, alto: 0,
  fondo: null, hombre: null, duna: null, panel: null,
  offs: {},                     // offset de cada sprite en HOMBRE.DAT
};

async function fetchBuf(name) {
  const r = await fetch('assets/' + name);
  if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// Pvirtual como buffer de índices de paleta (como el Pfondo/Pvirtual del DOS)
const Pvirtual = new Uint8Array(W * 200);

function putPixel(x, y, c) {
  if (x < 0 || x >= W || y < 0 || y >= 200 || c === 0) return;
  Pvirtual[y * W + x] = c;
}

// putico: sprite con píxel 0 transparente y color real = valor-5
function putico(dx, dy, datos, X, Y) {
  let off = 0;
  for (let a = 0; a < Y; a++)
    for (let b = 0; b < X; b++, off++) {
      const v = datos[off];
      if (v !== 0) putPixel(dx + b, dy + a, v - 5);
    }
}

function Hline(x, y, c, l) {
  for (let i = 0; i < l; i++) putPixel(x + i, y, c);
}

// fondocompleto: 11×20 baldosas (mapaX..mapaX+19, mapaY..mapaY+10)
function fondoCompleto() {
  const { mapa, caract, largo, fondo } = E;
  const mapaX = 0, mapaY = 1; // valores de arranque del original
  let px = 0, py = 0;
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 20; j++) {
      const nro = mapa[(mapaY + i) * largo + mapaX + j];
      const tile = nro * 256;
      for (let k = 0; k < 16; k++)
        for (let l = 0; l < 16; l++)
          Pvirtual[(py + k) * W + px + l] = fondo[tile + k * 16 + l];
      px += 16;
    }
    px = 0; py += 16;
  }
}

// ponduna: rellena Pparallax con la ventana de 320 px de DUNA2.DAT (640×100)
// y la copia sobre Pvirtual filas 75..175 (el original tapa el fondo con ella)
function ponDuna() {
  const ctrlduna = 0; // avanza con el movimiento (1 cada 2 frames)
  const par = new Uint8Array(W * maxParallax); // fila 100 = negro (como el DOS)
  for (let i = 0; i < 100; i++) {
    const src = i * 640 + ctrlduna;
    par.set(E.duna.subarray(src, src + W), i * W);
  }
  Pvirtual.set(par, 75 * W);
}

// panel: PANEL.DAT (320×24) en y=175 + barra de vida en y=180
function ponPanel() {
  Pvirtual.set(E.panel, 175 * W);
  Hline(0, 180, 255, 25 * 4); // blanco (fondo de la barra)
  Hline(0, 180, 98, 25 * 4);  // rojo (vida llena: maxvida=25)
}

// pantalla completa: índices → ImageData con la paleta
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

async function boot() {
  const [pal, mapaB, fondo, hombre, duna, panel] = await Promise.all([
    fetchBuf('PALETA.L01'), fetchBuf('MAPA.DAT'), fetchBuf('FONDO.DAT'),
    fetchBuf('HOMBRE.DAT'), fetchBuf('DUNA2.DAT'), fetchBuf('PANEL.DAT'),
  ]);
  // paleta: 6 bits VGA → 8 bits
  for (let i = 0; i < 256; i++) {
    const r = pal[i * 3], g = pal[i * 3 + 1], b = pal[i * 3 + 2];
    E.lut[i * 4] = (r << 2) | (r >> 4);
    E.lut[i * 4 + 1] = (g << 2) | (g >> 4);
    E.lut[i * 4 + 2] = (b << 2) | (b >> 4);
    E.lut[i * 4 + 3] = 255;
  }
  // mapa: largo u16 | alto u16 | mapa u16[] | caract u8[]
  E.largo = mapaB[0] | (mapaB[1] << 8);
  E.alto = mapaB[2] | (mapaB[3] << 8);
  const celdas = E.largo * E.alto;
  E.mapa = new Uint16Array(mapaB.buffer, mapaB.byteOffset + 4, celdas);
  E.caract = mapaB.subarray(4 + celdas * 2, 4 + celdas * 3);
  E.fondo = fondo; E.duna = duna; E.panel = panel;
  // offsets de los sprites en HOMBRE.DAT (orden de carga() del original)
  let off = 0;
  for (const [nombre, X, Y, F] of SPRITES) { E.offs[nombre] = off; off += X * Y * F; }
  E.hombre = hombre;

  // escena inicial (estado de arranque del original: secuencia=8 reposo,
  // Hx=155, Hy=117-16=101, vida=maxvida)
  fondoCompleto();
  ponDuna();
  ponPanel();
  putico(155, 101, hombre.subarray(E.offs.ANDA + 8 * 24 * 43, E.offs.ANDA + 9 * 24 * 43), 24, 43);
  present();
}

boot().catch((err) => { console.error(err); document.body.textContent = 'ERROR: ' + err; });

export { E, Pvirtual };

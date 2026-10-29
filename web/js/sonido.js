// SONIDO.PAS → WebAudio. SONIDO.DAT = 13 muestras PCM 8 bits SIN signo
// concatenadas (offsets de carga() de JUEGO.PAS). El GO.BAT arranca con
// hardware 0 (SB DMA) → 8 kHz (time_cte=256-1000000/8000 en SONIDO.PAS).
// play() corta el sonido anterior: el original reprogramaba el timer INT8,
// así que el nuevo sonido SIEMPRE pisa al que estaba sonando.
const MUESTRAS = [
  ['ahh', 16061], ['paso1', 2222], ['paso2', 2222], ['saltoF', 3155],
  ['combat', 3432], ['combatG', 3641], ['pica', 1018], ['puno', 949],
  ['up', 938], ['dado', 3072], ['muerto', 7038], ['golpe1', 1641],
  ['golpe0', 2027],
];

let ctx = null;
const buffers = {};
let current = null;

export async function cargarSonido() {
  if (ctx || typeof window === 'undefined' || !window.AudioContext) return;
  const r = await fetch('assets/SONIDO.DAT');
  if (!r.ok) return;
  const b = new Uint8Array(await r.arrayBuffer());
  ctx = new window.AudioContext();
  let off = 0;
  for (const [nombre, len] of MUESTRAS) {
    const buf = ctx.createBuffer(1, len, 8000);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (b[off + i] - 128) / 128; // sin signo → float
    buffers[nombre] = buf;
    off += len;
  }
}

export function play(nombre) {
  if (!ctx || !buffers[nombre]) return;
  if (current) { try { current.stop(); } catch (e) { /* ya parado */ } }
  const src = ctx.createBufferSource();
  src.buffer = buffers[nombre];
  src.connect(ctx.destination);
  src.start();
  current = src;
}

export function desbloquear() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function haySonido() { return ctx !== null; }
export function numeroSamples() { return Object.keys(buffers).length; }
export { MUESTRAS };

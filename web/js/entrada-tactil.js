// Controles táctiles de ULTOR: cruceta analógica (8 sectores, como la de
// HARMFUL), botones de acción y capa de menús. Los controles de partida
// escriben en E.keys; los de menú lanzan KeyboardEvent sintéticos.
import { E } from './main.js';

const SC = { ARR: 0x48, IZQ: 0x4B, DER: 0x4D, ABJ: 0x50, SPACE: 0x39, CTRL: 0x1D, ALT: 0x38 };

let iniciado = false;

function tecla(codigo, code, teclaJS) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: teclaJS }));
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: teclaJS })), 60);
}

// zona muerta e histéresis del pad analógico
function sector(cx, cy) {
  const dx = cx - 48, dy = cy - 48;
  const r = Math.hypot(dx, dy);
  if (r < 12) return null; // zona muerta
  const ang = Math.atan2(dy, dx) * 180 / Math.PI; // Y crece hacia abajo: + = ABAJO
  if (ang >= -22.5 && ang < 22.5) return 'DER';
  if (ang >= 22.5 && ang < 67.5) return 'DERABJ';
  if (ang >= 67.5 && ang < 112.5) return 'ABJ';
  if (ang >= 112.5 && ang < 157.5) return 'IZQABJ';
  if (ang >= 157.5 || ang < -157.5) return 'IZQ';
  if (ang >= -157.5 && ang < -112.5) return 'IZQARR';
  if (ang >= -112.5 && ang < -67.5) return 'ARR';
  return 'DERARR';
}

function aplicarPad(s) {
  const set = (k, v) => { E.keys[k] = v; };
  set(SC.DER, s === 'DER' || s === 'DERABJ' || s === 'DERARR' ? 1 : 0);
  set(SC.IZQ, s === 'IZQ' || s === 'IZQABJ' || s === 'IZQARR' ? 1 : 0);
  set(SC.ARR, s === 'ARR' || s === 'IZQARR' || s === 'DERARR' ? 1 : 0);
  set(SC.ABJ, s === 'ABJ' || s === 'IZQABJ' || s === 'DERABJ' ? 1 : 0);
}

export function initTouch() {
  if (iniciado) return;
  if (typeof window === 'undefined' || !navigator.maxTouchPoints) return;
  iniciado = true;
  document.documentElement.classList.add('tactil');

  // cruceta
  const pad = document.getElementById('tpad');
  const knob = document.getElementById('tknob');
  let padPointer = null;
  pad.addEventListener('pointerdown', (e) => {
    padPointer = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    const r = pad.getBoundingClientRect();
    knob.style.transform = 'translate(' + (e.clientX - r.left - 48) + 'px,' + (e.clientY - r.top - 48) + 'px)';
    aplicarPad(sector(e.clientX - r.left, e.clientY - r.top));
    e.preventDefault();
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== padPointer) return;
    const r = pad.getBoundingClientRect();
    knob.style.transform = 'translate(' + (e.clientX - r.left - 48) + 'px,' + (e.clientY - r.top - 48) + 'px)';
    aplicarPad(sector(e.clientX - r.left, e.clientY - r.top));
    e.preventDefault();
  });
  const soltarPad = (e) => {
    if (e.pointerId !== padPointer) return;
    padPointer = null;
    knob.style.transform = 'translate(0px,0px)';
    aplicarPad(null);
    e.preventDefault();
  };
  pad.addEventListener('pointerup', soltarPad);
  pad.addEventListener('pointercancel', soltarPad);

  // botones de acción (mantener = keydown sostenido)
  const botones = [['tcorrer', SC.SPACE], ['tguardia', SC.CTRL], ['tgolpe', SC.ALT]];
  for (const [id, sc] of botones) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => { E.keys[sc] = 1; el.setPointerCapture(e.pointerId); e.preventDefault(); });
    el.addEventListener('pointerup', (e) => { E.keys[sc] = 0; e.preventDefault(); });
    el.addEventListener('pointercancel', () => { E.keys[sc] = 0; });
  }
  // pausa y salir (teclas directas)
  document.getElementById('tpausa').addEventListener('pointerdown', (e) => { tecla('P', 'KeyP', 'p'); e.preventDefault(); });
  document.getElementById('tsalir').addEventListener('pointerdown', (e) => { tecla('', 'Escape', 'Escape'); e.preventDefault(); });

  // capa de menús: 4 botones que lanzan las teclas numéricas del menú
  const menuBotones = [['tjugar', 'Digit3', '3'], ['tconfig', 'Digit1', '1'],
                       ['topciones', 'Digit2', '2'], ['tsalirmenu', 'Digit5', '5']];
  for (const [id, code, key] of menuBotones) {
    document.getElementById(id).addEventListener('pointerdown', (e) => { tecla(key, code, key); e.preventDefault(); });
  }
}

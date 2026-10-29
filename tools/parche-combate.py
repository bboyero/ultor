# Parche: los 5 ataques del BACKUP + recibe + dadoSI_NO(dano) + incENE/decENE
import sys
src = open('web/js/main.js', encoding='utf-8').read()
def sub(old, new, n=1):
    global src
    assert src.count(old) == n, 'fallo (%d): %s' % (src.count(old), old[:70])
    src = src.replace(old, new)

sub("""// dadoSI_NO: el golpe alcanza a los enemigos (por ahora sin IA, solo estructura)
function dadoSI_NO() {
  for (let num = 0; num < E.MALO.length; num++) {
    const m = E.MALO[num];
    const EL = { x1: m.Ex - E.PX, y1: m.Ey - E.PY, x2: m.Ex - E.PX + 23, y2: m.Ey - E.PY + 43 };
    if (m.vidaE > 0 && hayInterseccion(E.YO, EL)) {
      play('puno');
      m.vidaE--; actualizaVIDA_E();
      E.puntos += 8;
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
}""",
"""// dadoSI_NO(dano): el golpe alcanza a los enemigos (BACKUP)
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
}""")

sub("""  recibiendo: false, // el héroe acaba de recibir (no le pegan dos veces seguidas)""",
"""  recibiendo: false, // el héroe acaba de recibir (no le pegan dos veces seguidas)
  atacando: false,   // el héroe está dando un golpe
  tmp_recibe: 0,     // tipo de golpe que he dado (0 puño, 1 patada, 3 barriga)""")

open('web/js/main.js', 'w', encoding='utf-8').write(src)
print('parte 2 OK')

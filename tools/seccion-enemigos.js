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
  const d = DIME[nombre];
  const x = PEx - E.PX, y = PEy - E.PY;
  if (x < -50 || x > 320 || y < -40 || y > 176) return;
  const base = (m.clase === 1 ? CLASE_OFF : 0) + d.off;
  const datos = E.enemigo.subarray(base + d.X * d.Y * que, base + d.X * d.Y * (que + 1));
  if (m.sentidoE) E_putico(x, y, datos, d.X, d.Y);
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
    if (m.secuenciaE !== DIM.GUARDe.F - 2) m.secuenciaE++;
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
  if (m.secuenciaE === DIM.PUNOe.F) {
    m.secuenciaE = 0; como_me_dara(); m.Egolpeando = false;
    const EL = { x1: OX + E.eXcorrecion + ajst, y1: OY + 6,
                 x2: OX + DIM.PUNOe.X - 25, y2: OY + DIM.PUNOe.Y - 35 };
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
  if (m.secuenciaE === DIM.PAT1e.F - 1) {
    const EL = { x1: OX + E.eXcorrecion + ajst, y1: OY + 20,
                 x2: OX + DIM.PAT1e.X - 22, y2: OY + DIM.PAT1e.Y - 35 };
    if (!E.recibiendo && !E.subiendo && hayInterseccion(E.YO, EL) && E.vida > 0) recibe(3);
  } else if (m.secuenciaE === DIM.PAT1e.F) {
    m.secuenciaE = 0; como_me_dara(); m.Egolpeando = false;
  }
}

async function E_ataca() {
  const m = E.MALO[E.num];
  if (m.tipo_ataca === 0) E_punetazo();
  else E_patada();
  const OX = m.Ex - E.PX, OY = m.Ey - E.PY;
  if (!(((OX > E.Hx) && (OX - 25 <= E.Hx)) || ((OX < E.Hx) && (OX + 25 >= E.Hx)))) {
    m.secuenciaE = DIM.GUARDe.F - 2;
    m.ataca = false; m.Aguardia = false; m.noguardia = true;
  } else if (!((E.Hy >= OY - 40) && (E.Hy <= OY + 40))) {
    m.secuenciaE = DIM.GUARDe.F - 2;
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

// Música por situación: los .CMF del original (BASERHAP, DARKMOON, CROWLEY,
// ENEMYWIN, JERRYLEE — AdLib/OPL2) se sirven como mp3 pregrabados. Los ficheros
// se cargan si existen (assets/musica-<track>.mp3); si faltan, el juego sigue
// mudo de música. La grabación se hace en DOSBox (Ctrl+F6 con la música sonando).
const TRACKS = {
  menu: 'musica-menu.mp3',     // baserhap.cmf (menú principal)
  juego: 'musica-juego.mp3',   // darkmoon.cmf (partida)
  muerte: 'musica-muerte.mp3', // crowley.cmf (muerte / tiempo agotado)
  final: 'musica-final.mp3',   // enemywin.cmf (escapar)
  creditos: 'musica-creditos.mp3', // jerrylee.cmf (créditos)
};

let actual = null;
let bucle = null;

async function empezarMusica(track) {
  const nombre = TRACKS[track];
  if (!nombre) return;
  if (bucle) { bucle.pause(); bucle = null; }
  const a = new Audio('assets/' + nombre);
  a.loop = true;
  a.volume = 0.6;
  try {
    await a.play(); // si el fichero no existe, play() rechaza y seguimos mudos
    bucle = a;
    actual = track;
  } catch (e) { /* sin música para este track */ }
}

function pararMusica() {
  if (bucle) { bucle.pause(); bucle = null; }
  actual = null;
}

export { empezarMusica, pararMusica };

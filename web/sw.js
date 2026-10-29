// Service worker: ULTOR sin conexión (PWA instalable).
// Cache-first con caché versionada (subir la versión SIEMPRE que cambie web/).
const CACHE = 'ultor-v1';

const CORE = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './js/main.js', './js/menus.js', './js/sonido.js', './js/entrada-tactil.js',
  './assets/PALETA.L01', './assets/MAPA.DAT', './assets/FONDO.DAT',
  './assets/HOMBRE.DAT', './assets/DUNA2.DAT', './assets/ENEMIGO.DAT',
  './assets/ENEMIGO.LOC', './assets/SONIDO.DAT', './assets/MINI.DAT',
  './assets/NUMERO.DAT', './assets/PANEL.DAC', './assets/ULTOR.DAC',
  './assets/PRESENT.DAC', './assets/MENU1.DAC', './assets/MENU2.DAC',
  './assets/PAD.DAC', './assets/PAD1H0.DAC', './assets/PAD1H1.DAC',
  './assets/PAD1H2.DAC', './assets/PAUSA.DAC', './assets/ABANDONA.DAC',
  './assets/FINAL.DAC', './assets/GAME.DAC', './assets/CRANEO.DAC',
  './assets/TUMBA.DAC', './assets/PERIODIC.DAC',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })));
});

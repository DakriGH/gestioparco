/* Service worker: l'app deve partire anche senza rete.
   Strategia: rete-prima per l'HTML (così un aggiornamento si vede subito),
   cache-prima per CSS/JS/icone. Nessuna risorsa esterna da scaricare. */
const CACHE = 'gestioparco-v13';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './css/fonts.css',
  './js/avatar.js',
  './js/app.js',
  './js/dati.js',
  './js/cloud.js',
  './js/firebase-config.js',
  './fonts/fredoka-600.woff2',
  './fonts/fredoka-700.woff2',
  './fonts/inter-400.woff2',
  './fonts/inter-600.woff2',
  './fonts/inter-700.woff2',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
/* L'SDK di Firebase (js/vendor/) non sta qui apposta: pesa mezzo mega e
   serve solo a chi accende il cloud. Al primo caricamento con la rete
   finisce comunque in cache e da lì in poi funziona anche offline. */

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(err => console.warn('cache incompleta', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  const isDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // CSS/JS: di norma rispondo dalla cache (istantaneo) e ricontrollo in rete.
  // Ma se in cache c'è una versione DIVERSA (?v=… cambiato) vado prima in rete:
  // altrimenti servirebbe ricaricare due volte per vedere un aggiornamento.
  e.respondWith(
    // ignoreSearch: senza questo, cambiando ?v=… l'app offline non
    // troverebbe più i propri file e resterebbe con la pagina nuda.
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      // stessa versione in cache? la uso subito. Diversa (o assente)? rete,
      // con la copia vecchia come rete di sicurezza se si è offline.
      const vecchia = hit && new URL(hit.url).search !== new URL(req.url).search;
      return (hit && !vecchia) ? hit : net;
    })
  );
});

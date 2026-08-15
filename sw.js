/* Service worker: l'app deve partire anche senza rete.
   Strategia: rete-prima per l'HTML (così un aggiornamento si vede subito),
   cache-prima per CSS/JS/icone. Nessuna risorsa esterna da scaricare. */
const CACHE = 'gestioparco-v189';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './css/fonts.css',
  './js/icone.js',
  './js/avatar.js',
  './js/capi.js',
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
  /* NIENTE skipWaiting() qui: la versione nuova non deve sostituirsi da
     sola mentre uno sta registrando un ingresso. Resta in attesa e l'app
     la fa entrare quando non c'è niente a metà (vedi js/app.js). */
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(err => console.warn('cache incompleta', err))
  );
});

/* l'app dice "adesso puoi": si passa alla versione nuova */
self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'attiva-adesso') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* VIA LE VERSIONI VECCHIE DELLO STESSO FILE.
   `caches.match(..., {ignoreSearch:true})` guarda il primo che trova, e
   il primo era sempre quello entrato per primo: dopo un aggiornamento in
   cache restavano sia `app.css?v=306` sia `?v=307`, la ricerca pescava la
   306, la vedeva diversa da quella chiesta e andava in rete. Ogni volta.
   Cioe' dopo il primo aggiornamento l'app non partiva piu' dalla cache --
   proprio la cosa per cui il service worker esiste -- e su una linea
   ballerina si vedeva tutto.
   Messa dentro quella nuova, le altre copie dello stesso file se ne
   vanno: in cache ne resta una sola, ed e' quella giusta. */
function potaVersioni(cache, req) {
  const suo = new URL(req.url);
  return cache.keys().then(chiavi => Promise.all(chiavi.map(k => {
    const u = new URL(k.url);
    if (u.origin === suo.origin && u.pathname === suo.pathname && u.search !== suo.search) {
      return cache.delete(k);
    }
    return null;
  })));
}

/* LA RETE CHE NON RISPONDE È PEGGIO DELLA RETE ASSENTE.
   Senza linea `fetch` fallisce subito e si passa alla copia offline: un
   attimo. Ma con la linea DEBOLE -- il wifi del parco visto da lontano,
   o il portale di un hotspot che si mangia le richieste -- `fetch` non
   fallisce: ASPETTA. E il browser aspetta parecchio prima di arrendersi.
   Siccome la pagina è servita rete-prima, l'app restava bianca per tutto
   quel tempo. Un'app fatta apposta per lavorare senza rete non può
   restare ostaggio di una rete che c'è a metà.
   Adesso la rete corre contro un cronometro: se non risponde entro due
   secondi e mezzo si apre dalla copia offline, e l'aggiornamento lo si
   prende al giro dopo. Su una linea buona non cambia niente. */
const ATTESA_RETE = 2500;

function conTempo(promessa, ms, seScade) {
  return new Promise(ok => {
    let chiusa = false;
    const chiudi = (v) => { if (!chiusa) { chiusa = true; clearTimeout(t); ok(v); } };
    const t = setTimeout(() => { if (!chiusa) { chiusa = true; ok(seScade()); } }, ms);
    promessa.then(chiudi, () => chiudi(seScade()));
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  const isDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isDoc) {
    /* `cache: 'no-store'` non è un vezzo: GitHub Pages manda
       `Cache-Control: max-age=600`, quindi senza questo il browser
       restituiva al service worker la pagina di dieci minuti prima e
       l'app installata continuava a mostrare la versione vecchia. */
    const dallaRete = fetch(req, { cache: 'no-store' })
      .then(res => {
        /* SOLO UNA RISPOSTA BUONA ENTRA IN CACHE.
           Questo controllo c'era per CSS e JS ma non qui: un 404 o un
           502 di passaggio -- GitHub Pages ne fa, durante una
           pubblicazione -- finiva in cache al posto della pagina, e da
           li' in poi l'app offline apriva quello. Per sempre, perche'
           niente lo sostituiva. */
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
    const dallaCopia = () => caches.match(req).then(r => r || caches.match('./index.html'));
    e.respondWith(
      conTempo(dallaRete, ATTESA_RETE, dallaCopia)
        /* se la copia offline non c'e' ancora -- primissima apertura --
           non si puo' fare altro che aspettare la rete davvero */
        .then(r => r || dallaRete)
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
      const vecchia = hit && new URL(hit.url).search !== new URL(req.url).search;
      const net = fetch(req, vecchia ? { cache: 'no-store' } : undefined).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy).then(() => potaVersioni(c, req)));
        }
        return res;
      }).catch(() => hit);
      // stessa versione in cache? la uso subito. Diversa (o assente)? rete,
      // con la copia vecchia come rete di sicurezza se si è offline.
      if (hit && !vecchia) return hit;
      /* QUI IL CRONOMETRO NON CI VA, ED È UN ERRORE CHE HO GIÀ FATTO.
         Mettendocelo, una rete lenta faceva servire la copia VECCHIA di
         `app.js` mentre la pagina appena scaricata era quella nuova:
         l'app girava col codice di prima e il numero di versione in alto
         diceva quello nuovo, perché lo legge dal `?v=` scritto nella
         pagina. Cioè il numero mentiva — e quel numero esiste
         esattamente per non dover indovinare se una tavoletta è
         indietro.
         Un file con la versione sbagliata non si serve MAI: se la
         pagina è nuova, i suoi pezzi devono essere nuovi. Qui si
         aspetta. Non e' un rischio di attesa infinita: quando la
         versione in cache combacia -- cioe' sempre, tranne il primo
         caricamento dopo una pubblicazione -- da qui non si passa
         nemmeno, si esce dalla riga sopra senza toccare la rete.
         La `catch` sotto tiene comunque in piedi il caso vero di rete
         assente, dove non c'e' altro da servire. */
      return net;
    })
  );
});

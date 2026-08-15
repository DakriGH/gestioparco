/* ------------------------------------------------------------------
   Che i dati non si perdano.

   La memoria del browser da sola non basta: se lo spazio scarseggia il
   telefono la butta via senza chiedere niente, e "cancella dati di
   navigazione" la porta via in un colpo. Qui ci sono tre reti:

   1. SPAZIO PROTETTO — si chiede al browser di non buttare mai via i dati
      di questa app (navigator.storage.persist). Su un'app installata dalla
      schermata Home viene concesso senza nemmeno chiedere.
   2. SECONDA COPIA — tutto viene scritto anche in IndexedDB, che è un
      archivio vero e non la memoria veloce. Se la prima copia sparisce,
      all'avvio si rimette a posto da sola.
   3. COPIE DEL GIORNO — le ultime due settimane, una al giorno. Servono
      quando i dati ci sono ma sono sbagliati: un "cancella tutto" premuto
      per sbaglio, una modifica andata storta.

   Nessuna di queste ferma "cancella tutti i dati del sito" fatto a mano:
   per quello c'è il backup su file, che resta la copia vera.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  const NOME = 'gestioparco';
  const VERSIONE = 1;
  const NEG_DATI = 'dati';       // chiave -> valore (specchio della memoria)
  const NEG_COPIE = 'copie';     // giorno -> fotografia di tutto
  const QUANTE_COPIE = 14;

  let db = null;
  let protetto = null;

  function apri() {
    if (db) return Promise.resolve(db);
    return new Promise((ok, ko) => {
      if (!global.indexedDB) return ko(new Error('IndexedDB non disponibile'));
      const req = indexedDB.open(NOME, VERSIONE);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(NEG_DATI)) d.createObjectStore(NEG_DATI);
        if (!d.objectStoreNames.contains(NEG_COPIE)) d.createObjectStore(NEG_COPIE);
      };
      req.onsuccess = () => { db = req.result; ok(db); };
      req.onerror = () => ko(req.error);
      /* APERTURA BLOCCATA: succede quando un'altra scheda tiene l'archivio
         aperto a una versione diversa. Non arriva né onsuccess né onerror:
         senza questo, la promessa non si chiude MAI, e chi la stava
         aspettando resta lì per sempre. Meglio dire subito che non si
         può: la memoria veloce basta a lavorare. */
      req.onblocked = () => ko(new Error('archivio bloccato da un’altra scheda'));
    });
  }

  function conNegozio(nome, modo, fn) {
    return apri().then(d => new Promise((ok, ko) => {
      const t = d.transaction(nome, modo);
      const s = t.objectStore(nome);
      let esito;
      try { esito = fn(s); } catch (e) { return ko(e); }
      /* Una richiesta che non ha trovato niente ha `result` undefined: va
         restituito NULL, non la richiesta stessa. Prima usciva di qui un
         IDBRequest travestito da dato, e a salvarci era solo il
         `JSON.parse` che gli esplodeva addosso poco piu' in la'. */
      t.oncomplete = () => {
        if (esito && typeof esito === 'object' && 'result' in esito) {
          ok(esito.result === undefined ? null : esito.result);
          return;
        }
        ok(esito);
      };
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    }));
  }

  function scrivi(chiave, valore) {
    return conNegozio(NEG_DATI, 'readwrite', s => s.put(JSON.stringify(valore), chiave))
      .catch(e => { console.warn('seconda copia non riuscita', chiave, e); });
  }
  function leggi(chiave) {
    return conNegozio(NEG_DATI, 'readonly', s => s.get(chiave))
      .then(v => { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } })
      .catch(() => null);
  }

  /* ---------- spazio protetto ---------- */
  function proteggi() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
    return navigator.storage.persisted()
      .then(gia => gia ? true : navigator.storage.persist())
      .then(v => { protetto = !!v; return protetto; })
      .catch(() => false);
  }
  function spazio() {
    const base = { protetto: !!protetto, usato: 0, quota: 0 };
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(base);
    return navigator.storage.estimate()
      .then(e => ({ protetto: !!protetto, usato: e.usage || 0, quota: e.quota || 0 }))
      .catch(() => base);
  }

  /* ---------- copie del giorno ---------- */
  /* LA GIORNATA FINISCE ALLE QUATTRO, NON A MEZZANOTTE.
     La copia si archivia sotto la giornata a cui appartiene il lavoro,
     la stessa che usa il registro (`giornataDi` in app.js, affacciata
     come GIORNATA_DI). Con la mezzanotte del calendario una serata che
     scavallava finiva spezzata in due chiavi: le due settimane promesse
     diventavano una settimana di nottate, e "rimetti il giorno 11"
     poteva restituire lo stato delle due del mattino invece che quello
     di fine serata.
     Se app.js non c'e' -- dati.js da solo -- si ripiega sul giorno
     solare, che e' come faceva prima. */
  function oggi() {
    const ora = Date.now();
    const t = typeof global.GIORNATA_DI === 'function' ? global.GIORNATA_DI(ora) : ora;
    const d = new Date(t);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function copiaDelGiorno(tutto) {
    const g = oggi();
    return conNegozio(NEG_COPIE, 'readwrite', s => {
      s.put({ giorno: g, quando: Date.now(), dati: JSON.stringify(tutto) }, g);
      return null;
    }).then(potaCopie).catch(e => console.warn('copia del giorno', e));
  }
  function potaCopie() {
    return conNegozio(NEG_COPIE, 'readonly', s => s.getAllKeys()).then(chiavi => {
      const k = (chiavi || []).slice().sort();
      if (k.length <= QUANTE_COPIE) return;
      const via = k.slice(0, k.length - QUANTE_COPIE);
      return conNegozio(NEG_COPIE, 'readwrite', s => { via.forEach(x => s.delete(x)); return null; });
    });
  }
  function elencoCopie() {
    return conNegozio(NEG_COPIE, 'readonly', s => s.getAll()).then(v => {
      return (v || []).map(c => {
        let n = 0;
        try { n = (JSON.parse(c.dati).gp_entries || []).length; } catch (e) { n = 0; }
        return { giorno: c.giorno, quando: c.quando, ingressi: n };
      }).sort((a, b) => (a.giorno < b.giorno ? 1 : -1));
    }).catch(() => []);
  }
  function copia(giorno) {
    return conNegozio(NEG_COPIE, 'readonly', s => s.get(giorno))
      .then(c => { try { return c ? JSON.parse(c.dati) : null; } catch (e) { return null; } })
      .catch(() => null);
  }

  /* ---------- avvio ----------
     Se la memoria del browser è vuota ma la seconda copia c'è, rimetto
     tutto a posto prima che l'app cominci a leggere. */
  function avvia(chiavi) {
    protetto = null;
    return proteggi().then(() => {
      const manca = (chiavi || []).filter(k => !localStorage.getItem(k));
      if (!manca.length) return { ripristinate: [] };
      return Promise.all(manca.map(k => leggi(k).then(v => ({ k: k, v: v }))))
        .then(trovate => {
          const rimesse = [];
          trovate.forEach(t => {
            if (t.v === null || t.v === undefined) return;
            try { localStorage.setItem(t.k, JSON.stringify(t.v)); rimesse.push(t.k); } catch (e) {}
          });
          return { ripristinate: rimesse };
        });
    }).catch(() => ({ ripristinate: [] }));
  }

  global.DATI = {
    avvia: avvia,
    scrivi: scrivi,
    leggi: leggi,
    proteggi: proteggi,
    spazio: spazio,
    copiaDelGiorno: copiaDelGiorno,
    elencoCopie: elencoCopie,
    copia: copia,
    disponibile: () => !!global.indexedDB
  };
})(window);

/* ------------------------------------------------------------------
   Salvataggio in cloud, con accesso a utente e password.

   Due regole che non vanno tradite:
   1. la cassa non si ferma mai. L'app lavora sul tablet e il cloud è un
      ascoltatore: se manca la linea, o il cloud non è configurato, si
      registra lo stesso e i dati partono da soli quando torna la rete.
   2. il registro è UNO SOLO: chi entra vede gli stessi ingressi degli altri
      banchi, in tempo reale.

   L'SDK di Firebase sta in js/vendor/ (non su internet) e si carica solo
   se serve: l'app deve aprirsi in un attimo anche senza rete.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  const SDK = [
    'js/vendor/firebase-app-compat.js',
    'js/vendor/firebase-auth-compat.js',
    'js/vendor/firebase-firestore-compat.js'
  ];

  let auth = null, db = null;
  let utente = null;
  let stato = 'spento';        // spento | attesa | dentro | fuori | errore
  let motivo = '';
  let stopIngressi = null, stopMeta = null;
  let caricato = false;
  const osservatori = { stato: [], dati: [] };

  const cfg = () => global.FIREBASE_CONFIG || {};
  function configurato() {
    const c = cfg();
    return !!(c.apiKey && c.projectId);
  }
  const parco = () => global.PARCO_ID || 'parco';

  function avvisaStato() {
    osservatori.stato.forEach(fn => { try { fn(statoOra()); } catch (e) { console.error(e); } });
  }
  function avvisaDati(pacco) {
    osservatori.dati.forEach(fn => { try { fn(pacco); } catch (e) { console.error(e); } });
  }
  function statoOra() {
    return {
      stato: stato,
      motivo: motivo,
      email: utente ? utente.email : '',
      configurato: configurato(),
      online: navigator.onLine
    };
  }

  /* Firestore non digerisce `undefined`: ripulisco passando da JSON. */
  function pulito(x) {
    try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; }
  }

  /* L'ORA LA METTE IL SERVER, NON IL TABLET.
     Quando due casse toccano lo stesso gruppo vince l'ultima, e finche'
     l'ultima la decideva `Date.now()` di chi scriveva bastava una
     tavoletta con l'orologio avanti di due minuti perche' vincesse
     SEMPRE lei, anche quando aveva torto -- e nessuno se ne sarebbe
     accorto, perche' l'orario sbagliato se lo porta dietro il dato.
     `agg` resta scritto com'era (serve agli ingressi gia' in giro e a
     chi legge offline, dove il timbro del server non c'e' ancora):
     `aggS` e' quello buono, e chi confronta prende quello se c'e'. */
  function bollo() {
    try {
      const fb = global.firebase;
      return fb.firestore.FieldValue.serverTimestamp();
    } catch (e) { return null; }
  }

  function caricaSDK() {
    if (caricato) return Promise.resolve();
    return SDK.reduce((p, src) => p.then(() => new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => ko(new Error('non trovo ' + src));
      document.head.appendChild(s);
    })), Promise.resolve()).then(() => { caricato = true; });
  }

  /* ---------- avvio ---------- */
  function avvia() {
    if (!configurato()) { stato = 'spento'; avvisaStato(); return Promise.resolve(); }
    stato = 'attesa'; avvisaStato();
    return caricaSDK().then(() => {
      const fb = global.firebase;
      if (!fb.apps.length) fb.initializeApp(cfg());
      auth = fb.auth();
      db = fb.firestore();
      /* la cache locale di Firestore: le scritture fatte senza linea
         restano in coda e partono da sole al ritorno della rete */
      return db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    }).then(() => {
      auth.onAuthStateChanged(u => {
        utente = u || null;
        if (u) { stato = 'dentro'; motivo = ''; ascolta(); }
        else { stato = 'fuori'; staccaAscolto(); }
        avvisaStato();
      });
      window.addEventListener('online', avvisaStato);
      window.addEventListener('offline', avvisaStato);
    }).catch(e => {
      stato = 'errore';
      motivo = e && e.message ? e.message : String(e);
      avvisaStato();
    });
  }

  /* ---------- accesso ---------- */
  function messaggio(e) {
    const c = (e && e.code) || '';
    const m = (e && e.message) || '';
    if (c.indexOf('api-key-not-valid') > -1 || m.indexOf('api-key-not-valid') > -1 || c.indexOf('invalid-api-key') > -1)
      return 'La configurazione del cloud non è valida: ricontrolla i sei valori in js/firebase-config.js.';
    if (c.indexOf('configuration-not-found') > -1)
      return 'Nel progetto Firebase manca l’accesso con Email/Password: accendilo in Authentication → Sign-in method.';
    if (c.indexOf('invalid-email') > -1) return 'Indirizzo email non valido.';
    if (c.indexOf('missing-password') > -1) return 'Manca la password.';
    if (c.indexOf('weak-password') > -1) return 'Password troppo corta: almeno 6 caratteri.';
    if (c.indexOf('email-already-in-use') > -1) return 'Esiste già un accesso con questa email: entra invece di crearlo.';
    if (c.indexOf('invalid-credential') > -1 || c.indexOf('wrong-password') > -1 || c.indexOf('user-not-found') > -1)
      return 'Email o password non corretti.';
    if (c.indexOf('too-many-requests') > -1) return 'Troppi tentativi: aspetta qualche minuto.';
    if (c.indexOf('network') > -1) return 'Nessuna rete: non riesco a raggiungere il cloud.';
    if (c.indexOf('operation-not-allowed') > -1) return 'Nella console Firebase manca "Email/Password" fra i metodi di accesso.';
    return (e && e.message) || 'Non riesco a entrare.';
  }
  function entra(email, pw) {
    if (!auth) return Promise.reject(new Error('cloud non pronto'));
    return auth.signInWithEmailAndPassword(String(email || '').trim(), pw)
      .catch(e => { throw new Error(messaggio(e)); });
  }
  function registra(email, pw) {
    if (!auth) return Promise.reject(new Error('cloud non pronto'));
    return auth.createUserWithEmailAndPassword(String(email || '').trim(), pw)
      .catch(e => { throw new Error(messaggio(e)); });
  }
  function esci() { return auth ? auth.signOut() : Promise.resolve(); }

  /* ---------- ascolto del registro condiviso ---------- */
  function radice() { return db.collection('parchi').doc(parco()); }

  function ascolta() {
    staccaAscolto();
    stopIngressi = radice().collection('ingressi').onSnapshot(snap => {
      const cambi = [];
      snap.docChanges().forEach(c => {
        if (c.type === 'removed') cambi.push({ tipo: 'via', id: c.doc.id });
        else cambi.push({ tipo: 'metti', id: c.doc.id, dato: c.doc.data() });
      });
      if (cambi.length) avvisaDati({ tipo: 'ingressi', cambi: cambi, daCache: snap.metadata.fromCache });
    }, e => { motivo = messaggio(e); avvisaStato(); });

    stopMeta = radice().collection('meta').onSnapshot(snap => {
      snap.docChanges().forEach(c => {
        if (c.type === 'removed') return;
        avvisaDati({ tipo: c.doc.id, dato: c.doc.data() });
      });
    }, e => { motivo = messaggio(e); avvisaStato(); });
  }
  function staccaAscolto() {
    if (stopIngressi) { stopIngressi(); stopIngressi = null; }
    if (stopMeta) { stopMeta(); stopMeta = null; }
  }

  /* ---------- scrittura ----------
     Non aspetto la risposta: la coda di Firestore se ne occupa anche
     offline, e la cassa non deve mai restare ferma ad aspettare. */
  function attivo() { return !!(db && utente); }

  function salvaIngresso(e) {
    if (!attivo() || !e || !e.id) return;
    const d = pulito(e);
    d.agg = Date.now();
    d.aggS = bollo();
    d.aggDa = utente.email || '';
    radice().collection('ingressi').doc(String(e.id)).set(d).catch(err => console.warn('cloud', err));
  }
  function togliIngresso(id) {
    if (!attivo() || !id) return;
    radice().collection('ingressi').doc(String(id)).delete().catch(err => console.warn('cloud', err));
  }
  function salvaMeta(nome, dato) {
    if (!attivo()) return;
    const d = { dati: pulito(dato), agg: Date.now(), aggS: bollo(), aggDa: utente.email || '' };
    radice().collection('meta').doc(nome).set(d).catch(err => console.warn('cloud', err));
  }

  /* Primo accesso da un tablet che ha già lavorato da solo: quello che c'è
     qui va portato su, senza cancellare quello che c'è già in cloud. */
  /* UN BATCH DI FIRESTORE TIENE 500 OPERAZIONI, NON UNA IN PIU'.
     Con tutto in un lotto solo, un tablet che aveva lavorato da solo per
     una stagione non caricava NIENTE: il commit falliva per intero, e
     l'unica traccia era un avviso nella console mentre l'app diceva
     "mandati 0 ingressi" come se non ci fosse stato niente da mandare.
     Adesso si va a scaglioni, uno alla volta, e ogni scaglione risponde
     per se': se uno non passa gli altri salgono lo stesso, e il numero
     che torna e' quello DAVVERO salito, cosi' chi guarda se ne accorge. */
  const PER_LOTTO = 400;

  function primaSalita(entries, impostazioni, presets) {
    if (!attivo()) return Promise.resolve(0);
    const buoni = (entries || []).filter(e => e && e.id);
    const scaglioni = [];
    for (let i = 0; i < buoni.length; i += PER_LOTTO) scaglioni.push(buoni.slice(i, i + PER_LOTTO));

    let saliti = 0;
    let catena = Promise.resolve();
    scaglioni.forEach(pezzo => {
      catena = catena.then(() => {
        const lotto = db.batch();
        pezzo.forEach(e => {
          const d = pulito(e);
          d.agg = e.agg || Date.now();
          d.aggS = bollo();
          d.aggDa = utente.email || '';
          lotto.set(radice().collection('ingressi').doc(String(e.id)), d, { merge: true });
        });
        return lotto.commit()
          .then(() => { saliti += pezzo.length; })
          .catch(err => { console.warn('cloud: uno scaglione non e’ salito', err); });
      });
    });

    /* le due meta in un lotto loro: se falliscono, gli ingressi restano su */
    catena = catena.then(() => {
      if (!impostazioni && !presets) return;
      const lotto = db.batch();
      if (impostazioni) lotto.set(radice().collection('meta').doc('impostazioni'),
        { dati: pulito(impostazioni), agg: Date.now(), aggS: bollo(), aggDa: utente.email || '' }, { merge: true });
      if (presets) lotto.set(radice().collection('meta').doc('presets'),
        { dati: pulito(presets), agg: Date.now(), aggS: bollo(), aggDa: utente.email || '' }, { merge: true });
      return lotto.commit().catch(err => { console.warn('cloud', err); });
    });

    return catena.then(() => saliti);
  }

  global.CLOUD = {
    configurato: configurato,
    avvia: avvia,
    entra: entra,
    registra: registra,
    esci: esci,
    stato: statoOra,
    suStato: fn => { osservatori.stato.push(fn); },
    suDati: fn => { osservatori.dati.push(fn); },
    salvaIngresso: salvaIngresso,
    togliIngresso: togliIngresso,
    salvaMeta: salvaMeta,
    primaSalita: primaSalita
  };
})(window);

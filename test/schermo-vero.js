/* ══════════════════════════════════════════════════════════
   IL BANCO DI PROVA A VIDEO
   Gli altri file provano i CONTI dentro node, con un DOM finto: sono
   veloci e girano da soli, ma non premono i tasti. Questo preme i tasti
   davvero, nell'app vera, e controlla la cosa che il DOM finto non puo'
   vedere: che quello che appare a video sia anche quello che finisce
   sul disco.

   E' l'unico modo che ho di provare i flussi che rispondono IN
   DIFFERITA -- quelli che aprono un foglio e aspettano una scelta --
   ed e' proprio li' che si sono nascosti i guasti peggiori: il tempo
   che cambiava a video e non veniva salvato, l'estensione che sembrava
   non fare niente.

   COME SI USA
     1. apri l'app con  index.html?nosw
     2. apri la console del browser
     3. incolla il contenuto di questo file e premi invio

   Non serve niente di installato: nessun pacchetto, nessun browser
   pilotato. Cancella gli ingressi di prova che crea, quindi NON va
   lanciato su un tablet che sta lavorando.
   ══════════════════════════════════════════════════════════ */
(async function bancoAVideo() {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     UN OROLOGIO CHE IL BROWSER NON PUO' STROZZARE

     Con la finestra in secondo piano -- o il pannello del browser
     chiuso -- Chrome strozza i timer della pagina a UNO AL SECONDO e
     smette di disegnare fotogrammi. Questo banco di prova e' fatto di
     attese: «premi, aspetta che l'animazione finisca, guarda». Con i
     timer strozzati ogni attesa da settanta millesimi ne costa mille,
     e il giro completo passa da un minuto a piu' di dieci; e le
     animazioni dell'app, che stanno dentro `requestAnimationFrame`,
     non partono affatto.
     Risultato: la prova che serve a dire se l'app funziona si poteva
     lanciare solo stando li' a guardarla. Una prova che chiede
     attenzione umana per girare e' una prova che non gira.

     I timer dentro un WORKER non vengono strozzati: gira in un altro
     filo, e a quel filo il browser non guarda in faccia. Quindi qui si
     prende un worker che fa da sveglia e ci si appoggiano sia le
     attese di questa prova sia i timer e i fotogrammi dell'app --
     `setTimeout`, `setInterval`, `requestAnimationFrame` -- per tutta
     la durata del giro. Alla fine si rimette tutto com'era.
     Non cambia NIENTE di quello che si prova: cambia solo chi tiene il
     tempo. Le misure restano quelle vere, perche' il worker aspetta i
     millesimi giusti.
     ══════════════════════════════════════════════════════════ */
  const sveglia = (() => {
    try {
      const codice = 'onmessage=function(e){setTimeout(function(){postMessage(e.data.id)},e.data.ms)}';
      const w = new Worker(URL.createObjectURL(new Blob([codice], { type: 'text/javascript' })));
      const attesi = new Map();
      let n = 0;
      w.onmessage = e => { const f = attesi.get(e.data); if (f) { attesi.delete(e.data); f(); } };
      return {
        dopo(fn, ms) { const id = ++n; attesi.set(id, fn); w.postMessage({ id: id, ms: Math.max(0, ms || 0) }); return id; },
        togli(id) { attesi.delete(id); },
        chiudi() { w.terminate(); }
      };
    } catch (e) { return null; }
  })();

  /* i veri, da rimettere a posto quando si finisce */
  const veri = { st: window.setTimeout, ct: window.clearTimeout,
    si: window.setInterval, ci: window.clearInterval, raf: window.requestAnimationFrame };
  /* SI MISURA QUANTO CI METTE DAVVERO UN TIMER.
     Non si chiede al browser se e' in secondo piano
     (`document.visibilityState` dice «visibile» anche quando la
     finestra c'e' ma il pannello che la mostra e' chiuso), e non basta
     nemmeno guardare se arrivano i fotogrammi: le due cose vanno per
     conto loro, e ne ho visto uno arrivare con i timer gia' strozzati.
     L'unica risposta che vale e' quella dei fatti: si chiede una
     sveglia da cinquanta millesimi e si guarda l'orologio. Se ne sono
     passati piu' di trecento, il browser sta strozzando. */
  const strozzati = await new Promise(r => {
    const t = performance.now();
    veri.st.call(window, () => r(performance.now() - t > 300), 50);
  });
  if (sveglia && strozzati) {
    const vivi = new Set();
    window.setTimeout = (fn, ms) => sveglia.dopo(() => { if (typeof fn === 'function') fn(); }, ms);
    window.clearTimeout = id => sveglia.togli(id);
    window.setInterval = (fn, ms) => {
      const box = { id: 0, morto: false };
      const giro = () => { if (box.morto) return; if (typeof fn === 'function') fn();
        box.id = sveglia.dopo(giro, ms); };
      box.id = sveglia.dopo(giro, ms);
      vivi.add(box);
      return box;
    };
    window.clearInterval = box => { if (box && typeof box === 'object') { box.morto = true; sveglia.togli(box.id); vivi.delete(box); } };
    /* i fotogrammi non arrivano: si chiamano a mano, sedici millesimi
       alla volta. Le misure (`getBoundingClientRect`) funzionano lo
       stesso: il browser calcola la disposizione anche quando non
       disegna. */
    window.requestAnimationFrame = fn => sveglia.dopo(() => fn(performance.now()), 16);
  }
  const rimettiOrologio = () => {
    if (!(sveglia && strozzati)) return;
    window.setTimeout = veri.st; window.clearTimeout = veri.ct;
    window.setInterval = veri.si; window.clearInterval = veri.ci;
    window.requestAnimationFrame = veri.raf;
    sveglia.chiudi();
  };

  const att = ms => new Promise(r => (sveglia ? sveglia.dopo(r, ms) : veri.st(r, ms)));
  const esiti = [];
  const p = (nome, ok, dett) => esiti.push({ nome, ok: !!ok, dett: dett || '' });

  /* memoria e disco devono dire la stessa cosa: e' LA garanzia */
  const chiave = e => [e.id, e.status, e.children, e.crazyJumping, e.durationMinutes,
    e.paidPark, e.paidBar, e.parcoDa || 0, e.regaloFinoA || 0,
    e.sigla || '', String(e.note || '')].join('/');
  const allineati = () => {
    const disco = JSON.parse(localStorage.getItem('gp_entries') || '[]');
    return entries.map(chiave).sort().join('\n') === disco.map(chiave).sort().join('\n');
  };

  /* LA SCHEDA SI PRENDE PER NOME, NON PER POSTO.
     Era «la prima della lista», e ha funzionato finche' la lista stava
     ferma. Adesso i riquadri si riordinano da soli in ordine di
     uscita, un secondo dopo l'altro: allungando il tempo a un gruppo
     -- che e' proprio quello che queste prove fanno di continuo -- la
     scheda scivola in fondo, e «la prima» diventa un ALTRO gruppo a
     meta' di un controllo. Da qui in poi si guarda sempre quella che
     si sta provando, dovunque sia finita. */
  let cardId = null;
  const card = () => (cardId && document.querySelector('#view-active .entry[data-id="' + cardId + '"]')) ||
    document.querySelector('#view-active .entry');
  /* e chi prepara una sezione dice qual e' la sua */
  const guarda = id => { cardId = id; };
  const cella = nome => [...card().querySelectorAll('.e-colonna > .e-cella')]
    .find(c => c.querySelector('.e-nome').textContent === nome);
  const tastiTempo = () => [...cella('Tempo').querySelectorAll('button:not(.e-aperto)')];
  const scelte = () => [...document.querySelectorAll('#modalRoot .scelta-riga')];
  const modale = () => !document.getElementById('modalRoot').classList.contains('hidden');
  const toastAnnulla = () => document.querySelector('#toast button.annulla');

  /* ASPETTARE LA COSA, NON UN TEMPO.
     I controlli aspettavano tot millisecondi e poi guardavano. Ma
     l'uscita si accartoccia per 320ms prima di mostrare l'annulla, e
     con la lista da rifare sotto bastava una macchina un filo piu'
     lenta perche' i 700ms d'attesa scadessero un pelo prima: il banco
     diceva «l'annulla non funziona» mentre funzionava benissimo.
     Un banco di prova che sbaglia da solo e' peggio di nessun banco:
     fa cercare guasti che non ci sono. */
  const finche = async (cond, max) => {
    const fino = Date.now() + (max || 3000);
    while (Date.now() < fino) {
      if (cond()) return true;
      await att(40);
    }
    return cond();
  };
  const conAnnulla = () => finche(toastAnnulla);

  /* A SCHEDA NASCOSTA NON SI PUO' PROVARE.
     L'uscita si accartoccia dentro un requestAnimationFrame, e il
     browser i fotogrammi non li disegna affatto se la finestra e' in
     secondo piano o il pannello e' chiuso: li' `dopo()` non parte mai,
     l'annulla non compare, e il banco accuserebbe l'app di un guasto
     che e' solo la finestra nascosta. Si guarda prima se i fotogrammi
     girano, e se non girano lo si dice invece di dare la colpa. */
  const fotogrammiVivi = await new Promise(r => {
    let visto = false;
    requestAnimationFrame(() => { visto = true; });
    setTimeout(() => r(visto), 400);
  });
  if (!fotogrammiVivi) {
    console.log('  ATTENZIONE: la finestra non disegna fotogrammi (pannello nascosto o scheda in ' +
      'secondo piano). I controlli sull annulla dell uscita non si possono fare: portala in primo piano.');
  }

  /* un gruppo dentro, sforato di quanto si vuole */
  const prepara = (sforo) => {
    localStorage.removeItem('gp_entries');
    entries.length = 0;
    draft = freshDraft();
    const ms5 = 5 * 60000;
    const t0 = Math.round((Date.now() - (30 + sforo) * 60000) / ms5) * ms5;
    const e = normalizeEntries([{
      id: 'prova' + Math.random().toString(36).slice(2, 7),
      startTime: t0, createdAt: t0, oraManuale: true,
      children: 2, durationMinutes: 30, baseMinutes: 30
    }])[0];
    entries.push(e);
    saveEntries();
    showArchive = false;
    switchTab('active');
    buildActiveView();
    return e;
  };

  /* ── 1. ALLUNGARE A CHI HA SFORATO: le due strade del foglio ── */
  prepara(25);
  tastiTempo()[1].click(); await att(150);
  p('sforo grosso: si apre il foglio', modale());
  scelte()[0].click(); await att(200);
  p('«riparti da adesso» salva davvero', allineati() && entries[0].durationMinutes === 35);
  p('  e non sono piu scaduti', endTimeOf(entries[0]) > Date.now());

  prepara(25);
  tastiTempo()[1].click(); await att(150);
  scelte()[1].click(); await att(200);
  p('«scala lo sforo» salva davvero', allineati() && entries[0].durationMinutes === 35);

  prepara(4);
  tastiTempo()[1].click(); await att(200);
  p('sforo piccolo: non chiede e salva', !modale() && allineati() && entries[0].durationMinutes === 35);

  /* ── 2. IL REGALO DI UN GIRO A TEMPO SCADUTO ── */
  prepara(6);
  card().querySelector('.e-crazycard [data-add="crazy"]:not(.bc-su)').click(); await att(200);
  const resta = (endTimeOf(entries[0]) - Date.now()) / 60000;
  p('un giro a tempo scaduto regala i minuti interi',
    resta >= settings.crazyExtraMinutes, Math.round(resta) + ' min');
  p('  e resta salvato', allineati());

  /* ── 3. USCITA, ELIMINA E I LORO ANNULLA ── */
  prepara(0);
  chiudiIngresso(entries[0]); await att(200);
  scelte()[0].click(); await conAnnulla();
  p('uscita: salvata', allineati() && entries[0].status === 'closed');
  if (await conAnnulla()) toastAnnulla().click(); await att(250);
  /* l'unico che passa dall'animazione d'uscita: a fotogrammi fermi non
     si puo' provare, e dirlo e' piu' onesto che darlo per rotto */
  if (fotogrammiVivi) p('  e l annulla la disfa', allineati() && entries[0].status === 'active');
  else { entries[0].status = 'active'; delete entries[0].closedAt; delete entries[0].costoFinale; saveEntries(); }

  chiudiIngresso(entries[0]); await att(200);
  scelte()[1].click(); await conAnnulla();
  p('elimina: salvata', allineati() && entries.length === 0);
  if (await conAnnulla()) toastAnnulla().click(); await att(250);
  p('  e l annulla la disfa', allineati() && entries.length === 1);

  /* ── 4. ARCHIVIO: elimina e rimetti dentro, coi loro annulla ── */
  {
    const e = entries[0];
    const d = dueOf(e);
    e.costoFinale = { parco: d.park, bar: d.bar };
    e.status = 'closed'; e.closedAt = Date.now();
    saveEntries(); showArchive = true; buildActiveView(); await att(150);
    [...document.querySelectorAll('.arch-tasti button')].find(b => /Elimina/.test(b.textContent)).click();
    await att(150);
    [...document.querySelectorAll('#modalRoot button')].find(b => /Conferma/.test(b.textContent)).click();
    await att(300);
    p('archivio, elimina: salvata', allineati() && entries.length === 0);
    if (await conAnnulla()) toastAnnulla().click(); await att(250);
    p('  e l annulla la disfa', allineati() && entries.length === 1);

    showArchive = true; buildActiveView(); await att(150);
    [...document.querySelectorAll('.arch-tasti button')].find(b => /Rimetti/.test(b.textContent)).click();
    await att(250);
    p('archivio, rimetti dentro: salvata', allineati() && entries[0].status === 'active');
    if (await conAnnulla()) toastAnnulla().click(); await att(250);
    p('  e l annulla lo riarchivia', allineati() && entries[0].status === 'closed');
  }

  /* ── 5. LA NOTA: si legge senza aprire, si scrive toccandola ── */
  /* si torna fra chi e' dentro: la sezione prima lascia in vista
     l'archivio, e li' le schede sono un'altra cosa */
  showArchive = false;
  prepara(0);
  {
    const striscia = card().querySelector('.e-nota');
    p('a vuoto la nota non ingombra la lista',
      striscia && striscia.getBoundingClientRect().height === 0);
    card().querySelector('.e-riga').click(); await att(250);
    p('  e col tocco compare', card().querySelector('.e-nota').getBoundingClientRect().height > 0);
    card().querySelector('.e-nota').click(); await att(200);
    const campo = document.querySelector('.nota-campo');
    p('  toccandola si apre il foglio', !!campo);
    if (campo) {
      campo.value = 'torta in frigo';
      [...document.querySelectorAll('#modalRoot button')].find(b => /Salva/.test(b.textContent)).click();
      await att(250);
      p('  e la nota si salva', allineati() && entries[0].note === 'torta in frigo');
      if (await conAnnulla()) toastAnnulla().click(); await att(250);
      p('  e l annulla la toglie', allineati() && !String(entries[0].note || '').trim());
    }
  }

  /* ── 6. NIENTE ESCE DALLO SCHERMO ── */
  {
    showArchive = false; switchTab('active'); buildActiveView(); await att(150);
    const lim = document.documentElement.clientWidth;
    const fuori = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.getBoundingClientRect().right > lim + 1) fuori.push(el.className || el.tagName);
    });
    p('niente esce dallo schermo a ' + innerWidth + 'px',
      !fuori.length, [...new Set(fuori)].slice(0, 4).join(', '));
  }

  /* ── 7. LA RUOTA DEI COLORI ──
     Qui ci vuole per forza un browser vero: il DOM finto non dipinge
     niente e non fa animazioni, e proprio l'animazione d'ingresso della
     scatola nascondeva un guasto -- il segno veniva misurato mentre la
     scatola era ancora rimpicciolita e finiva un paio di pixel dentro.
     Le prove in node controllano che la FORMULA e il DISEGNO combacino;
     queste controllano che combacino anche le DITA. */
  {
    showArchive = false;
    entries.length = 0; localStorage.removeItem('gp_entries'); saveEntries();
    draft = freshDraft();
    draft.people = [{ id: 'ruota1', role: 'mamma', name: '', avatar: AV.baseFor('mamma'), note: '', tocco: false }];
    switchTab('new'); await att(200);
    const lista = document.querySelector('.person-list.pc-people');
    lista.dataset.apri = 'ruota1'; lista.dataset.sig = '';
    syncPeople(lista, draft.people, lista.__cambia); await att(200);

    /* il browser restituisce i colori come "rgb(r, g, b)": per
       confrontarli con un esadecimale bisogna parlare la sua lingua */
    const inRgb = (esa) => {
      const n = parseInt(esa.slice(1), 16);
      return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
    };
    const tasto = () => document.querySelector('.person-list.pc-people button.ruota[data-ruota]');
    const tocca = async (fx, fy, aspetta) => {
      tasto().click(); await att(aspetta === undefined ? 220 : aspetta);
      const ce = document.querySelector('.ruota-cerchio'), r = ce.getBoundingClientRect();
      ce.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true,
        clientX: r.left + r.width / 2 + fx * r.width / 2,
        clientY: r.top + r.height / 2 + fy * r.height / 2 }));
      ce.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true }));
      const c = draft.people[0].avatar.top.color;
      document.querySelectorAll('.ruota-box').forEach(x => x.remove());
      await att(120);
      return c;
    };

    /* la tinta in cima e' il rosso, e in fondo il suo opposto: erano
       scambiate, ed e' il guasto per cui "il colore non restava" */
    const su = esaInHsl(await tocca(0, -0.9));
    const giu = esaInHsl(await tocca(0, 0.9));
    p('in cima alla ruota si prende il rosso', su.h <= 6 || su.h >= 354, 'tinta ' + su.h);
    p('  e in fondo il suo opposto', Math.abs(giu.h - 180) <= 6, 'tinta ' + giu.h);
    p('  e verso il bordo il colore e pieno', su.s >= 85, 'saturazione ' + su.s);

    /* il centro e' grigio nel disegno: deve esserlo anche nel dato */
    const mezzo = esaInHsl(await tocca(0.02, 0.02));
    p('al centro si prende un grigio', mezzo.s <= 12, 'saturazione ' + mezzo.s);

    /* riaprendo SUBITO, cioe' in piena animazione: e' il caso che
       sbagliava la misura */
    const scelto = await tocca(-0.6, -0.6);
    tasto().click(); await att(15);
    const segno = document.querySelector('.ruota-punta');
    const cer = document.querySelector('.ruota-cerchio');
    const mezza = cer.offsetWidth / 2;
    const qx = (parseFloat(segno.style.left) - mezza) / mezza;
    const qy = (parseFloat(segno.style.top) - mezza) / mezza;
    /* il segno dice TINTA e intensita', non il chiaro-scuro: quello sta
       sulla striscia sotto. Quindi si rilegge alla luce del colore, se
       no si confronta un rosa chiaro con lo stesso rosa a mezza luce e
       sembra sbagliato mentre il segno e' al suo posto. */
    const indicato = coloreDelPunto(qx * mezza, qy * mezza, mezza, esaInHsl(scelto).l);
    p('riaprendo, il segno torna sul colore che c e gia', indicato === scelto,
      indicato === scelto ? '' : 'indica ' + indicato + ' invece di ' + scelto);
    document.querySelectorAll('.ruota-box').forEach(x => x.remove());
    await att(150);

    /* e la tavolozza deve DIRE che un colore scelto a mano c'e' */
    const t = tasto();
    p('un colore scelto a mano accende il tasto della ruota', t.classList.contains('on'));
    const addosso = getComputedStyle(t).backgroundColor;
    p('  e il tasto se lo mette addosso', addosso === inRgb(scelto),
      addosso === inRgb(scelto) ? '' : addosso + ' invece di ' + scelto);
    p('  con il bordo bianco delle pastiglie scelte',
      getComputedStyle(t).borderTopColor === 'rgb(255, 255, 255)', getComputedStyle(t).borderTopColor);

    /* ── il chiaro-scuro ──
       Il cerchio sa dipingere una luce sola, quella di mezzo, e sopra
       ci va un velo nero o bianco che lo porta alla luce scelta. Se il
       coprente del velo non fosse esatto, il cerchio tornerebbe a dire
       una cosa mentre la formula ne prende un'altra -- lo stesso
       guasto di prima, sull'altro asse. In node non si vede: li' non
       c'e' nessun velo da leggere. */
    tasto().click(); await att(220);
    {
      const ce = document.querySelector('.ruota-cerchio');
      const r = ce.getBoundingClientRect();
      /* prima una tinta dal cerchio, poi il passo piu' scuro */
      ce.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, bubbles: true,
        clientX: r.left + r.width / 2, clientY: r.top + 8 }));
      ce.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, bubbles: true }));
      const strisce = document.querySelectorAll('.ruota-scala');
      p('sotto il cerchio ci sono due strisce: il chiaro-scuro e i grigi', strisce.length === 2);
      const passi = [...strisce[0].querySelectorAll('button')];
      p('  e il chiaro-scuro ha i suoi sette passi', passi.length === LUCI.length);

      passi[0].click(); await att(150);
      const scuro = draft.people[0].avatar.top.color;
      const q = esaInHsl(scuro);
      p('scegliendo il passo piu scuro si prende un colore scuro',
        Math.abs(q.l - LUCI[0]) <= 1, 'luce ' + q.l + ' invece di ' + LUCI[0]);
      p('  e la tinta resta quella toccata sul cerchio', q.h <= 6 || q.h >= 354, 'tinta ' + q.h);
      p('  e il nome lo dice', /scur/.test(AV.colorName(scuro, 0)), AV.colorName(scuro, 0));

      /* IL VELO DEVE DIRE IL VERO: quello che si vede sul cerchio,
         composto davvero come lo compone il browser, e' il colore che
         si prende */
      const vel = document.querySelector('.ruota-luce');
      const alfa = parseFloat(getComputedStyle(vel).opacity);
      const sopra = getComputedStyle(vel).backgroundColor.includes('255, 255, 255') ? 255 : 0;
      const mezzo = hslInEsa(q.h, q.s, 50);
      const rgbDi = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
      const visto = rgbDi(mezzo).map(v => Math.round(v * (1 - alfa) + sopra * alfa));
      const preso = rgbDi(scuro);
      const scarto = Math.max(...[0, 1, 2].map(i => Math.abs(visto[i] - preso[i])));
      p('  e il cerchio si vede proprio di quel colore', scarto <= 2,
        'si vede ' + visto.join(',') + ' e si prende ' + preso.join(','));

      /* e cambiando tinta il chiaro-scuro RESTA: se ripartisse da mezza
         luce bisognerebbe riscegliere lo scuro a ogni tocco */
      const ce2 = document.querySelector('.ruota-cerchio'), r2 = ce2.getBoundingClientRect();
      ce2.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 12, bubbles: true,
        clientX: r2.right - 8, clientY: r2.top + r2.height / 2 }));
      ce2.dispatchEvent(new PointerEvent('pointerup', { pointerId: 12, bubbles: true }));
      await att(150);
      const dopo = esaInHsl(draft.people[0].avatar.top.color);
      p('cambiando tinta il chiaro-scuro resta', Math.abs(dopo.l - LUCI[0]) <= 1,
        'luce ' + dopo.l + ' invece di ' + LUCI[0]);
      p('  ma la tinta e cambiata', Math.abs(dopo.h - 90) <= 8, 'tinta ' + dopo.h);

      /* i grigi restano a un tocco: bianco e nero sui vestiti sono i
         colori piu' comuni */
      const grigi = [...strisce[1].querySelectorAll('button')];
      grigi[grigi.length - 1].click(); await att(150);
      const bianco = esaInHsl(draft.people[0].avatar.top.color);
      p('i grigi restano a un tocco solo', bianco.s === 0, 'saturazione ' + bianco.s);
      document.querySelectorAll('.ruota-box').forEach(x => x.remove());
      await att(150);
    }

    /* e prendendo un colore DALLA FILA il tasto torna l'arcobaleno */
    const pastiglia = document.querySelector('.person-list.pc-people [data-col^="top|color|"]');
    pastiglia.click(); await att(200);
    p('e scegliendo dalla fila il tasto torna l arcobaleno',
      !tasto().classList.contains('on'));

    draft = freshDraft();
  }

  /* ── 8. LA CARD A TEMPO APERTO ──
     La cella del Tempo veniva NASCOSTA tutta intera quando il tempo era
     aperto, e dentro c'era anche l'interruttore: da una scheda a tempo
     aperto non si poteva piu' ne' toccare il tempo ne' richiuderlo, e
     restava li' una targhetta che non faceva niente. In node non si
     vede -- il DOM finto non ha ne' celle ne' tasti. */
  {
    showArchive = false;
    entries.length = 0; localStorage.removeItem('gp_entries');
    const t0 = Date.now() - 43 * 60000;
    guarda('ap'); entries.push(normalizeEntries([{ id: 'ap', startTime: t0, createdAt: t0, oraManuale: true,
      children: 2, durationMinutes: 0, baseMinutes: 0, payLater: true }])[0]);
    saveEntries(); switchTab('active'); buildActiveView(); await att(300);

    const cellaTempo = () => [...card().querySelectorAll('.e-colonna > .e-cella')]
      .find(c => c.querySelector('.e-nome').textContent === 'Tempo');
    const vivi = () => [...cellaTempo().querySelectorAll('button')]
      .filter(b => !b.classList.contains('hidden')).map(b => b.textContent.trim());

    p('a tempo aperto la cella del Tempo resta al suo posto', !!cellaTempo());
    p('  e l interruttore resta raggiungibile', vivi().some(t => /Tempo aperto/.test(t)));
    p('  al posto del meno e del piu c e la pausa', vivi().some(t => /Pausa/.test(t)) &&
      !vivi().some(t => /^[−+]/.test(t)), vivi().join(' | '));
    p('  e il numero grande dice i minuti, non un trattino',
      /\d/.test(cellaTempo().querySelector('.v').textContent),
      cellaTempo().querySelector('.v').textContent);

    /* la pausa, premuta davvero */
    cellaTempo().querySelector('.e-pausa').click(); await att(250);
    p('la pausa ferma l orologio', !!entries[0].pausaDa && allineati());
    p('  e il tasto diventa Riprendi', /Riprendi/.test(cellaTempo().querySelector('.e-pausa').textContent));
    const fermoA = contiAperto(entries[0]).contati;
    p('  e il conto da fermo non cresce',
      Math.abs(contiAperto(entries[0], Date.now() + 60 * 60000).contati - fermoA) < 0.2);
    cellaTempo().querySelector('.e-pausa').click(); await att(250);
    /* TOLLERANZA LARGA, E PER FORZA: fra la pausa e la ripresa passano
       due attese, e a pannello nascosto il browser strozza i timer a
       uno al secondo -- 250ms diventano un secondo e mezzo. Stretta a
       dodici secondi la prova falliva per colpa dell'ambiente, non del
       codice. Quello che deve valere e' che riprendendo non si torni a
       zero ne' si salti avanti di minuti: mezzo minuto di margine lo
       dice benissimo. */
    p('  e riprendendo riparte da dove era', !entries[0].pausaDa && allineati() &&
      Math.abs(contiAperto(entries[0]).contati - fermoA) < 0.5,
      'contati ' + contiAperto(entries[0]).contati.toFixed(2) + ' invece di ' + fermoA.toFixed(2));

    /* e si torna a tempo comprato dall interruttore, che prima spariva */
    cellaTempo().querySelector('.e-aperto').click(); await att(300);
    p('dall interruttore si torna a tempo comprato', !entries[0].payLater && allineati());
    p('  e il meno e il piu tornano', vivi().some(t => /^[−+]/.test(t)), vivi().join(' | '));
  }

  /* ── 9. LE DUE SCHERMATE DELLO STESSO GRUPPO SANNO LE STESSE COSE ──
     Il mini menu della scheda in lista era diventato piu' capace del
     pannello che si apre con «Modifica» -- cioe' del posto dove si va
     per cambiare le cose per bene. Due schermate per lo stesso gruppo
     che sanno fare cose diverse sono un posto dove si cerca un tasto e
     non c'e'. */
  {
    showArchive = false;
    entries.length = 0; localStorage.removeItem('gp_entries');
    const t0 = Date.now() - 43 * 60000;
    guarda('due'); entries.push(normalizeEntries([{ id: 'due', startTime: t0, createdAt: t0, oraManuale: true,
      children: 2, durationMinutes: 0, baseMinutes: 0, payLater: true }])[0]);
    saveEntries(); switchTab('active'); buildActiveView(); await att(300);

    /* IL TASTO SI CERCA PER DOVE PORTA, NON PER COME SI CHIAMA: col
       2.0 acceso si chiama «Parco», e cercando «Modifica» questa
       sezione esplodeva -- non per un guasto dell'app, ma perche' la
       prova dava per scontata una delle due grafiche. Il nome lo
       controlla la sezione 11, che e' il suo mestiere. */
    [...card().querySelectorAll('button.conto')].find(b => /Modifica|Parco/.test(b.textContent)).click();
    await att(500);
    const chip = t => [...document.querySelectorAll('.pc-dur .chip')]
      .find(c => new RegExp(t).test(c.textContent));

    /* LA PAUSA SI CERCA PER QUELLO CHE FA, NON PER DOVE STA.
       Con la grafica di sempre e' una pastiglia fra i tagli; col 2.0
       sta nella cella del tempo, accanto al meno e al piu' -- ed e'
       proprio li' che deve stare, attaccata alla cosa che ferma.
       Cercandola in un posto solo, questa sezione esplodeva a ogni
       spostamento: non per un guasto dell'app, ma perche' la prova
       dava per scontata una delle due grafiche. */
    const tastoPausa = () => document.querySelector('.pc-cpausa:not(.hidden)') ||
      [...document.querySelectorAll('.pc-dur .chip')].find(c => /Pausa|Riprendi/.test(c.textContent));
    const dicePausa = t => { const b = tastoPausa(); return !!b && new RegExp(t).test(b.textContent); };
    p('nel pannello c e la pausa, come nella scheda', !!tastoPausa());
    p('  e i minuti dicono quanto si sta pagando',
      /\d/.test(document.querySelector('.pc-min').textContent),
      document.querySelector('.pc-min').textContent);
    if (tastoPausa()) {
      tastoPausa().click(); await att(350);
      p('  e la pausa dal pannello ferma davvero l orologio', !!entries[0].pausaDa && allineati());
      p('  e il tasto diventa Riprendi', dicePausa('Riprendi'));
      tastoPausa().click(); await att(350);
      p('  e riprende', !entries[0].pausaDa && allineati());
    }

    /* LA NOTA SI SCRIVE IN UN MODO SOLO: la stessa striscia e lo stesso
       foglio, nel pannello come nella scheda. Qui c'era un campo da
       riempire che salvava a ogni lettera, senza «lascia stare» e senza
       annulla. */
    const striscia = () => document.querySelector('.pc-nota');
    p('e la nota nel pannello e una striscia, non un campo da riempire',
      !!striscia() && striscia().tagName === 'BUTTON');
    p('  che da vuota si vede lo stesso', striscia().getBoundingClientRect().height > 0);
    striscia().click(); await att(350);
    const campo = document.querySelector('.nota-campo');
    p('  e toccandola si apre lo STESSO foglio della scheda', !!campo);
    if (campo) {
      campo.value = 'torta in frigo';
      [...document.querySelectorAll('#modalRoot button')].find(b => /Salva/.test(b.textContent)).click();
      await att(350);
      p('  la nota si salva', allineati() && entries[0].note === 'torta in frigo');
      p('  e la striscia la legge', /torta in frigo/.test(striscia().textContent));
      if (await conAnnulla()) toastAnnulla().click(); await att(300);
      p('  e l annulla la toglie, che prima nel pannello non c era',
        allineati() && !String(entries[0].note || '').trim());
    }
  }

  /* ── 10. LO SCONTRINO RACCONTA IL TEMPO APERTO E LA PAUSA ──
     Lo scontrino e' la schermata dell'INCASSARE: se li' il conto non
     si spiega, chi sta col gruppo davanti non sa cosa rispondere a
     «perche' tanto?». Con la pausa la domanda e' garantita: i minuti
     contati sono meno di quelli passati. */
  {
    showArchive = false;
    entries.length = 0; localStorage.removeItem('gp_entries');
    const t0 = Date.now() - 73 * 60000;
    guarda('sc'); entries.push(normalizeEntries([{ id: 'sc', startTime: t0, createdAt: t0, oraManuale: true,
      children: 2, durationMinutes: 0, baseMinutes: 0, payLater: true,
      crazyJumping: 2, crazyGiri: [1, 1], pausato: 30 * 60000,
      barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 2 }] }])[0]);
    saveEntries(); switchTab('active'); buildActiveView(); await att(300);
    [...card().querySelectorAll('button.conto')].find(b => /Scontrino/.test(b.textContent)).click();
    await att(600);

    const sc = () => document.querySelector('.pc-scontrino');
    const testo = () => sc().textContent.replace(/\s+/g, ' ');
    p('lo scontrino si apre', !!sc() && !sc().classList.contains('hidden'));
    p('  e dice che il tempo e aperto', /tempo aperto/.test(testo()));
    /* IL NUMERO NON SI SCRIVE A MANO: il gruppo e' entrato 73 minuti fa
       e ne ha 30 in pausa, ma fra il momento in cui lo si crea e quello
       in cui si legge lo scontrino l'orologio va avanti -- e a pannello
       nascosto va avanti di parecchio. Si chiede quello che conta: che
       lo scontrino scriva ESATTAMENTE i minuti che il conto sta
       contando in questo momento. */
    p('  e quanti minuti sta contando',
      new RegExp(minTxt(contiAperto(entries[0]).contati) + ' contati').test(testo()),
      testo().slice(0, 140));
    p('  e che mezz ora e in pausa e non si conta',
      /30′ in pausa, non contati/.test(testo()));
    p('  e la fascia su cui cade', /fascia 40′/.test(testo()));

    /* i numeri dello scontrino sono quelli del conto */
    const k = costOf(entries[0]);
    p('  il parco e quello del conto', new RegExp(eur(k.parkTotal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(testo()),
      eur(k.parkTotal));
    p('  e il totale pure', new RegExp(eur(dueOf(entries[0]).total).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(testo()));

    /* col cronometro fermo ADESSO lo dice */
    commutaPausa(entries[0]); saveEntries(); aggiornaPannello(); await att(300);
    p('  e col cronometro fermo lo scrive', /fermo/.test(testo()));
    const fermoOra = dueOf(entries[0]).total;
    p('  e da fermo il dovuto non cresce',
      dueOf(entries[0], Date.now()).total === fermoOra);
    commutaPausa(entries[0]); saveEntries(); aggiornaPannello(); await att(300);

    /* e da qui si incassa */
    [...sc().querySelectorAll('[data-screparto]')].find(b => b.dataset.screparto === 'parco').click();
    await att(400);
    p('dallo scontrino si incassa il parco', entries[0].paidPark > 0 && allineati());
    [...sc().querySelectorAll('[data-screparto]')].find(b => b.dataset.screparto === 'bar').click();
    await att(400);
    p('  e il bar, e il conto resta saldato', dueOf(entries[0]).total === 0 && allineati());
  }

  /* ── 11. LA GRAFICA 2.0, PREMUTA DAVVERO ──
     In node la 2.0 gira su tutta la suite, ma li' il DOM e' finto: le
     card non si ridisegnano, e proprio li' si era nascosto il guasto
     della firma (la fila dei numeri rapidi non compariva accendendo
     l'interruttore). Questi controlli si possono fare solo qui. */
  {
    const eraG2 = settings.grafica2;
    showArchive = false;
    entries.length = 0; localStorage.removeItem('gp_entries'); saveEntries();

    /* si accende come farebbe la cassiera, e le schermate devono
       cambiare DA SOLE, senza toccare nient'altro */
    settings.grafica2 = false; saveSettings(); applyTheme();
    draft = freshDraft(); switchTab('new'); await att(400);
    p('a interruttore spento la pagina non porta la classe della 2.0',
      !document.documentElement.classList.contains('g2'));

    settings.grafica2 = true; saveSettings(); applyTheme(); markNewDirty(); await att(400);
    p('accendendolo la pagina lo dice con la sua classe',
      document.documentElement.classList.contains('g2'));

    /* ── I MINUTI ESATTI, SCRITTI ──
       C'era un campo «oppure minuti esatti» ed e' sparito quando la
       fascia degli orari ha preso il suo posto: da allora, per fare
       venti minuti, si parte da quindici e si preme il piu'. */
    {
      const campo = () => document.querySelector('#view-new .pc-durin');
      p('col 2.0 si possono scrivere i minuti esatti', !!campo());
      if (campo()) {
        document.querySelector('#view-new [data-add="bimbi"]').click(); await att(250);
        document.querySelector('#view-new [data-add="bimbi"]').click(); await att(350);
        const metti = async (n) => {
          const c = campo();
          c.value = String(n);
          c.dispatchEvent(new Event('input', { bubbles: true }));
          await att(350);
        };
        await metti(20);
        p('  scritto 20, la durata e venti minuti', draft.durationMinutes === 20, draft.durationMinutes + 'm');
        const a20 = costOf(draft).parkTotal;
        await metti(47);
        p('  scritto 47, la durata e quarantasette', draft.durationMinutes === 47, draft.durationMinutes + 'm');
        p('  e il prezzo sale di conseguenza', costOf(draft).parkTotal > a20,
          a20 + ' → ' + costOf(draft).parkTotal);
        /* un taglio rapido SOVRASCRIVE, e il campo deve seguirlo: senza
           la firma azzerata restava a 47 mentre la durata era 30 */
        document.querySelector('#view-new .pc-dur [data-v="30"]').click(); await att(450);
        p('  un taglio rapido lo sovrascrive', draft.durationMinutes === 30);
        p('  e il campo lo segue', campo() && campo().value === '30',
          campo() ? campo().value : '(sparito)');
        /* quello che si scrive puo' essere qualunque cosa */
        await metti(0);
        p('  scrivere zero non porta la durata sotto il minimo', draft.durationMinutes >= 1);
        const prima = draft.durationMinutes;
        await metti('abc');
        p('  e una parola non la muove', draft.durationMinutes === prima);
        await metti(999999);
        p('  e un numero assurdo resta nei limiti', draft.durationMinutes <= 99999);
        /* e niente esce dallo schermo */
        const lim = document.documentElement.clientWidth;
        const fuori = [...document.querySelectorAll('#view-new .pc-dur *')]
          .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > lim + 1; });
        p('  e la fila dei tagli non esce dallo schermo', !fuori.length, fuori.length + ' fuori');
      }
      /* e con la grafica di sempre il campo non c'e' */
      settings.grafica2 = false; saveSettings(); applyTheme(); markNewDirty(); await att(400);
      p('  e con la grafica di sempre non c e', !campo());
      settings.grafica2 = true; saveSettings(); applyTheme(); markNewDirty(); await att(400);
      p('  e riaccendendola torna', !!campo());
      draft = freshDraft(); switchTab('active'); await att(200); switchTab('new'); await att(500);
    }

    /* il piu' e il meno dei bambini restano quelli di sempre */
    document.querySelector('#view-new [data-add="bimbi"]').click(); await att(300);
    document.querySelector('#view-new [data-add="bimbi"]').click(); await att(300);
    document.querySelector('#view-new [data-add="bimbi"]').click(); await att(300);
    p('il piu dei bambini funziona come sempre', draft.children === 3, 'bambini ' + draft.children);
    const prezzo3 = costOf(draft).parkTotal;
    document.querySelector('#view-new [data-meno="bimbi"]').click(); await att(400);
    p('  e il meno pure', draft.children === 2);
    p('  e il prezzo scende di conseguenza', costOf(draft).parkTotal < prezzo3);

    /* i tre tasti «paga» di sezione non ci sono piu': lo Scontrino
       deve poterli sostituire davvero */
    draft.durationMinutes = 60; draft.baseMinutes = 60;
    commitEntry(); await att(500);
    switchTab('active'); buildActiveView(); await att(400);
    const c = card();
    p('la scheda chiama il tasto col nome del posto dove porta',
      [...c.querySelectorAll('button.conto')].some(b => /Parco/.test(b.textContent)) &&
      ![...c.querySelectorAll('button.conto')].some(b => /Modifica/.test(b.textContent)));

    [...c.querySelectorAll('button.conto')].find(b => /Parco/.test(b.textContent)).click();
    await att(500);
    const fondo = () => document.querySelector('.pc-fondo').textContent.replace(/\s+/g, ' ');
    p('in fondo non ci sono piu i tre totali di sezione', !/Totale Parco/.test(fondo()));
    p('  ma la cifra da incassare c e', /\d/.test(fondo()) && /€/.test(fondo()));
    p('  e il Resto e il Paga tutto pure', /Resto/.test(fondo()) && /Paga tutto/.test(fondo()));
    p('e nella fascia Tempo non c e piu il doppione del pagato',
      document.querySelectorAll('.sec-tempo [data-a="pagatempo"]').length === 0);
    p('  ma la scritta di quanto c e da pagare resta',
      /da pagare|pagato|nessun bambino|uscita/.test(document.querySelector('.pgl').textContent));

    /* si incassa dallo Scontrino, che e' quello che resta */
    [...document.querySelectorAll('.pc-cat button')].find(b => /Scontrino/.test(b.textContent)).click();
    await att(500);
    const sc = () => document.querySelector('.pc-scontrino');
    [...sc().querySelectorAll('[data-screparto]')].find(b => b.dataset.screparto === 'parco').click();
    await att(400);
    p('dallo Scontrino si incassa il Parco', entries[0].paidPark > 0 && allineati());
    p('  e il conto resta saldato', dueOf(entries[0]).total === 0 && allineati());

    /* e spegnendo torna tutto com era */
    settings.grafica2 = false; saveSettings(); applyTheme(); markNewDirty(); await att(500);
    p('spegnendolo tornano i tre totali di sezione', /Totale Parco/.test(fondo()));
    chiudiPannelli(); buildActiveView(); await att(400);
    p('  e il tasto torna a chiamarsi Modifica',
      [...card().querySelectorAll('button.conto')].some(b => /Modifica/.test(b.textContent)));
    p('  e i soldi incassati sono rimasti quelli',
      entries[0].paidPark > 0 && dueOf(entries[0]).total === 0 && allineati());

    /* ── IL TEMPO SI CAPISCE: due numeri, e la somma scritta ──
       Sulla scheda c'erano TRE numeri del tempo in tre posti -- quello
       comprato nella cella, i minuti del Crazy dentro la sua card, il
       totale nel banner -- e niente che li legasse: al banco non si
       capiva se un'ora e un quarto fosse tempo comprato in piu' o giri
       di Crazy. */
    {
      /* la sezione qui sopra ha spento il 2.0 per provare il ritorno:
         qui serve acceso, ed e' l'ultima cosa di questa sezione */
      settings.grafica2 = true; saveSettings(); applyTheme();
      entries.length = 0; localStorage.removeItem('gp_entries');
      const t0 = Date.now() - 50 * 60000;
      guarda('tt'); entries.push(normalizeEntries([{ id: 'tt', startTime: t0, createdAt: t0, oraManuale: true,
        children: 2, durationMinutes: 60, baseMinutes: 30, aggiunte: [30],
        crazyJumping: 3, crazyGiri: [2, 1] }])[0]);
      saveEntries(); switchTab('active'); buildActiveView(); await att(400);
      const banner = () => card().querySelector('.e-orari').textContent.replace(/\s+/g, ' ');
      const sotto = () => {
        const x = card().querySelector('.e-conto .sott');
        return x && !x.classList.contains('vuota') ? x.textContent.replace(/\s+/g, ' ') : '';
      };
      const cella = () => [...card().querySelectorAll('.e-colonna .e-cella')]
        .find(c => c.querySelector('.e-nome').textContent === 'Tempo');

      p('il banner scrive il totale', /1h16/.test(banner()), banner());
      /* LA SPIEGAZIONE STA SOTTO «ESCE FRA», NON NEL BANNER: quello e'
         gia' pieno, e su una tavoletta le scritte si sovrapponevano. */
      p('  e il banner NON si allunga con la spiegazione',
        !/Crazy/.test(banner()), banner());
      p('sotto «esce fra» c e di che cos e fatto quel tempo',
        /1h/.test(sotto()) && /16′/.test(sotto()) && /Crazy/.test(sotto()), sotto() || '(vuota)');
      /* e non deve sbordare dal suo riquadro, che e' stretto */
      {
        const box = card().querySelector('.e-conto').getBoundingClientRect();
        const riga = card().querySelector('.e-conto .sott').getBoundingClientRect();
        p('  e ci sta dentro il suo riquadro',
          riga.width <= box.width + 1 && riga.left >= box.left - 1,
          Math.round(riga.width) + 'px in ' + Math.round(box.width) + 'px');
      }
      card().querySelector('.e-riga').click(); await att(300);
      p('la cella dice che quel numero e il tempo COMPRATO',
        /comprato/i.test(cella().textContent), cella().textContent.replace(/\s+/g, ' '));
      p('  e nomina a parte i minuti del Crazy',
        /16′ Crazy/.test(cella().textContent.replace(/\s+/g, ' ')),
        cella().textContent.replace(/\s+/g, ' '));
      /* la riga sta SOTTO il numero, non in fondo alla cella attaccata
         all'interruttore: li' sembrerebbe l'etichetta di quello */
      const val = cella().querySelector('.v').getBoundingClientRect();
      const rigaCella = cella().querySelector('.e-sotto').getBoundingClientRect();
      const apri = cella().querySelector('.e-aperto').getBoundingClientRect();
      p('  e sta sotto il numero, prima dell interruttore',
        rigaCella.top >= val.bottom - 2 && rigaCella.bottom <= apri.top + 2,
        'numero fino a ' + Math.round(val.bottom) + ', riga a ' + Math.round(rigaCella.top) +
        ', interruttore a ' + Math.round(apri.top));

      /* su un gruppo senza giri non si aggiunge rumore */
      entries.length = 0;
      const t1 = Date.now() - 10 * 60000;
      guarda('ss'); entries.push(normalizeEntries([{ id: 'ss', startTime: t1, createdAt: t1, oraManuale: true,
        children: 2, durationMinutes: 30, baseMinutes: 30 }])[0]);
      saveEntries(); buildActiveView(); await att(400);
      p('senza giri non c e nessuna riga da spiegare', sotto() === '', sotto());
      card().querySelector('.e-riga').click(); await att(300);
      p('  e la cella dice solo «comprato»',
        /comprato/i.test(cella().textContent) && !/Crazy/.test(cella().textContent));

      /* e a tempo aperto il numero e un'altra cosa, e lo dice */
      entries[0].payLater = true; saveEntries(); syncCard(entries[0]); await att(300);
      p('a tempo aperto dice che e il tempo che stai pagando',
        /che stai pagando/i.test(cella().textContent), cella().textContent.replace(/\s+/g, ' '));
    }


    settings.grafica2 = eraG2; saveSettings(); applyTheme();
  }

  /* ── 12. OGNI TASTO, PREMUTO DAVVERO ──
     Le prove qui sopra guardano dei flussi scelti da me: quelli che ho
     immaginato. Questa invece non sceglie niente -- prende OGNI tasto
     che c'e' a video, in ogni schermata, e lo preme. Non controlla che
     faccia la cosa giusta (quello lo fanno gli altri): controlla che
     non esploda, che non lasci un numero storto sul conto, e che
     memoria e disco restino d'accordo.
     E' la rete per i tasti che nessuno prova mai -- quelli in fondo,
     quelli che compaiono solo in uno stato particolare -- e per quelli
     che aggiungeremo domani senza pensarci. */
  {
    showArchive = false;
    const guai = [];
    let premuti = 0;
    const chiave = () => entries.map(e => [e.id, e.children, e.crazyJumping,
      e.durationMinutes, e.paidPark, e.paidBar].join('/')).sort().join('|');

    /* i numeri devono restare numeri, e i soldi non possono essere
       negativi: qualunque cosa si sia premuta */
    const sano = (dove) => {
      entries.forEach(e => {
        const k = costOf(e), d = dueOf(e);
        if (!Number.isFinite(k.parkTotal) || k.parkTotal < 0) guai.push(dove + ': parco ' + k.parkTotal);
        if (!Number.isFinite(k.crazyCost) || k.crazyCost < 0) guai.push(dove + ': crazy ' + k.crazyCost);
        if (!Number.isFinite(d.total) || d.total < 0) guai.push(dove + ': dovuto ' + d.total);
        if (!Number.isFinite(endTimeOf(e))) guai.push(dove + ': ora d uscita storta');
        if (endTimeOf(e) < e.startTime) guai.push(dove + ': esce prima di entrare');
        if (num(e.paidPark, 0) < 0 || num(e.paidBar, 0) < 0) guai.push(dove + ': incassato negativo');
        if (num(e.children, 0) < 0 || num(e.crazyJumping, 0) < 0) guai.push(dove + ': quantita negativa');
      });
      if (!allineati()) guai.push(dove + ': memoria e disco non dicono la stessa cosa');
    };

    /* un gruppo di prova ricco: tempo comprato, giri, roba dal bar */
    const rifai = () => {
      localStorage.removeItem('gp_entries');
      entries.length = 0;
      draft = freshDraft();
      const t0 = Date.now() - 20 * 60000;
      guarda('tut'); entries.push(normalizeEntries([{ id: 'tut', startTime: t0, createdAt: t0, oraManuale: true,
        children: 2, durationMinutes: 30, baseMinutes: 30, crazyJumping: 2, crazyGiri: [1, 1],
        barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 2 }] }])[0]);
      saveEntries();
      switchTab('active'); buildActiveView();
    };

    /* PREME TUTTO QUELLO CHE TROVA, uno dopo l'altro.
       Rifare lo stato prima di OGNI tasto sarebbe piu' pulito, ma
       costava undici minuti -- e una prova che nessuno lancia e' una
       prova che non esiste. Si rifa' solo quando serve: cioe' quando il
       tasto premuto ha portato via la schermata da sotto i piedi.
       Premere in fila e' anche piu' vicino al vero: al banco i tasti si
       premono uno dopo l'altro, non su uno stato appena nato. Quello
       che si controlla resta lo stesso -- niente esplode, nessun numero
       storto, memoria e disco d'accordo -- e la sequenza si porta
       dietro il nome di tutti quelli premuti, cosi' si sa da dove
       ricominciare a guardare. */
    const premiTutti = async (nome, apri, dentro) => {
      const fatti = [];
      const rimetti = async () => { rifai(); await att(90); await apri(); };
      await rimetti();
      let quanti = (dentro() ? [...dentro().querySelectorAll('button')].length : 0);
      if (!quanti) { guai.push(nome + ': non si apre'); return; }
      /* qualche giro in piu' del numero di tasti: premendone uno la
         fila puo' allungarsi (una card che si apre, un menu) */
      for (let i = 0; i < quanti + 6; i++) {
        if (!dentro()) await rimetti();
        const q = dentro();
        if (!q) { guai.push(nome + ': non si riapre'); return; }
        const tasti = [...q.querySelectorAll('button')]
          .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        const b = tasti[i];
        if (!b) continue;
        const eti = (b.textContent || b.title || b.className || '?').replace(/\s+/g, ' ').trim().slice(0, 22);
        fatti.push(eti);
        const dove = nome + ' [' + fatti.slice(-3).join(' > ') + ']';
        try { b.click(); } catch (e) { guai.push(dove + ': esplode — ' + e.message); await rimetti(); continue; }
        premuti++;
        await att(70);
        /* se si e' aperto un foglio si sceglie la prima strada: uno
           lasciato aperto bloccherebbe tutto il resto */
        const foglio = [...document.querySelectorAll('#modalRoot .scelta-riga')];
        if (foglio.length) { foglio[0].click(); await att(150); }
        else if (!document.getElementById('modalRoot').classList.contains('hidden')) {
          const chiudi = [...document.querySelectorAll('#modalRoot button')]
            .find(x => /Lascia stare|Annulla|Chiudi|Conferma/i.test(x.textContent));
          if (chiudi) { chiudi.click(); await att(120); }
        }
        sano(dove);
        const ann = toastAnnulla();
        if (ann) { ann.click(); await att(120); sano(dove + ' annullato'); }
      }
    };

    const apriScheda = async () => {
      const c = card();
      if (c && !c.classList.contains('aperto')) { c.querySelector('.e-riga').click(); await att(200); }
    };
    const apriLinguetta = (nome) => async () => {
      await apriScheda();
      const b = [...card().querySelectorAll('button.conto')]
        .find(x => new RegExp(nome).test(x.textContent));
      if (b) { b.click(); await att(400); }
    };

    await premiTutti('la scheda', apriScheda, () => card());
    await premiTutti('il Parco', apriLinguetta('Parco|Modifica'), () => document.querySelector('.pan-conto .pc-parco'));
    await premiTutti('il Bar', apriLinguetta('Bar'), () => document.querySelector('.pan-conto .pc-bar'));
    await premiTutti('lo Scontrino', apriLinguetta('Scontrino'), () => document.querySelector('.pan-conto .pc-scontrino'));
    await premiTutti('la fascia in fondo', apriLinguetta('Parco|Modifica'), () => document.querySelector('.pan-conto .pc-fondo'));

    /* UNA PROVA CHE NON PREME NIENTE PASSA SEMPRE, ed e' il difetto
       peggiore che possa avere: dice ok senza aver guardato. Se i tasti
       premuti sono pochi vuol dire che i selettori non trovano piu le
       schermate, non che va tutto bene. */
    p('e ne ha premuti abbastanza da voler dire qualcosa', premuti >= 60,
      'ne ha premuti ' + premuti);
    p(premuti + ' tasti premuti uno per uno, e nessuno rompe niente',
      !guai.length, [...new Set(guai)].slice(0, 4).join('\n        '));

    localStorage.removeItem('gp_entries'); entries.length = 0; guarda(null); saveEntries();
    draft = freshDraft(); chiudiPannelli(); switchTab('active'); buildActiveView();
  }

  /* ── 13. L'ORDINE DELLA LISTA, LA PAUSA E I MINUTI SPIEGATI ──
     Tre cose che si vedono SOLO a video: l'ordine dei riquadri, il
     numero grande che si ferma, e la riga che spiega di che cos'e'
     fatto il tempo. In node il DOM e' finto e non ne dice niente. */
  {
    localStorage.removeItem('gp_entries'); entries.length = 0; guarda(null);
    const t0 = Math.floor(Date.now() / 60000) * 60000;
    const metti = (id, min, extra) => entries.push(normalizeEntries([Object.assign({
      id: id, startTime: t0 - 20 * 60000, createdAt: t0 - 20 * 60000, oraManuale: true,
      children: 2, durationMinutes: min, baseMinutes: min }, extra || {})])[0]);
    metti('uno', 30); metti('due', 60); metti('tre', 90);
    saveEntries(); switchTab('active'); buildActiveView(); await att(700);

    const ordine = () => [...document.querySelectorAll('#view-active .entries .entry')]
      .map(e => e.dataset.id);
    const voluto = () => activeEntries().map(e => e.id);
    p('la lista parte in ordine di uscita', ordine().join() === voluto().join(),
      ordine().join() + ' invece di ' + voluto().join());

    /* SI ALLUNGA IL PRIMO: adesso e' l'ultimo a uscire, e deve
       spostarsi da solo. Prima restava in cima finche' non si cambiava
       linguetta e si tornava indietro. */
    conConto(entries.find(e => e.id === 'uno'), () => ritoccaTempo(entries.find(e => e.id === 'uno'), 180));
    saveEntries(); tick(); await att(150);
    p('  allungato il primo, la lista si rimette in ordine da sola',
      ordine().join() === voluto().join(), ordine().join() + ' invece di ' + voluto().join());
    p('  e quello allungato non e piu il primo', ordine()[0] !== 'uno', ordine().join());

    /* MA NON MENTRE UNA SCHEDA E' APERTA: spostarle sotto il dito e'
       peggio del disordine. */
    const primo = document.querySelector('#view-active .entry');
    primo.querySelector('.e-riga').click(); await att(250);
    const bottone = [...primo.querySelectorAll('button.conto')].find(b => /Parco|Modifica/.test(b.textContent));
    if (bottone) {
      bottone.click(); await att(500);
      const era = ordine().join();
      const chi = entries.find(e => e.id === primo.dataset.id);
      conConto(chi, () => ritoccaTempo(chi, 240));
      saveEntries(); tick(); tick(); await att(150);
      p('  con una scheda aperta la lista non si muove sotto le dita',
        ordine().join() === era, ordine().join() + ' era ' + era);
      /* SI ASPETTA LA COSA, NON UN TEMPO: la scheda che si richiude
         torna a posarsi con un'animazione, e finche' e' per aria la
         lista non si tocca apposta -- spostare i riquadri sotto il
         dito di chi lavora e' peggio del disordine. Aspettare
         settecento millesimi «che di solito bastano» e' il modo di
         scrivere una prova che un giorno fallisce da sola e fa cercare
         un guasto che non c'e'. */
      /* CHIUDERE IL PANNELLO NON E' CHIUDERE LA SCHEDA: il conto si
         richiude, ma la scheda resta aperta -- e finche' c'e' una
         scheda aperta la lista non si muove, apposta. */
      bottone.click();
      await finche(() => !volante, 4000);
      tick(); await att(120);
      p('  chiuso il conto ma non la scheda, la lista sta ancora ferma',
        ordine().join() === era, ordine().join() + ' era ' + era);
      /* e adesso si chiude la scheda per davvero.
         SI ASPETTA ANCHE IL PARACOLPI DEI TOCCHI, non solo che la
         scheda si sia posata: per mezzo secondo dopo un'animazione i
         tocchi non contano (serve a non far partire due animazioni una
         sopra l'altra), e il tocco per chiudere finiva li' dentro
         senza fare niente. La scheda restava aperta, la lista restava
         ferma -- giustamente -- e la prova accusava il codice di un
         guasto che era tutto suo. */
      await finche(() => !voloOccupato, 3000);
      primo.querySelector('.e-riga').click();
      await finche(() => !document.querySelector('#view-active .entry.aperto'), 3000);
      tick();
      await finche(() => ordine().join() === voluto().join(), 3000);
      p('  e chiudendola si rimette in ordine', ordine().join() === voluto().join(),
        ordine().join() + ' invece di ' + voluto().join());
    }

    /* LA PAUSA SI VEDE, E IL NUMERO GRANDE SI FERMA */
    localStorage.removeItem('gp_entries'); entries.length = 0; guarda(null);
    guarda('ferma'); entries.push(normalizeEntries([{ id: 'ferma', startTime: t0 - 70 * 60000,
      createdAt: t0 - 70 * 60000, oraManuale: true, children: 2,
      durationMinutes: 0, baseMinutes: 0, payLater: true }])[0]);
    saveEntries(); buildActiveView(); await att(250); tick();
    const scheda = () => document.querySelector('#view-active .entry[data-id="ferma"]');
    const numero = () => scheda().querySelector('.e-conto .v').textContent;
    const parola = () => scheda().querySelector('.e-conto .k').textContent;
    p('a tempo aperto la scheda dice da quanto sono dentro', /dentro da/.test(parola()), parola());
    conConto(entries[0], () => commutaPausa(entries[0]));
    saveEntries(); tick(); await att(120);
    p('  fermato l orologio, la scheda lo dice', /PAUSA/.test(parola()), parola());
    p('  e si riconosce dalla lista senza aprirla', scheda().classList.contains('in-pausa'));
    const fermoA = numero();
    await att(2400); tick();
    p('  e il numero grande sta fermo davvero', numero() === fermoA,
      'era ' + fermoA + ', adesso ' + numero());
    conConto(entries[0], () => commutaPausa(entries[0]));
    saveEntries(); tick(); await att(120);
    p('  e riprendendo riparte', /dentro da/.test(parola()) && !scheda().classList.contains('in-pausa'),
      parola());

    /* DI CHE COS'E' FATTO IL TEMPO: la riga sotto «Esce fra». Solo 2.0. */
    if (settings.grafica2) {
      localStorage.removeItem('gp_entries'); entries.length = 0; guarda(null);
      guarda('spiega'); entries.push(normalizeEntries([{ id: 'spiega', startTime: t0 - 10 * 60000,
        createdAt: t0 - 10 * 60000 + 2 * 60000, oraManuale: true, children: 2,
        durationMinutes: 60, baseMinutes: 60, crazyJumping: 2, crazyGiri: [1, 1] }])[0]);
      saveEntries(); buildActiveView(); await att(250); tick();
      const sotto = document.querySelector('#view-active .entry[data-id="spiega"] .e-conto .sott');
      p('sotto «Esce fra» c e scritto di che cos e fatto il tempo', !!sotto && /1h/.test(sotto.textContent),
        sotto ? sotto.textContent : 'manca');
      p('  coi minuti dei giri', /Crazy/.test(sotto.textContent), sotto.textContent);
      p('  e con quelli dell arrotondamento', /arrotondati/.test(sotto.textContent), sotto.textContent);
    }

    localStorage.removeItem('gp_entries'); entries.length = 0; guarda(null); saveEntries();
    chiudiPannelli(); switchTab('active'); buildActiveView();
  }

  /* ── il verdetto ── */
  rimettiOrologio();
  localStorage.removeItem('gp_entries');
  entries.length = 0;
  saveEntries();
  buildActiveView();

  const ko = esiti.filter(x => !x.ok);
  console.log('\n' + '━'.repeat(52));
  esiti.forEach(x => console.log((x.ok ? '  ok   ' : '  NO   ') + x.nome + (x.dett ? '   ' + x.dett : '')));
  console.log('━'.repeat(52));
  console.log(ko.length
    ? '  ' + ko.length + ' ROTTI su ' + esiti.length
    : '  TUTTO A POSTO — ' + esiti.length + ' controlli a video');
  console.log('━'.repeat(52));
  return ko.length ? 'ROTTI: ' + ko.map(x => x.nome).join(' | ') : 'tutto a posto';
})();

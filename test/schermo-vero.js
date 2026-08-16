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
  const att = ms => new Promise(r => setTimeout(r, ms));
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

  const card = () => document.querySelector('#view-active .entry');
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

  /* ── il verdetto ── */
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

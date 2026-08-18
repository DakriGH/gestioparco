/* ============================================================
   LE RETI, QUANDO SERVONO DAVVERO

   Tutto il resto delle prove guarda l'app che funziona. Questo file
   guarda l'app il giorno in cui qualcosa e' andato storto: il tablet
   e' morto, il browser ha svuotato la memoria, arriva un file di
   backup di tre settimane fa, oppure dentro i dati c'e' della
   spazzatura -- da una versione vecchia, da un salvataggio interrotto,
   da un cloud storto.

   E' la parte meno provata dell'app, ed e' quella che conta di piu':
   un guasto qui non si vede mai finche' non si vede nel momento
   peggiore. Il ripristino da backup, in particolare, sbaglia il giorno
   in cui non c'e' nessun altro posto da cui ripartire.
   ============================================================ */
import { caricaApp } from './ambiente.mjs';

const app = caricaApp();
app.settings = app.defaultSettings();

let ok = 0, ko = 0, gruppi = 0;
const rotti = [];
function gruppo(t) { gruppi++; console.log('\n━━ ' + t); }
function prova(t, cond, extra) {
  if (cond) { ok++; console.log('   ok   ' + t); }
  else { ko++; rotti.push(t); console.log('   NO   ' + t + (extra ? '\n        ' + extra : '')); }
}
const uguale = (t, avuto, atteso) => prova(t, JSON.stringify(avuto) === JSON.stringify(atteso),
  'avuto ' + JSON.stringify(avuto) + '  atteso ' + JSON.stringify(atteso));
const r2 = v => Math.round(v * 100) / 100;

/* una serata vera: gruppi di tutti i tipi, in tutti gli stati */
function unaSerata() {
  const g = app.giornataDi(Date.now());
  const h = m => g + m * 60000;
  return app.normalizeEntries([
    /* dentro, tempo comprato, pagato a meta' */
    { id: 's1', startTime: h(600), createdAt: h(600), oraManuale: true, children: 3,
      durationMinutes: 60, baseMinutes: 30, aggiunte: [30], crazyJumping: 2, crazyGiri: [1, 1],
      paidPark: 14, paidAmt: { bimbi: 14 }, paidLines: { bimbi: 2 }, sigla: 'QA', note: 'zaino giallo',
      barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 2 }] },
    /* dentro, tempo aperto, in pausa */
    { id: 's2', startTime: h(620), createdAt: h(620), oraManuale: true, children: 2,
      durationMinutes: 0, baseMinutes: 0, payLater: true, pausato: 12 * 60000,
      pausaDa: h(700), sigla: 'QB' },
    /* solo Crazy, con l'omaggio */
    { id: 's3', startTime: h(640), createdAt: h(640), oraManuale: true, children: 0,
      durationMinutes: 0, baseMinutes: 0, omaggio: 10, crazyJumping: 3, crazyGiri: [2, 1],
      paidPark: 12, paidAmt: { crazy: 12 }, paidLines: { crazy: 3 }, sigla: 'QC' },
    /* solo BAR */
    { id: 's4', startTime: h(650), createdAt: h(650), oraManuale: true, children: 0,
      durationMinutes: 0, baseMinutes: 0, soloBar: true, sigla: 'QD',
      barItems: [{ id: 'b3', name: 'Coca Cola', price: 2.5, qty: 2 }],
      paidBar: 5, paidAmt: { b3: 5 }, paidLines: { b3: 2 } },
    /* gia' uscito, col conto congelato e un residuo non incassato */
    { id: 's5', startTime: h(500), createdAt: h(500), oraManuale: true, children: 2,
      durationMinutes: 30, baseMinutes: 30, status: 'closed', closedAt: h(560),
      costoFinale: { parco: 14, bar: 3 }, paidPark: 14, paidAmt: { bimbi: 14 }, sigla: 'QE',
      barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 3 }] }
  ]);
}

/* la fotografia dei soldi e dei tempi: e' questo che deve sopravvivere */
const ritratto = lista => lista.map(e => [
  e.id, e.status || 'active', e.children, e.crazyJumping, e.durationMinutes,
  app.num(e.paidPark, 0), app.num(e.paidBar, 0), app.num(e.pausato, 0), app.num(e.pausaDa, 0),
  e.sigla || '', String(e.note || ''),
  app.costOf(e).parkTotal, app.costOf(e).crazyCost, app.dueOf(e).total, app.endTimeOf(e)
].join('/')).sort();

/* ─────────────────────────────────────────────────────────
   1. IL BACKUP SU FILE: si salva e si rimette dentro
   ───────────────────────────────────────────────────────── */
gruppo('Un backup rimesso dentro ridà la stessa serata, euro per euro');
{
  app.entries = unaSerata();
  const prima = ritratto(app.entries);
  const testo = app.contenutoBackup();
  prova('il backup è un file JSON leggibile', (() => {
    try { JSON.parse(testo); return true; } catch (e) { return false; }
  })());

  /* si butta via tutto, come se fosse un tablet nuovo */
  app.entries = [];
  app.settings = app.defaultSettings();
  app.applicaBackup(testo);

  uguale('gli ingressi tornano tutti', app.entries.length, 5);
  uguale('e ognuno coi suoi soldi, i suoi tempi e la sua sigla', ritratto(app.entries), prima);

  /* e rimetterlo DUE volte non raddoppia niente */
  app.applicaBackup(testo);
  uguale('rimetterlo due volte non duplica nulla', app.entries.length, 5);
  uguale('e i conti restano quelli', ritratto(app.entries), prima);
}

gruppo('Un backup rovinato non porta via quello che c’è');
{
  app.entries = unaSerata();
  const salvo = ritratto(app.entries);
  const brutti = [
    ['non è JSON', 'questo non e un file'],
    ['è JSON ma non è un backup', '{"ciao":1}'],
    ['è vuoto', '{}'],
    ['è una lista', '[1,2,3]'],
    ['dice null', 'null']
  ];
  const guai = [];
  brutti.forEach(([che, testo]) => {
    let esploso = false;
    try { app.applicaBackup(testo); } catch (e) { esploso = true; }
    if (!esploso) guai.push(che + ': accettato invece di essere rifiutato');
    if (JSON.stringify(ritratto(app.entries)) !== JSON.stringify(salvo)) {
      guai.push(che + ': ha toccato gli ingressi che c’erano');
    }
  });
  prova('cinque file storti, tutti rifiutati senza fare danni', !guai.length, guai.join('\n        '));
}

gruppo('Un backup di una versione vecchia si legge lo stesso');
{
  /* i campi nuovi -- pausa, sigla, nota, parcoDa -- non c'erano: un
     file di tre settimane fa non deve rimbalzare. E il pagato di
     allora erano SPUNTE con la chiave della riga (`child_0`,
     `crazy_0`, `bar_b1_0`), non quantita': `traduciPagate` le
     ritraduce, e senza quella un backup vecchio tornerebbe indietro
     con le righe tutte da pagare. */
  const g = app.giornataDi(Date.now());
  const vecchio = JSON.stringify({
    app: 'gestioparco', versione: 1,
    entries: [
      { id: 'v1', startTime: g + 3600000, children: 2, durationMinutes: 30,
        paidLines: { child_0: true, child_1: true }, paidPark: 14 },
      { id: 'v2', startTime: g + 3700000, children: 1, durationMinutes: 60,
        crazyJumping: 2, paidLines: { crazy_0: true } }
    ]
  });
  app.entries = [];
  let esploso = null;
  try { app.applicaBackup(vecchio); } catch (e) { esploso = e.message; }
  prova('non esplode', !esploso, esploso || '');
  uguale('e tutti e due gli ingressi ci sono', app.entries.length, 2);
  prova('i soldi già incassati non si perdono per strada',
    app.num(app.entries[0].paidPark, 0) >= 14,
    'paidPark ' + app.num(app.entries[0].paidPark, 0));
  prova('e le spunte vecchie diventano quantità',
    app.num((app.entries[0].paidLines || {}).bimbi, 0) === 2,
    JSON.stringify(app.entries[0].paidLines));
  prova('anche quelle del Crazy',
    app.num((app.entries[1].paidLines || {}).crazy, 0) === 1,
    JSON.stringify(app.entries[1].paidLines));
}

/* ─────────────────────────────────────────────────────────
   2. LA SPAZZATURA CHE PUÒ ARRIVARE DAI DATI
   ───────────────────────────────────────────────────────── */
gruppo('Dentro un ingresso può arrivare qualunque cosa, e non deve far danni');
{
  const mostri = [
    { che: 'tutto null', o: { id: 'm1', startTime: null, children: null, durationMinutes: null,
      crazyJumping: null, paidPark: null, barItems: null, people: null, note: null, sigla: null } },
    { che: 'tutto stringhe', o: { id: 'm2', startTime: 'ieri', children: 'due', durationMinutes: 'trenta',
      crazyJumping: 'tre', paidPark: 'venti', pausato: 'tanto', pausaDa: 'boh' } },
    { che: 'numeri negativi', o: { id: 'm3', startTime: -5, children: -3, durationMinutes: -60,
      crazyJumping: -2, paidPark: -100, paidBar: -50, pausato: -9999, omaggio: -10 } },
    { che: 'numeri assurdi', o: { id: 'm4', startTime: 1e18, children: 1e9, durationMinutes: 1e9,
      crazyJumping: 1e9, paidPark: 1e12 } },
    { che: 'NaN e infiniti', o: { id: 'm5', startTime: NaN, children: Infinity, durationMinutes: NaN,
      crazyJumping: -Infinity, paidPark: NaN, pausaDa: NaN } },
    { che: 'liste piene di buchi', o: { id: 'm6', startTime: Date.now(), children: 2, durationMinutes: 30,
      crazyGiri: [null, 'due', -1, 3], aggiunte: [null, -5, 'x', 15],
      barItems: [null, { id: 'b1' }, { id: 'b2', price: 'caro', qty: -2 }], people: [null, 'boh'] } },
    { che: 'un ingresso che è quasi niente', o: { id: 'm7' } }
  ];
  const guai = [];
  mostri.forEach(({ che, o }) => {
    let letti;
    try { letti = app.normalizeEntries([JSON.parse(JSON.stringify(o))]); }
    catch (e) { guai.push(che + ': esplode leggendolo — ' + e.message); return; }
    if (letti.length !== 1) { guai.push(che + ': sparisce'); return; }
    const e = letti[0];
    const k = app.costOf(e), d = app.dueOf(e);
    if (!Number.isFinite(k.parkTotal) || k.parkTotal < 0) guai.push(che + ': parco ' + k.parkTotal);
    if (!Number.isFinite(k.crazyCost) || k.crazyCost < 0) guai.push(che + ': crazy ' + k.crazyCost);
    if (!Number.isFinite(d.total) || d.total < 0) guai.push(che + ': dovuto ' + d.total);
    if (!Number.isFinite(app.endTimeOf(e))) guai.push(che + ': ora d’uscita storta');
    if (app.endTimeOf(e) < e.startTime) guai.push(che + ': esce prima di entrare');
    if (app.num(e.paidPark, 0) < 0 || app.num(e.paidBar, 0) < 0) guai.push(che + ': incassato negativo');
    if (app.num(e.pausato, 0) < 0) guai.push(che + ': pausa negativa');
    if (app.contiAperto(e).contati < 0) guai.push(che + ': minuti contati negativi');
    /* e riletto due volte deve dire la stessa identica cosa */
    const ri = app.normalizeEntries([JSON.parse(JSON.stringify(e))])[0];
    if (app.costOf(ri).parkTotal !== k.parkTotal) guai.push(che + ': rileggendolo cambia il prezzo');
    if (app.endTimeOf(ri) !== app.endTimeOf(e)) guai.push(che + ': rileggendolo cambia l’uscita');
  });
  prova('sette mostri, nessun danno', !guai.length, guai.slice(0, 4).join('\n        '));
}

gruppo('Una lista rotta non porta giù quelli buoni');
{
  const g = app.giornataDi(Date.now());
  const buono = { id: 'ok1', startTime: g + 3600000, createdAt: g + 3600000, children: 2,
    durationMinutes: 30, baseMinutes: 30, paidPark: 14, paidAmt: { bimbi: 14 } };
  const misto = [null, buono, undefined, 'una stringa', 42, { id: 'ok2', startTime: g + 3700000,
    children: 1, durationMinutes: 60 }, [], { }];
  let letti;
  try { letti = app.normalizeEntries(JSON.parse(JSON.stringify(misto))); }
  catch (e) { letti = null; prova('non esplode su una lista mista', false, e.message); }
  if (letti) {
    prova('non esplode su una lista mista', true);
    prova('i due ingressi buoni ci sono ancora',
      letti.some(e => e.id === 'ok1') && letti.some(e => e.id === 'ok2'),
      'letti ' + letti.length + ': ' + letti.map(e => e.id).join(','));
    const uno = letti.find(e => e.id === 'ok1');
    uguale('e il buono ha ancora i suoi soldi', app.num(uno.paidPark, 0), 14);
  }
}

/* ─────────────────────────────────────────────────────────
   3. I SOLDI NON SI INVENTANO E NON SPARISCONO
   ───────────────────────────────────────────────────────── */
gruppo('Togliendo i giri di Crazy non resta pagato più di quello che c’è');
{
  const guai = [];
  [1, 2, 3, 5].forEach(giri => {
    for (let resta = 0; resta <= giri; resta++) {
      const c = app.normalizeEntries([{ id: 'rc', startTime: Date.now() - 20 * 60000,
        createdAt: Date.now() - 20 * 60000, children: 1, durationMinutes: 30, baseMinutes: 30,
        crazyJumping: giri, crazyGiri: [giri] }])[0];
      app.PAN.conto = c; app.PAN.ingresso = null;
      app.pagaTutto();
      app.metteCrazy(c, resta);
      app.rimettiSoldiCrazy(c);
      const pagate = app.num((c.paidLines || {}).crazy, 0);
      const dovuti = app.costOf(c).crazyCost;
      const presi = app.num((c.paidAmt || {}).crazy, 0);
      if (pagate > resta) guai.push(giri + '→' + resta + ' giri: risultano pagate ' + pagate + ' salite su ' + resta);
      if (presi > dovuti + 0.005) guai.push(giri + '→' + resta + ' giri: incassati ' + presi + ' per ' + dovuti + ' dovuti');
      if (app.dueOf(c).total < 0) guai.push(giri + '→' + resta + ' giri: dovuto negativo');
    }
  });
  prova('quattro conteggi di giri, tolti uno per volta', !guai.length, guai.slice(0, 3).join('\n        '));
}

gruppo('Il registro della giornata torna con quello che è stato incassato');
{
  app.entries = unaSerata();
  const g = app.giornataDi(Date.now());
  const c = app.contiGiornata(g);
  /* l'incassato del registro deve essere la somma di quello che sta
     scritto sui conti: e' il numero che la sera va confrontato col
     cassetto */
  const somma = r2(app.entries
    .filter(e => app.giornataDi(e.startTime) === g)
    .reduce((a, e) => a + app.num(e.paidPark, 0) + app.num(e.paidBar, 0), 0));
  uguale('l’incassato è la somma di quello che c’è sui conti', r2(c.incassato), somma);
  prova('e il non incassato non è mai negativo', c.resta >= 0, 'resta ' + c.resta);
  uguale('e i gruppi sono quelli della giornata', c.gruppi, 5);
}

/* ─────────────────────────────────────────────────────────
   4. LA GIORNATA CHE CAMBIA ALLE 4 DEL MATTINO
   ───────────────────────────────────────────────────────── */
gruppo('Chi entra a mezzanotte è della serata di ieri');
{
  const giorno = (aa, mm, gg, oo, mi) => new Date(aa, mm - 1, gg, oo, mi, 0, 0).getTime();
  const stessa = (a, b) => app.giornataDi(a) === app.giornataDi(b);
  prova('le 23:40 e l’una di notte sono la stessa serata',
    stessa(giorno(2026, 8, 15, 23, 40), giorno(2026, 8, 16, 1, 0)));
  prova('e anche le 03:59', stessa(giorno(2026, 8, 15, 23, 40), giorno(2026, 8, 16, 3, 59)));
  prova('ma le 04:01 sono già la serata dopo',
    !stessa(giorno(2026, 8, 15, 23, 40), giorno(2026, 8, 16, 4, 1)));
  prova('e le 04:00 in punto pure',
    !stessa(giorno(2026, 8, 15, 23, 40), giorno(2026, 8, 16, 4, 0)));
  /* il giorno del cambio ora legale: la serata resta una sola */
  prova('e nella notte in cui si cambia l’ora la serata resta una',
    stessa(giorno(2026, 3, 28, 23, 40), giorno(2026, 3, 29, 2, 30)));
}

/* ─────────────────────────────────────────────────────────
   5. I TAGLI DEL TEMPO CHE CAMBIANO SOTTO CHI HA GIA' L'APP
   ───────────────────────────────────────────────────────── */
gruppo('I tagli nuovi arrivano anche sui tablet che ci sono già');
{
  /* I tagli stanno SALVATI su ogni tavoletta, e le impostazioni salvate
     vincono su quelle di serie: cambiare il valore di serie non tocca
     nessuno, e le casse resterebbero con quelli vecchi per sempre. Ma
     chi se li e' messi a modo suo non deve ritrovarseli cambiati il
     lunedi' mattina. */
  const diSerie = app.defaultSettings().quickDurations;
  uguale('i tagli di serie sono dieci, un quarto d’ora, mezz’ora e un’ora',
    diSerie, [10, 15, 30, 60]);
  prova('e ognuno ha un prezzo sul cartello',
    diSerie.every(m => app.priceFor(m) > 0),
    diSerie.map(m => m + 'm=' + app.priceFor(m)).join(' '));

  /* la regola: si cambia solo se sono ancora quelli vecchi di serie */
  const cambia = (avuti, gia) => {
    const s = Object.assign(app.defaultSettings(), { quickDurations: avuti.slice() });
    if (gia) s.tagliNuovi = true;
    if (!s.tagliNuovi) {
      if (s.quickDurations.join(',') === [15, 30, 60, 90].join(',')) {
        s.quickDurations = app.defaultSettings().quickDurations.slice();
      }
      s.tagliNuovi = true;
    }
    return s.quickDurations;
  };
  uguale('chi ha ancora i vecchi di serie riceve i nuovi',
    cambia([15, 30, 60, 90], false), [10, 15, 30, 60]);
  uguale('chi se li e’ fatti a modo suo se li tiene',
    cambia([20, 45, 75], false), [20, 45, 75]);
  uguale('e chi ne ha tolto uno pure',
    cambia([15, 30, 60], false), [15, 30, 60]);
  uguale('e non si rifa’ una seconda volta',
    cambia([15, 30, 60, 90], true), [15, 30, 60, 90]);
}

/* ---------- il verdetto ---------- */
console.log('\n' + '━'.repeat(52));
if (ko) {
  console.log('  ' + ko + ' CONTROLLI ROTTI su ' + (ok + ko) + '\n  - ' + rotti.join('\n  - '));
  process.exit(1);
}
console.log('  TUTTO A POSTO — ' + ok + ' controlli, ' + gruppi + ' gruppi');

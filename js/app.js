/* ============================================================
   GESTIOPARCO — logica applicativa
   ------------------------------------------------------------
   Regola di rendering: si costruisce il DOM UNA volta, poi si
   aggiornano solo i nodi che cambiano davvero (sync*).
   Nessun innerHTML nei percorsi toccati di continuo (stepper,
   contatori, bar, pagamenti): niente sfarfallii, niente
   animazioni che ripartono a ogni tocco.
   ============================================================ */
'use strict';

/* ---------- micro utilità ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

function el(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function num(n, f) { n = Number(n); return Number.isFinite(n) ? n : f; }
function clamp(n, a, b) { n = num(n, a); return Math.max(a, Math.min(b, n)); }
function pad2(n) { return String(Math.trunc(num(n, 0))).padStart(2, '0'); }
function up5(m) { return Math.ceil(num(m, 0) / 5) * 5; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(ts) { const d = new Date(num(ts, Date.now())); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtDate(ts) { const d = new Date(num(ts, Date.now())); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1); }
function fmtDur(ms) {
  ms = num(ms, 0);
  const neg = ms < 0; ms = Math.abs(ms);
  const t = Math.floor(ms / 60000), h = Math.floor(t / 60), m = t % 60;
  return (neg ? '-' : '') + (h > 0 ? h + 'h ' + pad2(m) + 'm' : m + ' min');
}
function fmtClock(ms) {
  ms = num(ms, 0);
  const neg = ms < 0; ms = Math.abs(ms);
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (neg ? '-' : '') + (h > 0 ? h + ':' + pad2(m) + ':' + pad2(sec) : pad2(m) + ':' + pad2(sec));
}
function eur(n) { return (Math.round(num(n, 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
function hhmmToMin(s) {
  if (!s || typeof s !== 'string' || !s.includes(':')) return 0;
  const [h, m] = s.split(':').map(x => parseInt(x, 10) || 0);
  return clamp(h, 0, 23) * 60 + clamp(m, 0, 59);
}
function roundTo5(d) { const ms = 5 * 60000; return new Date(Math.round(d.getTime() / ms) * ms); }
/* 45 → "45m", 120 → "2h", 90 → "1h30" */
function fmtMin(m) {
  m = Math.max(0, Math.round(num(m, 0)));
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? h + 'h' : h + 'h' + pad2(r);
}

/* UNA LISTA E' UNA LISTA, tutto il resto e' vuoto.
   `x || []` non basta: da un salvataggio vecchio o da una copia
   ripristinata male puo' arrivare `barItems: "niente"`, che e' vero e
   quindi passa il controllo -- e poi `.reduce` non esiste e salta il
   conto di TUTTA la lista, non solo di quell'ingresso. Con una riga
   sola si perde al massimo un dato, mai una schermata. */
function lista(x) { return Array.isArray(x) ? x : []; }

/* L'ANNULLA.
   A una cassa si sbaglia, e si sbaglia in fretta: il dito prende
   "Paga tutto" invece di "Resto", l'ingresso giusto invece di quello
   accanto. Finora l'unica strada era rifare tutto a mano -- e per un
   ingresso eliminato non c'era proprio strada.
   Adesso ogni azione che tocca i soldi o cancella qualcosa lascia per
   sei secondi un tasto per rimangiarsela. Sei secondi sono la
   distanza fra "l'ho fatto" e "aspetta": dopo, o e' giusta o te ne sei
   gia' accorto.
   Si rimette a posto una FOTOGRAFIA presa prima -- non si prova a
   ricalcolare al contrario: un'operazione inversa sbagliata farebbe
   danni peggiori di quelli che ripara. */
let annullaT = null;
function fatto(msg, ripristina) {
  toast(msg, ripristina);
}

let toastT = null;
function toast(msg, annulla) {
  const t = $('#toast');
  /* Se la targhetta non c'e' ancora, si tace e si va avanti.
     Non e' pignoleria: toast() viene chiamata anche DENTRO il recupero
     di "memoria piena" in save(), e li' un'esplosione trasformerebbe un
     avviso in un salvataggio interrotto a meta'. Chi avvisa non deve
     mai poter fare piu' danni di quello di cui avvisa. */
  if (!t) return;
  t.innerHTML = '';
  t.appendChild(el('span', 'tx', msg));
  clearTimeout(toastT);
  clearTimeout(annullaT);
  if (annulla) {
    const b = el('button', 'annulla', '\u21a9\ufe0e Annulla');
    b.onclick = () => {
      clearTimeout(toastT);
      t.classList.remove('show');
      annulla();
    };
    t.appendChild(b);
  }
  t.classList.toggle('con-annulla', !!annulla);
  t.classList.add('show');
  /* con l'annulla resta piu' a lungo: due secondi non bastano ad
     accorgersi di uno sbaglio, e sono proprio i secondi che servono */
  toastT = setTimeout(() => t.classList.remove('show'), annulla ? 6000 : 2000);
}

/* una fotografia dell'ingresso o della bozza, per rimetterla com'era */
function fotografia(c) { return JSON.parse(JSON.stringify(c)); }
function rimetti(c, foto) {
  Object.keys(c).forEach(k => { if (!(k in foto)) delete c[k]; });
  Object.assign(c, fotografia(foto));
}

/* LA GIORNATA FINISCE ALLE QUATTRO DEL MATTINO.
   Non a mezzanotte: il parco chiude tardi, e un gruppo entrato alle
   23:40 che esce all'una fa parte della serata di ieri, non della
   mattina di oggi. Chi conta la cassa la conta a fine serata, e
   vuole trovarci dentro tutta la serata.
   Sotto le quattro si e' ancora nel giorno prima. */
const ORA_CAMBIO_GIORNO = 4;

/* Il momento in cui e' cominciata la giornata a cui appartiene `ts`.
   E' l'unico posto in cui si decide "di che giorno e' questo
   ingresso": tutto il resto passa di qui. */
function giornataDi(ts) {
  const d = new Date(num(ts, Date.now()));
  if (d.getHours() < ORA_CAMBIO_GIORNO) d.setDate(d.getDate() - 1);
  d.setHours(ORA_CAMBIO_GIORNO, 0, 0, 0);
  return d.getTime();
}
function nomeGiornata(inizio) {
  const oggi = giornataDi(Date.now());
  if (inizio === oggi) return 'oggi';
  if (inizio === giornataDi(oggi - 1)) return 'ieri';
  const d = new Date(inizio);
  const GIORNI = ['domenica', 'luned\u00ec', 'marted\u00ec', 'mercoled\u00ec', 'gioved\u00ec', 'venerd\u00ec', 'sabato'];
  return GIORNI[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}

/* ---------- archivio dati ---------- */
const SK = { settings: 'gp_settings', entries: 'gp_entries', presets: 'gp_presets' };
function load(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch (e) { console.error('salvataggio fallito', k, e); toast('⚠️ Memoria piena: dati non salvati'); }
  // seconda copia in archivio: se il browser butta via la memoria veloce,
  // all'avvio i dati si rimettono a posto da soli
  if (typeof DATI !== 'undefined') { DATI.scrivi(k, v); copiaDiOggi(); }
}

/* Una fotografia al giorno, tenuta due settimane: serve quando i dati ci
   sono ma sono sbagliati (un "cancella tutto" preso per sbaglio). */
let ultimaCopia = 0, copiaInCoda = null;
function copiaDiOggi(subito) {
  if (typeof DATI === 'undefined' || !DATI.disponibile()) return;
  if (copiaInCoda) { clearTimeout(copiaInCoda); copiaInCoda = null; }
  const ora = Date.now();
  const manca = 60000 - (ora - ultimaCopia);
  if (manca > 0 && !subito) {
    /* Non più di una fotografia al minuto, ma quella saltata va RIMANDATA,
       non buttata: se la si scartava e basta, la copia del giorno restava
       ferma a com'era all'avvio dell'app (cioè vuota). */
    copiaInCoda = setTimeout(() => { copiaInCoda = null; copiaDiOggi(); }, manca);
    return;
  }
  ultimaCopia = ora;
  DATI.copiaDelGiorno({
    gp_entries: entries, gp_settings: settings, gp_presets: presets, quando: ora
  });
}
const saveEntries = () => { save(SK.entries, entries); spingiIngressi(); };
const saveSettings = () => { save(SK.settings, settings); spingiMeta('impostazioni', settings); };
const savePresets = () => { save(SK.presets, presets); spingiMeta('presets', presets); };

/* ---------- ponte col cloud ----------
   Il tablet resta il padrone: si salva sempre qui, poi si manda su.
   `firma` ignora agg/aggDa e ordina le chiavi, così due tablet che hanno
   lo stesso ingresso non se lo rimbalzano all'infinito. */
function firma(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(firma).join(',') + ']';
  return '{' + Object.keys(o).filter(k => k !== 'agg' && k !== 'aggDa').sort()
    .map(k => JSON.stringify(k) + ':' + firma(o[k])).join(',') + '}';
}
const inviati = new Map();     // id ingresso -> firma dell'ultima versione vista
const inviatiMeta = new Map(); // impostazioni/presets -> firma
function cloudDentro() {
  return !!(global_CLOUD() && CLOUD.stato().stato === 'dentro');
}
function global_CLOUD() { return typeof CLOUD !== 'undefined' ? CLOUD : null; }

function spingiIngressi() {
  if (!cloudDentro()) return;
  const vivi = new Set();
  entries.forEach(e => {
    if (!e || !e.id) return;
    vivi.add(e.id);
    const f = firma(e);
    if (inviati.get(e.id) !== f) { inviati.set(e.id, f); CLOUD.salvaIngresso(e); }
  });
  [...inviati.keys()].forEach(id => {
    if (!vivi.has(id)) { inviati.delete(id); CLOUD.togliIngresso(id); }
  });
}
function spingiMeta(nome, dato) {
  if (!cloudDentro()) return;
  const f = firma(dato);
  if (inviatiMeta.get(nome) === f) return;
  inviatiMeta.set(nome, f);
  CLOUD.salvaMeta(nome, dato);
}

function defaultSettings() {
  return {
    crazyExtraMinutes: 8,
    toleranceMinutes: 10,
    warnBeforeMinutes: 10,
    crazyJumpingPrice: 4,
    theme: 'dark',
    tariffaSuTotale: true,
    /* Il listino del cartello, a scaglioni di 10 minuti. 50' e 60'
       costano uguale, e cosi' 1h50' e 2h: e' scritto cosi' sul cartello. */
    tariffs: [
      { m: 10, p: 3 }, { m: 15, p: 4.5 }, { m: 20, p: 6 }, { m: 30, p: 7 },
      { m: 40, p: 10 }, { m: 50, p: 12 }, { m: 60, p: 12 }, { m: 70, p: 15 },
      { m: 80, p: 16.5 }, { m: 90, p: 19 }, { m: 100, p: 22 }, { m: 110, p: 24 }, { m: 120, p: 24 }
    ],
    quickDurations: [15, 30, 60, 90],
    /* Il listino di Birbalandia, dal cartello. */
    barMenu: [
      { id: 'b1',  name: 'Acqua',           price: 1,    em: '\ud83d\udca7', cat: 'Bevande' },
      { id: 'b2',  name: 'Caff\u00e8',           price: 1.2,  em: '\u2615',       cat: 'Bevande' },
      { id: 'b3',  name: 'Coca Cola',       price: 2.5,  em: '\ud83e\udd64', cat: 'Bevande' },
      { id: 'b4',  name: 'Coca Cola Zero',  price: 2.5,  em: '\ud83e\udd64', cat: 'Bevande' },
      { id: 'b5',  name: 'Fanta',           price: 2.5,  em: '\ud83c\udf4a', cat: 'Bevande' },
      { id: 'b6',  name: 'Sprite',          price: 2.5,  em: '\ud83c\udf4b', cat: 'Bevande' },
      { id: 'b7',  name: 'Schweppes',       price: 2,    em: '\ud83e\udd64', cat: 'Bevande' },
      { id: 'b8',  name: 'Gazzosa',         price: 2,    em: '\ud83c\udf4b', cat: 'Bevande' },
      { id: 'b9',  name: 'Estath\u00e8',        price: 2.5,  em: '\ud83e\uddc3', cat: 'Bevande' },
      { id: 'b10', name: 'Brasilena',       price: 2,    em: '\ud83e\udd64', cat: 'Bevande' },
      { id: 'b11', name: 'Patatine',        price: 1.5,  em: '\ud83c\udf5f', cat: 'Snack' },
      { id: 'b12', name: 'Heineken',        price: 3,    em: '\ud83c\udf7a', cat: 'Birre' },
      { id: 'b13', name: 'Nastro Azzurro',  price: 3,    em: '\ud83c\udf7a', cat: 'Birre' },
      { id: 'b14', name: 'Ichnusa',         price: 3,    em: '\ud83c\udf7a', cat: 'Birre' },
      { id: 'b15', name: "Tennent's",       price: 3.5,  em: '\ud83c\udf7a', cat: 'Birre' },
      { id: 'b16', name: 'Limoncello',      price: 3,    em: '\ud83c\udf4b', cat: 'Alcolici' },
      { id: 'b17', name: 'Amari',           price: 3,    em: '\ud83e\udd43', cat: 'Alcolici' },
      { id: 'b18', name: 'Grappa',          price: 4,    em: '\ud83e\udd43', cat: 'Alcolici' },
      { id: 'b19', name: 'Spritz',          price: 6,    em: '\ud83c\udf79', cat: 'Alcolici' }
    ],
    animazioni: true,
    schermoIntero: false,
    braceletSlots: [
      { start: '09:00', end: '12:00', color: '#22C55E', label: 'Verde' },
      { start: '12:00', end: '15:00', color: '#FBBF24', label: 'Giallo' },
      { start: '15:00', end: '18:00', color: '#0EA5E9', label: 'Azzurro' },
      { start: '18:00', end: '21:00', color: '#E23D4B', label: 'Rosso' }
    ]
  };
}

/* ---------- stato ---------- */
let settings = defaultSettings();
let entries = [];
let presets = [];
let tab = 'new';
let draft = freshDraft();
let showArchive = false;
const cardRefs = new Map();   // id ingresso -> riferimenti DOM della scheda
let clockT = null, tickT = null;

function freshDraft() {
  return {
    startTime: roundTo5(new Date()).getTime(),
    durationMinutes: 60,
    payLater: false,
    children: 1,
    crazyJumping: 0,
    people: [],
    barItems: [],
    braceletColor: null,
    braceletCustom: true,   // si parte "senza": il colore va scelto apposta
    /* il conto vive qui insieme all'ingresso: la linguetta aperta, che
       cosa e' gia' stato pagato riga per riga, e le due sezioni grosse */
    /* il conto vive qui insieme all'ingresso, con la stessa forma che
       avra' una volta registrato: quante ne ha pagate riga per riga, e
       gli IMPORTI gia' incassati, che sono la verita' dei soldi */
    paidLines: {},
    paidAmt: {},
    paidPark: 0,
    paidBar: 0,
    touched: false
  };
}

/* ---------- calcoli ---------- */
function tariffs() {
  /* IL PREZZO SI CONTROLLA COME I MINUTI.
     Si guardava solo che i minuti fossero un numero: una riga con il
     prezzo sbagliato -- vuoto, una parola, un campo lasciato a meta'
     nelle impostazioni -- entrava nel listino e da li' in poi il
     dovuto veniva "NaN €". Una tariffa senza prezzo non e' una
     tariffa: si butta, e le altre continuano a funzionare.
     E la lista dev'essere una lista: da un salvataggio vecchio o dal
     cloud puo' arrivare qualunque cosa (vedi lista()). */
  return lista(settings.tariffs)
    .filter(t => t && Number.isFinite(t.m) && t.m > 0 && Number.isFinite(t.p) && t.p >= 0)
    .slice().sort((a, b) => a.m - b.m);
}
function priceFor(mins) {
  mins = Math.max(0, num(mins, 0));
  const list = tariffs();
  if (!list.length) return 0;
  for (const t of list) if (mins <= t.m) return t.p;
  /* Oltre l'ultimo scaglione il prezzo NON sale piu': dopo le 2 ore
     sono 24 euro e basta. Prima proseguiva in proporzione e a 3 ore
     avrebbe chiesto 36. */
  return list[list.length - 1].p;
}
function braceletFor(ts) {
  const d = new Date(num(ts, Date.now()));
  const mins = d.getHours() * 60 + d.getMinutes();
  for (const s of lista(settings.braceletSlots)) {
    const a = hhmmToMin(s.start), b = hhmmToMin(s.end);
    if (a <= b) { if (mins >= a && mins < b) return s; }
    else if (mins >= a || mins < b) return s;
  }
  return null;
}
function endTimeOf(e) {
  return e.startTime + (num(e.durationMinutes, 0) + num(e.crazyJumping, 0) * settings.crazyExtraMinutes) * 60000;
}
function stateOf(e, now) {
  if (e.payLater) return 'later';
  const r = endTimeOf(e) - now;
  if (r < -settings.toleranceMinutes * 60000) return 'danger';
  if (r < settings.warnBeforeMinutes * 60000) return 'warn';
  return 'ok';
}
function barTotal(e) {
  return lista(e.barItems).reduce((s, i) => s + num(i.price, 0) * num(i.qty, 0), 0);
}
function costOf(entry) {
  /* Zero bambini vuol dire ZERO, non uno. Da quando i bambini sono una
     card con la sua quantita' -- come una bibita -- una vendita al solo
     bar e' semplicemente un ingresso con zero bambini, e il vecchio
     "si paga per almeno uno" avrebbe fatto pagare un ingresso a chi
     passava solo a bere. */
  const children = clamp(entry.children, 0, 1e6);
  const crazy = clamp(entry.crazyJumping, 0, 1e6) * settings.crazyJumpingPrice;
  /* I minuti REGALATI dal Crazy Jumping non si pagano: restano dentro
     piu' a lungo, ma lo scaglione si calcola sul tempo del parco. Il
     Crazy si paga a parte, col suo prezzo. */
  const regalati = clamp(entry.crazyJumping, 0, 1e6) * settings.crazyExtraMinutes;
  let base;
  if (entry.payLater) {
    // paga il tempo passato dentro, meno quello regalato dal Crazy
    const stato = Math.max(0, (Date.now() - entry.startTime) / 60000 - regalati);
    base = priceFor(up5(stato));
  } else {
    const totMin = clamp(entry.durationMinutes, 0, 1e6);
    if (settings.tariffaSuTotale === false) {
      // a scaglioni: la durata iniziale al suo prezzo, il tempo aggiunto al suo
      const iniz = clamp(num(entry.baseMinutes, entry.durationMinutes), 0, 1e6);
      const agg = Math.max(0, totMin - iniz);
      base = priceFor(up5(iniz)) + (agg > 0 ? priceFor(up5(agg)) : 0);
    } else {
      // sul totale: chi resta un'ora paga la tariffa dell'ora, non 30'+30'
      base = priceFor(up5(totMin));
    }
  }
  return {
    children,
    /* quanto costa UN bambino: serve alla card dei bambini e a sapere
       quanti soldi muovere quando se ne segna uno come pagato */
    unit: Math.round(base * 100) / 100,
    crazyCost: Math.round(crazy * 100) / 100,
    parkTotal: Math.round(base * children * 100) / 100
  };
}

/* Il dovuto = quanto costa adesso meno quanto e' gia' stato incassato.
   Si registra l'IMPORTO versato, non quali righe: cosi' se il prezzo
   cambia dopo (tempo esteso, bambino aggiunto) la differenza torna
   dovuta invece di restare nascosta sotto una spunta. */
function dueOf(entry) {
  /* Se l'ingresso e' gia' uscito il prezzo e' quello che era in quel
     momento: cambiare il listino non deve far ricomparire un residuo su
     un conto gia' saldato. */
  const fermo = entry.costoFinale;
  const c = costOf(entry);
  const park = fermo ? num(fermo.parco, 0) : Math.round((c.parkTotal + c.crazyCost) * 100) / 100;
  const bar = fermo ? num(fermo.bar, 0) : Math.round(barTotal(entry) * 100) / 100;
  const paidPark = Math.max(0, num(entry.paidPark, 0));
  const paidBar = Math.max(0, num(entry.paidBar, 0));
  const r2 = v => Math.round(v * 100) / 100;
  const parkDue = Math.max(0, r2(park - paidPark));
  const barDue = Math.max(0, r2(bar - paidBar));
  return {
    park, bar,
    parkPaid: Math.min(paidPark, park), barPaid: Math.min(paidBar, bar),
    paidPark, paidBar,
    parkDue, barDue,
    total: r2(parkDue + barDue),
    avanzo: r2(Math.max(0, paidPark - park) + Math.max(0, paidBar - bar))
  };
}

function activeEntries() {
  const a = entries.filter(e => e.status === 'active');
  return a.filter(e => !e.payLater).sort((x, y) => endTimeOf(x) - endTimeOf(y))
    .concat(a.filter(e => e.payLater).sort((x, y) => x.startTime - y.startTime));
}
/* quanti ingressi archiviati si disegnano prima di chiedere. Duecento
   sono un paio di settimane piene: oltre, si sta cercando altro. */
const ARCHIVIO_A_VISTA = 200;
let archivioTutto = false;

function archived() {
  return entries.filter(e => e.status !== 'active')
    .sort((a, b) => (b.closedAt || b.createdAt || 0) - (a.closedAt || a.createdAt || 0));
}
function roleOf(k) { return AV.ROLES.find(r => r.key === k) || AV.ROLES[AV.ROLES.length - 1]; }
function nameOf(p) { return (p.name && p.name.trim()) || roleOf(p.role).label; }

let sheetEsc = null;
function sheet(title, opts) {
  opts = opts || {};
  const root = $('#modalRoot');
  root.classList.remove('hidden');
  root.innerHTML = '';

  const ov = el('div', 'm-overlay');
  /* `grande`: per i fogli che devono contenere dei grafici. Un foglio
     alto mezzo schermo va bene per una domanda sola, non per una
     schermata in cui si scorre e si confronta. */
  const box = el('div', 'm-box' + (opts.grande ? ' grande' : ''));
  box.appendChild(el('div', 'm-grip'));

  const head = el('div', 'm-head');
  const h = el('h3'); h.textContent = title;
  head.appendChild(h);
  const x = el('button', 'icon-btn', '✕');
  x.setAttribute('aria-label', 'Chiudi');
  head.appendChild(x);
  box.appendChild(head);

  const body = el('div', 'm-body');
  box.appendChild(body);

  let foot = null;
  if (opts.foot !== false) {
    foot = el('div', 'm-foot');
    box.appendChild(foot);
  }

  root.appendChild(ov);
  root.appendChild(box);

  const close = () => {
    root.classList.add('hidden');
    root.innerHTML = '';
    document.removeEventListener('keydown', sheetEsc);
    sheetEsc = null;
    if (typeof opts.onClose === 'function') opts.onClose();
  };
  ov.onclick = close;
  x.onclick = close;
  sheetEsc = (ev) => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', sheetEsc);

  return { box, body, foot, close, setTitle: (t) => { h.textContent = t; } };
}
function footBtn(foot, label, cls, fn) {
  const b = el('button', 'btn ' + (cls || ''), label);
  b.onclick = fn;
  foot.appendChild(b);
  return b;
}

/* ============================================================
   VISTA: NUOVO INGRESSO
   ============================================================ */
const R = {};   // riferimenti DOM riutilizzati

/* ============================================================
   IL PANNELLO DEL CONTO
   Le linguette in alto sono la navigazione: "Parco" apre l'ingresso
   -- bambini, Crazy, orario, durata, chi accompagna -- e le altre
   aprono il bar di quella categoria.

   Di pannelli ce n'e' UNO SOLO e si sposta: sta in "+ Nuovo" per il
   gruppo che stai registrando, e va DENTRO la scheda che vola quando
   apri il conto di chi e' gia' dentro. Averne due copie avrebbe voluto
   dire tenerle allineate a mano per sempre.
   ============================================================ */
function pcRif(cls) { return PAN.root ? PAN.root.querySelector(cls) : null; }

/* per un ingresso gia' registrato ogni tocco e' definitivo: si salva
   subito e la scheda sotto si aggiorna */
function pcSalva() {
  if (PAN.ingresso) {
    saveEntries();
    syncCard(PAN.ingresso);
    tick();
  } else {
    draft.touched = true;
  }
}

function costruisciPannello() {
  if (PAN.root) return PAN.root;
  const p = el('div', 'pan-conto');
  /* DUE PARTI: sopra quello che si rimpicciolisce quando non ci sta
     (`pc-scala`), sotto il conto, che non si tocca mai. La cifra e i
     suoi tasti restano della loro taglia anche quando il resto e'
     al settanta per cento: e' quello che si guarda e si preme. */
  p.innerHTML = `
    <div class="pc-scala">
    <div class="bc-cat pc-cat"></div>

    <div class="pc-parco">
      <!-- QUANTI BAMBINI, PRIMA DI TUTTO IL RESTO.
           E' la cosa che si tocca sempre, a ogni gruppo, mentre il
           tempo il piu' delle volte resta quello di serie: la prima
           cosa sotto le dita deve essere quella che si fa sempre, non
           quella che si fa ogni tanto.
           Il prezzo sulla card segue il tempo scelto qui sotto, e si
           aggiorna da solo: non c'e' bisogno di rileggerlo. -->
      <div class="bc-griglia pc-due"></div>

      <!-- UNA FASCIA SOLA PER IL TEMPO: "dalle ... alle ...".
           Erano DUE fasce piu' una card ("Estendi tempo"): tre posti
           per la stessa domanda, e nessuno dei tre diceva fin quando
           il cliente aveva pagato.
           Adesso sono due gruppi uguali -- uno per quando entra, uno
           per quando esce -- e allungare vuol dire premere il piu' a
           destra, che e' come la domanda arriva davvero al banco: "me
           lo tieni fino alle tre?". Il filo verde sotto dice fin dove
           arrivano i soldi senza doverlo scrivere. -->
      <div class="card blk c-blu sec-tempo">
        <h2><span class="em">\u23f1\ufe0f</span> Tempo</h2>
        <div class="blk-in">
        <div class="tp-riga">
          <span class="tp-gr">
            <span class="em">\ud83d\udd52</span>
            <button data-a="ora" data-v="-5" aria-label="5 minuti prima">\u2212</button>
            <span class="v num pc-ora">--:--</span>
            <button data-a="ora" data-v="5" aria-label="5 minuti dopo">+</button>
            <button class="txt" data-a="ora" data-v="ora"><span class="em">\ud83d\udccd</span> ora</button>
          </span>
          <span class="tp-gr pc-gfine">
            <span class="em">\ud83d\udeaa</span>
            <button data-a="fine" data-v="-1" aria-label="esce prima">\u2212</button>
            <span class="v num pc-fine">--:--</span>
            <button data-a="fine" data-v="1" aria-label="esce dopo">+</button>
          </span>
          <span class="brc tp-dx">
            <button class="brc-b" data-a="bracapri">
              <span class="pallo pc-pallo"></span><span class="pc-bracnome">Auto</span>
            </button>
            <span class="brc-menu hidden">
              <span class="wl-k"><span class="em">\ud83c\udf97\ufe0f</span> Bracciale</span>
              <span class="wrist-row pc-brac"></span>
            </span>
          </span>
        </div>
        <div class="tp-filo"><i class="pc-filo"></i></div>
        <div class="tp-riga">
          <div class="chips pc-dur"></div>
          <span class="tp-dx pc-pag"></span>
        </div>
        </div>
      </div>

      <div class="card blk c-viola sec-people">
        <div class="testa-viola">
          <h2><span class="em">\ud83e\uddd1\u200d\ud83e\udd1d\u200d\ud83e\uddd1</span> Chi accompagna</h2>
          <button class="butta pc-butta hidden" data-a="butta"></button>
        </div>
        <div class="blk-in">
          <div class="person-list pc-people"></div>
        </div>
      </div>
    </div>

    <div class="bc-griglia pc-bar hidden"></div>
    </div>
    <div class="pc-fondo"></div>
  `;

  /* I tasti si agganciano UNA volta sola e leggono sempre PAN: il
     pannello cambia padrone (draft o ingresso) e cambia posto, ma i
     comandi restano questi. */
  p.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || !p.contains(b)) return;
    const d = b.dataset;
    const c = C();

    /* l'uscita del gruppo: c'e' solo quando il pannello sta lavorando
       su un ingresso gia' registrato */
    if (d.uscita !== undefined) {
      if (PAN.ingresso) chiudiIngresso(PAN.ingresso);
      return;
    }

    /* --- le card: quantita' e pagato --- */
    const voce = d.add || d.meno || d.ppiu || d.pmeno;
    if (voce) {
      tocchi.id = voce;
      if (d.add !== undefined) {
        if (bcQ(voce) === 0 && voce !== 'bimbi' && voce !== 'crazy') tocchi.nato = voce;
        bcSetQ(voce, bcQ(voce) + 1);
      } else if (d.meno !== undefined) bcSetQ(voce, bcQ(voce) - 1);
      else if (d.ppiu !== undefined) segnaPagate(voce, bcPag(voce) + 1);
      else segnaPagate(voce, bcPag(voce) - 1);
      pcSalva();
      /* i bambini e il Crazy cambiano il prezzo e i minuti di tutti:
         li' si rifa' tutto, per una bibita basta la sua card */
      if (voce === 'bimbi' || voce === 'crazy') aggiornaPannello();
      else { pcVoce(voce); pcFondoDis(); }
      /* LA NASCITA SI VEDE UNA VOLTA SOLA.
         `nato` accende la fascia dei tasti che scivola su: e' bella
         quando una card prende vita, ma restava accesa e la rifaceva a
         OGNI piu' e meno della stessa bibita -- e i tasti sembravano
         spostarsi da soli mentre ci battevi sopra. Il disegno appena
         fatto se l'e' presa, quindi qui si spegne. */
      tocchi.nato = null;
      return;
    }

    /* --- la navigazione --- */
    if (d.cat !== undefined) { PAN.cat = d.cat; aggiornaPannello({ entra: true }); return; }

    /* --- il blocco Parco --- */
    if (d.a === 'ora') {
      if (d.v === 'ora') { c.startTime = roundTo5(new Date()).getTime(); c.braceletCustom = false; }
      else c.startTime = num(c.startTime, Date.now()) + parseInt(d.v, 10) * 60000;
      pcSalva(); aggiornaPannello(); return;
    }
    /* Il meno e il piu' della card del tempo saltano di SCAGLIONE, non
       di cinque minuti: il listino e' fatto a scaglioni e fermarsi in
       mezzo a uno vuol dire pagare il taglio dopo lo stesso. I minuti
       esatti restano dove sono sempre stati, nella fascia "Quanto
       restano". */
    /* pagare il tempo E' pagare i bambini: stessa cassa, stesso punto */
    if (d.a === 'pagatempo') {
      tocchi.id = 'bimbi';
      pagaTempo(num(d.v, 0));
      pcSalva();
      aggiornaPannello();
      return;
    }
    /* L'ORA DI USCITA SALTA AL QUARTO D'ORA, non di quindici minuti
       tondi. Chi chiede "me lo tieni fino alle tre?" pensa a un orario
       dell'orologio, non a una durata: partendo dalle 14:10 il piu'
       porta alle 14:15, poi 14:30, 14:45, 15:00 -- cioe' proprio dove
       si vuole arrivare. Con un passo fisso da quindici si sarebbe
       fermato a 14:25, 14:40, 14:55 e le tre non le avrebbe prese mai.
       Si muove la DURATA, non l'orario di fine: l'ingresso resta dov'e'
       e i minuti regalati dal Crazy restano attaccati alla fine. */
    if (d.a === 'fine') {
      if (c.payLater) return;
      const min = clamp(num(c.durationMinutes, 60), 0, 1e6);
      const uscita = new Date(endTimeOf(c));
      const resto = (uscita.getHours() * 60 + uscita.getMinutes()) % 15;
      const passo = num(d.v, 0) > 0 ? 15 - resto : (resto || 15);
      c.durationMinutes = clamp(num(d.v, 0) > 0 ? min + passo : min - passo, 5, 100000);
      pcSalva();
      aggiornaPannello();
      return;
    }
    /* il menu del bracciale si apre e si chiude senza rifare la
       fascia: rifarla lo richiuderebbe a ogni colore provato */
    if (d.a === 'bracapri') {
      const men = p.querySelector('.brc-menu');
      const chiuso = men.classList.contains('hidden');
      men.classList.toggle('hidden');
      if (chiuso) { alzaMenu(men, b); chiudiFuori(men, p.querySelector('.brc')); }
      return;
    }
    if (d.a === 'min') {
      const m = clamp(c.durationMinutes, 1, 99999);
      c.durationMinutes = d.v === '-5' ? Math.max(5, m - 5)
        : d.v === '+5' ? Math.min(99999, m + 5) : clamp(parseInt(d.v, 10), 1, 99999);
      c.payLater = false;
      pcSalva(); aggiornaPannello(); return;
    }
    if (d.a === 'dopo') { c.payLater = !c.payLater; pcSalva(); aggiornaPannello(); return; }
    if (d.a === 'butta') {
      /* il riferimento e' uno solo: il cestino lo toglie e basta */
      const box = pcRif('.pc-people');
      c.people = [];
      box.dataset.apri = ''; box.dataset.sig = '';
      pcSalva(); aggiornaPannello(); return;
    }

    /* --- i tasti del conto --- */
    if (d.sez !== undefined)   { bcSegna(d.sez, true); pcSalva(); aggiornaPannello(); return; }
    if (d.desez !== undefined) { bcSegna(d.desez, false); pcSalva(); aggiornaPannello(); return; }
    if (d.tutto !== undefined) {
      const foto = fotografia(C());
      const prima = r2(contoPagatoParco() + contoPagatoCrazy() + contoPagatoBar());
      pagaTutto(); pcSalva(); aggiornaPannello();
      const entrati = r2(r2(C().paidPark + C().paidBar) - r2(foto.paidPark + foto.paidBar));
      if (entrati > 0.005) {
        fatto('Incassati ' + eur(entrati), () => {
          rimetti(C(), foto);
          pcSalva();
          aggiornaPannello();
          toast('Incasso annullato \u21a9\ufe0e');
        });
      }
      return;
    }
    if (d.reg !== undefined)   {
      if (PAN.ingresso) { posa(cardRefs.get(PAN.ingresso.id) && cardRefs.get(PAN.ingresso.id).card); return; }
      commitEntry(); return;
    }
    if (d.svuota !== undefined) { foglioSvuota(); return; }
    if (d.resto !== undefined) {
      const dovuto = contoResta();
      if (dovuto <= 0) return;
      /* sovrapposto a tutto: se lo infilassi nella pagina, la pagina si
         ridimensionerebbe sotto le dita proprio mentre conti i soldi */
      /* solo il conto del resto: non muove niente. I soldi si segnano
         dopo, con "Paga tutto" o registrando. */
      apriVelo(pannelloResto(null, dovuto, null), 'Quanto ridare - restano ' + eur(dovuto));
      return;
    }
  });

  /* Le pastiglie del bracciale: la riga era un div vuoto e nessuno la
     riempiva piu', quindi registrando non si poteva scegliere il
     colore. sincronizzaBracciali() da sola accende, non crea. */
  costruisciBracciali(p.querySelector('.pc-brac'), (hex, custom) => {
    const c = C();
    c.braceletColor = hex;
    c.braceletCustom = custom;
    pcSalva();
    p.querySelector('.brc-menu').classList.add('hidden');   // scelto: si chiude
    aggiornaPannello();
    if (PAN.ingresso) aggiornaPallino(PAN.ingresso);
  });

  /* la sfumatura segue il dito: scorrendo cambia da che parte c'e'
     dell'altro, e va ridetto */
  const vano = p.querySelector('.pc-scala');
  if (vano) vano.addEventListener('scroll', () => sfuma(vano), { passive: true });

  PAN.root = p;
  return p;
}

/* Sposta il pannello dentro un contenitore e gli dice su che cosa
   lavorare. E' l'unico modo di cambiargli padrone. */
function montaPannello(host, conto, opz) {
  opz = opz || {};
  const p = costruisciPannello();
  PAN.conto = conto;
  PAN.ingresso = opz.ingresso || null;
  tocchi.id = null; tocchi.nato = null;
  const cats = bcCategorie();
  const voluta = opz.cat || PAN.cat;
  PAN.cat = cats.indexOf(voluta) >= 0 ? voluta : cats[0];
  /* l'elenco delle persone cambia padrone: la firma va buttata, se no
     i tasti restano agganciati al gruppo di prima */
  const box = p.querySelector('.pc-people');
  box.dataset.sig = '';
  /* Se un riferimento c'e' GIA', l'armadio si apre da solo: e' gia'
     stato scelto in registrazione, e richiederne un tocco per rivederlo
     voleva dire far ricominciare da capo chi voleva solo controllare o
     correggere un dettaglio. */
  box.dataset.apri = (conto && conto.people && conto.people.length) ? conto.people[0].id : '';
  box.dataset.tav = '';
  if (p.parentNode !== host) {
    host.appendChild(p);
    /* L'INGRESSO DEL PANNELLO NON SI FA SE LA SCHEDA STA GIA' VOLANDO.
       Sono due movimenti nello stesso istante e in due direzioni
       diverse: la scheda cresce verso il basso, il contenuto scivola
       verso l'alto. Il volo E' gia' l'ingresso -- basta lui.
       E non si fa nemmeno dentro una vista nascosta (il pannello che
       torna in "+ Nuovo" mentre si guarda la lista): un'animazione che
       nessuno vede e' solo lavoro. */
    const inVolo = volante && volante.card && volante.card.contains(host);
    if (anima() && !inVolo && host.offsetParent) {
      p.classList.remove('arriva');
      void p.offsetWidth;
      p.classList.add('arriva');
      setTimeout(() => p.classList.remove('arriva'), 320);
    }
  }
  aggiornaPannello();
  return p;
}

/* la prima categoria del bar: e' quella con cui si apre il conto di chi
   e' gia' dentro, perche' li' quasi sempre si sta segnando da bere */
function primaCategoriaBar() {
  const cats = bcCategorie().filter(c => c !== 'Parco');
  return cats.length ? cats[0] : 'Parco';
}

/* La firma della griglia dice solo com'e' FATTA -- quali voci, in che
   ordine, a che prezzo -- e NON quante ne hai prese. Ci teneva dentro
   anche le quantita', e cosi' bastava segnare una bibita perche' tutta
   la griglia venisse buttata e rifatta: dodici card distrutte e
   ricostruite per un numero cambiato, con le icone che ricaricavano e
   le animazioni che ripartivano da capo -- ed e' il "si rinfresca
   tutto" che si vede aprendo e chiudendo il pannello.
   Adesso, quando la struttura e' la stessa, si ritocca solo la card
   che e' cambiata davvero. */
function firmaGriglia() {
  return 'bar\u00a7' + lista(settings.barMenu).map(v =>
    v.id + ':' + v.price + ':' + v.name + ':' + (v.cat || '')).join(',');
}
/* i numeri di UNA card: se non cambiano, la card non si tocca */
function firmaVoce(id) { return bcQ(id) + '/' + bcPag(id); }

function pcGriglia() {
  const g = pcRif('.pc-bar');
  if (!g) return;
  const voci = lista(settings.barMenu);
  if (g.dataset.sig !== firmaGriglia()) {
    g.dataset.sig = firmaGriglia();
    /* UNA LISTA SOLA, CON I TITOLETTI IN MEZZO.
       Le voci restano nell'ordine del listino -- e' quello che lui ha
       messo in ordine di quanto si vendono -- e quando cambia scaffale
       si mette una riga col nome sopra. Cosi' si scorre una volta
       invece di cambiare linguetta quattro volte. */
    let scaffale = null;
    g.innerHTML = voci.map(v => {
      const c = (v.cat || 'Altro').trim() || 'Altro';
      const titolo = c !== scaffale ? '<div class="bc-scaffale">' + esc(c) + '</div>' : '';
      scaffale = c;
      return titolo + bcCard(v);
    }).join('');
    g.querySelectorAll('.bc-card').forEach(c => { c.dataset.n = firmaVoce(c.dataset.id); });
    tocchi.id = null; tocchi.nato = null;
    return;
  }
  voci.forEach(v => {
    const card = g.querySelector('.bc-card[data-id="' + v.id + '"]');
    if (!card) return;
    const firma = firmaVoce(v.id);
    if (card.dataset.n === firma) return;
    const t = el('div');
    t.innerHTML = bcCard(v);
    const nuova = t.firstElementChild;
    nuova.dataset.n = firma;
    card.replaceWith(nuova);
  });
}
/* rifa' una sola card, al posto suo: rifare tutta la griglia a ogni
   tocco faceva lampeggiare mezza schermata sotto le dita */
function pcVoce(id) {
  const vecchia = PAN.root && PAN.root.querySelector('.bc-card[data-id="' + id + '"]');
  if (!vecchia) return;
  const t = el('div');
  t.innerHTML = bcCard(bcVoce(id), id === 'bimbi' || id === 'crazy');
  const nuova = t.firstElementChild;
  nuova.dataset.n = firmaVoce(id);
  vecchia.replaceWith(nuova);
  const g = pcRif('.pc-bar');
  if (g) g.dataset.sig = firmaGriglia();
}
/* QUANTI MINUTI SONO GIA' PAGATI.
   Dai soldi presi per il parco si toglie il Crazy -- che si paga a
   parte -- si divide per i bambini, e si cerca l'ultimo scaglione del
   listino che quella cifra copre PER INTERO. I minuti regalati dal
   Crazy si sommano solo se il Crazy e' stato pagato: arrivano col suo
   prezzo, non da soli.
   Qui si legge soltanto: nessuna regola del denaro viene toccata. */
/* PAGARE IL TEMPO E' PAGARE I BAMBINI.
   Questi minuti non hanno una cassa loro: li comprano gli stessi euro
   che la card dei Bambini conta a teste. Quindi si passa di li' e non
   si apre una seconda strada per muovere i soldi -- due strade sulla
   stessa cassa sono la radice dei conti storti, ed e' il motivo per cui
   muoviSoldi() e' l'unico posto da cui il denaro si sposta.
   Sta in una funzione con un nome suo, e non dentro il gestore dei
   tocchi, perche' cosi' si puo' provare senza uno schermo davanti. */
function pagaTempo(delta) {
  delta = num(delta, 0);
  /* A TEMPO APERTO NON SI INCASSA IN ANTICIPO.
     Senza un'ora di uscita non c'e' una durata, quindi non c'e' un
     prezzo da coprire: il conto si fa all'uscita, sul tempo davvero
     passato. Incassare prima vorrebbe dire prendere dei soldi contro
     un numero che ancora non esiste.
     Il tasto e' spento anche nel pannello, ma il divieto sta QUI: una
     regola che vive solo nel disegno se la porta via la prima
     scorciatoia. Il RESO invece resta sempre possibile -- se il tempo
     e' diventato aperto dopo un incasso, quei soldi devono poter
     tornare indietro da dove sono entrati. */
  if (delta > 0 && C().payLater) return;
  segnaPagate('bimbi', bcPag('bimbi') + delta);
}

/* Quanto dura in tutto, minuti regalati dal Crazy compresi: e' il
   numero che sta dietro all'ora di uscita scritta nella fascia, e
   quindi anche il metro su cui si misura quanto e' pagato. */
/* IL TEMPO DA PAGARE E' SOLO QUELLO DEL PARCO.
   I minuti del Crazy Jumping sono REGALATI: si resta dentro di piu',
   ma quei minuti non si pagano -- il Crazy si paga a parte, col suo
   prezzo, e quella e' un'altra riga del conto.
   Contarli qui era un errore che si vedeva: la barra del pagato non
   arrivava mai in fondo e la fascia diceva "pagato fino alle 18:20"
   anche a conto saldato, cioe' chiedeva soldi che non erano dovuti.
   L'ora di USCITA invece i minuti regalati li comprende, ed e' giusto:
   e' l'ora in cui escono davvero. Sono due cose diverse -- fin quando
   hanno pagato, e fino a quando restano -- e adesso lo dicono. */
function tempoTotale(c) {
  c = c || C();
  return clamp(num(c.durationMinutes, 60), 0, 1e6);
}

function minutiPagati(c) {
  c = c || C();
  const bimbi = clamp(num(c.children, 0), 0, 1e6);
  const crazy = clamp(num(c.crazyJumping, 0), 0, 1e6);
  const costoCrazy = crazy * num(settings.crazyJumpingPrice, 0);
  /* I soldi si leggono dalla RIGA dei bambini, non dal totale del
     parco meno il Crazy: paidAmt sa gia' quanto e' entrato per ognuna
     delle due voci, e dedurre e' peggio che leggere. Il ripiego serve
     agli ingressi vecchi, salvati prima che le righe tenessero il
     conto dei loro soldi. */
  const amt = c.paidAmt || {};
  const rigaBimbi = num(amt.bimbi, NaN);
  /* I MINUTI REGALATI DAL CRAZY NON ENTRANO QUI.
     Sono gratis: non sono tempo comprato, e sommarli faceva dire
     "pagati 8 minuti" a chi non aveva ancora dato un euro per il
     parco. Qui si risponde a una domanda sola -- QUANTO TEMPO DI PARCO
     HANNO PAGATO -- e la risposta la danno solo i soldi della riga dei
     bambini. Il Crazy ha la sua card, con la sua fascia verde. */
  const soldiBimbi = isFinite(rigaBimbi)
    ? Math.max(0, rigaBimbi)
    /* ripiego per gli ingressi vecchi, salvati prima che le righe
       tenessero il conto dei loro soldi */
    : Math.max(0, Math.max(0, num(c.paidPark, 0)) - costoCrazy);
  if (!bimbi) return 0;
  const perBambino = soldiBimbi / bimbi;
  let coperti = 0;
  for (const t of tariffs()) if (t.p <= perBambino + 1e-9) coperti = t.m;
  return coperti;
}

/* LA FASCIA DEL TEMPO, riempita a mano e non rifatta da capo: qui
   dentro c'e' un menu che puo' essere aperto (il bracciale) e rifare
   l'HTML lo chiuderebbe a ogni colore provato. */
function disegnaFascia(p, c) {
  const aperto = !!c.payLater;
  p.querySelector('.pc-ora').textContent = fmtTime(c.startTime);
  p.querySelector('.pc-fine').textContent = aperto ? '\u2014' : fmtTime(endTimeOf(c));
  /* i due tasti dell'uscita non hanno senso se un'uscita non c'e' */
  p.querySelector('.pc-gfine').classList.toggle('spento', aperto);
  $$('.pc-gfine button', p).forEach(b => { b.disabled = aperto; });

  /* il filo verde: quanto del tempo e' gia' coperto dai soldi presi */
  const tot = tempoTotale(c);
  const pag = Math.min(tot, minutiPagati(c));
  const filo = p.querySelector('.pc-filo');
  filo.style.width = aperto || !tot ? '0%' : Math.round(pag / tot * 100) + '%';
  p.querySelector('.tp-filo').classList.toggle('aperta', aperto);

  /* la pastiglia del bracciale: un pallino e una parola. I sei tasti
     stanno nel menu che si apre -- sempre in fila si mangiavano
     mezza riga per una cosa che si sceglie una volta sola. */
  const slot = braceletFor(c.startTime);
  const senza = c.braceletCustom && !c.braceletColor;
  const col = senza ? null : (c.braceletCustom ? c.braceletColor : (slot && slot.color));
  const pallo = p.querySelector('.pc-pallo');
  pallo.style.background = col || 'transparent';
  pallo.style.borderStyle = col ? 'solid' : 'dashed';
  p.querySelector('.pc-bracnome').textContent =
    senza ? 'Senza' : c.braceletCustom ? (AV.colorName(col, 0) || 'Bracciale') : 'Auto';
  sincronizzaBracciali(p.querySelector('.pc-brac'), c.startTime, c.braceletColor, c.braceletCustom);

  p.querySelector('.pc-pag').innerHTML = pastigliaPagato(c);
}

/* Fin quando ha pagato, in una pastiglia. Il verde vuol dire "pagato":
   finche' non e' entrato niente resta neutra, perche' una fascia verde
   con scritto "da pagare" dice due cose opposte nello stesso pezzo. */
function pastigliaPagato(c) {
  c = c || C();
  const aperto = !!c.payLater;
  const bimbi = clamp(num(c.children, 0), 0, 1e6);
  const tot = tempoTotale(c);
  const pag = Math.min(tot, minutiPagati(c));
  const tutto = !aperto && tot > 0 && pag >= tot;
  let testo;
  if (!bimbi) testo = 'nessun bambino';
  else if (aperto) testo = 'si conta all\u2019uscita';
  else if (tutto) testo = '\u2713 pagato tutto';
  else if (pag <= 0) testo = 'da pagare <b>' + eur(dueOf(c).park) + '</b>';
  else testo = 'pagato fino alle <b>' + fmtTime(num(c.startTime, 0) + pag * 60000) + '</b>';
  /* il piu' e' spento a tempo aperto: non c'e' una durata, quindi non
     c'e' un prezzo da coprire. Il meno resta, che un reso deve poter
     tornare indietro sempre. */
  const su = tutto || !bimbi || aperto;
  return '<span class="pgl' + (tutto ? ' tutto' : pag > 0 && !aperto ? '' : ' vuota') + '">' +
    '<span class="k">' + testo + '</span>' +
    '<button data-a="pagatempo" data-v="-1"' + (bcPag('bimbi') <= 0 ? ' disabled' : '') +
      ' aria-label="togli un pagamento">\u2212</button>' +
    '<button data-a="pagatempo" data-v="1"' + (su ? ' disabled' : '') +
      ' aria-label="incassa il tempo">+</button></span>';
}

function pcFondoDis() {
  const box = pcRif('.pc-fondo');
  if (!box) return;
  box.innerHTML = pcFondo();
  tocchi.id = null;
}

function aggiornaPannello(opz) {
  opz = opz || {};
  const p = PAN.root;
  if (!p) return;
  const c = C();

  /* le linguette */
  const cats = bcCategorie();
  if (cats.indexOf(PAN.cat) < 0) PAN.cat = cats[0];
  const catBox = p.querySelector('.pc-cat');
  const firmaCat = cats.join('|') + '>' + PAN.cat;
  if (catBox.dataset.sig !== firmaCat) {
    catBox.dataset.sig = firmaCat;
    catBox.innerHTML = cats.map(x =>
      '<button data-cat="' + esc(x) + '"' + (PAN.cat === x ? ' class="on"' : '') + '>' +
      iconaCat(x) + esc(x) + '</button>').join('');
  }
  const inParco = PAN.cat === 'Parco';
  p.querySelector('.pc-parco').classList.toggle('hidden', !inParco);
  p.querySelector('.pc-bar').classList.toggle('hidden', inParco);

  if (inParco) {
    /* le due card sopra l'orario: bambini e Crazy, sempre aperte */
    const due = p.querySelector('.pc-due');
    const firmaDue = ['bimbi', 'crazy'].map(k =>
      k + ':' + bcQ(k) + '/' + bcPag(k) + '/' + prezzoUnita(k)).join(',');
    if (due.dataset.sig !== firmaDue) {
      due.dataset.sig = firmaDue;
      /* DUE card, non piu' tre. Quello che faceva "Estendi tempo" adesso
         lo fa la fascia del tempo qui sopra, e lo fa meglio: li' c'e'
         anche l'ora di uscita, e i minuti pagati si leggono come un
         orario ("fino alle 13:40") invece che come una frazione. */
      due.innerHTML = bcCard(bcVoce('bimbi'), true) + bcCard(bcVoce('crazy'), true);
      tocchi.id = null; tocchi.nato = null;
    }

    disegnaFascia(p, c);

    const dur = p.querySelector('.pc-dur');
    const tagli = (settings.quickDurations || [15, 30, 60, 90]);
    const firmaDur = tagli.join('|') + '>' + (c.payLater ? 'dopo' : c.durationMinutes);
    if (dur.dataset.sig !== firmaDur) {
      dur.dataset.sig = firmaDur;
      dur.innerHTML = tagli.map(m =>
        '<button class="chip' + (!c.payLater && c.durationMinutes === m ? ' on' : '') +
        '" data-a="min" data-v="' + m + '">' + fmtMin(m) + '</button>').join('') +
        /* "TEMPO APERTO", non "paga dopo": la domanda di questa fascia e'
           QUANTO RESTANO, e mettere una parola sui soldi in mezzo ai
           tagli di tempo faceva pensare a un modo di pagare invece che
           a una durata. Il conto lo si fa lo stesso all'uscita, sul
           tempo davvero passato: e' sempre stato cosi', cambia solo il
           nome. */
        '<button class="chip later' + (c.payLater ? ' on' : '') + '" data-a="dopo" ' +
        'title="Resta senza un orario di fine: si conta il tempo davvero passato">' +
        '\u23f3 Tempo aperto</button>';
    }
    c.people = lista(c.people);
    syncPeople(p.querySelector('.pc-people'), c.people, () => { pcSalva(); });
  } else {
    pcGriglia();
  }

  pcFondoDis();

  /* il contenuto e' cambiato: la scheda resta grande com'e' e a
     cambiare e' semmai la scala di quello che ci sta dentro */
  adattaTutto();

  if (opz.entra && anima()) {
    const q = inParco ? p.querySelector('.pc-parco') : p.querySelector('.pc-bar');
    q.classList.remove('entra'); void q.offsetWidth; q.classList.add('entra');
    setTimeout(() => q.classList.remove('entra'), 340);
  }
}

function costruisciBracciali(box, scegli) {
  box.innerHTML = '';
  /* si parte da "Senza": il colore va messo apposta, così non si scorda */
  const senza = el('button', 'wrist-dot senza', 'Senza');
  senza.title = 'Nessun bracciale';
  senza.onclick = (ev) => { ev.stopPropagation(); scegli(null, true); };
  box.appendChild(senza);

  const auto = el('button', 'wrist-dot auto', 'Auto');
  auto.title = 'Segue la fascia oraria';
  auto.onclick = (ev) => { ev.stopPropagation(); scegli(null, false); };
  box.appendChild(auto);

  /* i colori delle fasce orarie: quelli veri del parco */
  const usati = [];
  lista(settings.braceletSlots).forEach(sl => {
    if (sl.color && !usati.some(u => u.toLowerCase() === sl.color.toLowerCase())) usati.push(sl.color);
  });
  usati.forEach(hex => {
    const b = el('button', 'wrist-dot');
    b.style.background = hex;
    b.dataset.color = hex;
    b.title = AV.colorName(hex, 0);
    b.onclick = (ev) => { ev.stopPropagation(); scegli(hex, true); };
    box.appendChild(b);
  });
  return box;
}

/* Accende quello scelto. Sul tasto "Auto" fa vedere il colore della
   fascia PRIMA di toccarlo: pieno se Auto e' gia' attivo, altrimenti
   solo il contorno. Serve sapere quale bracciale mettere al polso
   guardando, senza dover premere per scoprirlo. */
function sincronizzaBracciali(box, inizio, colore, custom) {
  const slot = braceletFor(inizio);
  const senzaBracciale = custom && !colore;
  $$('.wrist-dot', box).forEach(b => {
    if (b.classList.contains('senza')) {
      b.classList.toggle('on', senzaBracciale);
    } else if (b.classList.contains('auto')) {
      b.classList.toggle('on', !custom);
      // su schermi stretti basta "Auto": il colore parla da solo
      const stretto = window.innerWidth < 1040;
      b.textContent = (slot && !stretto) ? 'Auto \u00b7 ' + (slot.label || '\u2014') : 'Auto';
      b.style.background = (slot && !custom) ? slot.color : '';
      b.style.color = (slot && !custom) ? '#fff' : '';
      b.style.borderColor = (slot && custom) ? slot.color : '';
      b.style.borderWidth = (slot && custom) ? '4px' : '';   // stacca dagli altri, che ne hanno 3
    } else {
      b.classList.toggle('on', !!(custom && colore &&
        b.dataset.color.toLowerCase() === String(colore).toLowerCase()));
    }
  });
}

/* La pezza della fantasia: la TRAMA VERA, coi due colori del capo.
   Un quadretto grande e senza didascalia si riconosce a vista, e al
   banco si sceglie guardando, non leggendo. */
function pezzaFantasia(pat, c1, c2) {
  const st = {
    'solid':     'background:' + c1,
    'stripes-h': 'background:repeating-linear-gradient(180deg,' + c1 + ' 0 6px,' + c2 + ' 6px 12px)',
    'stripes-v': 'background:repeating-linear-gradient(90deg,' + c1 + ' 0 6px,' + c2 + ' 6px 12px)',
    'dots':      'background:' + c1 + ';background-image:radial-gradient(' + c2 + ' 3px,transparent 3.2px);background-size:12px 12px',
    'plaid':     'background:' + c1 + ';background-image:repeating-linear-gradient(90deg,' + c2 + ' 0 4px,transparent 4px 13px),repeating-linear-gradient(180deg,' + c2 + ' 0 4px,transparent 4px 13px)',
    'scacchi':   'background:' + c1 + ';background-image:linear-gradient(45deg,' + c2 + ' 25%,transparent 25% 75%,' + c2 + ' 75%),linear-gradient(45deg,' + c2 + ' 25%,transparent 25% 75%,' + c2 + ' 75%);background-size:16px 16px;background-position:0 0,8px 8px',
    /* mimetico: tre toni e tessere di misura diversa, cosi' la griglia
       regolare non si vede piu' e sembra una macchia vera */
    'camo':      'background:' + c1 + ';background-image:' +
      'radial-gradient(ellipse 60% 70% at 20% 30%,' + c2 + ' 48%,transparent 50%),' +
      'radial-gradient(ellipse 55% 65% at 75% 65%,' + AV.shade(c1, -34) + ' 46%,transparent 48%),' +
      'radial-gradient(ellipse 50% 60% at 60% 15%,' + AV.shade(c1, 26) + ' 44%,transparent 46%);' +
      'background-size:29px 24px,23px 19px,19px 16px;background-position:0 0,11px 7px,5px 13px'
  };
  /* fiori e cuori sono SEGNI: a questa misura un carattere grande si
     legge meglio di un motivo ripetuto */
  const segno = { fiori: '\u273f', cuori: '\u2665' }[pat];
  const dentro = segno
    ? '<b style="color:' + c2 + '">' + segno + '</b>'
    : (pat === 'logo' ? scrittaFinta(c2) : '');
  return '<span class="sw" style="' + (st[pat] || ('background:' + c1)) + '">' + dentro + '</span>';
}

/* la "scritta sulla maglietta" si DISEGNA: tre righe di paroline. Un
   simbolo tipografico qualunque non diceva niente. */
function scrittaFinta(c2) {
  const riga = (w) => '<i style="display:block;height:3px;width:' + w +
    'px;border-radius:2px;background:' + c2 + '"></i>';
  return '<span style="display:flex;flex-direction:column;gap:2.5px;align-items:center">' +
    riga(20) + riga(14) + riga(17) + '</span>';
}

/* Porta a vista un riquadro dentro il vano che scorre, scorrendo del
   MINIMO indispensabile: solo quanto basta a fargli arrivare il fondo
   a filo. `scrollIntoView` invece lo incollerebbe al bordo alto,
   buttando fuori tutto il resto -- ed e' il motivo per cui era stato
   tolto dalle schede. */
/* DA CHE PARTE C'E' DELL'ALTRO.
   La sfumatura non e' un vezzo: e' l'unica cosa che distingue "il
   riquadro finisce qui" da "il riquadro e' tagliato dal bordo". Quindi
   va accesa dalla parte in cui c'e' davvero altro -- sopra, sotto o
   tutt'e due -- e spenta quando si e' arrivati in fondo, se no dice
   una bugia proprio sull'ultima riga. */
function sfuma(su) {
  if (!su) return;
  const fuori = su.scrollHeight - su.clientHeight;
  /* niente classe "scorre": non vestiva piu' niente da quando la
     sfumatura sa anche da che PARTE c'e' dell'altro */
  su.classList.toggle('dasu', fuori > 2 && su.scrollTop > 2);
  su.classList.toggle('dagiu', fuori > 2 && su.scrollTop < fuori - 2);
}

function portaAVista(chi) {
  const su = chi.closest('.pc-scala');
  if (!su) return;
  requestAnimationFrame(() => {
    const r = chi.getBoundingClientRect(), v = su.getBoundingClientRect();
    /* ventidue pixel in piu' del necessario: e' l'altezza della
       sfumatura in fondo, e senza quelli l'ultima riga del riquadro
       arriverebbe a filo del bordo, cioe' proprio dentro la sfumatura,
       e si leggerebbe smorta. Se non ce ne sono, si arriva in fondo e
       la sfumatura si spegne da sola. */
    const sotto = Math.round(r.bottom - v.bottom);
    if (sotto > 1) su.scrollTop += sotto + 22;
    sfuma(su);
  });
}

/* CHI ACCOMPAGNA
   I ruoli stanno tutti su una riga, con l'icona sopra e il nome sotto:
   si trovano a colpo d'occhio. Toccarne uno lo aggiunge e apre subito
   l'armadio; toccarlo ancora lo richiude. Uno per ruolo: due "Mamma"
   nello stesso gruppo non servono a riconoscere nessuno. */
function syncPeople(container, people, onChange) {
  if (container.__lista !== people) {
    container.__lista = people;
    container.dataset.sig = '';
    container.dataset.tav = '';
    /* Cambia il gruppo di cui ci si occupa: se un riferimento c'e'
       GIA' l'armadio si apre da solo. E' stato scelto in
       registrazione, e richiedere un tocco in piu' per rivederlo
       voleva dire far ricominciare da capo chi voleva solo
       controllare o correggere un dettaglio. */
    container.dataset.apri = people.length ? people[0].id : '';
  }
  /* chi non c'e' piu' non puo' restare aperto */
  if (container.dataset.apri && !people.some(p => p.id === container.dataset.apri)) {
    container.dataset.apri = '';
    container.dataset.tav = '';
  }
  const sig = people.map(p => p.id + '|' + p.role + '|' + (p.name || '') + '|' + (p.note || '') +
    '|' + JSON.stringify(p.avatar)).join('\u00a7') + '>' + (container.dataset.apri || '') +
    '>' + (container.dataset.tav || '');
  if (container.dataset.sig === sig) return;
  container.dataset.sig = sig;

  people.forEach(p => { p.avatar = AV.normalize(p.avatar, p.role); });
  const chi = people.find(p => p.id === container.dataset.apri) || null;

  const uno = people[0] || null;
  const ruoli = '<div class="ruoli">' + AV.ROLES.map(r => {
    const suo = uno && uno.role === r.key;
    const cls = !suo ? '' : (chi ? ' class="on"' : ' class="messo"');
    return '<button data-ruolo="' + r.key + '"' + cls + '>' +
      '<span class="em">' + r.em + '</span><span class="nm">' + esc(r.label) + '</span></button>';
  }).join('') + '</div>';

  container.innerHTML = ruoli + armadioDi(chi, chi ? (container.dataset.tav || '') : '');
  /* aprire o chiudere l'armadio cambia l'altezza di trecento pixel in
     un colpo: il pannello va rimisurato subito, se no il conto in fondo
     esce dallo schermo */
  if (typeof adattaTutto === 'function' && PAN.root && PAN.root.contains(container)) adattaTutto();
  /* IL GUARDAROBA SI PORTA A VISTA DA SOLO.
     E' alto quattrocento pixel e sta in fondo alla linguetta: aperto da
     dentro la scheda che vola non ci sta tutto, e restava mezzo sotto
     il bordo -- toccavi un ruolo e dovevi scendere a mano per vedere i
     vestiti. Si scorre del MINIMO che serve, cioe' quanto basta a
     portargli il fondo a filo del vano: cosi' quello che c'e' sopra
     resta dov'e' e si rivede risalendo, invece di sparire.
     Le due card, la fascia del tempo e il conto restano quelli di
     "+ Nuovo": la schermata e' una sola, non ce n'e' una per vestire. */
  if (chi) portaAVista(container);
  if (container.dataset.tav) {
    const tav = container.querySelector('.volante');
    /* LA TAVOLOZZA SI METTE SOPRA IL SUO TASTO.
       Stava incollata al bordo sinistro della fila: toccando "Scarpe",
       che e' l'ultimo a destra, i colori comparivano a mezzo metro di
       distanza e sembravano quelli di un altro pulsante. Adesso si
       centra sul tasto che l'ha aperta, e si ferma ai bordi della fila
       invece di sbordare. */
    const bott = container.querySelector('[data-acc="' + container.dataset.tav + '"]');
    if (tav && bott) {
      const zona = tav.offsetParent || tav.parentNode;
      const largo = tav.offsetWidth || 0;
      const centro = bott.offsetLeft + bott.offsetWidth / 2;
      const x = Math.max(0, Math.min(centro - largo / 2, zona.clientWidth - largo));
      tav.style.left = Math.round(x) + 'px';
      /* LA PUNTA INDICA IL TASTO. Capelli e Scarpe sono gli ultimi due
         della fila: la tavolozza e' larga trecento pixel e centrata
         sopra di loro sborderebbe, quindi si ferma al bordo e da sola
         sembrerebbe di qualcun altro. La punta sotto sta sempre sopra
         il tasto che l'ha aperta, dovunque la scatola abbia potuto
         mettersi. */
      tav.style.setProperty('--punta', Math.round(centro - x) + 'px');
    }
    /* e va PORTATA A VISTA: si apre sopra la fila, e se in quel momento
       il vano e' scorso in basso resterebbe fuori dallo schermo --
       toccare "Scarpe" e non veder comparire niente e' peggio che non
       avere il tasto. */
    if (tav && tav.scrollIntoView) tav.scrollIntoView({ block: 'nearest' });
  }

  /* il tasto per togliere sta in testa al blocco: toglie chi stai
     vestendo, o tutti se non ne stai vestendo nessuno */
  /* il tasto sta DENTRO il pannello, non nella pagina: cercarlo per id
     era un residuo del vecchio "+ Nuovo", e da allora non compariva
     piu' -- quindi una persona messa non si poteva piu' togliere */
  const via = container.closest('.pan-conto') &&
    container.closest('.pan-conto').querySelector('.pc-butta');
  if (via) {
    via.classList.toggle('hidden', !uno);
    via.innerHTML = '\ud83d\uddd1\ufe0f ' + (uno ? 'Togli ' + esc(roleOf(uno.role).label) : 'Togli');
  }

  /* I comandi si agganciano UNA volta sola, quindi non possono tenersi
     stretto ne' l'elenco ne' chi e' aperto: li ripescano dal contenitore
     a ogni tocco. Con l'elenco congelato nella chiusura, aprire un altro
     ingresso in modifica faceva finire la persona nel gruppo sbagliato,
     e il tasto gia' aperto non si richiudeva piu'. */
  container.__cambia = onChange;
  if (container.dataset.agganciato !== 'si') {
    container.dataset.agganciato = 'si';
    const elenco = () => container.__lista || [];
    const avvisa = () => { if (container.__cambia) container.__cambia(); };
    container.addEventListener('input', (ev) => {
      const t = ev.target;
      const people = elenco();
      const p = people.find(x => x.id === container.dataset.apri);
      if (!p) return;
      if (!t.dataset.campo) return;
      p[t.dataset.campo] = t.value;
      /* la firma si aggiorna a mano: ridisegnare mentre scrive gli
         porterebbe via il cursore da sotto le dita */
      container.dataset.sig = people.map(q => q.id + '|' + q.role + '|' + (q.name || '') + '|' +
        (q.note || '') + '|' + JSON.stringify(q.avatar)).join('\u00a7') + '>' + (container.dataset.apri || '') +
        '>' + (container.dataset.tav || '');
      avvisa();
    });
    container.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b || !container.contains(b)) return;
      const d = b.dataset;
      const people = elenco();
      const p = people.find(x => x.id === container.dataset.apri);
      /* LA RUOTA. Prima era il selettore del sistema, quello con
         saturazione, luminosita' e i valori esadecimali: al banco e'
         una schermata da tecnico per una domanda da bambino ("di che
         colore era la maglietta?"). Adesso e' un cerchio: si gira il
         dito e si prende il colore, punto. */
      if (d.ruota !== undefined) {
        apriRuota(b, p && p.avatar && p.avatar[d.ruota] ? p.avatar[d.ruota].color : '#8A8AA0', (colore) => {
          const q = elenco().find(x => x.id === container.dataset.apri);
          if (!q) return;
          q.avatar[d.ruota].color = colore;
          segna(q, d.ruota === 'top' ? 'maglietta' : 'pantaloni');
          container.dataset.sig = '';
          avvisa();
          syncPeople(container, elenco(), container.__cambia);
        });
        return;
      }
      if (d.accruota !== undefined) {
        apriRuota(b, p && p.avatar && ACC_DOVE[d.accruota] ? ACC_DOVE[d.accruota](p.avatar) : null, (colore) => {
          const q = elenco().find(x => x.id === container.dataset.apri);
          if (!q) return;
          accMetti(q.avatar, d.accruota, colore);
          segna(q, d.accruota);
          container.dataset.sig = '';
          avvisa();
          syncPeople(container, elenco(), container.__cambia);
        });
        return;
      }
      if (d.ruolo !== undefined) {
        /* IL RIFERIMENTO E' UNO SOLO. Serve a riconoscere il gruppo
           all'uscita, e otto figurine non aiutano a riconoscere
           nessuno. Toccare un altro ruolo non aggiunge una persona:
           cambia quella che c'e'. */
        const gia = people[0];
        if (!gia) {
          /* chi arriva parte NEUTRO: caratteristiche del ruolo, tinte da
             cambiare al volo, niente ancora "scelto" */
          const nato = AV.baseFor(d.ruolo);
          nato.scelti = {};
          const nuovo = { id: uid(), role: d.ruolo, name: '', avatar: nato, note: '', tocco: false };
          people.length = 0;
          people.push(nuovo);
          container.dataset.apri = nuovo.id;
        } else if (gia.role === d.ruolo) {
          /* lo stesso ruolo: apre e chiude l'armadio */
          container.dataset.apri = (container.dataset.apri === gia.id) ? '' : gia.id;
        } else {
          gia.role = d.ruolo;
          const nuovo = AV.baseFor(d.ruolo);
          if (!gia.tocco) {
            /* vestito mai toccato: riparte tutto da quello di serie del
               ruolo nuovo -- e' quello che ci si aspetta passando da
               Mamma a Papa' */
            gia.avatar = nuovo;
            gia.avatar.scelti = {};
          } else {
            /* LA TESTA SEGUE SEMPRE IL RUOLO: capelli, barba e occhiali
               sono l'archetipo, non un vestito, e non si scelgono da
               nessuna parte. I VESTITI invece restano, perche' quelli li
               hai messi tu e sono la parte che costa fatica. */
            gia.avatar = AV.normalize(gia.avatar, d.ruolo);
            gia.avatar.hair = { style: nuovo.hair.style, color: nuovo.hair.color };
            gia.avatar.facial = nuovo.facial;
            gia.avatar.glasses = nuovo.glasses;
          }
          container.dataset.apri = gia.id;
        }
      } else if (p && d.top !== undefined)   { p.avatar.top.style = d.top; segna(p, 'maglietta'); container.dataset.tav = ''; }
      else if (p && d.pat !== undefined)     { p.avatar.top.pattern = d.pat; segna(p, 'maglietta'); container.dataset.tav = ''; }
      else if (p && d.pants !== undefined)   { p.avatar.pants.style = d.pants; segna(p, 'pantaloni'); container.dataset.tav = ''; }
      else if (p && d.col !== undefined) {
        const parti = d.col.split('|');
        p.avatar[parti[0]][parti[1]] = parti[2];
        segna(p, parti[0] === 'top' ? 'maglietta' : 'pantaloni');
        container.dataset.tav = '';
      } else if (p && d.acc !== undefined) {
        /* l'accessorio non si sceglie per forma ma per COLORE: toccarlo
           apre la tavolozza, toccarlo ancora la richiude */
        container.dataset.tav = (container.dataset.tav === d.acc) ? '' : d.acc;
      } else if (p && d.acccol !== undefined) {
        const parti = d.acccol.split('|');
        accMetti(p.avatar, parti[0], parti[1]);
        segna(p, parti[0]);
        container.dataset.tav = '';
      } else if (p && d.accvia !== undefined) {
        accTogli(p.avatar, d.accvia, p.role);
        p.tocco = true;
        if (p.avatar.scelti) delete p.avatar.scelti[d.accvia];
        container.dataset.tav = '';
      } else return;
      container.dataset.sig = '';
      avvisa();
      syncPeople(container, people, container.__cambia);
    });
  }
}

/* Chi ha toccato la figura sta cercando "Chi accompagna", che pero'
   sta in fondo alla linguetta Parco, sotto altre tre fasce: senza un
   segnale si arriva li' e non si capisce dove guardare. Il riquadro si
   accende per tre secondi, con lo stesso battito delle schede in
   ritardo -- un linguaggio che nell'app c'e' gia'. */
function accendiPersone() {
  setTimeout(() => {
    const sez = PAN.root && PAN.root.querySelector('.sec-people');
    if (!sez) return;
    sez.classList.remove('evidenzia');
    void sez.offsetWidth;
    sez.classList.add('evidenzia');
    /* NIENTE SALTO. Portare la fascia a vista con uno scorrimento
       lasciava la fila delle card tagliata a meta' e le linguette fuori
       dallo schermo: sembrava rotto. Il battito basta a dire dov'e', e
       quando il pannello ci sta tutto -- che e' il caso sulla tavoletta
       -- non c'era niente da portare a vista. */
    setTimeout(() => sez.classList.remove('evidenzia'), 3000);
  }, 60);
}

/* SEGNARE QUELLO CHE SI E' SCELTO A MANO.
   La descrizione scritta sulla scheda ("Camicia rossa a righe · Jeans
   blu") dice solo i pezzi che qualcuno ha davvero toccato: il resto e'
   il vestito di serie del ruolo, non una cosa vista addosso alla
   persona, e metterlo li' vorrebbe dire far cercare all'uscita un
   dettaglio che nessuno ha guardato.
   L'armadio nuovo non lo segnava, e la descrizione era sparita dalle
   schede. */
function segna(p, parte) {
  p.tocco = true;
  p.avatar.scelti = p.avatar.scelti || {};
  p.avatar.scelti[parte] = true;
}

/* L'ARMADIO: figura grande a sinistra, scelte a destra.
   L'ordine e' quello con cui si veste davvero qualcuno: prima il
   sopra, poi la sua fantasia, poi il suo colore; poi il sotto e il
   suo colore. Ogni tinta sta ATTACCATA al gruppo a cui serve.
   I quattro accessori — capelli, cappello, scarpe, zaino — stanno in
   coda al sotto e non in un capitolo loro: sono roba che sta sotto o
   attorno alla persona, e cercarli altrove costava un giro in piu'. */

/* dove sta scritto, dentro l'avatar, il colore di ogni accessorio */
/* Capelli e scarpe, e basta. Cappello e zaino se ne sono andati:
   quasi nessuno li ha, e occupavano due posti in una fila dove ogni
   posto e' larghezza tolta ai capi. Chi ne ha bisogno li mette
   dall'editor completo. */
const ACC_DOVE = {
  capelli: (av) => av.hair.color,
  scarpe: (av) => av.shoes.color
};
const ACC_NOME = { capelli: 'Capelli', scarpe: 'Scarpe' };
function accMetti(av, acc, colore) {
  if (acc === 'capelli') av.hair.color = colore;
  else if (acc === 'scarpe') av.shoes = { style: 'sneakers', color: colore };
}
function accTogli(av, acc, ruolo) {
  if (acc === 'capelli') av.hair.color = AV.baseFor(ruolo).hair.color;
  else if (acc === 'scarpe') av.shoes = { style: 'sneakers', color: '#F4F6F8' };
}

function armadioDi(p, tavolozzaAperta) {
  /* NIENTE INVITO, e il riquadro resta basso.
     Questa schermata serve anche solo per il bar o per il solo Crazy:
     non e' detto che ci siano bambini da registrare, e una spiegazione
     lunga su chi mettere, sempre a video, e' rumore le volte in cui non
     serve. La riga dei ruoli sopra dice gia' cosa si puo' fare. */
  if (!p) return '';
  const av = p.avatar;
  /* solo il vestito LUNGO copre le gambe fino ai piedi: sotto quello
     un pantalone non si vedrebbe. Il vestito normale i sotto li lascia
     scegliere — una gonna sopra i leggings si vede eccome. */
  const lungo = av.top.style === 'vestitolungo';
  /* un colore solo: quello della fantasia se lo ricava da se',
     schiarendo o scurendo il capo. Sceglierlo era una domanda in piu'
     al banco per una cosa che si decide da sola. */
  const c1 = av.top.color, c2 = AV.coloreFantasia(c1);
  const colonne = (n) => 'grid-template-columns:repeat(' + n + ',1fr)';

  /* le tinte: quindici in ordine di colore piu' la ruota, che e' il
     sedicesimo posto per quella che in fila non c'e' */
  const tinte = (campo) => '<div class="tinte" style="' + colonne(AV.COLORS.length + 1) + '">' +
    AV.COLORS.map(c => '<button data-col="' + campo + '|color|' + c.c + '" style="background:' + c.c +
      '" title="' + esc(c.n[0]) + '"' +
      (av[campo].color.toLowerCase() === c.c.toLowerCase() ? ' class="on"' : '') + '></button>').join('') +
    '<button class="ruota" data-ruota="' + campo + '" title="scegli tu"></button></div>';

  const capiSopra = '<div class="capi" style="' + colonne(AV.TOP.length) + '">' +
    AV.TOP.map(t => '<button class="capo' + (av.top.style === t.key ? ' on' : '') +
      '" data-top="' + t.key + '">' + CAPI.capo(t.key, c1, av.top.pattern, 46) +
      '<span class="nm">' + esc(t.label) + '</span></button>').join('') + '</div>';

  const fantasie = '<div class="fant" style="' + colonne(AV.PATTERNS.length) + '">' +
    AV.PATTERNS.map(f => '<button class="' + (av.top.pattern === f.key ? 'on' : '') +
      '" data-pat="' + f.key + '" title="' + esc(f.n) + '">' +
      pezzaFantasia(f.key, c1, c2) + '</button>').join('') + '</div>';

  /* ACCESI SOLO SE LI HAI SCELTI TU. Capelli e scarpe ce li hanno
     tutti, quindi partivano sempre accesi: due pastiglie bianche che
     dicevano "selezionato" senza che nessuno avesse selezionato
     niente, e l'occhio ci tornava sopra ogni volta per capire perche'. */
  const accessori = Object.keys(ACC_DOVE).map(k => {
    const c = ACC_DOVE[k](av);
    const mio = !!(av.scelti && av.scelti[k]);
    return '<button class="capo acc-b' + (mio ? ' on' : '') + '" data-acc="' + k + '">' +
      CAPI.accessorio(k, c || '#8A8AA0', 44) +
      '<span class="nm">' + ACC_NOME[k] + '</span></button>';
  }).join('');
  const capiSotto = '<div class="sottoblocco' + (lungo ? ' spento-capi' : '') + '">' +
    /* le colonne sono i capi PIU' GLI ACCESSORI CHE CI SONO DAVVERO.
       Erano scritte "+ 4" da quando gli accessori erano quattro: tolti
       cappello e zaino, la fila teneva dodici colonne per dieci
       pulsanti -- due posti vuoti in fondo, e tutti i pulsanti del
       sotto piu' stretti di quelli del sopra senza motivo. */
    '<div class="capi" style="' + colonne(AV.PANTS.length + Object.keys(ACC_DOVE).length) + '">' +
    AV.PANTS.map(t => '<button class="capo' + (av.pants.style === t.key ? ' on' : '') +
      '" data-pants="' + t.key + '">' + CAPI.capo(t.key, av.pants.color, av.pants.pattern, 44) +
      '<span class="nm">' + esc(t.label) + '</span></button>').join('') + accessori + '</div>' +
    (tavolozzaAperta ? tavolozza(av, tavolozzaAperta) : '') + '</div>';

  return '<div class="armadio">' +
    /* inquadratura "figura": la persona intera ma senza i fianchi
       vuoti, che erano quattordici pixel per parte di aria buona solo
       a rubare larghezza ai capi qui accanto */
    '<div class="figura">' + AV.build(av, { zona: 'figura' }) +
      '<input class="libero chi" placeholder="' + esc(roleOf(p.role).label) + '" value="' +
        esc(p.name || '') + '" data-campo="name"></div>' +
    '<div class="roba">' +
      '<span class="et">Sopra</span>' + capiSopra +
      '<span class="et">Fantasia</span>' + fantasie +
      /* niente etichetta "Colore del sopra": una fila di pastiglie
         colorate attaccata sotto i capi non puo' essere altro, e due
         righe di scritta sono venti pixel che al guardaroba servono
         per starci dentro tutto */
      tinte('top') +
      '<span class="et">Sotto' + (lungo ? '<span class="spento-k">col vestito lungo non serve</span>' : '') +
        '</span>' + capiSotto +
      tinte('pants') +
    '</div>' +
    /* la riga libera passa SOTTO a tutta larghezza: al banco e' quella
       che si usa di corsa, e va vista prima di tutte */
    '<div class="largo">' +
      '<input class="libero grosso" data-campo="note" value="' + esc(p.note || '') + '" ' +
      'placeholder="Qualcosa che salta all\u2019occhio: \u00abzaino giallo\u00bb, \u00abgamba ingessata\u00bb\u2026"></div>' +
    '</div>';
}

/* la tavolozza di un accessorio: le stesse quindici tinte, la ruota, e
   il tasto per toglierlo */
function tavolozza(av, acc) {
  const ora = ACC_DOVE[acc](av);
  return '<div class="volante">' +
    AV.COLORS.map(c => '<button data-acccol="' + acc + '|' + c.c + '" style="background:' + c.c + '"' +
      (ora && ora.toLowerCase() === c.c.toLowerCase() ? ' class="on"' : '') + '></button>').join('') +
    '<button class="ruota" data-accruota="' + acc + '" title="scegli tu"></button>' +
    '<button class="via" data-accvia="' + acc + '">togli</button></div>';
}

/* ---------- cloud: accensione, arrivi da fuori, schermata d'accesso ---------- */
const SOLO_QUI = 'gp_solo_qui';   // "uso questo tablet e basta", scelto a mano

function avviaCloud() {
  if (typeof CLOUD === 'undefined' || !CLOUD.configurato()) { mostraGate(); return; }

  CLOUD.suStato(st => {
    mostraGate();
    aggiornaCartaCloud();
    if (st.stato === 'dentro') {
      // quello che il tablet ha fatto da solo finora sale in cloud
      inviati.clear(); inviatiMeta.clear();
      spingiIngressi();
      spingiMeta('impostazioni', settings);
      spingiMeta('presets', presets);
    }
  });

  CLOUD.suDati(p => {
    if (p.tipo === 'ingressi') return arrivanoIngressi(p.cambi);
    if (p.tipo === 'impostazioni') return arrivanoImpostazioni(p.dato);
    if (p.tipo === 'presets') return arrivanoPresets(p.dato);
  });

  CLOUD.avvia();
}

/* Ingressi cambiati da un altro banco. Vince la versione più recente:
   il tempo che scorre lo vede uguale chiunque, quindi l'unico conflitto
   vero è "due casse hanno toccato lo stesso gruppo": lì conta l'ultimo. */
function arrivanoIngressi(cambi) {
  let cambiato = false;
  cambi.forEach(c => {
    const i = entries.findIndex(x => x.id === c.id);
    if (c.tipo === 'via') {
      if (i > -1) { entries.splice(i, 1); cambiato = true; }
      inviati.delete(c.id);
      return;
    }
    const remoto = normalizeEntries([c.dato])[0];
    if (i < 0) { entries.push(remoto); cambiato = true; }
    else if (num(c.dato.agg, 0) > num(entries[i].agg, 0) && firma(c.dato) !== firma(entries[i])) {
      entries[i] = remoto; cambiato = true;
    }
    // segno com'è adesso: così non lo rimando su a specchio
    const mio = entries.find(x => x.id === c.id);
    if (mio) inviati.set(c.id, firma(mio));
  });
  if (!cambiato) return;
  save(SK.entries, entries);
  if (tab === 'active') buildActiveView();
  updateBadge();
}
function arrivanoImpostazioni(doc) {
  const d = doc && doc.dati;
  if (!d || firma(d) === firma(settings)) return;
  const temaMio = settings.theme;          // il tema è di questo tablet
  settings = Object.assign(defaultSettings(), d, { theme: temaMio });
  inviatiMeta.set('impostazioni', firma(settings));
  save(SK.settings, settings);
  if (tab === 'settings') buildSettingsView();
  if (tab === 'active') buildActiveView();
  markNewDirty();
}
function arrivanoPresets(doc) {
  const d = doc && doc.dati;
  if (!Array.isArray(d) || firma(d) === firma(presets)) return;
  presets = d.map(p => (p.avatar = AV.normalize(p.avatar, p.role), p));
  inviatiMeta.set('presets', firma(presets));
  save(SK.presets, presets);
  if (tab === 'settings') buildSettingsView();
}

/* La schermata d'accesso. Non è un muro: se la linea manca o si sceglie
   "uso solo questo tablet" si lavora lo stesso, perché una cassa che si
   blocca per colpa del wifi è peggio di una cassa senza cloud. */
function mostraGate() {
  const g = $('#gate');
  if (!g) return;
  const st = typeof CLOUD !== 'undefined' ? CLOUD.stato() : { stato: 'spento', configurato: false };
  const serve = st.configurato && st.stato === 'fuori' && !load(SOLO_QUI);
  g.classList.toggle('hidden', !serve);
  if (!serve) { g.innerHTML = ''; g.dataset.sig = ''; return; }
  // la firma tiene conto della rete: se cade o torna, l'avviso si aggiorna
  const sig = 'gate|' + (navigator.onLine ? 'rete' : 'senza');
  if (g.dataset.sig === sig) return;
  g.dataset.sig = sig;

  g.innerHTML = '';
  const box = el('div', 'gate-box');
  box.appendChild(el('div', 'gate-em', '🎡'));
  box.appendChild(el('h1', null, 'Gestione Parco'));
  box.appendChild(el('div', 'gate-sub', 'Entra per lavorare sul registro del parco: quello che registri lo vedono subito anche gli altri banchi.'));

  const err = el('div', 'gate-err hidden');
  const campo = (etichetta, tipo, auto) => {
    const f = el('div', 'field');
    f.appendChild(el('label', null, etichetta));
    const i = el('input');
    i.type = tipo;
    i.autocomplete = auto;
    f.appendChild(i);
    box.appendChild(f);
    return i;
  };
  const mail = campo('Email', 'email', 'username');
  const pw = campo('Password', 'password', 'current-password');
  box.appendChild(err);

  const dai = (msg) => { err.textContent = msg; err.classList.remove('hidden'); };
  const occupato = (b, si) => { b.disabled = si; b.classList.toggle('attesa', si); };

  const entra = el('button', 'btn btn-primary btn-block', 'Entra');
  entra.onclick = () => {
    err.classList.add('hidden');
    occupato(entra, true);
    CLOUD.entra(mail.value, pw.value)
      .catch(e => dai(e.message))
      .then(() => occupato(entra, false));
  };
  box.appendChild(entra);

  const nuovo = el('button', 'btn btn-sm btn-block', '➕ Crea un accesso nuovo');
  nuovo.style.marginTop = '10px';
  nuovo.onclick = () => {
    err.classList.add('hidden');
    occupato(nuovo, true);
    CLOUD.registra(mail.value, pw.value)
      .catch(e => dai(e.message))
      .then(() => occupato(nuovo, false));
  };
  box.appendChild(nuovo);

  const solo = el('button', 'btn-link', 'Oggi lavoro solo su questo tablet');
  solo.onclick = () => {
    save(SOLO_QUI, true);
    mostraGate();
    toast('Solo su questo tablet: niente cloud 📴');
  };
  box.appendChild(solo);

  if (!navigator.onLine) {
    box.appendChild(el('div', 'gate-nota', '⚠️ Nessuna rete: per entrare la prima volta serve la linea. Puoi lavorare su questo tablet e collegarti dopo.'));
  }
  g.appendChild(box);
}

/* La carta "Cloud" nelle impostazioni: dice sempre a che punto siamo,
   perché sapere se i dati sono al sicuro non deve richiedere fede. */
function aggiornaCartaCloud() {
  const box = $('#sCloud');
  if (!box) return;
  const st = typeof CLOUD !== 'undefined' ? CLOUD.stato() : { stato: 'spento', configurato: false, online: navigator.onLine };
  box.innerHTML = '';

  const riga = (cls, testo) => box.appendChild(el('div', cls, testo));
  const stato = el('div', 'cloud-stato');
  const pallino = el('span', 'cs-dot');
  const testo = el('span', 'cs-txt');
  stato.appendChild(pallino);
  stato.appendChild(testo);
  box.appendChild(stato);

  if (!st.configurato) {
    pallino.classList.add('spento');
    testo.innerHTML = '<b>Cloud spento</b> — i dati stanno solo su questo tablet.';
    riga('hint', 'Per accenderlo serve un progetto Firebase (gratis, 5 minuti): le istruzioni sono nel file GUIDA-CLOUD.md, poi si incollano i dati in js/firebase-config.js.');
    return;
  }
  if (st.stato === 'attesa') {
    pallino.classList.add('attesa');
    testo.innerHTML = '<b>Mi sto collegando…</b>';
    return;
  }
  if (st.stato === 'errore') {
    pallino.classList.add('rotto');
    testo.innerHTML = '<b>Cloud non raggiungibile</b>';
    riga('hint', st.motivo || '');
    return;
  }
  if (st.stato !== 'dentro') {
    pallino.classList.add('spento');
    testo.innerHTML = '<b>Non hai fatto l’accesso</b> — si lavora solo su questo tablet.';
    const b = el('button', 'btn btn-sm btn-block', '🔑 Entra con utente e password');
    b.style.marginTop = '10px';
    b.onclick = () => { localStorage.removeItem(SOLO_QUI); mostraGate(); };
    box.appendChild(b);
    return;
  }

  pallino.classList.add(st.online ? 'ok' : 'attesa');
  testo.innerHTML = '<b>' + esc(st.email) + '</b> — ' +
    (st.online ? 'registro condiviso, salvataggio in corso' : 'senza rete: salvo qui e mando su appena torna la linea');
  riga('hint', 'Gli ingressi che registri li vedono subito anche gli altri banchi collegati.');

  const su = el('button', 'btn btn-sm btn-block', '⬆️ Manda in cloud tutto quello che c’è qui');
  su.style.marginTop = '10px';
  su.onclick = () => {
    su.disabled = true;
    CLOUD.primaSalita(entries, settings, presets).then(n => {
      su.disabled = false;
      toast('Mandati ' + n + ' ingressi in cloud ☁️');
    });
  };
  box.appendChild(su);

  const fuori = el('button', 'btn btn-sm btn-block', '🚪 Esci dall’accesso');
  fuori.style.marginTop = '8px';
  fuori.onclick = () => {
    confirmSheet('Esci dall’accesso?', 'Gli ingressi restano su questo tablet e in cloud. Per rientrare servono di nuovo email e password.', () => {
      localStorage.removeItem(SOLO_QUI);
      CLOUD.esci().then(() => { toast('Uscito 🚪'); aggiornaCartaCloud(); });
    });
  };
  box.appendChild(fuori);
}

/* ---------- backup automatico su file ----------
   Il backup non deve dipendere dal fatto che uno se lo ricordi: una volta
   al giorno, alla prima apertura, il file si scarica da solo nella cartella
   Download del tablet. Si può spegnere dalle impostazioni. */
function nomeBackup(d) {
  const p = n => String(n).padStart(2, '0');
  return 'parco-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.json';
}
function contenutoBackup() {
  return JSON.stringify({
    app: 'gestioparco', versione: 1, quando: new Date().toISOString(),
    settings: settings, entries: entries, presets: presets
  }, null, 2);
}
function scaricaFile(nome, testo) {
  const b = new Blob([testo], { type: 'application/json' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
function backupAutomatico() {
  if (settings.backupAuto === false) return;
  const oggi = nomeBackup(new Date());
  if (load('gp_ultimo_backup') === oggi) return;   // già fatto oggi
  if (!entries.length) return;                     // niente da salvare
  save('gp_ultimo_backup', oggi);
  try {
    scaricaFile(oggi, contenutoBackup());
    toast('Backup del giorno salvato 💾');
  } catch (e) { console.warn('backup automatico', e); }
}

/* Avviso in cima: i dati non sono ancora al riparo. Sparisce da solo appena
   lo spazio è protetto (installando l'app succede da sé), oppure quando lo
   si mette a tacere. Non è un pannello e non ruba spazio alle schede. */
const AVVISO_VISTO = 'gp_avviso_dati';
function mostraAvvisoDati() {
  const box = $('#avvisoDati');
  if (!box) return;
  if (typeof DATI === 'undefined' || !DATI.disponibile() || load(AVVISO_VISTO)) {
    box.classList.add('hidden');
    return;
  }
  DATI.spazio().then(s => {
    if (s.protetto) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    if (box.dataset.fatto === '1') { box.classList.remove('hidden'); return; }
    box.dataset.fatto = '1';
    box.innerHTML = '';
    box.className = 'avviso-dati';
    box.appendChild(el('span', 'em', '🔒'));
    const t = el('div', 'ad-txt');
    t.innerHTML = '<b>Metti i dati al riparo</b><span>Così il browser non potrà cancellarli per fare spazio.</span>';
    box.appendChild(t);
    const si = el('button', 'btn btn-sm', 'Proteggi');
    si.onclick = () => {
      si.disabled = true;
      DATI.proteggi().then(ok => {
        si.disabled = false;
        if (ok) {
          box.classList.add('hidden');
          toast('Dati protetti 🔒');
        } else {
          t.innerHTML = '<b>Il browser non l’ha concesso</b><span>Installa l’app dalla schermata Home del tablet: da lì viene dato da solo.</span>';
          si.classList.add('hidden');
        }
        aggiornaCartaSicurezza();
      });
    };
    box.appendChild(si);
    const no = el('button', 'mini-b', '✕');
    no.title = 'Non mostrare più';
    no.onclick = () => { save(AVVISO_VISTO, true); box.classList.add('hidden'); };
    box.appendChild(no);
  });
}

/* Quanto sono al sicuro i dati, detto chiaro: nessuna promessa vaga. */
function aggiornaCartaSicurezza() {
  const box = $('#sSicuro');
  if (!box) return;
  box.innerHTML = '';
  if (typeof DATI === 'undefined' || !DATI.disponibile()) {
    box.appendChild(el('div', 'hint', 'Questo browser non offre l’archivio sicuro: usa spesso il backup su file.'));
    return;
  }

  const stato = el('div', 'cloud-stato');
  const pallino = el('span', 'cs-dot attesa');
  const testo = el('span', 'cs-txt', 'controllo…');
  stato.appendChild(pallino); stato.appendChild(testo);
  box.appendChild(stato);

  const dettaglio = el('div', 'hint');
  box.appendChild(dettaglio);

  const proteggi = el('button', 'btn btn-sm btn-block hidden', '🔒 Proteggi i dati di questa app');
  proteggi.style.marginTop = '10px';
  proteggi.onclick = () => DATI.proteggi().then(() => aggiornaCartaSicurezza());
  box.appendChild(proteggi);

  DATI.spazio().then(s => {
    const mb = (n) => (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
    if (s.protetto) {
      pallino.className = 'cs-dot ok';
      testo.innerHTML = '<b>Dati protetti</b> — il browser non può buttarli via da solo.';
    } else {
      pallino.className = 'cs-dot attesa';
      testo.innerHTML = '<b>Dati non ancora protetti</b> — installa l’app dalla schermata Home, oppure premi il tasto qui sotto.';
      proteggi.classList.remove('hidden');
    }
    dettaglio.textContent = 'Occupati ' + mb(s.usato) + (s.quota ? ' su ' + mb(s.quota) + ' disponibili' : '') +
      '. Ogni salvataggio va in due posti diversi su questo tablet.';
  });

  /* il backup automatico su file */
  const sw = el('button', 'switch-row');
  sw.style.marginTop = '12px';
  sw.setAttribute('role', 'switch');
  const ultimo = load('gp_ultimo_backup');
  sw.innerHTML = '<span class="sw-txt"><b>Backup automatico ogni giorno</b><span>' +
    'Alla prima apertura della giornata il file finisce da solo nei Download. ' +
    (ultimo ? 'Ultimo: <b>' + esc(ultimo) + '</b>' : 'Non ancora fatto.') +
    '</span></span><span class="switch"></span>';
  const dipingi = () => {
    const on = settings.backupAuto !== false;
    $('.switch', sw).classList.toggle('on', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  dipingi();
  sw.onclick = () => { settings.backupAuto = settings.backupAuto === false; saveSettings(); dipingi(); };
  box.appendChild(sw);

  const ora = el('button', 'btn btn-sm btn-block', '💾 Salva un backup adesso');
  ora.style.marginTop = '8px';
  ora.onclick = () => {
    scaricaFile(nomeBackup(new Date()), contenutoBackup());
    save('gp_ultimo_backup', nomeBackup(new Date()));
    toast('Backup salvato 💾');
  };
  box.appendChild(ora);

  /* le copie del giorno */
  const tit = el('div', 'sez-k', 'Copie dei giorni scorsi');
  tit.style.marginTop = '14px';
  box.appendChild(tit);
  const lista = el('div', 'copie-lista');
  box.appendChild(lista);

  DATI.elencoCopie().then(c => {
    lista.innerHTML = '';
    if (!c.length) {
      lista.appendChild(el('div', 'hint', 'Ancora nessuna: la prima si crea appena registri qualcosa.'));
      return;
    }
    c.forEach(x => {
      const r = el('div', 'copia-riga');
      const p = x.giorno.split('-');
      r.appendChild(el('span', 'copia-g', p[2] + '/' + p[1]));
      r.appendChild(el('span', 'copia-n', x.ingressi + (x.ingressi === 1 ? ' ingresso' : ' ingressi')));
      const b = el('button', 'btn btn-sm', 'Ripristina');
      b.onclick = () => confirmSheet(
        'Tornare alla copia del ' + p[2] + '/' + p[1] + '?',
        'Gli ingressi di adesso vengono sostituiti da quelli di quel giorno (' + x.ingressi + '). Prima di procedere ti conviene scaricare un backup.',
        () => ripristinaCopia(x.giorno));
      r.appendChild(b);
      lista.appendChild(r);
    });
  });
}
function ripristinaCopia(giorno) {
  DATI.copia(giorno).then(d => {
    if (!d) { toast('Copia non trovata'); return; }
    entries = normalizeEntries(d.gp_entries);
    if (d.gp_settings) settings = Object.assign(defaultSettings(), d.gp_settings);
    if (Array.isArray(d.gp_presets)) presets = d.gp_presets.map(p => (p.avatar = AV.normalize(p.avatar, p.role), p));
    saveEntries(); saveSettings(); savePresets();
    applyTheme();
    buildSettingsView();
    toast('Ripristinata la copia del ' + giorno.slice(8) + '/' + giorno.slice(5, 7) + ' ♻️');
  });
}

/* un colore della palette con la trasparenza che serve alle sfumature */
function conAlfa(hex, a) {
  let c = String(hex || '').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  if (!Number.isFinite(n) || c.length !== 6) return 'transparent';
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function traitChip(t) {
  const c = el('span', 'trait');
  if (t.color) {
    const sw = el('span', 'sw');
    sw.style.background = t.color;
    c.appendChild(sw);
  } else {
    c.appendChild(document.createTextNode(t.em + ' '));
  }
  c.appendChild(document.createTextNode(t.txt));
  return c;
}

/* aggiornamento mirato della vista "nuovo" */
/* l'icona della linguetta: il primo prodotto di quella categoria, cosi'
   "Birre" mostra una birra senza doverlo scrivere da nessuna parte */
function iconaCat(cat) {
  if (cat === 'Parco') return typeof ICONE !== 'undefined' && ICONE.bimbi ? ICONE.bimbi() : '';
  /* il bar e' uno solo adesso: il bicchiere basta e avanza */
  if (cat === 'Bar') return '<span class="em">🥤</span>';
  const v = lista(settings.barMenu).find(it => ((it.cat || 'Altro').trim() || 'Altro') === cat);
  return v ? iconaBar(v.name, v.em) : '';
}

/* ---------- IL CONTO ----------
   Icona, l'etichetta sopra la cifra e il tasto "paga" a destra: tre
   blocchi attaccati sopra la cifra grande. In "+ Nuovo" sta in fondo
   allo schermo; dentro la scheda che vola va IN ALTO, perche' li' e'
   la prima cosa che serve. */
function pcFondo() {
  const c = C(), due = dueOf(c);
  const tot = r2(due.park + due.bar), pag = r2(due.paidPark + due.paidBar), resta = due.total;
  const parte = (nome, ico, id, im, p) => {
    const fatto = im > 0 && p >= im - 0.005;
    return '<div class="bc-parte' + (fatto ? ' fatta' : '') + '">' + ICONE[ico]() +
      '<div class="bc-pk"><span class="k">' + nome + '</span>' +
      '<span class="v num">' + eur(im) + '</span>' +
      /* la riga del "pagato" c'e' SEMPRE, anche vuota: se comparisse solo
         quando serve, il blocco si alzerebbe e abbasserebbe sotto le dita
         a ogni tocco */
      '<span class="q' + (p > 0 && !fatto ? '' : ' vuota') + '">' +
        (p > 0 && !fatto ? 'pagato ' + eur(p) : ' ') + '</span></div>' +
      (im > 0
        ? (fatto
          ? '<button class="paga ok" data-desez="' + id + '">\u2713</button>'
          : '<button class="paga" data-sez="' + id + '">paga</button>')
        : '') + '</div>';
  };
  const orario = c.payLater
    ? fmtTime(c.startTime) + ' \u2192 aperta'
    : fmtTime(c.startTime) + ' \u2192 ' + fmtTime(endTimeOf(c));
  return '<div class="bc-fondo">' +
    '<div class="bc-parti">' +
      parte('Totale Parco', 'bimbi', 'bimbi', contoParco(), contoPagatoParco()) +
      parte('Totale Crazy', 'crazy', 'crazy', contoCrazy(), contoPagatoCrazy()) +
      parte('Totale Bar', 'coca', 'bar', contoBar(), contoPagatoBar()) +
    '</div>' +
    '<div class="bc-conto"><div>' +
      '<span class="k">' + (tot <= 0 ? 'niente sul conto' :
        resta > 0 ? (pag > 0 ? 'restano' : 'da incassare') : 'tutto pagato') +
        ' \u00b7 <b>' + orario + '</b></span>' +
      '<span class="v num' + (tocchi.id ? ' tocca' : '') + '">' +
        (tot <= 0 ? eur(0) : resta > 0 ? eur(resta) : '\u2713 ' + eur(tot)) + '</span>' +
      /* anche questa riga c'e' sempre, anche vuota: se no la cifra grande
         saltella su e giu' ogni volta che incassi qualcosa */
      /* l'avanzo si vede: se ha dato piu' del dovuto (o gli hai tolto
         roba dopo che aveva pagato) quei soldi vanno restituiti, e
         prima non lo diceva nessuno */
      '<span class="gia' + (due.avanzo > 0 || (pag > 0 && resta > 0) ? '' : ' vuota') +
        (due.avanzo > 0 ? ' rendi' : '') + '">' +
        (due.avanzo > 0 ? 'da restituire ' + eur(due.avanzo)
          : pag > 0 && resta > 0 ? 'gi\u00e0 presi ' + eur(pag) : ' ') + '</span>' +
    '</div><div class="bc-tasti">' +
      /* Svuota solo sul gruppo nuovo: su un ingresso gia' registrato
         vorrebbe dire cancellargli il conto sotto il naso. E chiede
         conferma, perche' rifarlo davanti al cliente e' una figuraccia. */
      (!PAN.ingresso && draft.touched
        ? '<button class="btn" data-svuota>\ud83e\uddf9 Svuota\u2026</button>'
        : '') +
      (resta > 0 ? '<button class="btn" data-resto>\ud83e\uddee Resto</button>' +
        '<button class="btn" data-tutto>Paga tutto</button>' : '') +
      '<button class="btn btn-ok" data-reg>' +
        (PAN.ingresso ? '\u2713 Fatto' : tot > 0 && resta <= 0 ? '\u2705 Registra e incassa' : 'Registra') +
      '</button>' +
    '</div></div></div>';
}

function pickRole(onPick) {
  const s = sheet('Chi accompagna?');
  const grid = el('div', 'preset-grid');
  AV.ROLES.forEach(r => {
    const b = el('button', 'preset');
    const av = el('div', 'pav');
    av.innerHTML = AV.build(AV.defaultFor(r.key));
    b.appendChild(av);
    b.appendChild(el('div', null, r.label)).style.cssText = 'font-size:12px;font-weight:700;';
    b.onclick = () => {
      s.close();
      const nato = AV.defaultFor(r.key);
      nato.scelti = {};
      onPick({ id: uid(), role: r.key, name: '', avatar: nato, note: '' });
    };
    grid.appendChild(b);
  });
  s.body.appendChild(grid);
  footBtn(s.foot, 'Annulla', 'btn-ghost', s.close);
}

/* ============================================================
   PERSONALIZZAZIONE AVATAR — una schermata sola
   Ogni tocco aggiorna solo l'anteprima e la classe del bottone.
   ============================================================ */
let seqRuota = 0;
function buildAvatarEditor(box, person, onChange, opts) {
  opts = opts || {};
  person.avatar = AV.normalize(person.avatar, person.role);
  const av = person.avatar;
  box.innerHTML = '';

  /* L'anteprima serve solo dove la persona non \u00e8 gi\u00e0 a video (il foglio delle
     impostazioni). Nella lista \u00e8 la riga qui sopra a fare da anteprima:
     rifarla qui voleva dire due avatar, due nomi e due volte i tratti. */
  let prev = null, traits = null;
  if (opts.anteprima) {
    const testa = el('div', 'ed-top');
    prev = el('div', 'ed-prev');
    prev.innerHTML = AV.build(av);
    testa.appendChild(prev);
    const lato = el('div', 'ed-side');
    traits = el('div', 'ed-traits');
    lato.appendChild(traits);
    testa.appendChild(lato);
    box.appendChild(testa);
  }

  let figuraViva = null, trattiVivi = null;

  /* la nota: l'unico campo che non sta gi\u00e0 nella riga */
  const nota = el('input', 'ed-nota');
  nota.placeholder = 'Segno particolare, nota\u2026';
  nota.value = person.note || '';
  nota.oninput = () => { person.note = nota.value; onChange(); };

  const aggiorna = (avvisa) => {
    if (figuraViva) {
      figuraViva.innerHTML = AV.build(av);
      trattiVivi.innerHTML = '';
      // nel modello sono righe di testo puntate, non pastiglie.
      // Solo i pezzi scelti: qui e nella scheda si legge la stessa cosa.
      const detti = AV.traits(av, 4, true);
      if (!detti.length) {
        trattiVivi.appendChild(el('div', 'ed-tr vuoto', 'tocca un pezzo per descriverlo'));
      } else {
        detti.forEach(t => trattiVivi.appendChild(el('div', 'ed-tr', '\u2022 ' + t.txt)));
      }
    }
    if (prev) prev.innerHTML = AV.build(av);
    if (traits) {
      traits.innerHTML = '';
      const scelti = AV.traits(av, 5, true);
      if (!scelti.length) traits.appendChild(el('div', 'hint', 'Tocca un pezzo per descriverlo'));
      else scelti.forEach(t => traits.appendChild(traitChip(t)));
    }
    sezioni.forEach(sz => {
      if (sz.node.dataset.off) {
        sz.node.classList.toggle('off', av.top.style === 'vestito' && sz.node.dataset.off === 'pants');
      }
    });
    if (avvisa !== false && typeof onChange === 'function') onChange();
  };

  /* ---- E2: si sceglie il PEZZO, sotto compaiono le sue scelte ----
     Le sezioni si costruiscono tutte ma restano staccate dalla pagina:
     a video ce n'e' una sola per volta, quindi non si scorre mai. */
  const sezioni = [];
  const EMOJI_PARTE = {
    capelli: '\ud83d\udc87', cappello: '\ud83e\udde2', maglietta: '\ud83d\udc55',
    pantaloni: '\ud83d\udc56', scarpe: '\ud83d\udc5f', borsa: '\ud83c\udf92',
    occhiali: '\ud83d\ude0e', pelle: '\u270b'
  };
  const riga = (icona, titolo, chiave) => {
    const r = el('div', 'ed-row');
    if (chiave) r.dataset.off = chiave;
    r.dataset.parte = icona;          // serve a segnare cosa e' stato scelto
    sezioni.push({ icona: icona, titolo: titolo, node: r });
    return r;
  };
  /* Segna che questo pezzo l'ha scelto una persona: solo i pezzi segnati
     finiscono nella descrizione della scheda. */
  const segna = (r) => {
    const p = r && r.dataset ? r.dataset.parte : '';
    if (p) { av.scelti = av.scelti || {}; av.scelti[p] = true; }
  };
  const stili = (r, lista, get, set, zona) => {
    const sc = el('div', 'ed-opts');
    sc.dataset.zona = zona || '';
    lista.forEach(it => {
      const b = el('button', 'ed-opt' + (get() === it.key ? ' on' : ''));
      const mini = el('div', 'ed-mini ed-z-' + (zona || 'tutto'));
      mini.innerHTML = AV.build(anteprimaStile(av, lista, it.key), { zona: zona });
      b.dataset.key = it.key;
      b.dataset.lista = nomeLista(lista);
      b.appendChild(mini);
      // il nome resta come suggerimento: a video parla la miniatura
      b.title = it.label;
      b.appendChild(el('span', null, it.label));
      b.onclick = () => {
        set(it.key);
        segna(r);
        $$('.ed-opt', sc).forEach(o => o.classList.remove('on'));
        b.classList.add('on');
        aggiorna();
        rifaiMiniature(sc, lista, zona);
      };
      sc.appendChild(b);
    });
    r.appendChild(sc);
    return sc;
  };
  const rifaiMiniature = (sc, lista, zona) => {
    $$('.ed-opt', sc).forEach((b, i) => {
      const m = $('.ed-mini', b);
      if (m) m.innerHTML = AV.build(anteprimaStile(av, lista, lista[i].key), { zona: zona });
    });
  };
  /* quando cambia un colore, le miniature vanno rifatte tutte */
  const rifaiTutte = () => {
    const tutte = [];
    sezioni.forEach(sz => $$('.ed-opts', sz.node).forEach(x => tutte.push(x)));
    tutte.forEach(sc => {
      const zona = sc.dataset.zona || undefined;
      $$('.ed-opt', sc).forEach(b => {
        const m = $('.ed-mini', b);
        if (m && b.dataset.key && b.dataset.lista) {
          const lista = AV[b.dataset.lista];
          if (lista) m.innerHTML = AV.build(anteprimaStile(av, lista, b.dataset.key), { zona: zona });
        }
      });
    });
  };
  function nomeLista(l) {
    if (l === AV.HAIR) return 'HAIR';
    if (l === AV.HAT) return 'HAT';
    if (l === AV.TOP) return 'TOP';
    if (l === AV.PANTS) return 'PANTS';
    if (l === AV.SHOES) return 'SHOES';
    if (l === AV.BAG) return 'BAG';
    if (l === AV.GLASSES) return 'GLASSES';
    if (l === AV.FACIAL) return 'FACIAL';
    return '';
  }
  /* per la miniatura mostro l'avatar con SOLO quel pezzo cambiato */
  function anteprimaStile(base, lista, key) {
    const c = JSON.parse(JSON.stringify(base));
    if (lista === AV.HAIR) c.hair.style = key;
    else if (lista === AV.HAT) c.hat.style = key;
    else if (lista === AV.TOP) c.top.style = key;
    else if (lista === AV.PANTS) c.pants.style = key;
    else if (lista === AV.SHOES) c.shoes.style = key;
    else if (lista === AV.BAG) c.bag.style = key;
    else if (lista === AV.GLASSES) c.glasses = key;
    else if (lista === AV.FACIAL) c.facial = key;
    return c;
  }

  /* colori: palette + ruota per il colore libero */
  const colori = (r, lista, get, set, etichetta) => {
    const sc = el('div', 'ed-cols');
    if (etichetta) sc.appendChild(el('span', 'ed-sub', etichetta));
    lista.forEach(c => {
      const hex = c.c || c;
      const b = el('button', 'ed-col');
      b.style.background = hex;
      b.title = c.n ? c.n[0] : '';
      b.dataset.hex = hex.toLowerCase();
      if (String(get()).toLowerCase() === hex.toLowerCase()) b.classList.add('on');
      b.onclick = () => {
        set(hex);
        segna(r);
        $$('.ed-col', sc).forEach(o => o.classList.remove('on'));
        b.classList.add('on');
        aggiorna();
        rifaiTutte();
      };
      sc.appendChild(b);
    });
    /* la ruota: qualsiasi colore */
    const wrap = el('label', 'ed-col ed-wheel');
    wrap.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">' +
      '<defs><linearGradient id="rb' + (++seqRuota) + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#FF4D4D"/><stop offset=".2" stop-color="#FFB020"/>' +
      '<stop offset=".4" stop-color="#37D67A"/><stop offset=".6" stop-color="#2CCCE4"/>' +
      '<stop offset=".8" stop-color="#5B7CFA"/><stop offset="1" stop-color="#D651E0"/>' +
      '</linearGradient></defs>' +
      '<circle cx="12" cy="12" r="11" fill="url(#rb' + seqRuota + ')"/>' +
      '<circle cx="12" cy="12" r="4" fill="var(--surface)"/></svg>';
    const inp = el('input');
    inp.type = 'color';
    inp.value = /^#[0-9a-f]{6}$/i.test(String(get())) ? get() : '#888888';
    inp.oninput = () => {
      set(inp.value);
      segna(r);
      $$('.ed-col', sc).forEach(o => o.classList.remove('on'));
      wrap.classList.add('on');
      aggiorna();
      rifaiTutte();
    };
    wrap.appendChild(inp);
    if (!lista.some(c => String((c.c || c)).toLowerCase() === String(get()).toLowerCase())) wrap.classList.add('on');
    sc.appendChild(wrap);
    r.appendChild(sc);
    return sc;
  };

  /* Il colore della fantasia non si sceglie piu': se lo ricava dal capo,
     schiarendolo o scurendolo. Era una domanda in piu' per una cosa che
     si decide da sola -- e il campione qui sotto lo fa vedere. */
  const patterns = (r, get, set, colGet) => {
    const sc = el('div', 'ed-cols');
    sc.appendChild(el('span', 'ed-sub', 'fantasia'));
    const rifai = () => $$('.ed-pat', sc).forEach((x, i2) => {
      x.innerHTML = campionePattern(colGet(), AV.PATTERNS[i2].key);
    });
    AV.PATTERNS.forEach(p => {
      const b = el('button', 'ed-col ed-pat' + (get() === p.key ? ' on' : ''));
      b.title = p.n;
      b.innerHTML = campionePattern(colGet(), p.key);
      b.onclick = () => {
        set(p.key);
        segna(r);
        $$('.ed-col', sc).forEach(o => o.classList.remove('on'));
        b.classList.add('on');
        aggiorna();
        rifai();
      };
      sc.appendChild(b);
    });
    r.appendChild(sc);
    sc.rifai = rifai;
    return sc;
  };
  function campionePattern(c1, key) {
    const c2 = AV.coloreFantasia(c1);
    const scuro = AV.shade(c1, -34);
    const d = {
      solid: '<rect width="24" height="24" fill="' + c1 + '"/>',
      'stripes-h': '<rect width="24" height="24" fill="' + c1 + '"/><rect width="24" height="6" y="3" fill="' + c2 + '"/><rect width="24" height="6" y="15" fill="' + c2 + '"/>',
      'stripes-v': '<rect width="24" height="24" fill="' + c1 + '"/><rect width="6" height="24" x="3" fill="' + c2 + '"/><rect width="6" height="24" x="15" fill="' + c2 + '"/>',
      diag: '<rect width="24" height="24" fill="' + c1 + '"/><path d="M-6 6 L6 -6 M0 24 L24 0 M18 30 L30 18" stroke="' + c2 + '" stroke-width="7"/>',
      dots: '<rect width="24" height="24" fill="' + c1 + '"/><circle cx="8" cy="8" r="3" fill="' + c2 + '"/><circle cx="17" cy="16" r="3" fill="' + c2 + '"/>',
      plaid: '<rect width="24" height="24" fill="' + c1 + '"/><rect y="9" width="24" height="5" fill="' + c2 + '"/><rect x="9" width="5" height="24" fill="' + c2 + '"/>',
      scacchi: '<rect width="24" height="24" fill="' + c1 + '"/><rect width="12" height="12" fill="' + c2 + '"/><rect x="12" y="12" width="12" height="12" fill="' + c2 + '"/>',
      fiori: '<rect width="24" height="24" fill="' + c1 + '"/>' +
        [[8, 8], [17, 17]].map(function (p) {
          let o = '';
          for (let k = 0; k < 5; k++) {
            const a = k * 72 * Math.PI / 180;
            o += '<circle cx="' + (p[0] + 3.4 * Math.cos(a)).toFixed(1) + '" cy="' +
                 (p[1] + 3.4 * Math.sin(a)).toFixed(1) + '" r="2.6" fill="' + c2 + '"/>';
          }
          return o + '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.9" fill="' + AV.shade(c2, -40) + '"/>';
        }).join(''),
      cuori: '<rect width="24" height="24" fill="' + c1 + '"/>' +
        '<path d="M12 19 C4.4 13.6 5.2 7.2 9.2 6.4 C11 6 12 7.6 12 8.8 C12 7.6 13 6 14.8 6.4 C18.8 7.2 19.6 13.6 12 19 Z" fill="' + c2 + '"/>',
      zigzag: '<rect width="24" height="24" fill="' + c1 + '"/>' +
        '<path d="M0 8 L6 2 L12 8 L18 2 L24 8 M0 20 L6 14 L12 20 L18 14 L24 20" stroke="' + c2 + '" stroke-width="4" fill="none"/>',
      animalier: '<rect width="24" height="24" fill="' + c1 + '"/>' +
        '<ellipse cx="7" cy="6" rx="4" ry="3" fill="' + scuro + '"/>' +
        '<ellipse cx="17" cy="13" rx="3.6" ry="2.8" fill="' + scuro + '"/>' +
        '<ellipse cx="9" cy="19" rx="4" ry="2.9" fill="' + scuro + '"/>',
      camo: '<rect width="24" height="24" fill="' + c1 + '"/><ellipse cx="7" cy="8" rx="6" ry="4.6" fill="' + scuro + '"/><ellipse cx="18" cy="17" rx="6" ry="4.6" fill="' + c2 + '"/>',
      stars: '<rect width="24" height="24" fill="' + c1 + '"/><path d="M12 4.5 14 10h5.6l-4.5 3.3 1.7 5.4L12 15.4 7.2 18.7l1.7-5.4L4.4 10H10Z" fill="' + c2 + '"/>',
      logo: '<rect width="24" height="24" fill="' + c1 + '"/><circle cx="12" cy="12" r="6" fill="none" stroke="' + c2 + '" stroke-width="3"/>'
    };
    return '<svg viewBox="0 0 24 24" width="100%" height="100%">' + (d[key] || d.solid) + '</svg>';
  }

  /* L'ordine è quello di ciò che si NOTA di una persona, dall'alto in
     basso: capelli, cappello, maglietta, pantaloni. Pelle e viso stanno
     in fondo perché quasi non si toccano, e prima costringevano a
     scorrere per arrivare ai vestiti, che sono la cosa che serve. */
  const rCap = riga('capelli', 'Capelli');
  stili(rCap, AV.HAIR, () => av.hair.style, v => { av.hair.style = v; }, 'testa');
  colori(rCap, AV.HAIR_COLORS, () => av.hair.color, v => { av.hair.color = v; });

  const rHat = riga('cappello', 'Cappello');
  stili(rHat, AV.HAT, () => av.hat.style, v => { av.hat.style = v; }, 'testa');
  colori(rHat, AV.COLORS, () => av.hat.color, v => { av.hat.color = v; });

  const rTop = riga('maglietta', 'Maglietta');
  stili(rTop, AV.TOP, () => av.top.style, v => { av.top.style = v; }, 'busto');
  colori(rTop, AV.COLORS, () => av.top.color, v => { av.top.color = v; if (patTop) patTop.rifai(); });
  const patTop = patterns(rTop, () => av.top.pattern, v => { av.top.pattern = v; },
    () => av.top.color);

  const rPants = riga('pantaloni', 'Sotto', 'pants');
  stili(rPants, AV.PANTS, () => av.pants.style, v => { av.pants.style = v; }, 'gambe');
  colori(rPants, AV.COLORS, () => av.pants.color, v => { av.pants.color = v; if (patPants) patPants.rifai(); });
  const patPants = patterns(rPants, () => av.pants.pattern, v => { av.pants.pattern = v; },
    () => av.pants.color);

  const rShoes = riga('scarpe', 'Scarpe');
  stili(rShoes, AV.SHOES, () => av.shoes.style, v => { av.shoes.style = v; }, 'piedi');
  colori(rShoes, AV.COLORS, () => av.shoes.color, v => { av.shoes.color = v; });

  const rBag = riga('borsa', 'Borsa');
  stili(rBag, AV.BAG, () => av.bag.style, v => { av.bag.style = v; }, 'lato');
  colori(rBag, AV.COLORS, () => av.bag.color, v => { av.bag.color = v; });

  const rViso = riga('occhiali', 'Viso');
  stili(rViso, AV.GLASSES, () => av.glasses, v => { av.glasses = v; }, 'viso');
  stili(rViso, AV.FACIAL, () => av.facial, v => { av.facial = v; }, 'viso');

  const rPelle = riga('pelle', 'Pelle');
  colori(rPelle, AV.SKINS, () => av.skin, v => { av.skin = v; });

  /* Il palco di E2: a sinistra la persona (grande, sempre in vista), a
     destra i pezzi e le loro scelte. La riga compatta sopra si nasconde
     mentre l'editor e' aperto, cosi' l'avatar resta uno solo. */
  const palco = el('div', 'ed-palco');
  const colonna = el('div', 'ed-persona');
  const figura = el('div', 'ed-figura');
  figura.innerHTML = AV.build(av);
  colonna.appendChild(figura);
  const chi = el('div', 'ed-chi', roleOf(person.role).label);
  colonna.appendChild(chi);
  const tratti = el('div', 'ed-tratti');
  colonna.appendChild(tratti);
  figuraViva = figura;
  trattiVivi = tratti;
  colonna.appendChild(nota);
  const lato = el('div', 'ed-lato');
  palco.appendChild(colonna);
  palco.appendChild(lato);
  box.appendChild(palco);

  const parti = el('div', 'ed-parti');
  const pannello = el('div', 'ed-pannello');
  lato.appendChild(parti);
  lato.appendChild(pannello);

  const mostra = (i) => {
    $$('.ed-parte', parti).forEach((b, j) => b.classList.toggle('on', i === j));
    pannello.innerHTML = '';
    /* il titoletto che dice cosa stai cambiando: nel modello c'e' e
       aiuta a non perdersi ("FORMA DELLA MAGLIETTA") */
    pannello.appendChild(el('div', 'ed-k', sezioni[i].titolo));
    pannello.appendChild(sezioni[i].node);
  };
  sezioni.forEach((sz, i) => {
    const b = el('button', 'ed-parte');
    b.innerHTML = '<span class="em">' + (EMOJI_PARTE[sz.icona] || '\u2728') + '</span>';
    b.appendChild(el('span', 'nm', sz.titolo));
    b.onclick = () => mostra(i);
    parti.appendChild(b);
  });
  // si parte dalla maglietta: e' la prima cosa che si guarda di una
  // persona, ed e' quello che fa il modello
  mostra(Math.min(2, sezioni.length - 1));

  aggiorna(false);   // primo disegno: non avvisare nessuno
}

/* usato dalle impostazioni per gli avatar salvati: stesso editor, in un foglio */
function openCustomizer(person, onDone) {
  const s = sheet('Com\u2019\u00e8 vestito', { onClose: () => { if (typeof onDone === 'function') onDone(); } });
  const nome = el('input', 'ed-nota');
  nome.placeholder = 'Nome';
  nome.value = person.name || '';
  nome.oninput = () => { person.name = nome.value; };
  s.body.appendChild(nome);
  const box = el('div', 'p-editor');
  buildAvatarEditor(box, person, () => {});
  s.body.appendChild(box);
  footBtn(s.foot, 'Fatto', 'btn-primary', s.close);
}

/* ---------- salvataggio ingresso ---------- */
/* ---------- salvataggio ingresso ---------- */
function commitEntry() {
  if (!draft.braceletCustom) {
    const slot = braceletFor(draft.startTime);
    draft.braceletColor = slot ? slot.color : null;
  }
  entries.push({
    id: uid(), createdAt: Date.now(),
    startTime: draft.startTime, durationMinutes: draft.durationMinutes, payLater: draft.payLater,
    children: draft.children, crazyJumping: draft.crazyJumping,
    people: draft.people, barItems: lista(draft.barItems),
    braceletColor: draft.braceletColor, braceletCustom: draft.braceletCustom,
    status: 'active',
    /* quello che e' gia' stato incassato al banco entra subito nei conti
       del giorno: se no la sera i totali non tornano */
    paidLines: JSON.parse(JSON.stringify(draft.paidLines || {})),
    paidAmt: JSON.parse(JSON.stringify(draft.paidAmt || {})),
    paidPark: r2(draft.paidPark), paidBar: r2(draft.paidBar),
    barPaid: 0, parkPaid: false,
    baseMinutes: draft.durationMinutes
  });
  toast('Ingresso registrato \u2705');
  saveEntries();
  draft = freshDraft();
  PAN.conto = draft;
  switchTab('active');
  // se una versione nuova stava aspettando che finissi, adesso puo' entrare
  if (typeof applicaSePuoi === 'function') setTimeout(applicaSePuoi, 1200);
}

function posizioniSchede() {
  const m = new Map();
  document.querySelectorAll('#view-active .entry').forEach(c => {
    if (c.dataset.id) m.set(c.dataset.id, c.getBoundingClientRect().top);
  });
  return m;
}
function scivolaAlPosto(prima) {
  if (!anima() || !prima.size) return;
  document.querySelectorAll('#view-active .entry').forEach(c => {
    const era = prima.get(c.dataset.id);
    if (era === undefined) return;
    const salto = era - c.getBoundingClientRect().top;
    if (Math.abs(salto) < 2) return;
    c.style.transition = 'none';
    c.style.transform = 'translateY(' + salto + 'px)';
    requestAnimationFrame(() => {
      c.style.transition = 'transform 420ms cubic-bezier(.4,.02,.2,1)';
      c.style.transform = '';
      setTimeout(() => { c.style.transition = ''; }, 460);
    });
  });
}

function buildActiveView() {
  const root = $('#view-active');
  /* Il pannello del conto vive DENTRO una scheda quando e' aperto, e qui
     sotto la lista si rifa' da zero: se restasse li' verrebbe distrutto
     insieme alla scheda. Lo rimando a casa prima di svuotare. Vale anche
     quando la lista si rifa' da sola -- dati dal cloud, un'uscita, il
     cambio archivio -- non solo quando si tocca qualcosa. */
  if (PAN.root && root.contains(PAN.root)) {
    if (volante) posaSubito(volante.card);
    riportaPannello();
  }
  const dovErano = posizioniSchede();
  cardRefs.clear();
  root.innerHTML = '';

  const list = showArchive ? archived() : activeEntries();
  const attivi = entries.filter(e => e.status === 'active');
  const bimbi = attivi.reduce((s, e) => s + clamp(e.children, 0, 1e6), 0);

  const head = el('div', 'list-head');
  const h2 = el('h2');
  h2.innerHTML = showArchive ? '\ud83d\uddc2\ufe0f Archivio' : '\ud83c\udf9f\ufe0f In corso';
  head.appendChild(h2);
  if (!showArchive) {
    head.appendChild(el('span', 'pill conta', attivi.length + (attivi.length === 1 ? ' gruppo' : ' gruppi')));
    head.appendChild(el('span', 'pill conta', bimbi + (bimbi === 1 ? ' bambino' : ' bambini')));
  }
  const arch = el('button', 'pill arch-btn' + (showArchive ? ' on' : ''));
  arch.innerHTML = showArchive ? '\u2190 Torna agli attivi' : ('\ud83d\uddc2\ufe0f Archivio (' + archived().length + ')');
  arch.onclick = () => { showArchive = !showArchive; archivioTutto = false; buildActiveView(); };
  head.appendChild(arch);
  root.appendChild(head);

  if (showArchive) {
    root.appendChild(Object.assign(el('div', 'hint'), {
      textContent: 'Gli ingressi chiusi restano qui: puoi riaprirli se hai sbagliato, o eliminarli per sempre.'
    }));
  }

  if (!list.length) {
    const e = el('div', 'empty');
    e.innerHTML = showArchive
      ? '<span class="em">\ud83d\uddc2\ufe0f</span>Nessun ingresso archiviato.'
      : '<span class="em">\ud83c\udfa2</span>Nessuno dentro al parco.<br>Registra un ingresso dal tasto <b>Nuovo</b>.';
    root.appendChild(e);
    return;
  }

  const box = el('div', 'entries');
  /* L'ARCHIVIO NON SI DISEGNA TUTTO.
     A fine stagione qui dentro ci sono migliaia di ingressi, e
     disegnarli tutti vuol dire decine di migliaia di riquadri nella
     pagina: l'archivio ci mette un secondo ad aprirsi e la tavoletta
     se lo porta dietro finche' resta li'.
     Ne bastano gli ultimi: l'archivio serve a RIAPRIRE UNO SBAGLIO, e
     uno sbaglio e' sempre di poco fa. Per guardare com'e' andato un
     mese c'e' il registro, che i conti li fa senza disegnare niente.
     Chi cerca proprio quello vecchio tocca "mostra tutti". */
  const quanti = showArchive && !archivioTutto && list.length > ARCHIVIO_A_VISTA
    ? ARCHIVIO_A_VISTA : list.length;
  list.slice(0, quanti).forEach(entry => box.appendChild(showArchive ? archiveCard(entry) : entryCard(entry)));
  if (quanti < list.length) {
    const altri = el('button', 'btn btn-block mostra-tutti',
      'Mostra tutti (' + list.length + ')');
    altri.onclick = () => { archivioTutto = true; buildActiveView(); };
    box.appendChild(altri);
  }
  /* PRIMA si attaccano alla pagina, POI si misura dove sono finite:
     chiamata prima dell'appendChild, scivolaAlPosto interrogava schede
     che nel DOM non c'erano ancora, quindi l'animazione del riordino
     non e' mai partita da quando esiste. */
  root.appendChild(box);
  scivolaAlPosto(dovErano);
  if (!showArchive) tick();
}

function archiveCard(entry) {
  const d = el('div', 'arch');
  const info = el('div', 'ainfo');
  const who = lista(entry.people).map(nameOf).join(', ') || 'Nessun riferimento';
  info.innerHTML = `<b>${entry.status === 'cancelled' ? '🗑️ Annullato' : '✅ Chiuso'}</b> · ${fmtDate(entry.startTime)} ${fmtTime(entry.startTime)}<br>${esc(who)} · 🧒 ${clamp(entry.children, 0, 1e6)}`;
  d.appendChild(info);
  const rest = el('button', 'btn btn-sm', '\u21a9\ufe0e');
  rest.title = 'Ripristina';
  rest.onclick = () => {
    entry.status = 'active';
    delete entry.costoFinale;   // torna dentro: si riconta col listino di adesso
    saveEntries();
    buildActiveView();
    updateBadge();
    toast('Ripristinato');
  };
  const del = el('button', 'btn btn-sm btn-danger', '\ud83d\uddd1\ufe0f');
  del.title = 'Elimina';
  del.onclick = () => confirmSheet('Eliminare definitivamente?', 'Non si può annullare.', () => {
    entries = entries.filter(e => e.id !== entry.id);
    saveEntries();
    buildActiveView();
    updateBadge();
    toast('Eliminato');
  });
  d.appendChild(rest);
  d.appendChild(del);
  return d;
}

const APPENA = 30000;   // mezzo minuto: il tempo di accorgersi di un errore

function entryCard(entry) {
  const card = el('div', 'entry s-' + stateOf(entry, Date.now()));
  card.dataset.id = entry.id;
  /* L'ultimo inserito resta segnato per mezzo minuto: se hai sbagliato
     qualcosa lo correggi subito, senza cercarlo a memoria nell'elenco. */
  const eta = Date.now() - num(entry.createdAt, 0);
  if (eta >= 0 && eta < APPENA) {
    card.classList.add('appena');
    setTimeout(() => card.classList.remove('appena'), APPENA - eta);
  }

  const people = lista(entry.people).map(p => (p.avatar = AV.normalize(p.avatar, p.role), p));

  /* ================= LA RIGA (modello R1-a) =================
     figura | chi e' + tratti + orari | bracciale | countdown | soldi */
  const riga = el('div', 'e-riga');

  /* la figura non si taglia mai: all'uscita servono anche i pantaloni
     e le scarpe per capire chi e'. */
  const avBox = el('div', 'e-av' + (people.length > 1 ? ' multi' : ''));
  /* Senza riferimento il posto della figura DIVENTA il tasto per
     metterlo: si tocca li', dove l'occhio guarda gia'. */
  /* Toccare la figura apre il Parco dentro Bar & Conto: e' li' che si
     veste chi accompagna. Prima si apriva un foglio volante tutto suo,
     cioe' una seconda strada per la stessa cosa -- diversa da quella
     del pannello e destinata a divergere. */
  const apriParco = (ev) => {
    ev.stopPropagation();
    if (!card.classList.contains('aperto')) card.classList.add('aperto');
    /* se il conto e' gia' aperto basta cambiare linguetta */
    if (!payPanel.classList.contains('hidden') && PAN.ingresso === entry) {
      PAN.cat = 'Parco';
      aggiornaPannello({ entra: true });
      accendiPersone();
      return;
    }
    apriConto('Parco');
    accendiPersone();
  };
  if (!people.length) {
    avBox.classList.add('manca');
    avBox.title = 'Nessun riferimento \u2014 tocca per metterlo';
    avBox.appendChild(el('div', 'segno', '\u2795'));
    avBox.appendChild(el('div', 'dillo', 'metti chi \u00e8'));
    avBox.onclick = apriParco;
  } else {
    people.slice(0, 2).forEach(p => {
      const a = el('div', 'av');
      a.innerHTML = AV.build(p.avatar);
      a.title = 'Com\u2019\u00e8 vestito ' + nameOf(p);
      a.onclick = apriParco;
      avBox.appendChild(a);
    });
  }
  riga.appendChild(avBox);

  const chi = el('div', 'e-chi');
  const nome = el('b');
  nome.textContent = people.length
    ? people.map(p => roleOf(p.role).em + ' ' + nameOf(p)).join(' \u00b7 ')
    : 'Nessun riferimento';
  chi.appendChild(nome);
  const tratti = el('div', 'e-tr');
  if (people.length === 1) {
    tratti.textContent = AV.traits(people[0].avatar, 3, true).map(t => t.txt).join(' \u00b7 ');
  } else if (people.length) {
    tratti.textContent = people.slice(0, 2)
      .map(p => (AV.traits(p.avatar, 1, true)[0] || {}).txt || '').filter(Boolean).join(' \u00b7 ');
  } else {
    tratti.textContent = '\u26a0\ufe0f all\'uscita non avrai riferimenti';
  }
  chi.appendChild(tratti);
  const sotto = el('div', 'e-sotto');
  const range = el('div', 'e-orari');
  sotto.appendChild(range);
  /* quanti bambini si deve poter leggere SENZA aprire la scheda */
  const bimbi = el('div', 'e-bimbi');
  bimbi.innerHTML = '\ud83e\uddd2';
  const bimbiV = el('span', 'num', '0');
  bimbi.appendChild(bimbiV);
  sotto.appendChild(bimbi);
  /* i Crazy accanto ai bambini, stessa pastiglia piccola: compare solo
     se ce n'\u00e8 almeno uno, altrimenti sarebbe uno zero che sporca */
  const crz = el('div', 'e-bimbi e-crazy hidden');
  crz.innerHTML = '\ud83e\udd38';
  const crzV = el('span', 'num', '0');
  crz.appendChild(crzV);
  sotto.appendChild(crz);
  chi.appendChild(sotto);
  riga.appendChild(chi);

  /* il bracciale e' il pallino del modello: 21px. Il bersaglio per il
     dito e' allargato in modo invisibile, senza spostare niente. */
  const autoSlot = braceletFor(entry.startTime);
  const wristColor = entry.braceletColor || (autoSlot ? autoSlot.color : null);
  const wrist = el('button', 'e-brac');
  wrist.title = wristColor
    ? 'Bracciale ' + ((autoSlot && !entry.braceletCustom && autoSlot.label) ? autoSlot.label : (AV.colorName(wristColor, 0) || '')) + ' \u2014 tocca per cambiare'
    : 'Nessun bracciale \u2014 tocca per sceglierlo';
  if (wristColor) wrist.style.background = wristColor; else wrist.classList.add('vuoto');
  wrist.onclick = (ev) => { ev.stopPropagation(); apriMenuBracciale(wrist, entry); };
  riga.appendChild(wrist);

  /* IL NUMERO GRANDE DA SOLO NON DICE COSA CONTA: lo stesso "45:12"
     puo' essere il tempo che manca, quello sforato o quello passato
     dentro con la tariffa aperta, e il colore della scheda lo suggerisce
     ma non lo dice. Sopra ci va la parola, come gia' fa la cifra dei
     soldi qui accanto ("DA PAGARE"). */
  const countBox = el('div', 'e-conto');
  const countK = el('span', 'k', '');
  const count = el('span', 'v num', '--:--');
  countBox.appendChild(countK);
  countBox.appendChild(count);
  riga.appendChild(countBox);

  /* i soldi: etichetta sopra, numero sotto */
  const soldi = el('div', 'e-soldi');
  const soldiK = el('span', 'k', '');
  const soldiV = el('span', 'v num', '');
  soldi.appendChild(soldiK);
  soldi.appendChild(soldiV);
  riga.appendChild(soldi);

  card.appendChild(riga);

  /* ================= QUELLO CHE SI APRE =================
     una fila sola: tre celle compatte e i tasti a destra */
  const aperta = el('div', 'e-aperta');
  /* l'involucro serve all'animazione: e' lui che si apre da 0 a tutta
     altezza, invece del salto secco di display:none */
  const dentro = el('div', 'e-dentro');
  aperta.appendChild(dentro);
  const fila = el('div', 'e-fila');

  const mkCella = (emoji, key, step, suffisso) => {
    const box = el('div', 'e-cella');
    const minus = el('button');
    minus.textContent = step > 1 ? '\u2212' + step : '\u2212';
    const kk = emoji ? el('span', 'k', emoji) : null;
    const val = el('span', 'v num', '0');
    const plus = el('button');
    plus.textContent = step > 1 ? '+' + step : '+';
    const bump = (d) => (ev) => {
      ev.stopPropagation();
      /* passano dal conto anche questi: cambiare i bambini qui e non di
         la' voleva dire lasciare le righe pagate scollegate dai soldi */
      const voce = key === 'children' ? 'bimbi' : key === 'crazyJumping' ? 'crazy' : null;
      if (voce) conConto(entry, () => bcSetQ(voce, clamp(num(entry[key], 0) + d, 0, 99999)));
      else entry[key] = clamp(num(entry[key], 0) + d, 0, 99999);
      saveEntries();
      syncCard(entry);
      tick();
    };
    minus.onclick = bump(-step);
    plus.onclick = bump(step);
    box.appendChild(minus);
    if (kk) box.appendChild(kk);
    box.appendChild(val);
    box.appendChild(plus);
    fila.appendChild(box);
    return { box, val, minus };
  };
  const sKids = mkCella('\ud83e\uddd2', 'children', 1);
  const sCrazy = mkCella('\ud83e\udd38', 'crazyJumping', 1);
  const sTime = mkCella(null, 'durationMinutes', 5);
  if (entry.payLater) {
    sTime.box.classList.add('hidden');
    fila.appendChild(el('div', 'e-later-tag', '\u23f3 Tempo aperto'));
  }

  const azioni = el('div', 'e-azioni');
  const mkAct = (testo, cls, fn) => {
    const b = el('button', cls || '');
    b.textContent = testo;
    b.onclick = fn;
    azioni.appendChild(b);
    return b;
  };
  fila.appendChild(azioni);
  dentro.appendChild(fila);

  /* Il guscio del conto: qui dentro ci entra IL pannello -- lo stesso
     di "+ Nuovo" -- spostato di peso. Prima c'erano due strade per la
     stessa cosa (la matita che riapriva il modulo, e il conto a
     pastiglie qui dentro) e bastava toccarne una per farle divergere. */
  /* NON chiamarlo "e-conto": quella classe e' gia' presa dal riquadro
     del conto alla rovescia nella riga della scheda, largo 116px fissi,
     e il pannello ci finiva dentro strizzato a un dito */
  const payPanel = el('div', 'e-panel e-guscio hidden');
  dentro.appendChild(payPanel);

  /* Apre (o chiude) il conto. Ci passano sia il tasto sia la figura:
     una strada sola, cosi' non possono comportarsi in modo diverso. */
  const apriConto = (cat) => {
    /* mentre una scheda sta volando i tocchi non contano: vedi
       occupaVolo */
    if (voloOccupato) return;
    /* la misura va presa ADESSO, prima che il pannello si apra: se la
       prendo dopo, il buco lasciato nella lista e' troppo corto e tutte
       le schede sotto saltano su */
    const misura = card.getBoundingClientRect();
    const chiuso = payPanel.classList.contains('hidden');
    chiudiPannelli(entry.id);
    payPanel.classList.toggle('hidden', !chiuso);
    payBtn.classList.toggle('on', chiuso);
    if (chiuso) {
      /* di suo si apre sulle bibite: dal tasto quasi sempre si sta
         segnando da bere. Dalla figura invece si va dritti al Parco. */
      /* PRIMA si stacca e vola, POI ci si mette dentro il pannello.
         Al contrario il pannello nasceva credendo di stare ancora in
         "+ Nuovo", si dava la scala di quella schermata, e appena la
         scheda partiva se la ricalcolava: si vedeva tutto cambiare
         misura a mezz'aria. */
      alza(card, misura);
      montaPannello(payPanel, entry, { ingresso: entry, cat: cat || primaCategoriaBar() });
    } else {
      posa(card);
    }
  };
  const payBtn = mkAct('\ud83e\uddfe Bar & Conto', 'conto', (ev) => {
    ev.stopPropagation();
    apriConto();
  });
  payBtn.title = 'Conto, bar, orario, bracciale, persone';

  mkAct('\ud83d\udeaa Uscita', 'forte', (ev) => { ev.stopPropagation(); chiudiIngresso(entry); });

  const notes = people.filter(p => p.note && p.note.trim());
  if (notes.length) {
    dentro.appendChild(el('div', 'e-note', notes.map(p => '\ud83d\udcdd ' + p.note.trim()).join(' \u00b7 ')));
  }

  card.appendChild(aperta);

  /* un tocco ovunque sulla riga apre; dentro non si chiude */
  riga.onclick = () => {
    if (voloOccupato) return;
    const gia = card.classList.contains('aperto');
    chiudiSchede(null);
    if (!gia) card.classList.add('aperto');
  };
  aperta.onclick = (ev) => ev.stopPropagation();

  cardRefs.set(entry.id, {
    card, count, range, sKids, sCrazy, sTime,
    dueVal: soldiV, soldiK, soldi, wrist, bimbiV, crzV, crz, countK,
    payPanel, payBtn
  });
  syncCard(entry);
  return card;
}


/* ============================================================
   IL CONTO — uno solo, con due padroni
   Le funzioni qui sotto non guardano piu' il gruppo che si sta
   registrando: guardano PAN.conto, che e' il draft quando sei in
   "+ Nuovo" e un ingresso vero quando apri il conto di chi e' gia'
   dentro. Cosi' la stessa schermata serve tutti e due invece di
   essere scritta due volte e divergere alla prima modifica.

   Ogni voce ha DUE numeri: quante ne ha prese e quante ne ha gia'
   pagate. Ma la verita' dei soldi resta l'IMPORTO incassato
   (paidPark / paidBar), non la spunta: se domani il prezzo cambia --
   tempo esteso, un bambino in piu' -- la differenza torna dovuta
   invece di restare nascosta sotto un segno di spunta.
   ============================================================ */
const PAN = {
  root: null,          // il pannello: ce n'e' UNO SOLO e si sposta
  conto: null,         // il draft, oppure un ingresso gia' registrato
  ingresso: null,      // l'ingresso, se sto lavorando su uno registrato
  cat: 'Parco'
};
/* chi e' stato toccato per ultimo: serve solo alle animazioni, per far
   muovere QUELLA card e non tutta la griglia */
const tocchi = { id: null, nato: null };

const C = () => PAN.conto || draft;
/* fa lavorare le funzioni del conto su un oggetto diverso da quello
   aperto nel pannello, e poi rimette a posto */
function conConto(obj, fn) {
  const prima = PAN.conto;
  PAN.conto = obj;
  try { return fn(); } finally { PAN.conto = prima; }
}
const r2 = v => Math.round(num(v, 0) * 100) / 100;

function bcVoce(id) {
  if (id === 'bimbi') return { id: 'bimbi', name: 'Bambini', price: costOf(C()).unit, em: '\ud83e\uddd2' };
  if (id === 'crazy') return { id: 'crazy', name: 'Crazy Jumping', price: num(settings.crazyJumpingPrice, 0), em: '\ud83e\udd38' };
  const v = lista(settings.barMenu).find(x => x.id === id);
  if (v) return v;
  /* la voce e' stata tolta dal listino ma sta ancora su un conto
     aperto: si tiene quella scritta li', se no non si poteva piu'
     nemmeno cancellarla dal conto */
  return lista(C().barItems).find(x => x.id === id) || null;
}
function prezzoUnita(id) {
  if (id !== 'bimbi' && id !== 'crazy') {
    /* Per il bar comanda il prezzo SCRITTO SUL CONTO, non quello del
       listino: e' quello che somma barTotal() ed e' quello che il
       cliente ha visto quando ha ordinato. Prendendolo dal listino,
       bastava ritoccare un prezzo in Impostazioni perche' i conti gia'
       aperti non si chiudessero piu' (pagati troppo o troppo poco). */
    const bi = lista(C().barItems).find(x => x.id === id);
    if (bi) return num(bi.price, 0);
  }
  const v = bcVoce(id);
  return v ? num(v.price, 0) : 0;
}
function bcQ(id) {
  const c = C();
  if (id === 'bimbi') return clamp(c.children, 0, 9999);
  if (id === 'crazy') return clamp(c.crazyJumping, 0, 9999);
  const bi = lista(c.barItems).find(x => x.id === id);
  return bi ? clamp(bi.qty, 0, 9999) : 0;
}
/* quante ne ha gia' pagate, come sta scritto (senza tagliare): serve a
   sapere quanti soldi restituire se toglie roba dal conto */
const bcPagGrezzo = id => Math.max(0, num((C().paidLines || {})[id], 0));
const bcPag = id => clamp(bcPagGrezzo(id), 0, bcQ(id));

/* Ogni riga si ricorda QUANTI SOLDI ha incassato, non solo quante
   unita' sono spuntate. Serve perche' il prezzo cambia sotto: se
   allunghi il tempo, un bambino costa di piu', e restituire "una unita'
   al prezzo di adesso" renderebbe piu' di quanto era entrato. */
const importoRiga = id => Math.max(0, num((C().paidAmt || {})[id], 0));

/* L'UNICO punto da cui i soldi si muovono. Aggiorna insieme l'importo
   della riga e il totale della sua sezione: cosi' le spunte e la cassa
   non possono raccontare due storie diverse, che era la radice di tutti
   i conti sbagliati trovati in revisione. */
function muoviSoldi(id, delta) {
  const c = C();
  delta = r2(delta);
  if (!delta) return;
  c.paidAmt = c.paidAmt || {};
  const prima = importoRiga(id);
  const dopo = Math.max(0, r2(prima + delta));
  c.paidAmt[id] = dopo;
  const campo = (id === 'bimbi' || id === 'crazy') ? 'paidPark' : 'paidBar';
  c[campo] = Math.max(0, r2(num(c[campo], 0) + (dopo - prima)));
}

/* quanto costa una riga per intero, adesso */
const totaleRiga = id => r2(bcQ(id) * prezzoUnita(id));

/* Segna quante ne ha pagate e muove i soldi di conseguenza. */
function segnaPagate(id, n) {
  const c = C();
  c.paidLines = c.paidLines || {};
  const prima = bcPagGrezzo(id);
  /* non si puo' aver pagato piu' roba di quanta ce n'e' sul conto: il
     pannello lo impedisce spegnendo il "+", ma la regola vale sempre,
     anche per i dati che arrivano da fuori */
  n = clamp(Math.round(num(n, 0)), 0, bcQ(id));
  if (n === prima) return;
  c.paidLines[id] = n;
  if (n > prima) {
    muoviSoldi(id, (n - prima) * prezzoUnita(id));
  } else if (prima > 0) {
    /* si restituisce al prezzo a cui era stato PRESO, in proporzione:
       col prezzo di adesso, dopo un allungamento, si sarebbero resi
       soldi mai incassati */
    const giu = n === 0 ? importoRiga(id) : r2(importoRiga(id) * (prima - n) / prima);
    muoviSoldi(id, -giu);
  }
}

function bcSetQ(id, n) {
  const c = C();
  n = clamp(n, 0, 9999);
  if (id === 'bimbi') c.children = n;
  else if (id === 'crazy') c.crazyJumping = n;
  else {
    const v = bcVoce(id); if (!v) return;
    c.barItems = lista(c.barItems);
    let bi = c.barItems.find(x => x.id === id);
    if (!bi) { bi = { id: id, name: v.name, price: v.price, qty: 0 }; c.barItems.push(bi); }
    bi.qty = n; bi.price = v.price; bi.name = v.name;
    if (n <= 0) c.barItems = c.barItems.filter(x => x.qty > 0);
  }
  /* se toglie roba dal conto non puo' restare "pagata" piu' di quanta
     ce n'e' rimasta, e quei soldi tornano indietro */
  if (bcPagGrezzo(id) > n) segnaPagate(id, n);
}

/* ---------- quanto viene, adesso ----------
   Le regole non cambiano: il Crazy costa a parte e i suoi minuti
   allungano la permanenza senza entrare nello scaglione, oltre le due
   ore ci si ferma alla tariffa piu' alta. Il calcolo e' quello di
   costOf(), lo STESSO che usa la scheda di chi e' gia' dentro: prima
   qui ce n'era una copia che ignorava il "paga dopo" e gli scaglioni. */
const contoParco = () => r2(costOf(C()).parkTotal);
const contoCrazy = () => r2(costOf(C()).crazyCost);
const contoBar = () => r2(barTotal(C()));
/* Quanto e' DAVVERO entrato su ogni pezzo. Prima si moltiplicavano le
   spunte per il prezzo di adesso, e la riga poteva mostrare il ✓ verde
   mentre la cifra grande diceva "restano": due conti diversi nella
   stessa schermata. */
const contoPagatoParco = () => Math.min(importoRiga('bimbi'), contoParco());
const contoPagatoCrazy = () => Math.min(importoRiga('crazy'), contoCrazy());
const contoPagatoBar = () =>
  Math.min(r2(lista(C().barItems).reduce((a, bi) => a + importoRiga(bi.id), 0)), contoBar());
const contoResta = () => dueOf(C()).total;

/* Segna (o dissegna) tutta una sezione. Il "paga" non risomma le
   righe: rabbocca fino a coprire il dovuto di quella voce. Prima, se
   una parte era gia' stata incassata in contanti col Resto, la
   sommava una seconda volta. */
function bcSegna(quali, pieno) {
  const c = C();
  const voci = quali === 'bar' ? lista(c.barItems).map(x => x.id) : [quali];
  voci.forEach(id => {
    if (!pieno) { segnaPagate(id, 0); return; }
    c.paidLines = c.paidLines || {};
    c.paidLines[id] = bcQ(id);
    const manca = r2(totaleRiga(id) - importoRiga(id));
    if (manca > 0) muoviSoldi(id, manca);
  });
}

/* Paga tutto: copre ogni riga, poi gli eventuali spiccioli che
   l'arrotondamento lascia scoperti. Il conto si chiude sull'importo,
   che e' quello che il cliente mette in mano. */
function pagaTutto() {
  bcSegna('bimbi', true); bcSegna('crazy', true); bcSegna('bar', true);
  const c = C(), d = dueOf(c);
  if (d.parkDue > 0) muoviSoldi('bimbi', d.parkDue);
  if (d.barDue > 0) {
    const primo = lista(c.barItems)[0];
    if (primo) muoviSoldi(primo.id, d.barDue);
  }
}

/* le categorie: il Parco davanti/* le categorie: il Parco davanti, poi quelle vere del menu */
/* DUE LINGUETTE, NON SEI.
   Prima ce n'era una per categoria -- Bevande, Snack, Birre, Alcolici
   -- e per due birre e un caffe' bisognava cambiare linguetta tre
   volte, ogni volta con la griglia che si ridisegnava. Le categorie
   non sono posti diversi: sono scaffali dello stesso bancone.
   Adesso il bancone e' uno solo e le categorie sono titoletti dentro,
   in una lista che scorre. */
function bcCategorie() { return ['Parco', 'Bar']; }

/* le categorie vere, nell'ordine in cui compaiono nel listino: sono i
   divisori dentro il bar, non delle destinazioni */
function bcScaffali() {
  const out = [];
  lista(settings.barMenu).forEach(it => {
    const c = (it.cat || 'Altro').trim() || 'Altro';
    if (out.indexOf(c) < 0) out.push(c);
  });
  return out;
}
function bcVociDi(cat) {
  return lista(settings.barMenu).filter(it => ((it.cat || 'Altro').trim() || 'Altro') === cat);
}

/* La card di una voce. Bambini e Crazy Jumping tengono le due fasce
   SEMPRE aperte: sono sempre in ballo, e vederle comparire e sparire
   faceva ballare mezza schermata sotto le dita. Le bibite invece le
   aprono quando ne prendi una: e' il segnale che l'hai aggiunta. */
function bcCard(v, sempre) {
  if (!v) return '';
  const q = bcQ(v.id), pg = bcPag(v.id);
  const saldata = q > 0 && pg >= q;
  const aperta = sempre || q > 0;
  return '<div class="bc-card' + (saldata ? ' saldata' : (q ? ' presa' : '')) +
    (tocchi.id === v.id ? ' tocca' : '') +
    (tocchi.nato === v.id ? ' nato' : '') +
    '" data-id="' + v.id + '">' +
    '<button class="bc-su" data-add="' + v.id + '">' +
      (q > 0 ? '<span class="bc-fant">' + q + '</span>' : '') +
      iconaBar(v.name, v.em) +
      '<span class="bc-testi"><span class="bc-pr">' + eur(v.price) + '</span>' +
      '<span class="bc-nm">' + esc(v.name) + '</span></span></button>' +
    (aperta
      ? '<div class="bc-zone"><span class="bc-chip">' + q + '</span>' +
        '<button data-meno="' + v.id + '"' + (q <= 0 ? ' disabled' : '') + '>\u2212</button>' +
        '<button data-add="' + v.id + '">+</button></div>' +
        '<div class="bc-zone v"><span class="bc-chip">' + pg + '/' + q + '</span>' +
        '<button data-pmeno="' + v.id + '"' + (pg <= 0 ? ' disabled' : '') + '>\u2212</button>' +
        '<button data-ppiu="' + v.id + '"' + (pg >= q ? ' disabled' : '') + '>+</button></div>'
      : '') +
  '</div>';
}

/* Il velo: un pannello sovrapposto, incollato in basso, con dietro il
   resto della pagina sfocato. Si chiude toccando fuori o la X, e la
   pagina sotto non si muove di un pixel. */
let veloAperto = null;
function apriVelo(dentro, titolo) {
  chiudiVelo();
  const velo = el('div', 'bc-velo');
  const foglio = el('div', 'bc-foglio');
  const testa = el('div', 'bc-foglio-testa');
  testa.appendChild(el('h3', '', titolo || '\ud83e\uddee Resto'));
  const via = el('button', 'bc-via', '\u2715');
  via.onclick = chiudiVelo;
  testa.appendChild(via);
  foglio.appendChild(testa);
  foglio.appendChild(dentro);
  velo.appendChild(foglio);
  velo.onclick = (ev) => { if (ev.target === velo) chiudiVelo(); };
  document.body.appendChild(velo);
  veloAperto = velo;
  return velo;
}
function chiudiVelo() {
  if (!veloAperto) return;
  const v = veloAperto; veloAperto = null;
  if (!anima()) { v.remove(); return; }
  v.classList.add('via');
  setTimeout(() => v.remove(), 180);
}

/* ================= LA SCHEDA CHE VOLA =================
   Con Bar & Conto la scheda si stacca dalla lista e si mette al centro
   dello schermo, sopra tutto, con il resto sfocato dietro. Al suo posto
   resta un buco della stessa altezza, cosi' la lista non sussulta.
   Il volo e' un'animazione vera: parte dal punto esatto in cui stava. */
let volante = null;
/* MENTRE UNA SCHEDA VOLA NON SE NE TOCCA UN'ALTRA.
   Il volo dura mezzo secondo e in quel mezzo secondo il pannello sta
   cambiando padrone: due tocchi rapidi -- la figura e poi "Bar &
   Conto", o due schede diverse -- lo lasciavano a meta' strada, con
   veli appesi e pannelli vuoti. Mezzo secondo di sordita' non si nota;
   quello che restava a schermo si notava eccome. */
let voloOccupato = false;
function occupaVolo(quanto) {
  voloOccupato = true;
  clearTimeout(occupaVolo.t);
  occupaVolo.t = setTimeout(() => { voloOccupato = false; }, quanto || 520);
}

/* ============================================================
   TUTTO DENTRO LO SCHERMO, SENZA SCORRERE

   Il banner dei totali sta in fondo e NON si muove mai. E' la cifra
   che la cassiera cerca con la coda dell'occhio mentre parla col
   cliente: se cambia posto a ogni tocco -- si apre il guardaroba, si
   aggiunge una bibita, la scheda cresce e il banner scivola -- la si
   cerca ogni volta da capo, ed e' il modo piu' rapido per battere il
   numero sbagliato.

   Quindi il pannello non cresce piu' col contenuto: prende SEMPRE
   tutta l'altezza che ha a disposizione, e se il contenuto non ci sta
   si rimpicciolisce tutto insieme invece di uscire dal fondo. Prima
   aprendo il guardaroba in "+ Nuovo" il conto finiva 142 pixel sotto
   il bordo dello schermo, e non c'era modo di accorgersene se non
   scorrendo.

   Si usa `zoom` e non `transform: scale`: zoom cambia anche
   l'INGOMBRO, quindi il conto resta incollato in basso da solo. Con
   scale l'elemento continuerebbe a occupare la misura di prima e il
   fondo resterebbe dov'era, cioe' fuori. */

/* LA RIMPICCIOLITURA E' STATA TOLTA, e vale la pena dire perche'.
   Serviva a far entrare tutto senza scorrere. Ma il pannello e' UNO
   SOLO e vive in due posti -- "+ Nuovo" e dentro la scheda che vola --
   e in quei due posti l'altezza disponibile e' diversa: in "+ Nuovo"
   non veniva rimpicciolito quasi per niente, dentro la scheda scendeva
   a tre quarti. Risultato: le stesse identiche card si vedevano di due
   misure diverse a seconda di da dove le avevi aperte, e la griglia del
   bar cambiava perfino il numero di colonne -- perche' con lo zoom
   l'elemento si crede piu' largo di quanto e', e ce ne stanno di piu'.
   Fra "entra tutto senza scorrere" e "e' sempre la stessa schermata"
   vince la seconda: una cosa che cambia faccia a seconda di come ci sei
   arrivato costa piu' di uno scorrimento.
   Quello che RESTA e' l'altezza fissa del pannello: e' quella che tiene
   il conto incollato in fondo, e non ha niente a che fare con la
   scala. */

/* il respiro sotto e' quello di main: cosi' il pannello si ferma dove
   si fermerebbe comunque, safe-area del telefono compresa */
function respiroSotto() {
  const m = $('main');
  if (!m) return 10;
  return Math.max(10, Math.round(parseFloat(getComputedStyle(m).paddingBottom) || 10));
}

/* Quanto vuoto lasciare SOPRA la scheda che vola. Non e' decorazione:
   e' il bersaglio da toccare per chiudere tutto. Chi non trova la via
   d'uscita tocca fuori dal riquadro, e fuori dal riquadro ci deve
   essere abbastanza spazio da beccarlo senza mirare. */
function spazioSopra() {
  /* Quanto basta a beccarlo col pollice senza mirare, non un dito di
     piu': ogni pixel qui e' un pixel in meno per il pannello, e il
     pannello dentro la scheda deve venire grande quasi quanto in
     "+ Nuovo". Sotto ci sono comunque i fianchi e il fondo, che
     chiudono allo stesso modo. */
  return Math.round(Math.min(44, Math.max(32, window.innerHeight * 0.030)));
}


/* QUANTO E' ALTO IL PANNELLO, e dove finisce.
   Il conto in fondo (`pc-fondo`) e' di taglia fissa e sta incollato
   in basso; quello che avanza va al vano (`pc-scala`), che scorre solo
   se proprio non ci sta. Qui si fissano l'altezza e la larghezza una
   volta sola, prima che la scheda parta: se le misure arrivassero
   durante il volo, il contenuto si rimpaginerebbe a ogni fotogramma.
   Si misura col Parco a vista anche quando a video c'e' il bar, cosi'
   la misura non cambia da una linguetta all'altra. */
function adattaPannello(p, limiteSotto, cimaVoluta, largaVoluta) {
  if (!p || !p.isConnected) return 1;
  /* Se la vista che lo ospita e' nascosta non c'e' niente da misurare:
     un elemento nascosto risponde zero a tutto, e la misura che ne
     verrebbe fuori e' spazzatura scritta addosso al pannello. Si
     rimisura da solo quando la vista torna a galla. */
  if (!p.offsetParent && getComputedStyle(p).position !== 'fixed') return 1;
  const su = p.querySelector('.pc-scala');
  /* `flex: 1` ha flex-basis 0, che ignora l'altezza scritta a mano:
     va spento, se no il valore qui sotto non conta niente */
  p.style.flex = '0 0 auto';
  /* LA LARGHEZZA D'ARRIVO, SUBITO.
     Mentre la scheda vola la sua larghezza cresce di duecento pixel, e
     la griglia del bar si rimpagina a ogni fotogramma: i tasti
     scivolavano da una colonna all'altra per mezzo secondo, ed era la
     cosa piu' fastidiosa di tutta l'animazione. Dando al pannello fin
     dal primo fotogramma la larghezza che avra' alla fine, il
     contenuto e' impaginato una volta sola e la scheda gli cresce
     attorno (quello che sborda lo taglia l'overflow della scheda). */
  if (largaVoluta) p.style.width = Math.max(120, Math.round(largaVoluta)) + 'px';
  else p.style.width = '';
  /* si misura da dove COMINCIA: con altezza zero il pannello non
     sfonda niente, quindi la pagina non e' scorsa e il numero e' quello
     vero */
  const prima = p.style.height;          // quella che ha adesso, per il confronto qui sotto
  p.style.height = '0px';
  const cima = (cimaVoluta === undefined) ? p.getBoundingClientRect().top : cimaVoluta;
  const spazio = Math.floor(limiteSotto - cima);
  if (spazio < 160 || !su) { p.style.height = ''; p.style.flex = ''; return 1; }
  /* QUATTRO PIXEL DI TOLLERANZA, e non e' pigrizia.
     La stessa misura, rifatta a fine volo, puo' venire due o tre pixel
     diversa: arrotondamenti, un respiro che stava ancora finendo la
     sua transizione. Applicarla vuol dire far sussultare il conto in
     fondo proprio nell'istante in cui la scheda si ferma -- il momento
     in cui l'occhio ci sta guardando. Sotto i quattro pixel si tiene
     quella di prima: nessuno si accorge dello scarto, tutti si
     accorgono del sussulto. Le misure che contano davvero -- il tablet
     girato, la tastiera che si apre -- valgono centinaia di pixel e
     passano lo stesso. */
  const gia = parseFloat(prima) || 0;
  p.style.height = (gia && Math.abs(gia - spazio) <= 4 ? gia : spazio) + 'px';

  /* si misura col PARCO a vista, che e' lo stato piu' alto. Fra il
     nascondere e il rimettere a posto non c'e' nessun disegno a
     schermo, quindi non si vede niente lampeggiare. */
  const parco = p.querySelector('.pc-parco');
  const bar = p.querySelector('.pc-bar');
  const cambio = parco && bar && parco.classList.contains('hidden');
  if (cambio) { bar.classList.add('hidden'); parco.classList.remove('hidden'); }

  /* il riquadro delle persone tiene il posto del guardaroba anche da
     chiuso: da nascosto e' largo zero e non si potrebbe misurare */
  /* IL POSTO RISERVATO AL GUARDAROBA NON C'E' PIU'.
     Serviva a non far ballare la RIMPICCIOLITURA aprendo e chiudendo
     l'armadio: si teneva il posto anche da chiuso, cosi' la scala non
     cambiava. Tolta la rimpicciolitura e' rimasta solo la spesa --
     quattrocento pixel di vuoto appena si metteva un riferimento, che
     e' esattamente cio' che faceva scorrere il pannello. Adesso il
     riquadro e' alto quanto quello che contiene, e quando l'armadio si
     apre gli fanno posto le due card e la fascia del tempo (vedi
     `veste`). */

  /* Quando il contenuto non ci sta, il vano scorre. Va DETTO, pero' --
     un riquadro tagliato a meta' sul bordo sembra un errore, non
     "c'e' dell'altro" -- e ci pensa la sfumatura, dalla parte giusta. */
  sfuma(su);
  /* il bancone del bar ha la sua sfumatura: scorre lui, non il vano */
  if (bar) bar.classList.toggle('scorre', bar.scrollHeight > bar.clientHeight + 2);

  if (cambio) { parco.classList.add('hidden'); bar.classList.remove('hidden'); }
  return 1;
}

/* Rimette a misura il pannello dovunque si trovi: in "+ Nuovo" arriva
   fino in fondo allo schermo, dentro la scheda che vola fino in fondo
   alla scheda. */
function adattaTutto() {
  const p = PAN.root;
  if (!p || !p.isConnected) return;
  if (volante && volante.card.contains(p)) {
    const card = volante.card;
    card.scrollTop = 0;
    const dentro = card.querySelector('.e-dentro');
    const respiro = dentro ? (parseFloat(getComputedStyle(dentro).paddingBottom) || 0) : 0;
    /* Cima e fondo si prendono da dove la scheda ANDRA', non da dove
       sta adesso. Quanto le sta sopra al pannello -- l'intestazione col
       nome, i respiri -- non cambia mentre vola, quindi basta sommarlo
       al vuoto in cima per sapere subito dove finira'. */
    /* La larghezza imposta al giro precedente va TOLTA prima di
       misurare i fianchi, se no si misura se stessa: il pannello
       restava largo quanto lo schermo di prima e sbordava dalla scheda
       ogni volta che la finestra si stringeva. */
    p.style.width = '';
    const rc = card.getBoundingClientRect();
    const sopraAlPannello = p.getBoundingClientRect().top - rc.top;
    /* i respiri ai fianchi non cambiano mentre la scheda vola: quello
       che cambia e' solo la larghezza della scheda */
    const fianchi = Math.round(rc.width - p.getBoundingClientRect().width);
    adattaPannello(p, window.innerHeight - respiroSotto() - respiro,
      spazioSopra() + sopraAlPannello, (volante.larg || rc.width) - fianchi);
  } else {
    adattaPannello(p, window.innerHeight - respiroSotto());
  }
}

/* Girando il tablet o comparendo la tastiera cambia tutto: la scheda
   che vola si rimette in mezzo e il pannello si rimisura. */
let attesaMisura = null;
function rimisura() {
  clearTimeout(attesaMisura);
  attesaMisura = setTimeout(() => {
    if (volante) {
      const card = volante.card;
      /* la larghezza si riprende dal SEGNAPOSTO, che nella lista si e'
         gia' riadattato allo schermo nuovo. Quella di partenza e' la
         misura di prima di girare il tablet: tenerla voleva dire una
         scheda stretta come in verticale su tutto l'orizzontale. */
      const buco = volante.buco.getBoundingClientRect().width || volante.da.width;
      /* piu' i respiri ai fianchi, come alla partenza: il segnaposto e'
         largo quanto la scheda nella lista, e il pannello dentro deve
         restare della misura che ha in "+ Nuovo" */
      const larg = Math.min(Math.max(buco + num(volante.fianchi, 8), 320), window.innerWidth - 20);
      volante.larg = larg;
      const cima = spazioSopra();
      /* Girare il tablet non e' un volo: la scheda ci si trova gia',
         non ci arriva. Con la transizione accesa la misura la
         prenderebbe a meta' strada e il conto finirebbe fuori. */
      card.style.transition = 'none';
      card.style.left = Math.round((window.innerWidth - larg) / 2) + 'px';
      card.style.top = cima + 'px';
      card.style.width = larg + 'px';
      card.style.height = (window.innerHeight - cima - respiroSotto()) + 'px';
      void card.offsetWidth;
      card.style.transition = '';
    }
    adattaTutto();
    /* Un secondo giro poco dopo. Girando il tablet la finestra cambia
       misura prima che il resto si sia riassestato -- barra del browser
       che entra o esce, tastiera che sparisce -- e la prima misura
       prende un'altezza di passaggio. */
    setTimeout(adattaTutto, 320);
  }, 90);
}
window.addEventListener('resize', rimisura);
window.addEventListener('orientationchange', rimisura);

function alza(card, misura) {
  occupaVolo();
  if (volante) posa(volante.card);
  const r = misura || card.getBoundingClientRect();

  const buco = el('div', 'segnaposto');
  buco.style.height = r.height + 'px';
  card.parentNode.insertBefore(buco, card);

  const velo = el('div', 'velo-scheda');
  document.body.appendChild(velo);

  card.classList.add('vola');
  card.style.left = r.left + 'px';
  card.style.top = r.top + 'px';
  card.style.width = r.width + 'px';
  /* parte dall'altezza che aveva: senza questo cresceva di colpo,
     tutta in un fotogramma, e si vedeva uno scatto */
  card.style.maxHeight = 'none';
  card.style.height = Math.round(r.height) + 'px';

  /* IL PANNELLO DEVE VENIRE LARGO COME IN "+ NUOVO".
     E' lo stesso pannello, e se qui viene un po' piu' stretto la
     griglia del bar cambia numero di colonne e le stesse card si
     vedono di due misure a seconda di da dove le hai aperte.
     La misura giusta si ricava dalla scheda di partenza: le due viste
     sono larghe uguali, quindi la scheda nella lista misura quanto il
     pannello in "+ Nuovo". Va solo aggiunto quello che la scheda si
     tiene per se' ai fianchi, e che in "+ Nuovo" non c'e'.
     ("+ Nuovo" non lo si puo' misurare direttamente: mentre si guarda
     la lista e' nascosto, e da nascosto un elemento e' largo zero.)
     Si sa GIA' adesso, prima di partire: serve al pannello per
     impaginarsi una volta sola invece che a ogni fotogramma. */
  const pan = PAN.root;
  let fianchi = 8;
  if (pan && card.contains(pan)) {
    pan.style.width = '';                 // se no si misura il volo di prima
    const largaOra = card.getBoundingClientRect().width || r.width;
    fianchi = Math.max(0, Math.round(largaOra - pan.getBoundingClientRect().width));
  }
  const largArrivo = Math.min(Math.max(r.width + fianchi, 320), window.innerWidth - 20);
  volante = { card: card, buco: buco, velo: velo, da: r, larg: largArrivo, fianchi: fianchi };
  velo.onclick = () => posa(card);
  /* il vuoto in cima dice a cosa serve: senza scritta e' solo sfocato,
     e chi non trova l'uscita resta li' a cercare una X */
  velo.appendChild(el('div', 'velo-esci', '\u2715  Tocca qui per chiudere'));

  /* il browser deve "vedere" la posizione di partenza prima di
     ricevere quella d'arrivo, altrimenti salta senza animare */
  void card.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    velo.classList.add('on');
    const larg = volante ? volante.larg : Math.min(Math.max(r.width, 320), window.innerWidth - 20);
    const cima = spazioSopra();
    card.style.left = Math.round((window.innerWidth - larg) / 2) + 'px';
    card.style.top = cima + 'px';
    card.style.width = larg + 'px';
    /* SEMPRE fino in fondo, qualunque cosa ci sia dentro. Prima puntava
       all'altezza del contenuto e la scheda si rimisurava a ogni tocco:
       il banner dei totali saliva e scendeva sotto le dita. Adesso il
       riquadro sta fermo e a muoversi e' semmai la scala di quello che
       c'e' dentro. */
    card.style.height = (window.innerHeight - cima - respiroSotto()) + 'px';
    /* LA MISURA SI PRENDE UNA VOLTA SOLA, appena partita.
       Ce n'era una seconda a sipario fermo, a mezzo secondo: serviva ai
       tempi in cui il contenuto si rimpiccioliva e la scala andava
       calcolata a scheda ferma. Adesso il pannello nasce gia' della sua
       misura, e quella seconda misura tornava tre o quattro pixel
       diversa -- arrotondamenti -- e li applicava ESATTAMENTE
       nell'istante in cui la scheda si ferma: il conto in fondo faceva
       un sussulto proprio dove l'occhio stava guardando.
       Meglio quattro pixel in meno per sempre che quattro pixel di
       scatto una volta: i primi non li vede nessuno. */
    setTimeout(() => { if (volante && volante.card === card) adattaTutto(); }, 60);
  }));
}

function posa(card) {
  if (!volante || volante.card !== card) return;
  occupaVolo();
  const v = volante;
  volante = null;
  const rif = cardRefs.get(card.dataset.id);
  const r = v.buco.getBoundingClientRect();
  v.velo.classList.remove('on');
  /* Scende FINO alla misura del buco: cosi' arriva gia' della taglia
     giusta e nessuno si sposta quando torna in fila. */
  card.style.left = r.left + 'px';
  card.style.top = r.top + 'px';
  card.style.width = r.width + 'px';
  card.style.height = Math.round(r.height) + 'px';
  /* La scala se ne va SUBITO: scendere rimpicciolito e poi scattare a
     grandezza naturale una volta atterrato si vede benissimo.
     Ma solo se il pannello sta ANCORA qui dentro: chiudendo una scheda
     per aprirne un'altra, questa scende mezzo secondo dopo, e senza il
     controllo si portava via la misura del pannello che nel frattempo
     era gia' passato all'altra. */
  if (PAN.root && card.contains(PAN.root)) {
    /* L'ALTEZZA RESTA QUELLA FINO A TERRA.
       Toglierla qui voleva dire che il pannello si accorciava insieme
       alla scheda: il contenuto si accartocciava e il conto in fondo
       risaliva a rincorrere il bordo. Tenendola, la scheda cala e il
       contenuto le scivola sotto -- lo taglia il bordo, che e' come
       funziona una cosa che si chiude. Si toglie una volta atterrata,
       quando il pannello torna al suo posto e si rimisura. */
    PAN.root.style.width = '';
    const su = PAN.root.querySelector('.pc-scala');
    if (su) {
      su.classList.remove('dasu', 'dagiu');
      /* MENTRE SCENDE, IL VANO SI ACCORCIA FINO A ZERO e il contenuto
         resta lungo com'era: senza questo, a OGNI chiusura compariva
         la barra di scorrimento per mezzo secondo, e il contenuto si
         accartocciava invece di scivolare via sotto il bordo. Torna
         com'era quando il pannello si rimette a posto. */
      su.style.overflow = 'hidden';
      su.scrollTop = 0;
    }
  }
  const fine = () => {
    /* il pannello si chiude SOLO adesso: chiudendolo alla partenza
       spariva a mezz'aria e si vedeva un salto */
    if (rif && rif.payPanel) {
      rif.payPanel.classList.add('hidden');
      rif.payBtn.classList.remove('on');
    }
    card.classList.remove('vola');
    card.style.left = card.style.top = card.style.width = card.style.height = card.style.maxHeight = '';
    if (v.buco.parentNode) v.buco.remove();
    if (v.velo.parentNode) v.velo.remove();
    if (PAN.root) { PAN.root.style.height = ''; PAN.root.style.flex = ''; }
    const su = PAN.root && PAN.root.querySelector('.pc-scala');
    if (su) su.style.overflow = '';     // atterrata: torna a poter scorrere
    riportaPannello(card);
  };
  const tempo = anima() ? 500 : 0;
  setTimeout(fine, tempo);
}

/* Posa senza volo: serve quando si cambia vista, dove l'animazione
   non si vedrebbe comunque e lascerebbe solo roba appesa. */
/* Il pannello e' uno solo: quando smette di servire a un ingresso torna
   dentro "+ Nuovo" a occuparsi del gruppo nuovo. Se lo lasciassi dentro
   la scheda, aprendo "+ Nuovo" non ci sarebbe piu' niente. */
function riportaPannello(card) {
  if (!PAN.root || !PAN.ingresso) return;
  /* Solo se il pannello sta ANCORA dentro questa scheda. Chiudendone una
     per aprirne un'altra, la prima si posa con mezzo secondo di ritardo:
     senza questo controllo, a volo finito si riprendeva il pannello che
     nel frattempo era gia' passato alla seconda scheda. */
  if (card && !card.contains(PAN.root)) return;
  const casa = $('#view-new');
  if (casa) casa.appendChild(PAN.root);
  PAN.ingresso = null;
  PAN.conto = draft;
  PAN.cat = 'Parco';
  const box = PAN.root.querySelector('.pc-people');
  box.dataset.sig = ''; box.dataset.apri = '';
  aggiornaPannello();
}

function posaSubito(card) {
  if (!volante || volante.card !== card) return;
  const v = volante;
  volante = null;
  const rif = cardRefs.get(card.dataset.id);
  if (rif && rif.payPanel) { rif.payPanel.classList.add('hidden'); rif.payBtn.classList.remove('on'); }
  card.classList.remove('vola');
  card.style.left = card.style.top = card.style.width = card.style.height = card.style.maxHeight = '';
  if (v.buco.parentNode) v.buco.remove();
  if (v.velo.parentNode) v.velo.remove();
  riportaPannello(card);
}

/* Modifica: la lista scivola a sinistra e arriva "Nuovo", cosi' si
   capisce dove si sta andando invece di trovarsi altrove di colpo. */
function anima() {
  return settings.animazioni !== false;
}

/* ---------- schermo intero ----------
   Sul tablet la barra di sistema copriva la parte bassa dell'app, e
   proprio li' adesso c'e' il conto. A schermo intero quella barra
   sparisce. Il browser lo concede solo dopo un tocco, quindi se
   l'interruttore e' acceso ci si prova al primo tocco utile. */
function schermoIntero(acceso) {
  try {
    if (acceso && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      const p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } else if (!acceso && document.fullscreenElement && document.exitFullscreen) {
      const p = document.exitFullscreen();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) { /* qualche browser non lo permette: pazienza */ }
}
function preparaSchermoIntero() {
  if (!settings.schermoIntero || document.fullscreenElement) return;
  const alPrimoTocco = () => {
    document.removeEventListener('pointerdown', alPrimoTocco);
    schermoIntero(true);
  };
  document.addEventListener('pointerdown', alPrimoTocco, { once: true });
}

/* una scheda aperta per volta: due aperte non ci stanno sullo schermo */
function chiudiSchede(tranne) {
  cardRefs.forEach((r, id) => {
    if (id === tranne || !r.card.isConnected) return;
    if (volante && volante.card === r.card) posa(r.card);
    r.card.classList.remove('aperto');
  });
}

/* Le scelte del bracciale, aperte accanto al pallino.
   Il colore giusto per l'ORA D'INGRESSO e' gia' segnalato. */
/* LA RUOTA DEI COLORI.
   Un cerchio con tutte le tinte in giro e i grigi in mezzo: si tocca
   dove serve e il colore e' quello. Niente cursori di saturazione,
   niente numeri esadecimali, niente "personalizza" -- al banco la
   domanda e' "di che colore era la maglietta?", non "che valore HSL
   aveva".
   Il cerchio e' disegnato dal browser (due sfumature sovrapposte) e il
   colore si RICAVA dal punto toccato con la stessa formula: quello che
   si vede e quello che si prende sono la stessa cosa per costruzione,
   non due conti che potrebbero divergere. */
function coloreDelPunto(dx, dy, raggio) {
  const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / raggio);
  let ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;   // 0 in cima, come il disegno
  if (ang < 0) ang += 360;
  const h = Math.round(ang) % 360;
  const s = Math.round(dist * 100);
  return hslInEsa(h, s, 50);
}
function hslInEsa(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  const due = v => v.toString(16).padStart(2, '0');
  return '#' + due(f(0)) + due(f(8)) + due(f(4));
}

function apriRuota(tasto, coloreOra, scegli) {
  document.querySelectorAll('.ruota-box').forEach(x => x.remove());
  const box = el('div', 'ruota-box');
  const cerchio = el('div', 'ruota-cerchio');
  const punta = el('span', 'ruota-punta');
  cerchio.appendChild(punta);
  box.appendChild(cerchio);

  /* la striscia del chiaro-scuro: la ruota da sola non sa fare il
     bianco, il nero e i grigi, che sui vestiti servono sempre */
  const scala = el('div', 'ruota-scala');
  [0, 18, 35, 50, 65, 82, 100].forEach(l => {
    const b = el('button');
    b.style.background = hslInEsa(0, 0, l);
    b.onclick = () => { metti(hslInEsa(0, 0, l)); };
    scala.appendChild(b);
  });
  box.appendChild(scala);

  const anteprima = el('div', 'ruota-ora');
  const pastiglia = el('span', 'p');
  anteprima.appendChild(pastiglia);
  const nome = el('b');
  anteprima.appendChild(nome);
  box.appendChild(anteprima);

  let scelto = coloreOra || '#8A8AA0';
  const metti = (colore) => {
    scelto = colore;
    pastiglia.style.background = colore;
    nome.textContent = (typeof AV !== 'undefined' && AV.colorName) ? AV.colorName(colore, 0) : colore;
    scegli(colore);
  };
  metti(scelto);

  const prendi = (ev) => {
    const r = cerchio.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left - r.width / 2;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top - r.height / 2;
    punta.style.left = (r.width / 2 + Math.max(-r.width / 2, Math.min(x, r.width / 2))) + 'px';
    punta.style.top = (r.height / 2 + Math.max(-r.height / 2, Math.min(y, r.height / 2))) + 'px';
    metti(coloreDelPunto(x, y, r.width / 2));
  };
  let giu = false;
  cerchio.addEventListener('pointerdown', (ev) => {
    giu = true;
    /* la cattura del dito serve a non perdere il colore se si esce dal
       cerchio trascinando -- ma se il browser la rifiuta non deve
       portarsi via anche la scelta: prima si prende il colore, poi si
       prova a catturare */
    prendi(ev);
    try { cerchio.setPointerCapture(ev.pointerId); } catch (e) { /* pazienza */ }
  });
  cerchio.addEventListener('pointermove', (ev) => { if (giu) prendi(ev); });
  cerchio.addEventListener('pointerup', () => { giu = false; });

  document.body.appendChild(box);
  alzaMenu(box, tasto);
  chiudiFuoriDel(box, tasto);
}

/* come chiudiFuori, ma butta via l'elemento invece di nasconderlo */
function chiudiFuoriDel(chi, tasto) {
  const via = (ev) => {
    if (chi.contains(ev.target) || tasto.contains(ev.target)) return;
    chi.remove();
    document.removeEventListener('pointerdown', via, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', via, true), 0);
}

/* SOPRA TUTTO, NON DENTRO.
   Il menu nasce dentro la fascia del tempo, che sta dentro il vano che
   scorre: e li' dentro un riquadro che sborda viene TAGLIATO dal bordo
   del vano, e mezza tavolozza dei bracciali spariva sotto il taglio.
   Non si puo' risolvere con lo z-index -- un contenitore che ritaglia
   ritaglia e basta -- quindi il menu esce dal vano: diventa `fixed` e
   si mette da solo sotto il tasto che l'ha aperto, in coordinate di
   schermo. Resta dov'e' nel codice (e' roba del bracciale, non della
   pagina), cambia solo il sistema di riferimento.
   Si rimette in riga se lo schermo e' stretto, e se sotto non ci sta
   si apre verso l'alto. */
function alzaMenu(men, tasto) {
  men.style.position = 'fixed';
  men.style.right = 'auto';
  men.style.top = '0px';
  men.style.left = '0px';
  /* si misura DOPO averlo messo a video, se no e' largo zero */
  const t = tasto.getBoundingClientRect();
  const m = men.getBoundingClientRect();
  const margine = 8;
  let x = t.right - m.width;                       // allineato a destra col tasto
  x = Math.max(margine, Math.min(x, window.innerWidth - m.width - margine));
  let y = t.bottom + 6;
  if (y + m.height > window.innerHeight - margine) y = t.top - m.height - 6;
  y = Math.max(margine, y);
  men.style.left = Math.round(x) + 'px';
  men.style.top = Math.round(y) + 'px';
}

/* Chiude `chi` al primo tocco fuori da `zona`. Sta a parte perche'
   e' il gesto che ci si aspetta da qualunque cosa che si apre: senza,
   resta aperta finche' non si ritocca il tasto, e chi la lascia aperta
   se la ritrova sopra le dita al tocco dopo. */
function chiudiFuori(chi, zona) {
  const via = (ev) => {
    if (zona.contains(ev.target)) return;
    chi.classList.add('hidden');
    document.removeEventListener('pointerdown', via, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', via, true), 0);
}

function apriMenuBracciale(ancora, entry) {
  document.querySelectorAll('.wrist-menu').forEach(m => m.remove());
  const menu = el('div', 'wrist-menu');
  menu.appendChild(el('div', 'wm-k', '\ud83c\udf97\ufe0f Bracciale'));
  const riga = el('div', 'wrist-row');
  menu.appendChild(riga);
  /* la stessa identica riga di "Nuovo": stessi tasti, stesso ordine */
  costruisciBracciali(riga, (hex, custom) => {
    entry.braceletColor = hex;
    entry.braceletCustom = custom;
    saveEntries();
    sincronizzaBracciali(riga, entry.startTime, entry.braceletColor, entry.braceletCustom);
    aggiornaPallino(entry);
  });
  sincronizzaBracciali(riga, entry.startTime, entry.braceletColor, entry.braceletCustom);

  ancora.appendChild(menu);
  const chiudi = (ev) => {
    if (menu.contains(ev.target)) return;
    menu.remove();
    document.removeEventListener('pointerdown', chiudi, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', chiudi, true), 0);
}

/* Ritinge il pallino sulla riga senza rifare la scheda: se la
   ridisegnassi, il menu aperto sparirebbe a ogni colore provato. */
function aggiornaPallino(entry) {
  const r = cardRefs.get(entry.id);
  if (!r || !r.wrist) return;
  const slot = braceletFor(entry.startTime);
  const col = entry.braceletCustom ? entry.braceletColor : (slot ? slot.color : null);
  r.wrist.classList.toggle('vuoto', !col);
  r.wrist.style.background = col || '';
}

/* chiude i pannelli aperti; con "tranne" si risparmia una scheda */
function chiudiPannelli(tranne) {
  cardRefs.forEach((r, id) => {
    if (id === tranne || !r.card.isConnected) return;
    if (r.payPanel && !r.payPanel.classList.contains('hidden')) {
      r.payPanel.classList.add('hidden');
      r.payBtn.classList.remove('on');
      if (volante && volante.card === r.card) posa(r.card);
    }
  });
}

/* chiude l'ingresso; se restano soldi da prendere, chiede conferma */
function chiudiIngresso(entry) {
  const fine = () => {
    /* il prezzo si ferma qui: da adesso questo conto non cambia piu',
       qualunque cosa succeda al listino */
    const d = dueOf(entry);
    entry.costoFinale = { parco: d.park, bar: d.bar };
    entry.status = 'closed';
    entry.closedAt = Date.now();
    saveEntries();
    /* prima si accartoccia, poi sparisce: cosi' si vede QUALE se n'e'
       andata invece di trovarne una in meno */
    const r = cardRefs.get(entry.id);
    /* se la scheda stava volando col conto aperto va posata ADESSO: la
       lista sta per essere rifatta da zero e il pannello, che vive
       dentro la scheda, verrebbe buttato via col resto -- lasciando per
       giunta il velo sfocato appeso sullo schermo */
    if (volante) posaSubito(volante.card);
    const dopo = () => {
      buildActiveView(); updateBadge();
      fatto('Uscita registrata \u2705', () => {
        entry.status = 'active';
        delete entry.closedAt;
        delete entry.costoFinale;      // il prezzo torna a muoversi col listino
        saveEntries();
        buildActiveView();
        updateBadge();
        toast('Rimesso dentro \u21a9\ufe0e');
      });
    };
    if (r && r.card.isConnected && anima() && !volante) {
      r.card.style.height = r.card.getBoundingClientRect().height + 'px';
      requestAnimationFrame(() => {
        r.card.classList.add('esce');
        setTimeout(dopo, 320);
      });
    } else dopo();
  };
  /* SPARIRE E' UN'ALTRA COSA DA USCIRE.
     Uscire vuol dire "ha finito": va in archivio e resta nel registro
     della giornata, coi suoi soldi. Eliminare vuol dire "questo non e'
     mai esistito" -- un ingresso sbagliato, una prova, un doppione --
     e allora deve sparire anche dai conti della giornata, se no la
     cassa della sera non torna con quello che c'e' nel cassetto.
     Sono due strade diverse e stanno una accanto all'altra, scritte,
     invece che nascoste dietro un tocco ripetuto. */
  const d = dueOf(entry);
  fogliUscita(entry, d, fine);
}

/* Il calcolo del resto: si toccano i tagli che la persona mette in
   mano (20 + 10) e dice quanto ridare. Chi preferisce battere la cifra
   ha il tastierino. */
function pannelloResto(entry, dovuto, onIncassa) {
  const box = el('div', 'resto-box');
  let dato = 0;
  /* quanti pezzi per ogni taglio: due da venti, uno da cinque... Serve
     a vedere COSA ti ha messo in mano, non solo quanto fa. */
  const conta = {};
  let tastierino = false;
  let digitato = '';

  const eurNum = c => (c / 100).toFixed(2).replace('.', ',') + ' \u20ac';
  const TAGLI = [[5000, '50 \u20ac'], [2000, '20 \u20ac'], [1000, '10 \u20ac'], [500, '5 \u20ac'],
                 [200, '2 \u20ac'], [100, '1 \u20ac'], [50, '50c'], [20, '20c']];

  function disegna() {
    box.innerHTML = '';
    const cent = Math.round(dovuto * 100);
    const avanza = dato - cent;

    const alto = el('div', 'resto-alto');
    const a1 = el('div');
    a1.appendChild(el('span', 'k', 'ti ha dato'));
    a1.appendChild(el('span', 'v num', eurNum(dato)));
    alto.appendChild(a1);
    /* la seconda colonna c'e' SEMPRE, anche vuota: se comparisse al
       primo taglio toccato, il pannello si allargherebbe sotto le dita
       proprio mentre conti i soldi */
    const a2 = el('div', 'da' + (dato > 0 ? '' : ' vuota'));
    a2.appendChild(el('span', 'k', avanza >= 0 ? 'resto da dare' : 'mancano ancora'));
    a2.appendChild(el('span', 'v num', eurNum(Math.abs(avanza))));
    alto.appendChild(a2);
    box.appendChild(alto);

    if (!tastierino) {
      const g = el('div', 'resto-tagli');
      TAGLI.forEach(t => {
        const n = conta[t[0]] || 0;
        const b = el('button', (t[0] < 500 ? 'mon' : '') + (n ? ' preso' : ''));
        /* la banconota disegnata coi colori veri: al banco si riconosce
           il taglio dal colore prima che dal numero. Il valore sta gia'
           scritto sopra, quindi niente didascalia che lo ripeta. */
        const dis = (typeof iconaSoldi === 'function' ? iconaSoldi(t[0]) : '');
        b.innerHTML = (dis || '<span>' + t[1] + '</span>') +
          (n ? '<span class="quanti">' + n + '</span>' : '');
        b.onclick = (ev) => {
          /* il numero in alto toglie, il resto del tasto aggiunge */
          if (ev.target.closest('.quanti')) {
            if (n <= 0) return;
            conta[t[0]] = n - 1; dato = Math.max(0, dato - t[0]);
          } else {
            conta[t[0]] = n + 1; dato += t[0];
          }
          disegna();
        };
        g.appendChild(b);
      });
      box.appendChild(g);
    } else {
      const d = el('div', 'resto-pad');
      const batti = (c) => {
        if (c === 'c') digitato = digitato.slice(0, -1);
        else if (digitato.length < 6) digitato += c;
        dato = parseInt(digitato || '0', 10);
        disegna();
      };
      ['1','2','3','4','5','6','7','8','9','00','0','c'].forEach(c => {
        const b = el('button', c === 'c' || c === '00' ? 'min' : '');
        b.textContent = c === 'c' ? '\u232b' : c;
        b.onclick = () => batti(c);
        d.appendChild(b);
      });
      box.appendChild(d);
    }

    const azioni = el('div', 'resto-azioni');
    const cambia = el('button', 'btn btn-sm');
    cambia.innerHTML = tastierino ? '\ud83d\udcb6 Tagli' : '\u2328\ufe0f Cifra esatta';
    cambia.onclick = () => {
      /* col tastierino la cifra la scrivi tu: il conto dei pezzi non
         avrebbe piu' senso, quindi si azzera */
      tastierino = !tastierino; digitato = ''; dato = 0;
      Object.keys(conta).forEach(k => delete conta[k]);
      disegna();
    };
    azioni.appendChild(cambia);
    const zero = el('button', 'btn btn-sm', '\u21ba Azzera');
    zero.onclick = () => {
      dato = 0; digitato = '';
      Object.keys(conta).forEach(k => delete conta[k]);
      disegna();
    };
    azioni.appendChild(zero);
    /* Il Resto e' un CALCOLO, non una cassa: dice quanto ridare e
       basta. Chiudendolo non succede niente al conto -- si torna alla
       schermata di prima e li' si decide, con "Paga tutto" o con
       Registra. Prima aveva un tasto "Incassa" che muoveva i soldi da
       qui dentro, e questo non e' il posto giusto per farlo. */
    if (typeof onIncassa === 'function') {
      const ok = el('button', 'btn btn-ok');
      const preso = Math.min(dato, cent) / 100;
      ok.textContent = dato > 0
        ? 'Incassa ' + eurNum(Math.min(dato, cent)) + (avanza > 0 ? ' · rendi ' + eurNum(avanza) : '')
        : 'Incassa';
      ok.disabled = dato <= 0;
      ok.onclick = () => { if (dato > 0) { box.remove(); onIncassa(preso); } };
      azioni.appendChild(ok);
    } else {
      const via = el('button', 'btn btn-ok', 'Ho capito');
      via.onclick = () => chiudiVelo();
      azioni.appendChild(via);
    }
    box.appendChild(azioni);
  }
  disegna();
  return box;
}

/* voci del conto: una riga per bambino, per crazy e per consumazione */
/* aggiorna i numeri di una scheda senza ricostruirla */
/* I soldi con l'etichetta sopra il numero: dice sempre COSA e' quella
   cifra, che era la cosa ambigua della colonna a destra. */
function soldiDi(r, entry, due) {
  const resta = due.total;
  const pagato = due.parkPaid + due.barPaid;
  if (resta <= 0) {
    r.soldiK.textContent = 'pagato';
    r.dueVal.textContent = '\u2713';
  } else {
    r.soldiK.textContent = pagato > 0 ? 'restano' : 'da pagare';
    r.dueVal.textContent = eur(resta);
  }
  r.soldi.classList.toggle('pagato', resta <= 0);
}

function syncCard(entry) {
  const r = cardRefs.get(entry.id);
  if (!r) return;
  const due = dueOf(entry);
  const kids = clamp(entry.children, 0, 1e6);
  const crazy = clamp(entry.crazyJumping, 0, 1e6);

  r.sKids.val.textContent = kids;
  if (r.bimbiV) r.bimbiV.textContent = kids;
  if (r.crzV) { r.crzV.textContent = crazy; r.crz.classList.toggle('hidden', crazy <= 0); }
  r.sCrazy.val.textContent = crazy;
  r.sTime.val.textContent = entry.payLater ? '\u2014' : entry.durationMinutes + '\u2032';
  r.sKids.minus.disabled = kids <= 0;
  r.sCrazy.minus.disabled = crazy <= 0;
  r.sTime.minus.disabled = num(entry.durationMinutes, 0) <= 5;

  soldiDi(r, entry, due);

  /* se il conto e' aperto lo riallineo: i prezzi possono essere
     cambiati sotto (tempo esteso, un bambino in piu') */
  if (r.payPanel && !r.payPanel.classList.contains('hidden') && PAN.ingresso === entry) {
    aggiornaPannello();
  }

  r.range.innerHTML = '<span class="fr">dalle</span>' + fmtTime(entry.startTime) +
    '<span class="fr">alle</span>' + (entry.payLater ? '?' : fmtTime(endTimeOf(entry)));
  updateBadge();
}

/* solo quando cambia la composizione della scheda (persone) */
function redrawCard(entry) {
  const r = cardRefs.get(entry.id);
  if (!r || !r.card.parentNode) return;
  const era = r.card.classList.contains('aperto');
  /* Se il conto e' aperto, il pannello vive DENTRO questa scheda: qui
     sotto la scheda viene sostituita, e il pannello sparirebbe con lei
     (succedeva cambiando il vestito di una persona dal conto). Lo si
     posa prima, e si riapre dopo. */
  const conPannello = !!(PAN.root && r.card.contains(PAN.root));
  if (conPannello) {
    if (volante && volante.card === r.card) posaSubito(r.card);
    else riportaPannello(r.card);
  }
  const fresh = entryCard(entry);
  r.card.replaceWith(fresh);
  if (era) fresh.classList.add('aperto');
  if (conPannello) {
    const nuovo = cardRefs.get(entry.id);
    if (nuovo) nuovo.payBtn.click();
  }
  tick();
}
/* ridisegna ma lascia aperto il pannello che si stava usando */
/* ══════════════════════════════════════════════════════════
   L'AVVISO CHE VIENE A CERCARTI
   Finora un gruppo che sforava diventava rosso nella lista -- e se in
   quel momento stavi registrando un ingresso o battendo una birra, non
   lo sapevi. Il colore aspetta che tu guardi; qui e' il contrario.
   Regole che si e' dato:
     - compare IN ALTO, sopra ogni cosa, e se ne va da solo dopo otto
       secondi: e' un avviso, non una domanda. Non blocca niente e non
       chiede di essere chiuso.
     - dice CHI, non "un gruppo": al banco serve il nome, se no si
       guardano quindici schede una per una.
     - toccandolo ti porta li' e la scheda BATTE: la stessa
       evidenziazione che c'e' gia' quando si tocca la figura, che e'
       un linguaggio che l'app parla di suo.
     - una volta per gruppo. Un avviso che si ripete ogni secondo si
       impara a ignorare, e allora tanto vale non metterlo.
   ══════════════════════════════════════════════════════════ */
const gaAvvisati = new Set();
/* CHI ERA GIA' SFORATO PRIMA CHE APRISSI L'APP NON E' UNA NOTIZIA.
   Riaprendo la tavoletta la mattina dopo, o dopo un ricaricamento, i
   gruppi rimasti aperti sono tutti fuori tempo: mostrarli come "appena
   sforato" sarebbe una bugia e una raffica di avvisi. Si segnano come
   gia' visti, e da li' in poi si avvisa solo chi sfora davvero adesso. */
function avvisiGiaVisti() {
  const ora = Date.now();
  lista(entries).forEach(e => {
    if (e.status === 'active' && !e.payLater && endTimeOf(e) - ora <= 0) gaAvvisati.add(e.id);
  });
}

function avvisaSforato(entry) {
  if (gaAvvisati.has(entry.id)) return;
  gaAvvisati.add(entry.id);
  document.querySelectorAll('.avviso').forEach(x => x.remove());

  const a = el('button', 'avviso');
  const em = el('span', 'av-em', '\u23f0');
  a.appendChild(em);
  const t = el('span', 'av-tx');
  t.appendChild(el('b', null, nomiDi(entry)));
  const q = clamp(entry.children, 0, 1e6);
  t.appendChild(el('span', null, 'ha sforato il tempo \u00b7 ' + q + (q === 1 ? ' bambino' : ' bambini')));
  a.appendChild(t);
  a.appendChild(el('span', 'av-vai', 'vai \u203a'));

  a.onclick = () => {
    a.remove();
    mostraSforato(entry);
  };
  document.body.appendChild(a);
  requestAnimationFrame(() => a.classList.add('su'));
  setTimeout(() => {
    a.classList.remove('su');
    setTimeout(() => a.remove(), 320);
  }, 8000);
}

/* portalo a vista e faglielo capire QUALE */
function mostraSforato(entry) {
  if (tab !== 'active' || showArchive) { showArchive = false; switchTab('active'); }
  setTimeout(() => {
    const r = cardRefs.get(entry.id);
    if (!r || !r.card.isConnected) return;
    r.card.scrollIntoView({ block: 'center', behavior: anima() ? 'smooth' : 'auto' });
    r.card.classList.remove('evidenzia');
    void r.card.offsetWidth;
    r.card.classList.add('evidenzia');
    setTimeout(() => r.card.classList.remove('evidenzia'), 3000);
  }, 120);
}

function tick() {
  const now = Date.now();
  /* L'AVVISO GUARDA SEMPRE, anche mentre sei in "+ Nuovo" o nel bar.
     E' proprio quello il momento in cui il colore rosso della lista
     non lo vedi -- se guardassi la lista, non servirebbe un avviso. */
  lista(entries).forEach(e => {
    if (e.status !== 'active' || e.payLater) return;
    if (endTimeOf(e) - now <= 0) avvisaSforato(e);
  });
  if (tab !== 'active' || showArchive) return;
  cardRefs.forEach((r, id) => {
    const entry = entries.find(e => e.id === id);
    if (!entry || !r.card.isConnected) return;
    const st = stateOf(entry, now);
    /* solo la classe di stato: azzerare className cancellava anche
       «aperto» e la scheda si richiudeva da sola ogni secondo */
    if (!r.card.classList.contains('s-' + st)) {
      ['ok', 'warn', 'danger', 'later'].forEach(x => r.card.classList.remove('s-' + x));
      r.card.classList.add('s-' + st);
    }

    if (entry.payLater) {
      // l'orario d'inizio è arrotondato ai 5 minuti e può cadere
      // qualche minuto avanti: non mostro un tempo trascorso negativo
      r.count.textContent = fmtClock(Math.max(0, now - entry.startTime));
      if (r.countK) r.countK.textContent = 'dentro da';
      soldiDi(r, entry, dueOf(entry));                     // il conto sale col tempo
    } else {
      const resta = endTimeOf(entry) - now;
      /* niente meno davanti quando e' sforato: lo dice gia' la parola
         sopra, e "sforato da -2:16" si legge due volte al contrario */
      r.count.textContent = fmtClock(r.countK ? Math.abs(resta) : resta);
      if (r.countK) r.countK.textContent = resta < 0 ? 'sforato da' : 'esce fra';
    }
  });
}

/* SVUOTA: SI SCEGLIE COSA.
   Prima era un tasto che al primo tocco diventava "Butto via tutto?
   tocca ancora": non si capiva cosa avrebbe buttato, e per saperlo
   bisognava premerlo. Adesso e' un foglio come quello dell'uscita, con
   le cose elencate e ognuna che si puo' lasciare -- perche' quasi
   sempre si vuole azzerare una parte sola, non ricominciare tutto. */
function foglioSvuota() {
  const c = draft;
  const barPresi = lista(c.barItems).filter(x => num(x.qty, 0) > 0);
  const soldi = r2(num(c.paidPark, 0) + num(c.paidBar, 0));
  const VOCI = [
    { k: 'numeri', t: 'Bambini e Crazy Jumping',
      d: (clamp(num(c.children, 0), 0, 1e6) || 0) + ' bambini · ' +
         (clamp(num(c.crazyJumping, 0), 0, 1e6) || 0) + ' Crazy',
      c: num(c.children, 0) > 0 || num(c.crazyJumping, 0) > 0 },
    { k: 'bar', t: 'Il bar',
      d: barPresi.length ? barPresi.map(x => x.qty + '× ' + x.name).join(', ') : 'niente segnato',
      c: barPresi.length > 0 },
    { k: 'persone', t: 'Chi accompagna',
      d: lista(c.people).length ? lista(c.people).map(p => nameOf(p)).join(', ') : 'nessuno',
      c: lista(c.people).length > 0 },
    { k: 'tempo', t: 'Orario, durata e bracciale',
      d: fmtTime(c.startTime) + ' · ' + (c.payLater ? 'tempo aperto' : fmtMin(c.durationMinutes)),
      c: true },
    { k: 'soldi', t: 'I soldi gia\u2019 presi',
      d: soldi > 0 ? eur(soldi) + ' incassati' : 'niente incassato',
      c: soldi > 0 }
  ];
  const scelte = {};
  VOCI.forEach(v => { scelte[v.k] = v.c; });

  const s = sheet('Svuota che cosa?');
  s.body.appendChild(el('div', 'hint',
    'Quello che lasci acceso viene azzerato. Quello che spegni resta com\u2019e\u2019.'));
  VOCI.forEach(v => {
    const riga = el('button', 'switch-row');
    riga.setAttribute('role', 'switch');
    const txt = el('span', 'sw-txt');
    txt.appendChild(el('b', null, v.t));
    txt.appendChild(el('span', null, v.d));
    riga.appendChild(txt);
    const sw = el('span', 'switch');
    riga.appendChild(sw);
    /* l'acceso sta sull'interruttore, non sulla riga: e' la stessa
       classe che usano gli interruttori delle Impostazioni */
    const dipingi = () => {
      sw.classList.toggle('on', !!scelte[v.k]);
      riga.setAttribute('aria-checked', scelte[v.k] ? 'true' : 'false');
    };
    riga.onclick = () => { scelte[v.k] = !scelte[v.k]; dipingi(); };
    dipingi();
    s.body.appendChild(riga);
  });

  footBtn(s.foot, 'Lascia stare', 'btn-ghost', s.close);
  footBtn(s.foot, '\ud83e\uddf9 Svuota', 'btn-danger', () => {
    s.close();
    svuotaScelto(scelte);
  });
}

/* Azzera quello che e' stato scelto. I soldi tornano indietro dalla
   porta di sempre -- segnaPagate, che passa da muoviSoldi -- e mai
   scritti a mano: una riga svuotata a mano lascerebbe l'importo in
   cassa senza piu' niente a cui riferirsi. */
function svuotaScelto(scelte) {
  const c = draft;
  const foto = fotografia(C());
  const tutto = scelte.numeri && scelte.bar && scelte.persone && scelte.tempo && scelte.soldi;
  if (tutto) {
    const cat = PAN.cat;
    draft = freshDraft();
    PAN.cat = cat;
    PAN.conto = draft;
  } else {
    const rendi = (id) => segnaPagate(id, 0);
    if (scelte.numeri) { rendi('bimbi'); rendi('crazy'); bcSetQ('bimbi', 0); bcSetQ('crazy', 0); }
    if (scelte.bar) {
      lista(c.barItems).slice().forEach(x => { rendi(x.id); bcSetQ(x.id, 0); });
      c.barItems = [];
    }
    if (scelte.soldi) {
      /* tutte le righe che hanno incassato qualcosa, non solo quelle a
         video: una bibita tolta dal listino non deve restare in cassa */
      Object.keys(c.paidLines || {}).forEach(rendi);
      Object.keys(c.paidAmt || {}).forEach(rendi);
      c.paidPark = 0; c.paidBar = 0;
    }
    if (scelte.persone) c.people = [];
    if (scelte.tempo) {
      const f = freshDraft();
      c.startTime = f.startTime; c.durationMinutes = f.durationMinutes;
      c.payLater = false; c.braceletColor = null; c.braceletCustom = true;
      c.baseMinutes = undefined;
    }
    if (!num(c.children, 0) && !num(c.crazyJumping, 0) && !lista(c.barItems).length &&
        !lista(c.people).length) c.touched = false;
  }
  const box = pcRif('.pc-people');
  if (box) { box.dataset.apri = ''; box.dataset.sig = ''; box.dataset.tav = ''; }
  pcSalva();
  aggiornaPannello();
  fatto('Svuotato', () => {
    rimetti(C(), foto);
    const box2 = pcRif('.pc-people');
    if (box2) { box2.dataset.apri = ''; box2.dataset.sig = ''; box2.dataset.tav = ''; }
    pcSalva();
    aggiornaPannello();
    toast('Rimesso com\u2019era \u21a9\ufe0e');
  });
}

/* IL REGISTRO DELLA GIORNATA.
   Quanto e' entrato in cassa, diviso per dove: il tempo di parco, il
   Crazy, il bar. Piu' quello che e' rimasto fuori -- gruppi usciti
   senza saldare -- che al banco conta quanto l'incassato, perche' e'
   la differenza fra "ho chiuso" e "ho chiuso bene".
   Un ingresso appartiene alla giornata in cui e' ENTRATO. */
function contiGiornata(inizio) {
  const fine = inizio + 24 * 3600 * 1000;
  const dentro = lista(entries).filter(e => {
    const t = num(e.startTime, num(e.createdAt, 0));
    return t >= inizio && t < fine;
  });
  const c = {
    inizio: inizio, gruppi: dentro.length, bambini: 0, crazy: 0,
    parco: 0, crazyEuro: 0, bar: 0, incassato: 0, venduto: 0, resta: 0,
    righe: []
  };
  dentro.forEach(e => {
    const d = dueOf(e);
    const amt = e.paidAmt || {};
    /* la divisione fra tempo e Crazy si legge dalle righe; se
       l'ingresso e' vecchio e non ce l'ha, il Crazy si ricava dal suo
       prezzo e il resto e' tempo */
    const crazyEuro = isFinite(num(amt.crazy, NaN))
      ? Math.max(0, num(amt.crazy, 0))
      : Math.min(num(e.paidPark, 0), clamp(e.crazyJumping, 0, 1e6) * num(settings.crazyJumpingPrice, 0));
    const parco = Math.max(0, r2(num(e.paidPark, 0) - crazyEuro));
    c.bambini += clamp(e.children, 0, 1e6);
    c.crazy += clamp(e.crazyJumping, 0, 1e6);
    c.parco = r2(c.parco + parco);
    c.crazyEuro = r2(c.crazyEuro + crazyEuro);
    c.bar = r2(c.bar + Math.max(0, num(e.paidBar, 0)));
    c.venduto = r2(c.venduto + d.park + d.bar);
    c.resta = r2(c.resta + d.total);
    c.righe.push({
      id: e.id, ora: fmtTime(e.startTime), chi: nomiDi(e),
      bambini: clamp(e.children, 0, 1e6),
      preso: r2(num(e.paidPark, 0) + num(e.paidBar, 0)),
      resta: d.total, uscito: e.status !== 'active'
    });
  });
  c.incassato = r2(c.parco + c.crazyEuro + c.bar);
  c.righe.sort((a, b) => a.ora < b.ora ? -1 : 1);
  return c;
}

function nomiDi(e) {
  const p = lista(e.people).map(x => nameOf(x)).filter(Boolean);
  return p.length ? p.join(', ') : 'senza riferimento';
}

/* TUTTE LE GIORNATE CHE HANNO QUALCOSA DENTRO, dalla piu' recente.
   Non si inventano i giorni vuoti: un lunedi' di chiusura non deve
   comparire come "zero incassato", perche' non e' andata male -- era
   chiuso. Nelle medie i giorni chiusi non ci sono proprio. */
function tutteLeGiornate() {
  const mappa = new Map();
  lista(entries).forEach(e => {
    const g = giornataDi(num(e.startTime, num(e.createdAt, 0)));
    if (!mappa.has(g)) mappa.set(g, []);
    mappa.get(g).push(e);
  });
  return [...mappa.keys()].sort((a, b) => b - a);
}

/* LE STATISTICHE DI UN PERIODO.
   Quello che al banco si vuole sapere davvero: quanto si e' fatto,
   quanto si e' fatto IN MEDIA (che e' il numero con cui si confronta
   una serata), quale giorno della settimana tira e quale no, a che ora
   arriva la gente, e cosa beve.
   Le medie sono per GIORNATA APERTA, non per giorno di calendario. */
function statistiche(giorni) {
  const st = {
    giornate: giorni.length, gruppi: 0, bambini: 0, crazy: 0, persone: 0,
    incassato: 0, parco: 0, crazyEuro: 0, bar: 0, resta: 0,
    minutiTotali: 0, conCrazy: 0, conRiferimento: 0, pezziBar: 0,
    perGiorno: [],            // una riga per giornata, dalla piu' vecchia
    settimana: Array.from({ length: 7 }, () => ({ giornate: 0, gruppi: 0, incassato: 0, bambini: 0 })),
    ore: Array.from({ length: 24 }, () => 0),
    bevande: new Map(),
    mesi: new Map()
  };
  giorni.slice().sort((a, b) => a - b).forEach(g => {
    const c = contiGiornata(g);
    st.gruppi += c.gruppi; st.bambini += c.bambini; st.crazy += c.crazy;
    st.incassato = r2(st.incassato + c.incassato);
    st.parco = r2(st.parco + c.parco);
    st.crazyEuro = r2(st.crazyEuro + c.crazyEuro);
    st.bar = r2(st.bar + c.bar);
    st.resta = r2(st.resta + c.resta);
    st.perGiorno.push({ giorno: g, incassato: c.incassato, gruppi: c.gruppi, bambini: c.bambini });

    const gs = new Date(g).getDay();
    st.settimana[gs].giornate++;
    st.settimana[gs].gruppi += c.gruppi;
    st.settimana[gs].bambini += c.bambini;
    st.settimana[gs].incassato = r2(st.settimana[gs].incassato + c.incassato);

    const dm = new Date(g);
    const kMese = dm.getFullYear() + '-' + pad2(dm.getMonth() + 1);
    const m = st.mesi.get(kMese) || { incassato: 0, gruppi: 0, bambini: 0, giornate: 0 };
    m.incassato = r2(m.incassato + c.incassato); m.gruppi += c.gruppi;
    m.bambini += c.bambini; m.giornate++;
    st.mesi.set(kMese, m);
  });

  /* le cose che si contano ingresso per ingresso */
  const dentro = new Set(giorni);
  lista(entries).forEach(e => {
    const g = giornataDi(num(e.startTime, num(e.createdAt, 0)));
    if (!dentro.has(g)) return;
    st.minutiTotali += clamp(e.durationMinutes, 0, 1e6);
    if (clamp(e.crazyJumping, 0, 1e6) > 0) st.conCrazy++;
    const p = lista(e.people).length;
    st.persone += p;
    if (p) st.conRiferimento++;
    st.ore[new Date(num(e.startTime, 0)).getHours()]++;
    lista(e.barItems).forEach(bi => {
      const q = clamp(bi.qty, 0, 1e6);
      if (!q) return;
      st.pezziBar += q;
      const nome = bi.name || bi.id;
      const b = st.bevande.get(nome) || { pezzi: 0, euro: 0 };
      b.pezzi += q; b.euro = r2(b.euro + q * num(bi.price, 0));
      st.bevande.set(nome, b);
    });
  });
  return st;
}

/* ══════════════════════════════════════════════════════════
   L'HUB: la giornata, lo storico, le statistiche.
   Tre domande diverse e tre schermate, ma una porta sola -- perche'
   sono la stessa cosa guardata da tre distanze:
     GIORNATA    com'e' andata oggi (o un giorno preciso)
     STORICO     come sono andati gli ultimi giorni, in fila
     STATISTICHE cosa succede di solito: che giorno tira, a che ora
                 arriva la gente, cosa beve, quanto si ferma
   I grafici sono barre fatte con dei riquadri: nessuna libreria da
   scaricare, funziona senza rete come tutto il resto, e su una
   tavoletta si leggono meglio di un disegno pieno di dettagli.
   ══════════════════════════════════════════════════════════ */
let hubDove = 'giornata';
let hubGiorno = null;
let hubPeriodo = 30;              // quanti giorni guarda lo storico

function fogliRegistro(giorno) {
  hubDove = giorno === undefined ? hubDove : 'giornata';
  hubGiorno = giorno === undefined ? (hubGiorno || giornataDi(Date.now())) : giorno;
  const s = sheet('\ud83d\udcd2 Registro e statistiche', { grande: true });

  const linguette = el('div', 'hub-cat');
  const dentro = el('div', 'hub-dentro');
  s.body.appendChild(linguette);
  s.body.appendChild(dentro);

  const disegna = () => {
    linguette.innerHTML = '';
    [['giornata', '\ud83d\udcc5 Giornata'], ['storico', '\ud83d\udcc8 Storico'],
     ['statistiche', '\ud83d\udcca Statistiche']].forEach(([k, nome]) => {
      const b = el('button', hubDove === k ? 'on' : '', nome);
      b.onclick = () => { hubDove = k; disegna(); };
      linguette.appendChild(b);
    });
    dentro.innerHTML = '';
    if (hubDove === 'giornata') vistaGiornata(dentro, disegna);
    else if (hubDove === 'storico') vistaStorico(dentro, disegna);
    else vistaStatistiche(dentro);
  };
  disegna();
  footBtn(s.foot, 'Chiudi', 'btn-ghost', s.close);
}

/* ── una giornata: quella di oggi, o quella che si sceglie ── */
function vistaGiornata(dentro, ridisegna) {
  const c = contiGiornata(hubGiorno);

  const barra = el('div', 'reg-giorni');
  const indietro = el('button', 'btn btn-sm', '\u25c0');
  indietro.title = 'giornata prima';
  indietro.onclick = () => { hubGiorno = giornataDi(hubGiorno - 1); ridisegna(); };
  const eti = el('div', 'reg-eti');
  eti.appendChild(el('b', null, nomeGiornata(hubGiorno)));
  eti.appendChild(el('span', null, 'dalle ' + ORA_CAMBIO_GIORNO + ':00 alle ' + ORA_CAMBIO_GIORNO + ':00'));
  const avanti = el('button', 'btn btn-sm', '\u25b6');
  avanti.title = 'giornata dopo';
  avanti.disabled = hubGiorno >= giornataDi(Date.now());
  avanti.onclick = () => { hubGiorno = giornataDi(hubGiorno + 25 * 3600 * 1000); ridisegna(); };
  barra.appendChild(indietro); barra.appendChild(eti); barra.appendChild(avanti);
  dentro.appendChild(barra);

  if (!c.gruppi) {
    dentro.appendChild(el('div', 'hint', 'Nessun ingresso in questa giornata.'));
    return;
  }

  const testa = el('div', 'reg-testa');
  const gr = el('div', 'reg-grossa');
  gr.appendChild(el('span', 'k', 'INCASSATO'));
  gr.appendChild(el('span', 'v', eur(c.incassato)));
  testa.appendChild(gr);
  if (c.resta > 0.005) {
    const rs = el('div', 'reg-grossa manca');
    rs.appendChild(el('span', 'k', 'NON INCASSATO'));
    rs.appendChild(el('span', 'v', eur(c.resta)));
    testa.appendChild(rs);
  }
  dentro.appendChild(testa);

  const voci = el('div', 'reg-voci');
  [['\u23f1\ufe0f', 'Tempo di parco', c.parco],
   ['\ud83e\udd38', 'Crazy Jumping', c.crazyEuro],
   ['\ud83e\udd64', 'Bar', c.bar]].forEach(([em, nome, val]) => {
    const r = el('div', 'reg-voce');
    r.appendChild(el('span', 'em', em));
    r.appendChild(el('span', 'nm', nome));
    r.appendChild(el('span', 'vl', eur(val)));
    voci.appendChild(r);
  });
  dentro.appendChild(voci);

  const conta = el('div', 'reg-conta');
  conta.appendChild(el('span', null, c.gruppi + (c.gruppi === 1 ? ' gruppo' : ' gruppi')));
  conta.appendChild(el('span', null, c.bambini + (c.bambini === 1 ? ' bambino' : ' bambini')));
  if (c.crazy) conta.appendChild(el('span', null, c.crazy + ' Crazy'));
  dentro.appendChild(conta);

  const lst = el('div', 'reg-lista');
  c.righe.forEach(r => {
    const riga = el('div', 'reg-riga' + (r.resta > 0.005 ? ' deve' : ''));
    riga.appendChild(el('span', 'ora', r.ora));
    const chi = el('span', 'chi');
    chi.appendChild(el('b', null, r.chi));
    chi.appendChild(el('span', null, r.bambini + (r.bambini === 1 ? ' bambino' : ' bambini') +
      (r.uscito ? '' : ' \u00b7 ancora dentro')));
    riga.appendChild(chi);
    const soldi = el('span', 'soldi');
    soldi.appendChild(el('b', null, eur(r.preso)));
    if (r.resta > 0.005) soldi.appendChild(el('span', 'manca', '\u2212' + eur(r.resta)));
    riga.appendChild(soldi);
    lst.appendChild(riga);
  });
  dentro.appendChild(lst);
}

/* ── una barra: il riquadro colorato piu' il suo numero ──
   Si passa il valore e il massimo, e lei si arrangia. La barra piu'
   alta si accende: e' quella che si cerca guardando. */
function barra(etichetta, valore, massimo, testo, acceso) {
  const r = el('div', 'gr-riga' + (acceso ? ' su' : ''));
  r.appendChild(el('span', 'gr-eti', etichetta));
  const pista = el('span', 'gr-pista');
  const b = el('span', 'gr-barra');
  b.style.width = (massimo > 0 ? Math.max(2, Math.round(valore / massimo * 100)) : 0) + '%';
  pista.appendChild(b);
  r.appendChild(pista);
  r.appendChild(el('span', 'gr-val', testo));
  return r;
}

/* ── lo storico: gli ultimi giorni uno sotto l'altro ── */
function vistaStorico(dentro, ridisegna) {
  const tutte = tutteLeGiornate();
  if (!tutte.length) { dentro.appendChild(el('div', 'hint', 'Non c\u2019\u00e8 ancora niente da guardare.')); return; }

  const scelte = el('div', 'hub-periodo');
  [[7, 'ultimi 7'], [30, 'ultimi 30'], [90, 'ultimi 90'], [0, 'tutto']].forEach(([n, nome]) => {
    const b = el('button', 'chip' + (hubPeriodo === n ? ' on' : ''), nome);
    b.onclick = () => { hubPeriodo = n; ridisegna(); };
    scelte.appendChild(b);
  });
  dentro.appendChild(scelte);

  const giorni = hubPeriodo ? tutte.slice(0, hubPeriodo) : tutte;
  const st = statistiche(giorni);

  const testa = el('div', 'reg-testa');
  const g1 = el('div', 'reg-grossa');
  g1.appendChild(el('span', 'k', 'INCASSATO IN ' + giorni.length + (giorni.length === 1 ? ' GIORNATA' : ' GIORNATE')));
  g1.appendChild(el('span', 'v', eur(st.incassato)));
  testa.appendChild(g1);
  const g2 = el('div', 'reg-grossa neutra');
  g2.appendChild(el('span', 'k', 'MEDIA A GIORNATA'));
  g2.appendChild(el('span', 'v', eur(giorni.length ? st.incassato / giorni.length : 0)));
  testa.appendChild(g2);
  dentro.appendChild(testa);

  /* il grafico: una barra per giornata, la piu' alta accesa */
  const max = Math.max(...st.perGiorno.map(x => x.incassato), 0);
  const graf = el('div', 'gr');
  graf.appendChild(el('div', 'gr-tit', 'Incassato per giornata'));
  st.perGiorno.slice().reverse().forEach(x => {
    const d = new Date(x.giorno);
    const eti = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1);
    const r = barra(eti, x.incassato, max, eur(x.incassato), x.incassato >= max && max > 0);
    r.onclick = () => { hubGiorno = x.giorno; hubDove = 'giornata'; ridisegna(); };
    r.classList.add('cliccabile');
    r.title = 'apri questa giornata';
    graf.appendChild(r);
  });
  dentro.appendChild(graf);
  dentro.appendChild(el('div', 'hint', 'Tocca una barra per aprire quella giornata.'));
}

/* ── le statistiche: cosa succede DI SOLITO ── */
function vistaStatistiche(dentro) {
  const tutte = tutteLeGiornate();
  if (!tutte.length) { dentro.appendChild(el('div', 'hint', 'Non c\u2019\u00e8 ancora niente da guardare.')); return; }
  const st = statistiche(tutte);
  const perGruppo = st.gruppi ? st.incassato / st.gruppi : 0;
  const perBambino = st.bambini ? st.incassato / st.bambini : 0;
  const durataMedia = st.gruppi ? Math.round(st.minutiTotali / st.gruppi) : 0;

  /* le medie: i numeri con cui si giudica una serata */
  const griglia = el('div', 'st-griglia');
  const dato = (em, nome, valore, sotto) => {
    const d = el('div', 'st-dato');
    d.appendChild(el('span', 'em', em));
    d.appendChild(el('span', 'vl', valore));
    d.appendChild(el('span', 'nm', nome));
    if (sotto) d.appendChild(el('span', 'sub', sotto));
    griglia.appendChild(d);
  };
  dato('\ud83d\udcb6', 'a gruppo', eur(perGruppo), 'in media');
  dato('\ud83e\uddd2', 'a bambino', eur(perBambino), 'in media');
  dato('\u23f1\ufe0f', 'si fermano', fmtMin(durataMedia), 'in media');
  dato('\ud83d\udc65', 'gruppi a giornata', (st.giornate ? Math.round(st.gruppi / st.giornate * 10) / 10 : 0) + '', 'in media');
  dato('\ud83e\udd38', 'prende il Crazy', (st.gruppi ? Math.round(st.conCrazy / st.gruppi * 100) : 0) + '%', 'dei gruppi');
  dato('\ud83e\udd64', 'consumazioni', (st.gruppi ? Math.round(st.pezziBar / st.gruppi * 10) / 10 : 0) + '', 'a gruppo');
  dentro.appendChild(griglia);

  /* IL GIORNO CHE TIRA: la domanda vera e' "quando conviene esserci" */
  const GIORNI = ['Domenica', 'Luned\u00ec', 'Marted\u00ec', 'Mercoled\u00ec', 'Gioved\u00ec', 'Venerd\u00ec', 'Sabato'];
  const sett = st.settimana.map((x, i) => ({
    nome: GIORNI[i],
    media: x.giornate ? x.incassato / x.giornate : 0,
    gruppi: x.giornate ? x.gruppi / x.giornate : 0,
    giornate: x.giornate
  })).filter(x => x.giornate);
  if (sett.length) {
    const maxS = Math.max(...sett.map(x => x.media));
    const ordinati = sett.slice().sort((a, b) => b.media - a.media);
    const graf = el('div', 'gr');
    graf.appendChild(el('div', 'gr-tit', 'Che giorno tira, in media'));
    /* in ordine di settimana, non di classifica: si cerca "il sabato",
       non "il primo" */
    [1, 2, 3, 4, 5, 6, 0].forEach(i => {
      const x = sett.find(y => y.nome === GIORNI[i]);
      if (!x) return;
      graf.appendChild(barra(x.nome.slice(0, 3), x.media, maxS,
        eur(x.media) + '  \u00b7  ' + (Math.round(x.gruppi * 10) / 10) + ' gr.',
        x.nome === ordinati[0].nome));
    });
    dentro.appendChild(graf);
    if (ordinati.length > 1) {
      dentro.appendChild(el('div', 'hint',
        'Il pi\u00f9 pieno \u00e8 ' + ordinati[0].nome.toLowerCase() + ' (' + eur(ordinati[0].media) +
        ' a giornata), il pi\u00f9 scarico ' + ordinati[ordinati.length - 1].nome.toLowerCase() +
        ' (' + eur(ordinati[ordinati.length - 1].media) + ').'));
    }
  }

  /* A CHE ORA ARRIVA LA GENTE: serve a sapere quando stare in due */
  const maxO = Math.max(...st.ore, 0);
  if (maxO) {
    const graf = el('div', 'gr');
    graf.appendChild(el('div', 'gr-tit', 'A che ora entrano'));
    st.ore.forEach((n, h) => {
      if (!n) return;
      graf.appendChild(barra(pad2(h) + ':00', n, maxO, n + (n === 1 ? ' gruppo' : ' gruppi'), n >= maxO));
    });
    dentro.appendChild(graf);
    const punta = st.ore.indexOf(maxO);
    dentro.appendChild(el('div', 'hint', 'L\u2019ora di punta \u00e8 le ' + punta + ':00.'));
  }

  /* COSA BEVONO */
  const bev = [...st.bevande.entries()].map(([nome, x]) => ({ nome, ...x }))
    .sort((a, b) => b.pezzi - a.pezzi).slice(0, 8);
  if (bev.length) {
    const maxB = bev[0].pezzi;
    const graf = el('div', 'gr');
    graf.appendChild(el('div', 'gr-tit', 'Cosa prendono al bar'));
    bev.forEach((b, i) => graf.appendChild(
      barra(b.nome, b.pezzi, maxB, b.pezzi + '  \u00b7  ' + eur(b.euro), i === 0)));
    dentro.appendChild(graf);
  }

  /* I MESI */
  const mesi = [...st.mesi.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  if (mesi.length > 1) {
    const maxM = Math.max(...mesi.map(([, m]) => m.incassato));
    const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
                  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const graf = el('div', 'gr');
    graf.appendChild(el('div', 'gr-tit', 'Mese per mese'));
    mesi.forEach(([k, m]) => {
      const [anno, mm] = k.split('-');
      graf.appendChild(barra(MESI[+mm - 1].slice(0, 3) + ' ' + anno.slice(2), m.incassato, maxM,
        eur(m.incassato) + '  \u00b7  ' + m.gruppi + ' gr.', m.incassato >= maxM));
    });
    dentro.appendChild(graf);
  }

  /* il totale in fondo: chi scorre fin qui vuole il numero grosso */
  const fine = el('div', 'st-fine');
  fine.appendChild(el('span', null, st.giornate + ' giornate \u00b7 ' + st.gruppi + ' gruppi \u00b7 ' +
    st.bambini + ' bambini \u00b7 ' + st.persone + ' accompagnatori'));
  fine.appendChild(el('b', null, 'in tutto ' + eur(st.incassato)));
  dentro.appendChild(fine);
}

/* Il foglio dell'uscita: due strade scritte, non un "sei sicuro?".
   Uscire e cancellare sono cose diverse -- una lascia l'ingresso nei
   conti della giornata, l'altra lo toglie di mezzo -- e vanno lette,
   non indovinate. */
function fogliUscita(entry, d, esci) {
  const resta = d.total;
  const s = sheet(resta > 0.005 ? 'Restano ' + eur(resta) + ' da incassare' : 'Esce il gruppo?');
  s.body.appendChild(el('div', 'hint', resta > 0.005
    ? 'Chi accompagna: ' + nomiDi(entry) + '. Puoi farlo uscire lo stesso: quello che manca resta segnato nel registro della giornata.'
    : 'Chi accompagna: ' + nomiDi(entry) + '. Il conto e\u2019 saldato.'));

  const scelta = (cls, em, titolo, sotto, fn) => {
    const b = el('button', 'scelta-riga ' + cls);
    b.appendChild(el('span', 'sc-em', em));
    const t = el('span', 'sc-txt');
    t.appendChild(el('b', null, titolo));
    t.appendChild(el('span', null, sotto));
    b.appendChild(t);
    b.onclick = () => { s.close(); fn(); };
    s.body.appendChild(b);
    return b;
  };

  scelta('', '\ud83d\udeaa', 'Esce e va in archivio',
    'Resta nel registro della giornata, con quello che ha pagato. Da li\u2019 puoi riaprirlo.',
    esci);

  scelta('pericolo', '\ud83d\uddd1\ufe0f', 'Elimina l\u2019ingresso',
    'Sparisce del tutto: NON entra nel registro della giornata. Serve per gli sbagli, non per chi ha finito. Non si pu\u00f2 annullare.',
    () => eliminaIngresso(entry));

  footBtn(s.foot, 'Lascia stare', 'btn-ghost', s.close);
}

/* Toglie di mezzo un ingresso sbagliato: via dall'elenco, via dai
   conti della giornata. I soldi che risultavano incassati se ne vanno
   con lui -- ed e' il punto: se erano stati battuti per sbaglio, non
   devono restare in cassa. */
function eliminaIngresso(entry) {
  if (volante) posaSubito(volante.card);
  const foto = fotografia(entry);
  const dovEra = lista(entries).indexOf(entry);
  entries = lista(entries).filter(e => e.id !== entry.id);
  saveEntries();
  buildActiveView();
  updateBadge();
  fatto('Ingresso eliminato \ud83d\uddd1\ufe0f', () => {
    /* torna al SUO posto nell'elenco, non in fondo: la lista e' in
       ordine di arrivo e ritrovarselo altrove confonde */
    entries.splice(Math.max(0, Math.min(dovEra, entries.length)), 0, foto);
    saveEntries();
    buildActiveView();
    updateBadge();
    toast('Rimesso a posto \u21a9\ufe0e');
  });
}

function confirmSheet(title, text, onYes) {
  const s = sheet(title);
  s.body.appendChild(el('div', 'hint', text));
  footBtn(s.foot, 'Annulla', 'btn-ghost', s.close);
  footBtn(s.foot, 'Conferma', 'btn-danger', () => { s.close(); onYes(); });
}

/* ============================================================
   VISTA: IMPOSTAZIONI
   ============================================================ */
function buildSettingsView() {
  const root = $('#view-settings');
  root.innerHTML = `
    <div class="card blk c-viola">
      <h2><span class="em">🎨</span> Aspetto</h2>
      <div class="blk-in">
      <button class="switch-row" id="setAnima" role="switch" style="margin-top:10px;">
        <span class="sw-txt"><b>Animazioni</b><span>La scheda che si apre e quella che vola sopra le altre. Spento: tutto istantaneo, come chiede il risparmio animazioni del sistema.</span></span>
        <span class="switch"></span>
      </button>
      <button class="switch-row" id="setPieno" role="switch" style="margin-top:10px;">
        <span class="sw-txt"><b>Schermo intero</b><span>Toglie la barra di sistema del tablet, che copriva la parte bassa dell'app. Se l'app &egrave; installata, il tutto schermo parte al primo tocco.</span></span>
        <span class="switch"></span>
      </button>
      </div>
    </div>

    <div class="card blk c-verde">
      <h2><span class="em">📒</span> Registro della giornata</h2>
      <div class="blk-in">
      <div class="hint">Quanto &egrave; entrato in cassa e da dove. La giornata va dalle
        <b>4:00 alle 4:00</b> del giorno dopo, cos&igrave; una serata lunga resta tutta insieme
        invece di spezzarsi a mezzanotte.</div>
      <button class="btn btn-block" id="sRegistro" style="margin-top:10px;">📒 Apri il registro</button>
      </div>
    </div>

    <div class="card blk c-ambra">
      <h2><span class="em">⏱️</span> Tempi e prezzi base</h2>
      <div class="blk-in">
      <button class="switch-row" id="setTariffa" role="switch" style="margin-bottom:12px;">
        <span class="sw-txt"><b>Tariffa sull'intera permanenza</b><span>Chi allunga paga la tariffa del tempo totale (30'+30' = 1 ora), non due volte quella da 30. Spento: ogni aggiunta si paga a parte.</span></span>
        <span class="switch"></span>
      </button>
      <div class="grid2">
        <div class="field"><label>Minuti extra per Crazy</label><input type="number" inputmode="numeric" min="0" id="sCrazyMin"></div>
        <div class="field"><label>Prezzo Crazy (€)</label><input type="number" inputmode="decimal" step="0.5" min="0" id="sCrazyPrice"></div>
        <div class="field"><label>Tolleranza dopo scadenza</label><input type="number" inputmode="numeric" min="0" id="sTol"></div>
        <div class="field"><label>Avvisa quando mancano</label><input type="number" inputmode="numeric" min="0" id="sWarn"></div>
      </div>
      </div>
    </div>

    <div class="card blk c-viola">
      <h2><span class="em">⚡</span> Durate rapide</h2>
      <div class="blk-in">
      <div class="hint">I tasti grandi che vedi in "Nuovo ingresso".</div>
      <div id="sQuick"></div>
      <button class="btn btn-sm btn-block" id="sAddQuick" style="margin-top:8px;">➕ Aggiungi tasto</button>
      </div>
    </div>

    <div class="card blk c-verde">
      <h2><span class="em">💶</span> Listino</h2>
      <div class="blk-in">
      <div class="hint">Il tempo si arrotonda per eccesso a 5 minuti; il totale si moltiplica per i bambini.</div>
      <div id="sTariffs"></div>
      <button class="btn btn-sm btn-block" id="sAddTariff" style="margin-top:8px;">➕ Aggiungi fascia</button>
      </div>
    </div>

    <div class="card blk c-ciano">
      <h2><span class="em">🥤</span> Menù bar</h2>
      <div class="blk-in">
      <div id="sBar"></div>
      <button class="btn btn-sm btn-block" id="sAddBar" style="margin-top:8px;">➕ Aggiungi voce</button>
      </div>
    </div>

    <div class="card blk c-blu">
      <h2><span class="em">🎗️</span> Bracciali per fascia oraria</h2>
      <div class="blk-in">
      <div id="sWrist"></div>
      <button class="btn btn-sm btn-block" id="sAddWrist" style="margin-top:8px;">➕ Aggiungi fascia</button>
      </div>
    </div>

    <div class="card blk c-viola">
      <h2><span class="em">🖼️</span> Avatar pronti</h2>
      <div class="blk-in">
      <div class="hint">Compaiono come scorciatoie quando aggiungi una persona.</div>
      <div class="preset-grid" id="sPresets"></div>
      <button class="btn btn-sm btn-block" id="sAddPreset" style="margin-top:10px;">➕ Nuovo avatar</button>
      </div>
    </div>

    <div class="card blk c-blu" id="sCloudCard">
      <h2><span class="em">☁️</span> Cloud e accesso</h2>
      <div class="blk-in">
      <div id="sCloud"></div>
      </div>
    </div>

    <div class="card blk c-verde" id="sSicuroCard">
      <h2><span class="em">🔒</span> Sicurezza dei dati</h2>
      <div class="blk-in">
      <div id="sSicuro"></div>
      </div>
    </div>

    <div class="card blk c-grigio">
      <h2><span class="em">💾</span> Backup</h2>
      <div class="blk-in">
      <div class="hint">Il backup su file resta utile anche col cloud acceso: è la tua copia, e funziona senza rete.</div>
      <div class="btn-row" style="margin-bottom:10px;">
        <button class="btn btn-sm" id="sExport">Scarica backup</button>
        <button class="btn btn-sm" id="sImport">Ripristina backup</button>
      </div>
      <input type="file" id="sFile" accept=".json" class="hidden">
      <button class="btn btn-sm btn-danger btn-block" id="sReset">Cancella tutto</button>
      <div class="hint" style="margin:10px 0 0; text-align:center;">Le modifiche qui si salvano da sole.</div>
      </div>
    </div>`;

  aggiornaCartaCloud();
  aggiornaCartaSicurezza();
  $('#sRegistro').onclick = () => fogliRegistro();

  /* tema */
  const an = $('#setAnima');
  const paintAnima = () => {
    const on = settings.animazioni !== false;
    $('.switch', an).classList.toggle('on', on);
    an.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  paintAnima();
  an.onclick = () => {
    settings.animazioni = settings.animazioni === false;
    applyTheme();
    paintAnima();
    saveSettings();
  };

  const sp = $('#setPieno');
  const paintPieno = () => {
    const on = !!settings.schermoIntero;
    $('.switch', sp).classList.toggle('on', on);
    sp.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  paintPieno();
  sp.onclick = () => {
    settings.schermoIntero = !settings.schermoIntero;
    schermoIntero(settings.schermoIntero);
    paintPieno();
    saveSettings();
  };

  /* numeri base: si salvano mentre scrivi, senza ridisegnare nulla */
  const bind = (id, key, min, max, isFloat) => {
    const inp = $('#' + id);
    inp.value = settings[key];
    inp.oninput = () => {
      const v = isFloat ? parseFloat(inp.value) : parseInt(inp.value, 10);
      if (Number.isFinite(v)) { settings[key] = clamp(v, min, max); saveSettings(); }
    };
    inp.onblur = () => { inp.value = settings[key]; };
  };
  const tf = $('#setTariffa');
  const paintTariffa = () => {
    const on = settings.tariffaSuTotale !== false;
    $('.switch', tf).classList.toggle('on', on);
    tf.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  paintTariffa();
  tf.onclick = () => {
    settings.tariffaSuTotale = settings.tariffaSuTotale === false;
    saveSettings();
    paintTariffa();
    toast(settings.tariffaSuTotale ? 'Tariffa sul tempo totale' : 'Ogni aggiunta si paga a parte');
  };

  bind('sCrazyMin', 'crazyExtraMinutes', 0, 999);
  bind('sCrazyPrice', 'crazyJumpingPrice', 0, 9999, true);
  bind('sTol', 'toleranceMinutes', 0, 999);
  bind('sWarn', 'warnBeforeMinutes', 0, 999);

  renderQuick();
  renderTariffs();
  renderBarMenu();
  renderWristbands();
  renderPresets();

  $('#sAddQuick').onclick = () => { settings.quickDurations.push(30); saveSettings(); renderQuick(); markNewDirty(); };
  $('#sAddTariff').onclick = () => { settings.tariffs.push({ m: 15, p: 0 }); saveSettings(); renderTariffs(); };
  $('#sAddBar').onclick = () => { settings.barMenu.push({ id: uid(), name: 'Nuova voce', price: 1, em: '🥤' }); saveSettings(); renderBarMenu(); markNewDirty(); };
  $('#sAddWrist').onclick = () => { settings.braceletSlots.push({ start: '09:00', end: '10:00', color: '#22C55E', label: 'Verde' }); saveSettings(); renderWristbands(); };
  $('#sAddPreset').onclick = () => {
    const p = { id: uid(), name: 'Nuovo', role: 'altro', avatar: AV.defaultFor('altro') };
    presets.push(p);
    savePresets();
    renderPresets();
    openCustomizer(p, () => { savePresets(); renderPresets(); markNewDirty(); });
  };

  $('#sExport').onclick = () => {
    const data = JSON.stringify({ settings, entries, presets, exportedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gestioparco_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Backup scaricato ✅');
  };
  const file = $('#sFile');
  $('#sImport').onclick = () => file.click();
  file.onchange = () => {
    const f = file.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || (!d.entries && !d.settings)) throw new Error('formato');
        if (d.settings) { settings = Object.assign(defaultSettings(), d.settings); saveSettings(); }
        if (d.entries) { entries = normalizeEntries(d.entries); saveEntries(); }
        if (d.presets) { presets = d.presets; savePresets(); }
        applyTheme();
        markNewDirty();
        buildSettingsView();
        updateBadge();
        toast('Backup ripristinato ✅');
      } catch (e) {
        toast('⚠️ File di backup non valido');
      }
      file.value = '';
    };
    rd.readAsText(f);
  };
  $('#sReset').onclick = () => confirmSheet('Cancellare tutto?', 'Spariscono ingressi, avatar e impostazioni di questo dispositivo. Scarica prima un backup.', () => {
    localStorage.removeItem(SK.entries);
    localStorage.removeItem(SK.settings);
    localStorage.removeItem(SK.presets);
    location.reload();
  });
}

/* il listino o le tariffe sono cambiate: il pannello si rifa' con i
   prezzi nuovi, ovunque sia in questo momento */
function markNewDirty() { if (PAN.root) aggiornaPannello(); }

function rowDel(onClick) {
  const b = el('button', 'del', '✕');
  b.onclick = onClick;
  return b;
}
function numInput(value, step, onChange) {
  const i = el('input');
  i.type = 'number';
  i.inputMode = 'decimal';
  i.step = step;
  i.min = '0';
  i.value = value;
  i.oninput = () => { const v = parseFloat(i.value); if (Number.isFinite(v)) onChange(v); };
  return i;
}

function renderQuick() {
  const box = $('#sQuick');
  box.innerHTML = '';
  settings.quickDurations.forEach((m, i) => {
    const r = el('div', 'row-edit');
    r.appendChild(el('span', 'lab', 'Tasto ' + (i + 1)));
    const inp = numInput(m, '5', v => { settings.quickDurations[i] = clamp(Math.round(v), 1, 9999); saveSettings(); markNewDirty(); });
    inp.classList.add('grow');
    r.appendChild(inp);
    r.appendChild(el('span', 'lab', 'min'));
    r.appendChild(rowDel(() => { settings.quickDurations.splice(i, 1); saveSettings(); renderQuick(); markNewDirty(); }));
    box.appendChild(r);
  });
}
function renderTariffs() {
  const box = $('#sTariffs');
  box.innerHTML = '';
  lista(settings.tariffs).forEach((t, i) => {
    const r = el('div', 'row-edit');
    r.appendChild(el('span', 'lab', 'fino a'));
    r.appendChild(numInput(t.m, '5', v => { t.m = clamp(Math.round(v), 1, 99999); saveSettings(); }));
    r.appendChild(el('span', 'lab', 'min →'));
    r.appendChild(numInput(t.p, '0.5', v => { t.p = clamp(v, 0, 99999); saveSettings(); }));
    r.appendChild(el('span', 'lab', '€'));
    r.appendChild(rowDel(() => { settings.tariffs.splice(i, 1); saveSettings(); renderTariffs(); }));
    box.appendChild(r);
  });
  if (!settings.tariffs.length) box.appendChild(el('div', 'hint', 'Nessuna fascia: il parco risulterebbe gratis.'));
}
function renderBarMenu() {
  const box = $('#sBar');
  box.innerHTML = '';
  lista(settings.barMenu).forEach((it, i) => {
    const r = el('div', 'row-edit');
    const em = el('input');
    em.value = it.em || '🥤';
    em.style.cssText = 'width:46px;text-align:center;';
    em.oninput = () => { it.em = em.value || '🥤'; saveSettings(); markNewDirty(); };
    r.appendChild(em);
    const nm = el('input');
    nm.className = 'grow';
    nm.value = it.name;
    nm.oninput = () => { it.name = nm.value || 'Voce'; saveSettings(); markNewDirty(); };
    r.appendChild(nm);
    const cat = el('input');
    cat.value = it.cat || 'Altro';
    cat.placeholder = 'Categoria';
    cat.style.width = '130px';
    cat.title = 'Categoria (raggruppa le voci nel pannello Bar)';
    cat.oninput = () => { it.cat = cat.value || 'Altro'; saveSettings(); markNewDirty(); };
    r.appendChild(cat);
    r.appendChild(numInput(it.price, '0.1', v => { it.price = clamp(v, 0, 99999); saveSettings(); markNewDirty(); }));
    r.appendChild(el('span', 'lab', '€'));
    r.appendChild(rowDel(() => { settings.barMenu.splice(i, 1); saveSettings(); renderBarMenu(); markNewDirty(); }));
    box.appendChild(r);
  });
}
function renderWristbands() {
  const box = $('#sWrist');
  box.innerHTML = '';
  lista(settings.braceletSlots).forEach((s, i) => {
    const r = el('div', 'row-edit');
    const t1 = el('input'); t1.type = 'time'; t1.value = s.start;
    t1.oninput = () => { s.start = t1.value; saveSettings(); };
    const t2 = el('input'); t2.type = 'time'; t2.value = s.end;
    t2.oninput = () => { s.end = t2.value; saveSettings(); };
    const col = el('input'); col.type = 'color'; col.value = s.color;
    col.oninput = () => { s.color = col.value; saveSettings(); };
    const lab = el('input'); lab.className = 'grow'; lab.value = s.label || ''; lab.placeholder = 'Nome';
    lab.oninput = () => { s.label = lab.value; saveSettings(); };
    r.appendChild(t1);
    r.appendChild(el('span', 'lab', '→'));
    r.appendChild(t2);
    r.appendChild(col);
    r.appendChild(lab);
    r.appendChild(rowDel(() => { settings.braceletSlots.splice(i, 1); saveSettings(); renderWristbands(); }));
    box.appendChild(r);
  });
}
function renderPresets() {
  const box = $('#sPresets');
  box.innerHTML = '';
  presets.forEach(p => {
    p.avatar = AV.normalize(p.avatar, p.role);
    const d = el('div', 'preset');
    const av = el('div', 'pav');
    av.innerHTML = AV.build(p.avatar);
    av.onclick = () => openCustomizer(p, () => { savePresets(); renderPresets(); markNewDirty(); });
    d.appendChild(av);
    const nm = el('input');
    nm.value = p.name || '';
    nm.placeholder = roleOf(p.role).label;
    nm.oninput = () => { p.name = nm.value; savePresets(); };
    nm.onblur = () => markNewDirty();
    d.appendChild(nm);
    const rm = el('button', 'rm', '✕');
    rm.onclick = () => {
      presets = presets.filter(x => x.id !== p.id);
      savePresets();
      renderPresets();
      markNewDirty();
    };
    d.appendChild(rm);
    box.appendChild(d);
  });
}

/* ============================================================
   GUSCIO
   ============================================================ */
/* I prezzi stanno sul dispositivo e vincono su quelli base: senza
   questo, su un tablet gia' usato resterebbero i valori FINTI di prova.
   Sostituisce solo se sono ancora quelli: se qualcuno li ha ritoccati
   a mano non tocca niente. */
function aggiornaListinoFinto() {
  const d = defaultSettings();
  let cambiato = [];

  /* Prima di toccare i prezzi, fermo il conto di chi e' gia' uscito col
     valore di ADESSO: altrimenti un ingresso saldato si ritroverebbe un
     residuo solo perche' e' cambiato il listino. */
  const congela = () => {
    let n = 0;
    entries.forEach(e => {
      if (e.status === 'closed' && !e.costoFinale) {
        const x = dueOf(e);
        e.costoFinale = { parco: x.park, bar: x.bar };
        n++;
      }
    });
    if (n) saveEntries();
    return n;
  };

  const firmaBar = (m) => lista(m).map(x => x.name + ':' + x.price).join('|');
  const BAR_FINTO = 'Acqua:1|Coca Cola:2.5|Caff\u00e8:1.2|Merendina:2|Panino:4';
  const firmaTar0 = (t) => lista(t).map(x => x.m + ':' + x.p).join('|');
  const TAR_FINTE0 = '10:2|15:3|30:5|45:7|60:9|75:10|90:12|105:13|120:15|150:18|180:21';
  if (firmaBar(settings.barMenu) === BAR_FINTO ||
      firmaTar0(settings.tariffs) === TAR_FINTE0 ||
      num(settings.crazyJumpingPrice, 0) === 3) {
    congela();   // prima che i prezzi cambino
  }
  if (firmaBar(settings.barMenu) === BAR_FINTO) {
    settings.barMenu = JSON.parse(JSON.stringify(d.barMenu));
    cambiato.push('il bar');
  }

  const firmaTar = (t) => lista(t).map(x => x.m + ':' + x.p).join('|');
  const TAR_FINTE = '10:2|15:3|30:5|45:7|60:9|75:10|90:12|105:13|120:15|150:18|180:21';
  if (firmaTar(settings.tariffs) === TAR_FINTE) {
    settings.tariffs = JSON.parse(JSON.stringify(d.tariffs));
    cambiato.push('le tariffe');
  }

  if (num(settings.crazyJumpingPrice, 0) === 3) {
    settings.crazyJumpingPrice = d.crazyJumpingPrice;
    cambiato.push('il Crazy Jumping');
  }

  if (cambiato.length) {
    saveSettings();
    setTimeout(() => toast('Listino aggiornato: ' + cambiato.join(', ')), 1200);
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = 'dark';   // tema unico: il chiaro non serviva
  // tinte: quelle del modello (di serie) o quelle misurate
  /* L'app decide da se' se animare: il risparmio animazioni del sistema
     spegneva tutto e non si capiva piu' dove finivano le schede. */
  document.documentElement.classList.toggle('anima', settings.animazioni !== false);
  preparaSchermoIntero();
  const meta = document.querySelector('meta[name="theme-color"]');
  // la barra di sistema del tablet deve intonarsi all'app, non restare
  // del blu di due versioni fa
  if (meta) meta.setAttribute('content', '#17171E');
}
function updateBadge() {
  const n = entries.filter(e => e.status === 'active').length;
  const b = $('#tabBadge');
  b.textContent = n;
  b.dataset.n = n;
}
let tabPrec = null;
function switchTab(t) {
  /* se una scheda sta volando va posata PRIMA di cambiare vista:
     altrimenti resta appesa sopra la vista nuova, col velo sfocato */
  if (typeof volante !== 'undefined' && volante) posaSubito(volante.card);
  tab = t;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  const primaEra = tabPrec;
  tabPrec = t;
  $('#view-new').classList.toggle('hidden', t !== 'new');
  $('#view-active').classList.toggle('hidden', t !== 'active');
  $('#view-settings').classList.toggle('hidden', t !== 'settings');
  /* La vista che arriva entra dal lato da cui si veniva: dice da dove
     sei arrivato invece di comparire e basta. */
  if (anima() && primaEra && primaEra !== t) {
    const ordine = ['new', 'active', 'settings'];
    const vista = $('#view-' + t);
    if (vista) {
      vista.classList.remove('entra-dx', 'entra-sx');
      void vista.offsetWidth;
      vista.classList.add(ordine.indexOf(t) > ordine.indexOf(primaEra) ? 'entra-dx' : 'entra-sx');
      setTimeout(() => vista.classList.remove('entra-dx', 'entra-sx'), 320);
    }
  }
  document.querySelector('main').classList.toggle('conto-in-fondo', t === 'new');
  $('main').scrollTop = 0;

  if (t === 'new') {
    // se il modulo e' vergine, l'orario riparte da adesso
    if (!draft.touched) draft.startTime = roundTo5(new Date()).getTime();
    /* il pannello torna a casa: se stava dentro una scheda che volava,
       posaSubito l'ha gia' rimesso qui sopra */
    montaPannello($('#view-new'), draft, { cat: PAN.ingresso ? 'Parco' : PAN.cat });
  }
  if (t === 'active') buildActiveView();   // ridisegna: cosi' la scheda in modifica si segna o si libera
  if (t === 'settings') buildSettingsView();
  updateBadge();
}

/* Le spunte del vecchio conto erano una per PEZZO e valevano vero o
   falso: child_0, child_1, crazy_0, bar_b3_0... Adesso ogni voce ha una
   quantita' pagata (bimbi: 2, crazy: 1, b3: 2). Qui si contano le
   vecchie spunte accese e si buttano le chiavi di prima: gli IMPORTI
   (paidPark, paidBar) non si toccano, sono loro la verita' dei soldi. */
function traduciPagate(vecchie) {
  const p = vecchie || {};
  const out = {};
  const conta = (k, q) => { out[k] = (out[k] || 0) + q; };
  /* Un conto puo' avere ADDOSSO tutti e due i formati: le spunte vecchie
     di una sessione e le quantita' nuove di un'altra. Si passa una volta
     sola e si tiene tutto, invece di scegliere un formato e buttare
     l'altro -- che voleva dire perdere per strada quello che il cliente
     aveva gia' pagato. */
  Object.keys(p).forEach(k => {
    if (!p[k]) return;
    const q = p[k] === true ? 1 : Math.max(0, Math.round(num(p[k], 0)));
    if (q <= 0) return;
    if (/^child_/.test(k)) return conta('bimbi', q);
    if (/^crazy_/.test(k)) return conta('crazy', q);
    const m = /^bar_(.+)_\d+$/.exec(k);
    if (m) return conta(m[1], q);
    conta(k, q);
  });
  return out;
}

/* Quanti soldi ha incassato ogni riga. I conti vecchi hanno solo i due
   totali di sezione: qui si spalmano sulle righe spuntate, e quello che
   avanza resta attribuito ai bambini perche' e' comunque denaro entrato
   e non deve sparire. */
function traduciImporti(o) {
  if (o.paidAmt && typeof o.paidAmt === 'object') return o.paidAmt;
  const a = {}, r = v => Math.round(num(v, 0) * 100) / 100;
  const righe = o.paidLines || {};
  let park = Math.max(0, num(o.paidPark, 0));
  const prendi = (id, n, prezzo) => {
    const vuole = r(Math.max(0, n) * num(prezzo, 0));
    const dato = Math.min(park, vuole);
    a[id] = dato; park = r(park - dato);
  };
  prendi('bimbi', Math.min(clamp(o.children, 0, 9999), num(righe.bimbi, 0)), costOf(o).unit);
  prendi('crazy', Math.min(clamp(o.crazyJumping, 0, 9999), num(righe.crazy, 0)), settings.crazyJumpingPrice);
  if (park > 0) a.bimbi = r(num(a.bimbi, 0) + park);

  let bar = Math.max(0, num(o.paidBar, 0));
  lista(o.barItems).forEach(bi => {
    const n = Math.min(clamp(bi.qty, 0, 9999), num(righe[bi.id], 0));
    const vuole = r(Math.max(0, n) * num(bi.price, 0));
    const dato = Math.min(bar, vuole);
    a[bi.id] = dato; bar = r(bar - dato);
  });
  const primo = lista(o.barItems)[0];
  if (bar > 0 && primo) a[primo.id] = r(num(a[primo.id], 0) + bar);
  return a;
}

/* ---------- LA RIPARAZIONE ----------
   Passa di qui OGNI ingresso che entra in memoria: da localStorage,
   dal cloud, da una copia ripristinata, da una versione futura
   dell'app. Non si fida di niente e rimette a posto quello che trova.
   E' la rete che tiene: un conto sbagliato al banco vuol dire soldi. */
function riparaConto(o) {
  const int = (v, max) => {
    const n = Math.round(num(v, 0));
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
  };
  const sold = v => {
    const n = Math.round(num(v, 0) * 100) / 100;
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  o.children = int(o.children, 9999);
  o.crazyJumping = int(o.crazyJumping, 9999);
  o.durationMinutes = Math.max(1, int(o.durationMinutes, 99999) || 60);
  o.baseMinutes = Math.max(1, int(o.baseMinutes, 99999) || o.durationMinutes);
  o.barItems = (Array.isArray(o.barItems) ? o.barItems : [])
    .filter(b => b && b.id)
    .map(b => ({ id: String(b.id), name: String(b.name || 'Voce'), price: sold(b.price), qty: int(b.qty, 9999) }))
    .filter(b => b.qty > 0);

  /* le spunte non possono superare quello che c'e' sul conto, e le
     chiavi che non corrispondono a niente se ne vanno */
  const quante = { bimbi: o.children, crazy: o.crazyJumping };
  o.barItems.forEach(b => { quante[b.id] = b.qty; });
  const righe = {}, importi = {};
  Object.keys(o.paidLines || {}).forEach(k => {
    if (!(k in quante)) return;
    const n = Math.min(int((o.paidLines || {})[k], 9999), quante[k]);
    if (n > 0) righe[k] = n;
  });
  Object.keys(o.paidAmt || {}).forEach(k => {
    if (!(k in quante)) return;
    const v = sold((o.paidAmt || {})[k]);
    if (v > 0) importi[k] = v;
  });
  o.paidLines = righe;
  o.paidAmt = importi;

  /* i due totali di sezione sono la verita' dei soldi: se gli importi
     per riga non li rispecchiano piu', si rifanno da loro invece di
     lasciare in giro due versioni diverse dello stesso conto */
  o.paidPark = sold(o.paidPark);
  o.paidBar = sold(o.paidBar);
  const somma = (chiavi) => Math.round(chiavi.reduce((a, k) => a + num(importi[k], 0), 0) * 100) / 100;
  const idBar = o.barItems.map(b => b.id);
  if (Math.abs(somma(['bimbi', 'crazy']) - o.paidPark) > 0.005 ||
      Math.abs(somma(idBar) - o.paidBar) > 0.005) {
    o.paidAmt = traduciImporti(Object.assign({}, o, { paidAmt: null }));
  }
  return o;
}

function normalizeEntries(list) {
  /* Qui arrivano i dati di fuori -- vecchi salvataggi, cloud, copie
     ripristinate -- ed e' l'ultimo posto in cui una schifezza puo'
     ancora far saltare l'elenco INTERO invece di un ingresso solo: se
     esplode qui, al banco non compare piu' nessuno.
     I buchi (null, undefined, un numero finito li' per sbaglio) si
     buttano prima di guardarci dentro: un ingresso che non c'e' non e'
     un ingresso da riparare. */
  return lista(list).filter(e => e && typeof e === 'object').map(e => {
    const o = Object.assign({
      status: 'active', barItems: [], barPaid: 0, parkPaid: false,
      braceletColor: null, braceletCustom: false, paidLines: {},
      children: 1, crazyJumping: 0, durationMinutes: 60, people: []
    }, e, {
      paidLines: e.paidLines || {},
      people: lista(e.people).filter(p => p && typeof p === 'object')
        .map(p => (p.avatar = AV.normalize(p.avatar, p.role), p))
    });
    if (o.baseMinutes == null) o.baseMinutes = o.durationMinutes;
    o.paidLines = traduciPagate(o.paidLines);
    o.paidAmt = traduciImporti(o);
    riparaConto(o);
    // vecchio formato: flag "tutto pagato" -> importo incassato
    if (o.paidPark == null) {
      const c = costOf(o);
      o.paidPark = o.parkPaid ? Math.round((c.parkTotal + c.crazyCost) * 100) / 100 : 0;
    }
    if (o.paidBar == null) o.paidBar = Math.max(0, num(o.barPaid, 0));
    return o;
  });
}

function init() {
  settings = Object.assign(defaultSettings(), load(SK.settings) || {});
  aggiornaListinoFinto();
  // migrazione dal vecchio interruttore darkMode
  if (typeof settings.darkMode === 'boolean' && !load(SK.settings)?.theme) {
    settings.theme = settings.darkMode ? 'dark' : 'light';
  }
  // voci bar salvate prima delle categorie: prendo quella di partenza
  if (Array.isArray(settings.barMenu)) {
    const std = defaultSettings().barMenu;
    settings.barMenu.forEach(it => {
      if (!it.cat) {
        const d = std.find(x => x.id === it.id);
        it.cat = d ? d.cat : 'Altro';
      }
    });
  }
  if (!Array.isArray(settings.quickDurations) || !settings.quickDurations.length) {
    settings.quickDurations = [15, 30, 60, 90];
  }
  entries = normalizeEntries(load(SK.entries));
  presets = load(SK.presets) || [];
  if (!presets.length) {
    presets = AV.ROLES.slice(0, 6).map(r => ({ id: uid(), name: r.label, role: r.key, avatar: AV.defaultFor(r.key) }));
    savePresets();
  }
  presets.forEach(p => { p.avatar = AV.normalize(p.avatar, p.role); });

  applyTheme();

  // icone nei tab, davanti all'etichetta
  const emTab = { new: '\u2795', active: '\ud83c\udf9f\ufe0f', settings: '\u2699\ufe0f' };
  $$('.tabs button').forEach(b => {
    b.insertAdjacentHTML('afterbegin', '<span class="em">' + (emTab[b.dataset.tab] || '') + '</span>');
    b.onclick = () => switchTab(b.dataset.tab);
  });


  const clock = () => { $('#clock').textContent = fmtTime(Date.now()); };
  clock();
  clearInterval(clockT);
  clockT = setInterval(clock, 10000);
  clearInterval(tickT);
  avvisiGiaVisti();          // chi era gia' fuori tempo non e' una notizia
  tickT = setInterval(tick, 1000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { clock(); tick(); return; }
    // l'app sta per finire in secondo piano: è il momento buono per la
    // fotografia del giorno, perché da lì può anche non tornare più
    copiaDiOggi(true);
  });

  // all'avvio la seconda copia si allinea comunque, anche se oggi nessuno
  // tocca niente: così l'archivio non resta indietro di giorni
  if (typeof DATI !== 'undefined' && DATI.disponibile()) {
    DATI.scrivi(SK.settings, settings);
    DATI.scrivi(SK.entries, entries);
    DATI.scrivi(SK.presets, presets);
    copiaDiOggi();
  }

  // toccando fuori da una scheda si chiudono pannelli E scheda
  document.addEventListener('pointerdown', (ev) => {
    /* Il foglio del Resto sta sopra tutto, appeso al body: senza questa
       riga il primo tocco su una banconota veniva letto come "hai
       toccato fuori", chiudeva la scheda che volava e il pannello
       tornava al gruppo nuovo -- coi soldi che finivano sul conto
       sbagliato. */
    if (ev.target.closest('.bc-velo')) return;
    const dentro = ev.target.closest('.entry');
    const id = dentro ? dentro.dataset.id : null;
    chiudiPannelli(id);
    chiudiSchede(id);
  }, true);

  switchTab(entries.some(e => e.status === 'active') ? 'active' : 'new');

  mostraAvvisoDati();
  avviaCloud();
  // il backup del giorno parte da solo, ma non nel mezzo dell'apertura
  setTimeout(backupAutomatico, 3000);

  // Funzionamento offline. Con ?nosw nell'indirizzo si disattiva e si
  // ripulisce tutto: serve quando si aggiorna il codice e si vuole essere
  // certi di vedere la versione nuova.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    if (location.search.includes('nosw')) {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
      if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
    } else {
      registraAggiornamenti();
    }
  }
}

/* ---------- aggiornamenti dell'app installata ----------
   L'app installata deve accorgersi da sola che ne è uscita una versione
   nuova. Due accorgimenti che senza non funziona:
   - `updateViaCache: 'none'`: altrimenti il browser controlla il service
     worker usando la propria cache e non si accorge di niente;
   - il controllo si rifà ogni volta che l'app torna in primo piano, non
     solo all'avvio: un tablet da cassa resta aperto per giorni. */
function registraAggiornamenti() {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.update();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
    setInterval(() => reg.update(), 20 * 60000);

    const guarda = (sw) => {
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) pronto(reg);
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) pronto(reg);
    guarda(reg.installing);
    reg.addEventListener('updatefound', () => guarda(reg.installing));
  }).catch(() => {});

  let giaRicaricato = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (giaRicaricato) return;
    giaRicaricato = true;
    location.reload();
  });
}

/* La versione nuova è scaricata e aspetta. Se non c'è niente a metà la si
   applica da sola dopo qualche secondo; se si sta registrando un ingresso
   si aspetta un tocco, perché ricaricare sotto le dita sarebbe peggio. */
let versioneInAttesa = null;
function pronto(reg) {
  versioneInAttesa = reg;
  mostraAvvisoVersione(applicaVersione, impegnatoAdesso());
  if (!impegnatoAdesso()) setTimeout(applicaSePuoi, 2500);
}
function impegnatoAdesso() {
  return !!((draft && draft.touched) || document.querySelector('.e-panel:not(.hidden)'));
}
function applicaVersione() {
  if (versioneInAttesa && versioneInAttesa.waiting) {
    versioneInAttesa.waiting.postMessage({ tipo: 'attiva-adesso' });
  }
}
/* Chiamata anche dopo aver salvato un ingresso: se la versione nuova
   aspettava perche' eri a meta' di qualcosa, adesso entra da sola. */
function applicaSePuoi() {
  if (versioneInAttesa && !impegnatoAdesso()) applicaVersione();
}

function mostraAvvisoVersione(applica, impegnato) {
  if ($('#avvisoVersione')) return;
  const b = el('div', 'avviso-versione');
  b.id = 'avvisoVersione';
  b.innerHTML = '<span class="em">🔄</span>';
  const t = el('div', 'av-txt');
  t.innerHTML = '<b>C’è una versione nuova</b><span>' +
    (impegnato ? 'La metto appena hai finito quello che stai facendo.' : 'La sto applicando…') + '</span>';
  b.appendChild(t);
  const ora = el('button', 'btn btn-sm', 'Aggiorna adesso');
  ora.onclick = applica;
  b.appendChild(ora);
  const main = $('main');
  main.insertBefore(b, main.firstChild);
}

/* Partenza. Di norma si parte subito: i dati sono già lì e l'attesa non
   serve. Solo se la memoria risulta VUOTA vale la pena aspettare l'archivio
   prima di dare i dati per persi. */
function partenza() {
  const vuota = !localStorage.getItem(SK.entries) && !localStorage.getItem(SK.settings);
  if (typeof DATI === 'undefined' || !DATI.disponibile()) { init(); return; }
  if (!vuota) { init(); DATI.avvia([]); return; }
  DATI.avvia([SK.entries, SK.settings, SK.presets]).then(r => {
    init();
    if (r.ripristinate && r.ripristinate.length) {
      const n = lista(load(SK.entries)).length;
      toast('Dati recuperati dall’archivio: ' + n + ' ingressi ♻️');
    }
  }).catch(() => init());
}

partenza();

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

let toastT = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2000);
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
    crazyJumpingPrice: 3,
    theme: 'dark',
    tariffaSuTotale: true,
    tariffs: [
      { m: 10, p: 2 }, { m: 15, p: 3 }, { m: 30, p: 5 }, { m: 45, p: 7 }, { m: 60, p: 9 },
      { m: 75, p: 10 }, { m: 90, p: 12 }, { m: 105, p: 13 }, { m: 120, p: 15 }, { m: 150, p: 18 }, { m: 180, p: 21 }
    ],
    quickDurations: [15, 30, 60, 90],
    barMenu: [
      { id: 'b1', name: 'Acqua', price: 1, em: '💧', cat: 'Bevande' },
      { id: 'b2', name: 'Coca Cola', price: 2.5, em: '🥤', cat: 'Bevande' },
      { id: 'b3', name: 'Caffè', price: 1.2, em: '☕', cat: 'Bevande' },
      { id: 'b4', name: 'Merendina', price: 2, em: '🍪', cat: 'Snack' },
      { id: 'b5', name: 'Panino', price: 4, em: '🥪', cat: 'Snack' }
    ],
    animazioni: true,
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
let editingId = null;
let showArchive = false;
let newBuilt = false;
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
    touched: false
  };
}

/* ---------- calcoli ---------- */
function tariffs() {
  return (settings.tariffs || []).filter(t => t && Number.isFinite(t.m) && t.m > 0).slice().sort((a, b) => a.m - b.m);
}
function priceFor(mins) {
  mins = Math.max(0, num(mins, 0));
  const list = tariffs();
  if (!list.length) return 0;
  for (const t of list) if (mins <= t.m) return t.p;
  const last = list[list.length - 1];
  if (last.m <= 0) return last.p;
  return Math.round(last.p * (mins / last.m) * 100) / 100;
}
function braceletFor(ts) {
  const d = new Date(num(ts, Date.now()));
  const mins = d.getHours() * 60 + d.getMinutes();
  for (const s of (settings.braceletSlots || [])) {
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
  return (e.barItems || []).reduce((s, i) => s + num(i.price, 0) * num(i.qty, 0), 0);
}
function costOf(entry) {
  const children = Math.max(1, clamp(entry.children, 0, 1e6));
  const crazy = clamp(entry.crazyJumping, 0, 1e6) * settings.crazyJumpingPrice;
  let base;
  if (entry.payLater) {
    base = priceFor(up5(Math.max(0, (Date.now() - entry.startTime) / 60000)));
  } else {
    const totMin = clamp(entry.durationMinutes, 0, 1e6) + clamp(entry.crazyJumping, 0, 1e6) * settings.crazyExtraMinutes;
    if (settings.tariffaSuTotale === false) {
      // a scaglioni: la durata iniziale al suo prezzo, il tempo aggiunto al suo
      const iniz = clamp(num(entry.baseMinutes, entry.durationMinutes), 0, 1e6)
        + clamp(entry.crazyJumping, 0, 1e6) * settings.crazyExtraMinutes;
      const agg = Math.max(0, totMin - iniz);
      base = priceFor(up5(iniz)) + (agg > 0 ? priceFor(up5(agg)) : 0);
    } else {
      // sul totale: chi resta un'ora paga la tariffa dell'ora, non 30'+30'
      base = priceFor(up5(totMin));
    }
  }
  return {
    children,
    crazyCost: Math.round(crazy * 100) / 100,
    parkTotal: Math.round(base * children * 100) / 100
  };
}

/* Il dovuto = quanto costa adesso meno quanto e' gia' stato incassato.
   Si registra l'IMPORTO versato, non quali righe: cosi' se il prezzo
   cambia dopo (tempo esteso, bambino aggiunto) la differenza torna
   dovuta invece di restare nascosta sotto una spunta. */
function dueOf(entry) {
  const c = costOf(entry);
  const park = Math.round((c.parkTotal + c.crazyCost) * 100) / 100;
  const bar = Math.round(barTotal(entry) * 100) / 100;
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
function archived() {
  return entries.filter(e => e.status !== 'active')
    .sort((a, b) => (b.closedAt || b.createdAt || 0) - (a.closedAt || a.createdAt || 0));
}
function roleOf(k) { return AV.ROLES.find(r => r.key === k) || AV.ROLES[AV.ROLES.length - 1]; }
function nameOf(p) { return (p.name && p.name.trim()) || roleOf(p.role).label; }

function draftEnd() {
  return draft.startTime + (draft.durationMinutes + draft.crazyJumping * settings.crazyExtraMinutes) * 60000;
}
function draftPrice() {
  return priceFor(up5(draft.durationMinutes + draft.crazyJumping * settings.crazyExtraMinutes)) * Math.max(1, draft.children)
    + draft.crazyJumping * settings.crazyJumpingPrice;
}
function draftBracelet() {
  if (draft.braceletCustom && draft.braceletColor) return { color: draft.braceletColor, label: 'Manuale' };
  const s = braceletFor(draft.startTime);
  return s ? { color: s.color, label: s.label || 'Auto' } : { color: 'var(--txt-3)', label: 'Nessuna fascia' };
}

/* ============================================================
   PANNELLI (bottom sheet)
   ============================================================ */
let sheetEsc = null;
function sheet(title, opts) {
  opts = opts || {};
  const root = $('#modalRoot');
  root.classList.remove('hidden');
  root.innerHTML = '';

  const ov = el('div', 'm-overlay');
  const box = el('div', 'm-box');
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

function buildNewView() {
  const root = $('#view-new');
  root.innerHTML = `
    <div class="edit-banner hidden" id="nEditBanner"></div>

    <div class="card blk c-blu">
      <h2><span class="em">\ud83d\udd52</span> Orario di inizio</h2>
      <div class="blk-in">
      <div class="time-row">
        <button class="round-btn" id="nStartMinus" aria-label="5 minuti prima">\u2212</button>
        <div class="time-display num" id="nStart">--:--</div>
        <button class="round-btn" id="nStartPlus" aria-label="5 minuti dopo">+</button>
        <button class="now-btn" id="nStartNow"><span class="em">\ud83d\udccd</span> Adesso</button>
        <div class="wrist-inline-row">
          <span class="wl-k"><span class="em">\ud83c\udf97\ufe0f</span> Bracciale</span>
          <div class="wrist-row" id="nWrist"></div>
        </div>
      </div>
      </div>
    </div>

    <div class="card blk c-ambra sec-dur">
      <h2><span class="em">\u23f3</span> Quanto restano</h2>
      <div class="blk-in">
      <div class="chips" id="nDur"></div>
      <div class="dur-custom">
        <span class="lab">oppure minuti esatti</span>
        <button class="step-b sm" id="nDurM">\u2212</button>
        <input type="number" id="nDurInput" min="1" step="5" inputmode="numeric" value="60">
        <button class="step-b sm plus" id="nDurP">+</button>
      </div>
      </div>
    </div>

    <div class="card blk c-verde sec-num">
      <h2><span class="em">\ud83e\uddd2</span> Bambini e attrazioni</h2>
      <div class="blk-in">
      <div class="counters">
        <div class="counter">
          <div class="c-lab"><span class="em">\ud83e\uddd2</span> Bambini</div>
          <button class="step-b" id="nChildM">\u2212</button>
          <div class="c-val num" id="nChild">1</div>
          <button class="step-b plus" id="nChildP">+</button>
        </div>
        <div class="counter">
          <div class="c-lab"><span class="em">\ud83e\udd38</span> Crazy Jumping</div>
          <button class="step-b" id="nCrazyM">\u2212</button>
          <div class="c-val num" id="nCrazy">0</div>
          <button class="step-b plus" id="nCrazyP">+</button>
        </div>
      </div>
      </div>
    </div>

    <div class="card blk c-viola sec-people">
      <h2><span class="em">\ud83e\uddd1\u200d\ud83e\udd1d\u200d\ud83e\uddd1</span> Chi accompagna</h2>
      <div class="blk-in">
        <div class="person-list" id="nPeople"></div>
      </div>
    </div>

    <div class="card blk c-ciano sec-bar">
      <div class="sect-head">
        <h2><span class="em">\ud83e\udd64</span> Bar</h2>
        <button class="pill" id="nBarToggle">Apri</button>
      </div>
      <div class="blk-in">
        <div class="bar-wrap hidden" id="nBar"></div>
      </div>
    </div>

    <div class="btn-row" id="nEditRow" style="margin-bottom:8px;"></div>
  `;

  R.nStart = $('#nStart');
  R.nWrist = $('#nWrist');
  R.nDur = $('#nDur');
  R.nDurInput = $('#nDurInput');
  R.nChild = $('#nChild');
  R.nCrazy = $('#nCrazy');
  R.nChildM = $('#nChildM');
  R.nCrazyM = $('#nCrazyM');
  R.nPeople = $('#nPeople');
  R.nBar = $('#nBar');
  R.nEditRow = $('#nEditRow');

  const bump = (fn) => () => { draft.touched = true; fn(); syncNew(); };
  $('#nStartMinus').onclick = bump(() => { draft.startTime -= 5 * 60000; });
  $('#nStartPlus').onclick = bump(() => { draft.startTime += 5 * 60000; });
  $('#nStartNow').onclick = bump(() => { draft.startTime = roundTo5(new Date()).getTime(); draft.braceletCustom = false; });
  $('#nChildM').onclick = bump(() => { draft.children = clamp(draft.children - 1, 0, 999); });
  $('#nChildP').onclick = bump(() => { draft.children = clamp(draft.children + 1, 0, 999); });
  $('#nCrazyM').onclick = bump(() => { draft.crazyJumping = clamp(draft.crazyJumping - 1, 0, 999); });
  $('#nCrazyP').onclick = bump(() => { draft.crazyJumping = clamp(draft.crazyJumping + 1, 0, 999); });

  const setDur = (v) => {
    draft.durationMinutes = clamp(Math.round(v), 1, 99999);
    draft.payLater = false;
    draft.touched = true;
    syncNew();
  };
  $('#nDurM').onclick = () => setDur(draft.durationMinutes - 5);
  $('#nDurP').onclick = () => setDur(draft.durationMinutes + 5);
  R.nDurInput.oninput = () => {
    const v = parseInt(R.nDurInput.value, 10);
    if (Number.isFinite(v) && v > 0) {
      draft.durationMinutes = clamp(v, 1, 99999);
      draft.payLater = false;
      draft.touched = true;
      syncNew({ keepDurInput: true });
    }
  };
  R.nDurInput.onblur = () => { R.nDurInput.value = draft.durationMinutes; };

  const barToggle = $('#nBarToggle');
  barToggle.onclick = () => {
    const open = R.nBar.classList.toggle('hidden');
    barToggle.textContent = open ? 'Apri' : 'Chiudi';
    barToggle.classList.toggle('on', !open);
  };

  buildWristRow();
  buildDurationChips();
  buildBarRows(R.nBar, () => draft.barItems, () => { draft.touched = true; syncNew(); });
  newBuilt = true;
}

function buildDurationChips() {
  R.nDur.innerHTML = '';
  const mk = (label, min, cls) => {
    const b = el('button', 'chip ' + (cls || ''), label);
    b.dataset.min = min;
    R.nDur.appendChild(b);
    return b;
  };
  (settings.quickDurations || [15, 30, 60, 90]).forEach(m => {
    const b = mk(fmtMin(m), m);
    b.onclick = () => { draft.durationMinutes = m; draft.payLater = false; draft.touched = true; syncNew(); };
  });
  const later = mk('🕗 Paga dopo', 'later', 'later');
  later.onclick = () => { draft.payLater = !draft.payLater; draft.touched = true; syncNew(); };
}

/* Bracciali in linea: si tocca il colore, non si apre nessuna finestra.
   E' la STESSA riga in "Nuovo" e nel menu volante della scheda: prima
   erano due cose diverse e non si capiva che facevano la stessa cosa. */
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
  (settings.braceletSlots || []).forEach(sl => {
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

function buildWristRow() {
  costruisciBracciali(R.nWrist, (hex, custom) => {
    draft.braceletColor = hex;
    draft.braceletCustom = custom;
    draft.touched = true;
    syncNew();
  });
}

function buildBarRows(container, getItems, onChange) {
  container.innerHTML = '';
  // raggruppate per categoria, tutte aperte: si trova prima quel che serve
  const cats = [];
  (settings.barMenu || []).forEach(it => {
    const c = (it.cat || 'Altro').trim() || 'Altro';
    let g = cats.find(x => x.nome === c);
    if (!g) { g = { nome: c, voci: [] }; cats.push(g); }
    g.voci.push(it);
  });
  cats.forEach(g => {
    const box = el('div', 'bar-cat');
    box.appendChild(el('div', 'bar-cat-k', g.nome));
    const lista = el('div', 'bar-list');
    g.voci.forEach(it => {
      const row = el('div', 'bar-row');
      row.dataset.id = it.id;
      row.innerHTML =
        '<span style="font-size:20px;">' + esc(it.em || '\ud83e\udd64') + '</span>' +
        '<span class="bname">' + esc(it.name) + '</span>' +
        '<span class="bprice num">' + eur(it.price) + '</span>' +
        '<button class="step-b" style="width:40px;height:40px;font-size:20px;" data-d="-1">\u2212</button>' +
        '<span class="bqty num">0</span>' +
        '<button class="step-b plus" style="width:40px;height:40px;font-size:20px;" data-d="1">+</button>';
      row.querySelectorAll('[data-d]').forEach(b => {
        b.onclick = () => {
          const items = getItems();
          let bi = items.find(x => x.id === it.id);
          if (!bi) { bi = { id: it.id, name: it.name, price: it.price, qty: 0 }; items.push(bi); }
          bi.qty = clamp(bi.qty + parseInt(b.dataset.d, 10), 0, 9999);
          bi.price = it.price;
          bi.name = it.name;
          onChange();
        };
      });
      lista.appendChild(row);
    });
    box.appendChild(lista);
    container.appendChild(box);
  });
}
function syncBarRows(container, items) {
  $$('.bar-row', container).forEach(row => {
    const bi = (items || []).find(x => x.id === row.dataset.id);
    const q = bi ? bi.qty : 0;
    $('.bqty', row).textContent = q;
    row.classList.toggle('has-qty', q > 0);
  });
}

/* Lista persone (draft e schede).
   Si ridisegna solo se qualcosa è davvero cambiato: senza questo controllo
   ogni tocco su "+1 bambino" ricostruirebbe anche tutti gli sprite. */
function syncPeople(container, people, onChange) {
  /* Se arriva un ELENCO diverso (per esempio si apre in modifica un
     altro ingresso) va ridisegnato anche se il contenuto e' uguale:
     altrimenti i tasti restano agganciati all'elenco di prima e la
     persona finisce nell'ingresso sbagliato. */
  if (container.__lista !== people) {
    container.__lista = people;
    container.dataset.sig = '';
  }
  const sig = people.map(p => p.id + '|' + (p.name || '') + '|' + (p.note || '') + '|' + JSON.stringify(p.avatar)).join('\u00a7')
    + '|apri:' + (container.dataset.apri || '');
  if (container.dataset.sig === sig) return;
  container.dataset.sig = sig;
  container.innerHTML = '';

  const rinfresca = () => { container.dataset.sig = ''; syncPeople(container, people, onChange); };
  const aggiungi = (person, apriSubito) => {
    people.push(person);
    if (apriSubito) container.dataset.apri = person.id;
    onChange();
    rinfresca();
  };

  /* La persona: solo l'editor. Il banner compatto che stava qui sopra
     (avatar piccolo, nome, pennello, X e tratti colorati) faceva vedere
     due volte le stesse cose. E il riferimento e' UNO solo. */
  people.forEach(p => {
    p.avatar = AV.normalize(p.avatar, p.role);
    const blocco = el('div', 'p-blocco aperto');
    const ed = el('div', 'p-editor');

    const barra = el('div', 'ed-barra');
    barra.appendChild(el('span', 'ed-tit', '\ud83c\udfa8 Com\u2019\u00e8 vestito ' + roleOf(p.role).label.toLowerCase()));
    const nome = el('input', 'ed-nome');
    nome.placeholder = 'Nome (facoltativo)';
    nome.value = p.name || '';
    nome.oninput = () => { p.name = nome.value; onChange(); };
    barra.appendChild(nome);
    const via = el('button', 'ed-via', '\u2715');
    via.title = 'Togli questa persona';
    via.onclick = () => {
      const k = people.indexOf(p);
      if (k > -1) people.splice(k, 1);
      onChange();
      rinfresca();
    };
    barra.appendChild(via);

    buildAvatarEditor(ed, p, () => {
      container.dataset.sig = '';   // la prossima volta ridisegna davvero
      onChange();
    });
    ed.insertBefore(barra, ed.firstChild);
    blocco.appendChild(ed);
    container.appendChild(blocco);
  });

  /* la scelta: subito visibile se non c'è nessuno, dietro un "+" se ce n'è già */
  const scelta = el('div', 'p-scelta');
  /* il riferimento e' uno solo: finche' c'e' una persona non si sceglie */
  const mostraScelta = people.length === 0;

  if (mostraScelta) {
    /* i ruoli: la scelta principale. Emoji grande, si trova a colpo d'occhio
       molto prima di uno sprite. Chi si aggiunge parte NEUTRO (AV.baseFor):
       caratteristiche del ruolo, niente accessori, tinte da cambiare al volo. */
    const griglia = el('div', 'who-pick ruoli');
    AV.ROLES.forEach(r => {
      const b = el('button', 'wp wp-role');
      const em = el('div', 'wp-em');
      em.innerHTML = '<span class="em">' + r.em + '</span>';
      b.appendChild(em);
      b.appendChild(el('div', 'wp-n', r.label));
      b.onclick = () => {
        container.dataset.scegli = '';
        /* Scelta l'emoji si apre SUBITO il palco: e' il flusso che ha
           scelto guardando il modello E2. (All'inizio lo aprivo e gli
           dava fastidio, ma allora l'editor era quello vecchio, lungo
           e da scorrere.) */
        aggiungi({ id: uid(), role: r.key, name: '', avatar: AV.baseFor(r.key), note: '' }, true);
      };
      griglia.appendChild(b);
    });
    scelta.appendChild(griglia);

    /* gli avatar salvati: scorciatoia, in secondo piano */
    if (presets.length) {
      const sav = el('details', 'p-preset');
      const sum = el('summary');
      sum.innerHTML = '\ud83d\uddbc\ufe0f oppure usa un avatar gi\u00e0 pronto (' + presets.length + ')';
      sav.appendChild(sum);
      const g2 = el('div', 'who-pick');
      presets.forEach(p => {
        const b = el('button', 'wp wp-preset');
        const av = el('div', 'wp-av');
        av.innerHTML = AV.build(p.avatar);
        b.appendChild(av);
        b.appendChild(el('div', 'wp-n', p.name || roleOf(p.role).label));
        b.onclick = () => {
          container.dataset.scegli = '';
          aggiungi({
            id: uid(), role: p.role || 'altro', name: p.name || '',
            avatar: JSON.parse(JSON.stringify(AV.normalize(p.avatar, p.role))), note: ''
          }, true);
        };
        g2.appendChild(b);
      });
      sav.appendChild(g2);
      scelta.appendChild(sav);
    }
  }
  container.appendChild(scelta);
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
  if (tab === 'new') syncNew();
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
    entries = normalizeEntries(d.gp_entries || []);
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
function syncNew(opts) {
  if (!newBuilt) return;
  opts = opts || {};
  R.nStart.textContent = fmtTime(draft.startTime);

  // bracciale: la stessa riga, aggiornata dalla stessa funzione della scheda
  sincronizzaBracciali(R.nWrist, draft.startTime, draft.braceletColor, draft.braceletCustom);

  $$('[data-min]', R.nDur).forEach(b => {
    const v = b.dataset.min;
    if (v === 'later') b.classList.toggle('on', draft.payLater);
    else b.classList.toggle('on', !draft.payLater && draft.durationMinutes === parseInt(v, 10));
  });
  if (!opts.keepDurInput && document.activeElement !== R.nDurInput) {
    R.nDurInput.value = draft.durationMinutes;
  }
  R.nDurInput.parentElement.style.opacity = draft.payLater ? '0.4' : '';

  R.nChild.textContent = draft.children;
  R.nCrazy.textContent = draft.crazyJumping;
  R.nChildM.disabled = draft.children <= 0;
  R.nCrazyM.disabled = draft.crazyJumping <= 0;

  syncPeople(R.nPeople, draft.people, () => { draft.touched = true; syncActionBar(); });
  syncBarRows(R.nBar, draft.barItems);

  // riga "annulla modifica": si tocca solo quando cambia davvero
  const editSig = editingId || '';
  if (R.nEditRow.dataset.sig !== editSig) {
    R.nEditRow.dataset.sig = editSig;
    R.nEditRow.innerHTML = '';
    if (editingId) {
      const b = el('button', 'btn btn-ghost', '✕ Annulla le modifiche');
      b.onclick = () => { editingId = null; draft = freshDraft(); syncNew(); switchTab('active'); };
      R.nEditRow.appendChild(b);
    }
  }
  // quando si modifica un ingresso deve essere lampante
  const avviso = document.getElementById('nEditBanner');
  if (avviso) {
    avviso.classList.toggle('hidden', !editingId);
    if (editingId) {
      const e = entries.find(x => x.id === editingId);
      const chi = e && (e.people || []).length ? (e.people || []).map(nameOf).join(', ') : 'gruppo senza riferimento';
      avviso.innerHTML = '<span class="em">✏️</span> Stai modificando un ingresso già registrato — <b>' + esc(chi) + '</b>';
    }
  }
  document.getElementById('app').classList.toggle('in-modifica', !!editingId);

  syncActionBar();
}

function syncActionBar() {
  const ab = $('#actionbar');
  if (tab !== 'new') { ab.classList.add('hidden'); return; }
  ab.classList.remove('hidden');

  const c = { children: Math.max(1, draft.children), crazy: draft.crazyJumping };
  const minuti = draft.durationMinutes + draft.crazyJumping * settings.crazyExtraMinutes;
  const parco = draft.payLater ? 0 : Math.round(priceFor(up5(minuti)) * c.children * 100) / 100;
  const crazy = Math.round(c.crazy * settings.crazyJumpingPrice * 100) / 100;
  const bar = Math.round(draft.barItems.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;

  $('#abNow').textContent = fmtTime(draft.startTime);
  $('#abArrow').textContent = '\u2192';
  $('#abEnd').textContent = draft.payLater ? 'aperta' : fmtTime(draftEnd());
  $('#abParco').textContent = draft.payLater ? 'a consumo' : eur(parco);
  $('#abCrazy').textContent = eur(crazy);
  $('#abCrazyBox').classList.toggle('hidden', crazy <= 0);
  $('#abBar').textContent = eur(bar);
  $('#abBarBox').classList.toggle('hidden', bar <= 0);
  $('#abEur').textContent = draft.payLater ? eur(crazy + bar) + '+' : eur(parco + crazy + bar);
  $('#abSave').textContent = editingId ? 'Salva modifiche' : 'Registra';
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
      onPick({ id: uid(), role: r.key, name: '', avatar: AV.defaultFor(r.key), note: '' });
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
      // nel modello sono righe di testo puntate, non pastiglie
      AV.traits(av, 4).forEach(t => {
        trattiVivi.appendChild(el('div', 'ed-tr', '\u2022 ' + t.txt));
      });
    }
    if (prev) prev.innerHTML = AV.build(av);
    if (traits) {
      traits.innerHTML = '';
      AV.traits(av, 5).forEach(t => traits.appendChild(traitChip(t)));
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
    sezioni.push({ icona: icona, titolo: titolo, node: r });
    return r;
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

  const patterns = (r, get, set, colGet, col2Get, col2Set) => {
    const sc = el('div', 'ed-cols');
    sc.appendChild(el('span', 'ed-sub', 'fantasia'));
    AV.PATTERNS.forEach(p => {
      const b = el('button', 'ed-col ed-pat' + (get() === p.key ? ' on' : ''));
      b.title = p.n;
      b.innerHTML = campionePattern(colGet(), col2Get(), p.key);
      b.onclick = () => {
        set(p.key);
        $$('.ed-col', sc).forEach(o => o.classList.remove('on'));
        b.classList.add('on');
        aggiorna();
        $$('.ed-pat', sc).forEach((x, i) => { x.innerHTML = campionePattern(colGet(), col2Get(), AV.PATTERNS[i].key); });
      };
      sc.appendChild(b);
    });
    r.appendChild(sc);
    /* il secondo colore della fantasia */
    const r2 = colori(r, AV.COLORS, col2Get, (v) => { col2Set(v); }, 'colore della fantasia');
    return sc;
  };
  function campionePattern(c1, c2, key) {
    const d = {
      solid: '<rect width="24" height="24" fill="' + c1 + '"/>',
      'stripes-h': '<rect width="24" height="24" fill="' + c1 + '"/><rect width="24" height="6" y="3" fill="' + c2 + '"/><rect width="24" height="6" y="15" fill="' + c2 + '"/>',
      'stripes-v': '<rect width="24" height="24" fill="' + c1 + '"/><rect width="6" height="24" x="3" fill="' + c2 + '"/><rect width="6" height="24" x="15" fill="' + c2 + '"/>',
      dots: '<rect width="24" height="24" fill="' + c1 + '"/><circle cx="8" cy="8" r="3" fill="' + c2 + '"/><circle cx="17" cy="16" r="3" fill="' + c2 + '"/>',
      plaid: '<rect width="24" height="24" fill="' + c1 + '"/><rect y="9" width="24" height="5" fill="' + c2 + '"/><rect x="9" width="5" height="24" fill="' + c2 + '"/>',
      camo: '<rect width="24" height="24" fill="' + c1 + '"/><ellipse cx="7" cy="8" rx="6" ry="4.6" fill="' + AV.shade(c1, -34) + '"/><ellipse cx="18" cy="17" rx="6" ry="4.6" fill="' + c2 + '"/>',
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
  colori(rTop, AV.COLORS, () => av.top.color, v => { av.top.color = v; });
  patterns(rTop, () => av.top.pattern, v => { av.top.pattern = v; },
    () => av.top.color, () => av.top.color2, v => { av.top.color2 = v; });

  const rPants = riga('pantaloni', 'Sotto', 'pants');
  stili(rPants, AV.PANTS, () => av.pants.style, v => { av.pants.style = v; }, 'gambe');
  colori(rPants, AV.COLORS, () => av.pants.color, v => { av.pants.color = v; });
  patterns(rPants, () => av.pants.pattern, v => { av.pants.pattern = v; },
    () => av.pants.color, () => av.pants.color2, v => { av.pants.color2 = v; });

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
function commitEntry() {
  if (!draft.braceletCustom) {
    const slot = braceletFor(draft.startTime);
    draft.braceletColor = slot ? slot.color : null;
  }
  if (editingId) {
    const e = entries.find(x => x.id === editingId);
    if (e) {
      Object.assign(e, {
        startTime: draft.startTime, durationMinutes: draft.durationMinutes, payLater: draft.payLater,
        children: draft.children, crazyJumping: draft.crazyJumping,
        people: draft.people, barItems: draft.barItems,
        braceletColor: draft.braceletColor, braceletCustom: draft.braceletCustom
      });
    }
    editingId = null;
    toast('Ingresso aggiornato ✅');
  } else {
    entries.push({
      id: uid(), createdAt: Date.now(),
      startTime: draft.startTime, durationMinutes: draft.durationMinutes, payLater: draft.payLater,
      children: draft.children, crazyJumping: draft.crazyJumping,
      people: draft.people, barItems: draft.barItems || [],
      braceletColor: draft.braceletColor, braceletCustom: draft.braceletCustom,
      status: 'active', barPaid: 0, parkPaid: false, paidLines: {},
      baseMinutes: draft.durationMinutes, paidPark: 0, paidBar: 0
    });
    toast('Ingresso registrato ✅');
  }
  saveEntries();
  draft = freshDraft();
  switchTab('active');
  // se una versione nuova stava aspettando che finissi, adesso puo' entrare
  if (typeof applicaSePuoi === 'function') setTimeout(applicaSePuoi, 1200);
}

/* ============================================================
   VISTA: IN CORSO
   ============================================================ */
function buildActiveView() {
  const root = $('#view-active');
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
  arch.onclick = () => { showArchive = !showArchive; buildActiveView(); };
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
  list.forEach(entry => box.appendChild(showArchive ? archiveCard(entry) : entryCard(entry)));
  root.appendChild(box);
  if (!showArchive) tick();
}

function archiveCard(entry) {
  const d = el('div', 'arch');
  const info = el('div', 'ainfo');
  const who = (entry.people || []).map(nameOf).join(', ') || 'Nessun riferimento';
  info.innerHTML = `<b>${entry.status === 'cancelled' ? '🗑️ Annullato' : '✅ Chiuso'}</b> · ${fmtDate(entry.startTime)} ${fmtTime(entry.startTime)}<br>${esc(who)} · 🧒 ${clamp(entry.children, 0, 1e6)}`;
  d.appendChild(info);
  const rest = el('button', 'btn btn-sm', '\u21a9\ufe0e');
  rest.title = 'Ripristina';
  rest.onclick = () => {
    entry.status = 'active';
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
  /* Se questo ingresso e' aperto nel modulo, va detto: toccarne i
     numeri qui mentre lo modifichi di la' vuol dire perderli appena
     premi Registra. */
  const inModifica = (typeof editingId !== 'undefined' && editingId === entry.id);
  if (inModifica) card.classList.add('in-modifica');

  const people = (entry.people || []).map(p => (p.avatar = AV.normalize(p.avatar, p.role), p));

  /* ================= LA RIGA (modello R1-a) =================
     figura | chi e' + tratti + orari | bracciale | countdown | soldi */
  const riga = el('div', 'e-riga');

  /* la figura non si taglia mai: all'uscita servono anche i pantaloni
     e le scarpe per capire chi e'. */
  const avBox = el('div', 'e-av' + (people.length > 1 ? ' multi' : ''));
  /* Senza riferimento il posto della figura DIVENTA il tasto per
     metterlo: si tocca li', dove l'occhio guarda gia'. */
  if (!people.length) {
    avBox.classList.add('manca');
    avBox.title = 'Nessun riferimento \u2014 tocca per metterlo';
    avBox.appendChild(el('div', 'segno', '\u2795'));
    avBox.appendChild(el('div', 'dillo', 'metti chi \u00e8'));
    avBox.onclick = (ev) => {
      ev.stopPropagation();
      pickRole(p => {
        entry.people = entry.people || [];
        entry.people.push(p);
        saveEntries();
        openCustomizer(p, () => { saveEntries(); redrawCard(entry); });
      });
    };
  } else {
    people.slice(0, 2).forEach(p => {
      const a = el('div', 'av');
      a.innerHTML = AV.build(p.avatar);
      a.title = 'Modifica ' + nameOf(p);
      a.onclick = (ev) => {
        ev.stopPropagation();
        openCustomizer(p, () => { saveEntries(); redrawCard(entry); });
      };
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
    tratti.textContent = AV.traits(people[0].avatar, 3).map(t => t.txt).join(' \u00b7 ');
  } else if (people.length) {
    tratti.textContent = people.slice(0, 2)
      .map(p => (AV.traits(p.avatar, 1)[0] || {}).txt || '').filter(Boolean).join(' \u00b7 ');
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

  const count = el('div', 'e-conto num', '--:--');
  riga.appendChild(count);

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
      entry[key] = clamp(num(entry[key], 0) + d, 0, 99999);
      saveEntries();
      syncCard(entry);
      tick();
    };
    minus.onclick = bump(-step);
    plus.onclick = bump(step);
    if (inModifica) { minus.disabled = true; plus.disabled = true; box.classList.add('spento'); }
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
    fila.appendChild(el('div', 'e-later-tag', '\ud83d\udd57 Paga dopo'));
  }

  if (inModifica) {
    const avviso = el('div', 'e-inmod');
    avviso.appendChild(el('span', null, '\u270f\ufe0f Lo stai modificando in Nuovo'));
    const vai = el('button', 'btn btn-sm', 'Vai al modulo');
    vai.onclick = (ev) => { ev.stopPropagation(); switchTab('new'); };
    avviso.appendChild(vai);
    dentro.appendChild(avviso);
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

  /* Il Conto si porta dentro il Bar, com'e' nel modello: un pannello solo */
  const payPanel = el('div', 'e-panel hidden');
  /* Il bar sta in una tendina CHIUSA: quasi sempre si apre il conto per
     incassare, non per aggiungere una Coca. */
  const barTendina = el('details', 'bar-tendina');
  const barSomma = el('summary');
  barSomma.innerHTML = '<span class="bt-k">\ud83e\udd64 Bar</span>' +
    '<span class="bt-hint">aggiungi consumazioni</span>' +
    '<span class="bt-tot num"></span><span class="bt-frec">\u25be</span>';
  barTendina.appendChild(barSomma);
  const barBox = el('div', 'bar-dentro');
  barTendina.appendChild(barBox);
  const payBox = el('div');
  payPanel.appendChild(barTendina);
  payPanel.appendChild(payBox);
  buildBarRows(barBox, () => (entry.barItems = entry.barItems || []), () => {
    saveEntries();
    syncBarRows(barBox, entry.barItems);
    syncCard(entry);
  });
  const buildPay = () => buildPaymentPanel(payBox, entry, () => { syncCard(entry); });
  dentro.appendChild(payPanel);

  /* Modifica e' quello che si tocca meno: solo la matita, piccola e a
     sinistra, cosi' lo spazio va a Bar & Conto e all'Uscita */
  mkAct('\u270f\ufe0f', 'piccolo', (ev) => { ev.stopPropagation(); vaiAModifica(entry); }).title = 'Modifica';
  const payBtn = mkAct('\ud83e\uddfe Bar & Conto', 'conto', (ev) => {
    ev.stopPropagation();
    /* la misura va presa ADESSO, prima che il pannello si apra: se la
       prendo dopo, il buco lasciato nella lista e' troppo corto e tutte
       le schede sotto saltano su */
    const misura = card.getBoundingClientRect();
    const chiuso = payPanel.classList.contains('hidden');
    chiudiPannelli(entry.id);
    payPanel.classList.toggle('hidden', !chiuso);
    payBtn.classList.toggle('on', chiuso);
    if (chiuso) {
      syncBarRows(barBox, entry.barItems);
      buildPay();
      const t = barSomma.querySelector('.bt-tot');
      const b = barTotal(entry);
      t.textContent = b > 0 ? eur(b) : '';
      /* la scheda si stacca e vola: cosi' il conto ci sta tutto senza
         scorrere mezza pagina, e il resto della lista si sfoca */
      alza(card, misura);
    } else {
      posa(card);
    }
  });
  mkAct('\ud83d\udeaa Uscita', 'forte', (ev) => { ev.stopPropagation(); chiudiIngresso(entry); });

  const notes = people.filter(p => p.note && p.note.trim());
  if (notes.length) {
    dentro.appendChild(el('div', 'e-note', notes.map(p => '\ud83d\udcdd ' + p.note.trim()).join(' \u00b7 ')));
  }

  card.panels = [[payPanel, payBtn]];
  card.appendChild(aperta);

  /* un tocco ovunque sulla riga apre; dentro non si chiude */
  riga.onclick = () => {
    const gia = card.classList.contains('aperto');
    chiudiSchede(null);
    if (!gia) card.classList.add('aperto');
  };
  aperta.onclick = (ev) => ev.stopPropagation();

  cardRefs.set(entry.id, {
    card, count, range, sKids, sCrazy, sTime,
    dueVal: soldiV, soldiK, soldi, barBox, wrist, bimbiV,
    barPanel: payPanel, barBtn: payBtn, payPanel, payBtn, buildPay
  });
  syncCard(entry);
  return card;
}


/* ============================================================
   CASSA RAPIDA — la terza linguetta.
   Per chi passa solo a consumare, o per segnare una cosa al volo
   senza aprire un ingresso. Ci sono comunque bambini, Crazy e le
   fasce di tempo, cosi' da qui parte anche un ingresso vero.
   ============================================================ */
const cassa = { bar: [], children: 0, crazy: 0, minutes: 0 };

function cassaBarTot() {
  return cassa.bar.reduce((a, i) => a + num(i.price, 0) * num(i.qty, 0), 0);
}
/* Il parco si conta SOLO se c'e' almeno un bambino: qui zero bambini
   vuol dire "e' passato solo a bere", non "un ingresso da uno". */
function cassaParcoTot() {
  if (cassa.children <= 0) return 0;
  const finto = {
    children: cassa.children, crazyJumping: cassa.crazy,
    durationMinutes: cassa.minutes || settings.defaultMinutes || 60,
    payLater: false, barItems: []
  };
  const c = costOf(finto);
  return Math.round((c.parkTotal + c.crazyCost) * 100) / 100;
}
function cassaTot() { return Math.round((cassaBarTot() + cassaParcoTot()) * 100) / 100; }

function buildCassaView() {
  const root = $('#view-cassa');
  root.innerHTML = '';

  const testa = el('div', 'cassa-testa');
  const tot = el('div', 'cassa-tot');
  tot.appendChild(el('span', 'k', 'da incassare'));
  const totV = el('span', 'v num', eur(0));
  tot.appendChild(totV);
  testa.appendChild(tot);
  const tasti = el('div', 'cassa-tasti');
  const incassa = el('button', 'btn btn-ok', '\u2705 Incassa');
  const restoBtn = el('button', 'btn btn-resto', '\ud83e\uddee Resto');
  tasti.appendChild(incassa);
  tasti.appendChild(restoBtn);
  testa.appendChild(tasti);
  root.appendChild(testa);
  const restoQui = el('div');
  root.appendChild(restoQui);

  /* Gli stessi blocchi di "Nuovo", nello stesso ordine e con gli stessi
     pezzi: quanto restano (ambra), bambini e attrazioni (verde), bar
     (ciano). Prima questa vista aveva una faccia tutta sua. */

  const cTempo = el('div', 'card blk c-ambra');
  cTempo.innerHTML = '<h2><span class="em">\u23f3</span> Quanto restano</h2>';
  const inTempo = el('div', 'blk-in');
  const tempi = el('div', 'chips');
  const OPZ = [[10, '10m'], [15, '15m'], [30, '30m'], [60, '1h']];
  const chipTempo = [];
  OPZ.forEach(o => {
    const b = el('button', 'chip');
    b.textContent = o[1];
    b.onclick = () => { cassa.minutes = o[0]; rinfresca(); };
    chipTempo.push([b, o[0]]);
    tempi.appendChild(b);
  });
  const soloBar = el('button', 'chip', '\ud83e\udd64 Solo bar');
  soloBar.onclick = () => { cassa.minutes = 0; cassa.children = 0; cassa.crazy = 0; rinfresca(); };
  chipTempo.push([soloBar, 0]);
  tempi.appendChild(soloBar);
  inTempo.appendChild(tempi);

  const custom = el('div', 'dur-custom');
  custom.appendChild(el('span', 'lab', 'oppure minuti esatti'));
  const meno = el('button', 'step-b sm', '\u2212');
  const inp = el('input');
  inp.type = 'number'; inp.min = '5'; inp.step = '5'; inp.inputMode = 'numeric';
  inp.value = cassa.minutes || 60;
  const piu = el('button', 'step-b sm plus', '+');
  meno.onclick = () => { cassa.minutes = Math.max(5, (cassa.minutes || 60) - 5); rinfresca(); };
  piu.onclick = () => { cassa.minutes = Math.min(600, (cassa.minutes || 0) + 5); rinfresca(); };
  inp.oninput = () => { cassa.minutes = clamp(parseInt(inp.value, 10) || 0, 0, 600); rinfresca({ nonToccareInput: true }); };
  custom.appendChild(meno); custom.appendChild(inp); custom.appendChild(piu);
  inTempo.appendChild(custom);
  cTempo.appendChild(inTempo);

  const cNum = el('div', 'card blk c-verde');
  cNum.innerHTML = '<h2><span class="em">\ud83e\uddd2</span> Bambini e attrazioni</h2>';
  const inNum = el('div', 'blk-in');
  const conta = el('div', 'counters');
  const contatore = (em, testo, chiave) => {
    const box = el('div', 'counter');
    const lab = el('div', 'c-lab');
    lab.innerHTML = '<span class="em">' + em + '</span> ' + testo;
    const m = el('button', 'step-b', '\u2212');
    const v = el('div', 'c-val num', '0');
    const p = el('button', 'step-b plus', '+');
    m.onclick = () => { cassa[chiave] = Math.max(0, cassa[chiave] - 1); rinfresca(); };
    p.onclick = () => { cassa[chiave] = cassa[chiave] + 1; rinfresca(); };
    box.appendChild(lab); box.appendChild(m); box.appendChild(v); box.appendChild(p);
    conta.appendChild(box);
    return { v: v, m: m };
  };
  const cBimbi = contatore('\ud83e\uddd2', 'Bambini', 'children');
  const cCrazy = contatore('\ud83e\udd38', 'Crazy Jumping', 'crazy');
  inNum.appendChild(conta);
  inNum.appendChild(el('div', 'hint', 'Zero bambini vuol dire che \u00e8 passato solo a consumare: il parco non si conta.'));
  cNum.appendChild(inNum);

  const cBar = el('div', 'card blk c-ciano');
  const testaBar = el('div', 'sect-head');
  testaBar.innerHTML = '<h2><span class="em">\ud83e\udd64</span> Bar</h2>';
  cBar.appendChild(testaBar);
  const inBar = el('div', 'blk-in');
  const barBox = el('div');
  buildBarRows(barBox, () => cassa.bar, () => { rinfresca(); });
  inBar.appendChild(barBox);
  cBar.appendChild(inBar);

  root.appendChild(cTempo);
  root.appendChild(cNum);
  root.appendChild(cBar);

  /* --- in fondo: svuota, oppure fallo diventare un ingresso vero --- */
  const fondo = el('div', 'cassa-fondo');
  const svuota = el('button', 'btn', '\ud83e\uddf9 Svuota');
  svuota.onclick = () => {
    cassa.bar = []; cassa.children = 0; cassa.crazy = 0; cassa.minutes = 0;
    buildCassaView();
  };
  const diventa = el('button', 'btn btn-primary', '\u27a1\ufe0f Fanne un ingresso');
  diventa.onclick = () => {
    /* Qui si fa un ingresso NUOVO: se restava acceso "sto modificando
       quell'altro", premere Registra lo avrebbe sovrascritto. */
    editingId = null;
    draft.children = Math.max(1, cassa.children);
    draft.crazyJumping = cassa.crazy;
    draft.durationMinutes = cassa.minutes || settings.defaultMinutes || 60;
    draft.barItems = JSON.parse(JSON.stringify(cassa.bar));
    draft.startTime = roundTo5(new Date()).getTime();
    draft.payLater = false;
    draft.people = [];
    draft.braceletColor = null;
    draft.braceletCustom = false;
    draft.touched = true;
    cassa.bar = []; cassa.children = 0; cassa.crazy = 0; cassa.minutes = 0;
    switchTab('new');
  };
  fondo.appendChild(svuota);
  fondo.appendChild(diventa);
  root.appendChild(fondo);

  function rinfresca(opz) {
    const t = cassaTot();
    totV.textContent = eur(t);
    cBimbi.v.textContent = cassa.children;
    cCrazy.v.textContent = cassa.crazy;
    cBimbi.m.disabled = cassa.children <= 0;
    cCrazy.m.disabled = cassa.crazy <= 0;
    chipTempo.forEach(([b, m]) => b.classList.toggle('on', m === cassa.minutes));
    if (!(opz && opz.nonToccareInput) && document.activeElement !== inp) inp.value = cassa.minutes || '';
    incassa.disabled = t <= 0;
    incassa.textContent = t > 0 ? '\u2705 Incassa ' + eur(t) : '\u2705 Incassa';
    diventa.disabled = cassa.children <= 0;
    syncBarRows(barBox, cassa.bar);
  }

  const registra = (preso) => {
    /* finisce in archivio come conto gia' saldato: cosi' entra nei
       totali del giorno e nelle copie, senza un magazzino a parte */
    entries.push({
      id: uid(), createdAt: Date.now(), startTime: Date.now(),
      durationMinutes: cassa.minutes || 0, payLater: false,
      children: cassa.children, crazyJumping: cassa.crazy,
      people: [], barItems: JSON.parse(JSON.stringify(cassa.bar)),
      braceletColor: null, braceletCustom: true,
      status: 'closed', closedAt: Date.now(), cassaRapida: true,
      paidLines: {}, paidPark: cassaParcoTot(), paidBar: cassaBarTot(),
      barPaid: 0, parkPaid: false
    });
    saveEntries();
    cassa.bar = []; cassa.children = 0; cassa.crazy = 0; cassa.minutes = 0;
    buildCassaView();
    updateBadge();
    toast('Incassati ' + eur(preso));
  };

  incassa.onclick = () => { const t = cassaTot(); if (t > 0) registra(t); };
  restoBtn.onclick = () => {
    const gia = restoQui.querySelector('.resto-box');
    if (gia) { gia.remove(); restoBtn.classList.remove('on'); return; }
    const t = cassaTot();
    if (t <= 0) return;
    restoBtn.classList.add('on');
    restoQui.appendChild(pannelloResto(null, t, (preso) => {
      restoBtn.classList.remove('on');
      registra(preso);
    }));
  };

  rinfresca();
}

/* ================= LA SCHEDA CHE VOLA =================
   Con Bar & Conto la scheda si stacca dalla lista e si mette al centro
   dello schermo, sopra tutto, con il resto sfocato dietro. Al suo posto
   resta un buco della stessa altezza, cosi' la lista non sussulta.
   Il volo e' un'animazione vera: parte dal punto esatto in cui stava. */
let volante = null;

function alza(card, misura) {
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

  volante = { card: card, buco: buco, velo: velo, da: r };
  velo.onclick = () => posa(card);

  /* il browser deve "vedere" la posizione di partenza prima di
     ricevere quella d'arrivo, altrimenti salta senza animare */
  void card.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    velo.classList.add('on');
    const larg = Math.min(Math.max(r.width, 320), window.innerWidth - 20);
    card.style.left = Math.round((window.innerWidth - larg) / 2) + 'px';
    card.style.top = '10px';
    card.style.width = larg + 'px';
    card.style.maxHeight = (window.innerHeight - 20) + 'px';
  }));
}

function posa(card) {
  if (!volante || volante.card !== card) return;
  const v = volante;
  volante = null;
  /* chiudendo dal velo va chiuso anche il pannello, altrimenti il tasto
     resta acceso e al tocco dopo fa il contrario di quello che sembra */
  const rif = cardRefs.get(card.dataset.id);
  if (rif && rif.payPanel) {
    rif.payPanel.classList.add('hidden');
    rif.payBtn.classList.remove('on');
  }
  const r = v.buco.getBoundingClientRect();
  v.velo.classList.remove('on');
  card.style.maxHeight = '';
  card.style.left = r.left + 'px';
  card.style.top = r.top + 'px';
  card.style.width = r.width + 'px';
  const fine = () => {
    card.classList.remove('vola');
    card.style.left = card.style.top = card.style.width = card.style.maxHeight = '';
    if (v.buco.parentNode) v.buco.remove();
    if (v.velo.parentNode) v.velo.remove();
  };
  const tempo = anima() ? 500 : 0;
  setTimeout(fine, tempo);
}

/* Posa senza volo: serve quando si cambia vista, dove l'animazione
   non si vedrebbe comunque e lascerebbe solo roba appesa. */
function posaSubito(card) {
  if (!volante || volante.card !== card) return;
  const v = volante;
  volante = null;
  const rif = cardRefs.get(card.dataset.id);
  if (rif && rif.payPanel) { rif.payPanel.classList.add('hidden'); rif.payBtn.classList.remove('on'); }
  card.classList.remove('vola');
  card.style.left = card.style.top = card.style.width = card.style.maxHeight = '';
  if (v.buco.parentNode) v.buco.remove();
  if (v.velo.parentNode) v.velo.remove();
}

/* Modifica: la lista scivola a sinistra e arriva "Nuovo", cosi' si
   capisce dove si sta andando invece di trovarsi altrove di colpo. */
function anima() {
  return settings.animazioni !== false;
}

function vaiAModifica(entry) {
  if (volante) posa(volante.card);
  const vista = $('#view-active');
  if (!anima()) { editEntry(entry); return; }
  vista.classList.add('esce-sx');
  setTimeout(() => {
    vista.classList.remove('esce-sx');
    editEntry(entry);
    const nuova = $('#view-new');
    nuova.classList.add('entra-dx');
    setTimeout(() => nuova.classList.remove('entra-dx'), 300);
  }, 200);
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
    if (r.barPanel && !r.barPanel.classList.contains('hidden')) { r.barPanel.classList.add('hidden'); r.barBtn.classList.remove('on'); }
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
    entry.status = 'closed';
    entry.closedAt = Date.now();
    saveEntries();
    buildActiveView();
    updateBadge();
    toast('Uscita registrata \u2705');
  };
  const d = dueOf(entry);
  if (d.total > 0) {
    confirmSheet('Restano ' + eur(d.total) + ' da incassare',
      'Vuoi far uscire questo gruppo lo stesso? L\'ingresso finisce in archivio e puoi riaprirlo.', fine);
  } else fine();
}

/* ============================================================
   CONTO — un pannello solo, dentro la scheda.
   Le spunte registrano l'IMPORTO incassato, non "quale riga":
   se dopo estendi il tempo, la differenza torna dovuta.
   ============================================================ */
function buildPaymentPanel(panel, entry, onChange) {
  panel.innerHTML = '';
  const pk = el('div', 'e-panel-k'); pk.innerHTML = '💶 Conto — tocca le voci incassate'; panel.appendChild(pk);
  entry.paidLines = entry.paidLines || {};
  const items = paymentLines(entry);

  /* incasso/storno di un importo su parco o bar */
  const muovi = (tipo, delta) => {
    const campo = tipo === 'bar' ? 'paidBar' : 'paidPark';
    entry[campo] = Math.max(0, Math.round((num(entry[campo], 0) + delta) * 100) / 100);
  };
  const ridisegna = () => { saveEntries(); buildPaymentPanel(panel, entry, onChange); onChange(); };

  /* le voci divise per settore, come il bar */
  const settori = [
    { k: 'parco', tit: '\ud83c\udfa0 Parco', filtro: it => it.id.startsWith('child_') },
    { k: 'crazy', tit: '\ud83e\udd38 Crazy Jumping', filtro: it => it.id.startsWith('crazy_') },
    { k: 'bar', tit: '\ud83e\udd64 Bar', filtro: it => it.type === 'bar' }
  ];

  const wrap = el('div', 'pay-cats');
  settori.forEach(s => {
    const voci = items.filter(s.filtro);
    if (!voci.length) return;
    const box = el('div', 'pay-cat');

    const testa = el('div', 'pay-cat-k');
    const st = el('span'); st.innerHTML = s.tit; testa.appendChild(st);
    const mancanti = voci.filter(v => !entry.paidLines[v.id]);
    const somma = Math.round(mancanti.reduce((a, v) => a + v.price, 0) * 100) / 100;
    const tuttoBtn = el('button', 'pay-all' + (mancanti.length ? '' : ' done'),
      mancanti.length ? 'tutti \u2192 ' + eur(somma) : 'tutto pagato \u2713');
    tuttoBtn.onclick = () => {
      if (mancanti.length) {
        mancanti.forEach(v => { entry.paidLines[v.id] = true; muovi(v.type, v.price); });
      } else {
        voci.forEach(v => { entry.paidLines[v.id] = false; muovi(v.type, -v.price); });
      }
      ridisegna();
    };
    testa.appendChild(tuttoBtn);
    box.appendChild(testa);

    /* le voci come pastiglie: compatte, si toccano una per una */
    const griglia = el('div', 'pay-grid');
    voci.forEach(it => {
      const b = el('button', 'pay-chip' + (entry.paidLines[it.id] ? ' done' : ''));
      b.appendChild(el('span', 'pc-lab', it.label));
      b.appendChild(el('span', 'pc-val num', eur(it.price)));
      b.onclick = () => {
        const ora = !entry.paidLines[it.id];
        entry.paidLines[it.id] = ora;
        muovi(it.type, ora ? it.price : -it.price);
        ridisegna();
      };
      griglia.appendChild(b);
    });
    box.appendChild(griglia);
    wrap.appendChild(box);
  });
  if (!items.length) wrap.appendChild(el('div', 'hint', 'Nessun addebito.'));
  panel.appendChild(wrap);

  /* totali + incassa tutto */
  const due = dueOf(entry);
  const tot = el('div', 'pay-tot');
  const riga = (k, v, cls) => {
    const d = el('div', 'tot-row ' + (cls || ''));
    d.appendChild(el('span', null, k));
    d.appendChild(el('span', 'num', v));
    tot.appendChild(d);
  };
  riga('Totale', eur(due.park + due.bar));
  if (due.paidPark + due.paidBar > 0) riga('Gi\u00e0 incassato', '\u2212 ' + eur(due.paidPark + due.paidBar), 'ok');
  riga(due.total > 0 ? 'RESTA' : 'Tutto pagato', eur(due.total), 'big');
  if (due.avanzo > 0) riga('Da restituire', eur(due.avanzo), 'ok');
  panel.appendChild(tot);

  const row = el('div', 'pay-acts');
  if (due.total > 0) {
    const tutto = el('button', 'btn btn-ok', '\u2705 Incassa tutto \u00b7 ' + eur(due.total));
    tutto.onclick = () => {
      items.forEach(x => entry.paidLines[x.id] = true);
      entry.paidPark = Math.round((num(entry.paidPark, 0) + due.parkDue) * 100) / 100;
      entry.paidBar = Math.round((num(entry.paidBar, 0) + due.barDue) * 100) / 100;
      ridisegna();
      toast('Incassati ' + eur(due.total));
    };
    row.appendChild(tutto);

    const resto = el('button', 'btn btn-resto', '\ud83e\uddee Calcola il resto');
    resto.onclick = () => {
      const gia = panel.querySelector('.resto-box');
      if (gia) { gia.remove(); resto.classList.remove('on'); return; }
      resto.classList.add('on');
      panel.appendChild(pannelloResto(entry, due.total, (preso) => {
        entry.paidPark = Math.round((num(entry.paidPark, 0) + Math.min(preso, due.parkDue)) * 100) / 100;
        const avanza = Math.max(0, Math.round((preso - due.parkDue) * 100) / 100);
        if (avanza > 0) entry.paidBar = Math.round((num(entry.paidBar, 0) + Math.min(avanza, due.barDue)) * 100) / 100;
        if (preso >= due.total) items.forEach(x => entry.paidLines[x.id] = true);
        ridisegna();
        toast('Incassati ' + eur(preso));
      }));
    };
    row.appendChild(resto);
  }
  panel.appendChild(row);
}

/* Il calcolo del resto: si toccano i tagli che la persona mette in
   mano (20 + 10) e dice quanto ridare. Chi preferisce battere la cifra
   ha il tastierino. */
function pannelloResto(entry, dovuto, onIncassa) {
  const box = el('div', 'resto-box');
  let dato = 0;
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
    if (dato > 0) {
      const a2 = el('div', 'da');
      a2.appendChild(el('span', 'k', avanza >= 0 ? 'resto da dare' : 'mancano ancora'));
      a2.appendChild(el('span', 'v num', eurNum(Math.abs(avanza))));
      alto.appendChild(a2);
    }
    box.appendChild(alto);

    if (!tastierino) {
      const g = el('div', 'resto-tagli');
      TAGLI.forEach(t => {
        const b = el('button', t[0] < 500 ? 'mon' : '');
        b.textContent = t[1];
        b.onclick = () => { dato += t[0]; disegna(); };
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
    cambia.onclick = () => { tastierino = !tastierino; digitato = ''; disegna(); };
    azioni.appendChild(cambia);
    const zero = el('button', 'btn btn-sm', '\u21ba Azzera');
    zero.onclick = () => { dato = 0; digitato = ''; disegna(); };
    azioni.appendChild(zero);
    if (dato > 0) {
      const ok = el('button', 'btn btn-ok');
      const preso = Math.min(dato, cent) / 100;
      ok.textContent = 'Incassa ' + eurNum(Math.min(dato, cent)) +
        (avanza > 0 ? ' \u00b7 rendi ' + eurNum(avanza) : '');
      ok.onclick = () => { box.remove(); onIncassa(preso); };
      azioni.appendChild(ok);
    }
    box.appendChild(azioni);
  }
  disegna();
  return box;
}

/* voci del conto: una riga per bambino, per crazy e per consumazione */
function paymentLines(entry) {
  const items = [];
  const c = costOf(entry);
  const per = c.children > 0 ? Math.round((c.parkTotal / c.children) * 100) / 100 : 0;
  for (let i = 0; i < c.children; i++) {
    // l'ultima riga assorbe l'arrotondamento, così la somma torna al centesimo
    const price = i === c.children - 1
      ? Math.round((c.parkTotal - per * (c.children - 1)) * 100) / 100
      : per;
    items.push({ id: 'child_' + i, label: '\ud83e\uddd2 Bambino ' + (i + 1), price, type: 'park' });
  }
  for (let i = 0; i < clamp(entry.crazyJumping, 0, 999); i++) {
    items.push({ id: 'crazy_' + i, label: '\ud83e\udd38 Crazy ' + (i + 1), price: settings.crazyJumpingPrice, type: 'park' });
  }
  (entry.barItems || []).forEach(bi => {
    for (let i = 0; i < clamp(bi.qty, 0, 999); i++) {
      const voce = (settings.barMenu || []).find(m => m.id === bi.id);
      items.push({
        id: 'bar_' + bi.id + '_' + i,
        label: (voce && voce.em ? voce.em + ' ' : '') + bi.name,
        price: bi.price, type: 'bar'
      });
    }
  });
  return items;
}

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
  r.sCrazy.val.textContent = crazy;
  r.sTime.val.textContent = entry.payLater ? '\u2014' : entry.durationMinutes + '\u2032';
  /* se l'ingresso e' aperto nel modulo i suoi numeri restano fermi:
     toccarli qui vorrebbe dire perderli appena premi Registra */
  const bloccato = (typeof editingId !== 'undefined' && editingId === entry.id);
  r.sKids.minus.disabled = bloccato || kids <= 0;
  r.sCrazy.minus.disabled = bloccato || crazy <= 0;
  r.sTime.minus.disabled = bloccato || num(entry.durationMinutes, 0) <= 5;

  soldiDi(r, entry, due);

  // se il conto è aperto lo riallineo: i prezzi possono essere cambiati
  if (r.payPanel && !r.payPanel.classList.contains('hidden')) r.buildPay();

  r.range.innerHTML = '<span class="fr">dalle</span>' + fmtTime(entry.startTime) +
    '<span class="fr">alle</span>' + (entry.payLater ? '?' : fmtTime(endTimeOf(entry)));
  updateBadge();
}

/* solo quando cambia la composizione della scheda (persone) */
function redrawCard(entry) {
  const r = cardRefs.get(entry.id);
  if (!r || !r.card.parentNode) return;
  const era = r.card.classList.contains('aperto');
  const fresh = entryCard(entry);
  r.card.replaceWith(fresh);
  if (era) fresh.classList.add('aperto');
  tick();
}
/* ridisegna ma lascia aperto il pannello che si stava usando */
function redrawCardKeepingPanels(entry) {
  const old = cardRefs.get(entry.id);
  const wasBar = old && !old.barPanel.classList.contains('hidden');
  const wasPay = old && !old.payPanel.classList.contains('hidden');
  redrawCard(entry);
  const r = cardRefs.get(entry.id);
  if (!r) return;
  if (wasBar) r.barBtn.click();
  else if (wasPay) r.payBtn.click();
}

/* countdown: aggiorna testo, stato e barra, nient'altro */
function tick() {
  if (tab !== 'active' || showArchive) return;
  const now = Date.now();
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
      soldiDi(r, entry, dueOf(entry));                     // il conto sale col tempo
    } else {
      r.count.textContent = fmtClock(endTimeOf(entry) - now);
    }
  });
}

/* riapre l'ingresso nel modulo, per correggerlo */
function editEntry(entry) {
  editingId = entry.id;
  draft = {
    startTime: entry.startTime,
    durationMinutes: entry.durationMinutes,
    payLater: !!entry.payLater,
    children: entry.children,
    crazyJumping: entry.crazyJumping,
    people: JSON.parse(JSON.stringify(entry.people || [])),
    barItems: JSON.parse(JSON.stringify(entry.barItems || [])),
    braceletColor: entry.braceletColor || null,
    braceletCustom: !!entry.braceletCustom,
    touched: true
  };
  switchTab('new');
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
      <button class="switch-row" id="setTheme" role="switch">
        <span class="sw-txt"><b>Tema scuro</b><span>Riposante e con i colori dei bracciali più leggibili.</span></span>
        <span class="switch"></span>
      </button>
      <button class="switch-row" id="setAnima" role="switch" style="margin-top:10px;">
        <span class="sw-txt"><b>Animazioni</b><span>La scheda che si apre e quella che vola sopra le altre. Spento: tutto istantaneo, come chiede il risparmio animazioni del sistema.</span></span>
        <span class="switch"></span>
      </button>
      <button class="switch-row" id="setTinte" role="switch" style="margin-top:10px;">
        <span class="sw-txt"><b>Tinte più leggibili</b><span>Gli stessi colori, un po' più scuri. Le scritte piccole passano da 2,6 a 6 di contrasto: al sole si legge molto meglio. Spento = tinte accese come nel disegno.</span></span>
        <span class="switch"></span>
      </button>
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

  /* tema */
  const th = $('#setTheme');
  const paintTheme = () => {
    const on = settings.theme !== 'light';
    $('.switch', th).classList.toggle('on', on);
    th.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  paintTheme();
  th.onclick = () => {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    paintTheme();
    saveSettings();
  };

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

  const tn = $('#setTinte');
  const paintTinte = () => {
    const on = settings.tinteLeggibili === true;
    $('.switch', tn).classList.toggle('on', on);
    tn.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  paintTinte();
  tn.onclick = () => {
    settings.tinteLeggibili = settings.tinteLeggibili !== true;
    applyTheme();
    paintTinte();
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

function markNewDirty() { newBuilt = false; if (tab === 'new') { buildNewView(); syncNew(); } }

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
  (settings.tariffs || []).forEach((t, i) => {
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
  (settings.barMenu || []).forEach((it, i) => {
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
  (settings.braceletSlots || []).forEach((s, i) => {
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
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
  // tinte: quelle del modello (di serie) o quelle misurate
  document.getElementById('app').classList.toggle('tinte-leggibili', settings.tinteLeggibili === true);
  /* L'app decide da se' se animare: il risparmio animazioni del sistema
     spegneva tutto e non si capiva piu' dove finivano le schede. */
  document.documentElement.classList.toggle('anima', settings.animazioni !== false);
  const meta = document.querySelector('meta[name="theme-color"]');
  // la barra di sistema del tablet deve intonarsi all'app, non restare
  // del blu di due versioni fa
  if (meta) meta.setAttribute('content', settings.theme === 'light' ? '#FFFFFF' : '#17171E');
}
function updateBadge() {
  const n = entries.filter(e => e.status === 'active').length;
  const b = $('#tabBadge');
  b.textContent = n;
  b.dataset.n = n;
}
function switchTab(t) {
  /* se una scheda sta volando va posata PRIMA di cambiare vista:
     altrimenti resta appesa sopra la vista nuova, col velo sfocato */
  if (typeof volante !== 'undefined' && volante) posaSubito(volante.card);
  tab = t;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#view-new').classList.toggle('hidden', t !== 'new');
  $('#view-active').classList.toggle('hidden', t !== 'active');
  $('#view-cassa').classList.toggle('hidden', t !== 'cassa');
  $('#view-settings').classList.toggle('hidden', t !== 'settings');
  $('main').scrollTop = 0;

  if (t === 'new') {
    // se il modulo è vergine, l'orario riparte da adesso
    if (!editingId && !draft.touched) {
      draft.startTime = roundTo5(new Date()).getTime();
    }
    if (!newBuilt) buildNewView();
    syncNew();
  } else {
    syncActionBar();
  }
  if (t === 'active') buildActiveView();   // ridisegna: cosi' la scheda in modifica si segna o si libera
  if (t === 'cassa') buildCassaView();
  if (t === 'settings') buildSettingsView();
  updateBadge();
}

function normalizeEntries(list) {
  return (list || []).map(e => {
    const o = Object.assign({
      status: 'active', barItems: [], barPaid: 0, parkPaid: false,
      braceletColor: null, braceletCustom: false, paidLines: {},
      children: 1, crazyJumping: 0, durationMinutes: 60, people: []
    }, e, {
      paidLines: e.paidLines || {},
      people: (e.people || []).map(p => (p.avatar = AV.normalize(p.avatar, p.role), p))
    });
    if (o.baseMinutes == null) o.baseMinutes = o.durationMinutes;
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
  $('#abSave').onclick = commitEntry;


  const clock = () => { $('#clock').textContent = fmtTime(Date.now()); };
  clock();
  clearInterval(clockT);
  clockT = setInterval(clock, 10000);
  clearInterval(tickT);
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
  return !!((draft && draft.touched) || editingId || document.querySelector('.e-panel:not(.hidden)'));
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
      const n = (load(SK.entries) || []).length;
      toast('Dati recuperati dall’archivio: ' + n + ' ingressi ♻️');
    }
  }).catch(() => init());
}

partenza();

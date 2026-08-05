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

    <div class="card">
      <h2><span class="em">\ud83d\udd52</span> Orario di inizio</h2>
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

    <div class="card sec-dur">
      <h2><span class="em">\u23f3</span> Quanto restano</h2>
      <div class="chips" id="nDur"></div>
      <div class="dur-custom">
        <span class="lab">oppure minuti esatti</span>
        <button class="step-b sm" id="nDurM">\u2212</button>
        <input type="number" id="nDurInput" min="1" step="5" inputmode="numeric" value="60">
        <button class="step-b sm plus" id="nDurP">+</button>
      </div>
    </div>

    <div class="card sec-num">
      <h2><span class="em">\ud83e\uddd2</span> Bambini e attrazioni</h2>
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

    <div class="card sec-people">
      <h2><span class="em">\ud83e\uddd1\u200d\ud83e\udd1d\u200d\ud83e\uddd1</span> Chi accompagna</h2>
      <div class="person-list" id="nPeople"></div>
    </div>

    <div class="card sec-bar">
      <div class="sect-head">
        <h2><span class="em">\ud83e\udd64</span> Bar</h2>
        <button class="pill" id="nBarToggle">Apri</button>
      </div>
      <div class="bar-wrap hidden" id="nBar"></div>
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

/* Bracciali in linea: si tocca il colore, non si apre nessuna finestra. */
function buildWristRow() {
  R.nWrist.innerHTML = '';
  /* si parte da "Senza": il colore va messo apposta, così non si scorda */
  const senza = el('button', 'wrist-dot senza', 'Senza');
  senza.title = 'Nessun bracciale';
  senza.onclick = () => {
    draft.braceletColor = null;
    draft.braceletCustom = true;
    draft.touched = true;
    syncNew();
  };
  R.nWrist.appendChild(senza);

  const auto = el('button', 'wrist-dot auto', 'Auto');
  auto.title = 'Segue la fascia oraria';
  auto.onclick = () => {
    draft.braceletCustom = false;
    draft.braceletColor = null;
    draft.touched = true;
    syncNew();
  };
  R.nWrist.appendChild(auto);

  /* i colori delle fasce orarie: quelli veri del parco */
  const usati = [];
  (settings.braceletSlots || []).forEach(s => {
    if (s.color && !usati.some(u => u.toLowerCase() === s.color.toLowerCase())) usati.push(s.color);
  });
  usati.forEach(hex => {
    const b = el('button', 'wrist-dot');
    b.style.background = hex;
    b.dataset.color = hex;
    b.title = AV.colorName(hex, 0);
    b.onclick = () => {
      draft.braceletColor = hex;
      draft.braceletCustom = true;
      draft.touched = true;
      syncNew();
    };
    R.nWrist.appendChild(b);
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

  /* le persone già scelte */
  people.forEach(p => {
    p.avatar = AV.normalize(p.avatar, p.role);
    const aperto = container.dataset.apri === p.id;
    const blocco = el('div', 'p-blocco' + (aperto ? ' aperto' : ''));
    const row = el('div', 'person-row');

    const pv = el('div', 'pv');
    pv.innerHTML = AV.build(p.avatar);
    row.appendChild(pv);

    const info = el('div', 'pinfo');
    info.appendChild(el('div', 'prole', roleOf(p.role).label));
    const nome = el('input', 'pname-in');
    nome.value = p.name || '';
    nome.placeholder = 'Nome (facoltativo)';
    nome.oninput = () => { p.name = nome.value; onChange(); };
    info.appendChild(nome);
    row.appendChild(info);

    /* i tratti vanno sotto, larghi quanto il riquadro: incolonnati nello
       spazio stretto accanto all'avatar occupavano quattro righe a testa */
    const foot = el('div', 'pfoot');
    const tr = el('div', 'ptraits');
    AV.traits(p.avatar, 3).forEach(t => tr.appendChild(traitChip(t)));
    foot.appendChild(tr);
    const pnote = el('div', 'pnote' + (p.note ? '' : ' hidden'), p.note || '');
    foot.appendChild(pnote);

    const acts = el('div', 'pact');
    const edit = el('button', 'mini-b' + (aperto ? ' on' : ''));
    edit.innerHTML = '\ud83c\udfa8';
    edit.title = 'Com\u2019\u00e8 vestito';
    edit.onclick = () => {
      container.dataset.apri = aperto ? '' : p.id;
      rinfresca();
    };
    const del = el('button', 'mini-b del');
    del.innerHTML = '\u2715';
    del.title = 'Togli';
    del.onclick = () => {
      const i = people.indexOf(p);
      if (i > -1) people.splice(i, 1);
      if (container.dataset.apri === p.id) container.dataset.apri = '';
      onChange();
      rinfresca();
    };
    acts.appendChild(edit);
    acts.appendChild(del);
    row.appendChild(acts);
    row.appendChild(foot);
    pv.onclick = edit.onclick;
    blocco.appendChild(row);

    /* l'editor si apre qui sotto, non in una finestra, e SENZA anteprima:
       la persona qui sopra resta appesa in cima ed è lei che si aggiorna.
       Aggiorna solo questa riga: se rifacesse la lista si richiamerebbe
       da solo all'infinito. */
    if (aperto) {
      const ed = el('div', 'p-editor');
      let ultimo = JSON.stringify(p.avatar);
      buildAvatarEditor(ed, p, () => {
        const ora = JSON.stringify(p.avatar);
        if (ora !== ultimo) {          // scrivere una nota non ridisegna lo sprite
          ultimo = ora;
          pv.innerHTML = AV.build(p.avatar);
          tr.innerHTML = '';
          AV.traits(p.avatar, 3).forEach(t => tr.appendChild(traitChip(t)));
        }
        pnote.textContent = p.note || '';
        pnote.classList.toggle('hidden', !p.note);
        container.dataset.sig = '';   // la prossima volta ridisegna davvero
        onChange();
      });
      blocco.appendChild(ed);
    }
    container.appendChild(blocco);
  });

  /* la scelta: subito visibile se non c'è nessuno, dietro un "+" se ce n'è già */
  const scelta = el('div', 'p-scelta');
  const mostraScelta = people.length === 0 || container.dataset.scegli === '1';

  if (!mostraScelta) {
    const add = el('button', 'btn btn-sm add-person');
    add.innerHTML = '\u2795 Aggiungi un\u2019altra persona';
    add.onclick = () => { container.dataset.scegli = '1'; rinfresca(); };
    scelta.appendChild(add);
  } else {
    if (people.length) {
      const t = el('div', 'p-scelta-k');
      t.appendChild(el('span', null, 'Chi altro entra?'));
      const chiudi = el('button', 'mini-b');
      chiudi.innerHTML = '\u2715';
      chiudi.onclick = () => { container.dataset.scegli = ''; rinfresca(); };
      t.appendChild(chiudi);
      scelta.appendChild(t);
    }
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
        // si aggiunge e basta: il vestiario si apre col suo tasto, se serve
        aggiungi({ id: uid(), role: r.key, name: '', avatar: AV.baseFor(r.key), note: '' }, false);
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
          }, false);
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

  // bracciale: acceso quello scelto, oppure "Auto" se segue la fascia oraria
  const autoSlot = braceletFor(draft.startTime);
  const activeColor = draft.braceletCustom ? draft.braceletColor : null;
  const senzaBracciale = draft.braceletCustom && !draft.braceletColor;
  $$('.wrist-dot', R.nWrist).forEach(b => {
    if (b.classList.contains('senza')) {
      b.classList.toggle('on', senzaBracciale);
    } else if (b.classList.contains('auto')) {
      b.classList.toggle('on', !draft.braceletCustom);
      // su schermi stretti basta "Auto": il colore si vede dallo sfondo
      const stretto = window.innerWidth < 1040;
      b.textContent = (autoSlot && !stretto) ? 'Auto · ' + (autoSlot.label || '—') : 'Auto';
      b.style.background = !draft.braceletCustom && autoSlot ? autoSlot.color : '';
      b.style.color = !draft.braceletCustom && autoSlot ? '#fff' : '';
    } else {
      b.classList.toggle('on', !!activeColor && b.dataset.color.toLowerCase() === String(activeColor).toLowerCase());
    }
  });

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

  /* la nota: l'unico campo che non sta gi\u00e0 nella riga */
  const nota = el('input', 'ed-nota');
  nota.placeholder = 'Segno particolare, nota\u2026';
  nota.value = person.note || '';
  nota.oninput = () => { person.note = nota.value; onChange(); };
  box.appendChild(nota);

  const aggiorna = (avvisa) => {
    if (prev) prev.innerHTML = AV.build(av);
    if (traits) {
      traits.innerHTML = '';
      AV.traits(av, 5).forEach(t => traits.appendChild(traitChip(t)));
    }
    box.querySelectorAll('[data-off]').forEach(r => {
      r.classList.toggle('off', av.top.style === 'vestito' && r.dataset.off === 'pants');
    });
    if (avvisa !== false && typeof onChange === 'function') onChange();
  };

  /* mattoni */
  const riga = (icona, titolo, chiave) => {
    const r = el('div', 'ed-row');
    if (chiave) r.dataset.off = chiave;
    const k = el('div', 'ed-k');
    k.innerHTML = '<span>' + titolo + '</span>';
    r.appendChild(k);
    box.appendChild(r);
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
    $$('.ed-opts', box).forEach(sc => {
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

  /* ---- l'ordine che serve davvero: si parte dalla pelle ---- */
  const rPelle = riga('pelle', 'Pelle');
  colori(rPelle, AV.SKINS, () => av.skin, v => { av.skin = v; });

  const rViso = riga('occhiali', 'Viso');
  stili(rViso, AV.GLASSES, () => av.glasses, v => { av.glasses = v; }, 'viso');
  stili(rViso, AV.FACIAL, () => av.facial, v => { av.facial = v; }, 'viso');

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

  const rPants = riga('pantaloni', 'Pantaloni', 'pants');
  stili(rPants, AV.PANTS, () => av.pants.style, v => { av.pants.style = v; }, 'gambe');
  colori(rPants, AV.COLORS, () => av.pants.color, v => { av.pants.color = v; });
  patterns(rPants, () => av.pants.pattern, v => { av.pants.pattern = v; },
    () => av.pants.color, () => av.pants.color2, v => { av.pants.color2 = v; });

  const rShoes = riga('scarpe', 'Scarpe');
  stili(rShoes, AV.SHOES, () => av.shoes.style, v => { av.shoes.style = v; }, 'piedi');
  colori(rShoes, AV.COLORS, () => av.shoes.color, v => { av.shoes.color = v; });

  const rBag = riga('borsa', 'Zaino e borse');
  stili(rBag, AV.BAG, () => av.bag.style, v => { av.bag.style = v; }, 'lato');
  colori(rBag, AV.COLORS, () => av.bag.color, v => { av.bag.color = v; });

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
  buildAvatarEditor(box, person, () => {}, { anteprima: true });
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
    head.appendChild(el('span', 'pill', attivi.length + (attivi.length === 1 ? ' gruppo' : ' gruppi')));
    head.appendChild(el('span', 'pill', bimbi + (bimbi === 1 ? ' bambino' : ' bambini')));
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

function entryCard(entry) {
  const card = el('div', 'entry s-' + stateOf(entry, Date.now()));
  card.dataset.id = entry.id;
  const body = el('div', 'e-body');

  /* riga 1: countdown, orari, barra che si svuota */
  const time = el('div', 'e-time');
  const cw = el('div');
  const count = el('div', 'e-count num', '--:--');
  const sub = el('div', 'e-count-sub', '');
  cw.appendChild(count);
  cw.appendChild(sub);
  time.appendChild(cw);
  const range = el('div', 'e-range');
  range.innerHTML = '\ud83d\udd50 ' + fmtTime(entry.startTime) + '<span class="arrow">\u2192</span>' + (entry.payLater ? '?' : fmtTime(endTimeOf(entry)));
  time.appendChild(range);
  body.appendChild(time);

  const track = el('div', 'e-bar-track');
  const fill = el('div', 'e-bar-fill');
  track.appendChild(fill);
  body.appendChild(track);

  /* riga 2: stepper con l'etichetta scritta */
  const ctrls = el('div', 'e-controls');
  const mkStep = (label, key, step) => {
    const box = el('div', 'e-step');
    const kk = el('div', 'k'); kk.innerHTML = label; box.appendChild(kk);
    const ctrl = el('div', 'ctrl');
    const minus = el('button', 'step-b');
    minus.textContent = step > 1 ? '−' + step : '−';
    const val = el('span', 'v num', '0');
    const plus = el('button', 'step-b plus');
    plus.textContent = step > 1 ? '+' + step : '+';
    const bump = (d) => () => {
      entry[key] = clamp(num(entry[key], 0) + d, 0, 99999);
      saveEntries();
      syncCard(entry);
      tick();
    };
    minus.onclick = bump(-step);
    plus.onclick = bump(step);
    ctrl.appendChild(minus);
    ctrl.appendChild(val);
    ctrl.appendChild(plus);
    box.appendChild(ctrl);
    ctrls.appendChild(box);
    return { box, val, minus };
  };
  const sKids = mkStep('\ud83e\uddd2 Bambini:', 'children', 1);
  const sCrazy = mkStep('\ud83e\udd38 Crazy Jumping:', 'crazyJumping', 1);
  const sTime = mkStep('\u23f1\ufe0f Tempo:', 'durationMinutes', 5);
  if (entry.payLater) {
    sTime.box.classList.add('hidden');
    ctrls.appendChild(el('div', 'e-later-tag', '\ud83d\udd57 Paga dopo'));
  }
  body.appendChild(ctrls);

  /* riga 3: i costi */
  const costs = el('div', 'e-costs');
  const cPark = el('span', 'cost');
  cPark.appendChild(el('span', 'k', 'Parco:'));
  const cParkV = el('span', 'num', '');
  cPark.appendChild(cParkV);
  const cBar = el('span', 'cost');
  cBar.appendChild(el('span', 'k', 'Bar:'));
  const cBarV = el('span', 'num', '');
  cBar.appendChild(cBarV);
  costs.appendChild(cPark);
  costs.appendChild(cBar);
  const due = el('div', 'e-due');
  due.appendChild(el('span', 'k', 'Da incassare:'));
  const dueVal = el('span', 'v num', eur(dueOf(entry).total));
  due.appendChild(dueVal);
  costs.appendChild(due);
  body.appendChild(costs);

  /* riga 4: tre azioni */
  const acts = el('div', 'e-acts');
  const mkAct = (em, label, cls, fn) => {
    const b = el('button', 'e-act ' + (cls || ''));
    b.innerHTML = '<span class="em">' + em + '</span>';
    b.appendChild(el('span', null, label));
    b.onclick = fn;
    acts.appendChild(b);
    return b;
  };
  body.appendChild(acts);
  card.appendChild(body);

  /* --- pannello riferimento --- */
  const who = el('div', 'e-who');
  const autoSlot = braceletFor(entry.startTime);
  const wristColor = entry.braceletColor || (autoSlot ? autoSlot.color : null);
  const wrist = el('button', 'e-wrist');
  wrist.title = 'Cambia bracciale';
  const dot = el('span', 'dot');
  dot.style.background = wristColor || 'transparent';
  if (!wristColor) dot.style.borderStyle = 'dashed';
  wrist.appendChild(dot);
  wrist.appendChild(el('span', 'lab', wristColor
    ? ((autoSlot && !entry.braceletCustom && autoSlot.label) ? autoSlot.label : (AV.colorName(wristColor, 0) || ''))
    : 'nessuno'));
  // un tocco apre le scelte qui accanto, senza finestre
  wrist.onclick = (ev) => {
    ev.stopPropagation();
    apriMenuBracciale(wrist, entry);
  };
  who.appendChild(wrist);

  const people = (entry.people || []).map(p => (p.avatar = AV.normalize(p.avatar, p.role), p));
  if (!people.length) {
    who.appendChild(el('div', 'e-role', 'Nessun riferimento'));
    const warn = el('div', 'e-noone');
    warn.appendChild(el('div', null, '\u26a0\ufe0f All\'uscita non avrai riferimenti'));
    const add = el('button', 'btn btn-sm', '\u2795 Aggiungi');
    warn.appendChild(add);
    add.onclick = () => pickRole(p => {
      entry.people = entry.people || [];
      entry.people.push(p);
      saveEntries();
      openCustomizer(p, () => { saveEntries(); redrawCard(entry); });
    });
    who.appendChild(warn);
  } else {
    // il ruolo conta piu' del nome: sta sopra e in grande
    who.appendChild(el('div', 'e-role', people.map(p => roleOf(p.role).em + ' ' + roleOf(p.role).label).join(' \u00b7 ')));
    const nomi = people.filter(p => p.name && p.name.trim()).map(p => p.name.trim());
    if (nomi.length) who.appendChild(el('div', 'e-names', nomi.join(' \u00b7 ')));

    const avs = el('div', 'e-avatars' + (people.length > 1 ? ' multi' : ''));
    people.slice(0, 3).forEach(p => {
      const a = el('div', 'av');
      a.innerHTML = AV.build(p.avatar);
      a.title = 'Modifica ' + nameOf(p);
      a.onclick = (ev) => {
        ev.stopPropagation();
        openCustomizer(p, () => { saveEntries(); redrawCard(entry); });
      };
      avs.appendChild(a);
    });
    // quanti bambini, appeso allo sprite
    const kidsBadge = el('div', 'e-kids-badge');
    kidsBadge.innerHTML = '\ud83e\uddd2';
    const kidsBadgeV = el('span', 'num', '0');
    kidsBadge.appendChild(kidsBadgeV);
    avs.appendChild(kidsBadge);
    who.appendChild(avs);
    who.kidsBadgeV = kidsBadgeV;

    const tr = el('div', 'e-traits');
    if (people.length === 1) {
      AV.traits(people[0].avatar, 4).forEach(t => tr.appendChild(traitChip(t)));
    } else {
      people.slice(0, 2).forEach(p => AV.traits(p.avatar, 2).forEach(t => tr.appendChild(traitChip(t))));
    }
    who.appendChild(tr);
    const notes = people.filter(p => p.note && p.note.trim());
    if (notes.length) who.appendChild(el('div', 'e-note', notes.map(p => '\ud83d\udcdd ' + p.note.trim()).join(' \u00b7 ')));
  }
  card.appendChild(who);

  /* --- pannelli, in fondo alla scheda --- */
  const barPanel = el('div', 'e-panel hidden');
  const bk = el('div', 'e-panel-k'); bk.innerHTML = '\ud83e\udd64 Bar'; barPanel.appendChild(bk);
  const barBox = el('div');
  barPanel.appendChild(barBox);
  buildBarRows(barBox, () => (entry.barItems = entry.barItems || []), () => {
    saveEntries();
    syncBarRows(barBox, entry.barItems);
    syncCard(entry);
  });
  card.appendChild(barPanel);

  const payPanel = el('div', 'e-panel hidden');
  card.appendChild(payPanel);
  const buildPay = () => buildPaymentPanel(payPanel, entry, () => { syncCard(entry); });

  /* i tasti: un pannello per volta */
  const panels = [];
  const toggle = (panel, btn, onOpen) => () => {
    const open = panel.classList.contains('hidden');
    chiudiPannelli(entry.id);          // un pannello aperto in tutta la lista
    panels.forEach(([p, b]) => { p.classList.add('hidden'); b.classList.remove('on'); });
    if (open) {
      panel.classList.remove('hidden');
      btn.classList.add('on');
      if (onOpen) onOpen();
    }
  };
  const barBtn = mkAct('\ud83e\udd64', 'Bar', 'bar', () => {});
  const barBadge = el('span', 'badge', eur(0));
  barBtn.appendChild(barBadge);
  const payBtn = mkAct('\ud83d\udcb6', 'Conto', 'pay', () => {});
  mkAct('\u270f\ufe0f', 'Modifica', '', () => editEntry(entry));
  // l'uscita e' un tasto a se': il conto si fa anche prima di entrare
  mkAct('\ud83d\udeaa', 'Uscita', 'out', () => chiudiIngresso(entry));
  panels.push([barPanel, barBtn], [payPanel, payBtn]);
  card.panels = panels;
  barBtn.onclick = toggle(barPanel, barBtn, () => syncBarRows(barBox, entry.barItems));
  payBtn.onclick = toggle(payPanel, payBtn, buildPay);

  cardRefs.set(entry.id, {
    card, count, sub, fill, range, sKids, sCrazy, sTime,
    cParkV, cBarV, dueVal, barBadge, barBox, barPanel, barBtn,
    payPanel, payBtn, buildPay, kidsBadgeV: who.kidsBadgeV
  });
  syncCard(entry);
  return card;
}

/* Le scelte del bracciale, aperte accanto al pallino.
   Il colore giusto per l'ORA D'INGRESSO e' gia' segnalato. */
function apriMenuBracciale(ancora, entry) {
  document.querySelectorAll('.wrist-menu').forEach(m => m.remove());
  const menu = el('div', 'wrist-menu');
  const slot = braceletFor(entry.startTime);
  const attuale = entry.braceletColor || null;

  const riga = (etichetta, colore, attivo, azione, consigliato) => {
    const b = el('button', 'wm-row' + (attivo ? ' on' : ''));
    const d = el('span', 'wm-dot');
    if (colore) d.style.background = colore; else d.classList.add('vuoto');
    b.appendChild(d);
    b.appendChild(el('span', 'wm-lab', etichetta));
    if (consigliato) b.appendChild(el('span', 'wm-tip', "per le " + fmtTime(entry.startTime)));
    b.onclick = (ev) => {
      ev.stopPropagation();
      azione();
      saveEntries();
      menu.remove();
      redrawCardKeepingPanels(entry);
    };
    menu.appendChild(b);
  };

  if (slot && slot.color) {
    riga(slot.label || AV.colorName(slot.color, 0), slot.color, !entry.braceletCustom,
      () => { entry.braceletColor = null; entry.braceletCustom = false; }, true);
  }
  const visti = [];
  (settings.braceletSlots || []).forEach(sl => {
    if (!sl.color) return;
    if (slot && slot.color && sl.color.toLowerCase() === slot.color.toLowerCase()) return;
    if (visti.indexOf(sl.color.toLowerCase()) > -1) return;
    visti.push(sl.color.toLowerCase());
    riga(sl.label || AV.colorName(sl.color, 0), sl.color,
      !!(entry.braceletCustom && attuale && attuale.toLowerCase() === sl.color.toLowerCase()),
      () => { entry.braceletColor = sl.color; entry.braceletCustom = true; });
  });
  riga('Senza bracciale', null, !!(entry.braceletCustom && !attuale),
    () => { entry.braceletColor = null; entry.braceletCustom = true; });

  ancora.appendChild(menu);
  const chiudi = (ev) => {
    if (menu.contains(ev.target)) return;
    menu.remove();
    document.removeEventListener('pointerdown', chiudi, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', chiudi, true), 0);
}

/* chiude i pannelli aperti; con "tranne" si risparmia una scheda */
function chiudiPannelli(tranne) {
  cardRefs.forEach((r, id) => {
    if (id === tranne || !r.card.isConnected) return;
    if (r.barPanel && !r.barPanel.classList.contains('hidden')) { r.barPanel.classList.add('hidden'); r.barBtn.classList.remove('on'); }
    if (r.payPanel && !r.payPanel.classList.contains('hidden')) { r.payPanel.classList.add('hidden'); r.payBtn.classList.remove('on'); }
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
  }
  panel.appendChild(row);
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
function syncCard(entry) {
  const r = cardRefs.get(entry.id);
  if (!r) return;
  const due = dueOf(entry);
  const kids = clamp(entry.children, 0, 1e6);
  const crazy = clamp(entry.crazyJumping, 0, 1e6);

  r.sKids.val.textContent = kids;
  r.sCrazy.val.textContent = crazy;
  r.sTime.val.textContent = entry.payLater ? '\u2014' : entry.durationMinutes + '\u2032';
  r.sKids.minus.disabled = kids <= 0;
  r.sCrazy.minus.disabled = crazy <= 0;
  r.sTime.minus.disabled = num(entry.durationMinutes, 0) <= 5;
  if (r.kidsBadgeV) r.kidsBadgeV.textContent = kids;

  r.barBadge.textContent = eur(due.bar);
  r.cParkV.textContent = eur(due.parkDue);
  r.cParkV.className = 'num' + (due.park > 0 && due.parkDue === 0 ? ' pagato' : '');
  r.cBarV.textContent = due.bar > 0 ? eur(due.barDue) : '\u2014';
  r.cBarV.className = 'num' + (due.bar > 0 && due.barDue === 0 ? ' pagato' : '');
  r.dueVal.textContent = eur(due.total);
  r.dueVal.className = 'v num ' + (due.total > 0 ? 'due' : 'paid');

  // se il conto è aperto lo riallineo: i prezzi possono essere cambiati
  if (r.payPanel && !r.payPanel.classList.contains('hidden')) r.buildPay();

  r.range.innerHTML = '\ud83d\udd50 ' + fmtTime(entry.startTime) + '<span class="arrow">\u2192</span>' + (entry.payLater ? '?' : fmtTime(endTimeOf(entry)));
  updateBadge();
}

/* solo quando cambia la composizione della scheda (persone) */
function redrawCard(entry) {
  const r = cardRefs.get(entry.id);
  if (!r || !r.card.parentNode) return;
  const fresh = entryCard(entry);
  r.card.replaceWith(fresh);
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
    const cls = 'entry s-' + st;
    if (r.card.className !== cls) r.card.className = cls;

    if (entry.payLater) {
      // l'orario d'inizio è arrotondato ai 5 minuti e può cadere
      // qualche minuto avanti: non mostro un tempo trascorso negativo
      r.count.textContent = fmtClock(Math.max(0, now - entry.startTime));
      r.sub.textContent = 'dentro da';
      r.fill.style.transform = 'scaleX(1)';
      const d = dueOf(entry);                              // il conto sale col tempo
      r.dueVal.textContent = eur(d.total);
      r.dueVal.className = 'v num ' + (d.total > 0 ? 'due' : 'paid');
    } else {
      const end = endTimeOf(entry);
      const totale = Math.max(1, end - entry.startTime);
      const left = end - now;
      r.count.textContent = fmtClock(left);
      r.sub.textContent = left >= 0
        ? 'alla scadenza'
        : (st === 'danger' ? '\u26a0\ufe0f oltre la tolleranza' : 'scaduto, in tolleranza');
      r.fill.style.transform = 'scaleX(' + clamp(left / totale, 0, 1).toFixed(3) + ')';
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
    <div class="card">
      <h2><span class="em">🎨</span> Aspetto</h2>
      <button class="switch-row" id="setTheme" role="switch">
        <span class="sw-txt"><b>Tema scuro</b><span>Riposante e con i colori dei bracciali più leggibili.</span></span>
        <span class="switch"></span>
      </button>
    </div>

    <div class="card">
      <h2><span class="em">⏱️</span> Tempi e prezzi base</h2>
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

    <div class="card">
      <h2><span class="em">⚡</span> Durate rapide</h2>
      <div class="hint">I tasti grandi che vedi in "Nuovo ingresso".</div>
      <div id="sQuick"></div>
      <button class="btn btn-sm btn-block" id="sAddQuick" style="margin-top:8px;">➕ Aggiungi tasto</button>
    </div>

    <div class="card">
      <h2><span class="em">💶</span> Listino</h2>
      <div class="hint">Il tempo si arrotonda per eccesso a 5 minuti; il totale si moltiplica per i bambini.</div>
      <div id="sTariffs"></div>
      <button class="btn btn-sm btn-block" id="sAddTariff" style="margin-top:8px;">➕ Aggiungi fascia</button>
    </div>

    <div class="card">
      <h2><span class="em">🥤</span> Menù bar</h2>
      <div id="sBar"></div>
      <button class="btn btn-sm btn-block" id="sAddBar" style="margin-top:8px;">➕ Aggiungi voce</button>
    </div>

    <div class="card">
      <h2><span class="em">🎗️</span> Bracciali per fascia oraria</h2>
      <div id="sWrist"></div>
      <button class="btn btn-sm btn-block" id="sAddWrist" style="margin-top:8px;">➕ Aggiungi fascia</button>
    </div>

    <div class="card">
      <h2><span class="em">🖼️</span> Avatar pronti</h2>
      <div class="hint">Compaiono come scorciatoie quando aggiungi una persona.</div>
      <div class="preset-grid" id="sPresets"></div>
      <button class="btn btn-sm btn-block" id="sAddPreset" style="margin-top:10px;">➕ Nuovo avatar</button>
    </div>

    <div class="card" id="sCloudCard">
      <h2><span class="em">☁️</span> Cloud e accesso</h2>
      <div id="sCloud"></div>
    </div>

    <div class="card" id="sSicuroCard">
      <h2><span class="em">🔒</span> Sicurezza dei dati</h2>
      <div id="sSicuro"></div>
    </div>

    <div class="card">
      <h2><span class="em">💾</span> Backup</h2>
      <div class="hint">Il backup su file resta utile anche col cloud acceso: è la tua copia, e funziona senza rete.</div>
      <div class="btn-row" style="margin-bottom:10px;">
        <button class="btn btn-sm" id="sExport">Scarica backup</button>
        <button class="btn btn-sm" id="sImport">Ripristina backup</button>
      </div>
      <input type="file" id="sFile" accept=".json" class="hidden">
      <button class="btn btn-sm btn-danger btn-block" id="sReset">Cancella tutto</button>
      <div class="hint" style="margin:10px 0 0; text-align:center;">Le modifiche qui si salvano da sole.</div>
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
  tab = t;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#view-new').classList.toggle('hidden', t !== 'new');
  $('#view-active').classList.toggle('hidden', t !== 'active');
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
  if (t === 'active') buildActiveView();
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

  // toccando fuori da una scheda, i pannelli aperti si chiudono
  document.addEventListener('pointerdown', (ev) => {
    const dentro = ev.target.closest('.entry');
    chiudiPannelli(dentro ? dentro.dataset.id : null);
  }, true);

  switchTab(entries.some(e => e.status === 'active') ? 'active' : 'new');

  mostraAvvisoDati();
  avviaCloud();

  // Funzionamento offline. Con ?nosw nell'indirizzo si disattiva e si
  // ripulisce tutto: serve quando si aggiorna il codice e si vuole essere
  // certi di vedere la versione nuova.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    if (location.search.includes('nosw')) {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
      if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
    } else {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => reg.update())
        .catch(() => {});
    }
  }
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

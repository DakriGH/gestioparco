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
/* Quanti minuti di sforo si condonano senza chiedere, allungando il
   tempo a chi e' gia' fuori. Sta QUI e non piu' in basso perche'
   `defaultSettings()` gira all'avvio e una const non si puo' leggere
   prima della riga in cui e' scritta. */
const SFORO_CONDONATO_DI_SERIE = 10;

function roundTo5(d) { const ms = 5 * 60000; return new Date(Math.round(d.getTime() / ms) * ms); }
/* IN SU al prossimo taglio da cinque. Serve dove arrotondare per difetto
   toglierebbe qualcosa di promesso -- i minuti regalati da un giro. */
function su5(t) { const ms = 5 * 60000; return Math.ceil(num(t, 0) / ms) * ms; }
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
/* `dati.js` si carica PRIMA di questo file e non puo' chiamare
   `giornataDi` direttamente: gliela si affaccia qui, cosi' le copie del
   giorno si archiviano con la stessa regola delle quattro del mattino
   invece che con la mezzanotte del calendario. Se manca (dati.js da
   solo, nei test) lui ripiega sul giorno solare come prima. */
window.GIORNATA_DI = giornataDi;

/* DOVE FINISCE UNA GIORNATA. E' l'inizio di quella dopo, e NON si trova
   sommando ventiquattro ore: due notti l'anno una giornata non ne dura
   ventiquattro. A fine marzo ne dura ventitre' (alle 2:00 si va avanti),
   a fine ottobre venticinque (alle 3:00 si torna indietro), e il salto
   cade proprio nelle ore in cui il parco sta ancora chiudendo.
   Con le 24 ore fisse, la notte di marzo il registro si prendeva un'ora
   della giornata dopo -- contandola due volte -- e «elimina giornata»
   cancellava ingressi di un altro giorno; la notte di ottobre invece
   un'ora spariva dal registro e restava li' orfana.
   Chiedendolo al calendario -- il giorno dopo, alla stessa ora -- il
   cambio dell'ora se lo sbriga lui. */
function fineGiornata(inizio) {
  const d = new Date(num(inizio, 0));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/* ══════════════════════════════════════════════════════════
   LA SIGLA: DUE LETTERE PER DIRE QUALE GRUPPO.
   Il colore del bracciale dice la fascia oraria, non CHI: in una serata
   ci sono dieci gruppi col bracciale verde e per indicarne uno bisogna
   descriverlo («quelli della mamma col cappello»). Due lettere
   maiuscole invece si dicono a voce, si scrivono sul bracciale e si
   leggono da lontano.
   Niente I e O: accanto a un 1 e a uno 0 scritti a pennarello si
   confondono. Restano 24 lettere, cioe' 576 sigle -- e si ricomincia
   ogni giornata, perche' l'unicita' serve solo fra chi c'e' adesso.
   Si assegnano in ordine (AA, AB, AC…): una sigla che si legge a voce
   deve essere prevedibile, non un sorteggio.
   ══════════════════════════════════════════════════════════ */
const SIGLA_LETTERE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function sigleDellaGiornata(quando) {
  const g = giornataDi(num(quando, Date.now()));
  const usate = new Set();
  lista(entries).forEach(e => {
    if (!e || !e.sigla) return;
    if (giornataDi(num(e.startTime, num(e.createdAt, 0))) === g) usate.add(e.sigla);
  });
  return usate;
}

/* La prima libera della giornata. Finite le 576 da due lettere si passa
   a TRE -- altre 13.824 -- invece di restare senza: un gruppo senza
   riferimento e' peggio di uno con una sigla piu' lunga, e il giorno che
   si arriva a cinquecento gruppi il problema e' avere la coda alla
   cassa, non tre lettere invece di due.
   Se finissero anche quelle si torna senza sigla, che e' meglio di una
   doppia: un codice che indica due gruppi non e' un riferimento. */
/* La sigla che si ha in mano, se e' ancora libera per quella giornata;
   se no una nuova. */
function siglaLibera(sigla, quando) {
  const s = String(sigla || '');
  if (/^[A-Z]{2,3}$/.test(s) && !sigleDellaGiornata(quando).has(s)) return s;
  return nuovaSigla(quando);
}

function nuovaSigla(quando, ancheQueste) {
  const usate = sigleDellaGiornata(quando);
  lista(ancheQueste).forEach(x => { if (x) usate.add(x); });
  for (const a of SIGLA_LETTERE) {
    for (const b of SIGLA_LETTERE) {
      if (!usate.has(a + b)) return a + b;
    }
  }
  for (const a of SIGLA_LETTERE) {
    for (const b of SIGLA_LETTERE) {
      for (const c of SIGLA_LETTERE) {
        if (!usate.has(a + b + c)) return a + b + c;
      }
    }
  }
  return '';
}

function nomeGiornata(inizio) {
  const oggi = giornataDi(Date.now());
  if (inizio === oggi) return 'oggi';
  if (inizio === giornataDi(oggi - 1)) return 'ieri';
  const d = new Date(inizio);
  const GIORNI = ['domenica', 'luned\u00ec', 'marted\u00ec', 'mercoled\u00ec', 'gioved\u00ec', 'venerd\u00ec', 'sabato'];
  return GIORNI[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}

/* ══════════════════════════════════════════════════════════
   CHE VERSIONE HA QUESTA CASSA
   Non c'era modo di saperlo, e quando una tavoletta restava indietro
   -- succede: la copia offline si scambia solo quando l'app torna in
   primo piano o passano venti minuti -- non si poteva nemmeno dire se
   era rimasta indietro o se era il sito a non essere aggiornato.
   Il numero non si scrive a mano: si legge dall'indirizzo con cui e'
   stato caricato questo file (`app.js?v=256`), che e' gia' quello che
   si alza a ogni pubblicazione. Cosi' non puo' mentire. */
const VERSIONE = (() => {
  try {
    const tag = document.querySelector('script[src*="app.js"]');
    const m = tag && String(tag.src).match(/[?&]v=(\d+)/);
    return m ? m[1] : '?';
  } catch (e) { return '?'; }
})();

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
  /* `aggS` sta qui insieme ad `agg`: sono il timbro di QUANDO e' stato
     scritto, non parte del contenuto. Lasciarlo dentro avrebbe fatto
     sembrare diverso ogni ritorno dal cloud -- il timbro del server
     arriva sempre nuovo -- e ogni ingresso si sarebbe riscritto da solo
     a ogni giro. */
  return '{' + Object.keys(o).filter(k => k !== 'agg' && k !== 'aggS' && k !== 'aggDa').sort()
    .map(k => JSON.stringify(k) + ':' + firma(o[k])).join(',') + '}';
}

/* Quando e' stato scritto un ingresso, in millisecondi. Il timbro del
   server (`aggS`) e' l'unico che tutti i banchi leggono allo stesso
   modo, ma non c'e' sempre: appena scritto, e finche' la riga non ha
   fatto il giro, Firestore lo lascia vuoto. In quel caso si ripiega
   sull'ora del tablet, che e' come si faceva prima. */
function quandoAgg(o) {
  const s = o && o.aggS;
  if (s) {
    if (typeof s.toMillis === 'function') return s.toMillis();
    if (typeof s.seconds === 'number') return s.seconds * 1000;
  }
  return num(o && o.agg, 0);
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
    /* chi fa SOLO il Crazy, senza bambini in sala, resta dentro questi
       minuti: il tempo di salire, saltare e uscire. Sono in OMAGGIO --
       non si pagano -- e restano tali anche se poi il gruppo decide di
       fermarsi al parco: quello che si vende dopo si paga per intero,
       questi no. */
    crazySoloMinuti: 10,
    toleranceMinutes: 10,
    /* il giallo si accende negli ultimi cinque minuti: dieci erano
       troppi -- con una fila di gruppi restavano gialli meta' del
       tempo e il colore non diceva piu' niente */
    warnBeforeMinutes: 5,
    crazyJumpingPrice: 4,
    theme: 'dark',
    tariffaSuTotale: true,
    /* quanti minuti di sforo si condonano senza chiedere, allungando il
       tempo a chi e' gia' fuori: sotto questa soglia si perdona da se' */
    sforoCondonato: SFORO_CONDONATO_DI_SERIE,
    /* Il listino del cartello, a scaglioni di 10 minuti. 50' e 60'
       costano uguale, e cosi' 1h50' e 2h: e' scritto cosi' sul cartello. */
    tariffs: [
      { m: 10, p: 3 }, { m: 15, p: 4.5 }, { m: 20, p: 6 }, { m: 30, p: 7 },
      { m: 40, p: 10 }, { m: 50, p: 12 }, { m: 60, p: 12 }, { m: 70, p: 15 },
      { m: 80, p: 16.5 }, { m: 90, p: 19 }, { m: 100, p: 22 }, { m: 110, p: 24 }, { m: 120, p: 24 }
    ],
    quickDurations: [10, 15, 30, 60],
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
      /* GLI AMARI, UNO PER UNO. Una voce "Amari" sola non bastava piu':
         al banco si chiedono per nome, costano diverso (3 e 4) e a fine
         giornata si vuole sapere QUALE e' andato. Lo Spritz e' due
         voci, non una: quello liscio e quello col mangiare. */
      { id: 'b20', name: 'Eremita',         price: 3,    em: '\ud83e\udd43', cat: 'Alcolici' },
      { id: 'b21', name: 'Amaro del Capo',  price: 3,    em: '\ud83e\udd43', cat: 'Alcolici' },
      { id: 'b22', name: 'Amaro Silano',    price: 3,    em: '\ud83e\udd43', cat: 'Alcolici' },
      { id: 'b16', name: 'Limoncello',      price: 3,    em: '\ud83c\udf4b', cat: 'Alcolici' },
      { id: 'b23', name: 'Kaciuto',         price: 4,    em: '\ud83e\udd43', cat: 'Alcolici' },
      { id: 'b24', name: 'Rupes',           price: 4,    em: '\ud83e\udd43', cat: 'Alcolici' },
      { id: 'b25', name: 'Spritz base',     price: 4,    em: '\ud83c\udf79', cat: 'Alcolici' },
      { id: 'b26', name: 'Spritz completo', price: 6,    em: '\ud83c\udf79', cat: 'Alcolici' }
    ],
    animazioni: true,
    schermoIntero: false,
    /* LA GRAFICA 2.0, SPENTA DI SERIE.
       Tre cose che dalla parte del banco sembrano di troppo -- lo stesso
       numero di pagato in due posti, un tasto che si chiama diversamente
       dalla schermata che apre, e i totali di sezione che rifanno il
       mestiere dello scontrino. Toglierle e' un'opinione, non un
       guasto: chi sta in cassa da mesi puo' trovarsi peggio.
       Quindi si accende a mano, non tocca NESSUN dato, e si spegne
       tornando esattamente a prima. */
    grafica2: false,
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
    /* MEZZ'ORA DI SERIE: e' il taglio che si vende di piu', e partire
       da un'ora voleva dire correggere quasi sempre. Chi resta di piu'
       lo dice, e un tocco sui tagli rapidi basta. */
    durationMinutes: 30,
    payLater: false,
    /* SI PARTE DA ZERO BAMBINI. Uno di serie voleva dire che ogni
       ingresso nasceva gia' con un cliente dentro e un prezzo sul
       conto: chi passava solo per il bar o solo per il Crazy doveva
       prima TOGLIERE, e chi ne aveva tre ne aggiungeva due. Da zero
       si conta e basta, e il conto parte da zero come deve. */
    children: 0,
    crazyJumping: 0,
    people: [],
    barItems: [],
    /* la nota del gruppo: sta nel Parco, non dentro una persona */
    note: '',
    /* la sigla si sceglie subito, non alla registrazione: serve PRIMA --
       e' quella che si scrive sul bracciale mentre si consegna */
    sigla: nuovaSigla(),
    braceletColor: null,
    /* SI PARTE SU AUTO. Prima si partiva "senza", con l'idea che il
       colore andasse messo apposta per non scordarselo -- ma al banco
       il bracciale giusto e' quasi sempre quello della fascia oraria,
       e partire senza voleva dire sceglierlo a mano ogni volta (o
       scordarselo davvero). Auto lo mette da se' e resta cambiabile. */
    braceletCustom: false,
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
  /* ZERO MINUTI VENDUTI, ZERO EURO. Senza questa riga il primo
     scaglione del cartello si applicava anche a chi non ha comprato
     nemmeno un minuto -- e chi fa solo il Crazy, che di tempo di parco
     non ne compra, si vedeva addebitare tre euro a testa appena
     aggiungeva un bambino. */
  if (mins <= 0) return 0;
  for (const t of list) if (mins <= t.m) return t.p;
  /* Oltre l'ultimo scaglione il prezzo NON sale piu': dopo le 2 ore
     sono 24 euro e basta. Prima proseguiva in proporzione e a 3 ore
     avrebbe chiesto 36. */
  return list[list.length - 1].p;
}
/* LA FASCIA DEL TEMPO PASSATO: quella SOTTO, non quella sopra.
   Chi COMPRA il tempo sceglie una durata dal cartello e paga quella:
   li' e' giusto lo scaglione che la contiene, perche' e' quello che ha
   comprato. Chi sta a TEMPO APERTO invece non ha comprato niente: si
   guarda quanto e' stato dentro e si prende la fascia che ha gia'
   passato.

   Prima si prendeva la piu' VICINA, e prima ancora quella SOPRA. La
   fascia sopra faceva pagare dieci euro per trentuno minuti -- un
   minuto oltre la mezz'ora -- e al banco non c'era modo di
   spiegarlo. La piu' vicina lo faceva ancora a trentotto minuti.
   Adesso si scende sempre: trentotto minuti sono mezz'ora passata, non
   quaranta minuti. Chi resta dentro paga almeno il primo scaglione,
   che e' il minimo del cartello: sotto quello non si scende.
   Sopra l'ultima fascia si resta sull'ultima -- oltre le due ore il
   prezzo non sale piu'. */
function fasciaSotto(mins) {
  const list = tariffs();
  if (!list.length || mins <= 0) return null;
  let best = list[0];
  for (const t of list) if (t.m <= mins) best = t;
  return best;
}

/* IL CONTO DEL TEMPO APERTO, passaggio per passaggio.
   Quanto sono stati dentro, quanto gliene regala il Crazy, quanto ne
   resta da pagare, su che fascia cade. E' lo stesso conto che fa
   costOf() -- `up5(dentro - regalati)` e poi il cartello -- scritto in
   modo che si possa mostrare invece di doverlo indovinare. */
/* IL CONTO DEL TEMPO APERTO, IN UN POSTO SOLO.
   Da qui esce sia il prezzo (`costOf` chiama questa) sia la riga che
   lo spiega al banco. Erano due conti scritti a parte, e si erano gia'
   scollati: la spiegazione contava dall'ingresso mentre il prezzo
   contava da quando il parco era stato comprato. Un conto che si
   spiega da solo in modo diverso da come si calcola e' peggio di un
   conto senza spiegazione. */
function contiAperto(c, ora) {
  c = c || C();
  ora = num(ora, Date.now());
  /* da quando sono ARRIVATI: e' il numero che si legge a video */
  const dentro = Math.max(0, (ora - num(c.startTime, ora)) / 60000);
  /* e da quando conta il PARCO, che e' un'altra data per chi e'
     entrato a saltare e ha comprato il tempo dopo */
  const daParco = Math.max(0, (ora - inizioParco(c)) / 60000);
  /* SI TOGLIE SOLO L'OMAGGIO DEL SOLO CRAZY, non i minuti dei giri.
     I giri non entrano nel prezzo del parco: ne' sommati ne' sottratti.
     Toglierli faceva scendere lo scaglione e il giro si pagava da
     solo -- si segnava un giro da quattro euro e il totale non si
     muoveva. L'omaggio invece e' di chi e' entrato SOLO per saltare e
     tempo di parco non ne ha mai comprato. */
  const regalati = omaggioDi(c);
  /* e il tempo in pausa non si conta: sono usciti a mangiare, l'orologio
     si ferma e riparte da dove l'avevano lasciato */
  const fermo = fermoDi(c, ora);
  const contati = Math.max(0, daParco - regalati - fermo);
  /* LA FASCIA PIU' VICINA, NON QUELLA SOPRA. Qui si arrotondava ai
     cinque in su e poi si prendeva la fascia sopra: trentuno minuti
     diventavano trentacinque e finivano nella fascia dei quaranta, dieci
     euro invece di sette per un minuto oltre la mezz'ora. Chi sta a
     tempo aperto non ha comprato una durata: si guarda quanto e' stato
     dentro davvero e si prende la fascia che gli somiglia di piu'. */
  const f = fasciaSotto(contati);
  return { dentro, daParco, regalati, fermo, contati,
    inPausa: !!num(c.pausaDa, 0),
    su: up5(contati),
    scaglione: f ? f.m : 0, prezzo: f ? f.p : 0 };
}

/* ══════════════════════════════════════════════════════════
   LA PAUSA DEL TEMPO APERTO
   A tempo aperto l'orologio corre da solo, e ogni tanto va fermato:
   escono a mangiare, tornano fra un'ora, e quell'ora non l'hanno
   passata dentro. Senza un modo di fermarlo si finiva a rifare il
   conto a mano, o a rimandarli via.
   Due soli numeri: `pausaDa` e' quando si e' fermato (zero = sta
   correndo), `pausato` e' quanto si e' gia' stati fermi in tutto. Il
   tempo in pausa di ADESSO si somma solo se e' fermo in questo
   momento, cosi' il conto si aggiorna da se' mentre sta fermo senza
   che nessuno debba scrivere niente. */
function fermoDi(c, ora) {
  c = c || C();
  ora = num(ora, Date.now());
  const gia = Math.max(0, num(c.pausato, 0));
  const da = num(c.pausaDa, 0);
  const adesso = da > 0 ? Math.max(0, ora - da) : 0;
  return (gia + adesso) / 60000;
}

/* Ferma o fa ripartire l'orologio. Torna `true` se da qui in poi e'
   fermo, cosi' chi chiama sa che faccia far fare al tasto. */
function commutaPausa(e) {
  e = e || C();
  const da = num(e.pausaDa, 0);
  if (da > 0) {
    /* riparte: quello che e' passato fermi finisce nel totale */
    e.pausato = Math.max(0, num(e.pausato, 0)) + Math.max(0, Date.now() - da);
    e.pausaDa = 0;
    return false;
  }
  e.pausaDa = Date.now();
  return true;
}

/* Chiudere la pausa senza farla sparire: serve quando si esce dal
   tempo aperto o si registra l'uscita. Il tempo gia' stato fermi resta
   contato -- e' tempo che non hanno passato dentro -- ma l'orologio
   della pausa non puo' restare acceso su un conto che non lo guarda
   piu', se no ricompare mesi dopo con un buco enorme. */
function chiudiPausa(e) {
  if (e && num(e.pausaDa, 0) > 0) commutaPausa(e);
}

/* minuti scritti come si leggono: a occhio sotto l'ora, in ore e
   minuti sopra */
function minTxt(m) {
  m = Math.max(0, Math.round(num(m, 0)));
  return m < 60 ? m + '\u2032' : fmtMin(m);
}

/* LO STESSO CONTO IN UNA RIGA SOLA.
   `corto` per la lista, dove il tempo passato sta gia' scritto grande
   di fianco e ripeterlo sarebbe rumore. */
function spiegaAperto(c, corto, ora) {
  const a = contiAperto(c, ora);
  /* IL TEMPO FERMO VA DETTO DOVUNQUE SI LEGGA IL CONTO -- scheda,
     fascia dei totali, scontrino -- perche' e' la ragione per cui i
     minuti contati sono meno di quelli passati: senza, chi incassa
     legge \u00abdentro da 73\u2032\u00bb e \u00ab43\u2032 contati\u00bb e non capisce da dove esce
     la differenza. Questa riga la scrive una funzione sola, quindi i
     tre posti non possono raccontarla in tre modi. */
  const fermoTxt = a.fermo >= 0.5 ? ' \u00b7 ' + minTxt(a.fermo) + ' in pausa, non contati' : '';
  const stato = a.inPausa ? '\u23f8 fermo \u00b7 ' : '';
  if (a.contati <= 0) {
    if (a.dentro <= 0) return 'non sono ancora entrati';
    if (a.regalati > 0) return stato + 'coperti dai +' + minTxt(a.regalati) + ' del Crazy' + fermoTxt;
    return stato + 'appena entrati' + fermoTxt;
  }
  const conto = minTxt(a.contati) + ' contati \u2192 fascia ' + minTxt(a.scaglione);
  return stato + (corto ? conto : 'dentro da ' + minTxt(a.dentro) + ' \u00b7 ' + conto) + fermoTxt;
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
/* Le vendite di tempo devono stare dentro il tempo che c'e'. Se
   l'orario di uscita viene tirato indietro a mano, l'ultimo blocco
   venduto si accorcia (e sparisce, se non ci sta piu'): se no
   resterebbe un pezzo di tempo pagato che non esiste. */
function sistemaAggiunte(e) {
  if (!e) return;
  e.aggiunte = lista(e.aggiunte)
    .map(m => Math.max(0, Math.round(num(m, 0)))).filter(m => m > 0);
  const tot = Math.max(0, Math.round(num(e.durationMinutes, 0)));
  let somma = e.aggiunte.reduce((a, b) => a + b, 0);
  while (somma > tot && e.aggiunte.length) {
    const ultima = e.aggiunte[e.aggiunte.length - 1];
    const troppo = somma - tot;
    if (ultima > troppo) { e.aggiunte[e.aggiunte.length - 1] = ultima - troppo; somma -= troppo; }
    else { e.aggiunte.pop(); somma -= ultima; }
  }
  if (!e.aggiunte.length) delete e.aggiunte;
}

/* ══════════════════════════════════════════════════════════
   IL TEMPO DEL CRAZY SI CONTA A GIRI, NON A TESTE
   Tre bambini che salgono INSIEME fanno un giro solo: il gruppo resta
   dentro otto minuti in piu', non ventiquattro. Contarli a testa
   regalava mezz'ora a una comitiva -- e sballava l'ora d'uscita
   scritta sul bracciale.
   Se poi tornano a saltare, quello e' un altro giro: si aggiunge un
   turno e il tempo cresce di nuovo, sempre di otto minuti, che ci
   vadano in uno o in cinque.
   I SOLDI restano a testa: il Crazy si paga per ognuno che lo fa. E'
   il tempo che non si moltiplica.
   Di serie e' un giro solo (i dati vecchi non hanno il campo), e i
   giri non possono essere piu' dei giri pagati. */
/* I GIRI, UNO PER UNO: `crazyGiri` e' quanti sono saliti in ognuno.
   Un numero solo non bastava: al primo giro salgono in tre, al secondo
   in due, e "cinque" non racconta nessuna delle due cose. La somma dei
   giri e' sempre `crazyJumping` -- i giri pagati -- e chi arriva da
   una versione vecchia, che quel campo non ce l'ha, vale un giro solo
   con tutti dentro: e' la lettura giusta di quei dati. */
function giriCrazy(e) {
  e = e || C();
  const q = clamp(num(e.crazyJumping, 0), 0, 1e6);
  /* UN GIRO PUO' ESSERE APERTO E VUOTO: e' quello appena aperto, dove
     stai per contare chi sale. Uno zero in lista non e' spazzatura, e'
     un giro che sta cominciando -- e infatti non regala minuti finche'
     non ci sale qualcuno. */
  const g = lista(e.crazyGiri).map(n => Math.max(0, Math.round(num(n, 0))));
  if (!g.length) return q ? [q] : [];
  /* se la somma non torna -- dati vecchi, cloud, un ripristino -- si
     riallinea sull'ULTIMO giro, che e' quello che si sta segnando */
  let somma = g.reduce((a, b) => a + b, 0);
  while (somma < q) { g[g.length - 1]++; somma++; }
  for (let i = g.length - 1; i >= 0 && somma > q; i--) {
    const giu = Math.min(g[i], somma - q);
    g[i] -= giu; somma -= giu;
  }
  return g;
}
/* i giri che CONTANO per il tempo: quelli in cui e' salito qualcuno.
   Un giro aperto e ancora vuoto non ha regalato niente. */
function turniCrazy(e) { return giriCrazy(e).filter(n => n > 0).length; }

/* Mette o toglie salite, sempre dall'ULTIMO giro: e' quello aperto,
   quello che stai segnando adesso. Quando un giro resta senza nessuno
   sparisce, e col giro se ne vanno i suoi minuti regalati. */
/* IL PIU' E IL MENO DELLA CARD sono quelli di sempre: cambiano il
   numero delle salite. Quello che cambiano DENTRO e' il giro scelto --
   di suo l'ultimo -- perche' una salita appartiene sempre a un giro.
   Quando un giro resta senza nessuno sparisce, e con lui i suoi minuti
   regalati: un giro a cui non e' salito nessuno non e' mai esistito. */
/* ══════════════════════════════════════════════════════════
   IL TEMPO DATO PER UN GIRO NON SI RIPRENDE

   Al banco: gruppo con venti minuti ancora, si segna un giro e l'ora
   d'uscita va a ventotto. Si toglie il giro -- il bambino non e' salito,
   il tocco era di troppo -- e l'uscita torna a venti. Se nel frattempo
   quei minuti erano passati, il gruppo diventa ROSSO all'istante: gente
   a cui era stato detto "fino alle 15:40" si ritrova scaduta, e chi sta
   in cassa non capisce perche'.
   I minuti del Crazy sono un REGALO: una volta dati, sono dati. Toglierli
   e' una cosa che nessuno ha chiesto e che nessuno vede arrivare.

   Il regalo si segnava solo per chi era GIA' scaduto (`regalaDaAdesso`):
   per chi era ancora dentro i minuti stavano solo nel calcolo, e
   togliendo il giro svanivano. Adesso qualunque strada che tolga giri --
   il meno della card, la ✕ di un giro, il numero cambiato a mano -- se
   accorcia l'uscita lascia un PAVIMENTO all'ora che aveva promesso.
   Sta attorno ai tre mutatori e non ai tocchi, cosi' una strada nuova
   e' protetta da se'.
   ══════════════════════════════════════════════════════════ */
function nonTogliereTempo(c, fn) {
  c = c || C();
  /* `endTimeOf` comprende gia' il pavimento di prima, quindi questo non
     puo' che salire: un regalo non si accorcia mai. */
  const prima = endTimeOf(c);
  const crazyPrima = minutiCrazy(c);
  const esito = fn();
  /* SOLO SE SONO STATI TOLTI DEI MINUTI DI GIRO.
     Queste stesse funzioni fanno anche un'altra cosa: segnare il primo
     giro di chi entra SOLO per saltare azzera il tempo di parco
     comprato (`soloCrazy`), e li' l'ora d'uscita scende per un motivo
     che col regalo non c'entra niente. Guardando solo l'ora finale il
     pavimento scattava anche li', e a un solo-Crazy restava incollata
     addosso l'ora d'uscita di un'ora di parco che non aveva mai
     comprato. */
  if (minutiCrazy(c) < crazyPrima && endTimeOf(c) < prima) {
    c.regaloFinoA = Math.max(num(c.regaloFinoA, 0), prima);
  }
  return esito;
}

function metteCrazy(c, n) {
  return nonTogliereTempo(c, () => metteCrazyGrezzo(c, n));
}
function metteCrazyGrezzo(c, n) {
  n = clamp(Math.round(num(n, 0)), 0, 9999);
  const g = giriCrazy(c);
  let somma = g.reduce((a, b) => a + b, 0);
  let i = g.length ? clamp(giroScelto, 0, g.length - 1) : 0;
  while (somma < n) {
    if (!g.length) { g.push(0); i = 0; }
    g[i]++; somma++;
  }
  while (somma > n && g.length) {
    if (g[i] > 1) { g[i]--; somma--; }
    else {
      somma -= g[i]; g.splice(i, 1);
      i = Math.min(i, Math.max(0, g.length - 1));
    }
  }
  c.crazyJumping = somma;
  if (somma > 0) { c.crazyGiri = g; giroScelto = i; } else { delete c.crazyGiri; giroScelto = 99; }
  soloCrazy(c);
  rimettiSoldiCrazy(c);
}

/* IL GIRO SCELTO: quello su cui lavorano il piu' e il meno della
   card. Di suo e' l'ultimo -- si segna quasi sempre quello che sta
   succedendo adesso -- e si cambia toccando un giro nello storico.
   Non e' un dato dell'ingresso ma un fatto dello schermo: si azzera
   quando il pannello cambia gruppo. */
let giroScelto = 99;
function giroOra(c) {
  const g = giriCrazy(c || C());
  return g.length ? clamp(giroScelto, 0, g.length - 1) : 0;
}

/* QUANTE SALITE HA GIA' PAGATO UN GIRO.
   La cassa conta i giri pagati, non le volte in cui sono saliti:
   "tre pagati su cinque"
   e' un numero solo, e da quello non si capisce QUALI giri siano a
   posto -- col gruppo davanti che chiede "quello di prima l'ho gia'
   pagato?" e nessuno che sappia rispondere.
   Si riempiono IN ORDINE, dal primo giro: e' come vanno le cose al
   banco, e non richiede di segnarsi altri dati. */
function pagateDelGiro(c, i) {
  c = c || C();
  const g = giriCrazy(c);
  if (i < 0 || i >= g.length) return 0;
  let restano = conConto(c, () => bcPag('crazy'));
  for (let k = 0; k < i; k++) restano -= g[k];
  return clamp(restano, 0, g[i]);
}

/* PAGARE UN GIRO. Le salite pagate si riempiono in ordine, dal primo
   giro: pagare il terzo vuol dire arrivare col conto fino alla fine del
   terzo. Toccando un giro gia' pagato si torna indietro a prima di
   quello -- che e' come si disfa uno sbaglio al banco. */
function pagaFinoAlGiro(c, i) {
  const g = giriCrazy(c);
  if (i < 0 || i >= g.length) return;
  let prima = 0, fino = 0;
  g.forEach((n, k) => { if (k < i) prima += n; if (k <= i) fino += n; });
  conConto(c, () => {
    const ora = bcPag('crazy');
    segnaPagate('crazy', ora >= fino ? prima : fino);
  });
}

/* Mette o toglie una salita da UN giro preciso. Quando un giro resta
   senza nessuno sparisce, e con lui i suoi minuti regalati: un giro a
   cui non e' salito nessuno non e' mai esistito. */
/* I SOLDI SEGUONO LE SALITE. Se le salite calano -- un giro
   cancellato, uno tolto per sbaglio -- la riga non puo' restare
   "pagata" per roba che non c'e' piu': quei soldi tornano indietro,
   esattamente come fa il meno della card (bcSetQ).
   Senza, cancellando un giro gia' pagato il conto diceva "da
   restituire 4,00 euro" a chi non aveva incassato niente: un giro
   inserito per sbaglio diventava un debito verso il cliente. */
function rimettiSoldiCrazy(c) {
  conConto(c, () => {
    const q = clamp(num(c.crazyJumping, 0), 0, 1e6);
    if (bcPagGrezzo('crazy') > q) segnaPagate('crazy', q);
  });
}

function cambiaGiro(c, i, delta) {
  return nonTogliereTempo(c, () => cambiaGiroGrezzo(c, i, delta));
}
function cambiaGiroGrezzo(c, i, delta) {
  const g = giriCrazy(c);
  if (i < 0 || i >= g.length) return;
  const era = g[i];
  g[i] = Math.max(0, g[i] + num(delta, 0));
  /* UN GIRO SVUOTATO COL MENO SE NE VA.
     Prima restava: la riga «0 · da contare» rimaneva in lista, e per
     toglierla bisognava anche premere la sua ✕. Due gesti per dire una
     cosa sola -- «no, su questo non e' salito nessuno» -- e intanto lo
     storico si riempiva di righe vuote che sembravano giri veri.
     Il giro APPENA APERTO invece resta, ed e' un'altra cosa: quello e'
     lo zero da riempire, e sparirgli sotto le dita renderebbe
     impossibile aprirne uno. Si distinguono da come ci sono arrivati:
     qui si toglie (era > 0), li' si apre e basta.
     Vale anche per l'ULTIMO rimasto: svuotandolo la lista torna vuota e
     lo storico dice «Nessun giro», che e' la verita' -- meglio di una
     riga «0 · da contare» che sembra un giro vero. */
  if (g[i] === 0 && era > 0) {
    g.splice(i, 1);
    /* il giro scelto non deve restare puntato oltre la fine, ne' su
       quello che ha preso il posto di questo */
    if (giroScelto >= g.length) giroScelto = g.length - 1;
    else if (giroScelto > i) giroScelto--;
  }
  c.crazyJumping = g.reduce((a, b) => a + b, 0);
  c.crazyGiri = g;
  soloCrazy(c);
  rimettiSoldiCrazy(c);
}

/* SOLO CRAZY: dieci minuti in omaggio, e niente tempo comprato.
   Chi entra solo per saltare non compra tempo di parco: gli si da' la
   permanenza che serve -- salire, saltare, uscire -- e non si paga.
   Il tempo comprato va a zero, se no il primo bambino aggiunto dopo si
   sarebbe portato dietro il prezzo di quei minuti.
   Al contrario, se il Crazy sparisce spariscono anche i minuti: erano
   suoi. E se dopo arrivano i bambini l'omaggio RESTA: quello che
   comprano da li' in poi si paga per intero, questi no. */
function soloCrazy(c) {
  c = c || C();
  const bimbi = clamp(num(c.children, 0), 0, 1e6);
  const crazy = clamp(num(c.crazyJumping, 0), 0, 1e6);
  const quanti = clamp(num(settings.crazySoloMinuti, 0), 0, 1e6);
  if (!crazy) {
    delete c.omaggio;
    /* se se ne va il Crazy e non c'era tempo comprato, l'ingresso
       resterebbe con una permanenza di ZERO minuti: gli si rimette la
       mezz'ora di serie, che e' quello che avrebbe avuto se fosse nato
       come un ingresso normale */
    if (clamp(num(c.durationMinutes, 0), 0, 1e6) <= 0) c.durationMinutes = 30;
    return;
  }
  if (!bimbi && !omaggioDi(c)) {
    c.omaggio = quanti;
    c.durationMinutes = 0;
    delete c.aggiunte;
  }
}

/* E' un ingresso di soli salti? Cioe': c'e' il Crazy, non c'e'
   nessuno in sala e non hanno comprato tempo di parco. */
function soloSalti(c) {
  c = c || C();
  return omaggioDi(c) > 0 &&
    clamp(num(c.durationMinutes, 0), 0, 1e6) <= 0 &&
    clamp(num(c.children, 0), 0, 1e6) <= 0;
}

/* I TAGLI CHIESTI A MANO. Su un ingresso di soli salti la riga dei
   tagli lascia il posto all'avviso: i tagli sono la cosa da NON fare
   li', e tenerli accesi accanto a un ingresso senza tempo comprato
   confondeva. Ma se poi decidono di restare, il tasto dell'avviso li
   richiama -- per QUEL conto, e finche' resta aperto. */
let tagliDi = null;

/* L'avviso e' al posto dei tagli, adesso? Lo e' su un ingresso di soli
   salti, finche' nessuno ha chiesto i tagli col tasto. */
function avvisoSoli(c) {
  c = c || C();
  return soloSalti(c) && tagliDi !== c;
}

/* APRE UN GIRO, E BASTA. Non ci fa salire nessuno: chi sale lo conti
   tu col piu' della card, che riparte da zero. Prima ci metteva dentro
   una salita di sua iniziativa -- e quindi quattro euro sul conto che
   nessuno aveva chiesto. */
function giroNuovo(c) {
  const g = giriCrazy(c);
  /* un giro vuoto c'e' gia': non se ne apre un altro sopra */
  if (!g.length || g[g.length - 1] > 0) g.push(0);
  c.crazyGiri = g;
  c.crazyJumping = g.reduce((a, b) => a + b, 0);
  /* quello appena aperto e' quello che si sta segnando */
  giroScelto = g.length - 1;
  soloCrazy(c);
}

/* Cancella un giro intero: chi c'era dentro esce dal conto e i suoi
   minuti se ne vanno con lui. */
function viaGiro(c, i) {
  return nonTogliereTempo(c, () => viaGiroGrezzo(c, i));
}
function viaGiroGrezzo(c, i) {
  const g = giriCrazy(c);
  if (i < 0 || i >= g.length) return;
  g.splice(i, 1);
  c.crazyJumping = g.reduce((a, b) => a + b, 0);
  if (g.length) c.crazyGiri = g; else delete c.crazyGiri;
  giroScelto = Math.min(giroScelto, Math.max(0, g.length - 1));
  soloCrazy(c);
  rimettiSoldiCrazy(c);
}
/* I MINUTI IN OMAGGIO: permanenza regalata che NON e' tempo comprato.
   Li prende chi entra solo per il Crazy -- il tempo di salire e
   saltare -- e se li tiene anche se dopo decide di fermarsi al parco:
   quello che compra dopo lo paga per intero, questi restano gratis.
   Stanno in un campo loro apposta: dentro `durationMinutes` sarebbero
   diventati tempo da pagare al primo bambino aggiunto. */
function omaggioDi(e) {
  e = e || C();
  return clamp(Math.round(num(e.omaggio, 0)), 0, 1e6);
}

/* I MINUTI REGALATI DAI GIRI.
   Ogni giro tiene dentro il gruppo un altro po': il tempo di salire,
   saltare e scendere.
   MA IL PRIMO GIRO DEL SOLO CRAZY E' GIA' PAGATO DALL'OMAGGIO. Chi
   entra solo per saltare ha i suoi dieci minuti regalati, e QUELLI
   SONO il primo giro -- salire, saltare, uscire. Sommarci anche i
   minuti del giro voleva dire regalare due volte la stessa cosa:
   dieci piu' cinque per un giro solo. Dal secondo in poi invece si
   sommano davvero, perche' sono salite in piu': 10 + 5 + 5.
   Su un ingresso normale non cambia niente: li' l'omaggio non c'e' e
   ogni giro conta per intero. */
function minutiCrazy(e) {
  const extra = clamp(num(settings.crazyExtraMinutes, 0), 0, 1e6);
  const primoGratis = omaggioDi(e) > 0 ? 1 : 0;
  return Math.max(0, turniCrazy(e) - primoGratis) * extra;
}

/* Tutto il tempo che il gruppo sta dentro senza pagarlo: i minuti dei
   giri piu' l'omaggio del solo Crazy. E' questo il numero che si
   scrive in cima allo storico -- non i soli giri, che sul primo di un
   solo-Crazy direbbero "+0" mentre il gruppo resta dentro dieci
   minuti. */
function regalatiDi(e) {
  return minutiCrazy(e) + omaggioDi(e);
}

/* DA QUANDO CONTA IL TEMPO DI PARCO.
   Di norma dall'ingresso: si entra e si comincia. Ma chi arriva per
   saltare e SOLO DOPO decide di fermarsi al parco compra quel tempo in
   un altro momento, e contarglielo dall'arrivo voleva dire regalargli
   -- o piu' spesso RUBARGLI -- tutto quello che era passato nel
   frattempo.
   E' il guasto visto al banco: un papa' entrato alle 21:40 per due giri,
   che alle 22:10 compra dieci minuti di parco per tre bambini, si vedeva
   scritto «esce alle 22:00». Dieci minuti nel passato, scaduto prima
   ancora di cominciare.
   `parcoDa` si scrive da se' quando i minuti di parco passano da zero a
   qualcosa: e' il momento in cui quel tempo e' stato comprato. */
function inizioParco(e) {
  e = e || C();
  const d = num(e.parcoDa, NaN);
  return Number.isFinite(d) && d > 0 ? d : num(e.startTime, 0);
}

function endTimeOf(e) {
  const min = num(e.durationMinutes, 0);
  /* SENZA TEMPO DI PARCO restano dentro coi minuti regalati, che partono
     dall'ingresso: e' il solo-Crazy, e li' non c'e' niente di comprato. */
  if (min <= 0) return e.startTime + regalatiDi(e) * 60000;
  /* COL TEMPO DI PARCO si conta da quando l'hanno comprato, e i minuti
     dei giri si sommano perche' durante una salita non stanno usando il
     tempo del parco. L'omaggio del solo-Crazy invece NON si somma: era
     il tempo per salire e scendere, ed e' gia' stato speso prima che il
     tempo di parco cominciasse. Sommarlo voleva dire darglielo due
     volte. */
  const base = inizioParco(e) + (min + minutiCrazy(e)) * 60000;
  /* UN GIRO FATTO A TEMPO SCADUTO REGALA DAVVERO.
     I minuti del Crazy partono da dove finisce il tempo di parco: se
     quel tempo e' gia' finito da un pezzo, il regalo cadeva nel passato
     e non valeva niente -- otto minuti dati a chi ne aveva sforati
     dieci sono zero minuti. Ma il giro l'hanno fatto adesso, e mentre
     si preparavano il tempo correva lo stesso.
     `regaloFinoA` lo segna chi apre il giro: da quel momento hanno i
     loro minuti, comunque. */
  return Math.max(base, num(e.regaloFinoA, 0));
}
/* IL COLORE DELLA SCHEDA E' L'OROLOGIO, e cambia quando cambia
   davvero qualcosa:
     verde   — c'e' tempo
     giallo  — ultimi minuti (di serie cinque)
     rosso   — SCADUTO, dal secondo dopo la fine
   Prima il rosso aspettava anche la tolleranza -- dieci minuti -- e in
   quei dieci minuti la scheda diceva "SFORATO DA 04:12" restando
   gialla: il numero diceva una cosa e il colore un'altra, e a colpo
   d'occhio (che e' il modo in cui questa lista si guarda) sembrava
   ancora tutto a posto.
   La tolleranza non sparisce: e' il tempo che si concede prima di
   andare a chiamare qualcuno, e resta scritta sul countdown. Ma il
   colore no: scaduto e' scaduto. */
function stateOf(e, now) {
  /* una vendita al banco non scade: non c'e' nessuno dentro a cui
     andare dietro. Ha un colore suo, e non entra nel giro dei verdi,
     gialli e rossi. */
  if (e.soloBar) return 'bar';
  if (e.payLater) return 'later';
  const r = endTimeOf(e) - now;
  if (r <= 0) return 'danger';
  if (r < clamp(num(settings.warnBeforeMinutes, 5), 0, 1e6) * 60000) return 'warn';
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
  const regalati = regalatiDi(entry);
  let base;
  if (entry.payLater) {
    /* A TEMPO APERTO IL PARCO SI PAGA SUL TEMPO PASSATO DENTRO, E I
       GIRI NON LO ABBASSANO.
       Qui si toglieva anche `minutiCrazy`, cioe' i minuti regalati dai
       giri. In tempo COMPRATO quel regalo e' giusto e non costa niente
       a nessuno: allunga l'ora d'uscita lasciando il prezzo fermo. A
       tempo aperto pero' non c'e' nessuna ora d'uscita da allungare, e
       togliere quei minuti diventa uno SCONTO sul parco: il prezzo
       scendeva di uno scaglione e si mangiava il giro. Al banco si
       vedeva «Paga 24,00 €», si segnava un giro da quattro euro, e
       restava «Paga 24,00 €» -- il giro sparito, pagato dalla cassa.
       La regola e' sempre stata che i Crazy NON ENTRANO nel prezzo del
       parco: ne' sommati ne' sottratti. Il giro si paga a parte, col
       suo prezzo, e il parco si paga per il tempo che si e' stati
       dentro.
       L'OMAGGIO DEL SOLO CRAZY resta tolto, ed e' un'altra cosa: sono
       i minuti di chi e' entrato SOLO per saltare, e non li ha mai
       chiesti al parco. Toglierli non e' uno sconto, e' non far pagare
       tempo di parco a chi non ne ha comprato. */
    base = contiAperto(entry).prezzo;
  } else {
    const totMin = clamp(entry.durationMinutes, 0, 1e6);
    /* IL TEMPO VENDUTO DOPO SI PAGA AL SUO PREZZO.
       Estendere non e' ricalcolare: e' vendere un altro pezzo di
       tempo. Contando la differenza sul totale, da mezz'ora sia
       "+15m" sia "+30m" finivano nello stesso scaglione e costavano
       LO STESSO -- due tasti diversi, un prezzo solo, e mezz'ora
       regalata senza accorgersene.
       Adesso ogni blocco venduto resta scritto in `aggiunte` e si paga
       il prezzo del cartello per QUEL blocco: mezz'ora costa mezz'ora,
       la seconda mezz'ora pure. Il tempo iniziale continua a pagarsi
       sul totale, come ha sempre fatto: chi entra per un'ora paga
       l'ora, non due mezze. */
    const vendute = lista(entry.aggiunte)
      .map(m => Math.max(0, Math.round(num(m, 0)))).filter(m => m > 0);
    const sommaVendute = Math.min(vendute.reduce((a, b) => a + b, 0), totMin);
    const iniziale = Math.max(0, totMin - sommaVendute);
    const prezzoVendute = vendute.reduce((a, m) => a + priceFor(up5(m)), 0);
    if (settings.tariffaSuTotale === false) {
      // a scaglioni: la durata iniziale al suo prezzo, il tempo aggiunto al suo
      /* IL PEZZO INIZIALE NON PUO' ESSERE PIU' LUNGO DEL TEMPO CHE C'E'.
         `baseMinutes` e' la durata al momento della registrazione e non si
         muove piu'; il tempo invece si accorcia col meno. Senza questo
         tetto un'ora riportata a mezz'ora continuava a pagare l'ora --
         dodici euro invece di sette -- perche' lo scaglione si prendeva
         da `baseMinutes` e l'aggiunta finiva a zero. Stessi minuti
         sull'orologio, due prezzi a seconda di come ci si era arrivati:
         la stessa famiglia dei "17 euro a caso". */
      const iniz = Math.min(clamp(num(entry.baseMinutes, iniziale), 0, 1e6), iniziale);
      const agg = Math.max(0, iniziale - iniz);
      base = priceFor(up5(iniz)) + (agg > 0 ? priceFor(up5(agg)) : 0) + prezzoVendute;
    } else {
      // sul totale: chi resta un'ora paga la tariffa dell'ora, non 30'+30'
      base = priceFor(up5(iniziale)) + prezzoVendute;
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
  /* LE VENDITE AL BANCO IN CIMA: restano due minuti e poi se ne vanno da
     sole, quindi se c'e' da correggerne una il momento e' adesso.
     Ordinarle fra i gruppi per ora di uscita non aveva senso -- un'ora
     di uscita non ce l'hanno. */
  const bar = a.filter(e => e.soloBar).sort((x, y) => num(y.createdAt, 0) - num(x.createdAt, 0));
  const resto = a.filter(e => !e.soloBar);
  return bar
    .concat(resto.filter(e => !e.payLater).sort((x, y) => endTimeOf(x) - endTimeOf(y)))
    .concat(resto.filter(e => e.payLater).sort((x, y) => x.startTime - y.startTime));
}
/* quanti ingressi archiviati si disegnano prima di chiedere. Duecento
   sono un paio di settimane piene: oltre, si sta cercando altro. */
const ARCHIVIO_A_VISTA = 200;
let archivioTutto = false;
/* quello che si sta cercando in archivio: e' un fatto dello schermo, non
   un dato dell'ingresso, quindi non si salva */
let cercaArchivio = '';

/* Cerca per sigla, nome, nota e ora. Tutto quello che di un gruppo si
   ricorda: «era AC», «era la mamma con la borsa», «quelli della torta»,
   «erano entrati alle nove». Le parole si cercano tutte, in qualunque
   ordine -- «anna torta» trova la mamma Anna con la nota della torta. */
function filtraArchivio(lista_) {
  const q = String(cercaArchivio || '').trim().toLowerCase();
  if (!q) return lista_;
  const parole = q.split(/\s+/).filter(Boolean);
  return lista_.filter(e => {
    const dove = [
      String(e.sigla || ''),
      lista(e.people).map(p => nameOf(p) + ' ' + roleOf(p.role).label).join(' '),
      lista(e.people).map(p => AV.traits(p.avatar, 6, true).map(t => t.txt).join(' ')).join(' '),
      String(e.note || ''),
      fmtTime(e.startTime),
      e.soloBar ? 'solo bar' : '',
      e.status === 'cancelled' ? 'annullato' : 'uscito'
    ].join(' ').toLowerCase();
    return parole.every(w => dove.indexOf(w) >= 0);
  });
}

function archived() {
  return entries.filter(e => e.status !== 'active')
    .sort((a, b) => (b.closedAt || b.createdAt || 0) - (a.closedAt || a.createdAt || 0));
}
function roleOf(k) { return AV.ROLES.find(r => r.key === k) || AV.ROLES[AV.ROLES.length - 1]; }
function nameOf(p) { return (p.name && p.name.trim()) || roleOf(p.role).label; }

let sheetEsc = null;
/* IL FOGLIO CHE C'E' ADESSO. Serve perche' aprire un foglio ne
   sostituisce un altro senza passare dal suo close(): chi aspettava di
   sapere che era finito -- il registro, che si rimette in piedi da se'
   -- restava a credere di essere ancora aperto. */
let foglioVivo = null;

function sheet(title, opts) {
  opts = opts || {};
  const root = $('#modalRoot');
  /* il foglio di prima e' finito: si toglie il suo tasto Esc e si
     avvisa chi lo aspettava */
  if (sheetEsc) { document.removeEventListener('keydown', sheetEsc); sheetEsc = null; }
  const finito = foglioVivo; foglioVivo = null;
  if (finito && typeof finito.onClose === 'function') finito.onClose();
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

  const mio = { onClose: opts.onClose };
  foglioVivo = mio;
  const close = () => {
    root.classList.add('hidden');
    root.innerHTML = '';
    document.removeEventListener('keydown', sheetEsc);
    sheetEsc = null;
    if (foglioVivo === mio) foglioVivo = null;
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
            <button class="txt pc-oralive" data-a="ora" data-v="ora"><span class="em">\ud83d\udccd</span> Ora</button>
          </span>
          <span class="tp-gr pc-gfine">
            <span class="em">\ud83d\udeaa</span>
            <button data-a="fine" data-v="-1" aria-label="esce prima">\u2212</button>
            <span class="v num pc-fine">--:--</span>
            <button data-a="fine" data-v="1" aria-label="esce dopo">+</button>
          </span>
          <!-- QUANTO TEMPO HANNO COMPRATO, in fondo a destra accanto al
               bracciale. Le due scritte «Ingresso» e «Uscita» dicevano
               una cosa che i due disegni -- l'orologio e la porta --
               dicono da soli; i minuti no, e senza di loro dopo un +5
               o un +30 nessun taglio e' piu' acceso e non si sa piu' a
               che punto si e'. E' lo stesso numero che sta nella
               striscia della lista, nello stesso posto: a destra. -->
          <span class="tp-min"><span class="em">\u23f1\ufe0f</span><b class="num pc-min">30m</b></span>
          <span class="brc tp-dx">
            <!-- LE DUE LETTERE STANNO COL BRACCIALE perche' e' li' che
                 finiscono: si scrivono sopra mentre lo si consegna. -->
            <span class="brc-sigla pc-sigla"></span>
            <button class="brc-b" data-a="bracapri">
              <span class="pallo pc-pallo"></span><span class="pc-bracnome">Auto</span>
            </button>
            <span class="brc-menu hidden">
              <span class="wl-k"><span class="em">\ud83c\udf97\ufe0f</span> Bracciale</span>
              <span class="wrist-row pc-brac"></span>
            </span>
          </span>
        </div>
        <span class="tp-om hidden"></span>
        <span class="tp-parcoda hidden"></span>
        <div class="tp-filo"><i class="pc-filo"></i></div>
        <div class="tp-riga">
          <div class="chips pc-dur"></div>
          <span class="tp-dx pc-pag"></span>
        </div>
        <!-- ESTENDI TEMPO: una sezione sua, che compare solo per chi e'
             GIA' DENTRO. Mentre registri non c'e' niente da estendere --
             li' si decide quanto tempo comprano, ed e' quello che fanno i
             tagli. Dopo invece la domanda cambia: "me lo tieni un'altra
             mezz'ora?", e quella e' un'ALTRA cosa. I tagli sostituiscono
             la durata; questi tasti la AGGIUNGONO, e dicono quanto costa
             l'aggiunta prima che tu la faccia. -->
        <div class="tp-est hidden"></div>
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

      <!-- LA NOTA E' DEL GRUPPO, NON DI UNA PERSONA.
           Stava dentro il guardaroba, come campo di chi accompagna: per
           scrivere «hanno la torta in macchina» bisognava prima aprire
           una persona e vestirla, e spesso una persona non la si vuole
           proprio mettere. Sono due cose diverse -- il segno che fa
           riconoscere QUELLA persona, e la cosa da ricordarsi su tutto
           il gruppo -- e adesso la seconda ha il suo posto, sempre a
           vista, un tocco e ci scrivi. -->
      <div class="card blk c-ambra sec-nota">
        <h2><span class="em">📝</span> Note</h2>
        <div class="blk-in">
          <!-- LA NOTA SI SCRIVE IN UN MODO SOLO.
               Qui c'era un campo da riempire a mano, che salvava a ogni
               lettera; sulla scheda in lista invece la nota e' una
               striscia che si tocca e apre il suo foglio. Stessa cosa,
               due strade diverse, e due strade divergono: quella qui
               non aveva ne' il «lascia stare» ne' l'annulla, e per non
               scrivere sotto la tastiera del tablet aveva bisogno di
               una sua acrobazia. Adesso e' la STESSA striscia e lo
               STESSO foglio della scheda. -->
          <button class="e-nota pc-nota"></button>
        </div>
      </div>
    </div>

    <div class="bc-griglia pc-bar hidden"></div>

    <!-- LO SCONTRINO: quello che il gruppo ha preso, tutto in fila, e
         accanto a ogni riga cosa e' gia' pagato. I due banconi
         servono a SEGNARE, questo a INCASSARE: sono due mestieri
         diversi, e finche' stavano insieme il secondo si faceva
         scorrendo avanti e indietro fra le card. -->
    <div class="pc-scontrino hidden"></div>
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

    /* UN ALTRO GIRO DI CRAZY. Ci sale il primo -- che paga come tutti
       -- e gli altri si aggiungono col piu' della card. Il giro nuovo
       porta il suo blocco di minuti regalati; le salite si pagano a
       testa, come sempre. */
    /* i tocchi del Crazy stanno in `toccoCrazy`: li usa anche la scheda
       di chi e' dentro, ed essendo la stessa funzione non possono
       comportarsi in modo diverso nei due posti */
    const esitoCrazy = toccoCrazy(d);
    if (esitoCrazy) {
      if (esitoCrazy !== 'scelta') pcSalva();
      aggiornaPannello();
      return;
    }

    /* --- le card: quantita' e pagato --- */
    const voce = d.add || d.meno || d.ppiu || d.pmeno;
    if (voce) {
      tocchi.id = voce;
      /* IL CRAZY SI CONTA DENTRO UN GIRO. Il piu' e il meno sono quelli
         di sempre, ma quello che muovono e' il giro scelto: e' li' che
         sta salendo qualcuno adesso. Senza, il numero sulla card
         diceva il totale di tutti i giri e aprire un giro nuovo non lo
         faceva ripartire da zero. */
      if (voce === 'crazy' && (d.add !== undefined || d.meno !== undefined)) {
        contaSalita(d.add !== undefined ? 1 : -1);
      } else if (d.add !== undefined) {
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

    /* --- lo scontrino --- */
    /* UNA RIGA SI APRE, e con lei si chiude quella di prima: a riposo
       lo scontrino e' una lista da leggere, i comandi escono dove
       servono. E' lo stesso gesto delle card del bar. */
    if (d.scapri !== undefined) {
      scAperta = scAperta === d.scapri ? null : d.scapri;
      aggiornaPannello();
      return;
    }
    if (d.scpq !== undefined || d.scmq !== undefined) {
      const id = d.scpq || d.scmq;
      const su = d.scpq !== undefined;
      tocchi.id = id;
      /* IL CRAZY SI CONTA DENTRO UN GIRO, qui come sulla card: quello
         che il piu' e il meno muovono e' la volta aperta adesso. */
      if (id === 'crazy') {
        if (!giriCrazy(c).length) giroNuovo(c);
        cambiaGiro(c, giroOra(c), su ? 1 : -1);
      } else bcSetQ(id, bcQ(id) + (su ? 1 : -1));
      pcSalva(); aggiornaPannello(); return;
    }
    if (d.scpiu !== undefined || d.scmeno !== undefined || d.sctutta !== undefined) {
      const id = d.scpiu || d.scmeno || d.sctutta;
      tocchi.id = id;
      /* IL TEMPO DI PARCO PASSA DA pagaTempo, non da qui: e' li' che
         vive la regola del tempo aperto, e due strade sulla stessa
         cassa sono la radice dei conti storti. */
      const quante = (n) => { if (id === 'bimbi') pagaTempo(n - bcPag(id)); else segnaPagate(id, n); };
      if (d.scpiu !== undefined) quante(bcPag(id) + 1);
      else if (d.scmeno !== undefined) quante(bcPag(id) - 1);
      else {
        /* «PAGA TUTTA» CHIUDE LA RIGA SULL'IMPORTO, non sulle teste.
           Con le teste gia' spuntate e il prezzo salito dopo un
           allungamento, segnare le teste non muoveva un euro: il tasto
           sembrava rotto e la riga restava scoperta. */
        const tot = totaleRiga(id), preso = importoRiga(id);
        if (tot > 0 && preso + 0.005 >= tot) segnaPagate(id, 0);
        else if (id === 'bimbi' && c.payLater) { /* niente anticipi a tempo aperto */ }
        else bcSegna(id, true);
      }
      pcSalva(); aggiornaPannello(); return;
    }
    if (d.scgiro !== undefined) {
      pagaFinoAlGiro(c, parseInt(d.scgiro, 10));
      pcSalva(); aggiornaPannello(); return;
    }
    if (d.screparto !== undefined) {
      const k = scontrinoConti(c, d.screparto);
      const pieno = !(k.resta <= 0.005 && k.vale > 0.005);
      if (d.screparto === 'parco') { bcSegna('bimbi', pieno); bcSegna('crazy', pieno); }
      else bcSegna('bar', pieno);
      /* gli spiccioli che l'arrotondamento lascia scoperti: il conto si
         chiude sull'importo, che e' quello che il cliente mette in mano */
      if (pieno) {
        const d2 = dueOf(c);
        if (d.screparto === 'parco' && d2.parkDue > 0) muoviSoldi('bimbi', d2.parkDue);
        if (d.screparto === 'bar' && d2.barDue > 0) {
          const primo = lista(c.barItems)[0];
          if (primo) muoviSoldi(primo.id, d2.barDue);
        }
      }
      pcSalva(); aggiornaPannello(); return;
    }

    /* --- la navigazione --- */
    if (d.cat !== undefined) { PAN.cat = d.cat; aggiornaPannello({ entra: true }); return; }

    /* --- il blocco Parco --- */
    /* L'ORARIO D'INGRESSO E' LIVE FINCHE' NON LO TOCCHI.
       Di norma il gruppo entra ADESSO: l'orario segue l'orologio da
       solo mentre conti la gente, e il tasto "Ora" sta spento perche'
       non c'e' niente da riportare a adesso. Appena lo sposti col piu'
       o col meno -- "no guarda, erano entrati alle e venti" -- il tempo
       smette di seguire l'orologio: da li' "Ora" si accende e
       lampeggia, ed e' la strada per tornare indietro.
       Prima l'ora si fermava all'apertura della schermata, e chi ci
       metteva dieci minuti a registrare un gruppo gli segnava dieci
       minuti di parco che non aveva fatto. */
    if (d.a === 'ora') {
      if (d.v === 'ora') {
        mettiIngresso(c, roundTo5(new Date()).getTime());
        c.braceletCustom = false;
        delete c.oraManuale;
      } else {
        mettiIngresso(c, num(c.startTime, Date.now()) + parseInt(d.v, 10) * 60000);
        c.oraManuale = true;
      }
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
    /* L'ORA D'USCITA PASSA DALLE STESSE FUNZIONI DI TUTTO IL RESTO.
       Qui la durata si scriveva a mano, e chi scrive il tempo a mano
       finisce per raccontare una storia diversa da chi lo scrive per
       le vie normali. Erano quattro differenze in un tasto solo:
         — non entrava nell'ultima vendita, quindi lo stesso quarto
           d'ora comprato col piu' dell'Estendi e comprato spostando
           l'uscita lasciava i blocchi diversi, e il ritocco DOPO
           cadeva su un blocco sbagliato;
         — non timbrava ne' `parcoDa` ne' `baseMinutes`: su un solo
           Crazy che si ferma al parco il tempo cominciava a contare
           dall'ARRIVO invece che da adesso -- gli si mangiava tutto il
           tempo passato a saltare -- e il primo scaglione partiva da
           un minuto, che e' il guasto da 45,00 € invece di 36,00 €;
         — non chiedeva niente sullo sforo, mentre il piu' da cinque
           minuti lo chiede: due tasti che vendono tempo, due risposte
           diverse alla stessa domanda;
         — e col pavimento di un regalo non muoveva l'uscita di un
           minuto: il tasto sembrava rotto mentre i soldi si muovevano.
       Adesso calcola solo DOVE si vuole arrivare, e a portarcelo e'
       `ritoccaTempo` come per tutti gli altri. */
    if (d.a === 'fine') {
      if (c.payLater) return;
      const verso = num(d.v, 0) > 0 ? 1 : -1;
      const passo = uscitaAlQuarto(c, verso);
      if (!passo.delta) return;
      /* ACCORCIARE A MANO BATTE IL PAVIMENTO DEL REGALO -- la stessa
         regola del meno da cinque minuti. Va tolto PRIMA di muovere il
         tempo: se no l'uscita resta incollata dov'era. */
      if (verso < 0 && num(c.regaloFinoA, 0) > passo.bersaglio) c.regaloFinoA = passo.bersaglio;
      const fai = () => { ritoccaTempo(c, passo.delta); pcSalva(); aggiornaPannello(); };
      if (verso > 0) conSforo(c, fai); else fai();
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
      const m = clamp(c.durationMinutes, 0, 99999);
      metteTempo(c, d.v === '-5' ? Math.max(5, m - 5)
        : d.v === '+5' ? Math.min(99999, m + 5) : parseInt(d.v, 10));
      pcSalva(); aggiornaPannello(); return;
    }
    /* RITOCCARE NON E' VENDERE.
       I tre tagli vendono un blocco di tempo e ognuno si paga al prezzo
       del cartello per la sua misura -- e' quello che si voleva: mezz'ora
       costa mezz'ora, la seconda mezz'ora pure.
       Ma il piu' e il meno da cinque minuti sono un RITOCCO: «no
       aspetta, un altro quarto d'ora no, cinque minuti». Trattandoli
       come vendite, ogni tocco apriva un blocco da cinque minuti e un
       blocco da cinque minuti costa lo scaglione minimo -- tre euro.
       Cinque tocchi su una mezz'ora facevano ventidue euro invece di
       dodici, e il prezzo sulla card sembrava uscito a caso.
       Il ritocco entra nell'ULTIMA vendita, se c'e'; se no allunga il
       tempo iniziale, che si paga sul totale come ha sempre fatto. */
    if (d.a === 'corr') {
      const quanti = num(d.v, 0);
      const fai = () => { ritoccaTempo(c, quanti); pcSalva(); aggiornaPannello(); };
      /* solo allungando: accorciare non ha niente da condonare */
      if (quanti > 0) conSforo(c, fai); else fai();
      return;
    }
    /* ALLUNGARE E' UN'ALTRA COSA DAL SOSTITUIRE. I tagli qui sopra
       scrivono la durata; questo la SOMMA a quella che c'e' gia'. Il
       prezzo lo rifa' costOf da se': se il listino e' "ogni aggiunta
       si paga a parte", baseMinutes e' rimasto quello dell'ingresso e
       la differenza viene contata come scaglione a se'. */
    if (d.a === 'est') {
      if (c.payLater) return;
      const quanti = num(d.v, 0);
      if (quanti > 0 && sforoDi(c) > 0) { conSforo(c, () => vendiBlocco(c, quanti)); return; }
      vendiBlocco(c, quanti);
      return;
    }
    /* un altro giro di Crazy: altri minuti regalati, stessi soldi.
       Chi sale si conta con la card, i giri con questo. */

    /* "hanno deciso di restare": l'avviso lascia il posto ai tagli, e
       da li' in poi e' un ingresso come tutti gli altri */
    if (d.a === 'tagli') { tagliDi = c; aggiornaPannello(); return; }
    if (d.a === 'dopo') {
      c.payLater = !c.payLater;
      /* uscendo dal tempo aperto l'orologio della pausa non ha piu' un
         posto dove farsi vedere: si chiude, e il tempo gia' stato fermi
         resta contato per quando lo si riapre. Stessa regola della
         scheda in lista: e' la stessa cosa, e va fatta uguale. */
      if (!c.payLater) chiudiPausa(c);
      pcSalva(); aggiornaPannello(); return;
    }
    if (d.a === 'pausa') { commutaPausa(c); pcSalva(); aggiornaPannello(); return; }
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
    if (d.aggiungi !== undefined) { foglioAQualeGruppo(); return; }
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
  applicaContoSu();
  return p;
}

/* Mette (o toglie) il conto in cima, secondo com'e' stato scelto.
   E' una riga di CSS -- l'ordine dei due pezzi dentro il pannello --
   quindi non si ridisegna niente e non si perde nessuna scelta a
   meta'. */
function applicaContoSu() {
  if (PAN.root) PAN.root.classList.toggle('conto-su', !!settings.contoInAlto);
}

/* Sposta il pannello dentro un contenitore e gli dice su che cosa
   lavorare. E' l'unico modo di cambiargli padrone. */
function montaPannello(host, conto, opz) {
  /* gruppo nuovo, storia nuova: il giro scelto torna a essere
     l'ultimo, se no si correggerebbe il giro di un altro, e i tagli
     chiesti a mano tornano nascosti dietro l'avviso */
  giroScelto = 99;
  tagliDi = null;
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
function firmaVoce(id) {
  return bcQ(id) + '/' + bcPag(id) +
    /* LA GRAFICA 2.0 ENTRA NELLA FIRMA. Le card si ridisegnano solo se
       i loro numeri cambiano, e accendendo l'interruttore i numeri sono
       gli stessi: la fila dei numeri rapidi non compariva finche' non
       si toccava qualcosa. Cambia il DISEGNO, quindi deve stare qui
       dentro -- e' la stessa svista della pausa nella fila dei tagli. */
    (settings.grafica2 ? '/g2' : '') +
    (id === 'crazy' ? '/' + giriCrazy().join('.') + '>' + giroOra() : '');
}

/* IL BANCONE DICE QUANDO C'E' DELL'ALTRO SOTTO.
   Va deciso qui e non dove si misura il pannello: li' il bar e'
   nascosto -- si misura col Parco a vista -- e un elemento nascosto e'
   alto zero, quindi la sfumatura non si accendeva mai. */
function sfumaBancone(g) {
  if (g) g.classList.toggle('scorre', g.scrollHeight > g.clientHeight + 2);
}

function pcGriglia() {
  const g = pcRif('.pc-bar');
  if (!g) return;
  if (!g.__ascolta) {
    g.__ascolta = true;
    g.addEventListener('scroll', () => sfumaBancone(g), { passive: true });
  }
  /* dopo il disegno: prima le misure sono ancora quelle vecchie */
  requestAnimationFrame(() => sfumaBancone(g));
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
  if (g) {
    g.dataset.sig = firmaGriglia();
    /* LA CARD CRESCE QUANDO LA PRENDI -- da 82 a 178 pixel, perche'
       spuntano le due fasce dei tasti. Se stavi in fondo al bancone,
       quella crescita finisce sotto il bordo e i tasti appena comparsi
       non si vedono: si scorre del minimo per rimetterli a galla, come
       fa il guardaroba. Nessun salto se ci stavano gia'. */
    requestAnimationFrame(() => {
      const r = nuova.getBoundingClientRect(), v = g.getBoundingClientRect();
      const sotto = Math.round(r.bottom - v.bottom);
      if (sotto > 1) g.scrollTop += sotto + 8;
      sfumaBancone(g);
    });
  }
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
  /* SE IL PARCO E' COPERTO, IL TEMPO E' PAGATO TUTTO.
     Qui sotto i minuti si ricavano dal cartello: si cerca lo scaglione
     piu' alto che quei soldi coprono. Ma il cartello FINISCE -- alle
     due ore -- e il tempo no: un gruppo dentro da due ore e mezza,
     anche a conto saldato, non arrivava mai oltre i centoventi minuti.
     Risultato: la barra si fermava all'ottantanove per cento e la
     pastiglia diceva "pagato fino alle 18:50" invece di "pagato
     tutto", cioe' chiedeva soldi gia' incassati. Stessa cosa da quando
     il tempo aggiunto si vende a blocchi: i soldi non corrispondono
     piu' a un solo scaglione del cartello.
     La domanda vera e' un'altra ed e' semplice: il parco e' coperto?
     Se si', il tempo e' pagato per intero, e il cartello non c'entra. */
  const dovutoBimbi = r2(costOf(c).parkTotal);
  if (soldiBimbi + 0.005 >= dovutoBimbi) return tempoTotale(c);
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
  const min = p.querySelector('.pc-min');
  /* A TEMPO APERTO IL NUMERO DICE I MINUTI CHE SI STANNO PAGANDO.
     C'era un trattino, come sulla scheda in lista: la cosa che al banco
     si guarda per prima non diceva niente proprio nell'unico caso in
     cui si muove da sola. */
  if (min) {
    min.textContent = aperto
      ? fmtMin(Math.round(contiAperto(c).contati))
      : fmtMin(clamp(num(c.durationMinutes, 0), 0, 1e6));
    min.classList.toggle('in-pausa', aperto && !!num(c.pausaDa, 0));
  }
  /* il tasto "Ora": spento mentre l'orario segue l'orologio da solo
     (non c'e' niente da fare), acceso e lampeggiante appena lo si e'
     spostato a mano -- e' l'unico modo per tornare al live */
  const ol = p.querySelector('.pc-oralive');
  if (ol) {
    /* su un ingresso GIA' DENTRO l'orario e' fermo per forza: li' il
       tasto e' un tasto come gli altri, ne' spento ne' lampeggiante */
    const vivo = !PAN.ingresso && !c.oraManuale;
    const chiama = !PAN.ingresso && !!c.oraManuale;
    ol.classList.toggle('spenta', vivo);
    ol.classList.toggle('lampeggia', chiama);
    ol.title = vivo ? 'L\u2019orario segue l\u2019orologio da solo'
      : 'Rimette l\u2019ingresso all\u2019ora di adesso';
  }
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
  const sig = p.querySelector('.pc-sigla');
  if (sig) {
    const due = String(C().sigla || '');
    sig.textContent = due;
    sig.classList.toggle('hidden', !due);
    sig.title = due ? 'Codice del gruppo: scrivilo sul bracciale' : '';
  }
  p.querySelector('.pc-bracnome').textContent =
    senza ? 'Senza' : c.braceletCustom ? (AV.colorName(col, 0) || 'Bracciale') : 'Auto';
  sincronizzaBracciali(p.querySelector('.pc-brac'), c.startTime, c.braceletColor, c.braceletCustom);

  /* i minuti in omaggio si vedono: se no l'ora d'uscita sembra
     sbagliata (dieci minuti in piu' che nessuno ha comprato) */
  /* SOLO CRAZY, DETTO IN CHIARO.
     Un ingresso senza tempo di parco comprato e' una cosa che non si
     era mai vista in questa schermata: senza scriverlo, si vede solo
     un'ora d'uscita che nessuno ha scelto e nessun taglio acceso, e
     sembra un modulo a meta'. Qui c'e' scritto cos'e' e cosa fare per
     cambiarlo.
     Quando invece il tempo lo hanno comprato dopo, resta la riga corta:
     serve solo a spiegare i dieci minuti in piu' sull'uscita. */
  const om = p.querySelector('.tp-om');
  if (om) {
    const q = omaggioDi(c);
    const comprato = clamp(num(c.durationMinutes, 0), 0, 1e6);
    /* IL SOLO CRAZY NON SI PRENDE PIU' UN CARTELLONE. Quello che c'e'
       da dire sta sulla riga dei tagli, che in un ingresso di soli
       salti non serve a niente: due parole al posto di quattro righe.
       Qui resta solo la riga corta dell'omaggio, che serve a spiegare
       perche' l'uscita e' piu' in la' di quello che si e' venduto. */
    const daSolo = avvisoSoli(c);
    om.classList.toggle('hidden', q <= 0 || daSolo);
    if (q <= 0 || daSolo) om.innerHTML = '';
    else {
      om.innerHTML = '\ud83c\udf81 <b>+' + q + '\u2032</b> in omaggio' +
        '<small>' + (comprato <= 0
          ? 'tocca un taglio per vendere il tempo di parco'
          : 'non entrano nel prezzo') + '</small>';
    }
  }
  /* DA QUANDO CONTA IL TEMPO DI PARCO. Si scrive solo quando NON e'
     l'ora d'ingresso: chi entra e compra subito non ha niente da
     spiegare. Chi invece arriva per saltare e si ferma dopo, si', e
     senza questa riga l'uscita sembrava sbagliata -- era proprio il
     numero che non tornava al banco. */
  const dq = p.querySelector('.tp-parcoda');
  if (dq) {
    const da = inizioParco(c);
    const mostra = num(c.durationMinutes, 0) > 0 && Math.abs(da - num(c.startTime, 0)) > 60000;
    dq.classList.toggle('hidden', !mostra);
    dq.innerHTML = mostra
      ? '\u23f1\ufe0f il parco conta dalle <b>' + fmtTime(da) + '</b>'
      : '';
  }
  p.querySelector('.pc-pag').innerHTML = pastigliaPagato(c);
  disegnaEstendi(p, c);
}

/* ══════════════════════════════════════════════════════════
   ESTENDI TEMPO
   Compare solo su un ingresso GIA' REGISTRATO: mentre lo stai
   registrando non c'e' niente da estendere, e i tagli fanno gia' il
   loro mestiere.
   Ogni tasto scrive QUANTO COSTA L'AGGIUNTA, e il numero non e'
   inventato: e' il costo di dopo meno il costo di adesso, calcolato
   con la stessa costOf() che fa il conto vero. Col listino a scaglioni
   quella cifra non e' mai ovvia -- da un'ora a un'ora e mezza non e'
   "mezz'ora", sono sette euro a bambino, e oltre le due ore e' zero
   perche' il cartello si ferma li'.
   A tempo aperto i tasti si SPENGONO ma restano al loro posto: se
   sparissero, la card cambierebbe altezza ogni volta -- e' la stessa
   regola del gruppo dell'uscita qui sopra.
   ══════════════════════════════════════════════════════════ */
const ESTENDI_TAGLI = [15, 30, 60];

/* IL RITOCCO DA CINQUE MINUTI.
   I tre tagli VENDONO un blocco di tempo, e ogni blocco si paga al
   prezzo del cartello per la sua misura: mezz'ora costa mezz'ora, la
   seconda mezz'ora pure. Il piu' e il meno da cinque minuti invece
   sono un RITOCCO -- «no aspetta, un altro quarto d'ora no, cinque
   minuti» -- e trattarli da vendita voleva dire aprire un blocco da
   cinque minuti, che sul cartello sta nello scaglione minimo: tre
   euro. Cinque tocchi su una mezz'ora facevano ventidue euro invece
   di dodici, e il prezzo a testa sulla card sembrava uscito a caso.
   Il ritocco entra nell'ULTIMA vendita, se c'e'; se no allunga il
   tempo iniziale, che si paga sul totale come ha sempre fatto.
   Sta in una funzione con un nome suo, e non dentro il gestore dei
   tocchi, perche' e' una regola dei soldi e le regole dei soldi si
   provano. */
/* Sotto quanti minuti non si scende col meno. Zero per chi ha l'omaggio
   -- il solo-Crazy, che di tempo comprato non ne ha -- cinque per tutti
   gli altri. Sta fuori perche' lo devono sapere anche i tasti, se no si
   spengono a un valore e la funzione ne accetta un altro. */
function minimoTempo(c) {
  return omaggioDi(c || C()) > 0 ? 0 : 5;
}

/* Il tempo di parco passa da zero a qualcosa: e' adesso che comincia a
   contare. Si segna una volta sola -- quando si comprano altri minuti
   dopo, il tempo continua da dove stava, non riparte. */
function segnaInizioParco(c, prima, dopo) {
  if (prima > 0 || dopo <= 0) return;
  /* SUI CINQUE MINUTI, come tutti gli altri orari dell'app. L'ora
     d'ingresso si arrotonda ai cinque da sempre; questo e' l'ora
     d'ingresso del PARCO, e non c'era motivo perche' facesse eccezione.
     Senza, uscivano orari come «23:23:45» e la mezz'ora comprata
     finiva alle 23:53:45 -- un orario che al banco non si dice.
     E MAI PRIMA DELL'INGRESSO: arrotondando si puo' scendere di due
     minuti e mezzo, e su un gruppo appena entrato il tempo di parco
     sarebbe cominciato prima che arrivassero. La riparazione lo
     raddrizzava alla rilettura, il che vuol dire che memoria e disco
     dicevano due cose diverse fino al ricaricamento. */
  c.parcoDa = Math.max(roundTo5(new Date()).getTime(), num(c.startTime, 0));
  /* E QUESTO E' IL LORO TEMPO INIZIALE.
     `baseMinutes` e' «la durata al momento della registrazione», e su
     chi si e' registrato SENZA tempo di parco -- un solo-Crazy --
     valeva uno: la riparazione mette almeno un minuto per non lasciarlo
     a zero. Con la tariffa A SCAGLIONI quel numero decide il primo
     scaglione, quindi quarantasette minuti venduti a un solo-Crazy si
     spezzavano in «un minuto» piu' «quarantasei» e costavano 45,00 €
     invece di 36,00 €: piu' di un ingresso normale della stessa durata.
     Il tempo che comprano ADESSO e' il loro tempo iniziale, e da qui in
     poi non si muove piu' -- e' il momento esatto in cui va scritto. */
  c.baseMinutes = dopo;
}

/* ══════════════════════════════════════════════════════════
   SPOSTA L'ORA D'INGRESSO, E PORTA CON SE' IL TEMPO DI PARCO.

   L'ora d'ingresso si muove in tre modi: col piu' e col meno, col
   tasto "Ora", e DA SOLA -- mentre si registra un gruppo l'orario
   cammina con l'orologio, cosi' chi ci mette cinque minuti a contare i
   bambini non gliene segna cinque che non hanno fatto.
   Tutti e tre spostavano SOLO `startTime`, e `parcoDa` restava dov'era.

   Il guasto che ne veniva era subdolo perche' non si vedeva subito:
   sono le 20:02, prendono due giri di Crazy, poi decidono un'ora --
   `parcoDa` si timbra alle 20:00 -- e mentre si contano i bambini
   l'ingresso cammina alle 20:10. La scheda diceva «esce alle 21:00».
   Poi il tablet si ricarica, la riparazione dei dati rialza `parcoDa`
   all'ingresso, e la stessa scheda dice «esce alle 21:10». Dieci
   minuti comparsi dal nulla, e per dieci minuti il gruppo era rosso
   quando non doveva: allungando il tempo li' in mezzo, l'app chiedeva
   di far pagare uno sforo che non c'era.
   Memoria e disco raccontavano due storie diverse, e la piu' comune
   delle sequenze al banco bastava a farlo succedere.

   Chi segue l'ingresso e chi no:
     — il tempo comprato ALL'INGRESSO lo segue, perche' e' cominciato
       con loro: spostare l'ingresso vuol dire spostare tutto;
     — il tempo comprato DOPO -- il papa' entrato per due giri che a
       meta' serata si ferma al parco -- resta dov'e': quello e' un
       momento vero dell'orologio, non un'etichetta. Ma non puo' finire
       prima dell'ingresso, se no il parco comincerebbe prima che
       arrivino.
   ══════════════════════════════════════════════════════════ */
function mettiIngresso(c, quando) {
  c = c || C();
  const prima = num(c.startTime, Date.now());
  const dopo = num(quando, prima);
  if (!Number.isFinite(dopo) || dopo === prima) return prima;
  c.startTime = dopo;
  const da = num(c.parcoDa, NaN);
  if (Number.isFinite(da) && da > 0) {
    const nuovo = da <= prima ? da + (dopo - prima) : Math.max(da, dopo);
    const mosso = nuovo - da;
    c.parcoDa = nuovo;
    /* il pavimento del regalo si muove col tempo di parco, se no
       resterebbe indietro e terrebbe l'ora d'uscita incollata dov'era */
    if (mosso && num(c.regaloFinoA, 0) > 0) c.regaloFinoA = num(c.regaloFinoA, 0) + mosso;
  }
  /* nemmeno il cronometro della pausa puo' essere partito prima che
     entrassero: e' l'altro campo che la riparazione raddrizza da sola,
     e senza questa riga divergerebbe uguale */
  const fermo = num(c.pausaDa, NaN);
  if (Number.isFinite(fermo) && fermo > 0) c.pausaDa = Math.max(fermo, dopo);
  return dopo;
}

/* QUANTO SFORO SI CONDONA SENZA CHIEDERE quando si allunga il tempo.
   Sotto i dieci minuti si perdona: stavano uscendo, si sono attardati,
   e mettersi a discutere per cinque minuti al banco non conviene a
   nessuno. Sopra, la cassiera deve poter scegliere -- mezz'ora di sforo
   regalata in silenzio e' un'altra cosa. */
function sforoCondonato() {
  return clamp(num(settings.sforoCondonato, SFORO_CONDONATO_DI_SERIE), 0, 240) * 60000;
}

/* ALLUNGARE IL TEMPO A UN GRUPPO GIA' SFORATO.
   Lo sforo si mangiava il tempo nuovo: quindici minuti comprati a chi ne
   aveva sforati dieci diventavano cinque, e al banco sembrava che
   l'estensione non funzionasse.
   Sotto i dieci minuti si condona da se': stavano uscendo, si sono
   attardati, e mettersi a discutere per cinque minuti non conviene a
   nessuno. Sopra si CHIEDE -- mezz'ora regalata in silenzio e' un'altra
   cosa, e la cassiera deve poter scegliere col cliente davanti. */
function conSforo(c, applica) {
  /* CHI NON HA MAI COMPRATO TEMPO NON PUO' AVERLO SFORATO.
     Un solo-Crazy a cui e' finito l'omaggio risulta «scaduto», e
     vendendogli del parco compariva il foglio «Sforano da 15 minuti» --
     una domanda senza senso, perche' non c'e' nessun tempo comprato che
     sia finito. E la risposta sbagliata («scala lo sforo») si mangiava
     il tempo appena venduto: mezz'ora che nasceva gia' quasi finita.
     Qui il parco comincia adesso, e basta: ci pensa `segnaInizioParco`
     dentro chi vende. */
  if (clamp(num(c.durationMinutes, 0), 0, 1e6) <= 0) { applica(); return; }
  const sforo = sforoDi(c);
  if (sforo <= 0) { applica(); return; }
  if (sforo < sforoCondonato()) { condonaSforo(c); applica(); return; }
  foglioSforo(c, sforo, applica);
}

function foglioSforo(c, sforo, applica) {
  const min = Math.round(sforo / 60000);
  const s = sheet('Sforano da ' + fmtMin(min));
  s.body.appendChild(el('div', 'hint',
    'Il tempo comprato e’ finito da ' + fmtMin(min) + '. Se non si fa niente, ' +
    'quei minuti si mangiano il tempo che stai per vendere.'));

  const scelta = (em, titolo, sotto, fn) => {
    const b = el('button', 'scelta-riga');
    b.appendChild(el('span', 'sc-em', em));
    const t = el('span', 'sc-txt');
    t.appendChild(el('b', null, titolo));
    t.appendChild(el('span', null, sotto));
    b.appendChild(t);
    b.onclick = () => { s.close(); fn(); };
    s.body.appendChild(b);
  };

  scelta('\u23f1\ufe0f', 'Riparti da adesso',
    'Lo sforo si condona: il tempo che vendi lo hanno tutto, da questo momento.',
    () => { condonaSforo(c); applica(); });

  scelta('\u2796', 'Scala lo sforo',
    'Il tempo venduto comincia da dove era finito quello di prima, quindi ' +
    fmtMin(min) + ' se ne vanno.',
    () => applica());

  footBtn(s.foot, 'Lascia stare', 'btn-ghost', s.close);
}

function sforoDi(c) {
  c = c || C();
  if (c.payLater) return 0;
  return Math.max(0, Date.now() - endTimeOf(c));
}

/* Sposta avanti l'inizio del parco di tutto lo sforo: l'effetto e' che
   il tempo che si sta comprando parte da ADESSO invece di essere
   mangiato da quello gia' passato. */
function condonaSforo(c) {
  c = c || C();
  const sforo = sforoDi(c);
  if (sforo <= 0) return 0;
  /* Si sposta l'inizio del parco tanto quanto basta perche' il tempo
     finisca ADESSO -- e adesso vuol dire il taglio da cinque minuti piu'
     vicino, come ogni altro orario dell'app. Cosi' quello che si vende
     subito dopo cade su un orario che si dice: mezz'ora dalle 23:15
     fanno le 23:45, non le 23:43:45. */
  const spostamento = roundTo5(new Date()).getTime() - endTimeOf(c);
  /* nemmeno qui si torna prima dell'ingresso: il condono sposta in
     avanti, non indietro */
  c.parcoDa = Math.max(inizioParco(c) + spostamento, num(c.startTime, 0));
  /* anche il regalo del Crazy si sposta con lui, se no resterebbe
     indietro e non farebbe piu' niente */
  if (num(c.regaloFinoA, 0) > 0) c.regaloFinoA = num(c.regaloFinoA, 0) + spostamento;
  return sforo;
}

function ritoccaTempo(c, delta) {
  c = c || C();
  if (c.payLater) return;
  const m = clamp(num(c.durationMinutes, 60), 0, 1e6);
  /* IL PAVIMENTO NON E' SEMPRE CINQUE. Di norma si': sotto i cinque
     minuti non si vende tempo. Ma per chi ha l'omaggio del solo-Crazy lo
     ZERO e' un valore buono -- e' chi non ha comprato tempo di parco, e
     la sua permanenza sta nei minuti regalati.
     Senza questa distinzione un solo-Crazy a cui si toccava per sbaglio
     il piu' restava incastrato: cinque minuti e sei euro sul conto, e il
     meno che non tornava piu' indietro. */
  const minimo = minimoTempo(c);
  const dopo = clamp(m + num(delta, 0), minimo, 100000);
  const vero = dopo - m;                 /* quello che si e' mosso davvero */
  if (!vero) return;
  segnaInizioParco(c, m, dopo);
  c.durationMinutes = dopo;
  const vendite = lista(c.aggiunte).map(x => Math.max(0, Math.round(num(x, 0))));
  if (vendite.length) {
    vendite[vendite.length - 1] = Math.max(0, vendite[vendite.length - 1] + vero);
    c.aggiunte = vendite.filter(x => x > 0);
  }
  sistemaAggiunte(c);
  /* ACCORCIARE A MANO BATTE IL PAVIMENTO DEL REGALO.
     Il regalo di un giro lascia un pavimento all'ora d'uscita perche'
     nessuno se lo riprenda per sbaglio (vedi `nonTogliereTempo`). Ma se
     la cassiera dice ESPLICITAMENTE che escono prima -- «avevo messo
     un'ora, erano trenta minuti» -- quello e' un ordine, non uno
     sbaglio: senza questa riga il meno smetteva di funzionare e l'ora
     d'uscita restava incollata dov'era, che e' un guasto peggiore di
     quello che il pavimento evita. */
  if (vero < 0 && num(c.regaloFinoA, 0) > 0) {
    const senzaPavimento = inizioParco(c) + (dopo + minutiCrazy(c)) * 60000;
    if (num(c.regaloFinoA, 0) > senzaPavimento) {
      if (senzaPavimento > 0) c.regaloFinoA = senzaPavimento;
      else delete c.regaloFinoA;
    }
  }
}

/* DOVE PORTA IL PIU' (O IL MENO) DELL'ORA D'USCITA.
   Il salto e' al QUARTO D'ORA dell'orologio, non di quindici minuti
   tondi: chi chiede «me lo tieni fino alle tre?» pensa a un orario, e
   partendo dalle 14:10 il piu' deve portare alle 14:15.
   Torna di quanto va mossa la DURATA per arrivarci -- e' quello il
   dato che si vende -- e l'orario a cui si punta.

   DUE CASI CHE NON SI VEDONO SUBITO:
   — CHI NON HA ANCORA COMPRATO TEMPO (un solo Crazy). La sua ora
     d'uscita e' fatta di minuti REGALATI, e quelli non si sommano al
     tempo di parco -- l'omaggio era il tempo di salire e scendere, ed
     e' gia' stato speso. Partire da li' voleva dire vendergli un tempo
     che finiva prima di cominciare: si riparte da dove finiscono i
     giri, e il tempo di parco parte da ADESSO, esattamente come fa
     `segnaInizioParco`.
   — IL PAVIMENTO DI UN REGALO. Un giro fatto a tempo scaduto tiene
     l'uscita ferma a un'ora promessa, e la durata da sola non basta
     piu' a spiegarla: il conto va fatto sull'uscita VERA, se no il
     tasto si preme e non si muove niente. */
function uscitaAlQuarto(c, verso) {
  c = c || C();
  const min = clamp(num(c.durationMinutes, 60), 0, 1e6);
  const crazy = minutiCrazy(c);
  const daQuando = min > 0 ? inizioParco(c)
    : Math.max(roundTo5(new Date()).getTime(), num(c.startTime, 0));
  const fine = min > 0 ? endTimeOf(c) : daQuando + crazy * 60000;
  const u = new Date(fine);
  const resto = (u.getHours() * 60 + u.getMinutes()) % 15;
  const salto = verso > 0 ? 15 - resto : (resto || 15);
  const bersaglio = fine + verso * salto * 60000;
  const dopo = clamp(Math.round((bersaglio - daQuando) / 60000) - crazy, minimoTempo(c), 100000);
  return { dopo: dopo, delta: dopo - min, bersaglio: bersaglio };
}

/* METTE UNA DURATA, ED E' L'UNICO POSTO CHE LO FA.
   I tagli rapidi e il campo dei minuti esatti fanno la stessa identica
   cosa -- «da adesso il tempo di parco e' questo» -- ma erano scritti
   in due punti diversi, e sono divergiti al primo dettaglio: il campo
   riscriveva anche `baseMinutes`, i tagli no. Con la tariffa A
   SCAGLIONI `baseMinutes` decide il primo scaglione, quindi la STESSA
   ora costava 42,00 € scelta col taglio e 36,00 € scritta a mano.
   Due strade per la stessa cosa divergono sempre: qui ce n'e' una.

   `baseMinutes` NON si tocca: e' la durata al momento della
   registrazione, e non si muove piu' -- e' lei che distingue il tempo
   comprato all'ingresso da quello venduto dopo. */
function metteTempo(c, minuti) {
  c = c || C();
  const m = clamp(num(c.durationMinutes, 0), 0, 99999);
  const nuovo = clamp(Math.round(num(minuti, 0)), 1, 99999);
  /* anche da qui il tempo di parco puo' partire da zero: e' la stessa
     cosa del piu' del mini menu, e va segnata uguale */
  segnaInizioParco(c, m, nuovo);
  c.durationMinutes = nuovo;
  /* mettere una durata SCRIVE: quello che era stato venduto prima non
     c'entra piu' niente */
  delete c.aggiunte;
  c.payLater = false;
  return nuovo;
}

/* VENDE UN BLOCCO DI TEMPO. Sta fuori dal gestore dei tocchi perche' ci
   arriva anche dal foglio dello sforo, che risponde piu' tardi: una
   funzione sola, cosi' le due strade non possono divergere. */
function vendiBlocco(c, quanti) {
  c = c || C();
  if (c.payLater) return;
  const m = clamp(num(c.durationMinutes, 60), 0, 1e6);
  c.durationMinutes = clamp(m + quanti, 5, 100000);
  /* DA QUANDO COMINCIA IL PARCO, anche da qui.
     Chi entra SOLO per saltare non ha tempo di parco, e quando poi
     decide di fermarsi quel tempo comincia ADESSO -- non dall'ora in
     cui e' arrivato. `ritoccaTempo` e i tagli lo segnavano; questa
     strada -- «⏩ Estendi», che e' proprio quella che si usa per
     vendere del tempo a chi e' gia' dentro -- se n'era dimenticata: la
     mezz'ora venduta a uno arrivato venticinque minuti prima nasceva
     con cinque minuti di vita, e il rosso non si resettava. */
  segnaInizioParco(c, m, c.durationMinutes);
  /* quello che si e' venduto resta scritto: e' quello che fa il prezzo.
     Il meno toglie dall'ultima vendita, non dal tempo iniziale -- se no
     si sarebbe reso un pezzo di tempo che il cliente non aveva comprato
     in quel momento. */
  if (quanti > 0) { c.aggiunte = lista(c.aggiunte).concat([quanti]); }
  else {
    let togli = -quanti;
    const vendite = lista(c.aggiunte);
    while (togli > 0 && vendite.length) {
      const ultima = num(vendite[vendite.length - 1], 0);
      if (ultima > togli) { vendite[vendite.length - 1] = ultima - togli; togli = 0; }
      else { vendite.pop(); togli -= ultima; }
    }
    c.aggiunte = vendite;
  }
  sistemaAggiunte(c);
  pcSalva();
  aggiornaPannello();
}

/* quanto costa allungare di tot: il prezzo di dopo meno quello di
   adesso, per tutto il gruppo. Passa da costOf, che sa gia' del
   listino a scaglioni, dei minuti regalati e del "paga a parte". */
function costoEstensione(c, minuti) {
  const ora = costOf(c).parkTotal;
  /* si simula la vendita per intero -- minuti E blocco venduto -- se
     no il tasto direbbe un prezzo e la cassa ne chiederebbe un altro */
  const poi = costOf(Object.assign({}, c, {
    durationMinutes: clamp(num(c.durationMinutes, 60), 0, 1e6) + minuti,
    aggiunte: lista(c.aggiunte).concat([minuti])
  })).parkTotal;
  return Math.max(0, r2(poi - ora));
}

function disegnaEstendi(p, c) {
  const box = p.querySelector('.tp-est');
  if (!box) return;
  /* solo su chi e' gia' dentro */
  const suUno = !!PAN.ingresso;
  box.classList.toggle('hidden', !suUno);
  /* CON L'ESTENDI A VIDEO IL PANNELLO HA CINQUANTA PIXEL IN MENO, e il
     guardaroba aperto e' proprio la cosa che ce ne mette di piu'. Il
     riquadro lo dice a se stesso: da li' le file dei capi e delle
     fantasie si stringono di qualche pixel invece di far comparire una
     barra di scorrimento. In "+ Nuovo", dove l'Estendi non c'e',
     restano grandi come prima. */
  p.classList.toggle('con-estendi', suUno);
  if (!suUno) { box.innerHTML = ''; box.dataset.sig = ''; return; }

  const aperto = !!c.payLater;
  const firma = [aperto ? 'x' : c.durationMinutes, c.children, c.crazyJumping,
    ESTENDI_TAGLI.map(m => aperto ? 0 : costoEstensione(c, m)).join('/')].join('|');
  if (box.dataset.sig === firma) return;
  box.dataset.sig = firma;

  /* IL MENO E IL PIU' STANNO A SINISTRA, e sono di cinque minuti.
     Prima c'era un solo "- 15m", e stava in fondo a destra: in tutta
     l'app il meno e il piu' sono una coppia attaccata, a sinistra del
     numero che muovono, e trovarne uno spaiato dall'altra parte faceva
     fermare la mano. Un quarto d'ora poi e' un salto grosso per una
     correzione -- «no aspetta, sono entrati cinque minuti fa» -- e per
     i salti grossi ci sono gia' i tre tagli col loro prezzo. */
  const corti = clamp(num(c.durationMinutes, 60), 0, 1e6);
  box.innerHTML =
    '<span class="est-k"><span class="em">\u23e9</span> Estendi</span>' +
    '<span class="est-cinque">' +
      '<button data-a="corr" data-v="-5"' + (aperto || corti <= minimoTempo(c) ? ' disabled' : '') +
        ' aria-label="cinque minuti in meno">\u2212 5m</button>' +
      '<button data-a="corr" data-v="5"' + (aperto ? ' disabled' : '') +
        ' aria-label="cinque minuti in piu\u2019">+ 5m</button>' +
    '</span>' +
    ESTENDI_TAGLI.map(m => {
      const costo = aperto ? 0 : costoEstensione(c, m);
      return '<button class="est-b" data-a="est" data-v="' + m + '"' + (aperto ? ' disabled' : '') + '>' +
        '<b>+' + fmtMin(m) + '</b><i>' + (aperto ? '\u2014' : costo > 0 ? '+' + eur(costo) : 'gratis') +
        '</i></button>';
    }).join('') +
    '<span class="est-dx">' +
      /* il totale dei minuti sta due righe sopra, accanto al bracciale:
         qui basta l'ora d'uscita */
      '<span class="est-fine">' + (aperto ? 'tempo aperto' : 'fino alle') +
        '<b>' + (aperto ? '\u2014' : fmtTime(endTimeOf(c))) + '</b></span>' +
    '</span>';
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
  /* GRAFICA 2.0: QUI IL PIU' E IL MENO SE NE VANNO.
     Muovono lo stesso identico numero della pastiglia \u00ab0/3\u00bb sulla card
     dei Bambini -- quanti hanno gia' pagato il tempo -- ma con un
     linguaggio che non le somiglia per niente: una frase da una parte,
     una frazione dall'altra. Due comandi che non si riconoscono come la
     stessa cosa, e in mezzo ci sono i soldi: \u00abne ho gia' segnato uno?\u00bb
     e' la domanda che porta a segnarne due.
     La SCRITTA resta -- \u00abpagato fino alle 15:40\u00bb e' un'informazione, ed
     e' il motivo per cui questa pastiglia esiste -- e si muove dalla
     card, dallo scontrino e dalla fascia in fondo. */
  const comandi = settings.grafica2 ? '' :
    '<button data-a="pagatempo" data-v="-1"' + (bcPag('bimbi') <= 0 ? ' disabled' : '') +
      ' aria-label="togli un pagamento">\u2212</button>' +
    '<button data-a="pagatempo" data-v="1"' + (su ? ' disabled' : '') +
      ' aria-label="incassa il tempo">+</button>';
  return '<span class="pgl' + (tutto ? ' tutto' : pag > 0 && !aperto ? '' : ' vuota') +
    (settings.grafica2 ? ' sola' : '') + '">' +
    '<span class="k">' + testo + '</span>' + comandi + '</span>';
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
  const inScontrino = PAN.cat === 'Scontrino';
  const inParco = PAN.cat === 'Parco';
  p.querySelector('.pc-parco').classList.toggle('hidden', !inParco);
  p.querySelector('.pc-bar').classList.toggle('hidden', inParco || inScontrino);
  p.querySelector('.pc-scontrino').classList.toggle('hidden', !inScontrino);

  if (inScontrino) {
    disegnaScontrino(p, c);
  } else if (inParco) {
    /* le due card sopra l'orario: bambini e Crazy, sempre aperte */
    const due = p.querySelector('.pc-due');
    const firmaDue = ['bimbi', 'crazy'].map(k =>
      k + ':' + firmaVoce(k) + '/' + prezzoUnita(k)).join(',');
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
    /* SOLI SALTI: AL POSTO DEI TAGLI, L'AVVISO. In un ingresso senza
       tempo di parco i tagli 15m 30m 1h 1h30 sono l'unica cosa che non
       va toccata -- e stavano li' accesi, mentre un cartellone gigante
       spiegava la stessa cosa a quattro righe di distanza. Adesso la
       riga e' una sola e dice il necessario: cos'e' l'ingresso, che i
       minuti in omaggio non si pagano, e il tasto per vendere il tempo
       se poi decidono di restare. */
    const avviso = avvisoSoli(c);
    /* la pausa entra nella firma: se no si preme «Pausa» e la fila dei
       tagli non si ridisegna, cioe' il tasto resta a dire «Pausa» su un
       orologio che ormai e' fermo */
    /* e la Grafica 2.0 pure: accendendola o spegnendola i minuti non
       cambiano, quindi senza questo la fila non si ridisegnava e il
       campo dei minuti esatti restava li' anche a interruttore spento.
       E' la stessa svista di `firmaVoce` con le card. */
    const firmaDur = tagli.join('|') + '>' + (c.payLater ? 'dopo' : c.durationMinutes) +
      (avviso ? '|solo' + omaggioDi(c) : '') + (num(c.pausaDa, 0) ? '|fermo' : '') +
      (settings.grafica2 ? '|g2' : '');
    if (dur.dataset.sig !== firmaDur) {
      dur.dataset.sig = firmaDur;
      dur.innerHTML = avviso
      ? '<span class="dur-solo"><b><span class="em">\ud83e\udd38</span> Solo Crazy</b>' +
        '<i>+' + omaggioDi(c) + '\u2032 in omaggio, non si pagano</i></span>' +
        '<button class="chip dur-tagli" data-a="tagli">+ Tempo di parco</button>'
      : tagli.map(m =>
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
        '\u23f3 Tempo aperto</button>' +
        /* GRAFICA 2.0: I MINUTI ESATTI, SCRITTI.
           C'era un campo «oppure minuti esatti» ed e' sparito l'8 agosto,
           quando la fascia degli orari ha preso il suo posto: da allora
           per fare venti minuti bisogna partire da quindici e premere il
           piu', o spostare l'ora d'uscita a colpi di quarto d'ora.
           I tagli coprono i casi di tutte le sere, ma non tutti: qui si
           scrive il numero e basta. Passa dallo STESSO `data-a="min"` dei
           tagli, quindi non puo' comportarsi in modo diverso da loro. */
        (settings.grafica2
          ? '<span class="dur-esatti"><input type="number" class="pc-durin" min="1" max="99999" ' +
            'step="5" inputmode="numeric" aria-label="minuti esatti" placeholder="min" value="' +
            (c.payLater ? '' : clamp(num(c.durationMinutes, 0), 0, 99999)) + '">' +
            '<span class="um">min</span></span>'
          : '') +
        /* LA PAUSA STA ANCHE QUI. Era solo sulla scheda in lista, e cosi'
           il mini menu sapeva fare una cosa che aprendo \u00abModifica\u00bb --
           cioe' il posto dove si va per cambiare le cose per bene --
           non si poteva piu' fare. Due schermate per lo stesso gruppo
           che sanno fare cose diverse sono un posto dove si va a
           cercare un tasto e non c'e'. Compare solo a tempo aperto:
           altrove non c'e' nessun orologio che corra. */
        (c.payLater
          ? '<button class="chip pausa' + (num(c.pausaDa, 0) ? ' on' : '') + '" data-a="pausa" ' +
            'title="' + (num(c.pausaDa, 0)
              ? 'L\u2019orologio \u00e8 fermo: riprendi a contare il tempo'
              : 'Ferma l\u2019orologio: il tempo in pausa non si paga') + '">' +
            (num(c.pausaDa, 0) ? '\u25b6\ufe0e Riprendi' : '\u23f8 Pausa') + '</button>'
          : '');
    }
    /* IL CAMPO DEI MINUTI ESATTI risponde quando si scrive, e si
       aggancia una volta sola: la fila si ridisegna spesso, e legare il
       gestore ogni volta vorrebbe dire scrivere il numero due volte.
       Mentre il dito e' dentro NON si riscrive il valore, se no il
       cursore torna in fondo a ogni cifra battuta. */
    const esatti = dur.querySelector('.pc-durin');
    if (esatti && !esatti.dataset.legato) {
      esatti.dataset.legato = '1';
      esatti.oninput = () => {
        const q = C();
        const grezzo = num(esatti.value, NaN);
        if (!Number.isFinite(grezzo)) return;
        /* SCRIVERE I MINUTI E' LA STESSA COSA CHE PREMERE UN TAGLIO, e
           passa dalla stessa funzione: scritto a parte, il campo aveva
           gia' imparato a riscrivere `baseMinutes` -- e la stessa ora
           costava 42,00 € col taglio e 36,00 € scritta a mano. */
        metteTempo(q, grezzo);
        pcSalva();
        /* LA FILA VA SEGNATA COME DA RIFARE, anche se adesso non la si
           tocca: la firma dice «disegnata coi minuti di prima», e senza
           azzerarla un taglio premuto subito dopo non ridisegnava
           niente -- il campo restava a 47 mentre la durata era 30. */
        dur.dataset.sig = '';
        /* si rifa' tutto TRANNE questa fila: dentro c'e' il dito */
        disegnaFascia(p, q);
        pcFondoDis();
      };
      /* uscendo dal campo il pannello si rimette in riga: se e' rimasto
         vuoto o storto, torna a mostrare il numero vero */
      esatti.onblur = () => aggiornaPannello();
    }

    /* la riga dell'avviso non e' una riga di tagli: si veste da avviso */
    dur.classList.toggle('solo', avviso);
    c.people = lista(c.people);
    syncPeople(p.querySelector('.pc-people'), c.people, () => { pcSalva(); });

    /* LA NOTA: la stessa striscia della scheda in lista, e lo stesso
       foglio. Qui la striscia si vede anche da vuota -- e' l'unico
       posto da cui si scrive la prima nota -- mentre in lista da vuota
       resta nascosta finche' non si apre la scheda. */
    const nota = p.querySelector('.pc-nota');
    if (nota) {
      vestiNota(nota, c, true);
      if (!nota.dataset.legato) {
        nota.dataset.legato = '1';
        nota.onclick = (ev) => {
          ev.preventDefault();
          const chi = C();
          foglioNota(chi, () => vestiNota(nota, chi, true));
        };
      }
    }
  } else if (!inScontrino) {
    pcGriglia();
  }

  pcFondoDis();

  /* il contenuto e' cambiato: la scheda resta grande com'e' e a
     cambiare e' semmai la scala di quello che ci sta dentro */
  adattaTutto();

  if (opz.entra && anima()) {
    const q = inScontrino ? p.querySelector('.pc-scontrino')
      : inParco ? p.querySelector('.pc-parco') : p.querySelector('.pc-bar');
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
let pezzaSeq = 0;
function pezzaFantasia(pat, c1, c2) {
  const st = {
    'solid':     'background:' + c1,
    'stripes-h': 'background:repeating-linear-gradient(180deg,' + c1 + ' 0 6px,' + c2 + ' 6px 12px)',
    'stripes-v': 'background:repeating-linear-gradient(90deg,' + c1 + ' 0 6px,' + c2 + ' 6px 12px)',
    'dots':      'background:' + c1 + ';background-image:radial-gradient(' + c2 + ' 3px,transparent 3.2px);background-size:12px 12px',
    'plaid':     'background:' + c1 + ';background-image:repeating-linear-gradient(90deg,' + c2 + ' 0 4px,transparent 4px 13px),repeating-linear-gradient(180deg,' + c2 + ' 0 4px,transparent 4px 13px)',
    'scacchi':   'background:' + c1 + ';background-image:linear-gradient(45deg,' + c2 + ' 25%,transparent 25% 75%,' + c2 + ' 75%),linear-gradient(45deg,' + c2 + ' 25%,transparent 25% 75%,' + c2 + ' 75%);background-size:16px 16px;background-position:0 0,8px 8px',
  };
  /* MIMETICO E SCRITTA SI MOSTRANO PER QUELLO CHE SONO.
     Erano imitazioni fatte con le sfumature del CSS -- tre ellissi
     sfumate per il mimetico, tre barre per la scritta -- e adesso che
     le due fantasie sono state rifatte direbbero un'altra cosa da
     quella che finisce addosso. Qui si disegna la stoffa VERA, con la
     stessa funzione che veste la figura. */
  if (pat === 'camo' || pat === 'logo') {
    const t = AV.tessuto(c1, pat, 'sw' + (++pezzaSeq));
    return '<span class="sw"><svg viewBox="0 0 26 26" preserveAspectRatio="xMidYMid slice" ' +
      'style="display:block;width:100%;height:100%;border-radius:inherit">' +
      (t.def ? '<defs>' + t.def + '</defs>' : '') +
      '<rect width="26" height="26" fill="' + t.fill + '"/>' +
      (t.scritta ? AV.scritta(13, 15, 17, t.scritta, c1) : '') + '</svg></span>';
  }

  /* fiori e cuori sono SEGNI: a questa misura un carattere grande si
     legge meglio di un motivo ripetuto */
  const segno = { fiori: '\u273f', cuori: '\u2665' }[pat];
  const dentro = segno ? '<b style="color:' + c2 + '">' + segno + '</b>' : '';
  return '<span class="sw" style="' + (st[pat] || ('background:' + c1)) + '">' + dentro + '</span>';
}

/* la "scritta sulla maglietta" si DISEGNA: tre righe di paroline. Un
   simbolo tipografico qualunque non diceva niente. */
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
  /* la nota non e' piu' un campo della persona: fuori dalla firma */
  const sig = people.map(p => p.id + '|' + p.role + '|' + (p.name || '') +
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
  /* col guardaroba aperto il riquadro si prende l'altezza che avanza,
     e dentro se la spartiscono gli stacchi. Da chiuso no: un riquadro
     mezzo vuoto stirato a tutta pagina e' solo un buco. */
  if (PAN.root && PAN.root.contains(container)) PAN.root.classList.toggle('veste', !!chi);
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
        JSON.stringify(q.avatar)).join('\u00a7') + '>' + (container.dataset.apri || '') +
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
      else if (p && d.patb !== undefined)    { p.avatar.pants.pattern = d.patb; segna(p, 'pantaloni'); container.dataset.tav = ''; }
      /* IL TAGLIO E' UNA SCELTA A PARTE DAL COLORE: si segna da solo,
         se no scegliendo il colore la scheda avrebbe raccontato anche
         una lunghezza che nessuno ha guardato. La tavolozza resta
         aperta: colore e taglio si scelgono di fila. */
      else if (p && d.taglio !== undefined)  {
        p.avatar.hair.style = d.taglio;
        segna(p, 'taglio');
        container.dataset.tav = 'capelli';
      }
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
      } else if (p && d.accsel !== undefined) {
        /* si sceglie una cosa: la si mette addosso e la si tiene
           selezionata, cosi' la tavolozza sotto e' la sua */
        const k = d.accsel;
        accScelto = k;
        const av = p.avatar;
        if (k === 'faccia') { av.glasses = 'none'; av.facial = 'none'; segna(p, 'occhiali'); }
        else if (k === 'occhiali') { av.glasses = 'vista'; segna(p, 'occhiali'); }
        else if (k === 'sole') { av.glasses = 'sole'; segna(p, 'occhiali'); }
        else if (k === 'zaino') {
          /* toccando lo zaino che c'e' gia' lo si toglie: e' il gesto
             piu' corto per «no, lo zaino non ce l'ha» */
          if (av.bag.style === 'zaino') { av.bag = { style: 'none', color: av.bag.color }; }
          else av.bag = { style: 'zaino', color: av.bag.color || '#E23D4B' };
          segna(p, 'borsa');
        } else if (k === 'scarpe') segna(p, 'scarpe');
        container.dataset.tav = 'accessori';
      } else if (p && d.acccol !== undefined) {
        const parti = d.acccol.split('|');
        accMetti(p.avatar, parti[0], parti[1]);
        segna(p, parti[0]);
        /* dei capelli si scelgono colore E taglio, e degli accessori si
           passa da uno all'altro: la tavolozza resta aperta finche' non
           la si chiude col suo tasto */
        container.dataset.tav = parti[0] === 'capelli' ? 'capelli'
          : (parti[0] === 'scarpe' || parti[0] === 'zaino') ? 'accessori' : '';
      } else if (p && d.accvia !== undefined) {
        accTogli(p.avatar, d.accvia, p.role);
        p.tocco = true;
        if (p.avatar.scelti) {
          delete p.avatar.scelti[d.accvia];
          /* il taglio e' una scelta a parte dal colore: se resta segnato,
             la scheda continua a raccontare una chioma che nessuno ha
             piu' scelto */
          if (d.accvia === 'capelli') delete p.avatar.scelti.taglio;
          /* e gli accessori sono tre segni: occhiali, borsa, scarpe */
          if (d.accvia === 'accessori') {
            delete p.avatar.scelti.occhiali;
            delete p.avatar.scelti.borsa;
            delete p.avatar.scelti.scarpe;
          }
        }
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
  guardaSosia(p);
}

/* ══════════════════════════════════════════════════════════
   «CE N'E' GIA' UNA VESTITA COSI'»
   La descrizione serve a UNA cosa sola: riconoscere chi accompagna
   all'uscita. Due mamme senza nome, tutte e due con la maglietta rossa
   e i jeans, sono una descrizione che non riconosce piu' niente -- e
   te ne accorgi tre ore dopo, col gruppo davanti e due schede uguali.
   Il momento buono per dirlo e' ADESSO, mentre la si veste: basta
   cambiare una cosa qualunque, o scrivere un nome.
   Si confronta solo con chi e' DENTRO ADESSO: un sosia di tre settimane
   fa non da' fastidio a nessuno.
   ══════════════════════════════════════════════════════════ */
const sosiaDetti = new Set();

function firmaPersona(p) {
  if (!p || !p.avatar) return '';
  const t = AV.traits(p.avatar, 99, true).map(x => String(x.txt).toLowerCase()).sort().join('|');
  return p.role + '#' + String(p.name || '').trim().toLowerCase() + '#' + t;
}

/* il gemello di questa persona fra quelli dentro, se c'e' */
function sosiaDi(p) {
  if (!p || !p.avatar) return null;
  /* meno di due cose scelte non e' una descrizione: e' il vestito di
     serie del ruolo, e con quello si somigliano tutti */
  if (AV.traits(p.avatar, 99, true).length < 2) return null;
  const firma = firmaPersona(p);
  let trovato = null;
  lista(entries).forEach(e => {
    if (e.status !== 'active') return;
    lista(e.people).forEach(q => {
      if (!q || q.id === p.id || trovato) return;
      if (firmaPersona(q) === firma) trovato = { entry: e, chi: q };
    });
  });
  return trovato;
}

function guardaSosia(p) {
  const gemello = sosiaDi(p);
  if (!gemello) return;
  const firma = firmaPersona(p);
  /* una volta sola per descrizione: mentre si veste qualcuno si tocca
     dieci volte, e dieci avvisi uguali sono un fastidio, non un aiuto */
  if (sosiaDetti.has(firma)) return;
  sosiaDetti.add(firma);
  avvisaSosia(p, gemello.entry);
}

function avvisaSosia(p, entry) {
  document.querySelectorAll('.avviso').forEach(x => x.remove());
  const a = el('button', 'avviso giallo');
  a.appendChild(el('span', 'av-em', '\u26a0\ufe0f'));
  const t = el('span', 'av-tx');
  t.appendChild(el('b', null, 'C\u2019\u00e8 gi\u00e0 qualcuno vestito cos\u00ec'));
  t.appendChild(el('span', null, nomiDi(entry) + ' \u00b7 entrato alle ' + fmtTime(entry.startTime) +
    ' \u00b7 cambia un pezzo o scrivi un nome, se no all\u2019uscita non li distingui'));
  a.appendChild(t);
  a.appendChild(el('span', 'av-vai', 'vedi \u203a'));
  a.onclick = () => { a.remove(); vaiAllIngresso(entry); };
  document.body.appendChild(a);
  requestAnimationFrame(() => a.classList.add('su'));
  setTimeout(() => {
    a.classList.remove('su');
    setTimeout(() => a.remove(), 320);
  }, 7000);
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
/* DOVE STA SCRITTO, dentro l'avatar, il colore di ogni accessorio.
   Capelli e scarpe ce l'hanno sempre; lo zaino solo se ce l'ha. */
const ACC_DOVE = {
  capelli: (av) => av.hair.color,
  scarpe: (av) => av.shoes.color,
  zaino: (av) => av.bag.color
};
const ACC_NOME = { capelli: 'Capelli', accessori: 'Accessori' };
/* i due tasti della fila: i capelli, e tutto il resto */
const ACC_BOTTONI = ['capelli', 'accessori'];
function accMetti(av, acc, colore) {
  if (acc === 'capelli') av.hair.color = colore;
  else if (acc === 'scarpe') av.shoes = { style: 'sneakers', color: colore };
  else if (acc === 'zaino') av.bag = { style: 'zaino', color: colore };
}
/* «TOGLI» RIMETTE TUTTO IL PEZZO COM'ERA, non solo la sua tinta.
   Dei capelli adesso si sceglie anche il TAGLIO: rimettendo il solo
   colore, i ricci scelti un attimo prima restavano addosso e il tasto
   sembrava non fare niente. Si torna a quello che il ruolo aveva di
   suo -- taglio e colore -- che e' l'unico "di serie" che esista. */
function accTogli(av, acc, ruolo) {
  const base = AV.baseFor(ruolo);
  if (acc === 'capelli') av.hair = { style: base.hair.style, color: base.hair.color };
  else if (acc === 'scarpe') av.shoes = { style: base.shoes.style, color: base.shoes.color };
  else if (acc === 'zaino') av.bag = { style: 'none', color: base.bag.color };
  else if (acc === 'accessori') {
    /* «TOGLI TUTTI» TOGLIE DAVVERO.
       Rimetteva quelli del RUOLO -- e il nonno di suo gli occhiali ce
       li ha, quindi toglierli glieli rimetteva: il tasto sembrava non
       fare niente. Ma toccarlo e' un'interazione, e vuol dire una cosa
       precisa: «questa persona gli occhiali non li ha, e lo zaino
       nemmeno». La faccia resta pulita e la schiena vuota.
       Le scarpe fanno eccezione perche' scalzo non ci va nessuno:
       quelle tornano com'erano di serie. */
    av.glasses = 'none';
    av.facial = 'none';
    av.bag = { style: 'none', color: base.bag.color };
    av.shoes = { style: base.shoes.style, color: base.shoes.color };
  }
}

/* LO STACCO FRA UN GRUPPO E L'ALTRO.
   Le fantasie e i colori erano attaccati: due pixel, e i due bersagli
   invisibili che allargano le pastiglie (tre pixel in giu' le
   fantasie, cinque in su i colori) si SOVRAPPONEVANO -- toccando il
   bordo basso di una fantasia si sceglieva un colore. Non e' che non
   si capiva dove si stava cliccando: davvero si prendeva l'altro.
   Adesso in mezzo c'e' uno stacco, e lo stacco e' ELASTICO: tiene il
   minimo che serve perche' i bersagli non si tocchino, e quando sopra
   avanza dello spazio -- in "+ Nuovo" ne avanza sempre, e su un tablet
   alto anche nella scheda che vola -- se lo prende invece di lasciarlo
   morto in fondo al vano. */
const STACCO = '<i class="stacco"></i>';
const STACCO_FORTE = '<i class="stacco forte"></i>';

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
    tastoRuota('data-ruota', campo, av[campo].color) + '</div>';

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
  /* IL TASTO MOSTRA QUELLO CHE LA PERSONA HA ADDOSSO: se porta gli
     occhiali disegna gli occhiali, se ha lo zaino lo zaino, se no le
     scarpe -- che ce le hanno tutti. Un'icona fissa avrebbe detto
     "accessori" e basta, e la fila serve proprio a vedere a colpo
     d'occhio com'e' fatta la persona. */
  const iconaAcc = () => {
    if (av.glasses === 'sole') return CAPI.accessorio('sole', '#1F2430', 44);
    if (av.glasses === 'vista') return CAPI.accessorio('occhiali', '#3A3D45', 44);
    if (av.bag.style === 'zaino') return CAPI.accessorio('zaino', av.bag.color || '#8A8AA0', 44);
    return CAPI.accessorio('scarpe', av.shoes.color || '#8A8AA0', 44);
  };
  const accessori = ACC_BOTTONI.map(k => {
    const mio = k === 'accessori'
      ? !!(av.scelti && (av.scelti.scarpe || av.scelti.borsa || av.scelti.occhiali))
      : !!(av.scelti && av.scelti[k]);
    return '<button class="capo acc-b' + (mio ? ' on' : '') + '" data-acc="' + k + '">' +
      (k === 'capelli' ? CAPI.accessorio('capelli', ACC_DOVE.capelli(av) || '#8A8AA0', 44) : iconaAcc()) +
      '<span class="nm">' + ACC_NOME[k] + '</span></button>';
  }).join('');
  /* LA FANTASIA ANCHE AL SOTTO. Il modello la teneva gia' (la figura
     sapeva disegnare dei pantaloni a righe), ma non c'era modo di
     sceglierla: una gonna a fiori si poteva vedere e non si poteva
     dire. I due colori sono quelli del capo di sotto, non del sopra. */
  const cs1 = av.pants.color, cs2 = AV.coloreFantasia(cs1);
  const fantasieSotto = '<div class="fant" style="' + colonne(AV.PATTERNS.length) + '">' +
    AV.PATTERNS.map(f => '<button class="' + (av.pants.pattern === f.key ? 'on' : '') +
      '" data-patb="' + f.key + '" title="' + esc(f.n) + '">' +
      pezzaFantasia(f.key, cs1, cs2) + '</button>').join('') + '</div>';

  const capiSotto = '<div class="sottoblocco' + (lungo ? ' spento-capi' : '') + '">' +
    /* le colonne sono i capi PIU' GLI ACCESSORI CHE CI SONO DAVVERO.
       Erano scritte "+ 4" da quando gli accessori erano quattro: tolti
       cappello e zaino, la fila teneva dodici colonne per dieci
       pulsanti -- due posti vuoti in fondo, e tutti i pulsanti del
       sotto piu' stretti di quelli del sopra senza motivo. */
    '<div class="capi" style="' + colonne(AV.PANTS.length + ACC_BOTTONI.length) + '">' +
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
      '<span class="et">Sopra</span>' + capiSopra + STACCO +
      '<span class="et">Fantasia</span>' + fantasie + STACCO_FORTE +
      /* niente etichetta "Colore del sopra": una fila di pastiglie
         colorate attaccata sotto i capi non puo' essere altro, e due
         righe di scritta sono venti pixel che al guardaroba servono
         per starci dentro tutto */
      tinte('top') + STACCO +
      '<span class="et">Sotto' + (lungo ? '<span class="spento-k">col vestito lungo non serve</span>' : '') +
        '</span>' + capiSotto + STACCO +
      '<span class="et">Fantasia</span>' + fantasieSotto + STACCO_FORTE +
      tinte('pants') +
    '</div>' +
    /* LA RIGA LIBERA NON STA PIU' QUI. Era un campo della persona, e per
       scriverci sopra bisognava aprire una persona e vestirla: adesso la
       Nota e' del gruppo e sta nel Parco, sempre a vista. Il guardaroba
       torna a fare una cosa sola -- vestire -- che e' gia' la piu'
       affollata dell'app. */
    '</div>';
}

/* I SEI TAGLI CHE SI SCELGONO AL BANCO. Gli altri (codino, chignon,
   treccine) restano addosso a chi ce li ha dal suo ruolo: qui c'e'
   quello che serve a riconoscere qualcuno da lontano. */
const TAGLI_CAPELLI = ['pelato', 'corti', 'medio', 'lunghi', 'ricci', 'riccimedi'];

/* LA TAVOLOZZA DEI CAPELLI E' DIVERSA DALLE ALTRE: dei capelli non si
   guarda solo il colore, si guarda anche la testa. Quattro tinte --
   neri, marroni, biondi, e l'arcobaleno per tutto il resto -- e sotto i
   sei tagli, ognuno disegnato sulla testa di QUESTA persona, col suo
   colore addosso. */
function tavolozzaCapelli(av) {
  const ora = String(av.hair.color || '').toLowerCase();
  const tinte = AV.HAIR_COLORS.slice(0, 3).map(c =>
    '<button class="cap-c' + (ora === c.c.toLowerCase() ? ' on' : '') +
    '" data-acccol="capelli|' + c.c + '" style="background:' + c.c +
    '" title="' + esc(c.n[0]) + '"></button>').join('');
  /* I TAGLI SONO CAPI COME GLI ALTRI: stessa classe, quindi stesso
     disegno col bordo bianco, stessa misura e soprattutto la stessa
     scritta sotto -- prima era piccola la meta’ e su fondo scuro non
     si leggeva. */
  const tagli = TAGLI_CAPELLI.map(k => {
    const it = AV.findIn(AV.HAIR, k);
    return '<button class="capo cap-t' + (av.hair.style === k ? ' on' : '') +
      '" data-taglio="' + k + '">' + CAPI.capelli(k, av.hair.color, av.skin, 44) +
      '<span class="nm">' + esc(it.label) + '</span></button>';
  }).join('');
  return '<div class="volante capelli">' +
    '<span class="tv-k">Colore</span>' +
    '<div class="cap-tinte">' + tinte +
      tastoRuota('data-accruota', 'capelli', av.hair.color, AV.HAIR_COLORS.slice(0, 3)) +
      '<span class="cap-arc">Arcobaleno</span></div>' +
    '<span class="tv-k">Taglio</span>' +
    '<div class="cap-tagli">' + tagli + '</div>' +
    '<button class="via" data-accvia="capelli">togli</button></div>';
}

/* GLI ACCESSORI: cinque cose che si guardano addosso a una persona.
   Le prime tre stanno sulla faccia e non hanno un colore da scegliere
   -- gli occhiali sono occhiali -- le altre due si', e allora sotto
   compare la tavolozza di sempre.
   «Faccia pulita» non e' il vuoto: e' una cosa che si e' GUARDATA e si
   puo' dire («no, niente occhiali»), e serve a togliere quelli che il
   ruolo mette di suo. */
const ACC_COSE = [
  { k: 'faccia', nome: 'Faccia pulita' },
  { k: 'occhiali', nome: 'Occhiali' },
  { k: 'sole', nome: 'Da sole' },
  { k: 'zaino', nome: 'Zaino', tinta: true },
  { k: 'scarpe', nome: 'Scarpe', tinta: true }
];
/* quale si sta guardando: da li' dipende di che cosa e' la tavolozza */
let accScelto = 'scarpe';

/* ACCESO = L'HAI SCELTO TU, non «ce l'ha addosso».
   Il ruolo porta gia' i suoi: il nonno ha gli occhiali, la mamma la
   borsa. Quella roba e' l'archetipo -- serve a far sembrare una
   persona una persona -- non una cosa vista addosso a QUESTA persona,
   e infatti nella descrizione non compare finche' non la tocchi.
   Il tasto deve dire la stessa cosa: spento finche' non sei stato tu,
   se no si legge «occhiali» su una scheda che all'uscita non li
   nomina, e si cerca il nonno sbagliato. */
function accAddosso(av, k) {
  const sc = av.scelti || {};
  if (k === 'faccia') return !!sc.occhiali && av.glasses === 'none' && av.facial === 'none';
  if (k === 'occhiali') return !!sc.occhiali && av.glasses === 'vista';
  if (k === 'sole') return !!sc.occhiali && av.glasses === 'sole';
  if (k === 'zaino') return !!sc.borsa && av.bag.style === 'zaino';
  return !!sc.scarpe;                /* le scarpe ce le hanno tutti: conta la scelta */
}

function tavolozzaAccessori(av) {
  const cose = ACC_COSE.map(x => {
    const su = accAddosso(av, x.k);
    const colore = x.k === 'zaino' ? (av.bag.color || '#8A8AA0')
      : x.k === 'scarpe' ? (av.shoes.color || '#8A8AA0')
      : x.k === 'faccia' ? av.skin
      : x.k === 'sole' ? '#1F2430' : '#3A3D45';
    return '<button class="capo acc-c' + (su ? ' on' : '') +
      (accScelto === x.k ? ' scelto' : '') + '" data-accsel="' + x.k + '">' +
      CAPI.accessorio(x.k, colore, 30) +
      '<span class="nm">' + esc(x.nome) + '</span></button>';
  }).join('');

  const conTinta = ACC_COSE.find(x => x.k === accScelto && x.tinta);
  let tinte = '';
  if (conTinta) {
    const ora = String(ACC_DOVE[accScelto](av) || '').toLowerCase();
    tinte = '<span class="tv-k">Colore ' +
      (accScelto === 'zaino' ? 'dello zaino' : 'delle scarpe') + '</span>' +
      '<div class="acc-tinte">' +
        AV.COLORS.map(c => '<button data-acccol="' + accScelto + '|' + c.c +
          '" style="background:' + c.c + '" title="' + esc(c.n[0]) + '"' +
          (ora === c.c.toLowerCase() ? ' class="on"' : '') + '></button>').join('') +
        tastoRuota('data-accruota', accScelto, ACC_DOVE[accScelto](av)) +
      '</div>';
  }

  return '<div class="volante accessori">' +
    '<span class="tv-k">Che cos\u2019ha addosso</span>' +
    '<div class="acc-cose">' + cose + '</div>' +
    tinte +
    '<button class="via" data-accvia="accessori">togli tutti</button></div>';
}

/* IL TASTO DELLA RUOTA, UNO SOLO PER TUTTE E QUATTRO LE TAVOLOZZE.
   Prima era scritto a mano in quattro posti, tutti uguali e tutti muti:
   scelto un colore fuori dai quindici in fila, NESSUNA pastiglia
   risultava accesa e il tasto restava l'arcobaleno di sempre. La
   tavolozza diceva "non hai scelto niente" mentre addosso il colore
   c'era: da fuori sembrava che i colori scelti a mano non restassero.
   Adesso, quando la tinta di adesso non e' una delle quindici, il tasto
   se la mette addosso e si accende come farebbe una pastiglia: e' il
   posto dove quel colore vive. */
/* `fila` sono le pastiglie che stanno DAVVERO li' accanto: i capelli
   ne hanno tre loro, non le quindici degli altri, e confrontarsi con
   la fila sbagliata accenderebbe il tasto su un castano di serie. */
function tastoRuota(attributo, valore, coloreOra, fila) {
  const c = String(coloreOra || '').trim();
  const fuoriFila = !!c && !(fila || AV.COLORS).some(x => x.c.toLowerCase() === c.toLowerCase());
  return '<button class="ruota' + (fuoriFila ? ' on' : '') + '" ' + attributo + '="' + esc(valore) +
    '"' + (fuoriFila ? ' style="background:' + esc(c) + '"' : '') +
    ' title="' + (fuoriFila ? 'colore scelto a mano' : 'scegli tu') + '"></button>';
}

/* la tavolozza di un accessorio: le stesse tinte, la ruota, e il tasto
   per toglierlo */
function tavolozza(av, acc) {
  if (acc === 'capelli') return tavolozzaCapelli(av);
  if (acc === 'accessori') return tavolozzaAccessori(av);
  const ora = ACC_DOVE[acc](av);
  return '<div class="volante">' +
    AV.COLORS.map(c => '<button data-acccol="' + acc + '|' + c.c + '" style="background:' + c.c + '"' +
      (ora && ora.toLowerCase() === c.c.toLowerCase() ? ' class="on"' : '') + '></button>').join('') +
    tastoRuota('data-accruota', acc, ora) +
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
    else if (quandoAgg(c.dato) > quandoAgg(entries[i]) && firma(c.dato) !== firma(entries[i])) {
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
    const quanti = entries.filter(e => e && e.id).length;
    CLOUD.primaSalita(entries, settings, presets).then(n => {
      su.disabled = false;
      /* se non sono saliti tutti bisogna dirlo: prima il numero era
         sempre quello "giusto" anche quando il caricamento era fallito */
      if (n >= quanti) toast('Mandati ' + n + ' ingressi in cloud ☁️');
      else toast('⚠️ Saliti ' + n + ' ingressi su ' + quanti + ': riprova quando la linea è stabile');
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
/* RIMETTERE DENTRO UN BACKUP.
   Stava tutto dentro il gestore del tasto, in mezzo a `FileReader` e
   ai toast: cioe' nel posto meno raggiungibile di tutta l'app, e
   nessuna prova poteva arrivarci. Ed e' l'ULTIMA rete che hanno: se il
   ripristino sbaglia, sbaglia il giorno in cui il tablet e' morto e
   non c'e' nessun altro posto da cui ripartire.
   Adesso i dati passano di qui -- il tasto ci mette solo il file e i
   messaggi -- e le prove possono fare il giro completo: si salva, si
   rilegge, e ogni euro e ogni minuto devono essere quelli. */
function applicaBackup(testo) {
  const d = JSON.parse(testo);
  /* UNA LISTA NON E' UN BACKUP, e il controllo di prima non se ne
     accorgeva: `[1,2,3].entries` non e' vuoto -- e' un METODO delle
     liste, quindi risultava "ci sono gli ingressi" -- e l'app leggeva
     quel metodo come elenco, lo trovava vuoto, e sostituiva la serata
     con niente. Un file sbagliato scelto per errore cancellava tutto,
     dicendo pure che era andato bene.
     Qui si chiede la forma giusta e basta: un oggetto, con dentro una
     LISTA vera di ingressi o un blocco di impostazioni. */
  const oggetto = !!d && typeof d === 'object' && !Array.isArray(d);
  const haIngressi = oggetto && Array.isArray(d.entries);
  const haImpostazioni = oggetto && !!d.settings && typeof d.settings === 'object' &&
    !Array.isArray(d.settings);
  if (!haIngressi && !haImpostazioni) throw new Error('formato');
  if (haImpostazioni) { settings = Object.assign(defaultSettings(), d.settings); saveSettings(); }
  if (haIngressi) { entries = normalizeEntries(d.entries); saveEntries(); }
  if (Array.isArray(d.presets)) { presets = lista(d.presets); savePresets(); }
  return d;
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
  if (cat === 'Scontrino') return '<span class="em">🧾</span>';
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
  /* DI CHE COS'E' FATTO OGNI TOTALE.
     «Totale Parco 24,00» non dice se sono due bambini per un'ora o
     quattro per mezz'ora, e al banco la domanda arriva sempre in quella
     forma: «ma quanti sono?». Una riga piccola sotto il nome, e la
     cifra non ha piu' bisogno di essere spiegata a voce. */
  const bimbi = clamp(num(c.children, 0), 0, 1e6);
  const crz = clamp(num(c.crazyJumping, 0), 0, 1e6);
  const volte = turniCrazy(c);
  const pezzi = lista(c.barItems).reduce((a, x) => a + clamp(num(x.qty, 0), 0, 1e6), 0);
  const conta = {
    bimbi: bimbi > 0
      ? bimbi + (bimbi === 1 ? ' bambino' : ' bambini') +
        /* a tempo aperto, al posto di «tempo aperto» -- che lo dice gia'
           l'orario qui sotto, «→ aperta» -- c'e' il conto da cui esce
           il prezzo: e' l'unico numero della fascia che si muove da
           solo, e senza il conto scritto sembra cambiare a caso */
        (c.payLater ? ' \u00b7 \u23f3 ' + spiegaAperto(c, true)
          : ' \u00d7 ' + fmtMin(clamp(num(c.durationMinutes, 0), 0, 1e6)))
      : '',
    crazy: crz > 0 ? crz + (crz === 1 ? ' giro' : ' giri') +
      (volte > 1 ? ' in ' + volte + ' volte' : '') : '',
    bar: pezzi > 0 ? pezzi + (pezzi === 1 ? ' cosa' : ' cose') : ''
  };
  const parte = (nome, ico, id, im, p) => {
    const fatto = im > 0 && p >= im - 0.005;
    return '<div class="bc-parte' + (fatto ? ' fatta' : '') + '">' + ICONE[ico]() +
      '<div class="bc-pk"><span class="k">' + nome + '</span>' +
      (conta[id] ? '<span class="dicosa">' + conta[id] + '</span>' : '') +
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
  /* GRAFICA 2.0: I TRE TOTALI DI SEZIONE SE NE VANNO.
     Rifanno il mestiere dello Scontrino, che lo fa meglio: riga per
     riga, con quanto e' gia' entrato e quanto manca. Tenendoli, la
     stessa cifra compariva tre volte nella stessa schermata e i modi di
     incassare diventavano quattro.
     Qui in fondo resta quello che serve col cliente davanti: quanto
     deve, il Resto, e Paga tutto. Chi vuole incassare una riga alla
     volta va nello Scontrino, che e' nato per quello. */
  return '<div class="bc-fondo">' +
    (settings.grafica2 ? '' :
    '<div class="bc-parti">' +
      parte('Totale Parco', 'bimbi', 'bimbi', contoParco(), contoPagatoParco()) +
      parte('Totale Crazy', 'crazy', 'crazy', contoCrazy(), contoPagatoCrazy()) +
      parte('Totale Bar', 'coca', 'bar', contoBar(), contoPagatoBar()) +
    '</div>') +
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
      /* L'USCITA NON STA QUI. Stava in fondo al pannello, cioe' in
         fondo alla schermata dove si sta CONTANDO: chi apriva il conto
         per segnare una birra se la trovava sotto le dita, accanto a
         «Paga tutto». Si esce da fuori -- dal menu della scheda, dove
         c'e' il suo tasto -- dopo aver chiuso il conto: prima si
         guarda, poi si chiude, poi si esce. Da qui si torna indietro
         con «Fatto». */
      /* NEL BLOCCHETTO DEL BAR NON SI «REGISTRA»: si decide DOVE va.
         Le tre strade -- gruppo nuovo, solo bar, dentro un gruppo che e'
         gia' al parco -- non si possono indovinare da qui, e sceglierle
         prima di segnare vorrebbe dire saperlo prima di chiederglielo.
         Quindi si segna, e poi si dice dove. */
      /* AGGIUNGI A UN GRUPPO CHE E' GIA' DENTRO. Compare solo mentre si
         registra (non su un ingresso gia' aperto: li' si e' gia' dentro
         a un gruppo), solo se c'e' qualcosa da spostare e solo se al
         parco c'e' qualcuno a cui darlo. */
      (!PAN.ingresso && tot > 0 && activeEntries().length
        ? '<button class="btn" data-aggiungi>\ud83c\udf9f\ufe0f Aggiungi a\u2026</button>'
        : '') +
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
      onPick({ id: uid(), role: r.key, name: '', avatar: nato });
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

  /* NIENTE NOTA QUI DENTRO: adesso e' del gruppo e sta nel Parco, sempre
     a vista. Questo editor fa una cosa sola -- vestire -- ed e' gia' la
     schermata piu' affollata dell'app. */

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
/* Registra il foglio che gli si passa. Di norma e' quello di «+ Nuovo»,
   ma il blocchetto del Bar ha il suo e finisce nello stesso posto: un
   ingresso e' un ingresso, da qualunque parte lo si sia scritto.
   `opz.soloBar` lo registra come vendita al banco -- zero bambini, zero
   tempo di parco -- che e' la stessa cosa che faceva il vecchio tasto
   «Solo bar»: senza un ingresso a cui appenderla, la sera quella vendita
   non tornerebbe nei conti del giorno. */
function commitEntry() {
  const nato = commitDa(draft, {});
  draft = freshDraft();
  PAN.conto = draft;
  switchTab('active');
  // se una versione nuova stava aspettando che finissi, adesso puo' entrare
  if (typeof applicaSePuoi === 'function') setTimeout(applicaSePuoi, 1200);
  return nato;
}

/* Costruisce e mette in lista l'ingresso a partire dal foglio che gli si
   passa. NON rimette a nuovo il foglio e NON cambia vista: quelle due
   cose le fa chi chiama, perche' sa quale dei due fogli ha in mano --
   «+ Nuovo» e il blocchetto del Bar ne hanno uno per uno. */
function commitDa(draft, opz) {
  opz = opz || {};
  /* gruppo nuovo, avvisi nuovi: i sosia gia’ detti valgono per il
     gruppo che si stava vestendo, non per sempre -- se no il terzo
     gemello della giornata passava senza che nessuno dicesse niente */
  sosiaDetti.clear();
  if (!draft.braceletCustom) {
    const slot = braceletFor(draft.startTime);
    draft.braceletColor = slot ? slot.color : null;
  }
  /* SOLO BAR LO CAPISCE DA SE': se al parco non entra nessuno e non
     salta nessuno, quello che resta e' una vendita al banco. Niente
     interruttore da ricordarsi -- un gesto in meno per la cosa che al
     banco capita di continuo. */
  const soloBar = opz.soloBar !== undefined ? !!opz.soloBar
    : (clamp(num(draft.children, 0), 0, 1e6) === 0 &&
       clamp(num(draft.crazyJumping, 0), 0, 1e6) === 0 &&
       lista(draft.barItems).some(b => b && num(b.qty, 0) > 0));
  const nuovo = {
    id: uid(), createdAt: Date.now(),
    startTime: draft.startTime,
    durationMinutes: soloBar ? 0 : draft.durationMinutes,
    payLater: soloBar ? false : draft.payLater,
    children: soloBar ? 0 : draft.children,
    crazyJumping: soloBar ? 0 : draft.crazyJumping,
    people: soloBar ? [] : draft.people,
    barItems: lista(draft.barItems),
    /* LA NOTA VIENE DIETRO. Questo elenco e' scritto a mano campo per
       campo, ed e' esattamente il punto in cui si perdono le cose
       nuove: senza questa riga la nota appena scritta nel Parco
       spariva premendo Registra. */
    note: String(draft.note || ''),
    /* LA SIGLA DEL MODULO VIENE CON LUI, MA SOLO SE E' ANCORA LIBERA.
       Il foglio nasce col caricamento dell'app -- `let draft =
       freshDraft()` -- e a quel punto gli ingressi salvati non sono
       ancora stati letti: `nuovaSigla()` vedeva una lista vuota e
       rispondeva sempre AA. Otto riavvii, otto gruppi chiamati AA.
       Qui si controlla al momento buono, che e' l'unico in cui si sa
       davvero chi c'e'. */
    sigla: siglaLibera(draft.sigla, draft.startTime),
    braceletColor: draft.braceletColor, braceletCustom: draft.braceletCustom,
    status: 'active',
    /* quello che e' gia' stato incassato al banco entra subito nei conti
       del giorno: se no la sera i totali non tornano */
    paidLines: JSON.parse(JSON.stringify(draft.paidLines || {})),
    paidAmt: JSON.parse(JSON.stringify(draft.paidAmt || {})),
    paidPark: r2(draft.paidPark), paidBar: r2(draft.paidBar),
    barPaid: 0, parkPaid: false,
    /* registrato, l'orario e' quello: non insegue piu' l'orologio */
    oraManuale: true,
    /* da quando conta il tempo di parco, se e' cominciato dopo l'ingresso */
    parcoDa: soloBar ? undefined : (num(draft.parcoDa, 0) || undefined),
    regaloFinoA: soloBar ? undefined : (num(draft.regaloFinoA, 0) || undefined),
    baseMinutes: soloBar ? 0 : draft.durationMinutes,
    /* QUELLO CHE NASCE NEL MODULO DEVE ARRIVARE INTERO.
       Questo elenco e' scritto a mano, campo per campo, e chi ne
       aggiunge uno nuovo se lo scorda: e' successo con tutti e tre
       questi. I minuti in OMAGGIO sparivano -- un solo-Crazy
       registrato usciva otto minuti dopo invece di diciotto -- e la
       composizione dei GIRI tornava a un giro solo con tutti dentro,
       cioe' due giri fatti al banco diventavano otto minuti invece di
       sedici. Roba di tempo e di soldi, persa fra il modulo e la
       lista. */
    omaggio: soloBar ? undefined : (clamp(num(draft.omaggio, 0), 0, 1e6) || undefined),
    crazyGiri: soloBar ? [] : lista(draft.crazyGiri).slice(),
    aggiunte: soloBar ? [] : lista(draft.aggiunte).slice()
  };
  /* UNA VENDITA AL BANCO RESTA IN VISTA UN MOMENTO, POI SI ARCHIVIA.
     Nasce ATTIVA, con una scheda sua -- niente conto alla rovescia, non
     c'e' nessuno dentro al parco -- cosi' se ci si accorge subito di uno
     sbaglio si fa in tempo a correggerla. Passati i due minuti se ne va
     da sola in archivio, con la sua animazione: la lista non deve
     riempirsi di scontrini, e nel registro della giornata ci finisce
     comunque. Se ne occupa `archiviaSoloBarScaduti`, dal battito. */
  if (soloBar) {
    nuovo.soloBar = true;
    nuovo.barFinoA = Date.now() + ATTESA_SOLO_BAR;
  }
  entries.push(nuovo);
  toast(opz.messaggio || 'Ingresso registrato \u2705');
  saveEntries();
  return nuovo;
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

  let list = showArchive ? archived() : activeEntries();
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
  arch.onclick = () => {
    showArchive = !showArchive;
    archivioTutto = false;
    cercaArchivio = '';      /* uscendo e rientrando si riparte da tutto */
    buildActiveView();
  };
  head.appendChild(arch);
  root.appendChild(head);

  if (showArchive) {
    root.appendChild(Object.assign(el('div', 'hint'), {
      textContent: 'Gli ingressi chiusi restano qui: puoi riaprirli se hai sbagliato, o eliminarli per sempre.'
    }));
    const cerca = el('input', 'arch-cerca');
    cerca.type = 'search';
    cerca.placeholder = '\ud83d\udd0d Cerca: sigla, nome, nota, ora\u2026';
    cerca.value = cercaArchivio;
    /* si ridisegna mentre si scrive, ma il campo non si rifa': se lo
       rifacessi il cursore tornerebbe in fondo a ogni lettera */
    cerca.oninput = () => { cercaArchivio = cerca.value; buildActiveView(); };
    root.appendChild(cerca);
    setTimeout(() => { if (cercaArchivio) cerca.focus(); }, 0);
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
  /* IN ARCHIVIO SI CERCA QUALCUNO, non si scorre per il gusto di
     scorrere: ci si va perche' «quelli di prima devono ancora pagare» o
     «ho sbagliato a battere il gruppo AC». Con duecento righe uguali,
     trovarlo voleva dire scorrere e leggere.
     Si cerca per sigla, per nome, per nota e per ora. E le giornate si
     separano con un titoletto, se no il 12 e il 13 agosto sono un
     elenco solo. */
  if (showArchive) list = filtraArchivio(list);
  const quanti = showArchive && !archivioTutto && list.length > ARCHIVIO_A_VISTA
    ? ARCHIVIO_A_VISTA : list.length;
  let giornoScritto = null;
  list.slice(0, quanti).forEach(entry => {
    if (showArchive) {
      const g = giornataDi(num(entry.startTime, num(entry.createdAt, 0)));
      if (g !== giornoScritto) {
        giornoScritto = g;
        const t = el('div', 'arch-giorno');
        t.appendChild(el('b', null, nomeGiornata(g)));
        const quanti2 = list.filter(x => giornataDi(num(x.startTime, num(x.createdAt, 0))) === g).length;
        t.appendChild(el('span', null, quanti2 + (quanti2 === 1 ? ' ingresso' : ' ingressi')));
        box.appendChild(t);
      }
    }
    box.appendChild(showArchive ? archiveCard(entry) : entryCard(entry));
  });
  if (showArchive && !list.length) {
    box.appendChild(Object.assign(el('div', 'empty'), {
      innerHTML: '<span class="em">\ud83d\udd0d</span>Nessuno con «' + esc(cercaArchivio) + '».<br>' +
        'Si cerca per sigla, nome, nota o ora.'
    }));
  }
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

/* LA SCHEDA IN ARCHIVIO.
   Era una riga di testo con due iconcine: non si capiva chi fosse chi
   -- «Nessun riferimento · 🧒 2» su venti righe uguali -- non si vedeva
   quanto avessero pagato, e i due tasti erano una freccia e un cestino
   senza una parola sopra.
   Adesso dice le stesse cose che dice la scheda viva, e nello stesso
   ordine: la figura di chi accompagnava, il nome, quando sono stati
   dentro e quanto, quanti erano, e i soldi -- con quello che e' rimasto
   da incassare in rosso, che e' l'unica cosa che in archivio si va
   davvero a cercare. */
function archiveCard(entry) {
  const d = el('div', 'arch');
  const people = lista(entry.people).map(p => (p.avatar = AV.normalize(p.avatar, p.role), p));
  const due = dueOf(entry);
  const annullato = entry.status === 'cancelled';

  /* la figura: la stessa dell'elenco vivo, cosi' si riconosce a colpo
     d'occhio chi era senza leggere niente */
  const fig = el('div', 'arch-fig');
  if (people.length) {
    people.slice(0, 2).forEach(p => {
      const a = el('div', 'av');
      a.innerHTML = AV.build(p.avatar);
      fig.appendChild(a);
    });
    if (people.length > 1) fig.classList.add('multi');
  } else {
    fig.classList.add('senza');
    fig.appendChild(el('div', 'segno', entry.soloBar ? '\ud83e\uddfe' : '\ud83c\udf9f\ufe0f'));
  }
  d.appendChild(fig);

  const info = el('div', 'ainfo');

  /* che cos'era: annullato, Solo BAR, o un gruppo uscito */
  const tipo = el('div', 'arch-tipo');
  tipo.className = 'arch-tipo' + (annullato ? ' ann' : entry.soloBar ? ' bar' : '');
  tipo.textContent = annullato ? '\ud83d\uddd1\ufe0f Annullato'
    : entry.soloBar ? '\ud83e\uddfe Solo BAR' : '\ud83d\udeaa Uscito';
  info.appendChild(tipo);

  const chi = el('div', 'arch-chi');
  chi.textContent = people.length
    ? people.map(p => roleOf(p.role).em + ' ' + nameOf(p)).join(' \u00b7 ')
    : entry.soloBar ? 'Solo BAR' : 'Senza riferimento';
  info.appendChild(chi);

  /* i tratti scritti: sono quelli che facevano riconoscere la persona,
     e in archivio servono a dire «ah, erano quelli col cappello giallo» */
  if (people.length === 1) {
    const t = AV.traits(people[0].avatar, 3, true).map(x => x.txt).join(' \u00b7 ');
    if (t) info.appendChild(el('div', 'arch-tratti', t));
  }

  const quando = el('div', 'arch-quando');
  const durata = Math.round((endTimeOf(entry) - entry.startTime) / 60000);
  quando.innerHTML = '<span>' + esc(fmtDate(entry.startTime)) + '</span>' +
    '<b>' + fmtTime(entry.startTime) + '</b>' +
    (entry.soloBar ? '' : '<span>\u2192</span><b>' + fmtTime(endTimeOf(entry)) + '</b>' +
      '<i>' + fmtMin(durata) + '</i>') +
    (clamp(entry.children, 0, 1e6) ? '<span class="arch-q">\ud83e\uddd2 ' + clamp(entry.children, 0, 1e6) + '</span>' : '') +
    (clamp(entry.crazyJumping, 0, 1e6) ? '<span class="arch-q">\ud83e\udd38 ' + clamp(entry.crazyJumping, 0, 1e6) + '</span>' : '');
  info.appendChild(quando);

  /* I SOLDI, che sono il motivo per cui in archivio ci si torna. Quello
     che manca in rosso: e' la domanda vera («questi hanno pagato?»), e
     prima non c'era nessuna risposta. */
  const soldi = el('div', 'arch-soldi');
  const preso = r2(num(entry.paidPark, 0) + num(entry.paidBar, 0));
  soldi.innerHTML = '<span class="as-k">incassato</span><b>' + eur(preso) + '</b>' +
    (due.total > 0.005
      ? '<span class="as-manca">restano ' + eur(due.total) + '</span>'
      : '<span class="as-ok">\u2713 saldato</span>');
  info.appendChild(soldi);

  const nota = String(entry.note || '').trim();
  if (nota) info.appendChild(el('div', 'arch-nota', '\ud83d\udcdd ' + nota));

  d.appendChild(info);

  /* I TASTI CON LE PAROLE. Una freccia e un cestino non dicono cosa
     fanno, e uno dei due cancella per sempre. */
  const tasti = el('div', 'arch-tasti');
  const rest = el('button', 'btn btn-sm', '\u21a9\ufe0e Rimetti dentro');
  rest.title = 'Torna fra chi \u00e8 al parco';
  rest.onclick = () => {
    /* ANCHE QUESTO SI ANNULLA. Rimettere dentro un gruppo uscito e'
       reversibile come tutto il resto, e senza l'annulla per rimediare a
       un tocco sbagliato bisognava rifargli l'uscita a mano -- che vuol
       dire ricalcolargli il prezzo col listino di adesso invece che con
       quello di quando e' uscito. */
    const foto = fotografia(entry);
    entry.status = 'active';
    delete entry.closedAt;
    delete entry.costoFinale;   // torna dentro: si riconta col listino di adesso
    /* se era un Solo BAR le si ridanno i suoi due minuti, se
       no si riarchivia all'istante e sembra che il tasto non funzioni */
    if (entry.soloBar) entry.barFinoA = Date.now() + ATTESA_SOLO_BAR;
    saveEntries();
    showArchive = false;
    buildActiveView();
    updateBadge();
    /* niente freccia nel messaggio: ce l'ha gia' il tasto accanto, e
       due di fila si leggevano come un errore di stampa */
    fatto('Rimesso fra chi \u00e8 dentro', () => {
      const i = entries.findIndex(e => e.id === foto.id);
      if (i > -1) rimetti(entries[i], foto);
      saveEntries();
      showArchive = true;
      buildActiveView();
      updateBadge();
      toast('Tornato in archivio \u21a9\ufe0e');
    });
  };
  tasti.appendChild(rest);

  const del = el('button', 'btn btn-sm btn-danger', '\ud83d\uddd1\ufe0f Elimina');
  del.title = 'Sparisce anche dai conti della giornata';
  del.onclick = () => confirmSheet('Eliminare ' +
    (people.length ? nomiDi(entry) : entry.soloBar ? 'questo Solo BAR' : 'questo ingresso') + '?',
    'Sparisce anche dai conti della giornata: ' + eur(preso) +
    ' non risulteranno pi\u00f9 incassati.', () => {
    /* PASSA DA `eliminaIngresso`, che l'annulla ce l'ha gia'. Qui c'era
       una cancellazione scritta a parte -- `entries.filter` e un toast
       secco -- e da questa schermata l'ingresso spariva senza rete: un
       tocco storto e i suoi soldi uscivano dai conti della giornata per
       sempre. E' l'unico posto dell'app dove succedeva. */
    eliminaIngresso(entry);
  });
  tasti.appendChild(del);
  d.appendChild(tasti);
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
    /* il cambio di linguetta a conto aperto lo sa fare apriConto: qui
       si aggiunge solo l'accensione di chi accompagna, che e' il
       motivo per cui si tocca la figura */
    apriConto('Parco');
    accendiPersone();
  };
  riga.appendChild(avBox);

  const chi = el('div', 'e-chi');
  const nome = el('b');
  chi.appendChild(nome);
  const tratti = el('div', 'e-tr');
  chi.appendChild(tratti);
  /* la figura, il nome e i tratti si riempiono qui e si RIFANNO da qui
     ogni volta che qualcuno cambia vestito: prima erano scritti una
     volta sola, alla nascita della scheda */
  vestiRiga({ avBox, nome, tratti, apriParco }, entry);
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
  /* SOLO CRAZY, senza bambini in sala: e' un ingresso di un altro tipo
     -- non paga il parco, sta dentro solo i minuti del salto -- e
     nella lista va riconosciuto senza leggere i numeri. Lo zero
     accanto alla faccina non basta: si legge come "un gruppo qualunque
     con zero bambini", che e' un'altra cosa. */
  const solo = el('div', 'e-solocrz hidden', 'solo Crazy');
  sotto.appendChild(solo);
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

  /* LE DUE LETTERE, accanto al bracciale. Il colore dice la fascia
     oraria, non QUALE gruppo: in una serata ce ne sono dieci col verde,
     e per indicarne uno bisognava descriverlo. La sigla si dice a voce e
     si legge da lontano. */
  const sigla = el('span', 'e-sigla', String(entry.sigla || ''));
  if (!entry.sigla) sigla.classList.add('hidden');
  sigla.title = 'Codice del gruppo';
  riga.appendChild(sigla);

  /* IL NUMERO GRANDE DA SOLO NON DICE COSA CONTA: lo stesso "45:12"
     puo' essere il tempo che manca, quello sforato o quello passato
     dentro con la tariffa aperta, e il colore della scheda lo suggerisce
     ma non lo dice. Sopra ci va la parola, come gia' fa la cifra dei
     soldi qui accanto ("DA PAGARE"). */
  const countBox = el('div', 'e-conto');
  const countK = el('span', 'k', '');
  const count = el('span', 'v num', '--:--');
  /* GRAFICA 2.0: DI CHE COS'E' FATTO QUEL TEMPO, sotto il conto alla
     rovescia. Prima stava nel banner degli orari, ma quello e' gia'
     pieno -- dalle, alle, la durata, il bracciale, i bambini, i giri --
     e su una tavoletta le scritte finivano una sull'altra. Qui sotto
     c'e' il posto giusto: e' la riga che spiega il numero grande, come
     fa gia' quella sotto i soldi a tempo aperto. */
  const countS = el('span', 'sott vuota', '');
  countBox.appendChild(countK);
  countBox.appendChild(count);
  countBox.appendChild(countS);
  riga.appendChild(countBox);

  /* i soldi: etichetta sopra, numero sotto */
  const soldi = el('div', 'e-soldi');
  const soldiK = el('span', 'k', '');
  const soldiV = el('span', 'v num', '');
  /* la riga del conto scritto in piccolo: c'e' solo a tempo aperto */
  const soldiS = el('span', 'sott vuota', '');
  soldi.appendChild(soldiK);
  soldi.appendChild(soldiV);
  soldi.appendChild(soldiS);
  riga.appendChild(soldi);

  card.appendChild(riga);

  /* LA NOTA SEMPRE A VISTA, sotto la riga. Stava dentro la parte che si
     apre: per leggere «hanno la torta in frigo» bisognava aprire la
     scheda, cioe' proprio quello che non si fa quando si guarda la lista
     di colpo d'occhio. E se non c'era niente scritto non c'era nemmeno
     un posto dove scriverlo: adesso c'e', spento, e un tocco lo apre. */
  const notaBox = el('button', 'e-nota');
  const disegnaNota = () => vestiNota(notaBox, entry, false);
  disegnaNota();
  notaBox.onclick = (ev) => { ev.stopPropagation(); foglioNota(entry, disegnaNota); };
  card.appendChild(notaBox);

  /* ================= QUELLO CHE SI APRE =================
     una fila sola: tre celle compatte e i tasti a destra */
  const aperta = el('div', 'e-aperta');
  /* l'involucro serve all'animazione: e' lui che si apre da 0 a tutta
     altezza, invece del salto secco di display:none */
  const dentro = el('div', 'e-dentro');
  aperta.appendChild(dentro);
  const fila = el('div', 'e-fila');

  /* UN GRUPPO, COL SUO NOME SOPRA. Il nome non e' decorazione: erano
     cinque coppie meno/piu' tutte uguali, e senza leggere l'etichetta
     minuscola in mezzo non si sapeva quale muovesse cosa. */
  const mkCella = (emoji, key, step, nome) => {
    const box = el('div', 'e-cella');
    if (nome) box.appendChild(el('span', 'e-nome', nome));
    const dentro = el('span', 'e-dentro-cella');
    const minus = el('button');
    minus.textContent = step > 1 ? '\u2212' + step : '\u2212';
    const kk = emoji ? el('span', 'k', emoji) : null;
    const val = el('span', 'v num', '0');
    const plus = el('button');
    plus.textContent = step > 1 ? '+' + step : '+';
    const bump = (d) => (ev) => {
      ev.stopPropagation();
      /* quello che va fatto a cose finite, da qualunque strada si arrivi:
         anche dal foglio dello sforo, che risponde piu' tardi */
      const chiudiIlGiro = () => { saveEntries(); syncCard(entry); tick(); };
      /* passano dal conto anche questi: cambiare i bambini qui e non di
         la' voleva dire lasciare le righe pagate scollegate dai soldi */
      const voce = key === 'children' ? 'bimbi' : key === 'crazyJumping' ? 'crazy' : null;
      /* IL CRAZY SI CONTA DENTRO UN GIRO, qui come dappertutto: il piu'
         e il meno muovono la volta aperta adesso, e se non ce n'e'
         ancora una la aprono. Senza, il numero saliva ma i minuti
         regalati non arrivavano -- quelli li porta il giro. */
      if (voce === 'crazy') {
        conConto(entry, () => {
          if (!giriCrazy(entry).length) giroNuovo(entry);
          cambiaGiro(entry, giroOra(entry), d);
        });
      } else if (voce) conConto(entry, () => bcSetQ(voce, clamp(num(entry[key], 0) + d, 0, 99999)));
      /* IL TEMPO PASSA DA UN POSTO SOLO. Scritto qui a mano, il meno
         portava indietro i minuti ma lasciava in piedi le mezz'ore
         gia' vendute: trenta minuti sull'orologio costavano diciotto
         euro se il meno lo avevi toccato qui, quattordici se lo avevi
         toccato nel pannello. `ritoccaTempo` e' l'unico che sa che un
         ritocco entra nell'ultima vendita invece di aggiungersene una
         nuova -- ed e' gia' quello che usa il pannello. */
      else if (key === 'durationMinutes') {
        /* IL FOGLIO DELLO SFORO RISPONDE DOPO, e questo cambia tutto:
           salvare e ridisegnare qui sotto voleva dire farlo PRIMA che la
           scelta fosse fatta -- il tempo cambiava e la scheda non lo
           diceva, e al ricaricamento non c'era piu'. Quello che va fatto
           dopo si porta dentro, e da qui si esce. */
        conConto(entry, () => {
          const fatto = () => { ritoccaTempo(entry, d); chiudiIlGiro(); };
          if (d > 0) conSforo(entry, fatto); else fatto();
        });
        return;
      }
      else entry[key] = clamp(num(entry[key], 0) + d, 0, 99999);
      chiudiIlGiro();
    };
    minus.onclick = bump(-step);
    plus.onclick = bump(step);
    dentro.appendChild(minus);
    if (kk) dentro.appendChild(kk);
    dentro.appendChild(val);
    dentro.appendChild(plus);
    box.appendChild(dentro);
    fila.appendChild(box);
    return { box, val, minus, plus };
  };
  /* TRE GRUPPI, NON CINQUE. Quello che facevano gli altri due -- segnare
     il pagato, aprire e cancellare i giri -- adesso si fa nello
     Scontrino, dove ogni riga ha il suo posto e la sua scritta. Qui
     restano le tre cose che si fanno al volo con una mano sola: arriva
     un altro bambino, restano cinque minuti in piu', hanno fatto un
     altro giro. */
  const sKids = mkCella('\ud83e\uddd2', 'children', 1, 'Bambini');
  const sTime = mkCella(null, 'durationMinutes', 5, 'Tempo');

  /* BAMBINI SOPRA, TEMPO SOTTO, IN UNA COLONNA SOLA.
     Affiancate si prendevano 275 pixel di larghezza per stare alte
     cinquanta, e accanto alla card del Crazy -- che ne e' alta
     centosettanta -- restavano due pastiglie schiacciate in cima con un
     buco sotto. In colonna occupano lo spazio di una card: la stessa
     altezza, la meta' della larghezza, e dentro ci sta il doppio -- il
     numero piu' grande e i tasti piu' larghi, che al banco si premono
     con una mano sola mentre si guarda altro.
     `appendChild` li SPOSTA: `mkCella` li aveva gia' messi nella fila,
     e da qui in poi la fila ne vede uno solo al loro posto. */
  const colonna = el('div', 'e-colonna');
  colonna.appendChild(sKids.box);
  colonna.appendChild(sTime.box);
  fila.appendChild(colonna);

  /* LA RIGA CHE NOMINA IL NUMERO STA SUBITO SOTTO IL NUMERO, non in
     fondo alla cella: attaccata all'interruttore sembrava l'etichetta
     di quello, e una parola che nomina la cosa sbagliata e' peggio di
     nessuna parola. Vuota e nascosta con la grafica di sempre. */
  const sottoTempo = el('div', 'e-sotto hidden');
  sTime.box.appendChild(sottoTempo);
  sTime.sotto = sottoTempo;

  /* DA TEMPO COMPRATO A TEMPO APERTO, DA QUI.
     Nel pannello c'e' la pastiglia «Tempo aperto» fra i tagli, ma in
     una scheda gia' registrata quella e' proprio la cosa che capita di
     dover cambiare al volo -- «no aspetta, non sappiamo quando escono»
     -- e per farlo bisognava aprire Modifica e cercarla fra i tagli.
     Qui e' un interruttore attaccato al meno e al piu' del tempo, cioe'
     accanto alla cosa che spegne. */
  const apri = el('button', 'e-aperto');
  apri.onclick = (ev) => {
    ev.stopPropagation();
    entry.payLater = !entry.payLater;
    /* uscendo dal tempo aperto l'orologio della pausa non ha piu' un
       posto dove farsi vedere: si chiude, e il tempo gia' stato fermi
       resta contato per quando lo si riapre */
    if (!entry.payLater) chiudiPausa(entry);
    /* I BLOCCHI DI TEMPO GIA' VENDUTI RESTANO DOVE SONO.
       A tempo aperto `costOf` non li guarda nemmeno -- li' il conto si
       fa sul tempo passato -- quindi tenerli non costa niente. Buttarli
       invece si vedeva: un'ora con dentro una mezz'ora venduta a parte
       vale 28 euro, e chi apriva il tempo per sbaglio e lo richiudeva
       se la ritrovava a 24. Quattro euro persi da un tocco andato
       storto, e nessuno che lo dicesse. */
    saveEntries();
    syncCard(entry);
    tick();
    if (PAN.ingresso === entry) aggiornaPannello();
  };
  sTime.box.appendChild(apri);
  sTime.apri = apri;

  /* IL CRAZY E' LA CARD VERA, LA STESSA DI «+ NUOVO».
     Qui c'era una gestione sua -- due tasti «Aggiungi giro» e «Modifica
     giro» e un riquadro che si apriva sotto -- che faceva le stesse cose
     con un'altra faccia e un'altra logica. Due strade per la stessa
     cosa: divergono alla prima modifica, ed erano gia' divergenti.
     Adesso e' `bcCard('crazy')` col suo storico accanto, disegnata dalla
     STESSA funzione del pannello e coi tocchi della STESSA funzione
     (`toccoCrazy`): non possono comportarsi in modo diverso. */
  const crazyBox = el('div', 'bc-griglia e-crazycard');
  fila.appendChild(crazyBox);

  const disegnaCrazy = () => {
    crazyBox.innerHTML = conConto(entry, () => bcCard(bcVoce('crazy'), true));
  };

  crazyBox.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    ev.stopPropagation();
    const esito = conConto(entry, () => toccoCrazy(b.dataset));
    if (!esito) return;
    if (esito !== 'scelta') { saveEntries(); syncCard(entry); tick(); }
    disegnaCrazy();
  };

  /* LA PAUSA, AL POSTO DEL MENO E DEL PIU'.
     A tempo aperto non c'e' nessuna durata da allungare o accorciare,
     quindi il meno e il piu' li' non vogliono dire niente. Ma la cella
     veniva NASCOSTA tutta intera -- e dentro c'era anche
     l'interruttore \u00abTempo aperto\u00bb, cioe' l'unico modo di tornare
     indietro: da una scheda a tempo aperto non si poteva piu' ne'
     toccare il tempo ne' richiuderlo, e restava li' una targhetta che
     non faceva niente.
     Adesso la cella resta, l'interruttore resta raggiungibile, e al
     posto dei due tasti c'e' quello che serve davvero a tempo aperto:
     fermare l'orologio quando escono a mangiare. */
  const pausa = el('button', 'e-pausa');
  pausa.onclick = (ev) => {
    ev.stopPropagation();
    commutaPausa(entry);
    saveEntries();
    syncCard(entry);
    tick();
    if (PAN.ingresso === entry) aggiornaPannello();
  };
  sTime.box.appendChild(pausa);
  sTime.pausa = pausa;

  /* CHE COS'E' VA SCRITTO. Grigia e senza conto alla rovescia si capiva
     che era un'altra cosa, ma non QUALE: chi la trova in cima alla lista
     deve leggere in due parole che e' un Solo BAR e che se ne
     va da sola. */
  if (entry.soloBar) {
    const t = el('div', 'e-bar-tag');
    t.innerHTML = '<b>\ud83e\uddfe Solo BAR</b><span>nessuno al parco \u00b7 va in archivio da s\u00e9</span>';
    fila.appendChild(t);
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
  disegnaCrazy();

  /* Il guscio del conto: qui dentro ci entra IL pannello -- lo stesso
     di "+ Nuovo" -- spostato di peso. Prima c'erano due strade per la
     stessa cosa (la matita che riapriva il modulo, e il conto a
     pastiglie qui dentro) e bastava toccarne una per farle divergere. */
  /* NON chiamarlo "e-conto": quella classe e' gia' presa dal riquadro
     del conto alla rovescia nella riga della scheda, largo 116px fissi,
     e il pannello ci finiva dentro strizzato a un dito */
  const payPanel = el('div', 'e-panel e-guscio hidden');
  dentro.appendChild(payPanel);

  /* i due tasti che aprono il conto: si accendono e si spengono
     insieme, perche' aprono la stessa cosa da due porte diverse */
  const tastiConto = [];
  /* Apre (o chiude) il conto. Ci passano sia il tasto sia la figura:
     una strada sola, cosi' non possono comportarsi in modo diverso. */
  const apriConto = (cat) => {
    /* mentre una scheda sta volando i tocchi non contano: vedi
       occupaVolo */
    if (voloOccupato) return;
    /* GIA' APERTO, MA SU UN'ALTRA LINGUETTA: si cambia linguetta e
       basta. Se no i tre tasti si comportavano come uno solo -- il
       secondo che toccavi RICHIUDEVA il conto invece di portarti dove
       diceva -- e per passare dal Parco al bancone servivano due
       tocchi al buio. Toccare due volte lo stesso tasto invece chiude,
       che e' come si e' sempre chiuso. */
    if (!payPanel.classList.contains('hidden') && PAN.ingresso === entry &&
        cat && PAN.cat !== cat) {
      PAN.cat = cat;
      aggiornaPannello({ entra: true });
      return;
    }
    /* la misura va presa ADESSO, prima che il pannello si apra: se la
       prendo dopo, il buco lasciato nella lista e' troppo corto e tutte
       le schede sotto saltano su */
    const misura = card.getBoundingClientRect();
    const chiuso = payPanel.classList.contains('hidden');
    chiudiPannelli(entry.id);
    payPanel.classList.toggle('hidden', !chiuso);
    tastiConto.forEach(b => b.classList.toggle('on', chiuso));
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
  /* TRE TASTI CHE DICONO DOVE PORTANO. Prima ce n'era uno solo, «Bar
     & Conto», e apriva sempre il bancone: per vestire una persona o
     correggere l'orario si apriva e si cambiava linguetta, ogni volta.
     Sono la stessa strada di prima -- `apriConto(cat)` -- con la
     linguetta gia' scelta. */
  /* GRAFICA 2.0: SI CHIAMA COL NOME DEL POSTO DOVE PORTA.
     Il tasto diceva \u00abModifica\u00bb e apriva una schermata che si chiama
     \u00abParco\u00bb -- mentre i due tasti accanto, \u00abBar\u00bb e \u00abScontrino\u00bb, il nome
     della loro linguetta ce l'hanno giusto. Uno stesso posto con due
     nomi si paga a ogni tocco, e \u00abModifica\u00bb per giunta non dice
     modificare COSA. */
  const payBtn = mkAct(settings.grafica2 ? '\ud83c\udfa1 Parco' : '\u270f\ufe0f Modifica', 'conto', (ev) => {
    ev.stopPropagation();
    apriConto('Parco');
  });
  payBtn.title = 'Orario, bracciale, tempo, chi accompagna';

  const barBtn = mkAct('\ud83e\udd64 Bar', 'conto', (ev) => {
    ev.stopPropagation();
    apriConto(primaCategoriaBar());
  });
  barBtn.title = 'Da bere, da mangiare, il conto';

  /* e la terza linguetta: cosi' da fuori si arriva a tutte e tre senza
     dover entrare da un'altra parte e poi cambiare */
  const scBtn = mkAct('\ud83e\uddfe Scontrino', 'conto', (ev) => {
    ev.stopPropagation();
    apriConto('Scontrino');
  });
  scBtn.title = 'Tutto il conto in fila: cosa resta da pagare';

  tastiConto.push(payBtn, barBtn, scBtn);

  /* PAGA TUTTO, DA QUI. Per incassare bisognava aprire il conto, andare
     nello Scontrino e premere il tasto la' dentro: tre tocchi e un
     pannello che si apre, per la cosa piu' frequente che succede a una
     scheda di chi sta uscendo. Il tasto dice la cifra, cosi' non serve
     nemmeno aprire per sapere quanto e'.
     Compare SOLO se c'e' qualcosa da incassare: a conto saldato non e'
     un tasto spento, non c'e' proprio -- se no la riga dei comandi si
     riempie di roba da non toccare. */
  const pagaBtn = mkAct('', 'conto paga', (ev) => {
    ev.stopPropagation();
    const foto = fotografia(entry);
    const prima = r2(num(entry.paidPark, 0) + num(entry.paidBar, 0));
    conConto(entry, () => pagaTutto());
    saveEntries();
    syncCard(entry);
    /* se il pannello di questo ingresso e' aperto, deve dirlo anche lui */
    if (PAN.ingresso === entry) aggiornaPannello();
    const entrati = r2(r2(num(entry.paidPark, 0) + num(entry.paidBar, 0)) - prima);
    if (entrati > 0.005) {
      fatto('Incassati ' + eur(entrati), () => {
        rimetti(entry, foto);
        saveEntries();
        syncCard(entry);
        if (PAN.ingresso === entry) aggiornaPannello();
        toast('Incasso annullato \u21a9\ufe0e');
      });
    }
  });
  pagaBtn.title = 'Segna come pagato tutto quello che resta';
  /* la cifra si rinfresca insieme al resto della scheda: vedi syncCard */
  aggiornaPaga(pagaBtn, entry);

  mkAct('\ud83d\udeaa Uscita', 'forte', (ev) => { ev.stopPropagation(); chiudiIngresso(entry); });


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
    card, count, range, sKids, sTime, solo, barBtn, scBtn, apriConto, disegnaCrazy,
    dueVal: soldiV, soldiK, soldiS, soldi, wrist, bimbiV, crzV, crz, countK, countS,
    payPanel, payBtn, pagaBtn, disegnaNota,
    /* servono a rivestire la riga quando cambia un vestito */
    avBox, nome, tratti, apriParco, sigGente: firmaGente(entry)
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
/* La faccia del tasto «Paga tutto» della scheda: dice la cifra, e a
   conto saldato non c'e'. Sta fuori dal disegno cosi' la usano sia chi
   crea la scheda sia syncCard, e non possono dire cose diverse. */
function aggiornaPaga(btn, entry) {
  if (!btn) return;
  const resta = dueOf(entry).total;
  btn.classList.toggle('hidden', !(resta > 0.005));
  if (resta > 0.005) btn.textContent = '\u2705 Paga ' + eur(resta);
}

/* CHI SALE ADESSO. Il piu' e il meno della card del Crazy muovono il
   giro APERTO, non un totale: se non ce n'e' ancora uno lo aprono. Senza
   il giro, i minuti regalati non arrivano -- quelli li porta il giro. */
function contaSalita(d) {
  const c = C();
  const prima = minutiCrazy(c);
  const finePrima = endTimeOf(c);
  if (!giriCrazy(c).length) giroNuovo(c);
  cambiaGiro(c, giroOra(c), d);
  if (minutiCrazy(c) > prima) regalaDaAdesso(c, finePrima);
}

/* IL REGALO DI UN GIRO PARTE DA QUANDO IL GIRO SI FA, se il tempo era
   gia' finito. Se invece sono ancora dentro non serve: li' i minuti si
   sommano in fondo come hanno sempre fatto.
   `finePrima` E' L'ORA DI USCITA DI PRIMA, e va passata: guardando
   quella di ADESSO -- col giro gia' contato -- uno sforo piccolo era
   gia' stato ricoperto dagli otto minuti appena aggiunti, la fine
   risultava nel futuro e il regalo non partiva. Risultato: sforati da
   tre minuti ne ricevevano cinque invece di otto. Lo sforo si mangiava
   il regalo, che e' esattamente quello che il regalo doveva impedire. */
function regalaDaAdesso(c, finePrima) {
  c = c || C();
  const extra = clamp(num(settings.crazyExtraMinutes, 0), 0, 1e6);
  if (extra <= 0) return;
  const ora = Date.now();
  if (num(finePrima, ora + 1) > ora) return;
  /* IN SU al taglio da cinque: arrotondando per difetto un regalo di
     otto minuti ne sarebbe diventato uno di cinque, e i minuti promessi
     non si accorciano. */
  c.regaloFinoA = Math.max(num(c.regaloFinoA, 0), su5(ora + extra * 60000));
}

/* I TOCCHI DELLA CARD DEL CRAZY, IN UN POSTO SOLO.
   Li usano il pannello e la scheda di chi e' gia' dentro: essendo la
   stessa funzione non possono comportarsi in modo diverso nei due
   posti -- ed e' successo, quando la striscia della scheda aveva una
   gestione sua. Lavora su C(): chi chiama lo punta dove serve con
   conConto(). Torna 'scelta' quando ha solo cambiato giro selezionato
   (non c'e' niente da salvare), true se ha toccato i dati, false se il
   tocco non era suo. */
function toccoCrazy(d) {
  /* TUTTE le strade che aggiungono minuti di Crazy devono regalarli da
     adesso se il tempo era finito: il piu' della card, il piu' di un
     giro preciso nello storico, l'apertura di un giro nuovo. Basta che
     una se ne dimentichi e a quel gruppo il regalo se lo mangia lo
     sforo -- ed e' successo. */
  const c0 = C();
  const finePrima = endTimeOf(c0);
  const crazyPrima = minutiCrazy(c0);
  const regala = () => { if (minutiCrazy(C()) > crazyPrima) regalaDaAdesso(C(), finePrima); };
  if (d.giro !== undefined) { tocchi.id = 'crazy'; giroNuovo(C()); regala(); return true; }
  /* il piu' e il meno di UNA volta precisa: nello storico e nello
     scontrino ogni riga ha i suoi, e non c'e' un giro "scelto" da
     tenere a mente */
  if (d.gpiu !== undefined || d.gmeno !== undefined) {
    tocchi.id = 'crazy';
    const su = d.gpiu !== undefined;
    cambiaGiro(C(), parseInt(su ? d.gpiu : d.gmeno, 10), su ? 1 : -1);
    regala();
    return true;
  }
  /* cancella un giro intero: chi c'era dentro esce dal conto */
  if (d.gvia !== undefined) { tocchi.id = 'crazy'; viaGiro(C(), parseInt(d.gvia, 10)); return true; }
  /* si tocca un giro nello storico: da li' in poi il piu' e il meno
     della card lavorano su QUELLO. E' il modo di correggere un giro
     vecchio senza avere due file di tasti a video. */
  if (d.sel !== undefined) { giroScelto = parseInt(d.sel, 10); tocchi.id = 'crazy'; return 'scelta'; }
  if (d.add === 'crazy' || d.meno === 'crazy') {
    tocchi.id = 'crazy';
    contaSalita(d.add !== undefined ? 1 : -1);
    return true;
  }
  if (d.ppiu === 'crazy') { tocchi.id = 'crazy'; segnaPagate('crazy', bcPag('crazy') + 1); return true; }
  if (d.pmeno === 'crazy') { tocchi.id = 'crazy'; segnaPagate('crazy', bcPag('crazy') - 1); return true; }
  return false;
}

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
  /* il piu' e il meno della card lavorano sul giro APERTO: chi sale
     adesso sale con quelli di adesso, non apre un giro suo */
  else if (id === 'crazy') metteCrazy(c, n);
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
  if (id === 'bimbi' || id === 'crazy') soloCrazy(c);
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

/* le categorie: il Parco davanti, poi quelle vere del menu */
/* DUE LINGUETTE, NON SEI.
   Prima ce n'era una per categoria -- Bevande, Snack, Birre, Alcolici
   -- e per due birre e un caffe' bisognava cambiare linguetta tre
   volte, ogni volta con la griglia che si ridisegnava. Le categorie
   non sono posti diversi: sono scaffali dello stesso bancone.
   Adesso il bancone e' uno solo e le categorie sono titoletti dentro,
   in una lista che scorre. */
/* TRE LINGUETTE. Parco e Bar sono i due banconi dove si SEGNA quello
   che il gruppo prende; lo Scontrino e' dove si guarda quello che ha
   preso e si dice cosa ha pagato. Sono due mestieri diversi, e finche'
   stavano insieme il secondo si faceva scorrendo avanti e indietro
   fra le card, contando le pastiglie verdi a mente. */
function bcCategorie() { return ['Parco', 'Bar', 'Scontrino']; }

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

/* ══════════════════════════════════════════════════════════
   LO SCONTRINO
   Quello che il gruppo ha preso, tutto in una lista, e accanto a ogni
   riga cosa e' gia' pagato. Nei due banconi la stessa cosa si legge
   scorrendo le card e contando le pastiglie verdi a mente -- e col
   gruppo davanti che paga «solo le bibite» o «solo il mio bambino»
   quel conto lo si sbaglia.
   Qui si segna una RIGA (le due frecce, o la spunta per tutta), un
   GIRO di Crazy, o un REPARTO intero. Il tempo di parco non e' una
   riga a parte: e' quello che comprano i bambini, ed e' scritto sulla
   loro riga -- quanti minuti e fin quando sono coperti.
   ══════════════════════════════════════════════════════════ */
function scontrinoVoci(c) {
  const out = [];
  if (bcQ('bimbi') > 0) out.push({ id: 'bimbi', dove: 'parco' });
  if (bcQ('crazy') > 0) out.push({ id: 'crazy', dove: 'parco' });
  lista(c.barItems).forEach(bi => {
    if (clamp(bi.qty, 0, 9999) > 0) out.push({ id: bi.id, dove: 'bar' });
  });
  return out;
}

/* i soldi di un reparto: quanto vale, quanto e' entrato */
function scontrinoConti(c, dove) {
  const d = dueOf(c);
  return dove === 'parco'
    ? { vale: d.park, preso: Math.min(d.paidPark, d.park), resta: d.parkDue }
    : { vale: d.bar, preso: Math.min(d.paidBar, d.bar), resta: d.barDue };
}

/* la riga aperta adesso: una sola per volta, come le card del bar */
let scAperta = null;

/* UNA RIGA DELLO SCONTRINO, a riposo: quanti, cosa, quanto.
   Niente comandi finche' non la si tocca. */
function scontrinoRiga(c, id) {
  const v = bcVoce(id) || { id: id, name: id, em: '\u2022' };
  const q = bcQ(id), pg = bcPag(id);
  /* SALDATA VUOL DIRE CHE SONO ENTRATI I SOLDI, non che sono spuntate
     le teste. Le due cose sembrano la stessa finche' il prezzo non
     cambia sotto: si pagano due bambini per mezz'ora, poi si allunga
     di mezz'ora e il prezzo raddoppia -- le teste restano due su due,
     ma meta' del conto non e' entrata. La riga restava verde e col
     gruppo davanti si diceva «ha gia' pagato». */
  const tot = totaleRiga(id), preso = importoRiga(id);
  const saldo = tot > 0 && preso + 0.005 >= tot;
  const resta = Math.max(0, r2(tot - preso));
  const aperta = scAperta === id;

  /* la riga sotto il nome dice la cosa che serve sapere di QUELLA voce:
     del tempo fin quando, del Crazy in quante volte, del bar quanto
     costa l'una */
  let sotto = '';
  if (id === 'bimbi') {
    const blocchi = lista(c.aggiunte).map(m => Math.max(0, Math.round(num(m, 0)))).filter(m => m > 0);
    const pezzi = blocchi.length
      ? (() => {
          const somma = blocchi.reduce((a2, b2) => a2 + b2, 0);
          const iniz = Math.max(0, clamp(num(c.durationMinutes, 0), 0, 1e6) - somma);
          return [iniz].concat(blocchi).filter(m => m > 0).map(m => fmtMin(m)).join(' + ') + ' \u00b7 ';
        })()
      : '';
    /* a tempo aperto i minuti comprati sono zero -- non hanno comprato
       niente, pagano quello che stanno -- e scrivere «0m · tempo
       aperto» diceva il falso due volte. Qui va il conto per intero,
       che e' quello che serve a chi sta per incassare. */
    sotto = c.payLater
      ? '\u23f3 tempo aperto \u00b7 ' + spiegaAperto(c, false)
      : pezzi + fmtMin(tempoTotale(c)) + ' \u00b7 esce alle ' + fmtTime(endTimeOf(c));
  } else if (id === 'crazy') {
    const volte = turniCrazy(c);
    sotto = volte + (volte === 1 ? ' volta' : ' volte') +
      (minutiCrazy(c) > 0 ? ' \u00b7 +' + minutiCrazy(c) + '\u2032 regalati' : '');
  } else {
    sotto = eur(prezzoUnita(id)) + ' l\u2019uno';
  }

  /* il bollino del pagato: la spunta se e' a posto, QUANTO MANCA se e'
     entrato qualcosa ma non tutto -- che e' la cosa che serve sapere,
     piu' di «due su due» -- niente se non ha pagato nessuno */
  const bollo = saldo ? '<span class="sc-ok">\u2713</span>'
    : preso > 0 ? '<span class="sc-meta">restano ' + eur(resta) + '</span>' : '';

  /* I TRE TASTI CHE SI USANO SEMPRE, sulla riga: una in piu', una in
     meno, pagata. Al bar sono il gesto di tutti i giorni -- venti
     volte a sera -- e farli passare da «apri, tocca, richiudi» e' tre
     gesti per uno. Nel cassetto resta quello che si fa di rado:
     pagare a meta', il tempo, le volte del Crazy. */
  const avanti = id === 'bimbi' && !!c.payLater;
  return '<div class="sc-voce' + (aperta ? ' aperta' : '') + (saldo ? ' saldata' : '') + '">' +
    '<div class="sc-linea">' +
      '<button class="sc-riga" data-scapri="' + esc(id) + '">' +
        '<span class="sc-n">' + q + '</span>' +
        '<span class="sc-em">' + iconaBar(v.name, v.em) + '</span>' +
        '<span class="sc-txt"><b>' + esc(v.name) + '</b><span>' + sotto + '</span></span>' +
        bollo +
        '<span class="sc-eu">' + eur(tot) + '</span>' +
        '<span class="sc-frec">' + (aperta ? '\u2303' : '\u2304') + '</span>' +
      '</button>' +
      '<span class="sc-veloci">' +
        '<button data-scmq="' + esc(id) + '"' + (q <= 0 ? ' disabled' : '') +
          ' aria-label="uno in meno">\u2212</button>' +
        '<button data-scpq="' + esc(id) + '" aria-label="uno in piu\u2019">+</button>' +
        '<button class="sc-sp' + (saldo ? ' on' : '') + '" data-sctutta="' + esc(id) + '"' +
          (avanti ? ' disabled' : '') + ' aria-label="' + (saldo ? 'togli il pagato' : 'segna pagata') +
          '">\u2713</button>' +
      '</span>' +
    '</div>' +
    (aperta ? scontrinoComandi(c, id, q, pg) : '') +
  '</div>';
}

/* I COMANDI DI UNA RIGA, quando la si apre.
   Bianco quello che si toglie e si aggiunge, verde quello che si
   paga: gli stessi due colori delle card del bar. */
function scontrinoComandi(c, id, q, pg) {
  const avanti = id === 'bimbi' && !!c.payLater;
  const tot = totaleRiga(id), preso = importoRiga(id);
  const saldo = tot > 0 && preso + 0.005 >= tot;
  /* nel cassetto ci va quello che si fa di RADO: pagare a meta'. Il
     meno, il piu' e la spunta stanno sulla riga, dove servono. */
  let out = '<div class="sc-apri"><div class="sc-comandi">' +
    '<span class="sc-gr verde"><i>' +
      (id === 'bimbi' ? 'bambini pagati' : id === 'crazy' ? 'giri pagati' : 'pagate') + '</i>' +
      '<button data-scmeno="' + esc(id) + '"' + (pg <= 0 ? ' disabled' : '') + '>\u2212</button>' +
      '<b>' + pg + '/' + q + '</b>' +
      '<button data-scpiu="' + esc(id) + '"' + (pg >= q || avanti ? ' disabled' : '') + '>+</button></span>' +
    '<button class="sc-tutta" data-sctutta="' + esc(id) + '"' + (avanti ? ' disabled' : '') + '>' +
      (saldo ? '\u21a9\ufe0e togli' : '\u2713 paga ' + eur(Math.max(0, r2(tot - preso)))) +
      '</button></div>';

  /* IL TEMPO CHE RESTA, E QUANTO COSTA TENERLI ANCORA: sotto la riga
     dei bambini, perche' il tempo e' quello che comprano loro. Solo su
     chi e' gia' dentro -- mentre lo registri il tempo si sceglie coi
     tagli. */
  if (id === 'bimbi' && PAN.ingresso) {
    const aperto = !!c.payLater;
    const manca = endTimeOf(c) - Date.now();
    const corti = clamp(num(c.durationMinutes, 60), 0, 1e6);
    out += '<div class="sc-tempo">' +
      '<span class="sc-t-k' + (!aperto && manca <= 0 ? ' scaduto' : '') + '">' +
        (aperto ? '\u23f3 tempo aperto'
          : manca > 0 ? '\u23f1\ufe0f restano ' + fmtDur(manca)
          : '\u23f1\ufe0f scaduto da ' + fmtDur(-manca)) + '</span>' +
      '<span class="sc-t-cinque">' +
        '<button data-a="corr" data-v="-5"' + (aperto || corti <= minimoTempo(c) ? ' disabled' : '') +
          '>\u2212 5m</button>' +
        '<button data-a="corr" data-v="5"' + (aperto ? ' disabled' : '') + '>+ 5m</button>' +
      '</span>' +
      ESTENDI_TAGLI.map(m => {
        const costo = aperto ? 0 : costoEstensione(c, m);
        return '<button class="sc-t-b" data-a="est" data-v="' + m + '"' +
          (aperto ? ' disabled' : '') + '><b>+' + fmtMin(m) + '</b><i>' +
          (aperto ? '\u2014' : costo > 0 ? '+' + eur(costo) : 'gratis') + '</i></button>';
      }).join('') +
      '</div>';
  }

  /* LE VOLTE DEL CRAZY, una riga per una: quanti sono saliti, se e'
     pagata, e la crocetta per buttarla via. */
  if (id === 'crazy') {
    const g = giriCrazy(c);
    out += '<div class="sc-giri">' + g.map((n, i) => {
      const pagate = pagateDelGiro(c, i);
      const saldo = n > 0 && pagate >= n;
      return '<div class="sc-g-riga' + (saldo ? ' saldata' : '') + '">' +
        '<span class="sc-g-n">' + (i + 1) + '\u00ba</span>' +
        '<span class="sc-g-q">' +
          '<button data-gmeno="' + i + '">\u2212</button><b>' + n + '</b>' +
          '<button data-gpiu="' + i + '">+</button></span>' +
        '<span class="sc-g-k">' + (n === 1 ? 'giro' : 'giri') + '</span>' +
        '<button class="sc-g-paga' + (saldo ? ' on' : (pagate > 0 ? ' meta' : '')) +
          '" data-scgiro="' + i + '">' +
          (saldo ? '\u2713 pagato' : pagate > 0 ? pagate + '/' + n + ' pagati' : 'da pagare') +
        '</button>' +
        '<button class="sc-g-via" data-gvia="' + i + '" aria-label="cancella">\u2715</button>' +
      '</div>';
    }).join('') +
      '<button class="sc-g-nuovo" data-giro="1">+ giro</button></div>';
  }
  return out + '</div>';
}

function disegnaScontrino(p, c) {
  const box = p.querySelector('.pc-scontrino');
  if (!box) return;
  const voci = scontrinoVoci(c);
  if (!voci.length) {
    box.innerHTML = '<div class="sc-vuoto"><span class="em">\ud83e\uddfe</span>' +
      'Niente sul conto.<br>Segna quello che prendono da <b>Parco</b> e <b>Bar</b>: ' +
      'qui torna tutto in fila.</div>';
    return;
  }
  /* la sigla in cima: lo scontrino si legge accanto al gruppo, ed e' il
     codice che dice a quale */
  const sg = String((c && c.sigla) || '');
  const testa = sg ? '<div class="sc-sigla"><span>gruppo</span><b>' + esc(sg) + '</b></div>' : '';
  const reparto = (dove, nome) => {
    const righe = voci.filter(v => v.dove === dove);
    if (!righe.length) return '';
    const k = scontrinoConti(c, dove);
    const tutto = k.resta <= 0.005 && k.vale > 0.005;
    return '<div class="sc-testa"><span class="sc-k">' + nome + '</span>' +
      '<span class="sc-tot">' + eur(k.vale) + '</span>' +
      '<button class="sc-rep' + (tutto ? ' on' : '') + '" data-screparto="' + dove + '">' +
      (tutto ? '\u21a9\ufe0e togli le spunte' : '\u2713 paga tutto') + '</button></div>' +
      righe.map(v => scontrinoRiga(c, v.id)).join('');
  };
  const d = dueOf(c);
  box.innerHTML =
    '<div class="sc-somma">' +
      '<span><i>conto</i><b>' + eur(r2(d.park + d.bar)) + '</b></span>' +
      '<span class="preso"><i>gi\u00e0 presi</i><b>' + eur(r2(d.paidPark + d.paidBar)) + '</b></span>' +
      '<span class="' + (d.total > 0.005 ? 'resta' : 'ok') + '"><i>' +
        (d.total > 0.005 ? 'restano' : 'saldato') + '</i><b>' + eur(d.total) + '</b></span>' +
    '</div>' +
    testa + reparto('parco', 'Parco') + reparto('bar', 'Bar');
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
  /* LA CARD DEL CRAZY STA SEMPRE APERTA sui giri, anche a zero: il
     tasto "+ giro" e' li' pronto e si vede subito che quella card
     lavora a giri. Comparendo solo dopo la prima salita, la card
     cambiava forma sotto le dita a meta' lavoro. */
  return '<div class="bc-card' + (v.id === 'crazy' ? ' con-storico' : '') +
    (saldata ? ' saldata' : (q ? ' presa' : '')) +
    (tocchi.id === v.id ? ' tocca' : '') +
    (tocchi.nato === v.id ? ' nato' : '') +
    '" data-id="' + v.id + '">' +
    /* LA CARD DEL CRAZY E' LA STESSA DELLE ALTRE: tutta quanta -- la
       testa e le due file -- sta in una colonna sua, e le si mette
       ACCANTO lo storico dei giri. Cosi' dentro non cambia niente. */
    (v.id === 'crazy' ? '<div class="bc-lato">' : '') +
    '<button class="bc-su" data-add="' + v.id + '">' +
      (q > 0 ? '<span class="bc-fant">' + q + '</span>' : '') +
      iconaBar(v.name, v.em) +
      /* I GIRI STANNO SULLA RIGA DEL PREZZO, non sotto il nome: una
         riga in piu' faceva crescere la card di undici pixel, e nella
         scheda che vola col guardaroba aperto quegli undici pixel
         facevano comparire la barra di scorrimento. Qui non costano
         niente: la riga del prezzo era mezza vuota. */
      '<span class="bc-testi"><span class="bc-pr">' + eur(v.price) +
          (v.id === 'crazy' && q > 0 ? '<i class="bc-gi">' + bcGiriTesto() + '</i>' : '') +
      '</span>' +
      '<span class="bc-nm">' + esc(v.name) + '</span></span></button>' +
    (aperta
      /* IL NUMERO E' QUELLO DEL GIRO CHE SI STA SEGNANDO, non il totale
         di tutti i giri: sono il piu' e il meno qui accanto a muoverlo,
         e aprendo un giro nuovo riparte da zero. Il totale delle salite
         sta scritto sopra, sulla riga del prezzo. */
      ? '<div class="bc-zone"><span class="bc-chip">' + (v.id === 'crazy' ? quantiOra() : q) + '</span>' +
        '<button data-meno="' + v.id + '"' +
          ((v.id === 'crazy' ? quantiOra() : q) <= 0 ? ' disabled' : '') + '>\u2212</button>' +
        '<button data-add="' + v.id + '">+</button></div>' +
        '<div class="bc-zone v"><span class="bc-chip">' + pg + '/' + q + '</span>' +
        '<button data-pmeno="' + v.id + '"' + (pg <= 0 ? ' disabled' : '') + '>\u2212</button>' +
        '<button data-ppiu="' + v.id + '"' + (pg >= q ? ' disabled' : '') + '>+</button></div>'
      : '') +
    (v.id === 'crazy' ? '</div>' + storicoGiri() : '') +
  '</div>';
}

/* LO STORICO DEI GIRI, a destra della card.
   Una pastiglia per giro, col numero di chi e' salito quella volta.
   Quella accesa e' il giro che si sta segnando: il piu' e il meno
   della card -- quelli di sempre, non ne servono altri -- lavorano su
   quella. Toccarne un'altra la accende, e cosi' si corregge un giro
   vecchio senza avere due file di tasti a video.
   In fondo il tasto che apre un giro nuovo, e i minuti che tutti i
   giri hanno regalato. */
/* quanti sono saliti nel giro che si sta segnando */
function quantiOra() {
  const g = giriCrazy(C());
  return g.length ? num(g[giroOra()], 0) : 0;
}

function storicoGiri() {
  const c = C();
  const g = giriCrazy(c);
  /* a giri zero la colonna resta, con dentro la sua riga di istruzioni:
     e' li' che si apre il primo, e vederla vuota dice come funziona */
  const vuoto = !g.length;
  const ora = giroOra(c);
  const extra = clamp(num(settings.crazyExtraMinutes, 0), 0, 1e6);
  /* IL DENTRO E' STACCATO DALLA CARD: sta appoggiato sopra la colonna
     (posizione assoluta) e quindi non ha voce in capitolo sull'altezza.
     Senza, al quinto giro la lista tirava la card da 156 a 260 pixel
     invece di scorrere. */
  return '<div class="bc-storico"><div class="st-dentro">' +
    '<div class="st-testa"><span class="st-k">giri</span>' +
      '<span class="st-min">+' + regalatiDi(c) + '′</span></div>' +
    /* UNA RIGA PER GIRO, e scorrono. Con le pastiglie in fila si
       leggeva male gia' al terzo giro; in colonna ogni giro ha la sua
       riga con scritto tutto, e quando sono tanti si scorre -- dentro
       la sua colonna, senza far crescere la card di un pixel. */
    '<div class="st-lista">' +
      (vuoto ? '<span class="st-vuoto">Nessun giro.<br>Tocca <b>+ giro</b> e conta chi sale.</span>' : '') +
      g.map((n, i) => {
        const pg = pagateDelGiro(c, i);
        const saldo = n > 0 && pg >= n;
        return '<span class="st-riga' + (i === ora ? ' on' : '') +
          (saldo ? ' saldato' : (pg > 0 ? ' meta' : '')) + '">' +
        '<button class="st-g" data-sel="' + i + '"' +
        ' aria-label="il ' + (i + 1) + '\u00ba: ' + n + (n === 1 ? ' giro' : ' giri') + '">' +
        '<span class="st-n">' + (i + 1) + 'º</span>' +
        '<b>' + n + '</b>' +
        '<span class="st-q">' + (n === 0 ? 'da contare' : n === 1 ? 'giro' : 'giri') + '</span>' +
        /* QUALI GIRI SONO PAGATI, riga per riga: la spunta se e' a
           posto, "1/2" se e' pagato a meta', "da pagare" se no */
        '<span class="st-p">' + (n === 0 ? ''
          : saldo ? '✓ pagato'
          : pg > 0 ? pg + '/' + n + ' pagate'
          : 'da pagare') + '</span></button>' +
        '<button class="st-via" data-gvia="' + i + '" aria-label="cancella il giro ' + (i + 1) + '">' +
        '✕</button></span>';
      }).join('') +
    '</div>' +
    '<button class="st-piu" data-giro="crazy">+ giro</button>' +
  '</div></div>';
}

/* I GIRI SCRITTI IN BREVE: "3 + 2 · +16′".
   Un numero solo non basterebbe: "cinque salite" non dice se sono
   saliti tutti insieme o in due volte, e sono due ore d'uscita
   diverse. Con tanti giri si riassume, se no la scritta va a capo e la
   card cresce sotto le dita. */
function bcGiriTesto() {
  const c = C();
  const g = giriCrazy(c);
  if (!g.length) return '';
  const min = minutiCrazy(c);
  /* stretto: sta accanto al prezzo, e se va a capo la card cresce.
     Qui il TOTALE -- che sulla fila del piu' e del meno non c'e' piu',
     li' c'e' il giro che si sta segnando -- e quanti giri sono. */
  /* UNA PAROLA SOLA: GIRO. «Salita» al banco non la dice nessuno --
     si chiede «quanti giri hanno fatto?» -- e avere due parole per la
     stessa cosa costringeva a tradurre ogni volta.
     Qui il totale basta: quante VOLTE sono saliti si legge nella
     colonna qui accanto, che li elenca uno per uno. */
  const giri = g.reduce((a, b) => a + b, 0);
  return giri + (giri === 1 ? ' giro' : ' giri');
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
  /* COM'ERA IL BAR PRIMA DELLA MISURA. Rimetterlo a vista d'ufficio
     valeva quando i vani erano due: nascosto il Parco, l'altro era per
     forza il Bar. Con lo Scontrino in mezzo quel "rimetti" accendeva il
     bancone SOPRA lo scontrino -- due schermate una sull'altra. */
  const barEra = bar && bar.classList.contains('hidden');
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


  if (cambio) { parco.classList.add('hidden'); bar.classList.toggle('hidden', barEra); }
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
      spegniConto(rif);
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
  if (rif && rif.payPanel) { rif.payPanel.classList.add('hidden'); spegniConto(rif); }
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

/* I TASTI DEL CONTO SI SPENGONO INSIEME: sono due porte sulla stessa
   stanza -- «Modifica» e «Bar» -- e lasciarne uno acceso a pannello
   chiuso vorrebbe dire raccontare una cosa che non c'e' piu'. */
function spegniConto(r) {
  if (!r) return;
  if (r.payBtn) r.payBtn.classList.remove('on');
  if (r.barBtn) r.barBtn.classList.remove('on');
  if (r.scBtn) r.scBtn.classList.remove('on');
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
/* IL COLORE SOTTO IL DITO.
   Lo zero sta in cima e si gira in senso orario, e la saturazione va da
   zero al centro a piena sul bordo: e' esattamente come il cerchio e'
   DIPINTO in css/app.css (`from 0deg` e il grigio che sfuma fino al
   100%). I due posti vanno cambiati insieme, se no si tocca un colore e
   se ne prende un altro. */
/* `luce` e' il chiaro-scuro scelto a parte, sulla striscia sotto il
   cerchio: il cerchio da' TINTA e intensita', e da solo sa fare solo i
   colori a mezza luce -- un rosso scuro o un azzurro slavato, che sui
   vestiti sono la meta' dei casi, non stavano da nessuna parte.
   Il cerchio si ridipinge alla luce scelta (vedi `.ruota-luce`), quindi
   quello che si vede resta quello che si prende. */
function coloreDelPunto(dx, dy, raggio, luce) {
  const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / raggio);
  let ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;   // 0 in cima, come il disegno
  if (ang < 0) ang += 360;
  const h = Math.round(ang) % 360;
  const s = Math.round(dist * 100);
  return hslInEsa(h, s, luce === undefined || luce === null ? 50 : luce);
}

/* I SETTE PASSI DEL CHIARO-SCURO. Sette perche' e' la stessa fila dei
   grigi, che di questi passi e' il caso senza tinta. Non si arriva a 0
   ne' a 100: li' ogni colore diventa nero o bianco e la fila
   sembrerebbe rotta. */
const LUCI = [12, 25, 37, 50, 63, 78, 90];

/* LA STRADA AL CONTRARIO: dato un colore, dove sta sul cerchio.
   Serve a far ritrovare il segno dove lo si era messo riaprendo la
   ruota: senza, il pallino ripartiva dall'angolo in alto a sinistra e
   il colore scelto sembrava non essere mai stato preso. */
function puntoDelColore(esa) {
  const c = esaInHsl(esa);
  if (!c) return null;
  const rad = (c.h - 90) * Math.PI / 180;
  const d = Math.max(0, Math.min(1, c.s / 100));
  return { dx: Math.cos(rad) * d, dy: Math.sin(rad) * d };
}

/* esadecimale -> tinta, saturazione, luce.
   LA FORMULA E' UNA SOLA e sta in avatar.js, che e' il posto dove i
   colori si guardano: da li' esce anche il NOME del colore, e se la
   ruota ne tenesse una copia sua le due potrebbero divergere — si
   sceglierebbe una tinta e la scheda ne racconterebbe un'altra. */
function esaInHsl(esa) {
  return (typeof AV !== 'undefined' && AV.hsl) ? AV.hsl(esa) : null;
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
  /* IL VELO DEL CHIARO-SCURO. Il cerchio e' dipinto a mezza luce, ed e'
     l'unica luce che sa fare. Sopra ci va un velo nero o bianco, e non
     e' un trucco per fare l'effetto: nero coprente (1 - L/50) da' ESATTAMENTE
     hsl(tinta, sat, L) per ogni tinta e ogni saturazione, e bianco
     coprente (L/50 - 1) fa lo stesso dall'altra parte. Quindi il
     cerchio continua a dire il vero: quello che si vede e' quello che
     si prende, anche fuori dalla mezza luce. */
  const velo = el('span', 'ruota-luce');
  const punta = el('span', 'ruota-punta');
  cerchio.appendChild(velo);
  cerchio.appendChild(punta);
  box.appendChild(cerchio);

  /* IL CHIARO-SCURO DEL COLORE DI ADESSO, dal piu' scuro al piu'
     chiaro. Mancava del tutto: il cerchio fa la tinta e quanto e'
     carica, ma un rosso scuro o un azzurro slavato -- che sui vestiti
     sono meta' dei casi -- non stavano da nessuna parte. */
  const scalaLuce = el('div', 'ruota-scala');
  const celleLuce = LUCI.map(l => {
    const b = el('button');
    b.onclick = () => { metti(conLuce(scelto, l)); };
    scalaLuce.appendChild(b);
    return { b, l };
  });
  box.appendChild(scalaLuce);

  /* e i grigi restano una fila loro: bianco e nero sono i colori piu'
     comuni sui vestiti, e farli passare per il centro del cerchio --
     che col dito e' un bersaglio da due millimetri -- sarebbe un
     peggioramento al banco */
  const scala = el('div', 'ruota-scala grigi');
  LUCI.forEach(l => {
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

  /* LA MISURA DEL TASTO SI PRENDE ADESSO, prima di toccare qualunque
     cosa. Il primo colore fa ridisegnare la fila delle persone, e il
     tasto che ha aperto la ruota se ne va insieme al resto: da li' in
     poi misurarlo dava zero, e la ruota si piantava nell'angolo in alto
     a sinistra dello schermo invece di aprirsi sotto il dito. */
  const ancora = tasto.getBoundingClientRect();

  let scelto = coloreOra || '#8A8AA0';
  /* la luce non e' uno stato a parte: si legge dal colore che c'e'. Un
     valore tenuto da parte si sarebbe scollato dal colore vero al primo
     giro -- e' lo stesso guasto della ruota dipinta in un posto e
     calcolata in un altro. */
  const luceDi = (c) => { const q = esaInHsl(c); return q ? q.l : 50; };
  const conLuce = (c, l) => {
    const q = esaInHsl(c);
    return q ? hslInEsa(q.h, q.s, l) : hslInEsa(0, 0, l);
  };

  /* `zitto` = dipingi l'anteprima e basta. Aprire la ruota non e' una
     scelta: chiamare `scegli` subito voleva dire cambiare il colore del
     capo (e ridisegnare mezzo pannello) al solo tocco del tasto. */
  const metti = (colore, zitto) => {
    scelto = colore;
    pastiglia.style.background = colore;
    nome.textContent = (typeof AV !== 'undefined' && AV.colorName) ? AV.colorName(colore, 0) : colore;
    const L = luceDi(colore);
    /* il velo che porta il cerchio alla luce scelta */
    velo.style.background = L < 50 ? '#000' : '#fff';
    velo.style.opacity = L < 50 ? (1 - L / 50) : (L / 50 - 1);
    /* e la striscia mostra QUESTO colore ai sette passi, non sette
       colori qualunque: e' la sua fila, non una tavolozza in piu' */
    celleLuce.forEach(x => {
      x.b.style.background = conLuce(colore, x.l);
      x.b.classList.toggle('on', Math.abs(x.l - L) <= 5);
    });
    if (!zitto) scegli(colore);
  };
  metti(scelto, true);

  /* IL SEGNO DOVE IL COLORE E' GIA'. Il pallino nasceva senza posto,
     cioe' nell'angolo in alto a sinistra del cerchio: riaprendo la
     ruota su una maglietta gia' colorata sembrava che non ci fosse
     niente di scelto. Adesso si mette dove sta la tinta di adesso,
     cosi' si vede da dove si riparte e la si corregge di poco. */
  const segnaPunta = (colore) => {
    const q = puntoDelColore(colore);
    /* un colore che non e' un colore non sta da nessuna parte: meglio
       nascondere il segno che metterlo a caso */
    punta.style.display = q ? '' : 'none';
    if (!q) return;
    /* i grigi cadono nel centro, ed e' giusto: il centro e' grigio */
    /* LA MISURA D'IMPAGINAZIONE, NON QUELLA A SCHERMO. La scatola entra
       con un'animazione che la ingrandisce, e in quei 140ms il righello
       a schermo la vede piu' piccola del vero: il segno finiva un paio
       di pixel dentro. `left` e `top` si contano nel riquadro suo, che
       l'animazione non tocca. (Chi legge il dito invece usa il righello
       a schermo, ed e' giusto: li' si parte da coordinate di schermo.) */
    const r = cerchio.offsetWidth / 2;
    punta.style.left = (r + q.dx * r) + 'px';
    punta.style.top = (r + q.dy * r) + 'px';
  };

  const prendi = (ev) => {
    const r = cerchio.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left - r.width / 2;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top - r.height / 2;
    punta.style.left = (r.width / 2 + Math.max(-r.width / 2, Math.min(x, r.width / 2))) + 'px';
    punta.style.top = (r.height / 2 + Math.max(-r.height / 2, Math.min(y, r.height / 2))) + 'px';
    /* la tinta cambia, il chiaro-scuro RESTA: chi ha scelto uno scuro
       sta vestendo qualcuno di scuro, e ricominciare da mezza luce a
       ogni tocco vorrebbe dire riscegliere la luce ogni volta. E il
       cerchio in quel momento e' gia' dipinto a quella luce, quindi il
       colore che esce e' proprio quello che si sta toccando. */
    metti(coloreDelPunto(x, y, r.width / 2, luceDi(scelto)));
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
  /* il segno si mette DOPO: prima il cerchio non e' ancora nella
     pagina e misurarlo darebbe zero */
  segnaPunta(scelto);
  alzaMenuDove(box, ancora);
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
  alzaMenuDove(men, tasto.getBoundingClientRect());
}

/* come alzaMenu, ma col posto del tasto GIA' misurato: serve a chi il
   tasto se lo vede sparire sotto le dita (la ruota dei colori ridisegna
   la fila delle persone al primo tocco) */
function alzaMenuDove(men, t) {
  men.style.position = 'fixed';
  men.style.right = 'auto';
  men.style.top = '0px';
  men.style.left = '0px';
  /* si misura DOPO averlo messo a video, se no e' largo zero */
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

  /* LA TENDINA NON PUO' STARE DENTRO IL BOTTONE DEL PALLINO.
     Era li' dentro, e col DITO non funzionava: un tasto annidato
     dentro un altro tasto, sui browser dei tablet, non riceve il
     tocco -- lo prende quello di fuori. Cioe' toccando un colore si
     riapriva la tendina invece di scegliere, e sembrava rotta. Col
     mouse (e coi test) andava, che e' il modo peggiore di avere un
     guasto.
     Adesso e' appoggiata sopra la pagina e piazzata sotto il pallino,
     esattamente come quella del pannello -- e cosi' non la taglia
     nemmeno il bordo della scheda. */
  document.body.appendChild(menu);
  alzaMenu(menu, ancora);
  const chiudi = (ev) => {
    if (menu.contains(ev.target) || ancora.contains(ev.target)) return;
    menu.remove();
    document.removeEventListener('pointerdown', chiudi, true);
    window.removeEventListener('scroll', viaCol, true);
  };
  /* scorrendo la lista la tendina resterebbe appesa a mezz'aria: sta
     sopra la pagina, non dentro la scheda */
  const viaCol = () => { menu.remove(); document.removeEventListener('pointerdown', chiudi, true);
    window.removeEventListener('scroll', viaCol, true); };
  setTimeout(() => {
    document.addEventListener('pointerdown', chiudi, true);
    window.addEventListener('scroll', viaCol, true);
  }, 0);
}

/* Ritinge il pallino sulla riga senza rifare la scheda: se la
   ridisegnassi, il menu aperto sparirebbe a ogni colore provato.
   VA CHIAMATA ANCHE QUANDO CAMBIA L'ORA D'INGRESSO: col bracciale su
   "Auto" il colore lo decide la fascia oraria, quindi spostando
   l'orario dal conto il pallino qui restava quello di prima -- e il
   bracciale e' proprio la cosa che si guarda per riconoscere chi esce.
   Il titolo si rifa' con lui, se no diceva un colore e ne mostrava un
   altro. */
function aggiornaPallino(entry) {
  const r = cardRefs.get(entry.id);
  if (!r || !r.wrist) return;
  const slot = braceletFor(entry.startTime);
  const col = entry.braceletCustom ? entry.braceletColor : (slot ? slot.color : null);
  r.wrist.classList.toggle('vuoto', !col);
  r.wrist.style.background = col || '';
  r.wrist.title = col
    ? 'Bracciale ' + ((slot && !entry.braceletCustom && slot.label)
        ? slot.label : (AV.colorName(col, 0) || '')) + ' \u2014 tocca per cambiare'
    : 'Nessun bracciale \u2014 tocca per sceglierlo';
}

/* chiude i pannelli aperti; con "tranne" si risparmia una scheda */
function chiudiPannelli(tranne) {
  cardRefs.forEach((r, id) => {
    if (id === tranne || !r.card.isConnected) return;
    if (r.payPanel && !r.payPanel.classList.contains('hidden')) {
      r.payPanel.classList.add('hidden');
      spegniConto(r);
      if (volante && volante.card === r.card) posa(r.card);
    }
  });
}

/* chiude l'ingresso; se restano soldi da prendere, chiede conferma */
function chiudiIngresso(entry) {
  const fine = () => {
    /* il prezzo si ferma qui: da adesso questo conto non cambia piu',
       qualunque cosa succeda al listino */
    /* il cronometro della pausa si ferma PRIMA di fare il prezzo: se
       restasse acceso, il conto congelato sarebbe quello di un gruppo
       ancora in pausa e continuerebbe a crescere dopo l'uscita */
    chiudiPausa(entry);
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
/* CHE COSA DICE LA RIGA DEI SOLDI, in tre parole e un numero.
   Sta fuori dal disegno perche' e' una REGOLA -- quando si puo' dire
   «pagato» -- e le regole si provano; il disegno si limita a scriverla.

   A TEMPO APERTO NON SI DICE MAI «PAGATO».
   Il conto non e' ancora fatto: si fa all'uscita, sul tempo davvero
   passato. Ma il dovuto puo' essere zero per un pezzo -- l'ora
   d'ingresso arrotondata che cade qualche minuto avanti, i minuti
   regalati dal Crazy che coprono tutta la permanenza fatta finora --
   e la riga rispondeva col segno verde: «pagato». Su un gruppo che non
   aveva dato un euro, e che il conto lo deve tutto.

   E UN CONTO VUOTO NON E' UN CONTO PAGATO: se non hanno preso niente
   la riga lo dice, invece di spuntare un incasso che non c'e' stato. */
function vociSoldi(entry, due) {
  const resta = r2(due.total);
  const preso = r2(due.parkPaid + due.barPaid);
  const vale = r2(due.park + due.bar);
  if (entry.payLater) {
    /* e sotto, piccolo, DA DOVE ESCE quella cifra: il tempo aperto e'
       l'unico posto in cui il prezzo si muove da solo, e senza il conto
       scritto sembra che cambi a caso */
    return { k: '\u23f3 all\u2019uscita', v: resta > 0 ? eur(resta) : '\u2014',
      sotto: spiegaAperto(entry, true), pagato: false };
  }
  if (vale <= 0.005) return { k: 'niente sul conto', v: '\u2014', pagato: false };
  if (resta <= 0) return { k: 'pagato', v: '\u2713', pagato: true };
  return { k: preso > 0 ? 'restano' : 'da pagare', v: eur(resta), pagato: false };
}

function soldiDi(r, entry, due) {
  const s = vociSoldi(entry, due);
  r.soldiK.textContent = s.k;
  r.dueVal.textContent = s.v;
  if (r.soldiS) {
    r.soldiS.textContent = s.sotto || '';
    r.soldiS.classList.toggle('vuota', !s.sotto);
  }
  r.soldi.classList.toggle('pagato', s.pagato);
}

/* CHI C'E' E COM'E' VESTITO, nella riga della lista.
   Sta in una funzione sua perche' va rifatta: cambiare un vestito dal
   conto non cambiava la figura piccola qui: si usciva guardando un
   avatar vecchio, che e' esattamente la cosa per cui la figura esiste.
   Rifa' anche il nome e i tratti ("Camicia rossa \u00b7 Jeans neri"),
   che vengono dallo stesso posto e invecchiavano insieme. */
function vestiRiga(r, entry) {
  if (!r || !r.avBox) return;
  const people = lista(entry.people);
  const avBox = r.avBox;
  avBox.innerHTML = '';
  avBox.classList.toggle('multi', people.length > 1);
  avBox.classList.toggle('manca', !people.length);
  avBox.onclick = r.apriParco;
  if (!people.length && entry.soloBar) {
    /* una vendita al bancone non ha nessuno da riconoscere: chiedere
       «metti chi e'» sarebbe chiedere una cosa che non esiste */
    avBox.title = 'Solo BAR';
    avBox.appendChild(el('div', 'segno', '\ud83e\uddfe'));
    avBox.appendChild(el('div', 'dillo', 'solo BAR'));
  } else if (!people.length) {
    avBox.title = 'Nessun riferimento \u2014 tocca per metterlo';
    avBox.appendChild(el('div', 'segno', '\u2795'));
    avBox.appendChild(el('div', 'dillo', 'metti chi \u00e8'));
  } else {
    avBox.title = '';
    people.slice(0, 2).forEach(p => {
      const a = el('div', 'av');
      a.innerHTML = AV.build(p.avatar);
      a.title = 'Com\u2019\u00e8 vestito ' + nameOf(p);
      a.onclick = r.apriParco;
      avBox.appendChild(a);
    });
  }
  if (r.nome) {
    r.nome.textContent = people.length
      ? people.map(p => roleOf(p.role).em + ' ' + nameOf(p)).join(' \u00b7 ')
      : entry.soloBar ? 'Solo BAR' : 'Nessun riferimento';
  }
  if (r.tratti) {
    r.tratti.textContent = people.length === 1
      ? AV.traits(people[0].avatar, 3, true).map(t => t.txt).join(' \u00b7 ')
      : people.length
        ? people.slice(0, 2).map(p => (AV.traits(p.avatar, 1, true)[0] || {}).txt || '')
          .filter(Boolean).join(' \u00b7 ')
        : '\u26a0\ufe0f all\'uscita non avrai riferimenti';
  }
}

/* la firma di chi c'e': se cambia, la riga va rivestita. Ci sta dentro
   anche l'avatar per intero -- il vestito e' proprio quello che
   cambiava senza che si vedesse. */
function firmaGente(entry) {
  return lista(entry.people).map(p =>
    p.id + '|' + p.role + '|' + (p.name || '') + '|' + JSON.stringify(p.avatar)).join('\u00a7');
}

/* ══════════════════════════════════════════════════════════
   IL CRAZY NELLA STRISCIA DELLA LISTA
   Qui non si sta registrando un ingresso: si segna una cosa successa
   ADESSO, con la scheda aperta al volo perche' il gruppo e' tornato a
   saltare. Il piu' e il meno lavorano sull'ULTIMA volta aperta, e se
   non ce n'e' ancora una la aprono: e' il gesto piu' corto per la cosa
   che si fa piu' spesso.
   Le volte, una per una -- correggerne una vecchia, cancellarla,
   aprirne una nuova apposta -- si sistemano nello Scontrino, dove
   ognuna ha la sua riga e c'e' spazio per scrivere cos'e'. Qui un
   "giro scelto" da tenere a mente era una cosa in piu' da capire in
   una striscia che ne aveva gia' cinque.
   ══════════════════════════════════════════════════════════ */

/* QUANTE TESTE HANNO GIA' PAGATO, dalla fascetta.
   Sulla card del conto c'e' da sempre la fascia verde "0/3": qui
   invece si poteva contare i bambini e i minuti ma non segnare chi
   aveva gia' pagato, e per una cosa che al banco si fa venti volte al
   giorno bisognava aprire il conto.
   E' la STESSA cassa: passa da segnaPagate(), come la fascia verde e
   come il "paga" della striscia in fondo. Qui cambia il posto in cui
   si preme, non la cassa. */
/* Si attacca DENTRO la cella di quello che si sta pagando -- i
   bambini, le salite -- dopo un filo che le divide. Cosi' non e' "una
   pastiglia verde della fascetta" ma "quanti di QUESTI hanno pagato",
   e la parola sopra lo dice a voce. */
function syncCard(entry) {
  const r = cardRefs.get(entry.id);
  if (!r) return;
  const due = dueOf(entry);
  const kids = clamp(entry.children, 0, 1e6);
  const crazy = clamp(entry.crazyJumping, 0, 1e6);

  /* il tasto «Paga» dice la cifra che resta, e a conto saldato sparisce:
     va rinfrescato qui, perche' quella cifra cambia a ogni tocco */
  aggiornaPaga(r.pagaBtn, entry);
  /* la nota puo' essere cambiata anche dal pannello: qui si rilegge */
  if (typeof r.disegnaNota === 'function') r.disegnaNota();

  r.sKids.val.textContent = kids;
  if (r.bimbiV) r.bimbiV.textContent = kids;
  if (r.crzV) { r.crzV.textContent = crazy; r.crz.classList.toggle('hidden', crazy <= 0); }
  /* niente bambini ma qualcuno sul Crazy: la pastiglia dei bambini
     sparisce e al suo posto si legge di che ingresso si tratta */
  const soloCrazy = kids <= 0 && crazy > 0;
  if (r.solo) r.solo.classList.toggle('hidden', !soloCrazy);
  if (r.card) r.card.classList.toggle('solo-crazy', soloCrazy);
  /* IL NUMERO E' IL TOTALE, e il meno e il piu' lavorano sull'ultima
     volta aperta: nella striscia non c'e' piu' un "giro scelto" da
     tenere a mente. Le volte, una per una, si sistemano nello
     Scontrino, che ha lo spazio per scrivere accanto a ognuna cos'e'.
     E IL PAGATO NON STA PIU' QUI: erano due coppie identiche a quelle
     della quantita', attaccate -- si segnava di aver preso i soldi
     credendo di aggiungere un bambino. Resta il verde sul gruppo
     quando e' tutto pagato, che e' un colore, non un tasto. */
  /* la card del Crazy si ridisegna intera: i giri si cambiano anche dal
     pannello (Scontrino) e da li' deve arrivare qui senza aspettare che
     si riapra qualcosa */
  if (typeof r.disegnaCrazy === 'function') r.disegnaCrazy();
  r.sKids.box.classList.toggle('pagata',
    kids > 0 && conConto(entry, () => bcPag('bimbi')) >= kids);
  /* gli stessi minuti che stanno nella fascia Tempo, scritti allo
     stesso modo: un'ora e mezza e' "1h30" in tutte e due, non "1h30"
     di la' e "90" di qua */
  if (r.sTime.apri) {
    r.sTime.apri.classList.toggle('on', !!entry.payLater);
    /* la scritta e' la stessa del pannello -- «Tempo aperto» -- e non
       cambia accendendosi: e' il nome della cosa, non il suo stato. Che
       sia acceso lo dice il colore, come per la pastiglia di la'. */
    r.sTime.apri.textContent = '\u23f3 Tempo aperto';
    r.sTime.apri.title = entry.payLater
      ? 'Torna a un tempo comprato, con un orario di uscita'
      : 'Tempo aperto: resta senza orario di fine, il conto si fa all\u2019uscita';
  }
  /* A TEMPO APERTO IL NUMERO GRANDE E' IL TEMPO CHE SI STA PAGANDO.
     C'era un trattino: la cosa che al banco si guarda per prima non
     diceva niente proprio quando e' l'unica che si muove da sola. */
  const ap = entry.payLater ? conConto(entry, () => contiAperto(entry)) : null;
  r.sTime.val.textContent = ap ? fmtMin(Math.round(ap.contati)) : fmtMin(entry.durationMinutes);
  /* GRAFICA 2.0: LA CELLA DICE DI CHE TEMPO STA PARLANDO.
     Il numero grande e' il tempo COMPRATO -- quello che si paga -- ma
     non lo diceva, e accanto ce n'erano altri due (i minuti del Crazy e
     il totale nel banner) senza niente che li legasse. Sotto il numero
     adesso c'e' una riga che lo nomina, e i minuti regalati quando ci
     sono: cosi' la cella non tace piu' la meta' del discorso.
     A tempo aperto il numero e' un'altra cosa ancora -- i minuti che si
     stanno pagando -- e lo dice. */
  if (r.sTime.sotto) {
    const reg = conConto(entry, () => minutiCrazy(entry) + omaggioDi(entry));
    r.sTime.sotto.classList.toggle('hidden', !settings.grafica2);
    r.sTime.sotto.innerHTML = settings.grafica2
      ? (entry.payLater
        ? '<span class="k">che stai pagando</span>'
        : '<span class="k">comprato</span>' +
          (reg > 0 ? '<span class="piu">+' + minTxt(reg) + ' Crazy</span>' : ''))
      : '';
  }
  r.sTime.box.classList.toggle('aperta', !!entry.payLater);
  r.sTime.box.classList.toggle('in-pausa', !!(ap && ap.inPausa));
  /* meno e piu' servono a una durata comprata: a tempo aperto non c'e'
     nessuna durata da spostare, e al loro posto compare la pausa */
  r.sTime.minus.classList.toggle('hidden', !!entry.payLater);
  r.sTime.plus.classList.toggle('hidden', !!entry.payLater);
  if (r.sTime.pausa) {
    r.sTime.pausa.classList.toggle('hidden', !entry.payLater);
    r.sTime.pausa.classList.toggle('on', !!(ap && ap.inPausa));
    r.sTime.pausa.textContent = (ap && ap.inPausa) ? '\u25b6\ufe0e Riprendi' : '\u23f8 Pausa';
    r.sTime.pausa.title = (ap && ap.inPausa)
      ? 'L\u2019orologio \u00e8 fermo: riprendi a contare il tempo'
      : 'Ferma l\u2019orologio: il tempo in pausa non si paga';
  }
  r.sKids.minus.disabled = kids <= 0;
  r.sTime.minus.disabled = num(entry.durationMinutes, 0) <= minimoTempo(entry);
  /* la riga sotto il conto alla rovescia si rifa' anche adesso: `tick`
     gira una volta al secondo, e aspettare un secondo dopo aver segnato
     un giro vuol dire vederla comparire in ritardo sotto le dita */
  spiegaTempoDi(r, entry);

  /* IL VESTITO CAMBIATO SI VEDE SUBITO. syncCard() gira a ogni tocco
     del conto -- anche mentre si veste qualcuno -- e prima guardava
     solo i numeri: la figura piccola restava quella di prima finche'
     non si ricaricava l'app. Adesso, se chi c'e' o com'e' vestito e'
     cambiato, la riga si riveste. Costa una firma da confrontare. */
  const firma = firmaGente(entry);
  if (r.sigGente !== firma) {
    r.sigGente = firma;
    vestiRiga(r, entry);
  }
  /* il pallino del bracciale: col "Auto" il colore dipende dall'ora
     d'ingresso, che si puo' spostare dal conto. E con lui la fila
     dentro la fascetta, che deve dire la stessa cosa. */
  aggiornaPallino(entry);

  soldiDi(r, entry, due);

  /* se il conto e' aperto lo riallineo: i prezzi possono essere
     cambiati sotto (tempo esteso, un bambino in piu') */
  if (r.payPanel && !r.payPanel.classList.contains('hidden') && PAN.ingresso === entry) {
    aggiornaPannello();
  }

  /* QUANTO DURA, accanto ai due orari. Prima c'erano solo «dalle» e
     «alle» e per sapere se erano mezz'ora o un'ora bisognava fare la
     sottrazione a mente, su ogni scheda, mentre si guarda la lista di
     colpo d'occhio -- che e' il modo in cui questa lista si guarda.
     I minuti sono quelli che i due orari BRACCIANO davvero, cioe'
     compresi quelli regalati dal Crazy: se l'uscita e' alle 14:48
     perche' hanno fatto due giri, qui si legge 38m e non 30m, se no il
     banner direbbe due cose diverse nella stessa riga. Quanto tempo
     hanno COMPRATO -- che e' un altro numero -- sta nella fascia del
     Tempo dentro la scheda. */
  /* LA DURATA E' QUELLA DEL TEMPO DI PARCO, contata da quando e'
     cominciato. Per chi entra e compra subito e' la stessa cosa; per chi
     si e' fermato dopo due giri no, e prima qui si leggeva la distanza
     dall'INGRESSO -- quaranta minuti per dieci minuti comprati. */
  const da = inizioParco(entry);
  const dopo = Math.abs(da - num(entry.startTime, 0)) > 60000;
  const durata = Math.round((endTimeOf(entry) - da) / 60000);
  r.range.innerHTML = '<span class="fr">dalle</span>' + fmtTime(entry.startTime) +
    (dopo ? '<span class="fr">parco</span>' + fmtTime(da) : '') +
    '<span class="fr">alle</span>' + (entry.payLater ? '?' : fmtTime(endTimeOf(entry))) +
    (entry.payLater ? '' : '<b class="dur">' + fmtMin(durata) + '</b>');
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
  /* SU QUALE LINGUETTA ERA. Riaprendo col tasto si tornava sempre al
     bancone: aggiungevi una persona dal Parco e il pannello ti
     rispondeva col listino delle bibite. */
  const catEra = PAN.cat;
  if (conPannello) {
    if (volante && volante.card === r.card) posaSubito(r.card);
    else riportaPannello(r.card);
  }
  const fresh = entryCard(entry);
  r.card.replaceWith(fresh);
  if (era) fresh.classList.add('aperto');
  if (conPannello) {
    const nuovo = cardRefs.get(entry.id);
    if (nuovo) nuovo.apriConto(catEra);
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

/* L'ora d'ingresso di chi si sta registrando cammina con l'orologio,
   finche' nessuno l'ha spostata a mano: si apre "+ Nuovo", si conta la
   gente con calma, e all'atto di registrare l'orario e' gia' giusto. */
function ingressoLive() {
  if (PAN.ingresso || !draft || draft.oraManuale) return;
  const adesso = roundTo5(new Date()).getTime();
  if (adesso === draft.startTime) return;
  mettiIngresso(draft, adesso);
  if (PAN.root && PAN.conto === draft) { disegnaFascia(PAN.root, draft); pcFondoDis(); }
}

/* QUANTO RESTA A VISTA UNA VENDITA AL BANCO prima di archiviarsi da
   sola: il tempo di accorgersi di uno sbaglio e correggerlo, senza che
   la lista di chi e' dentro si riempia di scontrini. */
const ATTESA_SOLO_BAR = 2 * 60000;

/* Si sta mettendo mano a questa scheda? Il conto alla rovescia non deve
   correre mentre la si corregge: e' proprio il momento per cui esiste. */
function inModifica(e) {
  if (PAN.ingresso && PAN.ingresso.id === e.id) return true;
  const r = cardRefs.get(e.id);
  return !!(r && r.card && r.card.isConnected && r.card.classList.contains('aperto'));
}

function scadenzaSoloBar(e) {
  return num(e.barFinoA, num(e.createdAt, e.startTime) + ATTESA_SOLO_BAR);
}
function restaSoloBar(e) {
  return Math.max(0, scadenzaSoloBar(e) - Date.now());
}

/* MENTRE LA MODIFICHI IL TEMPO NON SCORRE. Aprire la scheda di una
   vendita al banco vuol dire «aspetta, questa e' sbagliata»: archiviarla
   sotto le dita mentre la si corregge sarebbe il contrario di quello che
   serve. Finche' resta aperta la scadenza si sposta in avanti, quindi il
   numero resta fermo sul pieno; chiusa, i due minuti ripartono interi.
   Si salva solo quando lo stato CAMBIA -- aperta o chiusa -- non a ogni
   battito: sono sessanta scritture al minuto per niente. */
const soloBarFermi = new Set();
function fermaSoloBarInModifica() {
  let cambiato = false;
  lista(entries).forEach(e => {
    if (!e || !e.soloBar || e.status !== 'active') return;
    const ora = inModifica(e);
    const era = soloBarFermi.has(e.id);
    if (ora) {
      e.barFinoA = Date.now() + ATTESA_SOLO_BAR;
      if (!era) { soloBarFermi.add(e.id); cambiato = true; }
    } else if (era) {
      soloBarFermi.delete(e.id);
      cambiato = true;
    }
  });
  if (cambiato) saveEntries();
}

/* Le vendite al banco passate di tempo se ne vanno in archivio da sole.
   Il prezzo si ferma li', come per chi esce: dal registro della giornata
   non spariscono, e' la lista di chi e' DENTRO che si libera. */
function archiviaSoloBarScaduti() {
  fermaSoloBarInModifica();
  const scaduti = lista(entries).filter(e =>
    e && e.soloBar && e.status === 'active' && restaSoloBar(e) <= 0 && !inModifica(e));
  if (!scaduti.length) return;
  scaduti.forEach(e => {
    const d = dueOf(e);
    e.costoFinale = { parco: d.park, bar: d.bar };
    e.status = 'closed';
    e.closedAt = Date.now();
  });
  saveEntries();
  /* prima si accartoccia, poi sparisce: si vede QUALE se n'e' andata
     invece di trovarne una in meno. Se la scheda non e' a video -- si
     sta guardando un'altra linguetta -- si salta l'animazione. */
  const vive = scaduti.map(e => cardRefs.get(e.id)).filter(r => r && r.card.isConnected);
  if (!vive.length || !anima() || volante) { buildActiveView(); updateBadge(); return; }
  vive.forEach(r => {
    r.card.style.height = r.card.getBoundingClientRect().height + 'px';
    requestAnimationFrame(() => r.card.classList.add('esce'));
  });
  setTimeout(() => { buildActiveView(); updateBadge(); }, 320);
}

function tick() {
  const now = Date.now();
  ingressoLive();
  archiviaSoloBarScaduti();
  /* L'AVVISO GUARDA SEMPRE, anche mentre sei in "+ Nuovo" o nel bar.
     E' proprio quello il momento in cui il colore rosso della lista
     non lo vedi -- se guardassi la lista, non servirebbe un avviso. */
  lista(entries).forEach(e => {
    if (e.status !== 'active' || e.payLater || e.soloBar) return;
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
      ['ok', 'warn', 'danger', 'later', 'bar'].forEach(x => r.card.classList.remove('s-' + x));
      r.card.classList.add('s-' + st);
    }

    if (entry.soloBar) {
      /* una vendita al banco non ha un conto alla rovescia da guardare:
         al parco non c'e' nessuno. Al suo posto quanto le resta prima
         di archiviarsi da sola, cosi' si sa quanto tempo c'e' per
         correggerla. */
      r.count.textContent = fmtClock(restaSoloBar(entry));
      if (r.countK) r.countK.textContent = 'si archivia fra';
    } else if (entry.payLater) {
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
    spiegaTempoDi(r, entry);
  });
}

/* DI CHE COS'E' FATTO IL TEMPO CHE MANCA.
   «Esce fra 25:55» non dice se quei minuti sono tempo comprato o
   minuti regalati dal Crazy, ed e' la domanda che al banco arrivava
   ogni volta: hanno comprato piu' tempo o hanno fatto dei giri? La
   riga sotto lo scrive: «1h + 16′ Crazy».
   Solo se c'e' qualcosa da spiegare: senza giri il numero e' gia'
   chiaro da solo, e una riga in piu' sarebbe rumore. */
function spiegaTempoDi(r, entry) {
  if (!r || !r.countS) return;
  const dritto = settings.grafica2 && !entry.payLater && !entry.soloBar &&
    entry.status !== 'closed';
  const comprati = clamp(num(entry.durationMinutes, 0), 0, 1e6);
  const durata = Math.round((endTimeOf(entry) - inizioParco(entry)) / 60000);
  const inRegalo = Math.max(0, durata - comprati);
  const mostra = dritto && comprati > 0 && inRegalo > 0;
  r.countS.classList.toggle('vuota', !mostra);
  r.countS.textContent = mostra
    ? fmtMin(comprati) + ' + ' + minTxt(inRegalo) + ' Crazy'
    : '';
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
      /* e via anche i TIMBRI di quel tempo: da quando contava il parco
         e il pavimento di un regalo. Restavano indietro, e il tempo
         nuovo nasceva gia' scaduto o gia' rosso. */
      delete c.parcoDa; delete c.regaloFinoA;
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
  const fine = fineGiornata(inizio);
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
      id: e.id, ora: fmtTime(e.startTime), chi: nomiDi(e), sigla: String(e.sigla || ''),
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
let hubFoglio = null;             // il registro, se e' aperto adesso

/* Rimette in piedi il registro dov'era. Serve dopo ogni correzione:
   il foglio della domanda ("elimino?") prende il posto del registro, e
   dopo aver risposto ci si aspetta di ritrovarcisi dentro, non a mani
   vuote sulla lista. */
function riapriRegistro() { fogliRegistro(); }

function fogliRegistro(giorno) {
  hubDove = giorno === undefined ? hubDove : 'giornata';
  hubGiorno = giorno === undefined ? (hubGiorno || giornataDi(Date.now())) : giorno;
  const s = sheet('\ud83d\udcd2 Registro e statistiche',
    { grande: true, onClose: () => { hubFoglio = null; } });
  hubFoglio = s;

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

/* Una domanda seria dentro il registro: qualunque cosa si risponda,
   si torna al registro. */
function chiediNelRegistro(titolo, testo, parola, si) {
  const q = sheet(titolo);
  q.body.appendChild(el('div', 'hint', testo));
  footBtn(q.foot, 'Lascia stare', 'btn-ghost', () => { q.close(); riapriRegistro(); });
  footBtn(q.foot, parola, 'btn-danger', () => { q.close(); si(); });
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
    const riga = el('div', 'reg-riga tocca' + (r.resta > 0.005 ? ' deve' : ''));
    /* NEL REGISTRO FINISCONO ANCHE GLI SBAGLI: il gruppo battuto due
       volte, la prova fatta per capire come funziona, i soldi segnati
       sulla riga di un altro. Restavano li' per sempre -- dentro i
       totali della giornata e dentro le medie -- e l'unico modo di
       toglierli era non averceli messi. Adesso la riga si tocca. */
    riga.setAttribute('role', 'button');
    riga.tabIndex = 0;
    riga.title = 'apri, correggi o cancella questo ingresso';
    riga.onclick = () => {
      const e = lista(entries).find(x => x.id === r.id);
      if (e) fogliRigaRegistro(e);
    };
    riga.appendChild(el('span', 'ora', r.ora));
    /* LA SIGLA ANCHE QUI. E' il codice che si dice a voce per indicare un
       gruppo: averlo sulla scheda e non nel registro voleva dire che
       proprio dove si va a cercare «chi era quello che deve ancora
       pagare» il riferimento non c'era. */
    if (r.sigla) riga.appendChild(el('span', 'reg-sigla', r.sigla));
    const chi = el('span', 'chi');
    chi.appendChild(el('b', null, r.chi));
    chi.appendChild(el('span', null, r.bambini + (r.bambini === 1 ? ' bambino' : ' bambini') +
      (r.uscito ? '' : ' \u00b7 ancora dentro')));
    riga.appendChild(chi);
    const soldi = el('span', 'soldi');
    soldi.appendChild(el('b', null, eur(r.preso)));
    if (r.resta > 0.005) soldi.appendChild(el('span', 'manca', '\u2212' + eur(r.resta)));
    riga.appendChild(soldi);
    riga.appendChild(el('span', 'reg-vai', '\u203a'));
    lst.appendChild(riga);
  });
  dentro.appendChild(lst);

  /* e la giornata intera, quando e' tutta da buttare: la prova di un
     pomeriggio, il giorno registrato due volte */
  const az = el('div', 'reg-azioni');
  az.appendChild(el('span', 'rz-hint', 'Tocca una riga per correggerla o cancellarla.'));
  const via = el('button', 'btn btn-sm btn-danger', '\ud83d\uddd1\ufe0f Elimina la giornata');
  via.onclick = () => chiediNelRegistro('Elimina tutta la giornata?',
    'Spariscono ' + c.gruppi + (c.gruppi === 1 ? ' ingresso' : ' ingressi') + ' di ' +
    nomeGiornata(hubGiorno).toLowerCase() + ', con i ' + eur(c.incassato) +
    ' che risultano incassati e i ' + c.bambini + (c.bambini === 1 ? ' bambino' : ' bambini') +
    ' contati nelle medie. Per qualche secondo si pu\u00f2 annullare.',
    'Elimina la giornata', () => eliminaGiornata(hubGiorno));
  az.appendChild(via);
  dentro.appendChild(az);
}

/* UNA RIGA DEL REGISTRO, APERTA. Due strade: andare all'ingresso e
   sistemarlo -- che e' quasi sempre quello che serve, perche' lo
   sbaglio e' un numero, non l'ingresso intero -- oppure buttarlo. */
function fogliRigaRegistro(entry) {
  const d = dueOf(entry);
  const preso = r2(num(entry.paidPark, 0) + num(entry.paidBar, 0));
  const q = clamp(entry.children, 0, 1e6);
  const crz = clamp(entry.crazyJumping, 0, 1e6);
  const s = sheet(fmtTime(entry.startTime) + ' \u00b7 ' + nomiDi(entry));
  s.body.appendChild(el('div', 'hint',
    q + (q === 1 ? ' bambino' : ' bambini') +
    (crz ? ' \u00b7 ' + crz + (crz === 1 ? ' giro' : ' giri') + ' di Crazy' : '') +
    ' \u00b7 incassati ' + eur(preso) +
    (d.total > 0.005 ? ' \u00b7 mancano ' + eur(d.total) : '') +
    (entry.status === 'active' ? ' \u00b7 \u00e8 ancora dentro' : '')));

  const scelta = (cls, em, titolo, sotto, fn) => {
    const b = el('button', 'scelta-riga ' + cls);
    b.appendChild(el('span', 'sc-em', em));
    const t = el('span', 'sc-txt');
    t.appendChild(el('b', null, titolo));
    t.appendChild(el('span', null, sotto));
    b.appendChild(t);
    b.onclick = () => { s.close(); fn(); };
    s.body.appendChild(b);
  };

  /* CORREGGERE UN INGRESSO GIA' USCITO vuol dire riportarlo dentro.
     In archivio le schede sono righe secche -- data, nome, due tasti --
     e un conto da aprire non ce l'hanno: e' fatto apposta, se no
     l'archivio di fine stagione sarebbe migliaia di schede intere da
     disegnare. Quindi la strada e' quella che l'app ha sempre avuto:
     torna fra quelli dentro, lo correggi, e lo fai uscire di nuovo. */
  const inSala = entry.status === 'active';
  scelta('', inSala ? '\u270f\ufe0f' : '\u21a9\ufe0e',
    inSala ? 'Apri e correggi' : 'Riportalo dentro e correggilo',
    inSala
      ? 'Chiude il registro e va a questo ingresso, col conto gi\u00e0 aperto: da l\u00ec si cambiano ' +
        'bambini, orario, giri di Crazy e soldi incassati.'
      : 'Questo gruppo \u00e8 gi\u00e0 uscito. Torna fra quelli dentro col conto aperto: lo correggi ' +
        'e poi lo fai uscire un\u2019altra volta.',
    () => {
      if (!inSala) {
        entry.status = 'active';
        delete entry.costoFinale;   /* torna dentro: si riconta col listino di adesso */
        saveEntries();
        updateBadge();
      }
      vaiAllIngresso(entry);
    });

  scelta('pericolo', '\ud83d\uddd1\ufe0f', 'Elimina questo ingresso',
    'Sparisce dal registro e dai conti della giornata, con i soldi che risultavano incassati. ' +
    'Per qualche secondo si pu\u00f2 annullare.',
    () => eliminaIngresso(entry, riapriRegistro));

  footBtn(s.foot, 'Torna al registro', 'btn-ghost', riapriRegistro);
}

/* PORTA A QUELL'INGRESSO e aprigli il conto: che sia ancora dentro o
   gia' in archivio, si arriva allo stesso posto. */
function vaiAllIngresso(entry) {
  /* di archiviati non ce ne arrivano -- chi chiama li riporta dentro
     prima -- ma se succede si mostra l'archivio e si dice perche' */
  const inArchivio = entry.status !== 'active';
  showArchive = inArchivio;
  archivioTutto = true;              /* anche se e' vecchio di mesi */
  if (tab !== 'active') switchTab('active'); else buildActiveView();
  if (inArchivio) { toast('\u00c8 in archivio: riportalo dentro per correggerlo'); return; }
  setTimeout(() => {
    const r = cardRefs.get(entry.id);
    if (!r || !r.card.isConnected) { toast('Non trovo pi\u00f9 questo ingresso'); return; }
    r.card.scrollIntoView({ block: 'center', behavior: anima() ? 'smooth' : 'auto' });
    r.card.classList.remove('evidenzia');
    void r.card.offsetWidth;
    r.card.classList.add('evidenzia');
    setTimeout(() => r.card.classList.remove('evidenzia'), 3000);
    if (typeof r.apriParco === 'function') r.apriParco({ stopPropagation: () => {} });
  }, 160);
}

/* UNA GIORNATA INTERA, VIA. I soldi che risultavano incassati se ne
   vanno con lei -- ed e' il punto: una giornata di prova non deve
   restare nelle medie per sempre. */
function eliminaGiornata(inizio) {
  if (typeof volante !== 'undefined' && volante) posaSubito(volante.card);
  const fine = fineGiornata(inizio);
  const prima = lista(entries).slice();
  const dentro = e => {
    const t = num(e.startTime, num(e.createdAt, 0));
    return t >= inizio && t < fine;
  };
  const quanti = prima.filter(dentro).length;
  if (!quanti) { riapriRegistro(); return; }
  entries = prima.filter(e => !dentro(e));
  saveEntries();
  buildActiveView();
  updateBadge();
  riapriRegistro();
  fatto('Giornata cancellata \u00b7 ' + quanti + (quanti === 1 ? ' ingresso' : ' ingressi'), () => {
    entries = prima;
    saveEntries();
    buildActiveView();
    updateBadge();
    if (hubFoglio) riapriRegistro();
    toast('Giornata rimessa a posto \u21a9\ufe0e');
  });
}

/* TUTTO LO STORICO, VIA -- ma non chi e' dentro adesso.
   Le prove dei primi giorni sporcano le medie per sempre, e cancellarle
   una giornata alla volta e' un lavoro. Chi sta ancora nel parco resta
   dov'e': quello non e' storico, e' gente in sala. */
function svuotaRegistro() {
  if (typeof volante !== 'undefined' && volante) posaSubito(volante.card);
  const prima = lista(entries).slice();
  const restano = prima.filter(e => e.status === 'active');
  const quanti = prima.length - restano.length;
  if (!quanti) { riapriRegistro(); return; }
  entries = restano;
  saveEntries();
  buildActiveView();
  updateBadge();
  riapriRegistro();
  fatto('Registro svuotato \u00b7 ' + quanti + (quanti === 1 ? ' ingresso' : ' ingressi'), () => {
    entries = prima;
    saveEntries();
    buildActiveView();
    updateBadge();
    if (hubFoglio) riapriRegistro();
    toast('Registro rimesso a posto \u21a9\ufe0e');
  });
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
  dentro.appendChild(el('div', 'hint', 'Tocca una barra per aprire quella giornata, e da l\u00ec correggi o cancelli.'));

  /* e la scopa grossa, in fondo dove non si tocca per sbaglio */
  const az = el('div', 'reg-azioni');
  const dentroAdesso = lista(entries).filter(e => e.status === 'active').length;
  const storici = lista(entries).length - dentroAdesso;
  az.appendChild(el('span', 'rz-hint', storici + (storici === 1 ? ' ingresso' : ' ingressi') +
    ' in tutto lo storico'));
  const via = el('button', 'btn btn-sm btn-danger', '\ud83e\uddf9 Svuota tutto lo storico');
  via.onclick = () => chiediNelRegistro('Svuota tutto lo storico?',
    'Spariscono ' + storici + (storici === 1 ? ' ingresso' : ' ingressi') +
    ' di tutte le giornate, con i loro soldi e le loro medie. ' +
    (dentroAdesso ? (dentroAdesso === 1 ? 'Il gruppo ancora dentro resta dov’e’. '
      : 'I ' + dentroAdesso + ' gruppi ancora dentro restano dove sono. ') : '') +
    'Per qualche secondo si pu\u00f2 annullare.',
    'Svuota lo storico', svuotaRegistro);
  az.appendChild(via);
  dentro.appendChild(az);
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

/* ══════════════════════════════════════════════════════════
   IL BLOCCHETTO DEL BAR: dove va quello che si e' segnato.
   Tre strade, e nessuna si puo' indovinare da qui -- dipende da chi
   c'e' davanti al banco. Quindi prima si segna, poi si dice dove.
   ══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   AGGIUNGERE QUELLO CHE SI E' SEGNATO A UN GRUPPO GIA' DENTRO.
   La linguetta «Bar» non c'e' piu': era una schermata intera per una
   cosa che dal modulo si fa in due tocchi, e teneva un foglio suo da
   non far divergere. Quello che serviva davvero -- appendere due birre
   al conto di chi e' gia' al parco -- e' un tasto qui in fondo, accanto
   a «Registra».
   ══════════════════════════════════════════════════════════ */
/* A CHI si appende quello che si e' segnato al banco. */
function foglioAQualeGruppo() {
  const dentro = activeEntries();
  const s = sheet('A quale gruppo?');
  s.body.appendChild(el('div', 'hint',
    'Le consumazioni passano sul suo conto. Quello che hanno già pagato al banco viene con loro: il gruppo se le ritrova già saldate.'));

  /* SI DEVE CAPIRE CHI E' CHI, e a colpo d'occhio: qui si sceglie con il
     cliente davanti che aspetta. Una riga di testo con «Nessun
     riferimento · 2 bambini» ripetuta otto volte non permette di
     scegliere -- e sbagliare gruppo vuol dire mettere le birre sul conto
     di qualcun altro.
     Quindi le stesse cose che ha la scheda, nello stesso ordine: la
     SIGLA (che e' il codice scritto sul bracciale), la figura di chi
     accompagna, il nome, i tratti scritti, e quanto resta da pagare. */
  dentro.forEach(e => {
    const d = dueOf(e);
    const gente = lista(e.people).map(x => (x.avatar = AV.normalize(x.avatar, x.role), x));
    const b = el('button', 'gr-scelta');

    if (e.sigla) b.appendChild(el('span', 'gr-sigla', e.sigla));

    const fig = el('span', 'gr-fig');
    if (gente.length) {
      gente.slice(0, 2).forEach(x => {
        const a = el('span', 'av');
        a.innerHTML = AV.build(x.avatar);
        fig.appendChild(a);
      });
    } else {
      fig.classList.add('senza');
      fig.appendChild(el('span', 'segno', e.soloBar ? '🧾' : '🎟️'));
    }
    b.appendChild(fig);

    const t = el('span', 'gr-txt');
    t.appendChild(el('b', null, gente.length
      ? gente.map(x => roleOf(x.role).em + ' ' + nameOf(x)).join(' · ')
      : (e.soloBar ? 'Solo BAR' : 'Senza riferimento')));
    if (gente.length === 1) {
      const tr = AV.traits(gente[0].avatar, 3, true).map(x => x.txt).join(' · ');
      if (tr) t.appendChild(el('span', 'gr-tratti', tr));
    }
    const bimbi = clamp(e.children, 0, 1e6);
    const crazy = clamp(e.crazyJumping, 0, 1e6);
    t.appendChild(el('span', 'gr-dati',
      'dalle ' + fmtTime(e.startTime) +
      (e.payLater ? ' · tempo aperto' : ' · alle ' + fmtTime(endTimeOf(e))) +
      (bimbi ? ' · 🧒 ' + bimbi : '') +
      (crazy ? ' · 🤸 ' + crazy : '')));
    b.appendChild(t);

    /* quanto resta: e' la cosa che fa scegliere quando due gruppi si
       somigliano, e sta a destra dove si guarda per ultima */
    const soldi = el('span', 'gr-soldi' + (d.total > 0.005 ? ' deve' : ''));
    soldi.textContent = d.total > 0.005 ? eur(d.total) : '✓';
    soldi.title = d.total > 0.005 ? 'restano da incassare' : 'conto saldato';
    b.appendChild(soldi);

    b.onclick = () => { s.close(); versaBarSu(e); };
    s.body.appendChild(b);
  });

  footBtn(s.foot, 'Lascia stare', 'btn-ghost', s.close);
}

/* VERSA IL BLOCCHETTO SUL CONTO DI UN GRUPPO.
   Le voci si SOMMANO a quelle che il gruppo ha gia' (due birre qui piu'
   una la' fanno tre righe da una voce sola, non due elenchi separati), e
   i soldi gia' incassati al banco vengono con loro: se hanno pagato le
   birre alla cassa, il gruppo se le ritrova saldate.
   Il prezzo che viaggia e' quello SCRITTO SUL BLOCCHETTO, non quello del
   listino di adesso: e' quello che il cliente ha visto e pagato. */
function versaBarSu(entry) {
  const foto = fotografia(entry);
  const voci = lista(draft.barItems).filter(b => b && b.id && num(b.qty, 0) > 0);
  if (!voci.length) { toast('Non c’è niente da spostare'); return; }

  const amtDa = draft.paidAmt || {};
  const pagDa = draft.paidLines || {};
  entry.barItems = lista(entry.barItems);
  entry.paidAmt = entry.paidAmt || {};
  entry.paidLines = entry.paidLines || {};

  let soldiSpostati = 0;
  voci.forEach(v => {
    const gia = entry.barItems.find(x => x.id === v.id);
    /* Se il gruppo ha gia' quella voce a un prezzo diverso, vince quello
       del blocchetto solo per i pezzi nuovi: il conto gia' aperto non si
       ritocca sotto al cliente. Si sommano le quantita' e si tiene il
       prezzo che c'era, perche' e' quello su cui e' stato fatto il
       conto finora. */
    if (gia) gia.qty = num(gia.qty, 0) + num(v.qty, 0);
    else entry.barItems.push({ id: v.id, name: v.name, price: num(v.price, 0), qty: num(v.qty, 0) });

    const pagate = clamp(Math.round(num(pagDa[v.id], 0)), 0, num(v.qty, 0));
    if (pagate > 0) entry.paidLines[v.id] = clamp(Math.round(num(entry.paidLines[v.id], 0)), 0, 1e6) + pagate;
    const soldi = Math.max(0, r2(num(amtDa[v.id], 0)));
    if (soldi > 0) {
      entry.paidAmt[v.id] = r2(num(entry.paidAmt[v.id], 0) + soldi);
      soldiSpostati = r2(soldiSpostati + soldi);
    }
  });
  entry.paidBar = r2(Math.max(0, num(entry.paidBar, 0)) + soldiSpostati);

  /* e la nota del blocchetto, se c'e', si appende a quella del gruppo */
  const notaDa = String(draft.note || '').trim();
  if (notaDa) {
    const sua = String(entry.note || '').trim();
    entry.note = sua ? sua + ' · ' + notaDa : notaDa;
  }

  /* l'ingresso rientra dalla porta di sempre: cosi' se qualcosa non
     torna -- spunte oltre la quantita', importi che non rispecchiano i
     totali -- lo raddrizza la riparazione, non lo si scopre alla cassa */
  const i = entries.indexOf(entry);
  if (i > -1) entries[i] = normalizeEntries([entry])[0];

  draft = freshDraft();
  PAN.conto = draft;
  saveEntries();
  buildActiveView();
  updateBadge();
  switchTab('active');

  fatto('Aggiunte a ' + nomiDi(entry) +
    (soldiSpostati > 0.005 ? ' · ' + eur(soldiSpostati) + ' già pagati' : ''), () => {
    const j = entries.findIndex(x => x.id === foto.id);
    if (j > -1) entries[j] = normalizeEntries([foto])[0];
    saveEntries();
    buildActiveView();
    updateBadge();
    toast('Annullato ↩︎');
  });
}

/* SCRIVERE LA NOTA DALLA SCHEDA.
   Un foglio e non un campo che si apre sul posto: la scheda in lista e'
   stretta, e sotto compare la tastiera. Qui il campo sta in alto, grande,
   e quello che si scrive si vede tutto. */
/* LA STRISCIA DELLA NOTA, UNA SOLA per tutti i posti che la mostrano.
   Erano due: una striscia sulla scheda in lista e un campo da riempire
   dentro il pannello. La stessa cosa scritta in due modi diverge --
   quella del pannello salvava a ogni lettera e non aveva ne' un
   «lascia stare» ne' l'annulla -- e chi la usa deve imparare due
   gesti per la stessa cosa.
   `sempre` distingue i due posti, ed e' l'unica differenza che resta:
   nel pannello la striscia vuota si vede (e' da li' che si scrive la
   prima nota), in lista no, se no ogni scheda porterebbe una riga che
   dice una cosa che si puo' fare invece di una che c'e'. */
function vestiNota(box, chi, sempre) {
  const t = String((chi && chi.note) || '').trim();
  box.classList.toggle('vuota', !t);
  box.classList.toggle('sempre', !!sempre);
  box.innerHTML = '<span class="em">📝</span><span class="tx">' +
    (t ? esc(t) : 'aggiungi una nota') + '</span>';
}

/* IL FOGLIO DELLA NOTA, sia per un gruppo gia' registrato sia per uno
   che si sta ancora scrivendo: quello che cambia e' solo DOVE si
   salva, e lo decide lui invece di farlo decidere a chi lo apre. */
function foglioNota(entry, dopo) {
  const s = sheet('Nota del gruppo');
  s.body.appendChild(el('div', 'hint',
    'Quello che serve ricordarsi su tutto il gruppo: «hanno la torta in frigo», «zaino giallo».'));
  const campo = el('textarea', 'nota-campo');
  campo.value = String(entry.note || '');
  campo.placeholder = 'Scrivi qui…';
  campo.rows = 3;
  campo.maxLength = 500;
  s.body.appendChild(campo);
  /* la tastiera del tablet si mangia meta' schermo: il campo si porta a
     vista da se', se no si scrive al buio */
  setTimeout(() => { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }, 60);
  campo.addEventListener('focus', () => {
    setTimeout(() => campo.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  });

  /* UN GRUPPO NON ANCORA REGISTRATO non sta in `entries`: li' non c'e'
     niente da salvare su disco ne' nessuna scheda in lista da
     aggiornare, e chiamare `saveEntries` scriverebbe la lista di prima
     lasciando la nota solo a video. */
  const registrato = lista(entries).indexOf(entry) >= 0;
  const applica = () => {
    if (registrato) {
      saveEntries();
      syncCard(entry);
      if (PAN.ingresso === entry) aggiornaPannello();
    } else {
      pcSalva();
      aggiornaPannello();
    }
    if (typeof dopo === 'function') dopo();
  };

  footBtn(s.foot, 'Lascia stare', 'btn-ghost', s.close);
  footBtn(s.foot, '\u2713 Salva', 'btn-ok', () => {
    const prima = String(entry.note || '');
    entry.note = campo.value.slice(0, 500);
    s.close();
    if (entry.note === prima) return;
    applica();
    fatto(entry.note.trim() ? 'Nota salvata \ud83d\udcdd' : 'Nota tolta', () => {
      entry.note = prima;
      applica();
      toast('Nota rimessa \u21a9\ufe0e');
    });
  });
}

/* Toglie di mezzo un ingresso sbagliato: via dall'elenco, via dai
   conti della giornata. I soldi che risultavano incassati se ne vanno
   con lui -- ed e' il punto: se erano stati battuti per sbaglio, non
   devono restare in cassa. */
function eliminaIngresso(entry, dopo) {
  if (volante) posaSubito(volante.card);
  const foto = fotografia(entry);
  const dovEra = lista(entries).indexOf(entry);
  entries = lista(entries).filter(e => e.id !== entry.id);
  saveEntries();
  buildActiveView();
  updateBadge();
  /* chi ha chiesto la cancellazione dal registro vuole ritrovarcisi
     dentro, aggiornato -- prima e dopo l'annulla */
  if (typeof dopo === 'function') dopo();
  fatto('Ingresso eliminato \ud83d\uddd1\ufe0f', () => {
    /* torna al SUO posto nell'elenco, non in fondo: la lista e' in
       ordine di arrivo e ritrovarselo altrove confonde */
    entries.splice(Math.max(0, Math.min(dovEra, entries.length)), 0, foto);
    saveEntries();
    buildActiveView();
    updateBadge();
    if (typeof dopo === 'function' && hubFoglio) dopo();
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
      <button class="switch-row" id="setContoSu" role="switch" style="margin-top:10px;">
        <span class="sw-txt"><b>Conto e tasti in alto</b><span>La striscia con i totali, la cifra da incassare e i tasti finali passa <b>sopra</b> invece che sotto. Di serie sta in basso, vicino al pollice; in alto e&grave; comoda a chi guarda prima la cifra e poi tocca.</span></span>
        <span class="switch"></span>
      </button>
      <button class="switch-row" id="setPieno" role="switch" style="margin-top:10px;">
        <span class="sw-txt"><b>Schermo intero</b><span>Toglie la barra di sistema del tablet, che copriva la parte bassa dell'app. Se l'app &egrave; installata, il tutto schermo parte al primo tocco.</span></span>
        <span class="switch"></span>
      </button>
      <button class="switch-row" id="setGrafica2" role="switch" style="margin-top:10px;">
        <span class="sw-txt"><b>&#127381; Grafica 2.0 <i>(in prova)</i></b><span>Toglie tre cose che si ripetono: il <b>pi&ugrave; e meno del pagato</b> dalla fascia Tempo (lo stesso numero della pastiglia &laquo;0/3&raquo; sui Bambini), i tre <b>Totale Parco/Crazy/Bar</b> in fondo (li fa gi&agrave; lo Scontrino, riga per riga), e chiama <b>Parco</b> il tasto che oggi dice &laquo;Modifica&raquo; ma apre proprio quella schermata. <b>Non tocca nessun dato</b>: si spegne e torna tutto come prima.</span></span>
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
        <div class="field"><label>Sforo condonato (min)</label><input type="number" inputmode="numeric" min="0" max="240" id="sSforo"></div>
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
    </div>

    <div class="card blk c-grigio">
      <h2><span class="em">\ud83d\udd04</span> Versione</h2>
      <div class="blk-in">
      <div class="ver-riga">
        <span class="ver-k">questa cassa ha la versione</span>
        <b class="ver-n" id="sVersione">\u2014</b>
      </div>
      <div class="hint">Serve quando due tavolette non si comportano uguale: se il numero &egrave; diverso, una &egrave; rimasta indietro. La copia offline si scambia da sola quando l\u2019app torna in primo piano, ma con questo tasto la si cerca subito.</div>
      <button class="btn btn-sm btn-block" id="sCerca">Cerca aggiornamenti adesso</button>
      <div class="hint" id="sCercaEsito" style="margin:8px 0 0; text-align:center;"></div>
      </div>
    </div>`;

  aggiornaCartaCloud();
  aggiornaCartaSicurezza();
  $('#sRegistro').onclick = () => fogliRegistro();

  /* la versione, e il tasto per andarsela a cercare senza aspettare */
  $('#sVersione').textContent = 'v' + VERSIONE;
  const esito = $('#sCercaEsito');
  $('#sCerca').onclick = () => {
    esito.textContent = 'Sto guardando\u2026';
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) {
      esito.textContent = 'Qui non c\u2019\u00e8 la copia offline: ricarica la pagina e basta.';
      return;
    }
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) { esito.textContent = 'Nessuna copia offline registrata: ricarica la pagina.'; return; }
      return reg.update().then(() => {
        if (reg.waiting) {
          esito.textContent = 'Trovata una versione nuova: la sto mettendo\u2026';
          pronto(reg);
          setTimeout(applicaVersione, 400);
        } else if (reg.installing) {
          esito.textContent = 'Sto scaricando la versione nuova\u2026';
        } else {
          esito.textContent = 'Sei gi\u00e0 all\u2019ultima: v' + VERSIONE + '.';
        }
      });
    }).catch(() => {
      esito.textContent = 'Non riesco a controllare: la tavoletta \u00e8 senza rete?';
    });
  };

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

  /* IL CONTO SOPRA O SOTTO: non c'e' una risposta giusta.
     Sotto e' dove arriva il pollice mentre l'altra mano fa altro, ed
     e' li' di serie. Sopra e' dove guarda chi legge prima la cifra e
     poi decide cosa toccare. Sono due modi di lavorare diversi, e
     litigarci e' inutile: si sceglie. */
  const cs = $('#setContoSu');
  const paintContoSu = () => {
    const on = !!settings.contoInAlto;
    $('.switch', cs).classList.toggle('on', on);
    cs.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  paintContoSu();
  cs.onclick = () => {
    settings.contoInAlto = !settings.contoInAlto;
    paintContoSu();
    saveSettings();
    applicaContoSu();
    adattaTutto();
  };

  /* LA GRAFICA 2.0 SI ACCENDE E SI SPEGNE SUBITO, e non tocca dati:
     cambia solo cosa viene disegnato. Quindi basta rifare le schermate
     -- la lista delle schede e il pannello, se e' aperto -- e chi era a
     meta' di un ingresso lo ritrova dov'era. */
  const g2 = $('#setGrafica2');
  const paintGrafica2 = () => {
    const on = !!settings.grafica2;
    $('.switch', g2).classList.toggle('on', on);
    g2.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  paintGrafica2();
  g2.onclick = () => {
    settings.grafica2 = !settings.grafica2;
    paintGrafica2();
    saveSettings();
    applyTheme();
    buildActiveView();
    markNewDirty();
    toast(settings.grafica2 ? 'Grafica 2.0 accesa 🆕' : 'Tornata la grafica di prima ↩︎');
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
  /* SOTTO QUANTI MINUTI DI SFORO SI PERDONA SENZA CHIEDERE. Allungando
     il tempo a chi e' gia' fuori, lo sforo si mangerebbe il tempo nuovo:
     sotto la soglia si condona da se', sopra si chiede. Quanto valga la
     pena perdonare lo sa il banco, non il codice. */
  bind('sSforo', 'sforoCondonato', 0, 240);
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
        applicaBackup(rd.result);
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
  /* LA GRAFICA 2.0 SI ANNUNCIA CON UNA CLASSE SOLA, cosi' tutto quello
     che cambia nell'aspetto sta in un posto solo del foglio di stile
     (`.g2 ...`) e spegnendo l'interruttore torna via da se'. Senza,
     ogni ritocco andrebbe sparso in venti `if` dentro il disegno, e
     tornare indietro non sarebbe piu' una cosa sicura. */
  document.documentElement.classList.toggle('g2', !!settings.grafica2);
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
    if (!draft.touched) mettiIngresso(draft, roundTo5(new Date()).getTime());
    /* il pannello torna a casa: se stava dentro una scheda che volava,
       posaSubito l'ha gia' rimesso qui sopra */
    /* «+ NUOVO» APRE SEMPRE SUL PARCO. Prima si ricordava l'ultima
       linguetta: uscendo dal Bar e tornando qui ci si trovava il bancone
       al posto dei bambini, cioe' la schermata che fa la cosa piu'
       frequente dell'app si apriva sulla seconda. Ognuna delle due
       linguette in alto adesso porta dove dice il suo nome. */
    montaPannello($('#view-new'), draft, { cat: 'Parco' });
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
  /* i giri di Crazy: una lista di numeri buoni, e la loro somma deve
     fare i giri pagati. Chi arriva da una versione vecchia non ha
     il campo e vale un giro solo con tutti dentro -- che e' anche la
     lettura giusta di quei dati: si segnava chi saliva, non quante
     volte. */
  o.crazyGiri = lista(o.crazyGiri).map(n => int(n, 9999)).filter(n => n > 0);
  if (o.crazyJumping > 0) o.crazyGiri = giriCrazy(o);
  else delete o.crazyGiri;
  /* da quando conta il tempo di parco: un orario vero, o niente -- e mai
     prima dell'ingresso, che sarebbe un tempo cominciato prima di
     entrare */
  const da = num(o.parcoDa, NaN);
  if (Number.isFinite(da) && da > 0) o.parcoDa = Math.max(da, num(o.startTime, 0));
  else delete o.parcoDa;
  /* il regalo dato a tempo scaduto: un orario vero, o niente */
  if (!Number.isFinite(num(o.regaloFinoA, NaN)) || num(o.regaloFinoA, 0) <= 0) delete o.regaloFinoA;
  /* LA PAUSA DEL TEMPO APERTO. `pausato` e' quanto sono stati fermi in
     tutto e non puo' essere negativo; `pausaDa` e' l'orologio fermo
     ADESSO, e o e' un orario vero o non c'e'. Un valore storto qui
     regalerebbe -- o ruberebbe -- ore di parco senza dire niente. */
  const gia = num(o.pausato, 0);
  if (Number.isFinite(gia) && gia > 0) o.pausato = Math.round(gia); else delete o.pausato;
  const fermo = num(o.pausaDa, NaN);
  /* fermo prima ancora di entrare non vuol dire niente */
  if (Number.isFinite(fermo) && fermo > 0) o.pausaDa = Math.max(fermo, num(o.startTime, 0));
  else delete o.pausaDa;
  /* E UN CONTO CHIUSO NON PUO' RESTARE COL CRONOMETRO FERMO. Da li' in
     poi nessuno lo guarda piu' e la pausa crescerebbe da sola. Si
     chiude ALL'ORA D'USCITA, non ad adesso: con `Date.now()` lo stesso
     dato riletto domani darebbe un numero diverso, e un ingresso
     archiviato deve raccontare sempre la stessa storia. */
  if (o.status === 'closed' && num(o.pausaDa, 0) > 0) {
    const fine = num(o.closedAt, num(o.pausaDa, 0));
    o.pausato = Math.max(0, num(o.pausato, 0)) + Math.max(0, fine - num(o.pausaDa, 0));
    if (!o.pausato) delete o.pausato;
    delete o.pausaDa;
  }
  /* la sigla e' due lettere maiuscole, o niente */
  o.sigla = /^[A-Z]{2,3}$/.test(String(o.sigla || '')) ? o.sigla : '';
  /* una vendita al banco resta tale anche dopo un ricaricamento */
  if (o.soloBar) {
    o.soloBar = true;
    if (!Number.isFinite(num(o.barFinoA, NaN))) o.barFinoA = num(o.createdAt, o.startTime) + ATTESA_SOLO_BAR;
  } else { delete o.soloBar; delete o.barFinoA; }
  /* LA NOTA E' UNA RIGA DI TESTO, e nient'altro. Dal cloud o da un
     salvataggio vecchio puo' arrivarci dentro qualunque cosa. */
  o.note = typeof o.note === 'string' ? o.note.slice(0, 500) : '';
  /* L'ORA D'INGRESSO DEV'ESSERE UN ORARIO VERO.
     Con un NaN li' dentro `endTimeOf` restituiva NaN, e da li' in poi
     tutti i confronti del countdown erano falsi: la scheda restava verde
     per sempre, cioe' un gruppo scaduto non lo diceva a nessuno. */
  if (!Number.isFinite(num(o.startTime, NaN))) {
    o.startTime = Number.isFinite(num(o.createdAt, NaN)) ? num(o.createdAt, 0) : Date.now();
  }
  /* L'OMAGGIO SI SETACCIA PER PRIMO, e l'ordine non e' un dettaglio.
     La riga qui sotto guarda l'omaggio per decidere se lo zero e' uno
     zero vero, ma se lo guardava PRIMA di averlo ripulito leggeva
     ancora il valore grezzo: un `omaggio: -10` risultava "c'e'", il
     tempo restava a zero, e alla lettura SUCCESSIVA -- con l'omaggio
     ormai ripulito a niente -- diventava un'ora. Lo stesso dato
     raccontava due storie a due riletture di fila, e l'ora d'uscita
     con lui. */
  o.omaggio = int(o.omaggio, 99999);
  if (!o.omaggio) delete o.omaggio;
  /* ZERO E' UN VALORE BUONO: e' chi non ha comprato tempo di parco --
     solo Crazy -- e la sua permanenza sta nei minuti in omaggio */
  o.durationMinutes = int(o.durationMinutes, 99999);
  if (!o.omaggio && !o.durationMinutes) o.durationMinutes = 60;
  o.baseMinutes = Math.max(1, int(o.baseMinutes, 99999) || o.durationMinutes);
  /* le vendite di tempo: una lista di numeri buoni, e mai piu' lunga
     del tempo che c'e' davvero */
  o.aggiunte = lista(o.aggiunte).map(m => int(m, 99999)).filter(m => m > 0);
  sistemaAggiunte(o);
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
     un ingresso da riparare.
     E per quello che nemmeno la riparazione regge c'e' la rete qui
     sotto: si perde QUELL'ingresso, con un grido nella console, invece
     di perdere il banco intero. Un ingresso in meno lo si rimette a
     mano; una lista che non si apre ferma la cassa. */
  const fatti = lista(list).filter(e => e && typeof e === 'object').map(e => {
   try {
    const o = Object.assign({
      status: 'active', barItems: [], barPaid: 0, parkPaid: false,
      braceletColor: null, braceletCustom: false, paidLines: {},
      children: 1, crazyJumping: 0, durationMinutes: 60, people: []
    }, e, {
      paidLines: e.paidLines || {},
      /* LE VOCI DEL BAR SI RIPULISCONO QUI, non piu' in giu'.
         `riparaConto` le setacciava gia', ma `traduciImporti` gira PRIMA
         di lui e leggeva `bi.qty` senza guardare se `bi` c'era: un null
         in mezzo alla lista -- da un backup rovinato o da una versione
         vecchia -- faceva saltare tutto l'elenco, non quell'ingresso. */
      barItems: lista(e.barItems).filter(b => b && typeof b === 'object'),
      people: lista(e.people).filter(p => p && typeof p === 'object')
        .map(p => (p.avatar = AV.normalize(p.avatar, p.role), p))
    });
    if (o.baseMinutes == null) o.baseMinutes = o.durationMinutes;
    /* LE NOTE VECCHIE, QUELLE SCRITTE SULLE PERSONE, SI RIVERSANO QUI.
       Erano un campo di chi accompagna; adesso la nota e' del gruppo. Si
       fa una volta sola -- se il gruppo una nota ce l'ha gia', non si
       tocca -- e le si mette in fila con lo stesso separatore con cui le
       mostrava la scheda, cosi' al banco si rilegge uguale a prima. */
    if (o.note == null) {
      const vecchie = lista(o.people).map(p => p && typeof p.note === 'string' ? p.note.trim() : '')
        .filter(Boolean);
      o.note = vecchie.join(' · ');
    }
    lista(o.people).forEach(p => { if (p && 'note' in p) delete p.note; });
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

   } catch (err) {
     console.error('ingresso illeggibile, lo salto', e && e.id, err);
     return null;
   }
  }).filter(Boolean);
  /* DUE GRUPPI DELLA STESSA GIORNATA NON POSSONO AVERE LA STESSA SIGLA.
     Da un tablet solo non capita -- si assegna la prima libera -- ma dal
     cloud si': due casse che registrano nello stesso momento pescano
     tutte e due la stessa. Una sigla che indica due gruppi e' peggio di
     nessuna sigla, quindi al secondo che arriva se ne da' un'altra.
     Vince chi e' entrato prima, che e' anche chi il bracciale ce l'ha
     gia' scritto addosso. */
  const perGiornata = new Map();
  const usateDi = (o) => {
    const g = giornataDi(num(o.startTime, num(o.createdAt, 0)));
    if (!perGiornata.has(g)) perGiornata.set(g, new Set());
    return perGiornata.get(g);
  };
  /* la prima libera fra quelle gia' prese in QUESTA giornata: due
     lettere, e se sono finite tre */
  const primaLibera = (usate) => {
    for (const x of SIGLA_LETTERE) for (const y of SIGLA_LETTERE) if (!usate.has(x + y)) return x + y;
    for (const x of SIGLA_LETTERE) for (const y of SIGLA_LETTERE) for (const z of SIGLA_LETTERE) {
      if (!usate.has(x + y + z)) return x + y + z;
    }
    return '';
  };
  const inOrdine = fatti.slice().sort((a, b) => num(a.createdAt, 0) - num(b.createdAt, 0));
  /* prima chi una sigla ce l'ha gia': se la tiene, ed e' giusto -- ce
     l'ha scritta addosso sul bracciale */
  inOrdine.forEach(o => {
    if (!o.sigla) return;
    const usate = usateDi(o);
    if (!usate.has(o.sigla)) { usate.add(o.sigla); return; }
    /* doppione: al secondo arrivato se ne da' un'altra */
    o.sigla = primaLibera(usate);
    if (o.sigla) usate.add(o.sigla);
  });
  /* POI CHI NON CE L'HA. Sono gli ingressi registrati prima che le
     sigle esistessero: senza questo restavano senza per sempre, e in
     lista si vedeva il codice solo sui nuovi -- cioe' proprio quando
     serve indicarne uno a voce, meta' dei gruppi non ne aveva.
     Ne prendono una a testa, in ordine di arrivo. */
  inOrdine.forEach(o => {
    if (o.sigla) return;
    const usate = usateDi(o);
    o.sigla = primaLibera(usate);
    if (o.sigla) usate.add(o.sigla);
  });
  return fatti;
}

function init() {
  settings = Object.assign(defaultSettings(), load(SK.settings) || {});
  aggiornaListinoFinto();
  /* IL GIALLO A CINQUE MINUTI, ANCHE SU CHI HA GIA' L'APP.
     Il valore di serie era dieci ed e' rimasto salvato su ogni
     tavoletta: cambiare il valore di serie non tocca chi c'e' gia'.
     Si sposta una volta sola -- e solo se e' ancora esattamente dieci,
     cioe' quello vecchio di serie -- e si segna che e' stato fatto:
     se poi qualcuno rimette dieci apposta, resta dieci. */
  if (!settings.avvisoCinque) {
    if (num(settings.warnBeforeMinutes, 10) === 10) settings.warnBeforeMinutes = 5;
    settings.avvisoCinque = true;
    save(SK.settings, settings);
  }
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
    settings.quickDurations = defaultSettings().quickDurations.slice();
  }
  /* I TAGLI NUOVI, ANCHE SU CHI HA GIA' L'APP.
     Come il listino del bar: i tagli stanno SALVATI su ogni tavoletta,
     quindi cambiare quelli di serie non tocca chi c'e' gia' e le casse
     resterebbero con 15/30/1h/1h30 per sempre.
     Si cambiano solo se sono ancora quelli VECCHI DI SERIE, cioe' se
     nessuno li ha toccati: chi se li e' messi a modo suo se li tiene,
     che sono roba sua. E si fa una volta sola. */
  if (!settings.tagliNuovi) {
    const vecchi = [15, 30, 60, 90].join(',');
    if (lista(settings.quickDurations).join(',') === vecchi) {
      settings.quickDurations = defaultSettings().quickDurations.slice();
    }
    settings.tagliNuovi = true;
    save(SK.settings, settings);
  }
  /* IL BANCO DEGLI AMARI, ANCHE SU CHI HA GIA' L'APP.
     Il listino sta SALVATO su ogni tavoletta: cambiare quello di serie
     non tocca chi c'e' gia', e le casse sarebbero rimaste con "Amari"
     e "Grappa" per sempre. Si rifa' una volta sola -- e si segna che e'
     stato fatto, se no il giorno che qualcuno toglie una voce se la
     ritrova il lunedi' dopo.
     Quello che il banco si e' aggiunto da se' negli Alcolici resta, in
     coda: e' roba sua, non nostra. */
  if (!settings.amariNuovi && Array.isArray(settings.barMenu)) {
    const nuovi = defaultSettings().barMenu.filter(v => v.cat === 'Alcolici');
    const via = nuovi.map(v => v.id).concat(['b17', 'b18', 'b19']);
    const suoi = settings.barMenu.filter(v => v.cat === 'Alcolici' && via.indexOf(v.id) < 0);
    settings.barMenu = settings.barMenu.filter(v => v.cat !== 'Alcolici').concat(nuovi, suoi);
    settings.amariNuovi = true;
    save(SK.settings, settings);
  }
  entries = normalizeEntries(load(SK.entries));
  /* IL FOGLIO E' NATO PRIMA DI LEGGERE GLI INGRESSI, quindi la sua sigla
     l'ha scelta guardando una lista vuota: adesso che si sa chi c'e' si
     rimette in pari. Senza, il primo gruppo registrato dopo ogni riavvio
     si prendeva la sigla di uno che era gia' dentro. */
  draft.sigla = siglaLibera(draft.sigla, draft.startTime);
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


  /* Il numero di versione nella barra. Stesso VERSIONE della carta nelle
     Impostazioni -- letto dal `?v=` con cui e' stato caricato app.js --
     cosi' i due non possono dire cose diverse. */
  const pill = $('#verPill');
  if (pill) {
    pill.textContent = 'Ver ' + VERSIONE;
    pill.title = 'Versione di questa cassa. Se due tavolette hanno numeri diversi, una è rimasta indietro.';
  }

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
  /* L'APP PARTE COMUNQUE, ANCHE SE L'ARCHIVIO NON RISPONDE.
     Qui si aspetta apposta -- la memoria veloce e' vuota e i dati
     potrebbero stare solo in archivio, quindi partire prima vorrebbe
     dire mostrare un banco vuoto a chi i dati ce li ha. Ma aspettare
     SENZA UN LIMITE vuol dire schermata bianca per sempre il giorno che
     IndexedDB non risponde (archivio bloccato da un'altra scheda, spazio
     esaurito, permessi negati). Tre secondi e si parte lo stesso: se
     l'archivio risponde dopo, il recupero lo si fa al ricaricamento. */
  let partito = false;
  const vai = (r) => {
    if (partito) return;
    partito = true;
    init();
    if (r && r.ripristinate && r.ripristinate.length) {
      const n = lista(load(SK.entries)).length;
      toast('Dati recuperati dall’archivio: ' + n + ' ingressi ♻️');
    }
  };
  setTimeout(() => vai(null), 3000);
  DATI.avvia([SK.entries, SK.settings, SK.presets]).then(vai).catch(() => vai(null));
}

partenza();

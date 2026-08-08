/* ============================================================
   L'ICONA E LA FIGURA DEVONO DIRE LA STESSA COSA

   A destra scegli un capo guardando un'icona; a sinistra la figura lo
   indossa. Se le due si scollano, l'app mente: hai scelto la camicia e
   la bambina porta una maglietta. E' un bug che nessuno segnala perche'
   sembra solo "un disegno un po' diverso", pero' poi al banco chi
   cerca il bambino guarda la figura e non trova nessuno.

   Qui si carica il codice VERO — js/avatar.js e js/capi.js — e si
   controlla che le due parti raccontino la stessa storia.
   ============================================================ */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, '..');

const ctx = { console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/avatar.js', 'js/capi.js']) {
  vm.runInContext(readFileSync(join(RADICE, f), 'utf8'), ctx, { filename: f });
}
const AV = ctx.AV;
const CAPI = ctx.CAPI;

/* ---------- l'impalcatura ---------- */
let ok = 0, ko = 0, gruppi = 0;
const rotti = [];
function gruppo(t) { gruppi++; console.log('\n━━ ' + t); }
function prova(t, cond, extra) {
  if (cond) { ok++; console.log('   ok   ' + t); }
  else { ko++; rotti.push(t); console.log('   NO   ' + t + (extra ? '\n        ' + extra : '')); }
}

/* ---------- attrezzi ---------- */
const VERDE = '#22C55E';

function figura(top, sotto, colore) {
  const av = AV.normalize({
    role: 'altro',
    top: { style: top, color: colore || VERDE, color2: '#F4F6F8', pattern: 'solid' },
    pants: { style: sotto || 'pantaloni', color: colore || VERDE, color2: '#F4F6F8', pattern: 'solid' }
  });
  return AV.build(av, {});
}
const icona = (capo, colore) => CAPI.capo(capo, colore || VERDE, 'solid', 48) || '';

/* La figura porta un identificativo diverso a ogni disegno (a1, a2...)
   per non far scontrare i pattern: va tolto, altrimenti due disegni
   identici sembrano diversi. */
const nudo = s => s.replace(/a\d+/g, 'aN');

/* Quante volte compare un cerchio di QUEL colore: e' cosi' che si
   contano i bottoni senza confonderli con gli occhi o le mani. */
function cerchi(svg, col) {
  const r = new RegExp('<circle[^>]*fill="' + col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'gi');
  return (svg.match(r) || []).length;
}

/* Legge la SAGOMA dell'icona e dice da sola se quel capo ha le maniche
   corte, lunghe o niente maniche — senza che glielo si dica. Il punto
   piu' a sinistra e' la punta della manica; se sta in basso non e' una
   manica ma l'orlo svasato di una gonna o di un vestito. */
function manicheDellIcona(capo) {
  const svg = icona(capo);
  const d = (svg.match(/<path d="([^"]+)"/) || [])[1] || '';
  const punti = [];
  const numeri = d.match(/-?\d+(\.\d+)?/g) || [];
  for (let i = 0; i + 1 < numeri.length; i += 2) punti.push([+numeri[i], +numeri[i + 1]]);
  if (!punti.length) return '?';
  let punta = punti[0];
  for (const p of punti) if (p[0] < punta[0]) punta = p;
  if (punta[0] > 13) return 'nessuna';        // spalle scoperte
  if (punta[1] > 25) return 'nessuna';        // e' l'orlo che si allarga, non una manica
  let giu = punta[1];
  for (const p of punti) if (p[0] <= punta[0] + 6 && p[1] > giu) giu = p[1];
  return (giu - punta[1]) > 12 ? 'lunghe' : 'corte';
}

/* ============================================================ */
gruppo('Ogni capo ha la sua icona');
const SOPRA = AV.TOP.map(t => t.key);
const SOTTO = AV.PANTS.map(t => t.key);
for (const k of SOPRA.concat(SOTTO)) {
  const s = icona(k);
  prova('icona di ' + k, s.slice(0, 4) === '<svg' && s.length > 300, 'lunga ' + s.length);
}

/* ============================================================ */
gruppo('Scegliere un capo cambia DAVVERO la figura');
const vistiSopra = new Map();
for (const k of SOPRA) {
  const s = nudo(figura(k, 'pantaloni'));
  const gemello = vistiSopra.get(s);
  prova('il sopra "' + k + '" si distingue', !gemello, gemello ? 'identico a ' + gemello : '');
  vistiSopra.set(s, k);
}
const vistiSotto = new Map();
for (const k of SOTTO) {
  const s = nudo(figura('maglietta', k));
  const gemello = vistiSotto.get(s);
  prova('il sotto "' + k + '" si distingue', !gemello, gemello ? 'identico a ' + gemello : '');
  vistiSotto.set(s, k);
}

/* ============================================================ */
gruppo('Le maniche: icona e figura d’accordo');
for (const t of AV.TOP) {
  const dichiarate = t.maniche;
  prova(t.key + ': la lunghezza è dichiarata',
    dichiarate === 'corte' || dichiarate === 'lunghe' || dichiarate === 'nessuna', String(dichiarate));

  const disegnate = manicheDellIcona(t.key);
  prova(t.key + ': l’icona disegna maniche ' + dichiarate,
    disegnate === dichiarate, 'l’icona ne disegna ' + disegnate);

  /* e la figura? il polsino, l'orlo o niente */
  const f = figura(t.key, 'pantaloni');
  const polsino = f.indexOf('M25.4 92.6') >= 0;
  const orlo = f.indexOf('M25.2 87.6') >= 0;
  const pelleAvambraccio = f.indexOf('M25 88 Q25 96') >= 0;
  const atteso = {
    lunghe: polsino && !orlo && !pelleAvambraccio,
    corte: orlo && !polsino && pelleAvambraccio,
    nessuna: !polsino && !orlo && !pelleAvambraccio
  }[dichiarate];
  prova(t.key + ': la figura porta maniche ' + dichiarate, !!atteso,
    'polsino=' + polsino + ' orlo=' + orlo + ' avambraccio=' + pelleAvambraccio);
}

/* ============================================================ */
gruppo('I bottoni contati: quelli dell’icona e quelli addosso');
/* Se l'icona mostra tre bottoni e la figura ne porta due, la camicia
   non e' la stessa camicia. */
const BOTTONI = [
  { capo: 'polo', scarto: -52, quanti: 2 },
  { capo: 'camicia', scarto: -54, quanti: 3 },
  { capo: 'gilet', scarto: -54, quanti: 3 },
  { capo: 'giacca', scarto: -54, quanti: 2 },
  { capo: 'felpa', scarto: -50, quanti: 2 }    // occhielli dei laccetti
];
for (const b of BOTTONI) {
  const col = AV.shade(VERDE, b.scarto);
  const ni = cerchi(icona(b.capo), col);
  const nf = cerchi(figura(b.capo, 'pantaloni'), col);
  prova(b.capo + ': ' + b.quanti + ' nell’icona', ni === b.quanti, 'trovati ' + ni);
  prova(b.capo + ': ' + b.quanti + ' sulla figura', nf === b.quanti, 'trovati ' + nf);
}

/* ============================================================ */
gruppo('Le tinte: la figura usa le STESSE sfumature dell’icona');
/* Non basta che il colore sia quello: se l'icona fa il colletto con
   shade(-30) e la figura con shade(-46), a occhio sono due capi
   diversi. Qui si chiede che ogni tinta usata dall'icona compaia
   anche addosso. */
for (const t of AV.TOP) {
  const svgI = icona(t.key);
  const svgF = figura(t.key, 'pantaloni');
  const tinte = [...new Set(svgI.match(/#[0-9A-Fa-f]{6}/g) || [])]
    .filter(c => c.toUpperCase() !== '#E3B04B');       // il filo dei jeans non c'entra
  const mancanti = tinte.filter(c => svgF.toUpperCase().indexOf(c.toUpperCase()) < 0);
  prova(t.key + ': nessuna tinta persa per strada', mancanti.length === 0, 'mancano ' + mancanti.join(' '));
}
for (const p of SOTTO) {
  const svgI = icona(p);
  const svgF = figura('canotta', p);
  const tinte = [...new Set(svgI.match(/#[0-9A-Fa-f]{6}/g) || [])];
  const mancanti = tinte.filter(c => svgF.toUpperCase().indexOf(c.toUpperCase()) < 0);
  prova(p + ': nessuna tinta persa per strada', mancanti.length === 0, 'mancano ' + mancanti.join(' '));
}

/* ============================================================ */
gruppo('Il vestito lungo copre le gambe, il corto no');
{
  const a = nudo(figura('vestitolungo', 'pantaloni'));
  const b = nudo(figura('vestitolungo', 'gonna'));
  prova('col vestito lungo il sotto non si vede', a === b);

  const c = nudo(figura('vestito', 'pantaloni'));
  const d = nudo(figura('vestito', 'gonna'));
  prova('col vestito corto il sotto si vede eccome', c !== d);

  const lungo = figura('vestitolungo', 'pantaloni');
  const corto = figura('vestito', 'pantaloni');
  prova('il lungo arriva piu’ in basso del corto',
    lungo.indexOf('136') >= 0 && corto.indexOf('114') >= 0);
}

/* ============================================================ */
gruppo('Il colore scelto arriva davvero addosso');
for (const k of SOPRA) {
  const a = nudo(figura(k, 'pantaloni', '#E23D4B'));
  const b = nudo(figura(k, 'pantaloni', '#2547C4'));
  prova('il sopra "' + k + '" cambia colore', a !== b);
}
for (const k of SOTTO) {
  const a = nudo(figura('canotta', k, '#E23D4B'));
  const b = nudo(figura('canotta', k, '#2547C4'));
  prova('il sotto "' + k + '" cambia colore', a !== b);
}

/* ============================================================ */
gruppo('Niente disegni rotti in nessuna combinazione');
{
  /* Tutte le combinazioni sopra × sotto, una per una: un tag lasciato
     aperto o un numero diventato NaN non si vede quasi mai a occhio,
     ma il disegno esce storto proprio sulla combinazione che nessuno
     ha provato a mano. */
  let storte = [];
  for (const k of SOPRA) {
    for (const p of SOTTO) {
      const f = figura(k, p);
      const aperti = (f.match(/<path|<circle|<rect|<line|<ellipse/g) || []).length;
      const chiusi = (f.match(/\/>/g) || []).length;
      if (aperti !== chiusi) storte.push(k + '+' + p + ' (' + aperti + ' aperti, ' + chiusi + ' chiusi)');
      else if (/NaN|undefined|\[object/.test(f)) storte.push(k + '+' + p + ' (numeri o pezzi mancanti)');
    }
  }
  prova('tutte le ' + (SOPRA.length * SOTTO.length) + ' combinazioni disegnano pulito',
    storte.length === 0, storte.slice(0, 6).join('; '));
}

/* ============================================================
   E ORA L'APP VERA: la scheda "Chi accompagna" del banco deve
   mostrare le STESSE icone della pagina di studio, non le emoji.
   ============================================================ */
const { caricaApp } = await import('./ambiente.mjs');
const app = caricaApp();

function persona(top, sotto, colore) {
  return {
    id: 'x1', role: 'mamma', name: '', note: '', tocco: false,
    avatar: app.AV.normalize({
      role: 'mamma',
      top: { style: top || 'maglietta', color: colore || VERDE, color2: '#F4F6F8', pattern: 'solid' },
      pants: { style: sotto || 'pantaloni', color: colore || VERDE, color2: '#F4F6F8', pattern: 'solid' }
    }, 'mamma')
  };
}
const conta = (s, re) => (s.match(re) || []).length;
/* Ogni fantasia disegnata si porta dietro un identificativo nuovo
   (k1, k2...) per non pestare i piedi alle altre sulla stessa pagina:
   va tolto, altrimenti due disegni identici sembrano diversi. */
const senzaId = s => s.replace(/k\d+/g, 'kN').replace(/a\d+/g, 'aN');

gruppo('La scheda del banco: c’è tutto e nell’ordine giusto');
{
  const vuoto = app.armadioDi(null, '');
  prova('senza nessuno spiega cosa fare', vuoto.indexOf('invito') >= 0);

  const h = app.armadioDi(persona(), '');
  prova('la figura c’è', conta(h, /<svg/g) > 0 && h.indexOf('class="figura"') >= 0);
  prova('il campo del nome c’è', h.indexOf('data-campo="name"') >= 0);
  prova('tutti i ' + SOPRA.length + ' capi di sopra', conta(h, /data-top="/g) === SOPRA.length);
  prova('tutte le ' + AV.PATTERNS.length + ' fantasie', conta(h, /data-pat="/g) === AV.PATTERNS.length);
  prova('tutti gli ' + SOTTO.length + ' capi di sotto', conta(h, /data-pants="/g) === SOTTO.length);
  prova('i 2 accessori in coda al sotto', conta(h, /data-acc="/g) === 2);
  prova('le tinte: ' + AV.COLORS.length + ' × 2 gruppi',
    conta(h, /data-col="top\|/g) === AV.COLORS.length &&
    conta(h, /data-col="pants\|/g) === AV.COLORS.length);
  prova('le due ruote per la tinta che manca', conta(h, /data-ruota="/g) === 2);
  prova('la riga libera grande in fondo',
    h.indexOf('libero grosso') >= 0 && h.indexOf('data-campo="note"') >= 0);

  /* OGNI FILA HA TANTE COLONNE QUANTI PULSANTI.
     Le colonne sono scritte nello style perché sono un dato, ma il
     numero va ricavato da quello che c'è dentro: era scritto "+ 4" da
     quando gli accessori erano quattro, e tolti cappello e zaino la
     fila del sotto teneva dodici colonne per dieci pulsanti. Due posti
     vuoti in fondo, e tutti i pulsanti del sotto più stretti di quelli
     del sopra — a occhio si vede benissimo, ma nessun test lo diceva. */
  const colonneDi = (blocco) => {
    const m = h.slice(h.indexOf(blocco)).match(/repeat\((\d+),1fr\)/);
    return m ? +m[1] : 0;
  };
  const fila = (dopo, quali) => {
    const pezzo = h.slice(h.indexOf(dopo));
    const fine = pezzo.indexOf('</div>', pezzo.indexOf('</button>'));
    return (pezzo.slice(0, pezzo.lastIndexOf('</div>')).match(quali) || []).length;
  };
  const sopraCol = colonneDi('<span class="et">Sopra');
  const sottoCol = colonneDi('<span class="et">Sotto');
  prova('il sopra: ' + SOPRA.length + ' pulsanti in ' + sopraCol + ' colonne',
    sopraCol === SOPRA.length);
  prova('il sotto: ' + (SOTTO.length + 2) + ' pulsanti in ' + sottoCol + ' colonne',
    sottoCol === SOTTO.length + 2);
  prova('e nessuna delle due fila lascia posti vuoti',
    sopraCol === conta(h, /data-top="/g) &&
    sottoCol === conta(h, /data-pants="/g) + conta(h, /data-acc="/g));
  prova('le fantasie: ' + AV.PATTERNS.length + ' in altrettante colonne',
    colonneDi('<span class="et">Fantasia') === AV.PATTERNS.length);
  prova('le tinte: ' + AV.COLORS.length + ' più la ruota',
    colonneDi('<span class="et">Colore del sopra') === AV.COLORS.length + 1);

  /* l'ordine conta: prima il sopra, poi la SUA fantasia, poi il SUO
     colore, e solo dopo il sotto. Con le tinte tutte in fondo si
     sbagliava capo un tocco su tre. */
  const dove = (s) => h.indexOf(s);
  prova('l’ordine è sopra → fantasia → colore → sotto → colore',
    dove('data-top="') < dove('data-pat="') &&
    dove('data-pat="') < dove('data-col="top|') &&
    dove('data-col="top|') < dove('data-pants="') &&
    dove('data-pants="') < dove('data-col="pants|'));
}

gruppo('Nell’editor niente emoji: solo i capi disegnati');
{
  const h = app.armadioDi(persona(), '');
  /* Le emoji vanno benissimo dappertutto TRANNE qui: 👕 e 🧥 al banco
     sono la stessa macchia, e nessuna emoji sa dire di che colore è il
     capo che stai per mettere. */
  const emoji = [...AV.TOP, ...AV.PANTS].map(t => t.em).filter(Boolean);
  const dentro = [...new Set(emoji)].filter(e => h.indexOf(e) >= 0);
  prova('nessuna emoji di capo nella scheda', dentro.length === 0, 'trovate ' + dentro.join(' '));
  prova('un disegno per ogni capo e accessorio',
    conta(h, /<svg/g) >= SOPRA.length + SOTTO.length + 2);
}

gruppo('Il pulsante mostra ESATTAMENTE il capo che finirà addosso');
{
  /* Se il pulsante disegna una cosa e la figura ne indossa un'altra,
     siamo punto e a capo. Qui si prende il disegno dentro il pulsante
     e lo si confronta con quello che l'icona produce da sola. */
  for (const pat of ['solid', 'stripes-h', 'fiori']) {
    for (const colore of ['#E23D4B', '#2547C4']) {
      const p = persona('camicia', 'jeans', colore);
      p.avatar.top.pattern = pat;
      p.avatar.pants.pattern = pat;
      const h = senzaId(app.armadioDi(p, ''));
      let storti = [];
      for (const k of SOPRA) {
        if (h.indexOf(senzaId(app.CAPI.capo(k, colore, pat, 46))) < 0) storti.push('sopra:' + k);
      }
      for (const k of SOTTO) {
        if (h.indexOf(senzaId(app.CAPI.capo(k, colore, pat, 44))) < 0) storti.push('sotto:' + k);
      }
      prova('col ' + pat + ' in ' + colore + ' i pulsanti disegnano il capo vero',
        storti.length === 0, storti.slice(0, 4).join(' '));
    }
  }
}

gruppo('Il vestito lungo spegne i sotto, il corto no');
{
  const lungo = app.armadioDi(persona('vestitolungo'), '');
  const corto = app.armadioDi(persona('vestito'), '');
  prova('col lungo i pantaloni si spengono', lungo.indexOf('spento-capi') >= 0);
  prova('col lungo lo dice anche a parole', lungo.indexOf('col vestito lungo non serve') >= 0);
  prova('col corto i pantaloni restano vivi', corto.indexOf('spento-capi') < 0);
  /* ma gli accessori NON si spengono mai: capelli e scarpe ce li ha
     anche chi porta il vestito lungo */
  prova('gli accessori restano toccabili anche col lungo', conta(lungo, /data-acc="/g) === 2);
}

gruppo('Gli accessori: si mettono, si tolgono, e si vedono addosso');
{
  const ACC = ['capelli', 'scarpe'];
  for (const a of ACC) {
    const p = persona();
    const prima = app.AV.build(p.avatar);
    app.accMetti(p.avatar, a, '#EC4899');
    const dopo = app.AV.build(p.avatar);
    prova(a + ': messo, si vede sulla figura', prima !== dopo && dopo.indexOf('#EC4899') >= 0);

    app.accTogli(p.avatar, a, 'mamma');
    const via = app.AV.build(p.avatar);
    prova(a + ': tolto, sparisce dalla figura', via.indexOf('#EC4899') < 0);
  }

  /* la tavolozza si apre su UNO solo, quello toccato */
  const p = persona();
  const chiusa = app.armadioDi(p, '');
  const aperta = app.armadioDi(p, 'scarpe');
  prova('senza tocchi nessuna tavolozza aperta', chiusa.indexOf('class="volante"') < 0);
  prova('toccate le scarpe, si apre la loro', conta(aperta, /class="volante"/g) === 1 &&
    aperta.indexOf('data-acccol="scarpe|') >= 0);
  prova('la tavolozza ha tutte le ' + AV.COLORS.length + ' tinte, la ruota e il togli',
    conta(aperta, /data-acccol="/g) === AV.COLORS.length &&
    aperta.indexOf('data-accruota="scarpe"') >= 0 &&
    aperta.indexOf('data-accvia="scarpe"') >= 0);
}

gruppo('I dati di prima continuano a funzionare');
{
  /* Chi è già registrato ha un avatar salvato col guardaroba VECCHIO:
     deve continuare a comparire, non sparire né far saltare la
     schermata. */
  const vecchi = [
    { top: { style: 'maglietta', color: '#0EA5E9', pattern: 'solid' }, pants: { style: 'pantaloni', color: '#2547C4' } },
    { top: { style: 'felpa', color: '#E23D4B', pattern: 'diag' }, pants: { style: 'gonna', color: '#FBBF24' } },
    { top: { style: 'unaCosaCheNonEsiste', color: '#123456' }, pants: { style: 'boh' } },
    { top: null, pants: undefined },
    {}
  ];
  for (let i = 0; i < vecchi.length; i++) {
    let esito = '';
    try {
      const p = { id: 'v' + i, role: 'papa', name: 'Gio', note: '', avatar: app.AV.normalize(vecchi[i], 'papa') };
      const h = app.armadioDi(p, '');
      esito = (h.indexOf('class="armadio"') >= 0 && conta(h, /data-top="/g) === SOPRA.length) ? '' : 'scheda incompleta';
    } catch (e) { esito = e.message; }
    prova('avatar vecchio n.' + (i + 1) + ': la scheda si apre lo stesso', esito === '', esito);
  }
}

gruppo('I due capi tolti non fanno sparire nessuno');
{
  /* maglione e giubbotto se ne sono andati per far posto agli altri.
     Chi li ha addosso nei dati salvati NON deve ritrovarsi in
     maglietta a gennaio: diventano quello a cui somigliavano. */
  const dove = (vecchio) => app.AV.normalize({ top: { style: vecchio, color: VERDE } }, 'altro').top.style;
  prova('il maglione diventa una manica lunga', dove('maglione') === 'manicalunga', dove('maglione'));
  prova('il giubbotto diventa una giacca', dove('giubbotto') === 'giacca', dove('giubbotto'));
  prova('un capo che non è mai esistito ripiega sulla maglietta', dove('sombrero') === 'maglietta');
  prova('nell’elenco non ci sono più', SOPRA.indexOf('maglione') < 0 && SOPRA.indexOf('giubbotto') < 0);
  prova('restano dieci capi di sopra', SOPRA.length === 10, String(SOPRA.length));
}

gruppo('La giacca ha la cravatta, di qua e di là');
{
  /* è lei a farla riconoscere: i risvolti da soli, a due centimetri,
     si confondono con un colletto qualunque */
  const crav = app.AV.coloreFantasia(VERDE);
  prova('la cravatta c’è nell’icona', app.CAPI.capo('giacca', VERDE, 'solid', 46).indexOf(crav) >= 0);
  prova('la cravatta c’è sulla figura', figura('giacca', 'pantaloni').indexOf(crav) >= 0);
  prova('e non finisce sugli altri capi',
    figura('camicia', 'pantaloni').indexOf('M46.8 76.4') < 0);
}

gruppo('Capelli e scarpe: spenti finché non li scegli tu');
{
  /* Ce li hanno tutti, quindi partivano sempre accesi: due pastiglie
     bianche che dicevano "selezionato" senza che nessuno avesse
     selezionato niente. */
  const p = persona();
  const spento = app.armadioDi(p, '');
  prova('appena aperto nessun accessorio è acceso',
    conta(spento, /class="capo acc-b on"/g) === 0);

  app.segna(p, 'scarpe');
  const acceso = app.armadioDi(p, '');
  prova('scelte le scarpe, si accendono quelle',
    conta(acceso, /class="capo acc-b on"/g) === 1 &&
    acceso.indexOf('acc-b on" data-acc="scarpe"') >= 0);
  prova('e i capelli restano spenti', acceso.indexOf('acc-b on" data-acc="capelli"') < 0);
}

gruppo('Quello che scegli torna scritto sulla scheda');
{
  /* La descrizione sotto il nome ("Camicia rossa · Jeans blu") è quello
     che si legge all'uscita per riconoscere il gruppo. Dice solo i
     pezzi toccati a mano: l'armadio nuovo non li segnava più, e la
     descrizione era sparita da tutte le schede. */
  const p = persona('camicia', 'jeans', '#E23D4B');
  p.avatar.scelti = {};
  prova('senza scelte non promette niente', app.AV.traits(p.avatar, 3, true).length === 0);

  app.segna(p, 'maglietta');
  const uno = app.AV.traits(p.avatar, 3, true).map(t => t.txt);
  prova('scelto il sopra, il sopra si legge', uno.length === 1 && /Camicia/i.test(uno[0]), uno.join(' · '));
  prova('e ne dice il colore', /ross/i.test(uno[0]), uno[0]);

  app.segna(p, 'pantaloni');
  const due = app.AV.traits(p.avatar, 3, true).map(t => t.txt);
  prova('scelto il sotto, si legge anche quello', due.length === 2 && /Jeans/i.test(due[1]), due.join(' · '));

  p.avatar.top.pattern = 'stripes-h';
  app.segna(p, 'maglietta');
  prova('e la fantasia entra nella frase',
    /righe/i.test(app.AV.traits(p.avatar, 3, true)[0].txt),
    app.AV.traits(p.avatar, 3, true)[0].txt);

  app.segna(p, 'capelli');
  prova('anche i capelli, se li scegli',
    app.AV.traits(p.avatar, 5, true).some(t => /capell|cod|frang|pelat|ricc|liscio|corti|medi|lungh/i.test(t.txt)),
    app.AV.traits(p.avatar, 5, true).map(t => t.txt).join(' · '));

  prova('segnare accende anche il "toccato"', p.tocco === true);
}

/* ============================================================
   LA SCALA: tutto dentro lo schermo, e il conto fermo in fondo
   ============================================================ */
gruppo('Quanto rimpicciolire, e quanto vuoto lasciare sopra');
{
  const k = app.scalaChe;
  prova('se ci sta, non si tocca niente', k(400, 800) === 1 && k(800, 800) === 1);
  prova('se non ci sta, si riduce quel tanto', Math.abs(k(1000, 800) - 0.8) < 1e-9);
  prova('non si rimpicciolisce mai sotto il leggibile', k(10000, 800) === 0.6);
  prova('non si ingrandisce mai oltre il naturale', k(100, 800) === 1);
  /* una divisione al contrario e il pannello raddoppierebbe invece di
     ridursi: e' l'errore che questo gruppo esiste per prendere */
  prova('non torna mai un valore piu’ grande di 1',
    [[1, 900], [900, 1], [0, 0], [-5, 800], [800, -5], [NaN, 800]]
      .every(([v, h]) => { const r = k(v, h); return r <= 1 && r >= 0.6; }));

  /* Il vuoto in cima e' il bersaglio per chiudere: deve esserci sempre,
     ma stretto — ogni pixel qui e' un pixel in meno per il pannello,
     che dentro la scheda deve venire grande quasi quanto in "+ Nuovo". */
  const sopra = app.spazioSopra;
  prova('il vuoto sopra c’è sempre, e si prende col pollice', sopra() >= 40);
  prova('e non si mangia la scheda', sopra() <= 60);
}

/* ---------- il verdetto ---------- */
console.log('\n' + '━'.repeat(52));
if (ko) {
  console.log('  ' + ko + ' CONTROLLI ROTTI su ' + (ok + ko) + '\n  - ' + rotti.join('\n  - '));
  process.exit(1);
}
console.log('  TUTTO A POSTO — ' + ok + ' controlli, ' + gruppi + ' gruppi');

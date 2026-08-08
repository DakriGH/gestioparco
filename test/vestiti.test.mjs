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
  /* Senza nessuno il riquadro resta BASSO e muto: questa schermata si usa
     anche solo per il bar o per il solo Crazy, e una spiegazione lunga
     su chi mettere, sempre a video, e' rumore le volte in cui non serve.
     La riga dei ruoli sopra dice gia' cosa si puo' fare. */
  const vuoto = app.armadioDi(null, '');
  prova('senza nessuno non scrive niente', vuoto === '', 'lungo ' + vuoto.length);

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
  /* la fila dei colori non ha piu' l'etichetta sopra -- una fila di
     pastiglie colorate attaccata sotto i capi non puo' essere altro --
     quindi la si cerca a partire dai capi che la precedono */
  prova('le tinte: ' + AV.COLORS.length + ' più la ruota',
    colonneDi('data-pat="' + AV.PATTERNS[AV.PATTERNS.length - 1].key) === AV.COLORS.length + 1);
  prova('e le etichette dei colori non ci sono piu', h.indexOf('Colore del') < 0);

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
gruppo('La fascia del tempo: una sola, e dice fin quando e pagato');
{
  /* Il pannello nasce da una stringa di HTML e poi il codice ne cerca
     i pezzi con querySelector. Se una classe manca, la ricerca torna
     null e il tasto muore in silenzio -- non se ne accorge nessuno
     finche' qualcuno non lo preme. Il finto browser dei test risponde
     null a tutto, quindi il pannello non si puo' costruire davvero:
     si legge il modello di partenza, che e' esattamente quello che poi
     finisce a video. */
  const sorg = readFileSync(join(RADICE, 'js/app.js'), 'utf8');
  const modello = sorg.slice(sorg.indexOf('<div class="pc-scala">'),
                             sorg.indexOf('<div class="pc-fondo">'));
  const ha = (x) => modello.includes(x);
  prova('la fascia del tempo c e', ha('sec-tempo'));
  prova('ed e una sola', modello.split('sec-tempo').length - 1 === 1);
  prova('le vecchie due fasce non ci sono piu', !ha('time-row') && !ha('sec-dur'));
  prova('c e l ora d ingresso', ha('pc-ora'));
  prova('c e l ora di uscita', ha('pc-fine'));
  prova('c e il filo del pagato', ha('pc-filo'));
  prova('c e il posto della pastiglia del pagato', ha('pc-pag"'));
  prova('c e la pastiglia del bracciale', ha('brc-b') && ha('pc-pallo') && ha('pc-bracnome'));
  prova('i sei tasti stanno nel menu, e il menu nasce chiuso',
    /brc-menu hidden[\s\S]{0,220}pc-brac/.test(modello));
  prova('i tagli rapidi ci sono ancora', ha('pc-dur"'));
  prova('il campo dei minuti esatti se n e andato', !ha('pc-durin'));
  prova('i due tasti dell uscita chiamano il comando giusto',
    modello.split('data-a="fine"').length - 1 === 2);
  prova('la card "Estendi tempo" non esiste piu', !sorg.includes('bcCardTempo'));
  /* l'ordine: quanti bambini e' la cosa che si tocca SEMPRE, il tempo
     il piu' delle volte resta quello di serie. Se un giorno qualcuno
     rimette il tempo davanti, questo controllo lo dice. */
  prova('le due card stanno sopra la fascia del tempo',
    modello.indexOf('pc-due') < modello.indexOf('sec-tempo'));
  /* e devono venire della misura di quelle delle bevande: `auto-fit`
     accorpa le colonne vuote e due card sole si allargano a riempire
     la riga, con i tasti lunghi un palmo */
  const foglio = readFileSync(join(RADICE, 'css/app.css'), 'utf8');
  prova('la griglia delle due card riempie a colonne fisse',
    /\.bc-griglia\.pc-due\s*\{[^}]*auto-fill/.test(foglio));
  prova('e non ha piu tasti suoi, diversi da quelli del bar',
    !/\.pc-due \.bc-zone\s*\{/.test(foglio));

  /* IL GUARDAROBA SI PORTA A VISTA DA SOLO.
     E' alto quattrocento pixel e sta in fondo alla linguetta: dentro la
     scheda che vola non ci sta tutto, e restava mezzo sotto il bordo.
     Si scorre del minimo che serve -- NON con scrollIntoView, che lo
     incollerebbe in cima buttando fuori il resto. */
  prova('il guardaroba si porta a vista', sorg.includes('portaAVista(container)'));
  prova('scorrendo del minimo, non incollandolo in cima',
    /function portaAVista[\s\S]{0,900}scrollTop \+= sotto \+ 22/.test(sorg));
  /* la tavolozza dei colori si mette sopra il tasto che l'ha aperta:
     Capelli e Scarpe sono gli ultimi della fila, e con la scatola
     inchiodata a sinistra i colori comparivano lontanissimi da li' */
  prova('la tavolozza si mette sopra il suo tasto',
    /tav\.style\.left = Math\.round\(x\)/.test(sorg));
  prova('e la punta indica il tasto anche quando la scatola non ci sta centrata',
    sorg.includes("setProperty('--punta'") &&
    readFileSync(join(RADICE, 'css/app.css'), 'utf8').includes('left: var(--punta'));
  /* LE ANIMAZIONI: quelle che non devono ripartire.
     Sono difetti che non si vedono in una prova sola -- si vedono al
     decimo tocco, quando i tasti sembrano spostarsi da soli. */
  prova('la nascita di una card si spegne dopo essere stata disegnata',
    /tocchi\.nato = null;/.test(sorg));
  prova('il pannello non fa il suo ingresso mentre la scheda vola',
    /const inVolo = volante && volante\.card/.test(sorg));
  prova('la misura del volo si prende una volta sola',
    (sorg.match(/adattaTutto\(\); \}, \d+\)/g) || []).length === 1);
  prova('scendendo, il pannello non si accartoccia',
    /su\.style\.overflow = 'hidden'/.test(sorg));
  prova('e le misure quasi uguali non si applicano',
    /Math\.abs\(gia - spazio\) <= 4/.test(sorg));
  prova('il posto riservato al guardaroba non c e piu',
    !sorg.includes('altezzaPersone') && !sorg.includes('personeMisurate'));
  /* e la schermata resta UNA: niente si nasconde mentre si veste */
  prova('vestire non nasconde le card ne la fascia',
    !sorg.includes('pc-riass') &&
    !readFileSync(join(RADICE, 'css/app.css'), 'utf8').includes('.pc-parco.veste'));

  /* La pastiglia del pagato invece e' una funzione che torna testo:
     quella si prova davvero. E' l'unica parte della fascia che parla
     di soldi, ed e' quella che deve stare zitta a tempo aperto. */
  const conto = (extra) => Object.assign({
    id: 'x', createdAt: 0, startTime: 0, status: 'active',
    durationMinutes: 60, baseMinutes: 60, payLater: false,
    children: 2, crazyJumping: 0, people: [], barItems: [],
    paidLines: {}, paidAmt: {}, paidPark: 0, paidBar: 0,
    braceletColor: null, braceletCustom: true
  }, extra || {});
  const mettiSotto = (c) => { app.PAN.conto = c; app.PAN.ingresso = null; return c; };

  let c = mettiSotto(conto());
  let h = app.pastigliaPagato(c);
  prova('senza un euro dice quanto c e da pagare', /da pagare/.test(h));
  prova('e non e verde', /pgl vuota/.test(h));
  prova('il piu si puo premere', !/data-v="1" disabled/.test(h));

  app.segnaPagate('bimbi', 1);
  h = app.pastigliaPagato(c);
  prova('pagato a meta dice fino a che ora', /fino alle/.test(h));
  prova('e adesso e verde', !/pgl vuota/.test(h));

  app.segnaPagate('bimbi', 2);
  h = app.pastigliaPagato(c);
  prova('pagato tutto lo dice', /pagato tutto/.test(h));
  prova('e il piu si spegne', /data-v="1" disabled/.test(h));

  /* IL PUNTO CHE HA VISTO LUI: a tempo aperto il piu' non si deve
     poter premere, perche' non c'e' un prezzo da coprire. */
  c = mettiSotto(conto({ payLater: true }));
  h = app.pastigliaPagato(c);
  prova('a tempo aperto si conta all uscita', /uscita/.test(h));
  prova('a tempo aperto il piu e spento', /data-v="1" disabled/.test(h));

  c = mettiSotto(conto({ children: 0 }));
  h = app.pastigliaPagato(c);
  prova('senza bambini lo dice invece di sembrare rotta', /nessun bambino/.test(h));
  prova('e i tasti sono spenti', /data-v="1" disabled/.test(h));

  /* i minuti del Crazy stanno dentro l'ora di uscita, quindi anche
     dentro il metro del pagato: se no un gruppo col Crazy risulterebbe
     a posto con dei minuti scoperti */
  c = mettiSotto(conto({ children: 1, crazyJumping: 1 }));
  app.segnaPagate('bimbi', 1);
  h = app.pastigliaPagato(c);
  prova('col Crazy non pagato non e "tutto pagato"', !/pagato tutto/.test(h));

}

gruppo('Il vuoto sopra la scheda che vola');
{
  /* La rimpicciolitura non c'e' piu': il pannello e' UNO SOLO e vive in
     due posti con altezze diverse, quindi rimpicciolirlo voleva dire
     vedere le stesse card di due misure a seconda di da dove le avevi
     aperte -- e la griglia del bar cambiava perfino il numero di
     colonne, perche' con lo zoom l'elemento si crede piu' largo.
     Fra "entra tutto" e "e' sempre la stessa schermata" vince la
     seconda. Resta il vuoto in cima, che e' il bersaglio per chiudere. */
  const sopra = app.spazioSopra;
  prova('il vuoto sopra c’è sempre, e si prende col pollice', sopra() >= 32);
  prova('e non si mangia la scheda', sopra() <= 50);
  prova('la rimpicciolitura è sparita', typeof app.scalaChe === 'undefined');
}

/* ---------- il verdetto ---------- */
console.log('\n' + '━'.repeat(52));
if (ko) {
  console.log('  ' + ko + ' CONTROLLI ROTTI su ' + (ok + ko) + '\n  - ' + rotti.join('\n  - '));
  process.exit(1);
}
console.log('  TUTTO A POSTO — ' + ok + ' controlli, ' + gruppi + ' gruppi');

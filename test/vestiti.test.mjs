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

/* due cose che devono essere IDENTICHE: si scrive quello che si e'
   avuto, se no un numero sbagliato non dice da dove arriva */
function uguale(t, avuto, atteso) {
  const x = JSON.stringify(avuto), y = JSON.stringify(atteso);
  return prova(t, x === y, x === y ? '' : 'avuto  ' + x + '  atteso ' + y);
}

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
    ;   /* il filo dei jeans e' in tinta col capo: non c'e' piu' niente
           da escludere, era l'unico colore che non veniva dal capo */
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

gruppo('Il Top ha preso il posto del Gilet');
{
  /* Un top e una canotta non sono lo stesso capo: il top FINISCE PIU'
     SU -- sotto si vede un dito di vita -- e le spalline sono due fili
     invece di due fasce. */
  prova('il gilet non e piu nel guardaroba', !AV.TOP.some(t => t.key === 'gilet'));
  prova('e al suo posto c e il top', AV.TOP.some(t => t.key === 'top'));
  prova('top e canotta non sono lo stesso disegno',
    nudo(figura('top', 'pantaloni')) !== nudo(figura('canotta', 'pantaloni')));
  const pelle = AV.normalize({ role: 'altro' }).skin;
  const quanta = (svg) => (svg.match(new RegExp('fill="' + pelle + '"', 'gi')) || []).length;
  prova('sotto il top si vede la vita scoperta',
    quanta(figura('top', 'pantaloni')) > quanta(figura('canotta', 'pantaloni')),
    'top ' + quanta(figura('top', 'pantaloni')) + ' vs canotta ' + quanta(figura('canotta', 'pantaloni')));
  prova('l icona del top c e', icona('top').slice(0, 4) === '<svg');

  /* chi ce l'aveva addosso ieri se lo ritrova, non torna in maglietta */
  uguale('il gilet salvato diventa top',
    AV.normalize({ role: 'altro', top: { style: 'gilet', color: '#E23D4B' } }).top.style, 'top');
}

gruppo('I capelli: quattro colori, sei tagli, e la descrizione onesta');
{
  uguale('i colori dei capelli', AV.HAIR_COLORS.map(c => c.n[0]),
    ['nero', 'marrone', 'biondo', 'grigio']);
  ['pelato', 'corti', 'medio', 'lunghi', 'ricci', 'riccimedi'].forEach(k => {
    prova('il taglio ' + k + ' c e', AV.HAIR.some(h => h.key === k));
  });
  const testa = (stile) => nudo(AV.build(AV.normalize({
    role: 'altro', hair: { style: stile, color: '#1E1712' }
  })));
  prova('ricci lunghi e ricci medi sono due teste diverse', testa('ricci') !== testa('riccimedi'));

  /* LA DESCRIZIONE DICE SOLO QUELLO CHE HAI SCELTO.
     Il taglio ce l'hanno tutti dal ruolo: scegliendo solo il colore
     usciva "Capelli LUNGHI neri" su una persona di cui nessuno aveva
     guardato la lunghezza -- e all'uscita si cercava una chioma lunga
     su una testa rasata. */
  const detto = (av) => (app.AV.traits(av, 9, true)
    .find(t => /capell|pelat/i.test(t.txt)) || {}).txt || '';

  const p = persona();
  p.avatar.hair = { style: 'lunghi', color: '#1E1712' };
  p.avatar.scelti = {};
  prova('senza scelte i capelli non si dicono', detto(p.avatar) === '');
  app.segna(p, 'capelli');
  uguale('scelto il colore, si dice solo quello', detto(p.avatar), 'Capelli neri');
  app.segna(p, 'taglio');
  uguale('scelto anche il taglio, si dicono tutti e due', detto(p.avatar), 'Capelli lunghi neri');

  const q = persona();
  q.avatar.hair = { style: 'ricci', color: '#D8A657' };
  q.avatar.scelti = {};
  app.segna(q, 'taglio');
  uguale('solo il taglio, niente colore', detto(q.avatar), 'Capelli ricci lunghi');

  const r = persona();
  r.avatar.hair = { style: 'pelato', color: '#1E1712' };
  r.avatar.scelti = {};
  app.segna(r, 'capelli');
  prova('il pelato non si annuncia se hai scelto solo il colore', !/pelato/i.test(detto(r.avatar)),
    detto(r.avatar));
  app.segna(r, 'taglio');
  prova('scelto il taglio, il pelato si dice', /pelato/i.test(detto(r.avatar)), detto(r.avatar));
}

gruppo('Il pelato e pelato, e i capelli coprono il cranio');
{
  /* PELATO VUOL DIRE PELATO. Aveva la corona di capelli ai lati -- il
     nonno stempiato -- ma adesso "pelato" e' una scelta fra sei tagli,
     e chi la tocca vuole una testa senza capelli. */
  const testa = (stile, col) => AV.build(AV.normalize({
    role: 'altro', skin: '#F6CFA8', hair: { style: stile, color: col || '#1E1712' },
    hat: { style: 'none', color: '#E23D4B' }, facial: 'none'
  }));
  prova('il pelato non porta capelli addosso', testa('pelato').indexOf('#1E1712') < 0,
    'trovata la tinta dei capelli su una testa rasata');
  prova('ma si vede che e una testa lucida', testa('pelato').indexOf('opacity=".2"') > 0);
  prova('e gli altri i capelli ce li hanno', testa('corti').indexOf('#1E1712') > 0);

  /* LA CALOTTA E' PIU' LARGA DELLA TESTA: la testa e' un'ellisse
     21,5 x 22,5 col vertice a 17,5, e le ciocche arrivavano esattamente
     li' -- fra l'una e l'altra restava una mezzaluna di pelle scoperta,
     e da lontano sembravano tutti un po' stempiati (il papa' in
     particolare, che e' un guasto vecchio). */
  ['corti', 'medio', 'lunghi', 'codino', 'chignon', 'treccine'].forEach(k => {
    prova(k + ': la calotta passa sopra il cranio', testa(k).indexOf('A24 25 0 0 1 74 40') > 0);
  });
  prova('e il papa non e piu stempiato',
    AV.build(AV.baseFor('papa')).indexOf('A24 25 0 0 1 74 40') > 0);
}

gruppo('Le icone dei tagli hanno il bordo come i capi');
{
  /* Su fondo scuro una chioma nera senza contorno e' una macchia di
     cui non si vede la forma -- ed era la forma la cosa da scegliere. */
  ['pelato', 'corti', 'medio', 'lunghi', 'ricci', 'riccimedi'].forEach(k => {
    const h = CAPI.capelli(k, '#1E1712', '#F6CFA8', 44);
    prova(k + ': l icona c e', h.slice(0, 4) === '<svg' && h.length > 200);
    prova(k + ': ha il bordo bianco e quello scuro',
      h.indexOf('rgba(255,255,255,.94)') > 0 && h.indexOf('rgba(18,18,26,.9)') > 0);
  });
  const teste = ['pelato', 'corti', 'medio', 'lunghi', 'ricci', 'riccimedi']
    .map(k => CAPI.capelli(k, '#1E1712', '#F6CFA8', 44));
  prova('e sei tagli sono sei disegni diversi', new Set(teste).size === 6);
  prova('il pelato non ha capelli nemmeno nell icona',
    CAPI.capelli('pelato', '#1E1712', '#F6CFA8', 44).indexOf('#1E1712') < 0);
  prova('e il colore dei capelli arriva nell icona',
    CAPI.capelli('lunghi', '#D8A657', '#F6CFA8', 44).indexOf('#D8A657') > 0);
}

gruppo('La tavolozza dei capelli: colori e tagli, disegnati');
{
  const p = persona();
  const aperta = app.armadioDi(p, 'capelli');
  prova('si apre la sua, non quella normale', aperta.indexOf('volante capelli') > 0);
  uguale('tre tinte in fila', conta(aperta, /data-acccol="capelli\|/g), 3);
  prova('piu la ruota, che e l arcobaleno',
    aperta.indexOf('data-accruota="capelli"') > 0 && aperta.indexOf('Arcobaleno') > 0);
  uguale('i sei tagli', conta(aperta, /data-taglio="/g), 6);
  prova('ogni taglio e disegnato, col bordo come i capi',
    conta(aperta, /<svg/g) >= 6 && aperta.indexOf('rgba(255,255,255,.94)') > 0);
  prova('e la scritta sotto e quella dei capi, non una piu piccola',
    conta(aperta, /class="capo cap-t/g) === 6);
  prova('e si puo togliere', aperta.indexOf('data-accvia="capelli"') > 0);
}

gruppo('La fantasia anche ai capi di sotto');
{
  const p = persona();
  const h = app.armadioDi(p, '');
  uguale('le fantasie del sopra', conta(h, /data-pat="/g), AV.PATTERNS.length);
  uguale('e quelle del sotto', conta(h, /data-patb="/g), AV.PATTERNS.length);

  const con = (pat) => nudo(AV.build(AV.normalize({
    role: 'altro', pants: { style: 'pantaloni', color: '#E23D4B', pattern: pat }
  })));
  prova('i pantaloni a pois non sono quelli tinta unita', con('solid') !== con('dots'));

  /* e si legge nella descrizione */
  const q = persona('maglietta', 'gonna', '#E23D4B');
  q.avatar.pants.color = '#22C55E';
  q.avatar.pants.pattern = 'fiori';
  q.avatar.scelti = {};
  app.segna(q, 'pantaloni');
  const txt = (app.AV.traits(q.avatar, 9, true).find(t => /gonna/i.test(t.txt)) || {}).txt || '';
  prova('la gonna a fiori si legge', /fiori/i.test(txt), txt);
}

gruppo('Il filo dei jeans e in tinta, non giallo');
{
  prova('niente piu giallo miele', icona('jeans').toUpperCase().indexOf('#E3B04B') < 0);
  prova('sul jeans normale il filo e piu scuro del capo',
    parseInt(AV.filoDenim('#3B5C88').slice(1, 3), 16) < 0x3B);
  prova('su un capo quasi nero si schiarisce, se no la cucitura sparisce',
    parseInt(AV.filoDenim('#12121A').slice(1, 3), 16) > 0x12);
  const filo = AV.filoDenim(VERDE);
  prova('e icona e figura usano lo stesso filo',
    icona('jeans').indexOf(filo) > 0 && figura('canotta', 'jeans').indexOf(filo) > 0, filo);
}

gruppo('Due persone vestite uguali si notano subito');
{
  /* La descrizione serve a UNA cosa: riconoscere chi accompagna
     all'uscita. Due mamme senza nome, tutte e due con la camicia rossa
     e i jeans, sono una descrizione che non riconosce piu' niente. */
  const veroAvviso = app.mondo.avvisaSosia;
  app.mondo.avvisaSosia = () => {};        /* qui lo schermo non c'e' */
  const prima = app.entries;
  const veste = (nome) => {
    const x = persona('camicia', 'jeans', '#E23D4B');
    x.id = 'p' + Math.round(Math.random() * 1e6);
    x.name = nome || '';
    x.avatar.scelti = {};
    app.segna(x, 'maglietta');
    app.segna(x, 'pantaloni');
    return x;
  };
  const primo = veste();
  const dentro = (stato) => { app.entries = [{ id: 'e1', status: stato, startTime: Date.now(),
    children: 2, people: [primo], barItems: [], paidLines: {}, paidAmt: {} }]; };

  dentro('active');
  const secondo = veste();
  prova('il sosia si trova', !!app.sosiaDi(secondo));

  secondo.name = 'Giulia';
  prova('con un nome diverso non e piu un sosia', !app.sosiaDi(secondo));

  secondo.name = '';
  secondo.avatar.top.color = '#22C55E';
  prova('e nemmeno con la maglietta di un altro colore', !app.sosiaDi(secondo));

  dentro('closed');
  prova('un sosia gia uscito non disturba', !app.sosiaDi(veste()));

  dentro('active');
  const vuoto = persona();
  vuoto.avatar.scelti = {};
  prova('senza scelte niente avviso', !app.sosiaDi(vuoto));

  app.entries = prima;
  app.mondo.avvisaSosia = veroAvviso;
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

  /* IL CRAZY NON C'ENTRA COL TEMPO PAGATO: i suoi minuti sono
     regalati. Pagato il tempo di parco, la fascia dice "pagato tutto"
     anche se il Crazy e' ancora da saldare -- perche' quello e'
     un'altra riga, con la sua fascia verde sulla sua card. */
  c = mettiSotto(conto({ children: 1, crazyJumping: 1 }));
  app.segnaPagate('bimbi', 1);
  h = app.pastigliaPagato(c);
  prova('pagato il tempo di parco, la fascia dice pagato tutto', /pagato tutto/.test(h));
  prova('e il Crazy resta dovuto per conto suo', app.contoResta() > 0);

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

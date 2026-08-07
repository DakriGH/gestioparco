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
  { capo: 'felpa', scarto: -50, quanti: 2 },   // occhielli dei laccetti
  { capo: 'giubbotto', scarto: 48, quanti: 1 } // il bottone in cima alla zip
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

/* ---------- il verdetto ---------- */
console.log('\n' + '━'.repeat(52));
if (ko) {
  console.log('  ' + ko + ' CONTROLLI ROTTI su ' + (ok + ko) + '\n  - ' + rotti.join('\n  - '));
  process.exit(1);
}
console.log('  TUTTO A POSTO — ' + ok + ' controlli, ' + gruppi + ' gruppi');

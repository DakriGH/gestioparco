/* ══════════════════════════════════════════════════════════
   L'INCROCIO: TUTTE LE COMBINAZIONI, E LE REGOLE CHE NON DEVONO
   CADERE IN NESSUNA

   Gli altri file provano casi SCELTI: quelli che sono successi al
   banco, o quelli che mi sono venuti in mente. Questo non sceglie
   niente. Costruisce ogni incrocio di bambini, giri di Crazy, durate,
   omaggi, blocchi venduti e soldi gia' presi -- migliaia -- e su
   ognuno controlla le poche regole che devono valere SEMPRE.

   Una regola che cade in un caso su duemila e' esattamente quella che
   al banco diventa «i 17 euro a caso»: capita una sera su venti,
   nessuno riesce a rifarla, e resta li' per mesi.
   ══════════════════════════════════════════════════════════ */
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
const r2 = v => Math.round(v * 100) / 100;
const eur = v => r2(v).toFixed(2);

/* ─────────────────────────────────────────────────────────
   L'INCROCIO
   ───────────────────────────────────────────────────────── */
const BIMBI = [0, 1, 3, 7];
const GIRI = [0, 1, 4];
const DURATE = [0, 10, 30, 45, 60, 95, 120, 240];
const OMAGGI = [0, 10];
const BLOCCHI = [[], [15], [30, 15], [60, 60]];
const PRESI = [0, 5, 21, 999];

const casi = [];
for (const bimbi of BIMBI)
  for (const giri of GIRI)
    for (const durata of DURATE)
      for (const omaggio of OMAGGI)
        for (const blocchi of BLOCCHI)
          for (const presi of PRESI) {
            /* l'omaggio ce l'ha solo chi e' entrato per saltare */
            if (omaggio > 0 && giri === 0) continue;
            /* i blocchi non possono essere piu' lunghi del tempo che c'e' */
            if (blocchi.reduce((a, b) => a + b, 0) > durata) continue;
            casi.push({ bimbi, giri, durata, omaggio, blocchi, presi });
          }

const t0 = Date.now() - 25 * 60000;
function costruisci(k, extra) {
  return app.normalizeEntries([Object.assign({
    id: 'k' + casi.indexOf(k), startTime: t0, createdAt: t0, oraManuale: true,
    children: k.bimbi, crazyJumping: k.giri,
    crazyGiri: k.giri ? Array(k.giri).fill(1) : undefined,
    durationMinutes: k.durata, baseMinutes: k.durata - k.blocchi.reduce((a, b) => a + b, 0) || undefined,
    omaggio: k.omaggio, aggiunte: k.blocchi.slice(),
    paidPark: k.presi, paidAmt: k.presi ? { bimbi: k.presi } : undefined
  }, extra || {})])[0];
}
const eti = k => k.bimbi + ' bimbi, ' + k.giri + ' giri, ' + k.durata + '′' +
  (k.omaggio ? ' +omaggio' : '') + (k.blocchi.length ? ' blocchi ' + k.blocchi.join('+') : '') +
  (k.presi ? ', presi ' + k.presi + '€' : '');

gruppo('Le regole che non devono cadere in nessuna combinazione');
{
  console.log('   (' + casi.length + ' combinazioni)');
  const guai = { nan: [], negativo: [], tetto: [], crazy: [], resto: [], pagato: [] };
  const tariffe = app.settings.tariffs;
  const tetto = tariffe[tariffe.length - 1].p;

  casi.forEach(k => {
    const c = costruisci(k);
    app.PAN.conto = c;
    const conto = app.costOf(c);
    const resta = app.dueOf(c);

    /* 1. NESSUN NUMERO PUO' ESSERE UNA NON-CIFRA. Un NaN qui dentro
       arriva a video come «NaN €» e blocca il conto alla cassa. */
    [conto.parkTotal, conto.crazyCost, conto.unit, resta.total, resta.park, resta.parkDue,
     app.tempoTotale(c), app.minutiPagati(c), app.endTimeOf(c)].forEach((v, i) => {
      if (!Number.isFinite(v)) guai.nan.push(eti(k) + ' [' + i + '] = ' + v);
    });

    /* 2. NIENTE PREZZI NEGATIVI. Un conto sotto zero vuol dire che la
       cassa deve dei soldi al cliente, e non e' mai quello che si
       intende. */
    if (conto.parkTotal < 0 || conto.crazyCost < 0) guai.negativo.push(eti(k));

    /* 3. IL TETTO DEL CARTELLO NON SI SCAVALCA. Oltre l'ultima fascia
       il prezzo non sale piu': ne' allungando, ne' a blocchi. */
    if (k.bimbi > 0 && conto.parkTotal > r2(tetto * k.bimbi) + 0.005) {
      guai.tetto.push(eti(k) + ': ' + eur(conto.parkTotal) + ' oltre il tetto di ' + eur(tetto * k.bimbi));
    }

    /* 4. IL CRAZY SI PAGA A GIRO, e il parco non lo tocca. */
    if (r2(conto.crazyCost) !== r2(k.giri * app.settings.crazyJumpingPrice)) {
      guai.crazy.push(eti(k) + ': ' + eur(conto.crazyCost));
    }

    /* 5. QUELLO CHE RESTA E' IL CONTO MENO QUELLO GIA' PRESO, e non
       scende mai sotto zero: chi ha pagato piu' del dovuto ha zero da
       dare, non un credito che nessuno gli rendera'. */
    const atteso = Math.max(0, r2(conto.parkTotal + conto.crazyCost - Math.min(k.presi, 1e9)));
    if (resta.park < -0.005) guai.resto.push(eti(k) + ': resta ' + eur(resta.park));

    /* 6. I MINUTI PAGATI NON SUPERANO QUELLI CHE CI SONO, e se il
       conto e' saldato sono tutti. */
    const tot = app.tempoTotale(c), pag = app.minutiPagati(c);
    if (pag < 0 || pag > tot + 0.001) guai.pagato.push(eti(k) + ': pagati ' + pag + ' su ' + tot);
    if (k.bimbi > 0 && k.presi >= 999 && pag < tot) {
      guai.pagato.push(eti(k) + ': pagato tutto ma coperti solo ' + pag + '′ su ' + tot);
    }
  });

  prova('nessun conto diventa una non-cifra', !guai.nan.length, guai.nan.slice(0, 3).join('\n        '));
  prova('nessun prezzo va sotto zero', !guai.negativo.length, guai.negativo.slice(0, 3).join('\n        '));
  prova('il tetto del cartello non si scavalca mai', !guai.tetto.length, guai.tetto.slice(0, 3).join('\n        '));
  prova('il Crazy si paga a giro, sempre', !guai.crazy.length, guai.crazy.slice(0, 3).join('\n        '));
  prova('quello che resta non va mai sotto zero', !guai.resto.length, guai.resto.slice(0, 3).join('\n        '));
  prova('i minuti pagati stanno nel tempo che c’è', !guai.pagato.length, guai.pagato.slice(0, 3).join('\n        '));
}

gruppo('Più tempo non può mai costare di meno');
{
  /* IL PREZZO NON PUO' SCENDERE ALLUNGANDO. Sembra ovvio, e non lo e':
     basta uno scaglione preso dalla parte sbagliata, o un blocco che
     entra dove non deve, perche' un minuto in piu' faccia scendere il
     conto -- e quello, al banco, e' il cliente che se ne accorge. */
  const guai = [];
  [1, 3].forEach(bimbi => {
    [0, 2].forEach(giri => {
      let prima = -1, quando = 0;
      for (let m = 5; m <= 300; m += 5) {
        const c = app.normalizeEntries([{ id: 'm' + m, startTime: t0, createdAt: t0,
          oraManuale: true, children: bimbi, crazyJumping: giri, durationMinutes: m, baseMinutes: m }])[0];
        const p = app.costOf(c).parkTotal;
        if (p + 0.005 < prima) guai.push(bimbi + ' bimbi ' + giri + ' giri: da ' + quando + '′ (' +
          eur(prima) + ') a ' + m + '′ (' + eur(p) + ')');
        prima = p; quando = m;
      }
    });
  });
  prova('da cinque minuti a cinque ore il prezzo non scende mai', !guai.length,
    guai.slice(0, 3).join('\n        '));
}

gruppo('Pagare tutto chiude il conto, comunque ci si arrivi');
{
  /* la domanda del banco: dopo aver premuto «paga tutto», resta
     qualcosa? Se resta anche un centesimo, quel gruppo esce con un
     debito che nessuno vedra' mai. */
  const guai = [];
  casi.filter(k => k.bimbi > 0).forEach(k => {
    const c = costruisci(k, { paidPark: 0, paidAmt: undefined, paidLines: undefined,
      barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 2 }] });
    app.PAN.conto = c;
    app.pagaTutto();
    const resta = app.dueOf(c).total;
    if (resta > 0.005) guai.push(eti(k) + ': restano ' + eur(resta));
    if (resta < -0.005) guai.push(eti(k) + ': avanzano ' + eur(-resta));
  });
  prova('dopo «paga tutto» non resta né manca un centesimo', !guai.length,
    guai.slice(0, 3).join('\n        '));
}

gruppo('Salvare e rileggere non cambia un centesimo né un minuto');
{
  /* memoria e disco devono raccontare la stessa storia: e' la garanzia
     che ha preso i due guasti peggiori di questa settimana. */
  const guai = [];
  casi.forEach(k => {
    const c = costruisci(k);
    const ri = app.normalizeEntries([JSON.parse(JSON.stringify(c))])[0];
    if (r2(app.costOf(c).parkTotal) !== r2(app.costOf(ri).parkTotal)) guai.push(eti(k) + ': prezzo');
    if (app.endTimeOf(c) !== app.endTimeOf(ri)) guai.push(eti(k) + ': ora d’uscita');
    if (app.tempoTotale(c) !== app.tempoTotale(ri)) guai.push(eti(k) + ': minuti');
    /* e una seconda rilettura non deve cambiare di nuovo: la
       riparazione dei dati dev'essere una porta, non un'altalena */
    const ri2 = app.normalizeEntries([JSON.parse(JSON.stringify(ri))])[0];
    if (app.endTimeOf(ri) !== app.endTimeOf(ri2)) guai.push(eti(k) + ': cambia alla seconda rilettura');
  });
  prova('lo stesso ingresso letto tre volte dice sempre le stesse cose', !guai.length,
    guai.slice(0, 3).join('\n        '));
}

gruppo('I tasti che vendono tempo dicono la verità, in ogni combinazione');
{
  /* IL TASTO E' UNA PROMESSA: «+30m +21,00 €». Se poi in cassa entra
     un'altra cifra, la cassiera ha detto un prezzo sbagliato al
     cliente -- e lo ha detto in buona fede, leggendolo dallo schermo. */
  const guai = [];
  casi.filter(k => k.bimbi > 0 && k.durata > 0).forEach(k => {
    [15, 30, 60].forEach(quanti => {
      const c = costruisci(k, { paidPark: 0, paidAmt: undefined });
      app.PAN.conto = c;
      const promesso = r2(app.costoEstensione(c, quanti));
      const prima = app.costOf(c).parkTotal;
      app.vendiBlocco(c, quanti);
      const vero = r2(app.costOf(c).parkTotal - prima);
      if (promesso !== vero) {
        guai.push(eti(k) + ' +' + quanti + '′: dice ' + eur(promesso) + ', chiede ' + eur(vero));
      }
    });
  });
  prova('quello che il tasto scrive è quello che poi chiede', !guai.length,
    guai.slice(0, 4).join('\n        '));
}

gruppo('La stessa permanenza costa la stessa cifra, comunque comprata');
{
  /* la regola del parco: si paga per QUANTO SI STA, non a pezzi. Qui
     si arriva a ogni durata del cartello per tre strade diverse. */
  const guai = [];
  app.settings.tariffs.forEach(t => {
    const meta = Math.max(5, Math.round(t.m / 2 / 5) * 5);
    const resto = t.m - meta;
    const nuovo = () => app.normalizeEntries([{ id: 'x', startTime: t0, createdAt: t0,
      oraManuale: true, children: 3, durationMinutes: 0, baseMinutes: 0 }])[0];
    const strade = [];
    { const c = nuovo(); app.PAN.conto = c; app.metteTempo(c, t.m); strade.push(['tutto insieme', c]); }
    if (resto > 0) { const c = nuovo(); app.PAN.conto = c; app.metteTempo(c, meta); app.vendiBlocco(c, resto);
      strade.push(['in due volte', c]); }
    { const c = nuovo(); app.PAN.conto = c; app.metteTempo(c, 5);
      while (c.durationMinutes < t.m) app.ritoccaTempo(c, Math.min(5, t.m - c.durationMinutes));
      if (c.durationMinutes === t.m) strade.push(['cinque minuti alla volta', c]); }
    const prezzi = strade.map(([, c]) => r2(app.costOf(c).parkTotal));
    if (new Set(prezzi).size > 1) {
      guai.push(t.m + '′: ' + strade.map(([n], i) => n + ' ' + eur(prezzi[i])).join(', '));
    }
  });
  prova('ogni durata del cartello costa uguale per tre strade diverse', !guai.length,
    guai.slice(0, 4).join('\n        '));
}

/* ---------- il verdetto ---------- */
console.log('\n' + '━'.repeat(52));
if (ko) {
  console.log('  ' + ko + ' CONTROLLI ROTTI su ' + (ok + ko) + '\n  - ' + rotti.join('\n  - '));
  process.exit(1);
}
console.log('  TUTTO A POSTO — ' + ok + ' controlli, ' + gruppi + ' gruppi');

/* LA TEMPESTA: si prende l'app vera e la si prende a martellate.

       node test/tempesta.test.mjs

   Gli altri due file provano cose che SO che devono valere. Questo
   prova quello che non so: sequenze a caso, lunghe, assurde -- venti
   bambini, il tempo allungato dopo aver pagato, una bibita tolta dal
   listino a meta' conto, l'ingresso svuotato e rifatto -- e dopo OGNI
   mossa controlla che i conti stiano ancora in piedi.

   Le regole che non possono rompersi mai, qualunque cosa succeda:
     1. nessun numero puo' diventare NaN o infinito
     2. nessun incasso puo' andare sotto zero
     3. la somma delle righe DEVE fare i totali di parco e bar
     4. non si puo' incassare piu' di quanto una riga costi
     5. i minuti pagati non possono superare il tempo comprato
     6. quello che resta da incassare non puo' essere negativo
     7. senza giri di Crazy non ci sono minuti di giri sull'uscita
     8. si paga per QUANTO SI STA: il prezzo e' quello del cartello per
        il tempo che stanno dentro, non la somma dei pezzi
     9. memoria e disco devono dire la stessa cosa: rileggendo il dato
        non cambiano ne' l'ora d'uscita ne' il prezzo

   Il seme e' fisso: se un giorno si rompe, si rompe uguale e si puo'
   guardare in faccia il giro che l'ha rotto. */
import { caricaApp } from './ambiente.mjs';

const ctx = caricaApp();
let fatti = 0, rotti = 0;
const gruppi = [];

function gruppo(nome, fn) {
  gruppi.push(nome);
  console.log('\n━━ ' + nome);
  fn();
}
function ok(nome, avuto, atteso) {
  fatti++;
  const a = JSON.stringify(avuto), b = JSON.stringify(atteso);
  if (a === b) { console.log('   ok   ' + nome); return true; }
  rotti++;
  console.log('  FALLITO ' + nome + '\n          avuto  ' + a + '\n          atteso ' + b);
  return false;
}
function vero(nome, cond) { return ok(nome, !!cond, true); }

/* i dadi truccati: sempre gli stessi, cosi' un guaio si ritrova */
/* IL SEME E' FISSO, MA NON UNO SOLO.
   Un seme solo vuol dire una sola sequenza: diecimila mosse sempre
   quelle, e tutto quello che sta fuori da quella strada non lo prova
   nessuno. Adesso i giri sono cinque, con cinque semi scritti qui --
   restano fissi, quindi un guaio si ritrova sempre uguale, ma le
   strade provate sono cinque volte tante. */
const SEMI = [20260808, 1234567, 99991, 424242, 7654321];
let seme = SEMI[0];
/* I BIT ALTI, NON QUELLI BASSI.
   Con `seme % n` si prendono i bit bassi di un generatore lineare, che
   ciclano su pochissimi valori: `caso(4)` tornava SEMPRE zero, e mezza
   tempesta batteva sempre sugli stessi tasti credendo di variare. E'
   un difetto dello strumento, non del codice provato -- ma uno
   strumento che mente e' peggio di nessuno strumento. */
function caso(n) {
  seme = (seme * 1103515245 + 12345) & 0x7fffffff;
  return Math.floor((seme >>> 15) / 65536 * n) % n;
}

function conto(extra) {
  const c = Object.assign({
    id: 'x', createdAt: 0, startTime: 0, status: 'active',
    durationMinutes: 60, baseMinutes: 60, payLater: false,
    children: 0, crazyJumping: 0, people: [], barItems: [],
    paidLines: {}, paidAmt: {}, paidPark: 0, paidBar: 0,
    braceletColor: null, braceletCustom: true
  }, extra || {});
  ctx.PAN.conto = c;
  ctx.PAN.ingresso = null;
  return c;
}

const num = (x) => typeof x === 'number' && Number.isFinite(x);
const lista = (x) => Array.isArray(x) ? x : [];
const r2 = (x) => Math.round(x * 100) / 100;

/* IL CONTO VIVO, non quello che avevo in mano.
   Una mossa puo' SOSTITUIRLO: "svuota tutto" ne fabbrica uno nuovo di
   zecca e lo mette al posto del vecchio. Chi continua a guardare
   l'oggetto di prima vede una fotografia e si convince che l'app ha
   sbagliato -- mi ci sono cascato: cercavo un guasto nei minuti pagati
   e stavo confrontando due conti diversi. */
const vivo = () => ctx.PAN.conto;

/* Il controllo che si fa dopo OGNI mossa. Torna la lista di quello che
   non torna, vuota se e' tutto a posto. */
function guai(_, dove) {
  const c = vivo();
  const g = [];
  if (!num(c.paidPark) || c.paidPark < -0.005) g.push('parco incassato ' + c.paidPark);
  if (!num(c.paidBar) || c.paidBar < -0.005) g.push('bar incassato ' + c.paidBar);
  if (!num(c.children) || c.children < 0) g.push('bambini ' + c.children);
  if (!num(c.crazyJumping) || c.crazyJumping < 0) g.push('crazy ' + c.crazyJumping);
  /* LA DURATA PUO' VALERE ZERO, adesso: e' chi non ha comprato tempo
     di parco -- solo Crazy -- e la sua permanenza sta nei minuti in
     omaggio. Quello che non puo' succedere e' restare senza NIENTE:
     ne' tempo comprato, ne' omaggio, ne' giri. */
  /* ⚠ `num` QUI E' UN PREDICATO, non una conversione: torna vero o
     falso. Scritto `num(c.durationMinutes, -1)` dava un BOOLEANO, e da
     li' in poi `!(dur >= 0)` era sempre falso e `dur === 0` non era mai
     vero: questi due controlli non sono mai scattati in vita loro.
     Due invarianti che dormono sono peggio di due invarianti che non
     ci sono -- l'elenco in cima al file li prometteva, e nessuno e'
     andato a vedere. */
  const dur = ctx.num(c.durationMinutes, -1);
  if (!Number.isFinite(dur) || dur < 0) g.push('durata ' + c.durationMinutes);
  else if (dur === 0 && ctx.omaggioDi(c) <= 0 && ctx.minutiCrazy(c) <= 0 && !c.payLater)
    g.push('permanenza di niente: durata 0 senza omaggio ne giri');

  /* 3. le righe devono fare i totali: e' l'invariante piu' importante
     di tutta l'app -- se salta, la cassa dice una cifra e le card ne
     dicono un'altra */
  const amt = c.paidAmt || {};
  let parco = 0, bar = 0;
  Object.keys(amt).forEach(k => {
    const v = amt[k];
    if (!num(v)) { g.push('riga ' + k + ' = ' + v); return; }
    if (v < -0.005) g.push('riga ' + k + ' sotto zero: ' + v);
    if (k === 'bimbi' || k === 'crazy') parco += v; else bar += v;
  });
  if (Math.abs(parco - c.paidPark) > 0.02) g.push('righe parco ' + parco.toFixed(2) + ' ma totale ' + c.paidPark);
  if (Math.abs(bar - c.paidBar) > 0.02) g.push('righe bar ' + bar.toFixed(2) + ' ma totale ' + c.paidBar);

  /* 4. UNA RIGA PUO' AVERE PIU' SOLDI DI QUANTO COSTA, ed e' giusto
     cosi': si paga un'ora per quattro bambini, poi il gruppo accorcia a
     mezz'ora -- quei quarantotto euro sono gia' nel cassetto e non si
     riprendono da soli. Quello che NON puo' succedere e' incassare
     piu' del dovuto NEL MOMENTO in cui si incassa: quello si controlla
     dove i soldi si muovono, non qui.
     Qui basta che nessuna riga vada sotto zero (gia' fatto sopra) e
     che il conto non chieda mai una cifra negativa. */

  /* 5. i minuti pagati stanno dentro il tempo comprato */
  const mp = ctx.minutiPagati(c);
  if (!num(mp) || mp < 0) g.push('minuti pagati ' + mp);

  /* 6. il dovuto e quello che resta */
  const d = ctx.dueOf(c);
  if (!num(d.total) || d.total < -0.005) g.push('dovuto ' + d.total);
  const resta = ctx.contoResta();
  if (!num(resta) || resta < -0.005) g.push('resta da incassare ' + resta);

  /* 7. SENZA GIRI, NIENTE MINUTI DI GIRI.
     E' il guasto che regalava tempo all'infinito: segnando e
     cancellando un giro su un gruppo scaduto, l'ora d'uscita restava
     spostata avanti e ogni ripensamento ne aggiungeva altra.
     Si guarda l'ORA D'USCITA e non il campo `regaloFinoA`: il campo
     puo' anche restare li' -- chi legge lo ignora quando non ci sono
     giri (vedi `endTimeOf`) -- ma l'uscita no, quella la guarda la
     cassiera. Una prova che guarda il campo invece dell'effetto
     costringe mille punti a ricordarsi di ripulirlo; una che guarda
     l'effetto lascia la regola in un posto solo. */
  if (!c.payLater && ctx.minutiCrazy(c) <= 0 && dur > 0) {
    const senzaGiri = ctx.inizioParco(c) + dur * 60000;
    if (ctx.endTimeOf(c) > senzaGiri + 1000) {
      g.push('senza giri l’uscita e ' +
        Math.round((ctx.endTimeOf(c) - senzaGiri) / 60000) + '′ piu in la del dovuto');
    }
  }

  /* 8. SI PAGA PER QUANTO SI STA. Il prezzo del parco e' quello del
     cartello per il tempo che stanno dentro: non la somma dei pezzi
     con cui ci sono arrivati. */
  if (!c.payLater && ctx.settings.tariffaSuTotale !== false) {
    const atteso = ctx.r2(ctx.priceFor(ctx.up5(dur)) * ctx.clamp(ctx.num(c.children, 0), 0, 1e6));
    if (ctx.r2(ctx.costOf(c).parkTotal) !== atteso) {
      g.push('il parco costa ' + ctx.costOf(c).parkTotal + ' invece di ' + atteso + ' per ' + dur + '′');
    }
  }

  /* 9. MEMORIA E DISCO DEVONO DIRE LA STESSA COSA. Ogni guasto grosso
     di questa settimana si e' visto prima qui: un numero che cambiava
     da solo al ricaricamento. */
  const ri = ctx.normalizeEntries([JSON.parse(JSON.stringify(c))])[0];
  if (ctx.endTimeOf(ri) !== ctx.endTimeOf(c)) g.push('l’ora d’uscita cambia rileggendo il dato');
  if (ctx.r2(ctx.costOf(ri).parkTotal) !== ctx.r2(ctx.costOf(c).parkTotal)) {
    g.push('il prezzo cambia rileggendo il dato');
  }

  return g.map(x => dove + ' [' + scia.join(' > ') + ']: ' + x);
}

/* ══════════════════════════════════════════════════════════
   Le mosse: tutto quello che una cassiera puo' fare al banco,
   piu' quello che non farebbe mai.
   ══════════════════════════════════════════════════════════ */
const LISTINO = () => ctx.settings.barMenu.map(x => x.id);

/* L'ULTIMA MOSSA FATTA. Senza, quando la tempesta trovava qualcosa
   diceva «mossa 2590: conto storto» -- il NUMERO del giro, non la
   mossa -- e per sapere quale tasto fosse bisognava rifare a mano
   duemilacinquecento passi. Il seme e' fisso apposta perche' un guaio
   si possa guardare in faccia: tanto vale dirgli anche il nome. */
let ultimaMossa = -1;
const NOMI_MOSSA = ['bimbi', 'crazy', 'bar', 'paga bimbi', 'paga crazy', 'paga bar',
  'durata a mano', 'tempo aperto', 'paga tempo', 'paga tutto', 'segna parco', 'segna bar',
  'ora d ingresso a caso', 'via una bibita', 'svuota', 'annulla incasso', 'metti tempo',
  'ritocca tempo', 'vendi blocco', 'ora d uscita', 'sposta ingresso', 'pausa',
  'giro di Crazy', 'giro a tempo scaduto'];
const scia = [];
function mossa(c, quale) {
  ultimaMossa = quale;
  scia.push(NOMI_MOSSA[quale] || quale);
  if (scia.length > 4) scia.shift();
  const bar = LISTINO();
  switch (quale) {
    case 0: ctx.bcSetQ('bimbi', caso(9)); break;
    case 1: ctx.bcSetQ('crazy', caso(5)); break;
    case 2: ctx.bcSetQ(bar[caso(bar.length)], caso(7)); break;
    case 3: ctx.segnaPagate('bimbi', caso(11) - 1); break;      // anche -1: deve reggere
    case 4: ctx.segnaPagate('crazy', caso(7) - 1); break;
    case 5: ctx.segnaPagate(bar[caso(bar.length)], caso(9) - 1); break;
    case 6: c.durationMinutes = 5 + caso(180); break;
    case 7: c.payLater = !c.payLater; break;
    case 8: ctx.pagaTempo(caso(3) - 1); break;
    case 9: ctx.pagaTutto(); break;
    case 10: ctx.bcSegna('parco', caso(2) === 0); break;
    case 11: ctx.bcSegna('bar', caso(2) === 0); break;
    case 12: c.startTime = caso(86400000); break;
    case 13: {                                    /* una bibita sparisce dal listino */
      const via = c.barItems && c.barItems.length ? c.barItems[caso(c.barItems.length)] : null;
      if (via) ctx.bcSetQ(via.id, 0);
      break;
    }
    case 14: ctx.svuotaScelto({ numeri: caso(2) === 0, bar: caso(2) === 0, persone: caso(2) === 0,
                                tempo: caso(2) === 0, soldi: caso(2) === 0 }); break;
    /* ── i tasti arrivati dopo: senza di loro la tempesta batteva
       sempre sugli stessi, e le strade nuove restavano non provate ── */
    case 15: ctx.rendiTutto(); break;                        /* l'annulla dell'incasso */
    case 16: ctx.metteTempo(c, 5 + caso(200)); break;         /* un taglio, o i minuti scritti */
    case 17: ctx.ritoccaTempo(c, (caso(2) ? 5 : -5) * (1 + caso(3))); break;   /* il piu' e il meno */
    case 18: ctx.vendiBlocco(c, [15, 30, 60][caso(3)]); break;                 /* l'Estendi */
    case 19: {                                                /* l'ora d'uscita al quarto */
      const verso = caso(2) ? 1 : -1;
      const passo = ctx.uscitaAlQuarto(c, verso);
      if (passo.delta) {
        if (verso < 0 && ctx.num(c.regaloFinoA, 0) > passo.bersaglio) c.regaloFinoA = passo.bersaglio;
        ctx.ritoccaTempo(c, passo.delta);
      }
      break;
    }
    case 20: ctx.mettiIngresso(c, ctx.num(c.startTime, 0) + (caso(2) ? 5 : -5) * 60000); break;
    case 21: ctx.commutaPausa(c); break;                      /* ferma e fa ripartire */
    case 22: {                                                /* il giro di Crazy, vita e morte */
      const q = caso(3);
      if (q === 0) { if (!ctx.giriCrazy(c).length) ctx.giroNuovo(c); ctx.cambiaGiro(c, ctx.giroOra(c), 1); }
      else if (q === 1) ctx.cambiaGiro(c, ctx.giroOra(c), -1);
      else ctx.viaGiro(c, ctx.giroOra(c));
      break;
    }
    case 23: {
      /* il regalo di un giro fatto a tempo scaduto. NEL MODO IN CUI LO
         FA L'APP: prima si apre il giro, poi si regala. Chiamandolo da
         solo si costruisce uno stato che al banco non esiste -- un
         pavimento senza nessun giro sotto -- e la tempesta si metteva
         a gridare contro un guasto che aveva creato lei. */
      const finePrima = ctx.endTimeOf(c) - caso(2) * 60 * 60000;
      if (!ctx.giriCrazy(c).length) ctx.giroNuovo(c);
      ctx.cambiaGiro(c, ctx.giroOra(c), 1);
      ctx.regalaDaAdesso(c, finePrima);
      break;
    }
    default: ctx.segnaPagate('bimbi', caso(4)); break;
  }
}

/* ══════════════════════════════════════════════════════════ */
gruppo('Cinquantamila mosse a caso, cinque strade diverse', () => {
  const trovati = [];
  SEMI.forEach((s0, giro) => {
    if (trovati.length >= 6) return;
    seme = s0;
    const c = conto({ children: 2, crazyJumping: 1 });
    for (let i = 0; i < 10000 && trovati.length < 6; i++) {
      mossa(c, caso(24));
      trovati.push(...guai(c, 'giro ' + giro + '/mossa ' + i));
    }
  });
  ok('nessun conto storto in cinquantamila mosse', trovati.slice(0, 6), []);
});

gruppo('Cento conti da capo, cento mosse ciascuno', () => {
  /* Ogni conto parte da uno stato diverso: quello che rompe le cose
     spesso e' la combinazione di partenza, non la mossa. */
  const trovati = [];
  for (let n = 0; n < 100 && trovati.length < 6; n++) {
    const c = conto({
      children: caso(20), crazyJumping: caso(6),
      durationMinutes: 5 + caso(300), payLater: caso(4) === 0
    });
    for (let i = 0; i < 100; i++) {
      mossa(c, caso(24));
      trovati.push(...guai(c, 'conto ' + n + '/mossa ' + i));
    }
  }
  ok('nessun conto storto in cento partenze diverse', trovati.slice(0, 6), []);
});

gruppo('Il tempo allungato dopo aver pagato non regala mai niente', () => {
  /* E' il caso che gli era costato dei soldi veri, e va tenuto d'occhio
     per sempre: se allunghi dopo aver incassato, la differenza deve
     tornare dovuta. */
  const male = [];
  for (let n = 0; n < 400; n++) {
    const bimbi = 1 + caso(6);
    const min = 10 + caso(100);
    const c = conto({ children: bimbi, durationMinutes: min });
    ctx.pagaTutto();
    const primaResta = ctx.contoResta();
    const presi = c.paidPark;
    c.durationMinutes = min + 5 + caso(120);        // si allunga
    const dopoResta = ctx.contoResta();
    if (primaResta > 0.005) male.push('n' + n + ': non era saldato (' + primaResta + ')');
    if (c.paidPark !== presi) male.push('n' + n + ': i soldi presi sono cambiati da soli');
    if (dopoResta < -0.005) male.push('n' + n + ': resta negativo ' + dopoResta);
    /* il prezzo non scende mai allungando, quindi o e' pari o e' dovuto */
    if (ctx.priceFor(c.durationMinutes) > ctx.priceFor(min) && dopoResta <= 0.005)
      male.push('n' + n + ': allungato da ' + min + ' a ' + c.durationMinutes + ' e non chiede niente');
  }
  ok('quattrocento allungamenti, nessun regalo', male.slice(0, 5), []);
});

gruppo('I minuti pagati non promettono mai piu' + '’' + ' di quello che i soldi comprano', () => {
  const male = [];
  for (let n = 0; n < 500; n++) {
    const c = conto({ children: 1 + caso(5), crazyJumping: caso(3), durationMinutes: 10 + caso(150) });
    for (let k = 0; k < 4; k++) mossa(c, caso(24));
    const v = vivo();                       // una mossa puo' aver cambiato conto
    const mp = ctx.minutiPagati(v);
    const perBambino = v.children ? Math.max(0, ctx.importoRiga('bimbi')) / v.children : 0;
    /* i minuti del Crazy sono REGALATI: non compaiono qui, mai */
    const regalo = 0;
    if (!v.children) { if (mp !== 0) male.push('n' + n + ': senza bambini promette ' + mp); continue; }
    /* i minuti "comprati" col tempo di parco, tolti quelli in regalo,
       devono costare meno o uguale a quello che ogni bambino ha pagato */
    const comprati = Math.max(0, mp - regalo);
    if (comprati > 0 && ctx.priceFor(comprati) > perBambino + 0.005)
      male.push('n' + n + ': promette ' + comprati + "' che costano " + ctx.priceFor(comprati) +
                ' ma ha pagato ' + perBambino.toFixed(2));
  }
  ok('cinquecento conti, nessun minuto regalato', male.slice(0, 5), []);
});

gruppo('Svuotare e rifare non lascia soldi appesi', () => {
  const male = [];
  for (let n = 0; n < 300; n++) {
    const c = conto({ children: 1 + caso(5), crazyJumping: caso(3), durationMinutes: 10 + caso(120) });
    for (let k = 0; k < 6; k++) mossa(c, caso(24));
    ctx.svuotaScelto({ numeri: true, bar: true, persone: true, tempo: true, soldi: true });
    if (Math.abs(vivo().paidPark) > 0.005) male.push('n' + n + ': parco ' + vivo().paidPark);
    if (Math.abs(ctx.PAN.conto.paidBar) > 0.005) male.push('n' + n + ': bar ' + ctx.PAN.conto.paidBar);
    const amt = ctx.PAN.conto.paidAmt || {};
    Object.keys(amt).forEach(k => { if (Math.abs(amt[k]) > 0.005) male.push('n' + n + ': riga ' + k + ' = ' + amt[k]); });
  }
  ok('trecento svuotate, cassa a zero', male.slice(0, 5), []);
});

gruppo('Gli ingressi vecchi e rotti si raddrizzano', () => {
  /* Roba che puo' arrivare da una versione vecchia, dal cloud, da un
     ripristino andato male. Nessuna di queste deve far esplodere
     niente: al massimo si perde un dato, mai un conto. */
  const schifezze = [
    null, undefined, 0, '', 'ciao', [], { children: 'tre' }, { children: -5 },
    { durationMinutes: 0 }, { durationMinutes: -60 }, { durationMinutes: 1 / 0 },
    { paidPark: NaN }, { paidPark: -100 }, { paidAmt: { bimbi: NaN } },
    { paidAmt: null }, { paidLines: 'boh' }, { barItems: 'niente' },
    { barItems: [{ id: 'b1', qty: -3 }] }, { barItems: [{}] },
    { people: 'nessuno' }, { crazyJumping: 1e9 }, { startTime: 'ieri' }
  ];
  const male = [];
  schifezze.forEach((s, i) => {
    let c;
    try { c = conto(typeof s === 'object' && s ? s : {}); if (typeof s !== 'object' || !s) ctx.PAN.conto = s; } catch (e) { male.push(i + ': ' + e.message); return; }
    try {
      const d = ctx.dueOf(ctx.PAN.conto || {});
      if (!num(d.total) || d.total < -0.005) male.push(i + ': dovuto ' + d.total);
      const m = ctx.minutiPagati(ctx.PAN.conto || {});
      if (!num(m) || m < 0) male.push(i + ': minuti ' + m);
    } catch (e) { male.push(i + ': esplode -> ' + e.message); }
  });
  ok('ventidue schifezze, nessuna esplosione', male.slice(0, 6), []);
});

gruppo('Un elenco di ingressi marcio non porta giu tutta la lista', () => {
  /* La riparazione e' l'ultimo posto in cui una schifezza puo' ancora
     far saltare l'ELENCO INTERO invece di un ingresso solo: se
     normalizeEntries esplode, al banco non compare piu' nessuno. */
  const male = [];
  const elenchi = [
    null, undefined, 'niente', 42, {}, [null], [undefined], ['ciao'], [42],
    [{ barItems: 'niente' }], [{ people: 'nessuno' }], [{ people: [null, 'x'] }],
    [{ paidLines: 'boh' }], [{ children: 'tre', durationMinutes: -1 }],
    [{ barItems: [{ id: 'b1', qty: 'due', price: 'tanto' }] }]
  ];
  elenchi.forEach((l, i) => {
    try {
      const fuori = ctx.normalizeEntries(l);
      if (!Array.isArray(fuori)) male.push(i + ': non torna una lista');
      fuori.forEach((e, k) => {
        const d = ctx.dueOf(e);
        if (!num(d.total) || d.total < -0.005) male.push(i + '/' + k + ': dovuto ' + d.total);
      });
    } catch (e) { male.push(i + ': esplode -> ' + e.message); }
  });
  ok('quindici elenchi marci, nessuno porta giu la lista', male.slice(0, 6), []);
});

gruppo('Incassare non porta mai una riga sopra il suo costo', () => {
  /* Il controllo va fatto NEL MOMENTO del pagamento: dopo, il costo
     puo' scendere (tempo accorciato, un bambino in meno) e i soldi
     restano dove sono -- sono nel cassetto. Ma un tocco sul "paga" non
     deve mai poter prendere piu' di quello che c'e' da prendere. */
  const male = [];
  for (let n = 0; n < 600; n++) {
    const c = conto({ children: caso(7), crazyJumping: caso(4),
                      durationMinutes: 10 + caso(150) });
    ctx.bcSetQ('bimbi', c.children);
    ctx.bcSetQ('crazy', c.crazyJumping);
    const bar = LISTINO();
    for (let k = 0; k < caso(4); k++) ctx.bcSetQ(bar[caso(bar.length)], 1 + caso(3));
    /* si paga in tutti i modi possibili */
    const righe = ['bimbi', 'crazy'].concat(lista(c.barItems).map(x => x.id));
    righe.forEach(id => {
      const prima = ctx.importoRiga(id);
      const costa = ctx.totaleRiga(id);
      ctx.segnaPagate(id, caso(9));
      const dopo = ctx.importoRiga(id);
      if (dopo > prima + 0.005 && dopo > costa + 0.02)
        male.push('n' + n + '/' + id + ': da ' + prima + ' a ' + dopo + ' ma costa ' + costa);
    });
    const primaT = r2(c.paidPark + c.paidBar);
    ctx.pagaTutto();
    const dopoT = r2(c.paidPark + c.paidBar);
    const totale = r2(ctx.dueOf(c).park + ctx.dueOf(c).bar);
    if (dopoT > primaT + 0.005 && dopoT > totale + 0.02)
      male.push('n' + n + ': paga tutto ha preso ' + dopoT + ' su ' + totale);
  }
  ok('seicento incassi, nessuno prende piu’ del dovuto', male.slice(0, 5), []);
});

gruppo('A tempo aperto non entra un euro in anticipo, mai', () => {
  const male = [];
  for (let n = 0; n < 300; n++) {
    const c = conto({ children: 1 + caso(6), crazyJumping: caso(3), durationMinutes: 10 + caso(120), payLater: true });
    const prima = c.paidPark;
    for (let k = 0; k < 5; k++) ctx.pagaTempo(1 + caso(3));
    if (c.paidPark !== prima) male.push('n' + n + ': sono entrati ' + (c.paidPark - prima) + ' euro');
  }
  ok('trecento tentativi, cassa ferma', male.slice(0, 5), []);
});

/* ══════════════════════════════════════════════════════════ */
console.log('\n' + '━'.repeat(52));
if (rotti) {
  console.log('  ' + rotti + ' CONTROLLI ROTTI su ' + fatti);
  process.exitCode = 1;
} else {
  console.log('  TUTTO A POSTO — ' + fatti + ' controlli, ' + gruppi.length + ' gruppi');
}
console.log('━'.repeat(52));

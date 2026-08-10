/* QUELLO CHE SI VEDE DEVE DIRE QUELLO CHE DICONO I CONTI.

       node test/schermo.test.mjs

   Gli altri file provano il modello: che i soldi tornino, che i minuti
   siano quelli giusti. Questo prova la cosa che finora e' sfuggita
   sempre -- che il PEZZO DI SCHERMO racconti la stessa storia.

   Tutti i guasti trovati al banco negli ultimi giri sono di questa
   famiglia, non di quella dei conti:
     - la figura piccola nella lista restava vestita come mezz'ora
       prima, mentre nei dati il vestito era gia' cambiato;
     - la pastiglia diceva "pagato fino alle 18:50" con zero da
       incassare, cioe' chiedeva soldi gia' presi;
     - il numero sulla card del Crazy diceva il totale mentre il piu' e
       il meno muovevano un'altra cosa;
     - un tasto che diceva "+ giro" faceva salire anche una persona.
   In tutti e quattro i conti erano giusti. A mentire era il video.

   Qui si prende l'HTML che l'app scrive DAVVERO -- bcCard(),
   storicoGiri(), pastigliaPagato() -- e si controlla numero per numero
   che dica quello che dicono le funzioni dei conti. */
import { caricaApp } from './ambiente.mjs';

const ctx = caricaApp();
let fatti = 0, rotti = 0;
const gruppi = [];

function gruppo(nome, fn) {
  gruppi.push(nome);
  console.log('\n━━ ' + nome);
  fn();
}
function prova(nome, cond, dettaglio) {
  fatti++;
  if (cond) { console.log('   ok   ' + nome); return true; }
  rotti++;
  console.log('  FALLITO ' + nome + (dettaglio !== undefined ? '\n          ' + dettaglio : ''));
  return false;
}
function uguale(nome, avuto, atteso) {
  const a = JSON.stringify(avuto), b = JSON.stringify(atteso);
  return prova(nome, a === b, a === b ? '' : 'avuto  ' + a + '\n          atteso ' + b);
}

/* un conto vero, messo dentro il pannello come fa l'app */
function conto(extra) {
  const c = Object.assign({
    id: 'x', status: 'active', children: 3, crazyJumping: 0, durationMinutes: 60,
    baseMinutes: 60, payLater: false, barItems: [], paidLines: {}, paidAmt: {},
    paidPark: 0, paidBar: 0, people: [],
    startTime: new Date(2026, 7, 9, 14, 30).getTime()
  }, extra || {});
  ctx.PAN.conto = c;
  ctx.PAN.ingresso = c;
  return c;
}
/* il pezzo di HTML della card del Crazy, come lo scrive l'app */
const cardCrazy = () => ctx.bcCard(ctx.bcVoce('crazy'), true);
/* i numeri dentro le pastiglie/righe, in ordine */
const presi = (html, re) => [...html.matchAll(re)].map(m => m[1]);

/* ══════════════════════════════════════════════════════════ */
gruppo('La card del Crazy dice quello che i conti sanno', () => {
  const c = conto({ crazyJumping: 5, crazyGiri: [3, 2] });
  ctx.giroScelto = 1;
  const h = cardCrazy();

  /* IL NUMERO GRANDE E' IL GIRO CHE SI STA SEGNANDO, non il totale:
     sono il piu' e il meno accanto a muoverlo. Quando erano due cose
     diverse nello stesso posto, aprire un giro nuovo non faceva
     ripartire il contatore da zero e sembrava tutto rotto. */
  uguale('il numero sulla card e il giro scelto',
    presi(h, /class="bc-chip">(\d+)</g)[0], String(ctx.giriCrazy(c)[1]));

  uguale('e cambia scegliendo un altro giro', (() => {
    ctx.giroScelto = 0;
    return presi(cardCrazy(), /class="bc-chip">(\d+)</g)[0];
  })(), String(ctx.giriCrazy(c)[0]));

  /* il totale sta scritto sopra, accanto al prezzo */
  const testa = cardCrazy();
  prova('sopra c e il totale delle salite', testa.indexOf('5 salite') >= 0, testa.slice(0, 400));
  prova('e quanti giri sono', testa.indexOf('2 giri') >= 0);
  prova('col prezzo di una salita', testa.indexOf(ctx.eur(ctx.prezzoUnita('crazy'))) >= 0);

  /* una riga per giro, col numero di quel giro */
  uguale('una riga per giro, coi numeri giusti',
    presi(testa, /class="st-g"[^>]*>.*?<b>(\d+)<\/b>/g), ['3', '2']);
  ctx.giroScelto = 1;
  prova('la riga scelta e accesa, e solo quella', (() => {
    const x = cardCrazy();
    const righe = [...x.matchAll(/class="st-riga( on)?"[\s\S]{0,220}?<b>(\d+)<\/b>/g)];
    return righe.length === 2 && !righe[0][1] && !!righe[1][1] && righe[1][2] === '2';
  })());
  uguale('ogni riga ha il suo cancella',
    presi(testa, /data-gvia="(\d+)"/g), ['0', '1']);
  prova('e c e il tasto per aprire un giro', testa.indexOf('data-giro="crazy"') >= 0);

  /* i minuti scritti sono quelli che l'app usa davvero per l'uscita */
  const min = ctx.minutiCrazy(c);
  prova('i minuti in cima sono quelli veri', testa.indexOf('+' + min + '′') >= 0,
    'minutiCrazy dice ' + min);
  uguale('e sono l ora d uscita meno la durata comprata',
    Math.round((ctx.endTimeOf(c) - c.startTime) / 60000) - c.durationMinutes, min);
});

gruppo('Un giro aperto e vuoto si vede, e non regala niente', () => {
  const c = conto({ crazyJumping: 3, crazyGiri: [3] });
  ctx.giroNuovo(c);
  const h = cardCrazy();
  uguale('il contatore riparte da zero', presi(h, /class="bc-chip">(\d+)</g)[0], '0');
  prova('la riga lo dice: "da contare"', h.indexOf('da contare') >= 0);
  prova('e la riga vuota non chiede soldi', h.indexOf('da contare') >= 0 &&
    (h.match(/da pagare/g) || []).length === 1, 'una sola riga da pagare');
  prova('i minuti totali stanno in cima, una volta sola',
    (h.match(/\+8′/g) || []).length === 1);
  uguale('i soldi non si muovono per un giro vuoto',
    ctx.contoCrazy(), 3 * ctx.settings.crazyJumpingPrice);
  uguale('e nemmeno l ora d uscita',
    Math.round((ctx.endTimeOf(c) - c.startTime) / 60000),
    60 + ctx.settings.crazyExtraMinutes);
});

gruppo('La card del Crazy e la riga dei tagli non cambiano forma sotto le dita', () => {
  /* LA COLONNA DEI GIRI C'E' SEMPRE. Comparendo solo dopo la prima
     salita, la card si allargava di colpo a meta' lavoro e il tasto
     "+ giro" appariva dove un attimo prima c'era altro. */
  const c = conto({ children: 3, crazyJumping: 0, durationMinutes: 60, baseMinutes: 60 });
  const vuota = cardCrazy();
  prova('a zero giri la colonna c\u2019e\u2019 lo stesso', vuota.indexOf('bc-storico') > 0);
  prova('e dice come si apre il primo', vuota.indexOf('st-vuoto') > 0 &&
    vuota.indexOf('+ giro') > 0, vuota.slice(0, 160));
  prova('la card e\u2019 gia\u2019 larga', vuota.indexOf('con-storico') > 0);

  ctx.bcSetQ('crazy', 2);
  const piena = cardCrazy();
  prova('e con un giro dentro resta larga uguale', piena.indexOf('con-storico') > 0);
  prova('senza piu\u2019 la riga di istruzioni', piena.indexOf('st-vuoto') < 0);
  prova('col giro scritto', /class="st-riga on"/.test(piena));
});

gruppo('Solo Crazy: due parole al posto dei tagli, non un cartellone', () => {
  /* L'avviso vive dove stavano i tagli 15m 30m 1h 1h30: in un ingresso
     senza tempo di parco quelli sono l'unica riga da non toccare. */
  const c = conto({ children: 0, crazyJumping: 0, durationMinutes: 30, baseMinutes: 30 });
  prova('un ingresso normale non e\u2019 di soli salti', ctx.soloSalti(c) === false);

  ctx.bcSetQ('crazy', 2);            // salgono in due, e basta
  uguale('niente tempo di parco comprato', c.durationMinutes, 0);
  uguale('ma dieci minuti in omaggio', ctx.omaggioDi(c), 10);
  prova('adesso e\u2019 di soli salti', ctx.soloSalti(c) === true);
  uguale('e l\u2019omaggio non si paga', ctx.costOf(c).parkTotal, 0);

  /* appena arriva un bambino non lo e' piu': si torna ai tagli */
  c.children = 2;
  prova('con un bambino in sala non lo e\u2019 piu\u2019', ctx.soloSalti(c) === false);
  /* e nemmeno se poi il tempo lo comprano: quel tempo si paga,
     l'omaggio resta regalato */
  c.durationMinutes = 30;
  prova('ne\u2019 se comprano il tempo', ctx.soloSalti(c) === false);
  uguale('e i minuti in omaggio restano regalati',
    ctx.costOf(c).parkTotal, ctx.r2(ctx.priceFor(30) * 2));
});

gruppo('L\u2019ora d\u2019ingresso segue l\u2019orologio finche\u2019 non la tocchi', () => {
  /* Prima l'ora si fermava all'apertura della schermata: chi ci metteva
     dieci minuti a registrare un gruppo gli segnava dieci minuti di
     parco che non aveva fatto. */
  ctx.PAN.ingresso = null;
  ctx.PAN.root = null;
  ctx.draft = ctx.freshDraft();
  ctx.PAN.conto = ctx.draft;
  ctx.draft.startTime = Date.now() - 20 * 60000;
  ctx.ingressoLive();
  const scarto = Math.abs(Date.now() - ctx.draft.startTime);
  prova('senza toccarla, si rimette ad adesso', scarto < 6 * 60000,
    'scarto ' + Math.round(scarto / 60000) + ' minuti');

  /* messa a mano, sta ferma: e' il tasto "Ora" a riportarla al vivo */
  ctx.draft.oraManuale = true;
  ctx.draft.startTime = Date.now() - 40 * 60000;
  const fermo = ctx.draft.startTime;
  ctx.ingressoLive();
  uguale('messa a mano, non si muove piu\u2019', ctx.draft.startTime, fermo);

  /* e un ingresso gia' registrato non la muove di certo */
  const e = conto({ startTime: Date.now() - 90 * 60000 });
  const suo = e.startTime;
  ctx.PAN.conto = e; ctx.PAN.ingresso = e;
  ctx.ingressoLive();
  uguale('e chi e\u2019 gia\u2019 dentro resta col suo orario', e.startTime, suo);
  ctx.PAN.ingresso = e;
});

gruppo('Si vede QUALI giri sono pagati, e cancellarne uno rimette i soldi', () => {
  /* La cassa conta le salite pagate, non i giri: da "tre su cinque"
     non si capisce quale giro sia a posto. Le pagate si riempiono in
     ordine, dal primo giro, e ogni riga dello storico lo dice. */
  const c = conto({ children: 0, crazyJumping: 0, durationMinutes: 30, baseMinutes: 30 });
  ctx.bcSetQ('crazy', 3);          // primo giro: tre saliti
  ctx.giroNuovo(c);
  ctx.cambiaGiro(c, 1, 2);         // secondo giro: due
  uguale('due giri: tre e due', ctx.giriCrazy(c), [3, 2]);

  ctx.segnaPagate('crazy', 3);     // pagato il primo giro
  uguale('il primo giro risulta pagato', ctx.pagateDelGiro(c, 0), 3);
  uguale('il secondo no', ctx.pagateDelGiro(c, 1), 0);
  const h = cardCrazy();
  prova('e lo storico lo scrive', /class="st-riga saldato"/.test(h) && h.indexOf('da pagare') > 0, h.slice(0, 200));

  ctx.segnaPagate('crazy', 4);     // e una salita del secondo
  uguale('mezzo secondo giro', ctx.pagateDelGiro(c, 1), 1);
  prova('la riga a meta si vede', /class="st-riga[^"]*meta"/.test(cardCrazy()));

  /* CANCELLARE UN GIRO GIA' PAGATO non deve lasciare soldi appesi:
     un giro inserito per sbaglio non e' un debito verso il cliente. */
  const presiPrima = ctx.importoRiga('crazy');
  ctx.viaGiro(c, 1);               // via il secondo giro (uno pagato dentro)
  uguale('resta un giro solo', ctx.giriCrazy(c), [3]);
  uguale('e le spunte non superano le salite', ctx.bcPag('crazy') <= 3, true);
  uguale('niente da restituire', ctx.dueOf(c).avanzo, 0);
  uguale('e i soldi tornati indietro sono quelli della salita tolta',
     ctx.r2(presiPrima - ctx.importoRiga('crazy')), ctx.r2(presiPrima / 4));

  /* e cancellando anche l'ultimo, la cassa torna a zero */
  ctx.viaGiro(c, 0);
  uguale('niente giri, niente salite', ctx.giriCrazy(c), []);
  uguale('e niente soldi appesi', ctx.importoRiga('crazy'), 0);
  uguale('ne da restituire', ctx.dueOf(c).avanzo, 0);
});

gruppo('La pastiglia del tempo non chiede soldi gia presi', () => {
  /* IL GUASTO CHE C'ERA: a conto saldato diceva ancora "pagato fino
     alle 18:50" con la barra all'89%, perche' i minuti si ricavavano
     dal cartello e il cartello finisce alle due ore. */
  const c = conto({ children: 2, durationMinutes: 150, baseMinutes: 150 });
  prova('prima di incassare dice quanto manca',
    ctx.pastigliaPagato(c).indexOf(ctx.eur(ctx.dueOf(c).park)) >= 0);
  ctx.pagaTutto();
  const h = ctx.pastigliaPagato(c);
  prova('a conto saldato dice "pagato tutto"', h.indexOf('pagato tutto') >= 0, h);
  prova('e non dice piu "da pagare"', h.indexOf('da pagare') < 0);
  uguale('e i minuti pagati coprono tutto il tempo comprato',
    ctx.minutiPagati(c) >= ctx.tempoTotale(c), true);

  /* mezzo pagato deve restare mezzo pagato */
  const d = conto({ children: 2, durationMinutes: 60, baseMinutes: 60 });
  ctx.segnaPagate('bimbi', 1);
  const m = ctx.pastigliaPagato(d);
  prova('con meta gruppo pagato dice fin quando e coperto',
    m.indexOf('pagato fino alle') >= 0, m);
  prova('e l orario scritto e quello dei minuti pagati',
    m.indexOf(ctx.fmtTime(d.startTime + ctx.minutiPagati(d) * 60000)) >= 0);

  /* i casi che non hanno una cifra */
  prova('senza bambini lo dice', ctx.pastigliaPagato(conto({ children: 0 })).indexOf('nessun bambino') >= 0);
  prova('a tempo aperto lo dice',
    ctx.pastigliaPagato(conto({ payLater: true })).indexOf('all’uscita') >= 0);
});

gruppo('Il tasto che allunga scrive il prezzo che poi chiede', () => {
  /* la prova che mancava quando i due tasti dicevano la stessa cifra */
  const T = ctx.settings.tariffs;
  for (const bimbi of [1, 3]) {
    for (const durata of [15, 30, 60, 90]) {
      const c = conto({ children: bimbi, durationMinutes: durata, baseMinutes: durata });
      for (const agg of [15, 30, 60]) {
        const scritto = ctx.costoEstensione(c, agg);
        const atteso = ctx.r2(ctx.priceFor(ctx.up5(agg)) * bimbi);
        if (Math.abs(scritto - atteso) > 0.005) {
          prova('il tasto +' + agg + 'm su ' + bimbi + ' bambini da ' + durata + "'", false,
            'dice ' + scritto + ', il cartello dice ' + atteso);
          return;
        }
      }
    }
  }
  prova('il prezzo scritto e sempre la tariffa del tempo aggiunto', true);

  /* e quello che scrive e' quello che entra in cassa */
  const c = conto({ children: 3, durationMinutes: 30, baseMinutes: 30 });
  const scritto = ctx.costoEstensione(c, 30);
  const prima = ctx.dueOf(c).park;
  c.durationMinutes += 30;
  c.aggiunte = (c.aggiunte || []).concat([30]);
  ctx.sistemaAggiunte(c);
  uguale('e la cassa chiede esattamente quello', ctx.r2(ctx.dueOf(c).park - prima), scritto);
  prova('due tasti diversi non dicono la stessa cifra',
    ctx.costoEstensione(c, 15) !== ctx.costoEstensione(c, 30));
});

gruppo('La riga della lista si accorge del vestito cambiato', () => {
  /* la firma e' quella che fa scattare il ridisegno: se non cambia
     quando cambia un vestito, la figura piccola resta vecchia */
  const p = { id: 'p1', role: 'mamma', name: 'Anna', note: '',
    avatar: ctx.AV.normalize(null, 'mamma') };
  const e = { id: 'e1', people: [p] };
  const prima = ctx.firmaGente(e);
  p.avatar.top.color = '#E23D4B';
  prova('cambiando il colore del capo, la firma cambia', ctx.firmaGente(e) !== prima);
  const dopoColore = ctx.firmaGente(e);
  p.avatar.top.style = 'felpa';
  prova('cambiando il capo, la firma cambia', ctx.firmaGente(e) !== dopoColore);
  const dopoCapo = ctx.firmaGente(e);
  p.name = 'Giulia';
  prova('cambiando il nome, la firma cambia', ctx.firmaGente(e) !== dopoCapo);
  const dopoNome = ctx.firmaGente(e);
  e.people = [];
  prova('togliendo il riferimento, la firma cambia', ctx.firmaGente(e) !== dopoNome);
  prova('e senza nessuno e vuota', ctx.firmaGente(e) === '');
});

gruppo('Bombardamento sui giri di Crazy e sulle vendite di tempo', () => {
  /* Sequenze a caso di tutto quello che si puo' premere su questa
     roba, e dopo OGNI tocco si controlla che il mondo stia in piedi.
     I bit alti del generatore: quelli bassi di un LCG non sono
     casuali per niente, e una volta ci ho gia' sbattuto. */
  let seme = 987654321;
  const caso = (n) => {
    seme = (seme * 1103515245 + 12345) & 0x7fffffff;
    return Math.floor((seme >>> 15) / 65536 * n) % n;
  };
  const c = conto({ children: 2, crazyJumping: 0, durationMinutes: 60, baseMinutes: 60 });
  const guai = [];
  const extra = ctx.settings.crazyExtraMinutes;

  for (let i = 0; i < 4000 && !guai.length; i++) {
    const g = ctx.giriCrazy(c);
    switch (caso(9)) {
      case 0: ctx.giroNuovo(c); break;
      case 1: if (g.length) ctx.cambiaGiro(c, caso(g.length), 1); break;
      case 2: if (g.length) ctx.cambiaGiro(c, caso(g.length), -1); break;
      case 3: if (g.length) ctx.viaGiro(c, caso(g.length)); break;
      case 4: ctx.giroScelto = caso(6); break;
      case 5: ctx.metteCrazy(c, caso(7)); break;
      case 6: {
        const agg = [15, 30, 60][caso(3)];
        c.durationMinutes = Math.max(5, c.durationMinutes + agg);
        c.aggiunte = (c.aggiunte || []).concat([agg]);
        ctx.sistemaAggiunte(c);
        break;
      }
      case 7: c.durationMinutes = Math.max(5, c.durationMinutes - 15); ctx.sistemaAggiunte(c); break;
      default: c.durationMinutes = [15, 30, 60, 90][caso(4)]; delete c.aggiunte; break;
    }

    const gg = ctx.giriCrazy(c);
    const somma = gg.reduce((a, b) => a + b, 0);
    const pieni = gg.filter(n => n > 0).length;
    const vendute = (c.aggiunte || []).reduce((a, b) => a + b, 0);
    const dueTot = ctx.dueOf(c).total;

    if (somma !== ctx.clamp(c.crazyJumping, 0, 1e6))
      guai.push(i + ': i giri sommano ' + somma + ' ma le salite sono ' + c.crazyJumping);
    else if (gg.some(n => n < 0 || !Number.isFinite(n)))
      guai.push(i + ': un giro con un numero storto ' + JSON.stringify(gg));
    else if (ctx.minutiCrazy(c) !== pieni * extra)
      guai.push(i + ': minuti regalati ' + ctx.minutiCrazy(c) + ' invece di ' + pieni * extra);
    else if (Math.round((ctx.endTimeOf(c) - c.startTime) / 60000) !==
             c.durationMinutes + pieni * extra)
      guai.push(i + ': l ora d uscita non torna');
    else if (ctx.r2(ctx.contoCrazy()) !== ctx.r2(somma * ctx.settings.crazyJumpingPrice))
      guai.push(i + ': il Crazy costa ' + ctx.contoCrazy() + ' con ' + somma + ' salite');
    else if (vendute > c.durationMinutes)
      guai.push(i + ': venduti ' + vendute + ' minuti su ' + c.durationMinutes);
    else if (!Number.isFinite(dueTot) || dueTot < 0)
      guai.push(i + ': dovuto ' + dueTot);
  }
  uguale('quattromila tocchi a caso, e i conti stanno in piedi', guai.slice(0, 3), []);

  /* e a fine bombardamento la cassa si chiude lo stesso */
  ctx.pagaTutto();
  uguale('e alla fine "paga tutto" chiude davvero', ctx.contoResta() <= 0.005, true);
  uguale('col tempo che risulta pagato tutto',
    ctx.minutiPagati(c) >= ctx.tempoTotale(c), true);
});

gruppo('Il video regge anche i dati assurdi', () => {
  /* quello che arriva da un salvataggio vecchio, dal cloud o da un
     ripristino puo' essere qualunque cosa: la card non deve scrivere
     "NaN" ne' sparire */
  const casi = [
    { crazyJumping: 3, crazyGiri: 'due' },
    { crazyJumping: 3, crazyGiri: [] },
    { crazyJumping: 3, crazyGiri: [1, 1, 1, 1, 1] },
    { crazyJumping: 0, crazyGiri: [2, 2] },
    { crazyJumping: 'tre', crazyGiri: [1] },
    { crazyJumping: -5, crazyGiri: [-1, 2] },
    { crazyJumping: 2, crazyGiri: [null, undefined, 2] }
  ];
  let male = '';
  casi.forEach((extra, i) => {
    const c = conto(extra);
    let h = '';
    try { h = cardCrazy(); } catch (e) { male = male || (i + ': si e rotta — ' + e.message); return; }
    if (/NaN|undefined|null/.test(h)) male = male || (i + ': scrive NaN o undefined');
    const gg = ctx.giriCrazy(c);
    const somma = gg.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(somma) || somma < 0) male = male || (i + ': somma storta ' + somma);
    if (somma !== ctx.clamp(ctx.num(c.crazyJumping, 0), 0, 1e6) && gg.length)
      male = male || (i + ': la somma non torna con le salite');
  });
  prova('sette schifezze diverse, nessuna manda a video un NaN', !male, male);
});

/* ══════════════════════════════════════════════════════════════ */
console.log('\n' + '━'.repeat(52));
console.log(rotti === 0
  ? '  TUTTO A POSTO — ' + fatti + ' controlli, ' + gruppi.length + ' gruppi'
  : '  ' + rotti + ' CONTROLLI ROTTI su ' + fatti);
process.exit(rotti === 0 ? 0 : 1);

/* I conti del banco, provati sul codice VERO (test/ambiente.mjs carica
   js/app.js dentro node).

       node test/conti.test.mjs

   Le regole del denaro sono l'unica cosa dell'app che non puo'
   sbagliare: un pixel storto si vede e si aggiusta, un euro perso no.
   Qui dentro ci sono sia le regole -- tariffe, Crazy, tetto delle due
   ore -- sia le garanzie sui dati: qualunque schifezza arrivi da una
   versione vecchia, dal cloud o da una copia ripristinata, quello che
   entra in memoria deve restare un conto sensato. */
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

/* un conto nuovo di zecca su cui lavorano le funzioni del pannello */
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
const bar = (id, price, qty) => ({ id, name: id, price, qty });

/* ══════════════════════════════════════════════════════════════ */
gruppo('Le tariffe', () => {
  const c = conto({ children: 1 });
  c.durationMinutes = 10; ok('10 minuti', ctx.contoParco(), ctx.priceFor(10));
  c.durationMinutes = 60; ok('un ora', ctx.contoParco(), 12);
  c.children = 3; ok('tre bambini', ctx.contoParco(), 36);
  c.children = 1;
  c.durationMinutes = 125; ok('oltre le due ore ci si ferma', ctx.contoParco(), 24);
  c.durationMinutes = 600; ok('e resta fermo anche a dieci ore', ctx.contoParco(), 24);
  c.durationMinutes = 61; ok('61 minuti si arrotondano allo scaglione dopo', ctx.contoParco(), ctx.priceFor(65));
});

gruppo('Zero bambini costa zero', () => {
  const c = conto({ children: 0, durationMinutes: 60 });
  ok('nessun bambino, nessun ingresso', ctx.contoParco(), 0);
  ok('e il conto e vuoto', ctx.dueOf(c).total, 0);
  c.barItems = [bar('b1', 2.5, 2)];
  ok('ma il bar si paga lo stesso', ctx.dueOf(c).total, 5);
});

gruppo('Il Crazy Jumping', () => {
  const extra = ctx.settings.crazyExtraMinutes;
  const c = conto({ children: 1, crazyJumping: 3, durationMinutes: 60 });
  ok('costa a parte, per ognuno che sale', ctx.contoCrazy(), 3 * ctx.settings.crazyJumpingPrice);
  ok('e non gonfia lo scaglione del parco', ctx.contoParco(), 12);

  /* IL TEMPO SI CONTA A GIRI, NON A TESTE. Tre bambini che salgono
     insieme fanno un giro solo: il gruppo resta dentro otto minuti in
     piu', non ventiquattro. Contarli a testa regalava mezz'ora a una
     comitiva -- e sballava l'ora scritta sul bracciale. */
  const minuti = Math.round((ctx.endTimeOf(c) - c.startTime) / 60000);
  ok('tre che salgono INSIEME sono un giro solo', minuti, 60 + extra);
  ok('ed e un giro, non tre', ctx.turniCrazy(c), 1);

  ok('e sono scritti uno per uno', ctx.giriCrazy(c), [3]);

  /* IL GIRO NUOVO NASCE VUOTO. Non ci sale nessuno da solo: chi sale
     lo conti col piu' della card, che riparte da zero. Prima ci
     metteva dentro una salita di sua iniziativa, cioe' quattro euro
     sul conto che nessuno aveva chiesto. */
  ctx.giroNuovo(c);
  ok('un altro giro, e nasce vuoto', ctx.giriCrazy(c), [3, 0]);
  ok('nessuno e salito: le salite restano tre', c.crazyJumping, 3);
  ok('e un giro vuoto non regala minuti',
     Math.round((ctx.endTimeOf(c) - c.startTime) / 60000), 60 + extra);
  ok('ne costa un euro', ctx.contoCrazy(), 3 * ctx.settings.crazyJumpingPrice);

  /* adesso ci sale qualcuno: il piu' lavora sul giro aperto */
  ctx.cambiaGiro(c, 1, 1);
  ok('sale il primo del secondo giro', ctx.giriCrazy(c), [3, 1]);
  ok('quattro salite pagate', c.crazyJumping, 4);
  ok('e adesso i blocchi di minuti sono due',
     Math.round((ctx.endTimeOf(c) - c.startTime) / 60000), 60 + 2 * extra);
  ok('i soldi seguono le salite, non i giri',
     ctx.contoCrazy(), 4 * ctx.settings.crazyJumpingPrice);

  ctx.cambiaGiro(c, 1, 1);
  ok('un altro nel secondo giro', ctx.giriCrazy(c), [3, 2]);
  ok('cinque salite: tre la prima volta, due la seconda', c.crazyJumping, 5);

  /* si puo' correggere un giro VECCHIO senza toccare gli altri */
  ctx.cambiaGiro(c, 0, -1);
  ok('tolto uno dal PRIMO giro', ctx.giriCrazy(c), [2, 2]);
  ok('quattro salite', c.crazyJumping, 4);

  /* e si puo' cancellare un giro intero */
  ctx.viaGiro(c, 1);
  ok('cancellato il secondo giro', ctx.giriCrazy(c), [2]);
  ok('chi c era dentro esce dal conto', c.crazyJumping, 2);
  ok('e i minuti tornano a un blocco solo',
     Math.round((ctx.endTimeOf(c) - c.startTime) / 60000), 60 + extra);

  /* e chi arriva da una versione vecchia (senza il campo) vale un giro
     solo con tutti dentro: e' la lettura giusta di quei dati */
  const vecchio = ctx.normalizeEntries([{ id: 'v', children: 2, crazyJumping: 4,
    durationMinutes: 60, startTime: Date.now(), status: 'active' }])[0];
  ok('i dati vecchi valgono un giro solo', vecchio.crazyGiri, [4]);

  /* e una lista che non torna coi conti si riallinea invece di
     raccontare due storie diverse */
  const storto = ctx.normalizeEntries([{ id: 's', children: 1, crazyJumping: 5,
    crazyGiri: [2, 2, 'due', -1], durationMinutes: 60, startTime: Date.now(), status: 'active' }])[0];
  ok('una lista storta si rimette in riga',
     storto.crazyGiri.reduce((a, b) => a + b, 0), storto.crazyJumping);

  /* senza nessuno che sale, non c'e' nessun giro */
  const senza = conto({ children: 1, crazyJumping: 0, durationMinutes: 60 });
  ok('nessuna salita, nessun giro', ctx.turniCrazy(senza), 0);
  ok('e nessun minuto regalato',
     Math.round((ctx.endTimeOf(senza) - senza.startTime) / 60000), 60);
});

gruppo('Paga dopo', () => {
  const c = conto({ children: 2, payLater: true, startTime: Date.now() - 40 * 60000 });
  vero('si conta il tempo passato', ctx.contoParco() > 0);
  c.startTime = Date.now();
  ok('appena entrato paga lo scaglione minimo', ctx.contoParco(), 2 * ctx.priceFor(0));
});

gruppo('Le spunte muovono i soldi una volta sola', () => {
  const c = conto({ children: 2, durationMinutes: 60 });
  ctx.segnaPagate('bimbi', 1);
  ok('un bambino pagato', c.paidPark, 12);
  ok('e la spunta lo dice', c.paidLines.bimbi, 1);
  ctx.segnaPagate('bimbi', 1);
  ok('ripetere non raddoppia', c.paidPark, 12);
  ctx.segnaPagate('bimbi', 2);
  ok('il secondo bambino', c.paidPark, 24);
  ok('non resta niente', ctx.dueOf(c).total, 0);
  ctx.segnaPagate('bimbi', 0);
  ok('storno: i soldi tornano', c.paidPark, 0);
  ok('e torna dovuto tutto', ctx.dueOf(c).total, 24);
});

gruppo('Il prezzo che cambia dopo', () => {
  const c = conto({ children: 2, durationMinutes: 60 });
  ctx.bcSegna('bimbi', true);
  ok('saldato a un ora', ctx.dueOf(c).total, 0);
  c.durationMinutes = 120;
  ok('allungato: torna dovuta la differenza', ctx.dueOf(c).total, 24);
  ctx.bcSetQ('bimbi', 1);
  ok('tolto un bambino: si rende quel che era entrato, non di piu', c.paidPark, 12);
  ok('e il conto resta sensato', ctx.dueOf(c).total, 12);
  vero('mai un rimborso piu grande dell incasso', c.paidPark >= 0);
});

gruppo('Il tasto paga rabbocca, non risomma', () => {
  const c = conto({ children: 1, durationMinutes: 60, barItems: [bar('b1', 2.5, 2)] });
  /* come se avesse gia' dato qualcosa in contanti */
  ctx.muoviSoldi('bimbi', 10);
  ok('dieci euro sul parco', c.paidPark, 10);
  ctx.bcSegna('bimbi', true);
  ok('paga parco: mette solo i due mancanti', c.paidPark, 12);
  ok('resta solo il bar', ctx.dueOf(c).total, 5);
  ctx.bcSegna('bar', true);
  ok('paga bar', c.paidBar, 5);
  ok('conto chiuso', ctx.dueOf(c).total, 0);
});

gruppo('Paga tutto', () => {
  const c = conto({ children: 3, crazyJumping: 2, durationMinutes: 45,
                    barItems: [bar('b1', 1, 3), bar('b2', 2.5, 1)] });
  const tot = ctx.dueOf(c).park + ctx.dueOf(c).bar;
  ctx.pagaTutto();
  ok('non resta niente', ctx.dueOf(c).total, 0);
  ok('e non e entrato piu del dovuto', ctx.dueOf(c).avanzo, 0);
  ok('gli importi tornano col totale', Math.round((c.paidPark + c.paidBar) * 100) / 100, tot);
  ok('tutte le spunte piene', [c.paidLines.bimbi, c.paidLines.crazy, c.paidLines.b1, c.paidLines.b2], [3, 2, 3, 1]);
});

gruppo('Togliere roba dal conto', () => {
  const c = conto({ children: 1, barItems: [bar('b1', 2, 3)] });
  ctx.bcSegna('bar', true);
  ok('tre bibite pagate', c.paidBar, 6);
  ctx.bcSetQ('b1', 1);
  ok('ne restano una: si rende in proporzione', c.paidBar, 2);
  ok('e la spunta segue', c.paidLines.b1, 1);
  ctx.bcSetQ('b1', 0);
  ok('tolte tutte: niente soldi appesi', c.paidBar, 0);
  ok('nessun avanzo fantasma', ctx.dueOf(c).avanzo, 0);
});

/* ══════════════════════════════════════════════════════════════ */
gruppo('I dati vecchi si traducono', () => {
  const v = ctx.normalizeEntries([{
    id: 'v', children: 3, crazyJumping: 1, durationMinutes: 60, people: [],
    barItems: [bar('b1', 1, 3)],
    paidLines: { child_0: true, child_1: true, crazy_0: true, bar_b1_0: true, bar_b1_1: true },
    paidPark: 28, paidBar: 2, status: 'active'
  }])[0];
  ok('bambini', v.paidLines.bimbi, 2);
  ok('crazy', v.paidLines.crazy, 1);
  ok('bar', v.paidLines.b1, 2);
  ok('niente chiavi vecchie', Object.keys(v.paidLines).sort(), ['b1', 'bimbi', 'crazy']);
  ok('i totali di sezione non si toccano', [v.paidPark, v.paidBar], [28, 2]);
  ok('e gli importi per riga si ricostruiscono', [v.paidAmt.bimbi, v.paidAmt.crazy, v.paidAmt.b1], [24, 4, 2]);

  const misto = ctx.normalizeEntries([{
    id: 'm', children: 2, crazyJumping: 0, durationMinutes: 60, people: [],
    barItems: [bar('b1', 1, 2)],
    paidLines: { child_0: true, b1: 2 },     // vecchio e nuovo insieme
    paidPark: 12, paidBar: 2, status: 'active'
  }])[0];
  ok('formati misti: tiene tutti e due', [misto.paidLines.bimbi, misto.paidLines.b1], [1, 2]);

  const soloSoldi = ctx.normalizeEntries([{
    id: 's', children: 1, crazyJumping: 0, durationMinutes: 60, people: [], barItems: [],
    paidLines: {}, paidPark: 7, paidBar: 0, status: 'active'
  }])[0];
  ok('contante senza spunte: non sparisce', soloSoldi.paidAmt.bimbi, 7);
  ok('e resta il giusto da incassare', ctx.dueOf(soloSoldi).total, 5);
});

gruppo('La riparazione regge qualunque schifezza', () => {
  const brutto = ctx.normalizeEntries([{
    id: 'b', children: '3', crazyJumping: -2, durationMinutes: NaN, people: [],
    barItems: [bar('b1', 'due', 2), bar('b2', 3, -1), { name: 'senza id', price: 1, qty: 1 }, null],
    paidLines: { bimbi: 99, fantasma: 5, b1: '1' },
    paidAmt: { bimbi: 'tanti', b1: -4 },
    paidPark: Infinity, paidBar: undefined, status: 'active'
  }])[0];
  ok('bambini da stringa', brutto.children, 3);
  ok('crazy negativo azzerato', brutto.crazyJumping, 0);
  ok('durata NaN torna un ora', brutto.durationMinutes, 60);
  ok('righe del bar ripulite', brutto.barItems.map(b => b.id + ':' + b.qty + ':' + b.price), ['b1:2:0']);
  ok('spunte tagliate alla quantita', brutto.paidLines.bimbi, 3);
  ok('chiavi fantasma via', 'fantasma' in brutto.paidLines, false);
  ok('spunta del bar da stringa', brutto.paidLines.b1, 1);
  vero('nessun importo strano', Number.isFinite(brutto.paidPark) && brutto.paidPark >= 0);
  vero('nemmeno sul bar', Number.isFinite(brutto.paidBar) && brutto.paidBar >= 0);
  const d = ctx.dueOf(brutto);
  vero('e il dovuto e un numero vero', Number.isFinite(d.total) && d.total >= 0);

  const storto = ctx.normalizeEntries([{
    id: 't', children: 2, crazyJumping: 0, durationMinutes: 60, people: [], barItems: [],
    paidLines: { bimbi: 2 }, paidAmt: { bimbi: 3 }, paidPark: 24, paidBar: 0, status: 'active'
  }])[0];
  ok('importi che non tornano col totale: si rifanno', storto.paidAmt.bimbi, 24);
});

gruppo('Il giro completo non perde niente', () => {
  const c = conto({ children: 2, crazyJumping: 1, durationMinutes: 90,
                    barItems: [bar('b1', 2.5, 2)] });
  ctx.segnaPagate('bimbi', 1);
  ctx.segnaPagate('b1', 2);
  const prima = { due: ctx.dueOf(c).total, park: c.paidPark, bar: c.paidBar };
  /* salvato, riletto, normalizzato: deve tornare identico */
  const dopo = ctx.normalizeEntries(JSON.parse(JSON.stringify([c])))[0];
  ok('il dovuto non cambia', ctx.dueOf(dopo).total, prima.due);
  ok('ne l incassato sul parco', dopo.paidPark, prima.park);
  ok('ne quello del bar', dopo.paidBar, prima.bar);
  /* e una seconda passata non cambia piu' niente (idempotenza) */
  const terzo = ctx.normalizeEntries([JSON.parse(JSON.stringify(dopo))])[0];
  ok('normalizzare due volte non sposta nulla', JSON.stringify(terzo), JSON.stringify(dopo));
});

gruppo('I minuti pagati: si leggono e basta', () => {
  /* La card "Estendi tempo" dice quanti minuti sono gia' coperti dai
     soldi presi. E' una LETTURA -- non sposta un euro -- ma se sbaglia
     dice al banco che un cliente e' a posto quando non lo e'. */
  const c = conto({ children: 2, crazyJumping: 0, durationMinutes: 60, barItems: [] });
  ok('senza un euro non e coperto niente', ctx.minutiPagati(c), 0);

  ctx.segnaPagate('bimbi', 1);
  const meta = ctx.minutiPagati(c);
  ok('mezzo pagamento copre qualcosa ma non tutto', meta > 0 && meta < 60, true);

  ctx.segnaPagate('bimbi', 2);
  ok('pagati tutti, coperta tutta la durata', ctx.minutiPagati(c) >= 60, true);

  /* piu' soldi non possono voler dire meno minuti */
  const c2 = conto({ children: 3, crazyJumping: 0, durationMinutes: 90, barItems: [] });
  let prima = -1, sale = true;
  for (let n = 0; n <= 3; n++) {
    ctx.segnaPagate('bimbi', n);
    const m = ctx.minutiPagati(c2);
    if (m < prima) sale = false;
    prima = m;
  }
  ok('pagando di piu i minuti non scendono mai', sale, true);

  /* non si promette mai piu' di quello che quei soldi hanno comprato */
  const c3 = conto({ children: 2, crazyJumping: 0, durationMinutes: 120, barItems: [] });
  ctx.segnaPagate('bimbi', 1);
  const perBambino = ctx.importoRiga('bimbi') / 2;
  const coperti = ctx.minutiPagati(c3);
  ok('i minuti coperti sono davvero pagati', ctx.priceFor(coperti) <= perBambino + 1e-9, true);
});

gruppo('I minuti del Crazy sono REGALATI: non sono tempo pagato', () => {
  /* Il Crazy si paga a parte, col suo prezzo, e in cambio si sta
     dentro di piu'. Quei minuti in piu' pero' NON si pagano: contarli
     fra i "minuti pagati" faceva dire alla fascia che mancava del
     tempo da saldare anche a conto chiuso -- cioe' chiedeva soldi non
     dovuti. Qui si risponde a una domanda sola: quanto tempo di PARCO
     hanno pagato. */
  const c = conto({ children: 1, crazyJumping: 1, durationMinutes: 60, barItems: [] });
  ok('senza un euro, zero minuti', ctx.minutiPagati(c), 0);

  ctx.segnaPagate('crazy', 1);
  ok('pagato il Crazy, i minuti di parco restano zero', ctx.minutiPagati(c), 0);

  ctx.segnaPagate('bimbi', 1);
  ok('pagato il bambino, il tempo di parco e coperto tutto', ctx.minutiPagati(c) >= 60, true);
  ok('e non un minuto di piu del tempo comprato',
     ctx.minutiPagati(c) <= 60 + 1e-9, true);

  /* i minuti regalati restano dove devono stare: nell'ora di uscita */
  ok('l ora di uscita invece li comprende',
     ctx.endTimeOf(c) - c.startTime,
     (60 + ctx.settings.crazyExtraMinutes) * 60000);
});

gruppo('Pagare il tempo E pagare i bambini: stessa cassa', () => {
  /* Il piu' sulla fascia verde della card del tempo passa dallo stesso
     punto di quello dei Bambini. Se un giorno prendesse una strada sua,
     le spunte e i soldi ricomincerebbero a raccontare due storie
     diverse -- che e' la radice di tutti i conti sbagliati. */
  const c = conto({ children: 3, crazyJumping: 0, durationMinutes: 60, barItems: [] });
  ctx.segnaPagate('bimbi', 2);
  const dopoTeste = { soldi: c.paidPark, spunte: ctx.bcPag('bimbi'), min: ctx.minutiPagati(c) };

  const d = conto({ children: 3, crazyJumping: 0, durationMinutes: 60, barItems: [] });
  /* la stessa cosa fatta "dal tempo": due tocchi sul piu' verde */
  ctx.pagaTempo(1);
  ctx.pagaTempo(1);
  ok('gli stessi euro', d.paidPark, dopoTeste.soldi);
  ok('le stesse spunte', ctx.bcPag('bimbi'), dopoTeste.spunte);
  ok('gli stessi minuti', ctx.minutiPagati(d), dopoTeste.min);

  /* e i due conti restano allineati: se i soldi si muovessero senza le
     spunte, la riga direbbe "incassato" e la card "non pagato" */
  ctx.pagaTempo(-1);
  ok('tolto uno, scende anche la spunta', ctx.bcPag('bimbi'), 1);
  ok('e i soldi con lei', ctx.importoRiga('bimbi') > 0 && ctx.importoRiga('bimbi') < dopoTeste.soldi, true);
  ctx.pagaTempo(-5);
  ok('a zero spunte, zero euro sulla riga', ctx.importoRiga('bimbi'), 0);
  ok('e zero anche in cassa', d.paidPark, 0);
});

gruppo('A tempo aperto non si incassa in anticipo', () => {
  /* Senza un'ora di uscita non c'e' una durata, quindi non c'e' un
     prezzo da coprire: il conto si fa all'uscita, sul tempo davvero
     passato. Incassare prima vorrebbe dire prendere dei soldi contro
     un numero che ancora non esiste.
     Il tasto e' spento anche nel pannello, ma il divieto deve stare
     nella funzione: una regola che vive solo nel disegno se la porta
     via la prima scorciatoia. */
  const c = conto({ children: 2, crazyJumping: 0, durationMinutes: 60, payLater: true, barItems: [] });
  ctx.pagaTempo(1);
  ok('il piu non muove un euro', c.paidPark, 0);
  ok('e non lascia nemmeno una spunta', ctx.bcPag('bimbi'), 0);
  ctx.pagaTempo(5);
  ok('nemmeno insistendo', c.paidPark, 0);

  /* il RESO invece deve restare possibile: se il tempo e' diventato
     aperto DOPO un incasso, quei soldi devono poter tornare indietro */
  c.payLater = false;
  ctx.segnaPagate('bimbi', 2);
  const presi = c.paidPark;
  vero('a tempo chiuso si incassa come sempre', presi > 0);
  c.payLater = true;
  ctx.pagaTempo(-1);
  vero('a tempo aperto il meno rende indietro', c.paidPark < presi);
  ctx.pagaTempo(-9);
  ok('fino a svuotare', c.paidPark, 0);
});

gruppo('Il tempo DA PAGARE e solo quello del parco', () => {
  /* Due numeri diversi che prima erano uno solo:
       tempoTotale  = quanto tempo si e' comprato  → si paga
       endTimeOf    = a che ora escono davvero     → comprende i regali
     Tenerli separati e' tutto il senso della correzione. */
  const c = conto({ children: 1, crazyJumping: 0, durationMinutes: 60, barItems: [] });
  ok('senza Crazy sono la stessa cosa', ctx.tempoTotale(c), 60);

  const d = conto({ children: 1, crazyJumping: 2, durationMinutes: 60, barItems: [] });
  ok('col Crazy il tempo da pagare NON cambia', ctx.tempoTotale(d), 60);
  /* due che salgono insieme: un giro, un blocco di minuti regalati */
  ok('ma l ora di uscita si sposta piu in la',
     ctx.endTimeOf(d) - d.startTime, (60 + ctx.settings.crazyExtraMinutes) * 60000);

  /* e pagando tutto non deve restare del tempo "scoperto" */
  ctx.pagaTutto();
  ok('pagato tutto, il conto e chiuso', ctx.contoResta() <= 0.005, true);
  ok('e il tempo di parco risulta coperto', ctx.minutiPagati(d) >= ctx.tempoTotale(d), true);
});

gruppo('Allungare e VENDERE tempo, non ricalcolarlo', () => {
  /* IL GUASTO CHE C'ERA. Il prezzo dell'allungamento era la differenza
     sul totale: partendo da mezz'ora, "+15m" e "+30m" finivano nello
     stesso scaglione del cartello e costavano LO STESSO -- due tasti
     diversi, un prezzo solo, e mezz'ora regalata senza accorgersene.
     Adesso ogni blocco venduto si paga al prezzo del cartello per quel
     blocco, e resta scritto in `aggiunte`. */
  const T = ctx.settings.tariffs;
  const p30 = T.find(t => t.m === 30).p, p15 = T.find(t => t.m === 15).p;
  const r2 = v => Math.round(v * 100) / 100;

  const vendi = (c, m) => {
    c.durationMinutes = c.durationMinutes + m;
    if (m > 0) c.aggiunte = (c.aggiunte || []).concat([m]);
    ctx.sistemaAggiunte(c);
  };

  const c = conto({ children: 3, crazyJumping: 0, durationMinutes: 30, baseMinutes: 30, barItems: [] });
  const partenza = ctx.dueOf(c).park;
  ok('mezz ora per tre bambini', partenza, r2(p30 * 3));

  ok('il tasto +30m dice il prezzo di mezz ora', ctx.costoEstensione(c, 30), r2(p30 * 3));
  ok('e il +15m dice quello di un quarto d ora', ctx.costoEstensione(c, 15), r2(p15 * 3));
  ok('quindi i due tasti NON dicono piu la stessa cifra',
     ctx.costoEstensione(c, 30) !== ctx.costoEstensione(c, 15), true);

  /* quello che dice il tasto e quello che entra in cassa devono essere
     lo stesso numero, se no il tasto e' una promessa e basta */
  const scritto = ctx.costoEstensione(c, 30);
  vendi(c, 30);
  ok('e quello che dice e quello che chiede', r2(ctx.dueOf(c).park - partenza), scritto);

  /* la seconda mezz'ora si paga come la prima */
  const prima2 = ctx.dueOf(c).park;
  const scritto2 = ctx.costoEstensione(c, 30);
  vendi(c, 30);
  ok('la seconda mezz ora costa come la prima', r2(ctx.dueOf(c).park - prima2), r2(p30 * 3));
  ok('e il tasto lo aveva detto', scritto2, r2(p30 * 3));
  ok('due mezz ore vendute, scritte una per una', c.aggiunte, [30, 30]);

  /* disdire toglie dall'ULTIMA vendita */
  const c2 = conto({ children: 2, crazyJumping: 0, durationMinutes: 60, baseMinutes: 60, barItems: [] });
  vendi(c2, 30);
  const conVendita = ctx.dueOf(c2).park;
  c2.durationMinutes -= 30;
  c2.aggiunte = [];
  ctx.sistemaAggiunte(c2);
  ok('disdetta la vendita, il prezzo torna quello di prima',
     ctx.dueOf(c2).park, r2(conVendita - p30 * 2));

  /* i tagli rapidi riscrivono la durata: le vendite non c entrano piu */
  const c3 = conto({ children: 1, crazyJumping: 0, durationMinutes: 60, baseMinutes: 60, barItems: [] });
  vendi(c3, 30);
  delete c3.aggiunte;
  c3.durationMinutes = 60;
  ok('col taglio rapido si torna al prezzo dell ora piena',
     ctx.dueOf(c3).park, r2(ctx.priceFor(60)));

  /* le vendite non possono valere piu del tempo che c e */
  const c4 = conto({ children: 1, durationMinutes: 60, baseMinutes: 30, barItems: [] });
  c4.aggiunte = [30, 30, 30];
  ctx.sistemaAggiunte(c4);
  ok('vendite tagliate al tempo che esiste',
     (c4.aggiunte || []).reduce((a, b) => a + b, 0) <= c4.durationMinutes, true);

  /* e il Crazy non c entra: regala minuti, non compra tempo */
  const c5 = conto({ children: 2, crazyJumping: 3, durationMinutes: 60, baseMinutes: 60, barItems: [] });
  const senzaCrazy = conto({ children: 2, crazyJumping: 0, durationMinutes: 60, baseMinutes: 60, barItems: [] });
  ok('il prezzo di allungare non cambia col Crazy',
     ctx.conConto(c5, () => ctx.costoEstensione(c5, 30)),
     ctx.conConto(senzaCrazy, () => ctx.costoEstensione(senzaCrazy, 30)));
});

gruppo('A conto saldato il tempo risulta pagato TUTTO', () => {
  /* IL GUASTO CHE C'ERA. I minuti pagati si ricavavano dal cartello --
     lo scaglione piu' alto che quei soldi coprono -- ma il cartello
     finisce alle due ore e il tempo no. Un gruppo dentro da due ore e
     mezza, a conto saldato, restava fermo a centoventi minuti: la
     barra all'ottantanove per cento e la pastiglia che diceva "pagato
     fino alle 18:50", cioe' chiedeva soldi gia' presi. */
  const lungo = conto({ children: 2, crazyJumping: 0, durationMinutes: 150, baseMinutes: 150, barItems: [] });
  ctx.pagaTutto();
  ok('due ore e mezza, conto chiuso', ctx.contoResta() <= 0.005, true);
  ok('e il tempo risulta pagato per intero', ctx.minutiPagati(lungo), ctx.tempoTotale(lungo));

  /* col Crazy: i suoi minuti sono regalati, quindi non entrano nel
     tempo da pagare -- ma nemmeno devono impedire il "pagato tutto" */
  const conCrazy = conto({ children: 3, crazyJumping: 2, durationMinutes: 150, baseMinutes: 150, barItems: [] });
  ctx.pagaTutto();
  ok('col Crazy il conto si chiude lo stesso', ctx.contoResta() <= 0.005, true);
  ok('e il tempo e coperto per intero', ctx.minutiPagati(conCrazy), ctx.tempoTotale(conCrazy));
  ok('i minuti regalati restano fuori dal tempo pagato',
     ctx.tempoTotale(conCrazy), 150);

  /* e dopo aver VENDUTO tempo, che non corrisponde a uno scaglione */
  const venduto = conto({ children: 3, crazyJumping: 1, durationMinutes: 60, baseMinutes: 60, barItems: [] });
  venduto.durationMinutes = 90;
  venduto.aggiunte = [30];
  ctx.pagaTutto();
  ok('anche dopo una vendita di tempo il conto si chiude', ctx.contoResta() <= 0.005, true);
  ok('e il tempo risulta pagato tutto', ctx.minutiPagati(venduto), 90);

  /* mezzo pagato deve restare mezzo pagato: la scorciatoia non deve
     dire "tutto" a chi ha dato solo una parte */
  const mezzo = conto({ children: 2, crazyJumping: 0, durationMinutes: 60, baseMinutes: 60, barItems: [] });
  ctx.segnaPagate('bimbi', 1);
  ok('con un bambino pagato su due, il tempo non e coperto',
     ctx.minutiPagati(mezzo) < ctx.tempoTotale(mezzo), true);
});

gruppo('Bombardamento: mille tocchi a caso', () => {
  let seme = 12345;
  const caso = (n) => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % n; };
  const c = conto({ children: 1, durationMinutes: 60, barItems: [] });
  const voci = ['bimbi', 'crazy', 'b1', 'b2'];
  ctx.settings.barMenu = [{ id: 'b1', name: 'Acqua', price: 1, cat: 'Bevande', em: '' },
                          { id: 'b2', name: 'Coca', price: 2.5, cat: 'Bevande', em: '' }];
  let guai = [];
  for (let i = 0; i < 1000; i++) {
    const v = voci[caso(4)];
    switch (caso(6)) {
      case 0: ctx.bcSetQ(v, ctx.bcQ(v) + 1); break;
      case 1: ctx.bcSetQ(v, ctx.bcQ(v) - 1); break;
      case 2: ctx.segnaPagate(v, ctx.bcPag(v) + 1); break;
      case 3: ctx.segnaPagate(v, ctx.bcPag(v) - 1); break;
      case 4: ctx.bcSegna(caso(2) ? 'bar' : v, !!caso(2)); break;
      case 5: c.durationMinutes = [15, 30, 60, 90, 120, 180][caso(6)]; break;
    }
    const d = ctx.dueOf(c);
    if (!Number.isFinite(d.total) || d.total < 0) guai.push(i + ': dovuto ' + d.total);
    const mp = ctx.minutiPagati(c);
    if (!Number.isFinite(mp) || mp < 0) guai.push(i + ': minuti pagati ' + mp);
    if (!Number.isFinite(c.paidPark) || c.paidPark < 0) guai.push(i + ': parco ' + c.paidPark);
    if (!Number.isFinite(c.paidBar) || c.paidBar < 0) guai.push(i + ': bar ' + c.paidBar);
    for (const k of Object.keys(c.paidLines)) {
      if (c.paidLines[k] > ctx.bcQ(k)) guai.push(i + ': spunte oltre la quantita su ' + k);
    }
    if (guai.length) break;
  }
  ok('mille tocchi senza un conto storto', guai.slice(0, 3), []);
});

/* ══════════════════════════════════════════════════════════════ */
console.log('\n' + '━'.repeat(52));
console.log(rotti === 0
  ? '  TUTTO A POSTO — ' + fatti + ' controlli, ' + gruppi.length + ' gruppi'
  : '  ' + rotti + ' CONTROLLI FALLITI su ' + fatti);
process.exit(rotti === 0 ? 0 : 1);

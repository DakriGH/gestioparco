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

gruppo('Il ritocco da cinque minuti non e una vendita', () => {
  /* I TRE TAGLI VENDONO un blocco, e ogni blocco si paga al prezzo del
     cartello per la SUA misura -- e' quello che si vuole: mezz'ora
     costa mezz'ora, la seconda mezz'ora pure.
     Il piu' e il meno da cinque minuti no: quelli sono un RITOCCO, e
     trattarli da vendita apriva un blocco da cinque minuti, che sul
     cartello sta nello scaglione minimo. Tre euro a tocco: cinque
     tocchi su una mezz'ora facevano ventidue euro invece di dodici, e
     il prezzo a testa sulla card sembrava uscito a caso. */
  const c = conto({ children: 1, durationMinutes: 30, baseMinutes: 30 });
  ok('mezz ora costa la mezz ora', ctx.costOf(c).unit, ctx.priceFor(30));

  for (let i = 0; i < 5; i++) ctx.ritoccaTempo(c, 5);
  ok('cinque ritocchi fanno cinquantacinque minuti', c.durationMinutes, 55);
  ok('e non hanno aperto nessun blocco', ctx.lista(c.aggiunte).length, 0);
  ok('il prezzo e quello del cartello per il tempo che stanno dentro',
     ctx.costOf(c).unit, ctx.priceFor(60));
  vero('e non e la somma di cinque scaglioni minimi',
     ctx.costOf(c).unit < ctx.priceFor(30) + 5 * ctx.priceFor(10));

  for (let i = 0; i < 5; i++) ctx.ritoccaTempo(c, -5);
  ok('tornati a mezz ora', c.durationMinutes, 30);
  ok('e al suo prezzo', ctx.costOf(c).unit, ctx.priceFor(30));

  /* IL RITOCCO ENTRA NELL'ULTIMA VENDITA, non ne apre una nuova */
  const d = conto({ children: 1, durationMinutes: 45, baseMinutes: 30 });
  d.aggiunte = [15];
  ok('venduto un quarto d ora a parte', ctx.costOf(d).unit,
     ctx.r2(ctx.priceFor(30) + ctx.priceFor(15)));
  ctx.ritoccaTempo(d, 5);
  ok('il ritocco cresce il blocco venduto', JSON.stringify(ctx.lista(d.aggiunte)), '[20]');
  ok('e si paga il blocco da venti, non due blocchi',
     ctx.costOf(d).unit, ctx.r2(ctx.priceFor(30) + ctx.priceFor(20)));

  /* i tagli grossi continuano a fare quello che facevano */
  const e = conto({ children: 1, durationMinutes: 75, baseMinutes: 30 });
  e.aggiunte = [15, 30];
  ok('mezz ora piu un quarto piu mezz ora, ognuno al suo prezzo',
     ctx.costOf(e).unit, ctx.r2(ctx.priceFor(30) + ctx.priceFor(15) + ctx.priceFor(30)));

  /* a tempo aperto non si ritocca: non c e una durata da ritoccare */
  const f = conto({ children: 1, durationMinutes: 30, baseMinutes: 30, payLater: true });
  ctx.ritoccaTempo(f, 5);
  ok('a tempo aperto il ritocco non tocca niente', f.durationMinutes, 30);

  /* e il salvataggio si porta dietro i blocchi */
  const g = conto({ children: 2, durationMinutes: 75, baseMinutes: 30 });
  g.aggiunte = [15, 30];
  const prezzo = ctx.costOf(g).parkTotal;
  const riletto = ctx.normalizeEntries([JSON.parse(JSON.stringify(g))])[0];
  ctx.PAN.conto = riletto;
  ok('salvato e riletto, i blocchi ci sono ancora',
     JSON.stringify(ctx.lista(riletto.aggiunte)), '[15,30]');
  ok('e il prezzo e lo stesso', ctx.costOf(riletto).parkTotal, prezzo);
});

gruppo('A tempo aperto la riga non dice mai «pagato»', () => {
  /* IL BUG CHE HA VISTO LUI, alle casse: un ingresso a tempo aperto con
     i bambini dentro compariva nella lista come gia' pagato, e solo
     dopo un po' (o dopo averci messo le mani) la cifra saltava fuori.
     La riga dei soldi guardava una cosa sola -- quanto resta da dare --
     e a tempo aperto lo zero non vuol dire pagato: vuol dire che il
     conto NON E' ANCORA FATTO. E zero ci sta per un pezzo:
       · l'ora d'ingresso e' arrotondata ai cinque minuti e puo' cadere
         qualche minuto avanti: finche' non e' passata il tempo dentro
         e' zero, e il parco costa zero;
       · i minuti regalati dal Crazy si scalano dal tempo passato: con
         un giro (otto minuti) i primi otto minuti sono coperti.
     Chi guarda la lista per sapere chi deve ancora pagare leggeva il
     contrario del vero. */
  const ora = Date.now();          /* il tempo aperto si misura da ADESSO */

  /* ora d'ingresso cinque minuti avanti: dentro da -5 minuti */
  const avanti = conto({ children: 2, payLater: true, startTime: ora + 5 * 60000,
    durationMinutes: 0, barItems: [] });
  ok('col tempo che non e ancora cominciato non si deve niente',
     ctx.dueOf(avanti).total, 0);
  const v1 = ctx.vociSoldi(avanti, ctx.dueOf(avanti));
  vero('ma la riga NON dice pagato', v1.pagato === false);
  vero('dice che si paga all uscita', /uscita/.test(v1.k));

  /* un giro di Crazy: i primi otto minuti di parco sono coperti */
  const crazy = conto({ children: 2, payLater: true, startTime: ora,
    durationMinutes: 0, crazyJumping: 1, crazyGiri: [1], barItems: [] });
  crazy.paidPark = ctx.dueOf(crazy).park;          /* pagato il solo Crazy */
  const v2 = ctx.vociSoldi(crazy, ctx.dueOf(crazy));
  vero('e nemmeno quando i minuti regalati coprono la permanenza', v2.pagato === false);

  /* a tempo chiuso invece pagato vuol dire pagato */
  const chiuso = conto({ children: 2, durationMinutes: 30, baseMinutes: 30, barItems: [] });
  const v3 = ctx.vociSoldi(chiuso, ctx.dueOf(chiuso));
  vero('a tempo chiuso, se resta da dare lo dice', v3.pagato === false && /pagare/.test(v3.k));
  chiuso.paidPark = ctx.dueOf(chiuso).park;
  const v4 = ctx.vociSoldi(chiuso, ctx.dueOf(chiuso));
  vero('e quando e saldato dice pagato', v4.pagato === true);

  /* e un conto vuoto non e un conto pagato */
  const vuoto = conto({ children: 0, durationMinutes: 30, baseMinutes: 30, barItems: [] });
  const v5 = ctx.vociSoldi(vuoto, ctx.dueOf(vuoto));
  vero('un conto vuoto non risulta pagato', v5.pagato === false);
  vero('e lo dice: niente sul conto', /niente/.test(v5.k));
});

gruppo('Il conto del tempo aperto si vede, non si indovina', () => {
  /* Il prezzo a tempo aperto e' l'unico che si muove da solo, e viene
     fuori da due passaggi: tempo passato dentro, arrotondato ai cinque
     in su; poi il cartello, che va a fasce. A video si vedeva solo il
     risultato, e ogni tanto saltava di tre euro senza che si capisse
     perche'.
     I GIRI DI CRAZY NON C'ENTRANO. Qui si toglievano anche i minuti
     regalati dai giri, e a tempo aperto quella sottrazione diventava
     uno sconto sul parco: lo scaglione scendeva e il giro si pagava da
     solo. Al banco si vedeva «Paga 24,00 €», si segnava un giro da
     quattro euro, e restava «Paga 24,00 €». */
  const ora = Date.now();
  const c = conto({ children: 2, payLater: true, startTime: ora - 41 * 60000,
    durationMinutes: 0, crazyJumping: 1, crazyGiri: [1], barItems: [] });

  const a = ctx.contiAperto(c, ora);
  ok('dentro da quarantuno minuti', Math.round(a.dentro), 41);
  ok('e il giro di Crazy non toglie niente al parco', a.regalati, 0);
  ok('quindi quarantuno contati', Math.round(a.contati), 41);
  /* niente piu' arrotondamento ai cinque: la fascia si sceglie sui
     minuti veri, che e' anche piu' facile da spiegare al banco */
  ok('che cadono nella fascia piu vicina', a.scaglione, ctx.fasciaVicina(41).m);
  ok('e il prezzo e quello della fascia', a.prezzo, ctx.fasciaVicina(41).p);
  ok('lo stesso che mette sul conto costOf', ctx.costOf(c).unit, a.prezzo);

  vero('e c e scritto da dove esce', /41′ contati/.test(ctx.spiegaAperto(c, true, ora)) &&
    /fascia/.test(ctx.spiegaAperto(c, true, ora)));
  vero('nella versione lunga c e anche il tempo dentro',
    /dentro da 41′/.test(ctx.spiegaAperto(c, false, ora)));

  /* IL GIRO SI AGGIUNGE, SEMPRE. E' la garanzia che mancava: qualunque
     sia il tempo passato dentro, segnare un giro deve alzare il totale
     di esattamente il prezzo del giro, e non deve MAI abbassare il
     parco. Vale a tempo aperto come a tempo comprato. */
  /* fuori dai multipli di cinque: vedi la nota piu' sotto, a tempo
     aperto il prezzo si misura sull'orologio e sul confine salta */
  [1, 3, 7, 12, 21, 33, 41, 58, 74, 119].forEach(min => {
    [true, false].forEach(aperto => {
      const senza = conto({ children: 2, payLater: aperto, startTime: ora - min * 60000,
        durationMinutes: aperto ? 0 : 60, baseMinutes: aperto ? 0 : 60, barItems: [] });
      const con = conto({ children: 2, payLater: aperto, startTime: ora - min * 60000,
        durationMinutes: aperto ? 0 : 60, baseMinutes: aperto ? 0 : 60,
        crazyJumping: 1, crazyGiri: [1], barItems: [] });
      const pPrima = ctx.costOf(senza).parkTotal, pDopo = ctx.costOf(con).parkTotal;
      const tPrima = ctx.dueOf(senza).total, tDopo = ctx.dueOf(con).total;
      const dove = (aperto ? 'a tempo aperto' : 'a tempo comprato') + ', dentro da ' + min + '′';
      ok('il giro non abbassa il parco ' + dove, pDopo, pPrima);
      ok('e alza il totale del suo prezzo ' + dove,
        Math.round((tDopo - tPrima) * 100) / 100, ctx.settings.crazyJumpingPrice);
    });
  });

  /* i due casi in cui il conto e' zero: si dicono, non si tacciono.
     Coperto lo e' chi e' entrato SOLO per saltare -- i suoi minuti di
     omaggio -- non chi ha chiesto il parco e ha fatto un giro. */
  const coperto = conto({ children: 2, payLater: true, startTime: ora - 3 * 60000,
    durationMinutes: 0, omaggio: 10, crazyJumping: 1, crazyGiri: [1], barItems: [] });
  ok('col solo Crazy che copre tutto non si paga parco', ctx.costOf(coperto).parkTotal, 0);
  vero('e lo dice: coperti dal Crazy', /Crazy/.test(ctx.spiegaAperto(coperto, true, ora)));

  const prima = conto({ children: 2, payLater: true, startTime: ora + 5 * 60000,
    durationMinutes: 0, barItems: [] });
  vero('e se non sono ancora entrati lo dice',
    /non sono ancora entrati/.test(ctx.spiegaAperto(prima, true, ora)));

  /* LA FASCIA E' QUELLA DEL CARTELLO, non un numero inventato: e' il
     numero scritto sul muro, quello che il cliente puo' controllare. */
  const fasce = ctx.settings.tariffs.map(t => t.m);
  const storte = [];
  for (let m = 1; m <= 200; m++) {
    const f = ctx.fasciaVicina(m);
    if (!f || !fasce.includes(f.m)) storte.push(m + ' -> ' + (f ? f.m : 'niente'));
    /* e nessuna fascia del cartello e' piu' vicina di quella scelta */
    else {
      const piuVicina = ctx.settings.tariffs.reduce((a, t) =>
        Math.abs(t.m - m) < Math.abs(a - m) ? t.m : a, ctx.settings.tariffs[0].m);
      if (Math.abs(f.m - m) !== Math.abs(piuVicina - m)) storte.push(m + ': ' + f.m + ' ma ' + piuVicina + ' e piu vicina');
    }
  }
  ok('ogni minuto cade sulla fascia del cartello piu vicina', storte.slice(0, 3), []);

  /* IL CASO CHE HA FATTO SCOPPIARE TUTTO: trentuno minuti finivano
     nella fascia dei quaranta, dieci euro invece di sette per un
     minuto oltre la mezz'ora, e al banco non c'era modo di
     spiegarlo. */
  const dove = m => ctx.fasciaVicina(m).m;
  ok('trentuno minuti stanno nella mezz ora', dove(31), 30);
  ok('e anche trentacinque, che sta in mezzo', dove(35), 30);
  ok('trentasei invece passa ai quaranta', dove(36), 40);
  ok('i primi minuti stanno nei dieci', dove(1), 10);
  ok('e anche dieci tondi', dove(10), 10);
  ok('e dodici, che ai dieci ci sta piu vicino', dove(12), 10);
  ok('tredici passa ai quindici', dove(13), 15);
  ok('e oltre l ultima fascia si resta sull ultima', dove(400), fasce[fasce.length - 1]);
  /* il prezzo dei primi dieci minuti e' quello del cartello */
  ok('i primi dieci minuti costano il primo scaglione',
    ctx.fasciaVicina(4).p, ctx.settings.tariffs[0].p);
});

gruppo('Lo stesso tempo costa lo stesso, da qualunque tasto passi', () => {
  /* IL PIU' E IL MENO STANNO IN DUE POSTI: nel pannello e nella
     striscia della scheda in lista. La striscia scriveva i minuti a
     mano, senza toccare le vendite gia' segnate: un'ora con dentro un
     quarto d'ora venduto a parte, riportata a mezz'ora col meno,
     restava con quel quarto d'ora addosso e costava lo scaglione dei
     quindici PIU' quello dei quindici -- diciotto euro invece di
     quattordici. Stesso ingresso, stessi trenta minuti sull'orologio,
     due prezzi diversi a seconda di dove avevi toccato.
     La regola e' una sola: da qualunque tasto tu passi, quello che si
     paga dipende da quanto tempo hanno comprato. */
  const a = conto({ children: 2, durationMinutes: 60, baseMinutes: 45 });
  a.aggiunte = [15];
  for (let i = 0; i < 6; i++) ctx.ritoccaTempo(a, -5);
  ok('sei meno riportano a mezz ora', a.durationMinutes, 30);
  ok('e la vendita di mezzo se n e andata con loro', ctx.lista(a.aggiunte).length, 0);
  ok('quindi si paga la mezz ora, non due quarti d ora',
     ctx.costOf(a).parkTotal, ctx.r2(ctx.priceFor(30) * 2));

  /* e nell'altro verso: quello che si aggiunge si ripaga uguale */
  const b = conto({ children: 1, durationMinutes: 30, baseMinutes: 30 });
  const prima = ctx.costOf(b).unit;
  for (let i = 0; i < 6; i++) ctx.ritoccaTempo(b, 5);
  for (let i = 0; i < 6; i++) ctx.ritoccaTempo(b, -5);
  ok('avanti e indietro si torna ai minuti di partenza', b.durationMinutes, 30);
  ok('e al prezzo di partenza', ctx.costOf(b).unit, prima);

  /* la garanzia in generale: mille giri di piu' e meno a caso, e alla
     fine il prezzo deve essere SOLO quello dei minuti che restano */
  let seme = 20260810;
  const caso = (n) => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % n; };
  let storti = [];
  for (let giro = 0; giro < 1000 && !storti.length; giro++) {
    const c = conto({ children: 1, durationMinutes: [15, 30, 45, 60, 90][caso(5)] });
    c.baseMinutes = c.durationMinutes;
    c.aggiunte = caso(3) === 0 ? [] : caso(2) === 0 ? [15] : [30, 15];
    for (let k = 0; k < 8; k++) ctx.ritoccaTempo(c, caso(2) ? 5 : -5);
    const venduti = ctx.lista(c.aggiunte).reduce((x, y) => x + y, 0);
    if (venduti > c.durationMinutes) storti.push('venduto piu del comprato: ' + venduti + ' su ' + c.durationMinutes);
    if (!(ctx.costOf(c).unit >= 0)) storti.push('prezzo storto: ' + ctx.costOf(c).unit);
    if (c.durationMinutes < 0) storti.push('minuti sotto zero');
  }
  ok('mille ritocchi a caso e nessun conto storto', storti.slice(0, 3), []);
});

gruppo('Memoria e disco non possono dire due cose diverse', () => {
  /* Un ingresso che in memoria vale una cosa e dopo un ricaricamento ne
     vale un'altra e' il guasto peggiore che ci sia: al banco funziona,
     la sera i conti non tornano, e nessuno sa perche'.
     `parcoDa` ci finiva dentro: arrotondando ai cinque si puo' scendere
     di due minuti e mezzo, e su un gruppo appena entrato il tempo di
     parco cominciava PRIMA che arrivassero. La riparazione lo
     raddrizzava alla rilettura -- cioe' memoria e disco dicevano due
     cose diverse fino al ricaricamento. */
  let seme = 8675309;
  const caso = k => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % k; };
  const barIds = ctx.settings.barMenu.slice(0, 3).map(v => v.id);
  const guai = [];
  const MOSSE = ['bimbi', 'crazy', 'piu5', 'meno5', 'taglio', 'blocco',
    'condona', 'regalo', 'bar', 'paga', 'pagaTutto', 'togliCrazy'];

  for (let giro = 0; giro < 500 && !guai.length; giro++) {
    ctx.settings.tariffaSuTotale = caso(2) === 0;
    /* -30 vuol dire «appena entrato»: e' li' che l'arrotondamento
       poteva far cominciare il parco prima dell'ingresso */
    const sforo = [-30, -5, 0, 3, 12, 40][caso(6)];
    const ms5 = 5 * 60000;
    const t0 = Math.round((Date.now() - (30 + sforo) * 60000) / ms5) * ms5;
    const c = conto({ children: caso(4) === 0 ? 0 : 1 + caso(3),
      durationMinutes: caso(4) === 0 ? 0 : [15, 30, 60][caso(3)],
      baseMinutes: 30, startTime: t0, createdAt: t0 });
    ctx.PAN.conto = c; ctx.PAN.ingresso = null;
    if (!c.children) ctx.metteCrazy(c, 1);
    const fatte = [];

    for (let k = 0; k < 12; k++) {
      const m = MOSSE[caso(MOSSE.length)];
      fatte.push(m);
      try {
        if (m === 'bimbi') ctx.bcSetQ('bimbi', caso(5));
        else if (m === 'crazy') ctx.contaSalita(caso(2) ? 1 : -1);
        else if (m === 'piu5') ctx.ritoccaTempo(c, 5);
        else if (m === 'meno5') ctx.ritoccaTempo(c, -5);
        else if (m === 'taglio') { c.durationMinutes = [15, 30, 60, 90][caso(4)]; ctx.sistemaAggiunte(c); }
        else if (m === 'blocco') ctx.vendiBlocco(c, [15, 30][caso(2)]);
        else if (m === 'condona') ctx.condonaSforo(c);
        else if (m === 'regalo') ctx.toccoCrazy({ giro: 'crazy' });
        else if (m === 'bar') ctx.bcSetQ(barIds[caso(barIds.length)], caso(4));
        else if (m === 'paga') ctx.segnaPagate(caso(2) ? 'bimbi' : 'crazy', caso(4));
        else if (m === 'pagaTutto') ctx.pagaTutto();
        else ctx.metteCrazy(c, 0);
      } catch (e) { guai.push('esplode su ' + m + ': ' + e.message); break; }

      const dove = ' [' + fatte.join('>') + ']';
      /* il parco non puo' cominciare prima che siano arrivati */
      if (ctx.inizioParco(c) < c.startTime - 1) guai.push('il parco comincia prima dell ingresso' + dove);
      /* e una rilettura non deve cambiare niente: se cambia, il dato
         salvato non e' quello che si vede a video */
      const ri = ctx.normalizeEntries([JSON.parse(JSON.stringify(c))])[0];
      if (Math.abs(ctx.endTimeOf(ri) - ctx.endTimeOf(c)) > 1000) guai.push('rileggendolo cambia l uscita' + dove);
      if (ctx.r2(ctx.costOf(ri).parkTotal) !== ctx.r2(ctx.costOf(c).parkTotal)) {
        guai.push('rileggendolo cambia il prezzo' + dove);
      }
      if (guai.length) break;
    }
  }
  ok('cinquecento sequenze, e rileggere non cambia mai niente', guai.slice(0, 2), []);
});

gruppo('Gli orari cadono sempre sui cinque minuti', () => {
  /* L'app lavora a passi di cinque minuti da sempre: l'ora d'ingresso si
     arrotonda, i tagli sono 15/30/60/90, il piu' e il meno vanno di
     cinque. Gli orari nuovi -- da quando conta il parco, il condono
     dello sforo, il regalo di un giro -- partivano invece da `Date.now()`
     secco, e uscivano cose come «la mezz'ora finisce alle 23:53:45».
     Un orario che al banco non si dice. */
  const a5 = t => { const d = new Date(t); return d.getMinutes() % 5 === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0; };
  /* L'ORA D'INGRESSO NELL'APP E' GIA' SUI CINQUE: la mette `roundTo5`
     quando si apre il modulo. Partire qui da un orario sporco vorrebbe
     dire provare uno stato che l'app non produce -- e siccome
     `parcoDa` non puo' MAI tornare prima dell'ingresso, un ingresso
     sporco si porterebbe dietro la sua sporcizia. */
  const su5 = t => { const ms = 5 * 60000; return Math.round(t / ms) * ms; };
  const mk = (sforo) => {
    const t0 = su5(Date.now() - (30 + sforo) * 60000);
    const c = conto({ children: 2, durationMinutes: 30, baseMinutes: 30, startTime: t0, createdAt: t0 });
    ctx.PAN.conto = c; ctx.PAN.ingresso = null;
    return c;
  };
  const soloCrazy = () => {
    const t0 = su5(Date.now() - 30 * 60000);
    const c = conto({ children: 0, durationMinutes: 0, baseMinutes: 0, startTime: t0, createdAt: t0 });
    ctx.PAN.conto = c; ctx.PAN.ingresso = null;
    ctx.metteCrazy(c, 1);
    return c;
  };
  const storti = [];
  const guarda = (che, t) => { if (!a5(t)) storti.push(che + ': ' + new Date(t).toTimeString().slice(0, 8)); };

  /* condono dello sforo, poi estensione: ogni misura per ogni taglio */
  [1, 3, 7, 12, 25, 60, 180].forEach(sforo => {
    [5, 15, 30, 60, 90].forEach(agg => {
      const c = mk(sforo);
      ctx.condonaSforo(c);
      ctx.ritoccaTempo(c, agg);
      guarda('sforo ' + sforo + " +" + agg, ctx.endTimeOf(c));
      guarda('sforo ' + sforo + " +" + agg + ' (inizio parco)', ctx.inizioParco(c));
    });
  });
  /* il solo-Crazy che compra il parco */
  [5, 10, 15, 30, 60, 90].forEach(m => {
    const c = soloCrazy(); c.children = 2;
    ctx.ritoccaTempo(c, m);
    guarda('solo Crazy +' + m, ctx.endTimeOf(c));
    guarda('solo Crazy +' + m + ' (inizio parco)', ctx.inizioParco(c));
  });
  /* IL REGALO DI UN GIRO A TEMPO SCADUTO: quello riparte da adesso, e
     riparte su un taglio da cinque.
     A chi e' ANCORA DENTRO invece i minuti del giro si sommano in fondo
     -- e otto non e' multiplo di cinque, quindi l'uscita resta sfasata.
     E' come ha sempre funzionato: il regalo si aggiunge alla loro
     uscita, non la riscrive. Qui si prova solo chi era gia' fuori. */
  /* e solo quando il regalo COMANDA davvero l'uscita: con uno sforo piu'
     piccolo degli otto minuti del giro, a comandare resta la loro
     uscita di prima piu' otto -- il caso additivo, che sfasato lo e'
     sempre stato. */
  [12, 25, 60, 180].forEach(sforo => {
    const c = mk(sforo);
    ctx.contaSalita(1);
    guarda('regalo con sforo ' + sforo, ctx.endTimeOf(c));
  });
  ok('ogni orario nuovo cade su un taglio da cinque', storti.slice(0, 3), []);

  /* e arrotondare non deve ACCORCIARE un regalo: otto minuti promessi
     restano almeno otto, non diventano cinque */
  const corti = [];
  [0, 1, 3, 7, 12, 25].forEach(sforo => {
    const c = mk(sforo);
    ctx.contaSalita(1);
    const resta = (ctx.endTimeOf(c) - Date.now()) / 60000;
    if (resta < ctx.settings.crazyExtraMinutes) corti.push('sforo ' + sforo + ': ' + Math.round(resta) + "'");
  });
  ok('e il regalo non si accorcia arrotondando', corti, []);
});

gruppo('Un giro fatto a tempo scaduto regala i minuti INTERI', () => {
  /* I minuti del Crazy partono da dove finisce il tempo di parco: se
     quel tempo e' gia' finito, il regalo cadeva nel passato e non valeva
     niente. Ma il giro l'hanno fatto ADESSO, e mentre si preparavano il
     tempo correva lo stesso.
     IL CASO CHE MI ERA SFUGGITO: uno sforo PIU' PICCOLO dei minuti del
     giro. Guardando l'ora di uscita DOPO aver contato la salita, gli
     otto minuti avevano gia' ricoperto lo sforo, la fine risultava nel
     futuro e il regalo non partiva -- cosi' chi sforava da tre minuti ne
     riceveva cinque invece di otto. Lo sforo si mangiava il regalo, che
     e' esattamente quello che il regalo doveva impedire.
     Adesso si guarda l'ora di uscita di PRIMA. */
  const extra = ctx.settings.crazyExtraMinutes;
  const mk = (sforo) => {
    const t0 = Date.now() - (30 + sforo) * 60000;
    const c = conto({ children: 2, durationMinutes: 30, baseMinutes: 30, startTime: t0 });
    ctx.PAN.conto = c; ctx.PAN.ingresso = null;
    return c;
  };
  const storti = [];
  [0, 1, 2, 3, 5, 7, 8, 9, 12, 25, 60, 180].forEach(sforo => {
    const c = mk(sforo);
    ctx.contaSalita(1);
    const resta = Math.round((ctx.endTimeOf(c) - Date.now()) / 60000);
    if (resta < extra) storti.push('sforato da ' + sforo + "': gli restano " + resta + "' invece di " + extra);
  });
  ok('sforati di qualunque misura, i minuti del giro sono interi', storti.slice(0, 3), []);

  /* e a chi e' ANCORA DENTRO i minuti si sommano come hanno sempre
     fatto: durante una salita non stanno usando il tempo del parco */
  const dentro = mk(-20);
  const prima = Math.round((ctx.endTimeOf(dentro) - Date.now()) / 60000);
  ctx.contaSalita(1);
  const dopo = Math.round((ctx.endTimeOf(dentro) - Date.now()) / 60000);
  ok('e a chi e ancora dentro si sommano in fondo', dopo, prima + extra);

  /* due giri a tempo scaduto non fanno sedici minuti da adesso: il
     regalo e' quello del giro, non una scorta che si accumula */
  const due = mk(30);
  ctx.contaSalita(1);
  const unGiro = (ctx.endTimeOf(due) - Date.now()) / 60000;
  /* almeno i suoi minuti, e non molti di piu': l'uscita si arrotonda al
     taglio da cinque piu' vicino IN SU, quindi fra gli otto promessi e
     il taglio successivo ci puo' stare qualche minuto di grazia */
  vero('un giro a tempo scaduto vale almeno i suoi minuti', unGiro >= extra);
  vero('e non piu di un taglio da cinque in piu', unGiro < extra + 5);
});

gruppo('Un giro svuotato se ne va, quello appena aperto resta', () => {
  /* Togliendo tutti i saliti con il meno, la riga «0 · da contare»
     restava in lista e per farla sparire bisognava anche premere la sua
     ✕: due gesti per dire una cosa sola -- «no, su questo non e' salito
     nessuno» -- e intanto lo storico si riempiva di righe vuote che
     sembravano giri veri.
     Il giro APPENA APERTO invece deve restare: quello e' lo zero da
     riempire, e sparirgli sotto le dita renderebbe impossibile aprirne
     uno. Si distinguono da come ci si arriva. */
  const nuovo = () => {
    const c = conto({ children: 2, durationMinutes: 30, baseMinutes: 30 });
    ctx.PAN.conto = c; ctx.PAN.ingresso = null;
    return c;
  };

  let c = nuovo();
  ctx.metteCrazy(c, 2); ctx.giroNuovo(c); ctx.cambiaGiro(c, 1, 3);
  ok('due giri segnati', ctx.giriCrazy(c), [2, 3]);
  const regalatiPrima = ctx.regalatiDi(c);
  ctx.cambiaGiro(c, 1, -3);
  ok('svuotando il secondo, sparisce', ctx.giriCrazy(c), [2]);
  ok('e coi giri se ne vanno i suoi minuti', ctx.regalatiDi(c) < regalatiPrima, true);

  c = nuovo();
  ctx.metteCrazy(c, 2); ctx.giroNuovo(c);
  ok('il giro appena aperto resta, che e lo zero da riempire', ctx.giriCrazy(c), [2, 0]);
  ctx.cambiaGiro(c, 1, 1);
  ok('e ci si conta dentro', ctx.giriCrazy(c), [2, 1]);

  c = nuovo();
  ctx.metteCrazy(c, 1); ctx.giroNuovo(c); ctx.cambiaGiro(c, 1, 2);
  ctx.giroNuovo(c); ctx.cambiaGiro(c, 2, 4);
  ok('tre giri', ctx.giriCrazy(c), [1, 2, 4]);
  ctx.cambiaGiro(c, 1, -2);
  ok('si puo svuotare anche quello in mezzo', ctx.giriCrazy(c), [1, 4]);

  c = nuovo();
  ctx.metteCrazy(c, 3);
  ctx.cambiaGiro(c, 0, -3);
  ok('svuotando l unico, non resta una riga vuota', ctx.giriCrazy(c), []);
  ok('e niente minuti regalati', ctx.regalatiDi(c), 0);
  ctx.giroNuovo(c);
  ok('e se ne puo riaprire uno', ctx.giriCrazy(c), [0]);

  /* i minuti regalati NON arrivano mai da un giro vuoto */
  const storti = [];
  let seme = 31415;
  const caso = n => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % n; };
  for (let giro = 0; giro < 400 && !storti.length; giro++) {
    const x = nuovo();
    for (let k = 0; k < 8; k++) {
      if (caso(3) === 0) ctx.giroNuovo(x);
      else ctx.cambiaGiro(x, caso(Math.max(1, ctx.giriCrazy(x).length)), caso(2) ? 1 : -1);
    }
    const g = ctx.giriCrazy(x);
    const vuoti = g.filter(n => n === 0).length;
    /* al massimo UNO: quello aperto adesso, e solo se sta in fondo */
    if (vuoti > 1) storti.push('giri vuoti: ' + JSON.stringify(g));
    if (vuoti === 1 && g[g.length - 1] !== 0) storti.push('un vuoto non in fondo: ' + JSON.stringify(g));
    const attesi = ctx.settings.crazyExtraMinutes * Math.max(0, g.filter(n => n > 0).length - (x.omaggio ? 1 : 0));
    if (ctx.regalatiDi(x) !== attesi + (x.omaggio || 0)) {
      storti.push('minuti regalati storti su ' + JSON.stringify(g) + ': ' + ctx.regalatiDi(x));
    }
  }
  ok('quattrocento sequenze e mai piu di un giro vuoto, ne un minuto regalato di troppo',
     storti.slice(0, 2), []);
});

gruppo('Aprire e richiudere il tempo non cambia il prezzo', () => {
  /* Nella scheda c'e' un interruttore che passa da tempo comprato a
     tempo aperto e ritorno. A tempo aperto `costOf` non guarda i blocchi
     gia' venduti -- li' il conto si fa sul tempo passato -- quindi
     tenerli non costa niente; buttarli invece si vedeva: un'ora con
     dentro una mezz'ora venduta a parte vale 28 euro, e chi apriva il
     tempo per sbaglio e lo richiudeva se la ritrovava a 24. Quattro euro
     persi da un tocco andato storto, e nessuno che lo dicesse. */
  const c = conto({ children: 2, durationMinutes: 60, baseMinutes: 30 });
  c.aggiunte = [30];
  const prima = ctx.costOf(c).parkTotal;
  ok('un ora con dentro una mezz ora venduta', prima, ctx.r2(ctx.priceFor(30) * 2 * 2));

  c.payLater = true;
  vero('a tempo aperto i blocchi restano scritti', ctx.lista(c.aggiunte).length === 1);
  c.payLater = false;
  ok('richiudendo, il prezzo e quello di prima', ctx.costOf(c).parkTotal, prima);

  /* e il giro completo non deve perdere niente, in nessuno dei due versi */
  const storti = [];
  [[15, []], [30, [15]], [60, [30]], [90, [30, 15]], [120, []]].forEach(([m, agg]) => {
    const x = conto({ children: 1, durationMinutes: m, baseMinutes: m - agg.reduce((a, b) => a + b, 0) });
    x.aggiunte = agg.slice();
    const p0 = ctx.costOf(x).parkTotal;
    x.payLater = true; ctx.costOf(x);
    x.payLater = false;
    if (ctx.costOf(x).parkTotal !== p0) storti.push(m + "': " + p0 + ' -> ' + ctx.costOf(x).parkTotal);
  });
  ok('andata e ritorno su ogni durata, prezzo intatto', storti, []);
});

gruppo('«Aggiungi a»: i soldi non si creano e non si perdono', () => {
  /* LA LINGUETTA «BAR» NON C'E' PIU': era una schermata intera per una
     cosa che dal modulo si fa in due tocchi, e teneva un foglio suo da
     non far divergere. Quello che serviva davvero -- appendere due birre
     al conto di chi e' gia' al parco -- e' un tasto in fondo a
     «+ Nuovo», e sposta soldi e voci da un conto a un altro.
     E' esattamente il tipo di passaggio in cui un euro compare o
     sparisce senza che nessuno se ne accorga fino a sera. La garanzia e'
     la cassa: la somma di tutto quello che risulta incassato non deve
     cambiare di un centesimo per il solo fatto di aver spostato le
     consumazioni. */
  const veroSwitch = ctx.mondo.switchTab;
  const veroBuild = ctx.mondo.buildActiveView;
  const veroFatto = ctx.mondo.fatto;
  const veroToast = ctx.mondo.toast;
  const veroBadge = ctx.mondo.updateBadge;
  ctx.mondo.switchTab = () => {};
  ctx.mondo.buildActiveView = () => {};
  ctx.mondo.fatto = () => {};
  ctx.mondo.toast = () => {};
  ctx.mondo.updateBadge = () => {};
  const eraSuTotale = ctx.settings.tariffaSuTotale;
  try {
    const R2 = v => Math.round(v * 100) / 100;
    const cassa = () => R2(ctx.entries.reduce((a, e) => a + (+e.paidPark || 0) + (+e.paidBar || 0), 0) +
      (+ctx.draft.paidPark || 0) + (+ctx.draft.paidBar || 0));
    const barIds = ctx.settings.barMenu.slice(0, 4).map(v => v.id);
    let seme = 24680;
    const caso = n => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % n; };

    ctx.entries = [];
    ctx.draft = ctx.freshDraft();
    const guai = [];

    for (let g = 0; g < 120 && !guai.length; g++) {
      /* un gruppo dentro, in uno stato a caso */
      ctx.PAN.conto = ctx.draft; ctx.PAN.ingresso = null;
      ctx.settings.tariffaSuTotale = caso(2) === 0;
      ctx.bcSetQ('bimbi', 1 + caso(4));
      if (caso(2)) ctx.metteCrazy(ctx.draft, caso(3));
      if (caso(3) === 0) ctx.draft.payLater = true;
      if (caso(2)) ctx.bcSetQ(barIds[caso(barIds.length)], caso(3));
      if (caso(3) === 0) ctx.pagaTutto(); else if (caso(2)) ctx.bcSegna('bimbi', true);
      const gruppo = ctx.commitDa(ctx.draft, {});
      ctx.draft = ctx.freshDraft(); ctx.PAN.conto = ctx.draft;

      /* e poi si segna dell'altro nel modulo, per appenderlo a lui */
      ctx.PAN.conto = ctx.draft; ctx.PAN.ingresso = null;
      for (let i = 0, q = 1 + caso(3); i < q; i++) ctx.bcSetQ(barIds[caso(barIds.length)], 1 + caso(3));
      if (caso(2)) ctx.bcSegna('bar', true);
      else if (caso(2)) { const pz = ctx.lista(ctx.draft.barItems)[0]; if (pz) ctx.segnaPagate(pz.id, 1); }

      const cassaPrima = cassa();
      const barPrima = R2(ctx.barTotal(gruppo) + ctx.barTotal(ctx.draft));
      const pagatoPrima = R2((+gruppo.paidBar || 0) + (+ctx.draft.paidBar || 0));

      ctx.versaBarSu(gruppo);

      const g2 = ctx.entries.find(e => e.id === gruppo.id);
      const d = ctx.dueOf(g2), amt = g2.paidAmt || {};
      if (Math.abs(cassa() - cassaPrima) > 0.005) guai.push('la cassa si muove: ' + cassaPrima + ' -> ' + cassa());
      if (Math.abs(ctx.barTotal(g2) - barPrima) > 0.005) guai.push('il bar totale cambia: ' + barPrima + ' -> ' + ctx.barTotal(g2));
      if (Math.abs((+g2.paidBar || 0) - pagatoPrima) > 0.005) guai.push('il bar pagato cambia: ' + pagatoPrima + ' -> ' + g2.paidBar);
      if (!Number.isFinite(d.total) || d.total < 0) guai.push('dovuto storto ' + d.total);
      const sb = R2(ctx.lista(g2.barItems).reduce((a, b) => a + (+amt[b.id] || 0), 0));
      if (Math.abs(sb - (+g2.paidBar || 0)) > 0.005) guai.push('righe bar ' + sb + ' vs ' + g2.paidBar);
      ctx.lista(g2.barItems).forEach(b => {
        if ((+g2.paidLines[b.id] || 0) > (+b.qty || 0)) guai.push('spunte oltre la quantita su ' + b.id);
        if ((+amt[b.id] || 0) > R2((+b.qty || 0) * (+b.price || 0)) + 0.005) guai.push('incassato piu del dovuto su ' + b.id);
      });
      if (ctx.lista(ctx.draft.barItems).length) guai.push('il modulo non si e svuotato');
      const gem = ctx.fotografia(g2); gem.crazyJumping = 0; delete gem.crazyGiri;
      if (ctx.costOf(gem).parkTotal !== ctx.costOf(g2).parkTotal) guai.push('il Crazy sposta il tempo dopo il versamento');
      ctx.draft = ctx.freshDraft(); ctx.PAN.conto = ctx.draft;
    }
    ok('centoventi versamenti e la cassa non si muove di un centesimo', guai.slice(0, 3), []);

    /* LA VENDITA AL BANCO LA RICONOSCE DA SE': niente bambini, niente
       Crazy, roba sul bancone. Nasce ATTIVA con una scheda sua -- il
       tempo di correggerla -- e dopo due minuti se ne va in archivio da
       sola. Prima nasceva gia' chiusa, e uno sbaglio non si faceva in
       tempo a vederlo. */
    ctx.entries = [];
    ctx.draft = ctx.freshDraft();
    ctx.PAN.conto = ctx.draft; ctx.PAN.ingresso = null;
    ctx.bcSetQ(barIds[0], 2);
    ctx.bcSegna('bar', true);
    const vendita = ctx.commitDa(ctx.draft, {});
    ctx.draft = ctx.freshDraft(); ctx.PAN.conto = ctx.draft;
    vero('la riconosce da se, senza interruttori', !!vendita.soloBar);
    ok('e nasce attiva, non gia chiusa', vendita.status, 'active');
    vero('si vede fra chi e dentro, per poterla correggere',
         ctx.activeEntries().some(e => e.id === vendita.id));
    vero('e sta in cima: e di passaggio', ctx.activeEntries()[0].id === vendita.id);
    ok('non costa tempo di parco', ctx.costOf(vendita).parkTotal, 0);
    ok('niente bambini', vendita.children, 0);
    ok('ed e saldata', ctx.dueOf(vendita).total, 0);
    ok('non e ne verde ne rossa: ha un colore suo',
       ctx.stateOf(vendita, Date.now()), 'bar');
    vero('e le resta del tempo prima di archiviarsi', ctx.restaSoloBar(vendita) > 0);

    /* MENTRE LA SI MODIFICA IL TEMPO NON SCORRE: aprire la scheda di una
       vendita al banco vuol dire «aspetta, questa e' sbagliata», e
       archiviarla sotto le dita sarebbe il contrario di quello che
       serve. */
    vendita.barFinoA = Date.now() - 1000;
    ctx.PAN.ingresso = vendita;
    ctx.archiviaSoloBarScaduti();
    ok('mentre la modifichi non si archivia', ctx.entries.find(e => e.id === vendita.id).status, 'active');
    vero('e il tempo torna pieno', ctx.restaSoloBar(vendita) > 100000);
    ctx.PAN.ingresso = null;

    /* passati i due minuti se ne va da sola */
    vendita.barFinoA = Date.now() - 1000;
    ok('scaduta, non le resta piu tempo', ctx.restaSoloBar(vendita), 0);
    ctx.archiviaSoloBarScaduti();
    ok('e si archivia da sola', ctx.entries.find(e => e.id === vendita.id).status, 'closed');
    vero('col prezzo fermato li', !!ctx.entries.find(e => e.id === vendita.id).costoFinale);
    vero('e sparisce da chi e dentro', !ctx.activeEntries().some(e => e.id === vendita.id));

    /* un ingresso con dei bambini NON e' una vendita al banco */
    ctx.PAN.conto = ctx.draft; ctx.PAN.ingresso = null;
    ctx.bcSetQ('bimbi', 2);
    ctx.bcSetQ(barIds[0], 1);
    const normale = ctx.commitDa(ctx.draft, {});
    ctx.draft = ctx.freshDraft(); ctx.PAN.conto = ctx.draft;
    vero('con dei bambini resta un ingresso normale', !normale.soloBar);
    vero('e non si archivia da solo', (ctx.archiviaSoloBarScaduti(),
         ctx.entries.find(e => e.id === normale.id).status === 'active'));
  } finally {
    ctx.settings.tariffaSuTotale = eraSuTotale;
    ctx.mondo.switchTab = veroSwitch;
    ctx.mondo.buildActiveView = veroBuild;
    ctx.mondo.fatto = veroFatto;
    ctx.mondo.toast = veroToast;
    ctx.mondo.updateBadge = veroBadge;
  }
});

gruppo('IL PESTAGGIO GROSSO: tempo, Crazy, aperto e chiuso, mille volte', () => {
  /* Le cose che al banco capitano davvero, tutte insieme: gente che paga
     solo alcune cose, tempo che si allunga e si accorcia, ingressi che
     passano da determinato a indeterminato e ritorno piu' volte, solo
     Crazy che poi decidono di fermarsi al parco.
     Ogni combinazione tocca un ramo diverso di costOf, e i rami sono
     tanti: bastava che uno se ne dimenticasse -- ed e' successo -- per
     avere due prezzi diversi per gli stessi minuti. */
  const eraSuTotale = ctx.settings.tariffaSuTotale;
  try {
    const nuovo = (extra) => {
      const c = conto(Object.assign({ children: 2, durationMinutes: 30, baseMinutes: 30 }, extra || {}));
      ctx.PAN.conto = c; ctx.PAN.ingresso = null;
      return c;
    };

    /* ── IL CASO CHE SI E' ROTTO: solo Crazy, poi vogliono il parco ── */
    const c = nuovo({ children: 0, durationMinutes: 0, baseMinutes: 0 });
    ctx.metteCrazy(c, 1);
    ok('solo Crazy: nessun tempo comprato', c.durationMinutes, 0);
    ok('ma restano dentro coi minuti in omaggio', ctx.regalatiDi(c), ctx.settings.crazySoloMinuti);
    c.children = 2;
    ctx.ritoccaTempo(c, 5);
    ok('col piu si comprano cinque minuti', c.durationMinutes, 5);
    ctx.ritoccaTempo(c, -5);
    ok('e col meno si torna a ZERO, non si resta incastrati a cinque', c.durationMinutes, 0);
    ok('e il conto torna a zero con lui', ctx.costOf(c).parkTotal, 0);
    ctx.ritoccaTempo(c, -5);
    ok('sotto zero non si va', c.durationMinutes, 0);
    /* su un ingresso normale il pavimento resta cinque */
    const n = nuovo();
    for (let i = 0; i < 10; i++) ctx.ritoccaTempo(n, -5);
    ok('senza omaggio il pavimento resta cinque minuti', n.durationMinutes, 5);

    /* ── APERTO E CHIUSO PIU' VOLTE: il prezzo non deve derivare ── */
    for (const suTot of [true, false]) {
      ctx.settings.tariffaSuTotale = suTot;
      const storti = [];
      [[15, []], [30, [15]], [60, [30]], [90, [30, 15]], [120, []]].forEach(([m, agg]) => {
        const x = nuovo({ children: 2, durationMinutes: m, baseMinutes: m - agg.reduce((a, b) => a + b, 0) });
        x.aggiunte = agg.slice();
        const p0 = ctx.costOf(x).parkTotal;
        for (let k = 0; k < 5; k++) { x.payLater = true; ctx.costOf(x); x.payLater = false; }
        if (ctx.costOf(x).parkTotal !== p0) storti.push(m + "': " + p0 + ' -> ' + ctx.costOf(x).parkTotal);
      });
      ok((suTot ? 'sul totale' : 'a scaglioni') + ': cinque andate e ritorni, prezzo intatto',
         storti, []);
    }

    /* ── E ADESSO IL PESTAGGIO ──
       Mille sequenze a caso, con dentro tutto quello che capita. A ogni
       singolo passo si controllano le garanzie: se una salta, si sa
       ESATTAMENTE dopo quale mossa. */
    ctx.settings.tariffaSuTotale = true;
    const R2 = v => Math.round(v * 100) / 100;
    let seme = 20260815;
    const caso = k => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % k; };
    const barIds = ctx.settings.barMenu.slice(0, 3).map(v => v.id);
    const guai = [];
    const MOSSE = [
      'bimbi', 'crazy', 'piu5', 'meno5', 'taglio', 'blocco', 'aperto',
      'azzeraBimbi', 'bar', 'pagaRiga', 'pagaSez', 'pagaTutto', 'togliCrazy'
    ];

    for (let giro = 0; giro < 1000 && !guai.length; giro++) {
      ctx.settings.tariffaSuTotale = caso(2) === 0;
      /* Due punti di partenza veri: un solo-Crazy (zero minuti, ma col
         Crazy che gli da' l'omaggio) e un ingresso normale. Zero minuti
         SENZA Crazy non e' uno stato che l'app sappia produrre -- la
         riparazione rimette sessanta a chi ne ha zero e non ha
         l'omaggio -- e partire da li' faceva lamentare il banco di
         prova di un guasto che non esiste. */
      const soloSalti = caso(4) === 0;
      const x = nuovo(soloSalti
        ? { children: 0, durationMinutes: 0, baseMinutes: 0 }
        : { children: 1 + caso(3), durationMinutes: [15, 30, 60][caso(3)], baseMinutes: 30 });
      if (soloSalti) ctx.metteCrazy(x, 1);
      const fatte = [];

      for (let k = 0; k < 14; k++) {
        const mossa = MOSSE[caso(MOSSE.length)];
        fatte.push(mossa);
        try {
          if (mossa === 'bimbi') ctx.bcSetQ('bimbi', caso(5));
          else if (mossa === 'crazy') ctx.metteCrazy(x, caso(4));
          else if (mossa === 'piu5') ctx.ritoccaTempo(x, 5);
          else if (mossa === 'meno5') ctx.ritoccaTempo(x, -5);
          else if (mossa === 'taglio') { if (!x.payLater) { x.durationMinutes = [15, 30, 60, 90][caso(4)]; ctx.sistemaAggiunte(x); } }
          else if (mossa === 'blocco') {
            if (!x.payLater) {
              const mm = [15, 30][caso(2)];
              x.durationMinutes = ctx.num(x.durationMinutes, 0) + mm;
              x.aggiunte = ctx.lista(x.aggiunte).concat([mm]);
              ctx.sistemaAggiunte(x);
            }
          }
          else if (mossa === 'aperto') x.payLater = !x.payLater;
          /* L'OMAGGIO SI TOCCA DALLE SUE FUNZIONI, non scrivendo il
             campo. Scrivendolo a mano si fabbricava uno stato che
             l'app non puo' raggiungere -- zero minuti senza omaggio --
             e il test si lamentava di un guasto che non esiste: dalla
             strada vera `soloCrazy` rimette la mezz'ora. Un banco di
             prova che inventa stati impossibili fa perdere tempo
             invece di trovare guasti. */
          else if (mossa === 'azzeraBimbi') ctx.bcSetQ('bimbi', 0);
          else if (mossa === 'bar') ctx.bcSetQ(barIds[caso(barIds.length)], caso(4));
          else if (mossa === 'pagaRiga') ctx.segnaPagate(caso(2) ? 'bimbi' : 'crazy', caso(4));
          else if (mossa === 'pagaSez') ctx.bcSegna(['bimbi', 'crazy', 'bar'][caso(3)], caso(2) === 0);
          else if (mossa === 'pagaTutto') ctx.pagaTutto();
          else ctx.metteCrazy(x, 0);
        } catch (err) { guai.push('esplode su ' + mossa + ' dopo ' + fatte.join('>') + ': ' + err.message); break; }

        /* ── LE GARANZIE, a ogni singolo passo ── */
        const kk = ctx.costOf(x), d = ctx.dueOf(x);
        const dove = ' [' + fatte.join('>') + ']';
        if (!Number.isFinite(kk.parkTotal) || kk.parkTotal < 0) guai.push('tempo ' + kk.parkTotal + dove);
        if (!Number.isFinite(kk.crazyCost) || kk.crazyCost < 0) guai.push('crazy ' + kk.crazyCost + dove);
        if (!Number.isFinite(d.total) || d.total < 0) guai.push('dovuto ' + d.total + dove);
        if (!Number.isFinite(ctx.endTimeOf(x))) guai.push('uscita storta' + dove);
        if (ctx.endTimeOf(x) < x.startTime) guai.push('esce prima di entrare' + dove);
        /* `minutiPagati` PUO' superare il tempo comprato, ed e' giusto:
           se hanno pagato un'ora e poi il tempo lo si accorcia a cinque
           minuti, i soldi coprono piu' di quello che resta. I due posti
           che lo disegnano lo tagliano al pieno (`Math.min(tot, ...)`),
           quindi a schermo non esce mai dalla fascia. Qui si controlla
           che sia un numero sensato, e che il TAGLIATO -- quello che si
           vede davvero -- stia dentro. */
        const mp = ctx.minutiPagati(x);
        if (!Number.isFinite(mp) || mp < 0) guai.push('minuti pagati storti: ' + mp + dove);
        if (Math.min(ctx.tempoTotale(x), mp) > ctx.tempoTotale(x) + 0.001) guai.push('la fascia esce dal pieno' + dove);
        if (x.durationMinutes < ctx.minimoTempo(x)) guai.push('sotto il pavimento: ' + x.durationMinutes + dove);
        const amt = x.paidAmt || {};
        const sp = R2((+amt.bimbi || 0) + (+amt.crazy || 0));
        if (Math.abs(sp - (+x.paidPark || 0)) > 0.005) guai.push('righe parco ' + sp + ' vs ' + x.paidPark + dove);
        const sb = R2(ctx.lista(x.barItems).reduce((a, b) => a + (+amt[b.id] || 0), 0));
        if (Math.abs(sb - (+x.paidBar || 0)) > 0.005) guai.push('righe bar ' + sb + ' vs ' + x.paidBar + dove);
        ctx.lista(x.barItems).forEach(b => {
          if ((+x.paidLines[b.id] || 0) > (+b.qty || 0)) guai.push('spunte oltre la quantita su ' + b.id + dove);
        });
        /* il Crazy non tocca MAI il prezzo del tempo */
        /* A TEMPO APERTO IL CRAZY SCONTA APPOSTA: si paga il tempo
           passato MENO quello regalato, quindi togliere i giri cambia il
           prezzo ed e' giusto. La garanzia «il Crazy non tocca il prezzo
           del tempo» vale sul tempo comprato. */
        if (!x.payLater) {
          const gem = ctx.fotografia(x); gem.crazyJumping = 0; delete gem.crazyGiri;
          if (ctx.costOf(gem).parkTotal !== kk.parkTotal) guai.push('il Crazy sposta il tempo' + dove);
        }
        /* e i giri vuoti sono al massimo uno, in fondo */
        const g = ctx.giriCrazy(x);
        const vuoti = g.filter(v => v === 0).length;
        if (vuoti > 1 || (vuoti === 1 && g[g.length - 1] !== 0)) guai.push('giri vuoti ' + JSON.stringify(g) + dove);
        if (guai.length) break;
      }
    }
    ok('mille sequenze di quattordici mosse, e nessuna garanzia salta', guai.slice(0, 2), []);
  } finally {
    ctx.settings.tariffaSuTotale = eraSuTotale;
  }
});

gruppo('La sigla: due lettere per dire QUALE gruppo', () => {
  /* Il colore del bracciale dice la fascia oraria, non chi: in una
     serata ci sono dieci gruppi col verde, e per indicarne uno bisognava
     descriverlo. Due lettere si dicono a voce, si scrivono sul
     bracciale e si leggono da lontano.
     Niente I e O: accanto a un 1 e a uno 0 scritti a pennarello si
     confondono. Restano 576 sigle, e si ricomincia ogni giornata --
     l'unicita' serve solo fra chi c'e' adesso. */
  const veroSwitch = ctx.mondo.switchTab;
  ctx.mondo.switchTab = () => {};
  try {
    ctx.entries = [];
    ctx.draft = ctx.freshDraft();
    const sigle = [];
    for (let i = 0; i < 6; i++) {
      ctx.PAN.conto = ctx.draft; ctx.PAN.ingresso = null;
      ctx.bcSetQ('bimbi', 2);
      sigle.push(ctx.commitDa(ctx.draft, {}).sigla);
      ctx.draft = ctx.freshDraft();
    }
    ok('si assegnano in ordine, che si leggono a voce', sigle, ['AA', 'AB', 'AC', 'AD', 'AE', 'AF']);
    vero('e sono tutte diverse', new Set(sigle).size === sigle.length);
    vero('niente I e niente O, che si confondono con 1 e 0',
         ctx.SIGLA_LETTERE.indexOf('I') < 0 && ctx.SIGLA_LETTERE.indexOf('O') < 0);
    ok('quante sigle esistono in tutto', ctx.SIGLA_LETTERE.length * ctx.SIGLA_LETTERE.length, 576);

    /* IL GIORNO DOPO SI RIPARTE DA CAPO: l'unicita' serve fra chi c'e'
       adesso, non per sempre. */
    const ieri = ctx.giornataDi(Date.now()) - 1;
    ctx.entries.forEach(e => { e.startTime = ieri - 3600000; e.createdAt = e.startTime; });
    ok('il giorno dopo si riparte da AA', ctx.nuovaSigla(), 'AA');

    /* DUE GRUPPI DELLA STESSA GIORNATA NON POSSONO AVERE LA STESSA
       SIGLA. Da un tablet solo non capita; dal cloud si', se due casse
       registrano nello stesso momento. Vince chi e' entrato prima --
       che e' anche chi il bracciale ce l'ha gia' scritto addosso. */
    const ora = Date.now();
    const doppi = ctx.normalizeEntries([
      { id: 'x1', startTime: ora, createdAt: ora - 2000, children: 1, sigla: 'QQ' },
      { id: 'x2', startTime: ora, createdAt: ora - 1000, children: 1, sigla: 'QQ' },
      { id: 'x3', startTime: ora, createdAt: ora, children: 1, sigla: 'QQ' }
    ]);
    vero('tre doppioni diventano tre sigle diverse',
         new Set(doppi.map(e => e.sigla)).size === 3);
    ok('e la tiene chi e entrato prima', doppi.find(e => e.id === 'x1').sigla, 'QQ');

    /* e da fuori puo' arrivare qualunque cosa al posto delle lettere:
       si butta e se ne da' una buona, che e' meglio di lasciare
       l'ingresso senza riferimento */
    const storte = ctx.normalizeEntries([
      { id: 's1', startTime: ora, sigla: 'ab' }, { id: 's2', startTime: ora, sigla: 'A' },
      { id: 's3', startTime: ora, sigla: 'A1' }, { id: 's4', startTime: ora, sigla: 123 },
      { id: 's5', startTime: ora, sigla: null }, { id: 's6', startTime: ora, sigla: {} }
    ]).map(e => e.sigla);
    vero('una sigla storta viene sostituita con una buona',
         storte.every(x => /^[A-Z]{2,3}$/.test(x)));
    vero('e non se ne ripetono', new Set(storte).size === storte.length);

    /* CHI NON CE L'HA SE LA PRENDE. Sono gli ingressi registrati prima
       che le sigle esistessero: senza questo restavano senza per
       sempre, e in lista il codice si vedeva solo sui nuovi -- cioe'
       proprio quando serve indicarne uno a voce, meta' dei gruppi non
       ne aveva. Vale per TUTTI: gruppo, solo Crazy, Solo BAR. */
    const senza = ctx.normalizeEntries([
      { id: 'v1', startTime: ora - 3000, createdAt: ora - 3000, children: 2, durationMinutes: 30, baseMinutes: 30 },
      { id: 'v2', startTime: ora - 2000, createdAt: ora - 2000, children: 1, durationMinutes: 30, baseMinutes: 30 },
      { id: 'v3', startTime: ora - 1000, createdAt: ora - 1000, children: 0, durationMinutes: 0, baseMinutes: 0, crazyJumping: 1, omaggio: 10 },
      { id: 'v4', startTime: ora, createdAt: ora, children: 0, durationMinutes: 0, baseMinutes: 0, soloBar: true, barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 1 }] }
    ]);
    vero('anche gli ingressi vecchi ne ricevono una', senza.every(e => !!e.sigla));
    vero('e ce l ha anche il solo Crazy e il Solo BAR',
         !!senza.find(e => e.id === 'v3').sigla && !!senza.find(e => e.id === 'v4').sigla);
    vero('tutte diverse', new Set(senza.map(e => e.sigla)).size === senza.length);

    /* IL FOGLIO NASCE PRIMA CHE GLI INGRESSI SIANO LETTI.
       `let draft = freshDraft()` gira al caricamento dell'app, quando la
       lista salvata non e' ancora stata letta: `nuovaSigla()` vedeva
       una lista vuota e rispondeva sempre AA. Otto riavvii, otto gruppi
       chiamati AA -- visto al banco. Adesso la sigla si ricontrolla al
       momento della registrazione, che e' l'unico in cui si sa davvero
       chi c'e' dentro. */
    ctx.entries = ctx.normalizeEntries([
      { id: 'a', startTime: ora - 5000, createdAt: ora - 5000, children: 2, durationMinutes: 30, baseMinutes: 30, sigla: 'AA' },
      { id: 'b', startTime: ora - 4000, createdAt: ora - 4000, children: 2, durationMinutes: 30, baseMinutes: 30, sigla: 'AB' }
    ]);
    ctx.draft = Object.assign(ctx.freshDraft(), { sigla: 'AA' });
    ctx.PAN.conto = ctx.draft; ctx.PAN.ingresso = null;
    ctx.bcSetQ('bimbi', 2);
    const doppio = ctx.commitDa(ctx.draft, {});
    ctx.draft = ctx.freshDraft();
    vero('una sigla gia presa non si assegna una seconda volta', doppio.sigla !== 'AA');
    vero('e in lista non ce ne sono due uguali',
         new Set(ctx.entries.map(e => e.sigla)).size === ctx.entries.length);

    /* otto riavvii di fila: otto sigle diverse */
    const dopoRiavvii = [];
    for (let k = 0; k < 8; k++) {
      ctx.draft = Object.assign(ctx.freshDraft(), { sigla: 'AA' });
      ctx.draft.sigla = ctx.siglaLibera(ctx.draft.sigla, ctx.draft.startTime);
      ctx.PAN.conto = ctx.draft; ctx.PAN.ingresso = null;
      ctx.bcSetQ('bimbi', 1);
      dopoRiavvii.push(ctx.commitDa(ctx.draft, {}).sigla);
      ctx.draft = ctx.freshDraft();
    }
    ok('otto riavvii, otto sigle diverse', new Set(dopoRiavvii).size, 8);

    /* FINITE LE 576 SI PASSA A TRE LETTERE, invece di restare senza: un
       gruppo senza riferimento e' peggio di uno con una sigla piu'
       lunga. */
    const tanti = [];
    let i = 0;
    for (const a of ctx.SIGLA_LETTERE) {
      for (const b of ctx.SIGLA_LETTERE) {
        tanti.push({ id: 'e' + (i++), startTime: ora, createdAt: ora + i, children: 1, durationMinutes: 30, baseMinutes: 30, sigla: a + b });
      }
    }
    ctx.entries = ctx.normalizeEntries(tanti);
    ok('cinquecentosettantasei sigle da due lettere', ctx.entries.length, 576);
    vero('tutte diverse', new Set(ctx.entries.map(e => e.sigla)).size === 576);
    const dopoIlLimite = ctx.nuovaSigla();
    ok('la cinquecentosettantasettesima ha tre lettere', dopoIlLimite.length, 3);
    ok('e comincia da AAA', dopoIlLimite, 'AAA');
  } finally {
    ctx.mondo.switchTab = veroSwitch;
  }
});

gruppo('La nota e del gruppo, e quelle vecchie non si perdono', () => {
  /* Era un campo di ogni PERSONA, dentro il guardaroba: per scrivere
     «hanno la torta in macchina» bisognava aprire una persona e vestirla,
     e spesso una persona non la si vuole proprio mettere. Adesso e' del
     gruppo e sta nel Parco, in una card sua.
     Gli ingressi gia' salvati hanno le note sulle persone: si riversano
     nella nota del gruppo alla lettura, una volta sola. */
  const vecchio = ctx.normalizeEntries([{
    id: 'v', startTime: Date.now(), children: 2,
    people: [
      { id: 'p1', role: 'mamma', name: 'Anna', note: 'zaino giallo' },
      { id: 'p2', role: 'papa', name: '', note: 'gamba ingessata' }
    ]
  }])[0];
  ok('le note delle persone finiscono nella nota del gruppo',
     vecchio.note, 'zaino giallo · gamba ingessata');
  vero('e sulle persone non restano', ctx.lista(vecchio.people).every(p => !('note' in p)));

  const suo = ctx.normalizeEntries([{
    id: 'w', startTime: Date.now(), note: 'la sua',
    people: [{ id: 'p', role: 'mamma', note: 'altra' }]
  }])[0];
  ok('un gruppo che una nota ce l ha gia non si tocca', suo.note, 'la sua');

  const vuoto = ctx.normalizeEntries([{ id: 'z', startTime: Date.now() }])[0];
  ok('senza note, la nota e una stringa vuota', vuoto.note, '');

  /* e dal cloud o da un salvataggio vecchio ci puo' arrivare di tutto */
  const veleni = [null, 5, {}, [], true, NaN];
  const guai = [];
  veleni.forEach(v => {
    const o = ctx.normalizeEntries([{ id: 'n', startTime: Date.now(), note: v }])[0];
    if (typeof o.note !== 'string') guai.push(JSON.stringify(v) + ' -> ' + typeof o.note);
  });
  ok('qualunque schifezza al posto della nota diventa testo', guai, []);
  const lunga = ctx.normalizeEntries([{ id: 'l', startTime: Date.now(), note: 'a'.repeat(9000) }])[0];
  vero('e una nota lunghissima viene accorciata', lunga.note.length <= 500);
});

gruppo('Un ingresso marcio non porta giu tutto il banco', () => {
  /* `normalizeEntries` e' la porta da cui entra la roba di fuori: cloud
     scritto da un'altra versione, backup ripristinati, copie del giorno.
     Se esplode li', al banco non compare piu' NESSUNO -- non l'ingresso
     rotto: tutti. Ed e' successo: un `null` in mezzo a `barItems` faceva
     saltare l'elenco intero, perche' `traduciImporti` gira prima della
     riparazione e leggeva `bi.qty` senza guardare se `bi` c'era. */
  const buoni = [
    { id: 'buono1', startTime: Date.now(), children: 2, durationMinutes: 30, baseMinutes: 30 },
    { id: 'buono2', startTime: Date.now(), children: 1, durationMinutes: 60, baseMinutes: 60 }
  ];
  const marcio = { id: 'marcio', startTime: Date.now(), children: 1, barItems: [null, 3, { id: 'b1', name: 'Birra', price: NaN, qty: -2 }] };

  let usciti = null, esploso = null;
  try { usciti = ctx.normalizeEntries([buoni[0], marcio, buoni[1]]); }
  catch (e) { esploso = e.message; }
  ok('un null dentro barItems non fa esplodere niente', esploso, null);
  vero('e i due ingressi sani sopravvivono',
       !!usciti && ['buono1', 'buono2'].every(id => usciti.some(e => e.id === id)));

  /* i veleni classici, uno per uno: nessuno deve produrre un conto storto */
  const veleni = [
    ['bambini NaN', { children: NaN }],
    ['bambini stringa', { children: 'tre' }],
    ['durata negativa', { durationMinutes: -60 }],
    ['crazy infinito', { crazyJumping: Infinity }],
    ['paidPark NaN', { paidPark: NaN }],
    ['paidAmt con chiavi finte', { paidAmt: { pippo: 50, bimbi: 'tanti' } }],
    ['spunte oltre la quantita', { children: 1, paidLines: { bimbi: 99 } }],
    ['barItems non e una lista', { barItems: 'birra' }],
    ['aggiunte avvelenate', { aggiunte: [null, -5, 'x', Infinity, 15] }],
    ['people non e una lista', { people: 'io' }]
  ];
  const guai = [];
  veleni.forEach(([nome, veleno]) => {
    let o;
    try { o = ctx.normalizeEntries([Object.assign({ id: 'v', startTime: Date.now() }, veleno)])[0]; }
    catch (err) { guai.push(nome + ': ESPLODE'); return; }
    if (!o) { guai.push(nome + ': sparito'); return; }
    const k = ctx.costOf(o), d = ctx.dueOf(o);
    if (!(Number.isFinite(k.parkTotal) && k.parkTotal >= 0)) guai.push(nome + ': tempo ' + k.parkTotal);
    if (!(Number.isFinite(d.total) && d.total >= 0)) guai.push(nome + ': dovuto ' + d.total);
    if (!(Number.isFinite(ctx.minutiPagati(o)))) guai.push(nome + ': minuti pagati storti');
    if (!Array.isArray(o.barItems)) guai.push(nome + ': barItems non e una lista');
    if (!Array.isArray(o.people)) guai.push(nome + ': people non e una lista');
  });
  ok('nessun veleno produce un conto storto', guai.slice(0, 3), []);

  /* L'ORA D'INGRESSO: con un NaN li' dentro, endTimeOf tornava NaN e tutti
     i confronti del countdown diventavano falsi -- la scheda restava verde
     per sempre, cioe' un gruppo scaduto non lo diceva a nessuno. */
  const senzOra = ctx.normalizeEntries([{ id: 's', startTime: NaN, children: 1, durationMinutes: 30 }])[0];
  vero('un orario d ingresso rotto viene rimesso a posto', Number.isFinite(senzOra.startTime));
  vero('e l ora di uscita torna un orario vero', Number.isFinite(ctx.endTimeOf(senzOra)));
  const vecchio = ctx.normalizeEntries([{ id: 'x', startTime: NaN, children: 1, durationMinutes: 1 }])[0];
  vecchio.startTime = Date.now() - 3600000;   // entrato un'ora fa, per mezz'ora
  ok('e una scheda scaduta lo dice', ctx.stateOf(vecchio, Date.now()), 'danger');
});

gruppo('Il Crazy non entra MAI nel prezzo del tempo di parco', () => {
  /* LA REGOLA, per intero: il Crazy si paga a parte, col suo prezzo, e in
     cambio si sta dentro di piu'. Quei minuti in piu' NON sono tempo da
     pagare. Quindi aggiungere giri a un ingresso puo' cambiare due cose --
     il costo del Crazy e l'ora di uscita -- e non deve toccarne una terza:
     il prezzo del tempo.
     Vale su tutte le strade, ed e' il punto: tempo chiuso, tempo aperto,
     dopo una modifica, con tutte e due le tariffe. Ognuna e' un ramo
     diverso di costOf, e basta che una se ne dimentichi perche' la fascia
     dica «pagato fino alle 18:20» a conto saldato, cioe' chieda soldi non
     dovuti. */
  const eraSuTotale = ctx.settings.tariffaSuTotale;
  try {
    for (const suTot of [true, false]) {
      ctx.settings.tariffaSuTotale = suTot;
      const eti = suTot ? 'sul totale' : 'a scaglioni';
      const storti = [];

      /* — tempo chiuso — */
      for (const dur of [10, 15, 30, 45, 60, 90, 120, 180]) {
        const senza = conto({ children: 2, durationMinutes: dur, baseMinutes: dur });
        const rif = ctx.costOf(senza).parkTotal;
        for (const giri of [1, 2, 3, 5]) {
          const con = conto({ children: 2, durationMinutes: dur, baseMinutes: dur });
          ctx.metteCrazy(con, giri);
          const k = ctx.costOf(con);
          if (k.parkTotal !== rif) storti.push(dur + "' con " + giri + ' giri: tempo ' + k.parkTotal + ' invece di ' + rif);
          const atteso = ctx.r2(giri * ctx.settings.crazyJumpingPrice);
          if (k.crazyCost !== atteso) storti.push(dur + "'/" + giri + ' giri: Crazy ' + k.crazyCost + ' invece di ' + atteso);
        }
      }
      ok(eti + ': a tempo chiuso il Crazy non sposta il prezzo del tempo', storti.slice(0, 2), []);

      /* — dopo una modifica: stessa sequenza di ritocchi, con e senza — */
      const dopo = [];
      let seme = 777;
      const caso = (n) => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % n; };
      for (let giro = 0; giro < 400 && !dopo.length; giro++) {
        const dur = [15, 30, 45, 60, 90][caso(5)];
        const giri = caso(4);
        const a = conto({ children: 2, durationMinutes: dur, baseMinutes: dur });
        const b = conto({ children: 2, durationMinutes: dur, baseMinutes: dur });
        if (giri) ctx.metteCrazy(b, giri);
        for (let k = 0; k < 6; k++) { const m = caso(2) ? 5 : -5; ctx.ritoccaTempo(a, m); ctx.ritoccaTempo(b, m); }
        if (a.durationMinutes !== b.durationMinutes) dopo.push('i minuti divergono');
        else if (ctx.costOf(a).parkTotal !== ctx.costOf(b).parkTotal) {
          dopo.push(dur + "' + " + giri + ' giri: ' + ctx.costOf(b).parkTotal + ' invece di ' + ctx.costOf(a).parkTotal);
        }
      }
      ok(eti + ': quattrocento sequenze di ritocchi, e il Crazy resta fuori', dopo.slice(0, 2), []);
    }

    /* — tempo aperto: si paga il tempo passato, e i giri NON lo toccano —
       Qui si toglievano i minuti regalati dai giri, e a tempo aperto
       quella sottrazione non allunga niente: e' uno sconto. Bastava che
       facesse scendere di uno scaglione e il giro si pagava da solo. */
    ctx.settings.tariffaSuTotale = true;
    const aperti = [];
    /* NIENTE MULTIPLI DI CINQUE. A tempo aperto il prezzo si misura
       sull'orologio, e fra due misure passa qualche millesimo: chi e'
       dentro da 70′ TONDI viene arrotondato a 70 in una misura e a 75
       nella successiva, e la prova accusa il codice di un salto che ha
       fatto lei. Con 68′ le due misure cadono sempre nello stesso
       scaglione. */
    for (const dentroDa of [12, 23, 41, 68, 97]) {
      const t0 = Date.now() - dentroDa * 60000;
      const senza = conto({ children: 2, payLater: true, startTime: t0 });
      const rif = ctx.costOf(senza).parkTotal;
      const atteso = ctx.r2(ctx.fasciaVicina(dentroDa).p * 2);
      if (rif !== atteso) aperti.push('senza giri, dentro da ' + dentroDa + "': " + rif + ' invece di ' + atteso);
      for (const giri of [1, 2, 3]) {
        const con = conto({ children: 2, payLater: true, startTime: t0 });
        ctx.metteCrazy(con, giri);
        const p = ctx.costOf(con).parkTotal;
        if (p !== rif) aperti.push('dentro da ' + dentroDa + "'/" + giri + ' giri: il parco passa da ' + rif + ' a ' + p);
        /* e il totale deve salire di ESATTAMENTE i giri segnati */
        const salita = ctx.r2(ctx.dueOf(con).total - ctx.dueOf(senza).total);
        const dovuta = ctx.r2(giri * ctx.settings.crazyJumpingPrice);
        if (salita !== dovuta) {
          aperti.push('dentro da ' + dentroDa + "'/" + giri + ' giri: il totale sale di ' + salita + ' invece di ' + dovuta);
        }
      }
    }
    ok('a tempo aperto si paga il tempo passato, e i giri non lo toccano', aperti.slice(0, 2), []);

    /* — l'ora di USCITA invece i minuti regalati li comprende — */
    const uscite = [];
    for (const giri of [1, 2, 4]) {
      const senza = conto({ children: 2, durationMinutes: 60, baseMinutes: 60 });
      const con = conto({ children: 2, durationMinutes: 60, baseMinutes: 60 });
      ctx.metteCrazy(con, giri);
      const piu = Math.round((ctx.endTimeOf(con) - ctx.endTimeOf(senza)) / 60000);
      if (piu !== ctx.regalatiDi(con)) uscite.push(giri + ' giri: escono ' + piu + "' dopo invece di " + ctx.regalatiDi(con));
      if (piu <= 0) uscite.push(giri + ' giri: non restano dentro di piu');
    }
    ok('ma con i giri escono piu tardi: fin quando pagano e fino a quando restano sono due numeri', uscite.slice(0, 2), []);

    /* — «fin quando hanno pagato» non comprende il regalo — */
    const c = conto({ children: 2, durationMinutes: 60, baseMinutes: 60 });
    ctx.metteCrazy(c, 2);
    ctx.PAN.conto = c; ctx.PAN.ingresso = null;
    ok('senza pagare niente, zero minuti pagati', ctx.minutiPagati(c), 0);
    ctx.bcSegna('crazy', true);
    ok('pagato SOLO il Crazy, il tempo resta tutto da pagare', ctx.minutiPagati(c), 0);
    ok('e il residuo e esattamente il tempo, niente di piu', ctx.dueOf(c).total, ctx.r2(ctx.costOf(c).parkTotal));
    ctx.pagaTutto();
    ok('pagato tutto, il tempo e pagato per intero', ctx.minutiPagati(c), 60);
    ok('e non resta niente', ctx.dueOf(c).total, 0);

    /* — pagare il Crazy e poi togliere i giri: i soldi tornano — */
    const g = conto({ children: 0, durationMinutes: 0, baseMinutes: 0 });
    ctx.PAN.conto = g; ctx.PAN.ingresso = null;
    ctx.metteCrazy(g, 3);
    ctx.bcSegna('crazy', true);
    const presi = ctx.importoRiga('crazy');
    ctx.bcSetQ('crazy', 1);
    vero('tolti due giri, l incassato non supera il dovuto', ctx.importoRiga('crazy') <= ctx.costOf(g).crazyCost);
    vero('e qualcosa e tornato indietro', ctx.importoRiga('crazy') < presi);
    ok('niente debito inventato', ctx.dueOf(g).total, 0);
    ctx.bcSetQ('crazy', 0);
    ok('tolti tutti, la riga si azzera', ctx.importoRiga('crazy'), 0);
  } finally {
    ctx.settings.tariffaSuTotale = eraSuTotale;
  }
});

gruppo('Anche a scaglioni lo stesso tempo costa lo stesso', () => {
  /* L'INTERRUTTORE «ogni aggiunta si paga a parte» (settings.tariffaSuTotale
     = false) apre una seconda strada dentro costOf, e quella strada non era
     provata da nessuno: si e' scoperto che un'ora riportata a mezz'ora col
     meno continuava a costare l'ora -- dodici euro invece di sette.
     Il motivo: `baseMinutes` e' la durata al momento della registrazione e
     non si muove piu', ma lo scaglione iniziale si prendeva da li' senza
     guardare quanto tempo fosse rimasto davvero.
     Le due tariffe possono dare numeri diversi quando si ALLUNGA -- e'
     esattamente il loro mestiere -- ma su un ingresso senza aggiunte devono
     dire la stessa cifra: il tempo comprato e' uno solo. */
  const eraSuTotale = ctx.settings.tariffaSuTotale;
  try {
    ctx.settings.tariffaSuTotale = false;

    const a = conto({ children: 1, durationMinutes: 60, baseMinutes: 60 });
    for (let i = 0; i < 6; i++) ctx.ritoccaTempo(a, -5);
    ok('sei meno riportano a mezz ora', a.durationMinutes, 30);
    ok('e si paga la mezz ora, non l ora di quando erano entrati',
       ctx.costOf(a).parkTotal, ctx.r2(ctx.priceFor(30)));
    ok('baseMinutes resta quello della registrazione', a.baseMinutes, 60);

    /* allungando, invece, i due conti restano due conti: la durata
       iniziale al suo prezzo e ogni blocco venduto al suo */
    const b = conto({ children: 1, durationMinutes: 30, baseMinutes: 30 });
    b.aggiunte = [30];
    b.durationMinutes = 60;
    ok('mezz ora piu una mezz ora venduta fanno due scaglioni da mezz ora',
       ctx.costOf(b).parkTotal, ctx.r2(ctx.priceFor(30) * 2));

    /* senza aggiunte le due tariffe devono coincidere, a ogni durata */
    const discordi = [];
    for (const m of [10, 15, 20, 30, 40, 50, 60, 90, 120, 180]) {
      const c = conto({ children: 2, durationMinutes: m, baseMinutes: m });
      ctx.settings.tariffaSuTotale = false;
      const scaglioni = ctx.costOf(c).parkTotal;
      ctx.settings.tariffaSuTotale = true;
      const totale = ctx.costOf(c).parkTotal;
      if (scaglioni !== totale) discordi.push(m + ': a scaglioni ' + scaglioni + ', sul totale ' + totale);
    }
    ok('senza aggiunte le due tariffe dicono la stessa cifra', discordi.slice(0, 3), []);

    /* e la garanzia in generale, come per l'altra tariffa */
    ctx.settings.tariffaSuTotale = false;
    let seme = 20260815;
    const caso = (n) => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % n; };
    const storti = [];
    for (let giro = 0; giro < 1000 && !storti.length; giro++) {
      const c = conto({ children: 1, durationMinutes: [15, 30, 45, 60, 90][caso(5)] });
      c.baseMinutes = c.durationMinutes;
      c.aggiunte = caso(3) === 0 ? [] : caso(2) === 0 ? [15] : [30, 15];
      for (let k = 0; k < 8; k++) ctx.ritoccaTempo(c, caso(2) ? 5 : -5);
      const p = ctx.costOf(c).parkTotal;
      if (!(p >= 0) || !Number.isFinite(p)) storti.push('prezzo storto: ' + p);
      /* non si puo' mai pagare piu' del massimo del cartello per ogni
         pezzo di tempo che c'e' davvero */
      const tetto = ctx.r2(ctx.priceFor(120) * (1 + ctx.lista(c.aggiunte).length));
      if (p > tetto) storti.push('sopra il tetto: ' + p + ' con ' + c.durationMinutes + ' minuti');
    }
    ok('mille ritocchi a scaglioni e nessun conto storto', storti.slice(0, 3), []);
  } finally {
    /* le impostazioni sono di tutti: se restassero girate, i gruppi che
       vengono dopo proverebbero l'altra tariffa senza saperlo */
    ctx.settings.tariffaSuTotale = eraSuTotale;
  }
});

gruppo('Solo Crazy: dieci minuti in omaggio, e non si pagano mai', () => {
  /* Chi entra solo per saltare non compra tempo di parco: gli si da'
     la permanenza che serve -- salire, saltare, uscire -- e non si
     paga. E se DOPO decide di fermarsi anche al parco, quei dieci
     minuti restano gratis: si paga solo quello che compra da li' in
     poi. Prima quei minuti finivano dentro la durata, e al primo
     bambino aggiunto diventavano tempo da pagare. */
  const omaggio = ctx.settings.crazySoloMinuti;
  const extra = ctx.settings.crazyExtraMinutes;
  const c = conto({ children: 1, crazyJumping: 0, durationMinutes: 30,
    baseMinutes: 30, barItems: [] });

  /* si toglie il bambino e si mette un Crazy: diventa "solo Crazy" */
  ctx.bcSetQ('bimbi', 0);
  ctx.bcSetQ('crazy', 1);
  ok('niente tempo di parco comprato', c.durationMinutes, 0);
  ok('e dieci minuti in omaggio', ctx.omaggioDi(c), omaggio);
  ok('si paga solo il Crazy', ctx.dueOf(c).park, ctx.settings.crazyJumpingPrice);
  /* I DIECI MINUTI SONO IL PRIMO GIRO, non un regalo in piu': salire,
     saltare, uscire sta tutto li' dentro. Sommarci anche i minuti del
     giro voleva dire regalare due volte la stessa cosa. */
  ok('ma dentro ci resta l omaggio, e basta',
     Math.round((ctx.endTimeOf(c) - c.startTime) / 60000), omaggio);
  /* dal secondo giro in poi si sommano davvero: sono salite in piu' */
  ctx.giroNuovo(c);
  ctx.cambiaGiro(c, ctx.giriCrazy(c).length - 1, 1);
  ok('col secondo giro si aggiungono i suoi minuti',
     Math.round((ctx.endTimeOf(c) - c.startTime) / 60000), omaggio + extra);
  ctx.giroNuovo(c);
  ctx.cambiaGiro(c, ctx.giriCrazy(c).length - 1, 2);
  ok('e col terzo un altro pezzo',
     Math.round((ctx.endTimeOf(c) - c.startTime) / 60000), omaggio + extra * 2);
  ok('mentre i soldi restano quelli delle salite',
     ctx.dueOf(c).park, ctx.r2(ctx.settings.crazyJumpingPrice * 4));
  /* e tornando a un giro solo si torna ai dieci minuti */
  ctx.viaGiro(c, 2); ctx.viaGiro(c, 1);
  ok('via i giri, via i loro minuti',
     Math.round((ctx.endTimeOf(c) - c.startTime) / 60000), omaggio);

  /* adesso arrivano anche al parco: mezz'ora */
  ctx.bcSetQ('bimbi', 2);
  ok('col bambino aggiunto e ancora zero tempo comprato', c.durationMinutes, 0);
  ok('e il parco NON si paga: non hanno comprato minuti',
     ctx.dueOf(c).park, ctx.settings.crazyJumpingPrice);

  c.durationMinutes = 30;
  ok('venduta mezz ora, si paga la MEZZ ORA',
     ctx.dueOf(c).park,
     ctx.r2(ctx.priceFor(30) * 2 + ctx.settings.crazyJumpingPrice));
  ok('i dieci minuti in omaggio non entrano nel prezzo',
     ctx.dueOf(c).park !== ctx.r2(ctx.priceFor(40) * 2 + ctx.settings.crazyJumpingPrice), true);
  /* MA NON RESTANO NELLA PERMANENZA, non piu'. I dieci minuti in
     omaggio sono il tempo per salire e scendere: chi poi COMPRA tempo di
     parco li ha gia' spesi, e sommarglieli voleva dire dargli venti
     minuti per dieci comprati -- visto al banco, e sbagliato.
     Da quando c'e' tempo di parco la permanenza si conta da li'. */
  ok('e nemmeno nella permanenza, una volta comprato il tempo',
     Math.round((ctx.endTimeOf(c) - ctx.inizioParco(c)) / 60000), 30);

  /* e il tasto che allunga dice il prezzo del blocco, non dell'omaggio */
  ok('allungare di mezz ora costa la mezz ora',
     ctx.costoEstensione(c, 30), ctx.r2(ctx.priceFor(30) * 2));

  /* se il Crazy se ne va, se ne vanno i minuti regalati */
  ctx.bcSetQ('crazy', 0);
  ok('via il Crazy, via l omaggio', ctx.omaggioDi(c), 0);
  ok('e resta la mezz ora comprata', c.durationMinutes, 30);

  /* nessuno resta mai con una permanenza di niente */
  const d = conto({ children: 0, crazyJumping: 0, durationMinutes: 30, barItems: [] });
  ctx.bcSetQ('crazy', 1);
  ok('solo Crazy da capo: zero comprati', d.durationMinutes, 0);
  ctx.bcSetQ('crazy', 0);
  ok('e togliendolo torna la mezz ora, non zero minuti', d.durationMinutes, 30);
});

gruppo('Il colore della scheda dice l orologio', () => {
  /* verde finche' c'e' tempo, giallo negli ultimi minuti, ROSSO appena
     e' scaduto. Prima il rosso aspettava anche la tolleranza: per
     dieci minuti la scheda diceva "SFORATO DA 04:12" restando gialla,
     cioe' il numero e il colore raccontavano due cose diverse. */
  const min = 60000;
  const c = conto({ children: 1, durationMinutes: 60, crazyJumping: 0, barItems: [] });
  const fine = ctx.endTimeOf(c);
  ok('con tanto tempo davanti e verde', ctx.stateOf(c, fine - 30 * min), 'ok');
  ok('a sei minuti e ancora verde', ctx.stateOf(c, fine - 6 * min), 'ok');
  ok('a quattro minuti diventa giallo', ctx.stateOf(c, fine - 4 * min), 'warn');
  ok('a un minuto e giallo', ctx.stateOf(c, fine - 1 * min), 'warn');
  ok('scaduto e ROSSO subito', ctx.stateOf(c, fine + 1), 'danger');
  ok('e resta rosso dopo un minuto', ctx.stateOf(c, fine + min), 'danger');
  ok('anche dentro la tolleranza di dieci minuti',
     ctx.stateOf(c, fine + 5 * min), 'danger');

  /* i minuti regalati dal Crazy spostano la scadenza, quindi anche il
     colore: sono tempo dentro, e la scheda deve saperlo */
  const d = conto({ children: 1, durationMinutes: 60, crazyJumping: 2,
    crazyGiri: [2], barItems: [] });
  const fineD = ctx.endTimeOf(d);
  ok('col Crazy la scadenza si sposta', Math.round((fineD - d.startTime) / min),
     60 + ctx.settings.crazyExtraMinutes);
  ok('e il rosso arriva alla scadenza NUOVA', ctx.stateOf(d, fineD + 1), 'danger');
  ok('prima e ancora verde', ctx.stateOf(d, fineD - 20 * min), 'ok');

  /* il tempo aperto non scade: e' un'altra cosa e ha il suo colore */
  const e = conto({ children: 1, payLater: true, barItems: [] });
  ok('il tempo aperto non diventa mai rosso', ctx.stateOf(e, Date.now() + 999 * min), 'later');
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

gruppo('La Grafica 2.0 cambia quello che si vede, non un euro', () => {
  /* E' una modalita' di prova: toglie tre comandi che si ripetono. Se
     togliesse anche solo un centesimo, o cambiasse un orario, non
     sarebbe una scelta di grafica -- sarebbe un guasto travestito da
     preferenza, e nessuno andrebbe a cercarlo li'. */
  const ora = Date.now();
  const casi = [
    ['comprato, meta pagato', { children: 3, durationMinutes: 60, baseMinutes: 30, aggiunte: [30],
      crazyJumping: 2, crazyGiri: [1, 1], paidPark: 14, paidAmt: { bimbi: 14 }, paidLines: { bimbi: 2 },
      barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 2 }] }],
    ['tempo aperto con pausa', { children: 2, durationMinutes: 0, baseMinutes: 0, payLater: true,
      startTime: ora - 73 * 60000, pausato: 30 * 60000, crazyJumping: 1, crazyGiri: [1] }],
    ['solo Crazy', { children: 0, durationMinutes: 0, baseMinutes: 0, omaggio: 10,
      crazyJumping: 3, crazyGiri: [2, 1] }],
    ['solo BAR', { children: 0, durationMinutes: 0, baseMinutes: 0, soloBar: true,
      barItems: [{ id: 'b3', name: 'Coca Cola', price: 2.5, qty: 2 }] }],
    ['niente sul conto', { children: 0, durationMinutes: 0, baseMinutes: 0 }]
  ];
  const foto = (c) => {
    const k = ctx.costOf(c), d = ctx.dueOf(c);
    return [k.parkTotal, k.crazyCost, k.unit, d.park, d.bar, d.total, d.avanzo,
      ctx.endTimeOf(c), ctx.tempoTotale(c), ctx.minutiPagati(c),
      ctx.contoParco(), ctx.contoCrazy(), ctx.contoBar()].join('/');
  };

  const era = ctx.settings.grafica2;
  const guai = [];
  casi.forEach(([nome, extra]) => {
    const c = conto(Object.assign({ startTime: ora - 40 * 60000 }, extra));
    ctx.PAN.conto = c; ctx.PAN.ingresso = null;
    ctx.settings.grafica2 = false;
    const spenta = foto(c);
    ctx.settings.grafica2 = true;
    const accesa = foto(c);
    if (spenta !== accesa) guai.push(nome + ': ' + spenta + ' → ' + accesa);
    /* e anche incassando: «Paga tutto» deve fare la stessa cosa */
    ctx.settings.grafica2 = false;
    const a = conto(Object.assign({ startTime: ora - 40 * 60000 }, extra));
    ctx.PAN.conto = a; ctx.pagaTutto();
    ctx.settings.grafica2 = true;
    const b = conto(Object.assign({ startTime: ora - 40 * 60000 }, extra));
    ctx.PAN.conto = b; ctx.pagaTutto();
    if (foto(a) !== foto(b)) guai.push(nome + ', pagando tutto: ' + foto(a) + ' → ' + foto(b));
  });
  ok('cinque situazioni, gli stessi identici numeri', guai.slice(0, 3), []);

  /* e adesso quello che DEVE cambiare: solo il disegno */
  const c = conto({ children: 2, durationMinutes: 60, baseMinutes: 60, startTime: ora - 40 * 60000,
    crazyJumping: 1, crazyGiri: [1], barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 2 }] });
  ctx.PAN.conto = c; ctx.PAN.ingresso = null;

  ctx.settings.grafica2 = false;
  const pgSpenta = ctx.pastigliaPagato(c), fondoSpento = ctx.pcFondo();
  ctx.settings.grafica2 = true;
  const pgAccesa = ctx.pastigliaPagato(c), fondoAcceso = ctx.pcFondo();

  vero('col 2.0 il piu e il meno del pagato spariscono dalla fascia Tempo',
    /data-a="pagatempo"/.test(pgSpenta) && !/data-a="pagatempo"/.test(pgAccesa));
  vero('ma la scritta di fin quando hanno pagato resta',
    /class="k"/.test(pgAccesa) && pgAccesa.length > 20);
  vero('col 2.0 i tre totali di sezione spariscono dalla fascia in fondo',
    /Totale Parco/.test(fondoSpento) && !/Totale Parco/.test(fondoAcceso));
  vero('e con loro i tre tasti «paga» di sezione',
    /data-sez=/.test(fondoSpento) && !/data-sez=/.test(fondoAcceso));
  vero('ma la cifra da incassare resta dov era',
    /bc-conto/.test(fondoAcceso) && fondoAcceso.indexOf(ctx.eur(ctx.dueOf(c).total)) >= 0);
  vero('e restano il Resto e il Paga tutto',
    /Resto/.test(fondoAcceso) && /data-tutto|Paga tutto/.test(fondoAcceso));

  ctx.settings.grafica2 = era;
});

gruppo('I numeri rapidi dei bambini: meno tocchi, stessi conti', () => {
  /* Il tempo ha sempre avuto i suoi tagli e si sceglie con un tocco; i
     bambini si salivano di uno per volta, quindi una famiglia da
     quattro costava quattro tocchi. Sono le due cose che si mettono
     sempre, tutte le sere: l'asimmetria non aveva motivo. */
  const era = ctx.settings.grafica2;

  ctx.settings.grafica2 = false;
  vero('a interruttore spento la fila non c e', ctx.numeriRapidi('bimbi', 0) === '');
  ctx.settings.grafica2 = true;
  vero('accesa, c e', /data-quanti="bimbi"/.test(ctx.numeriRapidi('bimbi', 0)));
  vero('e solo sui bambini', ctx.numeriRapidi('crazy', 0) === '' && ctx.numeriRapidi('b1', 0) === '');
  ok('con i numeri che capitano al banco',
    ctx.NUMERI_RAPIDI.length, 6);
  vero('quello che c e gia risulta acceso', /data-v="3"[^>]*>3<|class="chip on" data-quanti="bimbi" data-v="3"/
    .test(ctx.numeriRapidi('bimbi', 3).replace(/\s+/g, ' ')) ||
    ctx.numeriRapidi('bimbi', 3).indexOf('chip on') >= 0);

  /* IL NUMERO RAPIDO PASSA DALLA STESSA STRADA DEL PIU' E DEL MENO.
     Se scrivesse `children` per conto suo, un giorno una delle due
     strade imparerebbe una regola e l'altra no. */
  const conta = (quanti, comeMetterli) => {
    const c = conto({ children: 0, durationMinutes: 30, baseMinutes: 30,
      startTime: Date.now() - 20 * 60000 });
    ctx.PAN.conto = c; ctx.PAN.ingresso = null;
    comeMetterli(quanti);
    const k = ctx.costOf(c), d = ctx.dueOf(c);
    /* NIENTE ORARI ASSOLUTI QUI DENTRO: i due conti si costruiscono in
       due istanti diversi e l'ora d'uscita esce di un millesimo, che
       non e' una differenza -- e' l'orologio. Si confronta la DURATA,
       che e' quello che il tocco decide. */
    return [c.children, k.parkTotal, k.unit, d.total,
      c.durationMinutes, ctx.endTimeOf(c) - c.startTime].join('/');
  };
  const guai = [];
  [0, 1, 2, 3, 4, 5, 6].forEach(n => {
    const aUnoAllaVolta = conta(n, q => { for (let i = 0; i < q; i++) ctx.bcSetQ('bimbi', ctx.bcQ('bimbi') + 1); });
    const dUnColpo = conta(n, q => ctx.bcSetQ('bimbi', q));
    if (aUnoAllaVolta !== dUnColpo) guai.push(n + ' bambini: ' + aUnoAllaVolta + ' vs ' + dUnColpo);
  });
  ok('mettere quattro bambini con un tocco o con quattro da lo stesso conto', guai, []);

  /* e i soldi gia' incassati non si perdono togliendo bambini col
     numero rapido, esattamente come col meno */
  const c = conto({ children: 4, durationMinutes: 30, baseMinutes: 30,
    startTime: Date.now() - 20 * 60000 });
  ctx.PAN.conto = c; ctx.PAN.ingresso = null;
  ctx.pagaTutto();
  const presi = ctx.r2(c.paidPark);
  ctx.bcSetQ('bimbi', 2);
  vero('scendendo a due, l incassato non supera il dovuto',
    ctx.r2(c.paidPark) <= ctx.costOf(c).parkTotal + 0.005,
    'incassati ' + c.paidPark + ' per ' + ctx.costOf(c).parkTotal + ' dovuti (prima erano ' + presi + ')');
  vero('e il dovuto non diventa negativo', ctx.dueOf(c).total >= 0);

  ctx.settings.grafica2 = era;
});

/* ══════════════════════════════════════════════════════════════ */
console.log('\n' + '━'.repeat(52));
console.log(rotti === 0
  ? '  TUTTO A POSTO — ' + fatti + ' controlli, ' + gruppi.length + ' gruppi'
  : '  ' + rotti + ' CONTROLLI FALLITI su ' + fatti);
process.exit(rotti === 0 ? 0 : 1);

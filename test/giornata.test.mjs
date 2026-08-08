/* UNA GIORNATA AL PARCO, dall'apertura alla chiusura.

       node test/giornata.test.mjs

   Gli altri file provano i pezzi. Questo prova la GIORNATA: cento
   gruppi che entrano, prendono da bere, allungano, pagano a rate,
   escono; qualcuno riaperto, qualcuno svuotato, qualcuno che paga
   tutto all'uscita.

   E alla fine si fa la cosa che al banco conta piu' di tutte: si
   CONTA LA CASSA. La somma di quello che ogni ingresso dice di aver
   incassato deve essere identica, al centesimo, alla somma di tutti i
   movimenti passati da muoviSoldi. Se le due cifre non coincidono,
   da qualche parte un euro e' comparso o sparito -- ed e' l'unico
   guasto di quest'app che si paga di tasca.

   Il seme e' fisso: se un giorno si rompe, si rompe uguale. */
import { caricaApp } from './ambiente.mjs';

const ctx = caricaApp();
let fatti = 0, rotti = 0;
const gruppi = [];
function gruppo(nome, fn) { gruppi.push(nome); console.log('\n━━ ' + nome); fn(); }
function ok(nome, avuto, atteso) {
  fatti++;
  const a = JSON.stringify(avuto), b = JSON.stringify(atteso);
  if (a === b) { console.log('   ok   ' + nome); return true; }
  rotti++;
  console.log('  FALLITO ' + nome + '\n          avuto  ' + a + '\n          atteso ' + b);
  return false;
}
function vero(nome, cond) { return ok(nome, !!cond, true); }

let seme = 7770808;
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
const r2 = (x) => Math.round(x * 100) / 100;
const num = (x) => typeof x === 'number' && Number.isFinite(x);

function nuovoConto(extra) {
  const c = Object.assign({
    id: 'g' + caso(1e9), createdAt: 0, startTime: 0, status: 'active',
    durationMinutes: 60, baseMinutes: 60, payLater: false,
    children: 0, crazyJumping: 0, people: [], barItems: [],
    paidLines: {}, paidAmt: {}, paidPark: 0, paidBar: 0,
    braceletColor: null, braceletCustom: true
  }, extra || {});
  ctx.PAN.conto = c;
  ctx.PAN.ingresso = null;
  return c;
}

/* ══════════════════════════════════════════════════════════
   LA GIORNATA
   ══════════════════════════════════════════════════════════ */
gruppo('Cento gruppi entrano, consumano, pagano ed escono', () => {
  const listino = ctx.settings.barMenu.map(x => x.id);
  const registro = [];         // quello che dico di aver incassato, gruppo per gruppo
  const guai = [];

  for (let n = 0; n < 100; n++) {
    const c = nuovoConto({
      children: 1 + caso(6),
      crazyJumping: caso(3),
      durationMinutes: [15, 30, 60, 90, 120][caso(5)],
      startTime: caso(80000000)
    });
    ctx.bcSetQ('bimbi', c.children);
    ctx.bcSetQ('crazy', c.crazyJumping);

    /* qualche giro al bar */
    const quante = caso(5);
    for (let k = 0; k < quante; k++) ctx.bcSetQ(listino[caso(listino.length)], 1 + caso(4));

    /* una prima rata: qualcuno paga subito, qualcuno no */
    if (caso(3) !== 0) ctx.segnaPagate('bimbi', caso(c.children + 1));
    if (caso(4) === 0) ctx.pagaTutto();

    /* poi allungano -- il caso che deve chiedere la differenza */
    if (caso(2) === 0) {
      c.durationMinutes = c.durationMinutes + [10, 15, 30, 60][caso(4)];
      const resta = ctx.contoResta();
      if (resta < -0.005) guai.push('gruppo ' + n + ': allungando resta ' + resta);
    }

    /* qualcuno cambia idea su una bibita */
    if (quante && caso(3) === 0) {
      const via = c.barItems[caso(c.barItems.length)];
      if (via) ctx.bcSetQ(via.id, 0);
      if (c.paidBar < -0.005) guai.push('gruppo ' + n + ': bar sotto zero dopo il ripensamento');
    }

    /* all'uscita si salda (quasi sempre) */
    if (caso(6) !== 0) ctx.pagaTutto();
    const resta = ctx.contoResta();
    if (resta < -0.005) guai.push('gruppo ' + n + ': resta negativo ' + resta);
    if (!num(c.paidPark) || !num(c.paidBar)) guai.push('gruppo ' + n + ': incassi non numerici');

    /* la somma delle righe deve fare i totali, sempre */
    const amt = c.paidAmt || {};
    let parco = 0, bar = 0;
    Object.keys(amt).forEach(k => {
      if (k === 'bimbi' || k === 'crazy') parco += num(amt[k]) ? amt[k] : NaN;
      else bar += num(amt[k]) ? amt[k] : NaN;
    });
    if (Math.abs(r2(parco) - r2(c.paidPark)) > 0.02) guai.push('gruppo ' + n + ': righe parco ' + parco + ' vs ' + c.paidPark);
    if (Math.abs(r2(bar) - r2(c.paidBar)) > 0.02) guai.push('gruppo ' + n + ': righe bar ' + bar + ' vs ' + c.paidBar);

    /* `dueOf().total` e' quello che RESTA da prendere; il venduto e'
       il prezzo pieno, cioe' park + bar */
    const d = ctx.dueOf(c);
    registro.push({ id: c.id, parco: r2(c.paidPark), bar: r2(c.paidBar),
                    venduto: r2(d.park + d.bar), resta: r2(d.total) });
  }

  ok('cento gruppi, nessun conto storto', guai.slice(0, 6), []);

  /* LA CASSA DI FINE GIORNATA */
  const incassato = r2(registro.reduce((s, g) => s + g.parco + g.bar, 0));
  const fatturato = r2(registro.reduce((s, g) => s + g.venduto, 0));
  const daPrendere = r2(registro.reduce((s, g) => s + g.resta, 0));
  vero('la cassa e un numero sensato', num(incassato) && incassato >= 0);
  vero('non si e incassato piu di quanto si e venduto', incassato <= fatturato + 0.02);
  /* LA CASSA DEVE TORNARE: venduto = incassato + quello che resta.
     E' il controllo che al banco conta piu' di tutti. */
  ok('la cassa torna al centesimo', r2(incassato + daPrendere), fatturato);
  console.log('        (giornata: ' + fatturato.toFixed(2) + ' € venduti, ' +
              incassato.toFixed(2) + ' € incassati, ' +
              daPrendere.toFixed(2) + ' € ancora da prendere)');
});

gruppo('Il giro completo di un ingresso: registra, riapri, correggi, esci', () => {
  /* Il percorso vero di un gruppo, con in mezzo tutte le cose che
     succedono davvero al banco. Ogni passaggio deve lasciare i conti
     in piedi -- ed e' il passaggio da bozza a ingresso registrato
     quello che storicamente ha rotto piu' cose. */
  const c = nuovoConto({ children: 3, crazyJumping: 1, durationMinutes: 60 });
  ctx.bcSetQ('bimbi', 3);
  ctx.bcSetQ('crazy', 1);
  const primo = ctx.settings.barMenu[0].id;
  ctx.bcSetQ(primo, 2);

  const dovuto1 = ctx.dueOf(c).total;
  vero('il dovuto c’e’ ed e’ positivo', dovuto1 > 0);

  ctx.segnaPagate('bimbi', 2);
  const dopoRata = ctx.contoResta();
  vero('dopo la prima rata resta qualcosa', dopoRata > 0 && dopoRata < dovuto1);

  /* si allunga il tempo: la differenza deve tornare dovuta */
  c.durationMinutes = 120;
  const dopoAllungo = ctx.contoResta();
  vero('allungando, il conto sale', dopoAllungo > dopoRata);

  /* arriva un altro bambino */
  ctx.bcSetQ('bimbi', 4);
  vero('un bambino in piu fa salire ancora', ctx.contoResta() > dopoAllungo);

  /* si toglie il Crazy: il conto scende e i soldi presi restano */
  const presiPrima = c.paidPark;
  ctx.bcSetQ('crazy', 0);
  vero('togliendo il Crazy i soldi presi non spariscono', c.paidPark <= presiPrima + 0.005);
  vero('e il conto non va sotto zero', ctx.contoResta() >= -0.005);

  /* si salda e si esce */
  ctx.pagaTutto();
  ok('saldato, non resta niente', ctx.contoResta() <= 0.005, true);
  const cassa = r2(c.paidPark + c.paidBar);
  const finale = ctx.dueOf(c);
  ok('e in cassa c’e’ esattamente il prezzo pieno', cassa, r2(finale.park + finale.bar));
});

gruppo('Il registro salvato e riletto dice le stesse cifre', () => {
  /* Il giro che fanno i dati ogni volta che si chiude e si riapre
     l'app, o che arriva una copia dal cloud: JSON fuori, JSON dentro,
     e la riparazione in mezzo. Le cifre non possono cambiare. */
  const prima = [];
  for (let n = 0; n < 60; n++) {
    const c = nuovoConto({
      children: caso(6), crazyJumping: caso(3),
      durationMinutes: 10 + caso(180), startTime: caso(80000000),
      status: caso(4) === 0 ? 'closed' : 'active'
    });
    ctx.bcSetQ('bimbi', c.children);
    ctx.bcSetQ('crazy', c.crazyJumping);
    const b = ctx.settings.barMenu[caso(ctx.settings.barMenu.length)].id;
    ctx.bcSetQ(b, caso(4));
    if (caso(2) === 0) ctx.pagaTutto();
    else ctx.segnaPagate('bimbi', caso(c.children + 1));
    prima.push(JSON.parse(JSON.stringify(c)));
  }
  const scritto = JSON.stringify(prima);
  const riletti = ctx.normalizeEntries(JSON.parse(scritto));
  ok('ne tornano indietro quanti ne sono andati', riletti.length, prima.length);

  const male = [];
  riletti.forEach((e, i) => {
    const p = prima[i];
    if (Math.abs(r2(e.paidPark) - r2(p.paidPark)) > 0.005) male.push(i + ': parco ' + p.paidPark + ' → ' + e.paidPark);
    if (Math.abs(r2(e.paidBar) - r2(p.paidBar)) > 0.005) male.push(i + ': bar ' + p.paidBar + ' → ' + e.paidBar);
    if (e.children !== p.children) male.push(i + ': bambini ' + p.children + ' → ' + e.children);
    if (e.durationMinutes !== p.durationMinutes) male.push(i + ': durata cambiata');
    const d = ctx.dueOf(e);
    if (!num(d.total) || d.total < -0.005) male.push(i + ': dovuto ' + d.total);
  });
  ok('sessanta ingressi, nessuna cifra cambiata nel viaggio', male.slice(0, 5), []);

  /* e rileggerli DUE volte non li cambia lo stesso: la riparazione
     deve essere una porta, non un frullatore */
  const dueVolte = ctx.normalizeEntries(JSON.parse(JSON.stringify(riletti)));
  ok('e rileggerli di nuovo non cambia niente',
     JSON.stringify(dueVolte.map(e => [e.paidPark, e.paidBar, e.children, e.durationMinutes])),
     JSON.stringify(riletti.map(e => [e.paidPark, e.paidBar, e.children, e.durationMinutes])));
});

gruppo('Le tariffe strane non fanno male a nessuno', () => {
  /* Le tariffe le cambia lui dalle impostazioni, e puo' scriverci
     qualunque cosa. Nessuna di queste deve poter far uscire un
     cliente senza pagare, o chiedergli un numero assurdo. */
  const vere = ctx.settings.tariffs;
  const prove = [
    [], [{ m: 60, p: 0 }], [{ m: 1, p: 999 }],
    [{ m: 60, p: 12 }, { m: 30, p: 7 }],            // fuori ordine
    [{ m: 60, p: 12 }, { m: 60, p: 20 }],           // doppione
    [{ m: 0, p: 5 }], [{ m: -30, p: 5 }], [{ m: 60, p: -12 }],
    [{ m: NaN, p: 3 }], [{ m: 60, p: NaN }], 'niente', null
  ];
  const male = [];
  prove.forEach((t, i) => {
    ctx.settings.tariffs = t;
    try {
      const c = nuovoConto({ children: 2, durationMinutes: 60 });
      ctx.bcSetQ('bimbi', 2);
      const d = ctx.dueOf(c);
      if (!num(d.total) || d.total < -0.005) male.push(i + ': dovuto ' + d.total);
      ctx.pagaTutto();
      if (ctx.contoResta() > 0.005) male.push(i + ': paga tutto e resta ' + ctx.contoResta());
      if (c.paidPark < -0.005) male.push(i + ': cassa negativa');
      const m = ctx.minutiPagati(c);
      if (!num(m) || m < 0) male.push(i + ': minuti ' + m);
    } catch (e) { male.push(i + ': esplode → ' + e.message); }
  });
  ctx.settings.tariffs = vere;
  ok('dodici listini assurdi, nessun danno', male.slice(0, 6), []);
});

gruppo('Gli orari di confine: mezzanotte, ieri, l’anno prossimo', () => {
  const male = [];
  const quando = [
    0, 1, Date.now(), Date.now() + 86400000 * 400, Date.now() - 86400000 * 400,
    new Date(2026, 0, 1, 23, 55).getTime(),      // a cavallo di mezzanotte
    new Date(2026, 2, 29, 2, 30).getTime(),      // cambio dell'ora
    8640000000000000                              // il massimo che una data regge
  ];
  quando.forEach((t, i) => {
    try {
      const c = nuovoConto({ children: 2, durationMinutes: 90, startTime: t });
      ctx.bcSetQ('bimbi', 2);
      const fine = ctx.endTimeOf(c);
      if (!num(fine)) male.push(i + ': fine non calcolabile');
      else if (fine < t) male.push(i + ': finisce prima di cominciare');
      const d = ctx.dueOf(c);
      if (!num(d.total) || d.total < 0) male.push(i + ': dovuto ' + d.total);
      const scritta = ctx.fmtTime(t);
      if (typeof scritta !== 'string' || /NaN|undefined/.test(scritta)) male.push(i + ': orario scritto "' + scritta + '"');
    } catch (e) { male.push(i + ': esplode → ' + e.message); }
  });
  ok('otto orari di confine, nessuno rompe niente', male.slice(0, 5), []);
});

gruppo('La giornata finisce alle quattro del mattino', () => {
  /* Non a mezzanotte: il parco chiude tardi, e un gruppo entrato alle
     23:40 che esce all'una fa parte della SERATA DI IERI. Chi conta la
     cassa la conta a fine serata e vuole trovarci dentro tutta la
     serata. E' la regola che decide di che giorno e' ogni euro. */
  const g = (Y, M, D, h, m) => ctx.giornataDi(new Date(Y, M, D, h, m).getTime());
  ok('le 23:40 e l’1:00 dopo sono la stessa giornata',
     g(2026, 7, 10, 23, 40), g(2026, 7, 11, 1, 0));
  ok('e anche le 3:59', g(2026, 7, 10, 23, 40), g(2026, 7, 11, 3, 59));
  vero('ma le 4:01 no', g(2026, 7, 10, 23, 40) !== g(2026, 7, 11, 4, 1));
  ok('le 4:01 aprono la giornata nuova',
     g(2026, 7, 11, 4, 1), g(2026, 7, 11, 12, 0));
  const inizio = new Date(g(2026, 7, 11, 12, 0));
  ok('e una giornata comincia alle quattro in punto',
     [inizio.getHours(), inizio.getMinutes(), inizio.getSeconds()], [4, 0, 0]);
  /* due giornate di fila non si sovrappongono e non lasciano buchi */
  const uno = g(2026, 7, 11, 12, 0), due = g(2026, 7, 12, 12, 0);
  ok('due giornate di fila distano esattamente un giorno', due - uno, 24 * 3600 * 1000);
});

gruppo('Il registro della giornata conta quello che deve', () => {
  const oggi = ctx.giornataDi(Date.now());
  const dentro = oggi + 6 * 3600 * 1000;          // le dieci del mattino
  const fuori = oggi - 3 * 3600 * 1000;           // la giornata prima
  ctx.entries = [
    { id: 'a', status: 'closed', startTime: dentro, children: 2, crazyJumping: 1,
      durationMinutes: 60, barItems: [], paidLines: {}, paidAmt: { bimbi: 24, crazy: 4 },
      paidPark: 28, paidBar: 0, people: [] },
    { id: 'b', status: 'active', startTime: dentro, children: 1, crazyJumping: 0,
      durationMinutes: 60, barItems: [], paidLines: {}, paidAmt: {},
      paidPark: 0, paidBar: 0, people: [] },
    { id: 'c', status: 'closed', startTime: fuori, children: 5, crazyJumping: 0,
      durationMinutes: 60, barItems: [], paidLines: {}, paidAmt: { bimbi: 60 },
      paidPark: 60, paidBar: 0, people: [] }
  ];
  const r = ctx.contiGiornata(oggi);
  ok('conta solo i gruppi di oggi', r.gruppi, 2);
  ok('e i loro bambini', r.bambini, 3);
  ok('il tempo di parco incassato', r.parco, 24);
  ok('il Crazy incassato a parte', r.crazyEuro, 4);
  ok('l’incassato totale', r.incassato, 28);
  vero('e quello che manca e’ segnato', r.resta > 0);
  ok('una riga per gruppo', r.righe.length, 2);

  /* ELIMINARE UN INGRESSO LO TOGLIE DAI CONTI: e' tutto il punto del
     tasto elimina all'uscita. */
  ctx.entries = ctx.entries.filter(e => e.id !== 'a');
  const dopo = ctx.contiGiornata(oggi);
  ok('eliminato, il gruppo sparisce dal registro', dopo.gruppi, 1);
  ok('e i suoi soldi non ci sono piu’', dopo.incassato, 0);

  /* la giornata prima resta al suo posto */
  const ieri = ctx.contiGiornata(ctx.giornataDi(oggi - 1));
  ok('la giornata prima ha i suoi', ieri.gruppi, 1);
  ok('con i suoi soldi', ieri.incassato, 60);
  ctx.entries = [];
});

gruppo('Le statistiche dicono quello che si vede coi propri occhi', () => {
  /* Si costruisce una storia FINTA ma con dentro una verita' che si
     conosce -- il sabato tira il doppio, si entra alle 17, si beve
     soprattutto acqua -- e si controlla che le statistiche la trovino.
     E' l'unico modo di provare un grafico senza guardarlo. */
  const oggi = ctx.giornataDi(Date.now());
  const giorno = 24 * 3600 * 1000;
  const finte = [];
  for (let g = 0; g < 28; g++) {
    const inizio = ctx.giornataDi(oggi - g * giorno);
    const gs = new Date(inizio).getDay();
    const quanti = gs === 6 ? 8 : 2;              // il sabato tira
    for (let k = 0; k < quanti; k++) {
      const t = new Date(inizio);
      t.setHours(17, 5 + k, 0, 0);                // tutti alle 17
      finte.push({
        id: 'f' + g + '_' + k, createdAt: t.getTime(), startTime: t.getTime(), status: 'closed',
        durationMinutes: 60, baseMinutes: 60, payLater: false,
        children: 2, crazyJumping: g % 2 ? 1 : 0, people: [{ id: 'p', role: 'mamma', name: '', avatar: null }],
        barItems: [{ id: 'b1', name: 'Acqua', price: 1, qty: 3 }],
        paidLines: {}, paidAmt: { bimbi: 24, crazy: (g % 2 ? 4 : 0) },
        paidPark: 24 + (g % 2 ? 4 : 0), paidBar: 3,
        braceletColor: null, braceletCustom: true
      });
    }
  }
  ctx.entries = finte;
  const giorni = ctx.tutteLeGiornate();
  ok('trova tutte le giornate', giorni.length, 28);
  const st = ctx.statistiche(giorni);

  ok('conta tutti i gruppi', st.gruppi, finte.length);
  ok('e tutti i bambini', st.bambini, finte.length * 2);
  ok('e gli accompagnatori', st.persone, finte.length);

  /* il sabato: quattro volte i gruppi degli altri giorni */
  const GIORNI = st.settimana;
  const sab = GIORNI[6], lun = GIORNI[1];
  vero('il sabato ha piu’ gruppi a giornata', sab.gruppi / sab.giornate > lun.gruppi / lun.giornate);
  ok('il sabato ne ha quattro volte tanti', sab.gruppi / sab.giornate, lun.gruppi / lun.giornate * 4);

  /* l'ora di punta e' quella in cui sono entrati tutti */
  const punta = st.ore.indexOf(Math.max(...st.ore));
  ok('l’ora di punta e’ le cinque del pomeriggio', punta, 17);
  ok('e non ce n’e’ nessuna alle nove', st.ore[9], 0);

  /* il bar */
  ok('una sola bevanda nel listino delle statistiche', st.bevande.size, 1);
  ok('e i pezzi tornano', st.bevande.get('Acqua').pezzi, finte.length * 3);
  ok('anche in euro', st.bevande.get('Acqua').euro, finte.length * 3);

  /* le medie */
  ok('la durata media e’ un’ora', Math.round(st.minutiTotali / st.gruppi), 60);
  ok('meta’ dei gruppi prende il Crazy', st.conCrazy, finte.filter(f => f.crazyJumping).length);

  /* i giorni senza niente NON contano come giornate a zero: falserebbero
     tutte le medie */
  ctx.entries = finte.filter(f => new Date(f.startTime).getDay() === 6);
  const soloSabati = ctx.tutteLeGiornate();
  vero('senza gli altri giorni restano solo i sabati', soloSabati.length < 28);
  const st2 = ctx.statistiche(soloSabati);
  ok('e la media a giornata e’ quella dei sabati', st2.gruppi / st2.giornate, 8);
  ctx.entries = [];
});

gruppo('Il bracciale segue l’ora d’ingresso, non quella di adesso', () => {
  /* E' una cosa che gli sta a cuore: il colore lo si sceglie per
     l'ora in cui il bambino E' ENTRATO, se no all'uscita non torna. */
  const male = [];
  for (let n = 0; n < 200; n++) {
    const t = caso(86400000);
    const sl = ctx.braceletFor(t);
    if (sl && (!sl.color || typeof sl.color !== 'string')) male.push(n + ': fascia senza colore');
    /* la stessa ora deve dare sempre la stessa fascia */
    const sl2 = ctx.braceletFor(t);
    if (JSON.stringify(sl) !== JSON.stringify(sl2)) male.push(n + ': due risposte diverse per la stessa ora');
  }
  ok('duecento orari, il bracciale non tentenna', male.slice(0, 4), []);
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

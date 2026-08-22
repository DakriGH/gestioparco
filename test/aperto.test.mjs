/* ============================================================
   IL TEMPO APERTO, SOTTO TORCHIO

   «Il tempo aperto ha rotto un sacco di cose: crazy prima e dopo,
   gente che fa paga-dopo poi tempo aperto poi diversi giri, il tempo in
   eccesso che si resetta quando aggiungo i crazy — insomma è un
   macello.»

   Il tempo aperto e' l'unico prezzo che si muove DA SOLO, e questo lo
   rende diverso da tutto il resto dell'app: fra due misure il numero
   cambia senza che nessuno abbia toccato niente. Ogni cosa che lo
   incrocia -- i giri di Crazy, la pausa, il passaggio da comprato ad
   aperto e ritorno, i soldi gia' incassati -- e' un posto dove
   qualcosa puo' scollarsi.

   Qui non si prova UNA cosa: si prova che certe frasi restino vere
   qualunque cosa succeda prima. Sono cinque:

     1. un giro di Crazy alza il totale di ESATTAMENTE il suo prezzo,
        e non tocca mai il prezzo del parco;
     2. il tempo in pausa non si paga, e riprendendo si riparte da dove
        si era rimasti -- non da zero;
     3. accendere e spegnere il tempo aperto non crea ne' distrugge
        soldi: quello che era stato incassato resta incassato;
     4. il prezzo del parco a tempo aperto dipende SOLO da quanto sono
        stati dentro (meno l'omaggio e meno la pausa): non dai giri,
        non da quante volte si e' toccato l'interruttore;
     5. quello che si vede scritto e' quello che si paga.
   ============================================================ */
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
const uguale = (t, avuto, atteso) => prova(t, JSON.stringify(avuto) === JSON.stringify(atteso),
  'avuto ' + JSON.stringify(avuto) + '  atteso ' + JSON.stringify(atteso));

const r2 = v => Math.round(v * 100) / 100;
const PREZZO_GIRO = app.settings.crazyJumpingPrice;

/* ══════════════════════════════════════════════════════════
   L'OROLOGIO IN MANO

   Il prezzo del tempo aperto si misura sull'orologio, e finche'
   l'orologio e' quello vero ogni misura e' approssimata: fra la
   lettura del conto e quella del prezzo passano dei millesimi, e sui
   confini fra due fasce il numero salta. Mi e' gia' costato due prove
   che accusavano il codice di un salto deciso da loro.
   Qui l'orologio dell'app diventa nostro: si ferma dove vogliamo e lo
   si fa scorrere di quanto vogliamo. Cosi' «dopo venti minuti di pausa
   e altri dieci dentro il conto e' ESATTAMENTE questo» diventa una
   cosa che si puo' scrivere, invece di una che si spera.
   Si sostituisce `Date` nel mondo dell'app -- e' li' che `Date.now()`
   va a cercarlo -- lasciando intatto tutto il resto.
   ══════════════════════════════════════════════════════════ */
const VeraData = app.mondo.Date;
/* L'OROLOGIO E' FERMO DAVVERO, non «il vero piu' uno scarto».
   Con lo scarto il tempo continuava a scorrere sotto, e sui CONFINI
   bastava un millesimo per cambiare risposta: un gruppo entrato in
   questo istante a tempo aperto valeva zero alla prima lettura e il
   primo scaglione alla seconda, e la prova accusava il codice di un
   salto deciso dall'orologio. Fermo per davvero, due letture dello
   stesso istante danno lo stesso numero -- sempre. */
let orologio = 0;
function FintaData(...a) {
  return a.length ? new VeraData(...a) : new VeraData(orologio);
}
FintaData.now = () => orologio;
FintaData.parse = VeraData.parse;
FintaData.UTC = VeraData.UTC;
FintaData.prototype = VeraData.prototype;
app.mondo.Date = FintaData;
/* l'ora di partenza si ferma su un minuto tondo e lontano dal cambio
   giornata delle 4, cosi' due prove non cadono in due giornate diverse */
const PARTENZA = (() => {
  const d = new VeraData();
  d.setHours(15, 0, 0, 0);
  return d.getTime();
})();
const adesso = () => orologio;
const fermaOrologio = () => { orologio = PARTENZA; };
const avanza = min => { orologio += min * 60000; };
/* per le sere precise: si porta l'orologio a un istante e li' resta */
const orologioA = quando => { orologio = quando; };
fermaOrologio();

/* Un gruppo dentro da tot minuti. NIENTE DURATE TONDE: a tempo aperto
   il prezzo si misura sull'orologio, e chi e' dentro da 30′ esatti
   cade sul confine fra due fasce -- fra una misura e la successiva
   passa qualche millesimo e il numero salta. La prova accuserebbe il
   codice di un salto fatto da lei. */
function dentro(min, extra) {
  const t0 = adesso() - min * 60000;
  return app.normalizeEntries([Object.assign({
    id: 'a' + Math.random().toString(36).slice(2, 7),
    startTime: t0, createdAt: t0, oraManuale: true,
    children: 2, durationMinutes: 0, baseMinutes: 0, payLater: true
  }, extra || {})])[0];
}
const conto = e => { const k = app.costOf(e); return { parco: k.parkTotal, crazy: k.crazyCost, tot: app.dueOf(e).total }; };

/* i minuti su cui si misura: nessuno cade su una fascia del cartello
   ne' a meta' strada fra due, cosi' il confine non falsa la prova */
const MINUTI = [2, 7, 13, 23, 33, 43, 58, 72, 88, 97, 113, 137];

/* ─────────────────────────────────────────────────────────
   1. IL GIRO SI PAGA, SEMPRE
   ───────────────────────────────────────────────────────── */
gruppo('Un giro di Crazy alza il totale del suo prezzo, e non tocca il parco');
{
  const guai = [];
  MINUTI.forEach(min => {
    [0, 1, 2, 5].forEach(giri => {
      const senza = dentro(min);
      const con = dentro(min);
      app.PAN.conto = con; app.PAN.ingresso = null;
      app.metteCrazy(con, giri);
      const a = conto(senza), b = conto(con);
      if (a.parco !== b.parco) guai.push('dentro da ' + min + '′ con ' + giri + ' giri: il parco passa da ' + a.parco + ' a ' + b.parco);
      if (r2(b.tot - a.tot) !== r2(giri * PREZZO_GIRO)) {
        guai.push('dentro da ' + min + '′ con ' + giri + ' giri: il totale sale di ' + r2(b.tot - a.tot) + ' invece di ' + r2(giri * PREZZO_GIRO));
      }
    });
  });
  prova('per dodici durate e quattro conteggi di giri', !guai.length, guai.slice(0, 3).join('\n        '));
}

gruppo('I giri messi PRIMA e messi DOPO danno lo stesso conto');
{
  /* «crazy prima dopo»: chi salta e poi si ferma al parco, e chi si
     ferma al parco e poi salta, alla cassa devono pagare uguale */
  const guai = [];
  MINUTI.forEach(min => {
    const prima = dentro(min);
    app.PAN.conto = prima; app.PAN.ingresso = null;
    app.metteCrazy(prima, 2);
    prima.payLater = true;

    const dopo = dentro(min);
    app.PAN.conto = dopo; app.PAN.ingresso = null;
    dopo.payLater = true;
    app.metteCrazy(dopo, 2);

    const a = conto(prima), b = conto(dopo);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      guai.push('dentro da ' + min + '′: prima ' + JSON.stringify(a) + ' dopo ' + JSON.stringify(b));
    }
  });
  prova('lo stesso conto in tutte e dodici le durate', !guai.length, guai.slice(0, 2).join('\n        '));
}

/* ─────────────────────────────────────────────────────────
   2. LA PAUSA
   ───────────────────────────────────────────────────────── */
gruppo('Il tempo in pausa non si paga');
{
  /* IL TEMPO SI FA PASSARE COL SECONDO ARGOMENTO di `contiAperto`, non
     spostando i campi a mano. Spostare indietro `pausaDa` senza
     spostare anche l'orologio costruisce uno stato che non puo'
     esistere -- fermi da mezz'ora dopo essere entrati da dieci minuti
     -- e la prova finisce per accusare il codice di un guaio suo. */
  const c = dentro(43);
  const primaDellaPausa = app.contiAperto(c).contati;
  prova('prima della pausa si contano i minuti passati', Math.abs(primaDellaPausa - 43) < 0.2,
    'contati ' + primaDellaPausa.toFixed(2));

  app.commutaPausa(c);
  prova('e da fermo risulta in pausa', app.contiAperto(c).inPausa);
  const fermo1 = app.contiAperto(c).contati;
  const fermo2 = app.contiAperto(c, adesso() + 30 * 60000).contati;
  prova('e mezz’ora di orologio, da fermi, non aggiunge niente al conto',
    Math.abs(fermo2 - fermo1) < 0.2, fermo1.toFixed(2) + ' poi ' + fermo2.toFixed(2));
  prova('  e nemmeno tre ore', Math.abs(app.contiAperto(c, adesso() + 180 * 60000).contati - fermo1) < 0.2);

  /* ora la scena vera: entrati da 73′, fermi da 30′, si riprende */
  const d = dentro(73);
  d.pausaDa = adesso() - 30 * 60000;
  prova('da fermi si conta il tempo che avevano quando si sono fermati',
    Math.abs(app.contiAperto(d).contati - 43) < 0.2,
    'contati ' + app.contiAperto(d).contati.toFixed(2) + ' invece di 43');
  app.commutaPausa(d);
  prova('riprendendo non e’ piu’ in pausa', !app.contiAperto(d).inPausa);
  prova('e si riparte da dove si era rimasti, non da zero',
    Math.abs(app.contiAperto(d).contati - 43) < 0.2,
    'contati ' + app.contiAperto(d).contati.toFixed(2) + ' invece di 43');
  prova('e da li’ l’orologio ricomincia a correre',
    Math.abs(app.contiAperto(d, adesso() + 10 * 60000).contati - 53) < 0.2,
    'dopo dieci minuti: ' + app.contiAperto(d, adesso() + 10 * 60000).contati.toFixed(2));
  prova('il tempo fermo resta scritto', app.num(d.pausato, 0) >= 30 * 60000 - 1000,
    'pausato ' + Math.round(app.num(d.pausato, 0) / 60000) + '′');
  prova('e l’orologio della pausa e’ spento', !app.num(d.pausaDa, 0));
}

gruppo('La pausa regge le sequenze storte');
{
  /* fermare due volte di fila, riprendere due volte di fila, fermare
     un conto appena creato: al banco succede tutto */
  const c = dentro(23);
  app.commutaPausa(c); const uno = app.num(c.pausaDa, 0);
  app.commutaPausa(c); app.commutaPausa(c);
  prova('fermare due volte non azzera il tempo gia’ fermo', app.num(c.pausato, 0) >= 0 && !!app.num(c.pausaDa, 0));
  prova('e il secondo stop non sposta il primo all’indietro', app.num(c.pausaDa, 0) >= uno);

  const d = dentro(23);
  app.chiudiPausa(d);
  prova('chiudere una pausa che non c’e’ non fa niente',
    !app.num(d.pausaDa, 0) && !app.num(d.pausato, 0));

  /* e un conto in pausa che viene riletto dal disco resta in pausa */
  const e = dentro(43);
  app.commutaPausa(e);
  const riletto = app.normalizeEntries([JSON.parse(JSON.stringify(e))])[0];
  prova('una pausa sopravvive al salvataggio', app.contiAperto(riletto).inPausa);
  prova('e il conto non cambia rileggendolo',
    Math.abs(app.contiAperto(riletto).contati - app.contiAperto(e).contati) < 0.2);

  /* un ingresso GIA' USCITO non puo' restare col cronometro fermo */
  const f = dentro(43);
  app.commutaPausa(f);
  f.status = 'closed'; f.closedAt = adesso();
  const chiuso = app.normalizeEntries([JSON.parse(JSON.stringify(f))])[0];
  prova('un ingresso uscito non resta col cronometro acceso', !app.num(chiuso.pausaDa, 0));
  const ancora = app.normalizeEntries([JSON.parse(JSON.stringify(chiuso))])[0];
  uguale('e rileggerlo due volte da’ sempre lo stesso numero',
    app.num(ancora.pausato, 0), app.num(chiuso.pausato, 0));
}

gruppo('In pausa un giro di Crazy si paga lo stesso');
{
  /* la pausa ferma il PARCO, non il resto: se salgono mentre
     l'orologio e' fermo, il giro si paga */
  const c = dentro(43);
  app.PAN.conto = c; app.PAN.ingresso = null;
  app.commutaPausa(c);
  const prima = conto(c);
  app.metteCrazy(c, 1);
  const dopo = conto(c);
  uguale('il parco resta fermo', dopo.parco, prima.parco);
  uguale('e il giro si paga', r2(dopo.tot - prima.tot), PREZZO_GIRO);
}

/* ─────────────────────────────────────────────────────────
   3. AVANTI E INDIETRO FRA COMPRATO E APERTO
   ───────────────────────────────────────────────────────── */
gruppo('Accendere e spegnere il tempo aperto non crea ne’ distrugge soldi');
{
  const guai = [];
  MINUTI.forEach(min => {
    const c = app.normalizeEntries([{
      id: 'x', startTime: adesso() - min * 60000, createdAt: adesso() - min * 60000,
      oraManuale: true, children: 2, durationMinutes: 30, baseMinutes: 30
    }])[0];
    app.PAN.conto = c; app.PAN.ingresso = null;
    const compratoPrima = conto(c);
    /* dieci giri di interruttore, coi giri di Crazy in mezzo */
    for (let i = 0; i < 10; i++) {
      c.payLater = !c.payLater;
      if (i === 3) app.metteCrazy(c, 2);
      if (i === 6) app.commutaPausa(c);
      if (i === 8) app.chiudiPausa(c);
      const k = app.costOf(c), d = app.dueOf(c);
      if (!Number.isFinite(k.parkTotal) || k.parkTotal < 0) guai.push('dentro da ' + min + '′, giro ' + i + ': parco ' + k.parkTotal);
      if (!Number.isFinite(d.total) || d.total < 0) guai.push('dentro da ' + min + '′, giro ' + i + ': dovuto ' + d.total);
    }
    /* si torna a tempo comprato: la durata comprata non e' cambiata */
    c.payLater = false;
    app.metteCrazy(c, 0);
    app.chiudiPausa(c);
    c.pausato = 0;
    const compratoDopo = conto(c);
    if (compratoDopo.parco !== compratoPrima.parco) {
      guai.push('dentro da ' + min + '′: tornando a tempo comprato il parco passa da ' +
        compratoPrima.parco + ' a ' + compratoDopo.parco);
    }
  });
  prova('dodici durate, dieci interruttori ciascuna', !guai.length, guai.slice(0, 3).join('\n        '));
}

gruppo('I soldi gia’ incassati restano incassati');
{
  const c = dentro(43);
  app.PAN.conto = c; app.PAN.ingresso = null;
  app.metteCrazy(c, 1);
  app.pagaTutto();
  const incassato = r2(app.num(c.paidPark, 0) + app.num(c.paidBar, 0));
  prova('pagando tutto non resta niente da pagare', app.dueOf(c).total === 0, 'restano ' + app.dueOf(c).total);
  for (let i = 0; i < 6; i++) c.payLater = !c.payLater;
  uguale('e sei giri di interruttore non toccano l’incassato',
    r2(app.num(c.paidPark, 0) + app.num(c.paidBar, 0)), incassato);
  prova('e non compare un avanzo dal nulla', app.dueOf(c).avanzo >= 0);
}

/* ─────────────────────────────────────────────────────────
   4. IL PREZZO DIPENDE SOLO DAL TEMPO
   ───────────────────────────────────────────────────────── */
gruppo('A tempo aperto il parco dipende solo da quanto sono stati dentro');
{
  const guai = [];
  MINUTI.forEach(min => {
    const nudo = dentro(min);
    const atteso = app.costOf(nudo).parkTotal;
    /* le stesse persone, lo stesso tempo, storie diverse */
    const storie = [
      c => { app.metteCrazy(c, 3); },
      c => { app.metteCrazy(c, 1); c.payLater = false; c.payLater = true; },
      c => { c.aggiunte = [15, 30]; c.durationMinutes = 45; },
      c => { app.commutaPausa(c); app.chiudiPausa(c); },
      c => { app.metteCrazy(c, 2); c.durationMinutes = 90; c.baseMinutes = 90; }
    ];
    storie.forEach((f, i) => {
      const c = dentro(min);
      app.PAN.conto = c; app.PAN.ingresso = null;
      f(c);
      c.payLater = true;
      const avuto = app.costOf(c).parkTotal;
      if (avuto !== atteso) guai.push('dentro da ' + min + '′, storia ' + i + ': parco ' + avuto + ' invece di ' + atteso);
    });
  });
  prova('dodici durate per cinque storie diverse', !guai.length, guai.slice(0, 3).join('\n        '));
}

gruppo('La fascia e’ quella piu’ vicina, e i primi dieci minuti costano il primo scaglione');
{
  const f = m => app.fasciaSotto(m);
  uguale('trentuno minuti stanno nella mezz’ora', f(31).m, 30);
  uguale('e anche trentotto', f(38).m, 30);
  uguale('quaranta tondi passa ai quaranta', f(40).m, 40);
  uguale('quarantatre’ resta ai quaranta', f(43).m, 40);
  uguale('quarantanove pure', f(49).m, 40);
  uguale('un minuto sta nel primo scaglione', f(1).m, 10);
  uguale('e costa il primo scaglione', f(1).p, app.settings.tariffs[0].p);

  /* E IL CONTO DEL GRUPPO LO SEGUE.
     Qui NON si misura un gruppo fermo a trentacinque minuti, che e'
     esattamente il punto di parita' fra trenta e quaranta: la riga
     sopra ci controlla la regola con un numero fisso, ma un gruppo VERO
     e' dentro da 35 minuti e qualche microsecondo, e fra la lettura del
     conto e quella del prezzo l'orologio si sposta. La prova
     accuserebbe il codice di un salto deciso da quanto e' veloce la
     macchina. Le durate qui stanno lontane dai punti di parita'. */
  const guai = [];
  [31, 33, 38, 43, 58, 72].forEach(min => {
    const c = dentro(min);
    const atteso = r2(app.fasciaSotto(app.contiAperto(c).contati).p * 2);
    if (app.costOf(c).parkTotal !== atteso) {
      guai.push('dentro da ' + min + '′: ' + app.costOf(c).parkTotal + ' invece di ' + atteso);
    }
  });
  prova('e il conto del gruppo segue la stessa fascia', !guai.length, guai.join('\n        '));
}

/* ─────────────────────────────────────────────────────────
   5. QUELLO CHE SI VEDE E' QUELLO CHE SI PAGA
   ───────────────────────────────────────────────────────── */
gruppo('La riga che spiega il conto dice gli stessi numeri del conto');
{
  const guai = [];
  MINUTI.forEach(min => {
    [0, 2].forEach(giri => {
      [false, true].forEach(inPausa => {
        const c = dentro(min);
        app.PAN.conto = c; app.PAN.ingresso = null;
        if (giri) app.metteCrazy(c, giri);
        if (inPausa) app.commutaPausa(c);
        const a = app.contiAperto(c);
        /* il prezzo della riga e' quello che finisce sul conto */
        if (r2(a.prezzo * c.children) !== app.costOf(c).parkTotal) {
          guai.push('dentro da ' + min + '′/' + giri + ' giri: la riga dice ' + r2(a.prezzo * c.children) +
            ' e il conto ' + app.costOf(c).parkTotal);
        }
        /* e la fascia scritta e' una del cartello */
        if (a.contati > 0 && !app.settings.tariffs.some(t => t.m === a.scaglione)) {
          guai.push('dentro da ' + min + '′: fascia ' + a.scaglione + ' non e sul cartello');
        }
        const riga = app.spiegaAperto(c, false);
        if (typeof riga !== 'string' || !riga) guai.push('dentro da ' + min + '′: riga vuota');
      });
    });
  });
  prova('dodici durate per giri e pausa', !guai.length, guai.slice(0, 3).join('\n        '));
}

/* ─────────────────────────────────────────────────────────
   6. IL PESTAGGIO: sequenze a caso, e le garanzie devono reggere
   ───────────────────────────────────────────────────────── */
gruppo('Mille sequenze a caso attorno al tempo aperto');
{
  let seme = 20260816;
  const caso = k => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % k; };
  const barIds = app.settings.barMenu.slice(0, 3).map(v => v.id);
  const MOSSE = ['apri', 'chiudi', 'giro', 'togliGiro', 'pausa', 'riprendi', 'piu5', 'meno5',
    'bimbi', 'bar', 'paga', 'pagaTutto', 'blocco'];
  const guai = [];

  for (let g = 0; g < 1000 && !guai.length; g++) {
    app.settings.tariffaSuTotale = caso(2) === 0;
    const c = dentro(MINUTI[caso(MINUTI.length)], {
      durationMinutes: caso(2) ? 0 : 30, baseMinutes: caso(2) ? 0 : 30,
      payLater: caso(2) === 0
    });
    app.PAN.conto = c; app.PAN.ingresso = null;
    const fatte = [];
    for (let k = 0; k < 12; k++) {
      const m = MOSSE[caso(MOSSE.length)];
      fatte.push(m);
      const dove = ' [' + fatte.join('>') + ']';
      try {
        if (m === 'apri') { c.payLater = true; }
        else if (m === 'chiudi') { c.payLater = false; app.chiudiPausa(c); }
        else if (m === 'giro') app.contaSalita(1);
        else if (m === 'togliGiro') app.metteCrazy(c, Math.max(0, app.num(c.crazyJumping, 0) - 1));
        else if (m === 'pausa') { if (!app.num(c.pausaDa, 0)) app.commutaPausa(c); }
        else if (m === 'riprendi') app.chiudiPausa(c);
        else if (m === 'piu5') app.ritoccaTempo(c, 5);
        else if (m === 'meno5') app.ritoccaTempo(c, -5);
        else if (m === 'bimbi') app.bcSetQ('bimbi', caso(5));
        else if (m === 'bar') app.bcSetQ(barIds[caso(barIds.length)], caso(4));
        else if (m === 'paga') app.segnaPagate(caso(2) ? 'bimbi' : 'crazy', caso(4));
        else if (m === 'pagaTutto') app.pagaTutto();
        else if (m === 'blocco') { if (!c.payLater) app.vendiBlocco(c, [15, 30][caso(2)]); }
      } catch (e) { guai.push('esplode su ' + m + dove + ': ' + e.message); break; }

      const k2 = app.costOf(c), d = app.dueOf(c);
      if (!Number.isFinite(k2.parkTotal) || k2.parkTotal < 0) guai.push('parco ' + k2.parkTotal + dove);
      if (!Number.isFinite(k2.crazyCost) || k2.crazyCost < 0) guai.push('crazy ' + k2.crazyCost + dove);
      if (!Number.isFinite(d.total) || d.total < 0) guai.push('dovuto ' + d.total + dove);
      /* la pausa non puo' far tornare indietro l'orologio */
      const a = app.contiAperto(c);
      if (a.contati < 0) guai.push('minuti contati negativi' + dove);
      if (a.contati > a.daParco + 0.001) guai.push('contati piu di quanto siano stati dentro' + dove);
      /* i soldi restano in bolla */
      const amt = c.paidAmt || {};
      const sp = r2((+amt.bimbi || 0) + (+amt.crazy || 0));
      if (Math.abs(sp - (+c.paidPark || 0)) > 0.005) guai.push('righe parco ' + sp + ' vs ' + c.paidPark + dove);
      /* e un giro in piu' non puo' abbassare il parco */
      const parcoOra = k2.parkTotal;
      const conUnGiro = app.normalizeEntries([JSON.parse(JSON.stringify(c))])[0];
      app.PAN.conto = conUnGiro;
      app.metteCrazy(conUnGiro, app.num(c.crazyJumping, 0) + 1);
      if (app.costOf(conUnGiro).parkTotal < parcoOra - 0.005) {
        guai.push('un giro in piu abbassa il parco: ' + parcoOra + ' -> ' + app.costOf(conUnGiro).parkTotal + dove);
      }
      app.PAN.conto = c;
      if (guai.length) break;
    }
  }
  prova('nessuna garanzia salta', !guai.length, guai.slice(0, 3).join('\n        '));
}

/* ═════════════════════════════════════════════════════════
   IL CARTELLO, SCRITTO A MANO

   Da qui in giu' i prezzi attesi NON si chiedono all'app: si ricavano
   dal cartello ricopiato qui sotto e dalla regola detta a parole. Se
   l'app e questa copia dicono numeri diversi, uno dei due sbaglia, ed
   e' esattamente quello che si vuole sapere.
   ═════════════════════════════════════════════════════════ */
const CARTELLO = [[10, 3], [15, 4.5], [20, 6], [30, 7], [40, 10], [50, 12], [60, 12],
  [70, 15], [80, 16.5], [90, 19], [100, 22], [110, 24], [120, 24]];

gruppo('Il cartello di prova e lo stesso dell’app');
{
  uguale('le fasce e i prezzi combaciano',
    app.settings.tariffs.map(t => [t.m, t.p]), CARTELLO);
}

/* LA FASCIA GIA' PASSATA, cioe' quella SOTTO: la regola detta a
   parole, riscritta senza guardare come l'ha scritta l'app.
   Trentotto minuti sono mezz'ora passata, non quaranta minuti. Chi e'
   dentro paga almeno il primo scaglione: sotto quello non si scende. */
function passata(min) {
  if (min <= 0) return null;
  let b = CARTELLO[0];
  for (const t of CARTELLO) if (t[0] <= min) b = t;
  return b;
}
/* e la fascia SOPRA, che e' quella del tempo comprato: hai comprato
   quella durata e paghi lo scaglione che la contiene */
function sopra(min) {
  if (min <= 0) return null;
  for (const t of CARTELLO) if (min <= t[0]) return t;
  return CARTELLO[CARTELLO.length - 1];
}
const su5 = m => Math.ceil(m / 5) * 5;
const parcoAperto = (min, bimbi) => r2((passata(min) ? passata(min)[1] : 0) * bimbi);
const parcoComprato = (min, bimbi) => r2((sopra(su5(min)) ? sopra(su5(min))[1] : 0) * bimbi);

/* ─────────────────────────────────────────────────────────
   LA GIORNATA INTERA DI UN GRUPPO, minuto per minuto
   ───────────────────────────────────────────────────────── */
gruppo('Una serata vera: tempo aperto, pausa, giri, tempo comprato — coi numeri esatti');
{
  fermaOrologio();
  const c = dentro(0);              // due bambini, tempo aperto, appena entrati
  app.PAN.conto = c; app.PAN.ingresso = null;
  const guai = [];
  const passo = (che, minAttesi, parcoAtteso, crazyAtteso) => {
    const a = app.contiAperto(c), k = app.costOf(c);
    const dett = [];
    if (Math.abs(a.contati - minAttesi) > 0.001) dett.push('minuti contati ' + a.contati.toFixed(2) + ' invece di ' + minAttesi);
    if (k.parkTotal !== parcoAtteso) dett.push('parco ' + k.parkTotal + ' invece di ' + parcoAtteso);
    if (k.crazyCost !== crazyAtteso) dett.push('crazy ' + k.crazyCost + ' invece di ' + crazyAtteso);
    const attesoTot = r2(parcoAtteso + crazyAtteso);
    if (app.dueOf(c).total !== attesoTot) dett.push('totale ' + app.dueOf(c).total + ' invece di ' + attesoTot);
    if (dett.length) guai.push(che + ': ' + dett.join(', '));
  };

  avanza(20);
  passo('dopo venti minuti', 20, parcoAperto(20, 2), 0);

  app.commutaPausa(c); avanza(30);
  passo('mezz’ora di pausa: il conto non si muove', 20, parcoAperto(20, 2), 0);

  app.commutaPausa(c); avanza(10);
  passo('ripreso, altri dieci minuti', 30, parcoAperto(30, 2), 0);

  app.contaSalita(1);
  passo('un giro di Crazy: il parco non si tocca', 30, parcoAperto(30, 2), PREZZO_GIRO);

  app.contaSalita(1); app.contaSalita(1);
  passo('altri due giri', 30, parcoAperto(30, 2), r2(3 * PREZZO_GIRO));

  app.metteCrazy(c, 1);
  passo('tolti due giri, ne resta uno', 30, parcoAperto(30, 2), PREZZO_GIRO);

  avanza(13);
  passo('altri tredici minuti dentro', 43, parcoAperto(43, 2), PREZZO_GIRO);

  app.commutaPausa(c); avanza(45); app.commutaPausa(c);
  passo('tre quarti d’ora di pausa non si pagano', 43, parcoAperto(43, 2), PREZZO_GIRO);

  app.bcSetQ('bimbi', 3);
  passo('arriva un terzo bambino', 43, parcoAperto(43, 3), PREZZO_GIRO);

  prova('ogni passo della serata torna', !guai.length, guai.join('\n        '));

  /* e adesso si chiude: da tempo aperto a tempo comprato */
  c.payLater = false;
  app.chiudiPausa(c);
  c.durationMinutes = 60; c.baseMinutes = 60; delete c.aggiunte;
  uguale('passando a un’ora comprata si paga l’ora', app.costOf(c).parkTotal, parcoComprato(60, 3));
  uguale('e il giro resta il suo', app.costOf(c).crazyCost, PREZZO_GIRO);
  /* l'ora d'uscita: l'inizio del parco piu' il tempo comprato piu' i
     minuti regalati dai giri */
  const atteso = app.inizioParco(c) + (60 + app.minutiCrazy(c)) * 60000;
  uguale('e l’ora d’uscita comprende i minuti regalati',
    Math.max(atteso, app.num(c.regaloFinoA, 0)), app.endTimeOf(c));
}

/* ─────────────────────────────────────────────────────────
   AGGIUNGERE E TOGLIERE TEMPO
   ───────────────────────────────────────────────────────── */
gruppo('Il piu’ e il meno del tempo tornano sempre al punto di partenza');
{
  fermaOrologio();
  const guai = [];
  /* I BLOCCHI GIA' VENDUTI SONO IL POSTO DOVE QUESTO SI ROMPE.
     Un ritocco deve entrare nell'ULTIMA vendita, non aprirne una nuova:
     un'ora con dentro una mezz'ora venduta a parte, riportata a
     mezz'ora col meno, costava diciotto euro invece di quattordici.
     Senza blocchi venduti il piu' e il meno tornano anche sbagliati, e
     la prova non se ne accorge. */
  [15, 30, 45, 60, 90, 120].forEach(dur => {
    [0, 1, 3].forEach(giri => {
      [true, false].forEach(scaglioni => {
        [[], [15], [15, 30]].forEach(blocchi => {
          app.settings.tariffaSuTotale = !scaglioni;
          const c = dentro(10, { durationMinutes: dur, baseMinutes: dur, payLater: false });
          app.PAN.conto = c; app.PAN.ingresso = null;
          if (giri) app.metteCrazy(c, giri);
          blocchi.forEach(b => app.vendiBlocco(c, b));
          const prima = { min: c.durationMinutes, parco: app.costOf(c).parkTotal,
            fine: app.endTimeOf(c), vendite: (app.lista(c.aggiunte) || []).join('+') };
          app.ritoccaTempo(c, 5);
          const cresciuto = app.costOf(c).parkTotal;
          app.ritoccaTempo(c, -5);
          const dopo = { min: c.durationMinutes, parco: app.costOf(c).parkTotal,
            fine: app.endTimeOf(c), vendite: (app.lista(c.aggiunte) || []).join('+') };
          const dove = dur + '′/' + giri + ' giri/' + (scaglioni ? 'scaglioni' : 'totale') +
            (blocchi.length ? '/venduti ' + blocchi.join('+') : '/senza vendite');
          if (JSON.stringify(prima) !== JSON.stringify(dopo)) {
            guai.push(dove + ': +5 e −5 non tornano — ' + JSON.stringify(prima) + ' vs ' + JSON.stringify(dopo));
          }
          if (cresciuto < prima.parco) guai.push(dove + ': allungando il prezzo SCENDE (' + prima.parco + ' → ' + cresciuto + ')');
        });
      });
    });
  });
  app.settings.tariffaSuTotale = true;
  prova('sei durate per tre conteggi di giri, con tutte e due le tariffe', !guai.length, guai.slice(0, 3).join('\n        '));
}

gruppo('Allungare non abbassa mai, accorciare non alza mai');
{
  fermaOrologio();
  const guai = [];
  [true, false].forEach(scaglioni => {
    app.settings.tariffaSuTotale = !scaglioni;
    [0, 2].forEach(giri => {
      const c = dentro(5, { durationMinutes: 15, baseMinutes: 15, payLater: false });
      app.PAN.conto = c; app.PAN.ingresso = null;
      if (giri) app.metteCrazy(c, giri);
      let prezzo = app.costOf(c).parkTotal, fine = app.endTimeOf(c);
      /* si sale di cinque in cinque fino a due ore e mezza */
      for (let i = 0; i < 27; i++) {
        app.ritoccaTempo(c, 5);
        const p2 = app.costOf(c).parkTotal, f2 = app.endTimeOf(c);
        if (p2 < prezzo - 0.005) guai.push('salendo a ' + c.durationMinutes + '′ il prezzo scende: ' + prezzo + ' → ' + p2);
        if (f2 < fine) guai.push('salendo a ' + c.durationMinutes + '′ l’uscita torna indietro');
        prezzo = p2; fine = f2;
      }
      /* e si riscende */
      for (let i = 0; i < 27; i++) {
        app.ritoccaTempo(c, -5);
        const p2 = app.costOf(c).parkTotal, f2 = app.endTimeOf(c);
        if (p2 > prezzo + 0.005) guai.push('scendendo a ' + c.durationMinutes + '′ il prezzo sale: ' + prezzo + ' → ' + p2);
        if (f2 > fine) guai.push('scendendo a ' + c.durationMinutes + '′ l’uscita va avanti');
        prezzo = p2; fine = f2;
      }
    });
  });
  app.settings.tariffaSuTotale = true;
  prova('cinquantaquattro passi in salita e in discesa, per quattro casi', !guai.length, guai.slice(0, 3).join('\n        '));
}

/* ─────────────────────────────────────────────────────────
   IL PAGA-DOPO DI UN TEMPO APERTO
   ───────────────────────────────────────────────────────── */
gruppo('Si paga a tempo aperto, poi il tempo continua a correre');
{
  fermaOrologio();
  const c = dentro(20);
  app.PAN.conto = c; app.PAN.ingresso = null;
  app.contaSalita(1);
  uguale('il conto di adesso', app.dueOf(c).total, r2(parcoAperto(20, 2) + PREZZO_GIRO));
  app.pagaTutto();
  uguale('pagando tutto non resta niente', app.dueOf(c).total, 0);
  const incassato = r2(app.num(c.paidPark, 0) + app.num(c.paidBar, 0));

  avanza(23);
  /* NON E' UN GUASTO: a tempo aperto si paga il tempo passato, e il
     tempo continua a passare. Quello che era stato incassato resta, e
     torna dovuta solo la differenza. */
  const dovuto = r2(parcoAperto(43, 2) + PREZZO_GIRO - incassato);
  uguale('dopo altri ventitre minuti torna dovuta la differenza', app.dueOf(c).total, dovuto);
  uguale('e l’incassato di prima non si e mosso',
    r2(app.num(c.paidPark, 0) + app.num(c.paidBar, 0)), incassato);

  app.commutaPausa(c); avanza(60); app.commutaPausa(c);
  uguale('un’ora di pausa non aggiunge un euro', app.dueOf(c).total, dovuto);

  app.pagaTutto();
  uguale('e si salda di nuovo', app.dueOf(c).total, 0);
  app.contaSalita(1);
  uguale('un giro dopo il saldo torna dovuto il giro', app.dueOf(c).total, PREZZO_GIRO);
}

/* ─────────────────────────────────────────────────────────
   TUTTE LE SEQUENZE, NON UN CAMPIONE
   ───────────────────────────────────────────────────────── */
gruppo('Tutte le sequenze di quattro mosse, su quattro partenze diverse');
{
  fermaOrologio();
  const MOSSE = [
    ['apri', c => { c.payLater = true; }],
    ['chiudi', c => { c.payLater = false; app.chiudiPausa(c); }],
    ['pausa', c => { if (!app.num(c.pausaDa, 0)) app.commutaPausa(c); }],
    ['riprendi', c => app.chiudiPausa(c)],
    ['piuGiro', () => app.contaSalita(1)],
    ['menoGiro', c => app.metteCrazy(c, Math.max(0, app.num(c.crazyJumping, 0) - 1))],
    ['piu5', c => app.ritoccaTempo(c, 5)],
    ['meno5', c => app.ritoccaTempo(c, -5)]
  ];
  const PARTENZE = [
    ['appena entrati, tempo aperto', { durationMinutes: 0, baseMinutes: 0, payLater: true }, 3],
    ['dentro da un pezzo, tempo aperto', { durationMinutes: 0, baseMinutes: 0, payLater: true }, 43],
    ['mezz’ora comprata', { durationMinutes: 30, baseMinutes: 30, payLater: false }, 12],
    ['un’ora comprata e gia scaduta', { durationMinutes: 60, baseMinutes: 60, payLater: false }, 78]
  ];
  const guai = [];
  let quante = 0;

  PARTENZE.forEach(([nome, extra, min]) => {
    for (let a = 0; a < MOSSE.length; a++)
      for (let b = 0; b < MOSSE.length; b++)
        for (let d = 0; d < MOSSE.length; d++)
          for (let e = 0; e < MOSSE.length; e++) {
            if (guai.length > 2) return;
            quante++;
            const c = dentro(min, Object.assign({}, extra));
            app.PAN.conto = c; app.PAN.ingresso = null;
            const fatte = [];
            [a, b, d, e].forEach(i => {
              fatte.push(MOSSE[i][0]);
              const dove = nome + ' [' + fatte.join('>') + ']';
              try { MOSSE[i][1](c); } catch (err) { guai.push('esplode: ' + dove + ' — ' + err.message); return; }

              const k = app.costOf(c), du = app.dueOf(c), ap = app.contiAperto(c);
              /* i numeri devono essere numeri */
              if (!Number.isFinite(k.parkTotal) || k.parkTotal < 0) guai.push('parco ' + k.parkTotal + ' — ' + dove);
              if (!Number.isFinite(k.crazyCost) || k.crazyCost < 0) guai.push('crazy ' + k.crazyCost + ' — ' + dove);
              if (!Number.isFinite(du.total) || du.total < 0) guai.push('dovuto ' + du.total + ' — ' + dove);
              /* i tempi */
              if (!Number.isFinite(app.endTimeOf(c))) guai.push('uscita storta — ' + dove);
              if (app.endTimeOf(c) < c.startTime) guai.push('esce prima di entrare — ' + dove);
              if (app.inizioParco(c) < c.startTime - 1) guai.push('il parco comincia prima dell’ingresso — ' + dove);
              if (ap.contati < 0) guai.push('minuti contati negativi — ' + dove);
              if (ap.contati > ap.daParco + 0.001) guai.push('contati piu di quanto siano stati dentro — ' + dove);
              if (app.num(c.pausato, 0) < 0) guai.push('tempo in pausa negativo — ' + dove);
              /* IL PREZZO E' QUELLO DEL CARTELLO, ricavato qui e non
                 chiesto all'app */
              if (c.payLater) {
                const atteso = parcoAperto(ap.contati, c.children);
                if (k.parkTotal !== atteso) guai.push('parco ' + k.parkTotal + ' invece di ' + atteso + ' — ' + dove);
              }
              /* e il Crazy si paga sempre a parte, per intero */
              const attesoCrazy = r2(app.num(c.crazyJumping, 0) * PREZZO_GIRO);
              if (k.crazyCost !== attesoCrazy) guai.push('crazy ' + k.crazyCost + ' invece di ' + attesoCrazy + ' — ' + dove);
              /* rileggendolo dal disco non deve cambiare niente */
              const ri = app.normalizeEntries([JSON.parse(JSON.stringify(c))])[0];
              if (app.endTimeOf(ri) !== app.endTimeOf(c)) guai.push('rileggendolo cambia l’uscita — ' + dove);
              if (app.costOf(ri).parkTotal !== k.parkTotal) guai.push('rileggendolo cambia il prezzo — ' + dove);
            });
          }
  });
  prova(quante + ' sequenze provate, nessuna garanzia salta', !guai.length, guai.slice(0, 3).join('\n        '));
}

gruppo('Salta prima, compra il tempo dopo: il parco parte da adesso');
{
  /* SEGNALATO AL BANCO: «prendo dei crazy e dopo faccio partire il
     tempo, ma il tempo dei crazy o il tempo di debito rosso non si
     resetta, e il calcolo dei costi viene sballato».
     E' la sequenza piu' comune del parco: arrivano per saltare, si
     divertono, e dopo mezz'ora decidono di fermarsi. Quel tempo di
     parco comincia ADESSO -- non dall'ora in cui sono arrivati -- se no
     la mezz'ora venduta nasce gia' quasi finita e la scheda resta
     rossa. */
  const strade = [
    ['col ritocco del tempo', (c) => app.ritoccaTempo(c, 30)],
    ['vendendo un blocco (⏩ Estendi)', (c) => app.vendiBlocco(c, 30)],
    ['col taglio rapido, come fa il pannello', (c) => {
      const m = app.clamp(app.num(c.durationMinutes, 0), 0, 99999);
      app.segnaInizioParco(c, m, 30);
      c.durationMinutes = 30;
      delete c.aggiunte;
    }]
  ];
  const guai = [];
  [5, 25, 60].forEach(passati => {
    strade.forEach(([nome, vendi]) => {
      fermaOrologio();
      const c = dentro(0, { children: 0, durationMinutes: 0, baseMinutes: 0, payLater: false });
      app.PAN.conto = c; app.PAN.ingresso = null;
      app.bcSetQ('crazy', 2);
      avanza(passati);                       /* l'omaggio e' finito: scheda rossa */
      app.bcSetQ('bimbi', 2);
      vendi(c);
      const resta = (app.endTimeOf(c) - adesso()) / 60000;
      const dove = nome + ', dopo ' + passati + '′ di soli salti';
      /* la mezz'ora comprata adesso deve valere una mezz'ora */
      if (resta < 29.9) guai.push(dove + ': restano ' + Math.round(resta) + '′ invece di 30');
      /* e il prezzo e' quello di mezz'ora per due bambini */
      const atteso = r2(app.fasciaSotto ? app.priceFor(30) * 2 : 0);
      if (app.costOf(c).parkTotal !== atteso) {
        guai.push(dove + ': parco ' + app.costOf(c).parkTotal + ' invece di ' + atteso);
      }
      /* i giri si pagano a parte, per intero */
      if (app.costOf(c).crazyCost !== r2(2 * PREZZO_GIRO)) {
        guai.push(dove + ': crazy ' + app.costOf(c).crazyCost);
      }
    });
  });
  prova('tre strade per tre attese, e il tempo riparte sempre da adesso',
    !guai.length, guai.slice(0, 3).join('\n        '));

  /* e a chi non ha MAI comprato tempo non si chiede dello sforo: non
     c'e' nessun tempo comprato che possa essere finito, e la risposta
     sbagliata si mangerebbe quello appena venduto */
  fermaOrologio();
  const c = dentro(0, { children: 0, durationMinutes: 0, baseMinutes: 0, payLater: false });
  app.PAN.conto = c; app.PAN.ingresso = null;
  app.bcSetQ('crazy', 2);
  avanza(40);
  let hannoChiesto = false, esploso = null;
  /* SENZA LA GUARDIA questo apre il foglio dello sforo, cioe' tocca lo
     schermo, e col DOM finto esplode: si prende l'errore e lo si dice
     con parole sue, invece di far saltare tutto il file. */
  try { app.conSforo(c, () => { hannoChiesto = true; }); }
  catch (e) { esploso = e.message; }
  prova('non si chiede dello sforo a chi non ha tempo comprato',
    hannoChiesto && !esploso,
    esploso ? 'si e messo in mezzo il foglio dello sforo (' + esploso + ')'
            : 'il tempo venduto non e arrivato a destinazione');

  /* MENTRE A CHI IL TEMPO LO HA COMPRATO DAVVERO E LO HA SFORATO la
     domanda resta, ed e' la garanzia da non perdere. Qui NON si chiama
     `conSforo`: su uno sforo vero apre un foglio, cioe' tocca lo
     schermo, e il DOM finto di node non ce l'ha. Si guarda la
     condizione che decide -- che e' quello che il guasto aveva
     cambiato -- e il foglio lo prova il banco a video. */
  const d = dentro(45, { children: 2, durationMinutes: 30, baseMinutes: 30, payLater: false });
  prova('chi ha comprato del tempo e lo ha sforato risulta in sforo',
    app.clamp(app.num(d.durationMinutes, 0), 0, 1e6) > 0 && app.sforoDi(d) > 0,
    'sforo di ' + Math.round(app.sforoDi(d) / 60000) + '′ su ' + d.durationMinutes + 'm comprati');
  prova('  e il solo-Crazy invece no, perche non ha comprato niente',
    app.clamp(app.num(c.durationMinutes, 0), 0, 1e6) <= 0);
}

/* ═════════════════════════════════════════════════════════
   ORARI ASSURDI, MA CHE SUCCEDONO

   Non sono casi di laboratorio: sono le sere vere. Il parco chiude
   tardi, la giornata gira alle quattro del mattino, l'ora legale
   cambia una notte all'anno, e ogni tanto una tavoletta ha l'orologio
   sbagliato o un gruppo resta dentro cinque ore.
   Qui non si chiede che il prezzo sia un numero preciso: si chiede che
   NIENTE si rompa -- che i conti restino numeri, che nessuno esca
   prima di entrare, che i soldi non diventino negativi e che rileggere
   un ingresso non lo cambi.
   ═════════════════════════════════════════════════════════ */
gruppo('Orari assurdi: la notte, il cambio giornata, l’ora legale');
{
  const guai = [];
  const controlla = (dove, c) => {
    const k = app.costOf(c), d = app.dueOf(c), ap = app.contiAperto(c);
    if (!Number.isFinite(k.parkTotal) || k.parkTotal < 0) guai.push(dove + ': parco ' + k.parkTotal);
    if (!Number.isFinite(k.crazyCost) || k.crazyCost < 0) guai.push(dove + ': crazy ' + k.crazyCost);
    if (!Number.isFinite(d.total) || d.total < 0) guai.push(dove + ': dovuto ' + d.total);
    if (!Number.isFinite(app.endTimeOf(c))) guai.push(dove + ': uscita storta');
    if (app.endTimeOf(c) < c.startTime) guai.push(dove + ': esce prima di entrare');
    if (!Number.isFinite(ap.contati) || ap.contati < 0) guai.push(dove + ': minuti contati ' + ap.contati);
    if (app.num(c.pausato, 0) < 0) guai.push(dove + ': pausa negativa');
    if (!Number.isFinite(app.giornataDi(c.startTime))) guai.push(dove + ': giornata storta');
    /* e rileggerlo dal disco non lo cambia */
    const ri = app.normalizeEntries([JSON.parse(JSON.stringify(c))])[0];
    if (app.endTimeOf(ri) !== app.endTimeOf(c)) guai.push(dove + ': rileggendolo cambia l uscita');
    if (app.costOf(ri).parkTotal !== k.parkTotal) guai.push(dove + ': rileggendolo cambia il prezzo');
    if (typeof app.spiegaAperto(c, false) !== 'string') guai.push(dove + ': la riga del conto non e testo');
  };

  /* un orario preciso di una sera precisa */
  const alle = (aa, mm, gg, oo, mi) => new Date(aa, mm - 1, gg, oo, mi, 0, 0).getTime();

  const sere = [
    ['entrati alle 23:40, sono le 00:30', alle(2026, 8, 15, 23, 40), alle(2026, 8, 16, 0, 30)],
    ['entrati alle 23:40, sono le 03:59', alle(2026, 8, 15, 23, 40), alle(2026, 8, 16, 3, 59)],
    ['entrati alle 23:40, sono le 04:01 (giornata girata)', alle(2026, 8, 15, 23, 40), alle(2026, 8, 16, 4, 1)],
    ['la notte in cui si va avanti di un ora', alle(2026, 3, 28, 23, 40), alle(2026, 3, 29, 3, 30)],
    ['la notte in cui si torna indietro di un ora', alle(2026, 10, 24, 23, 40), alle(2026, 10, 25, 3, 30)],
    ['dentro da cinque ore', alle(2026, 8, 15, 15, 0), alle(2026, 8, 15, 20, 0)],
    ['dentro da due giorni (tavoletta dimenticata)', alle(2026, 8, 13, 15, 0), alle(2026, 8, 15, 15, 0)],
    ['l orologio della cassa e indietro: entrati nel futuro', alle(2026, 8, 15, 21, 0), alle(2026, 8, 15, 20, 30)],
    ['entrati un anno fa', alle(2025, 8, 15, 15, 0), alle(2026, 8, 15, 15, 0)],
    ['appena entrati, stesso istante', alle(2026, 8, 15, 15, 0), alle(2026, 8, 15, 15, 0)]
  ];

  const modi = [
    ['tempo aperto', { children: 2, durationMinutes: 0, baseMinutes: 0, payLater: true }],
    ['tempo comprato', { children: 2, durationMinutes: 30, baseMinutes: 30 }],
    ['solo Crazy', { children: 0, durationMinutes: 0, baseMinutes: 0, omaggio: 10, crazyJumping: 2, crazyGiri: [2] }],
    ['aperto e in pausa', { children: 2, durationMinutes: 0, baseMinutes: 0, payLater: true, pausato: 20 * 60000 }],
    ['comprato con giri e vendite', { children: 3, durationMinutes: 90, baseMinutes: 30,
      aggiunte: [30, 30], crazyJumping: 3, crazyGiri: [2, 1] }]
  ];

  sere.forEach(([nome, ingresso, ora]) => {
    modi.forEach(([modo, extra]) => {
      orologioA(ora);
      const c = app.normalizeEntries([Object.assign({
        id: 'n', startTime: ingresso, createdAt: ingresso, oraManuale: true
      }, extra)])[0];
      app.PAN.conto = c; app.PAN.ingresso = null;
      controlla(nome + ' / ' + modo, c);
      /* e con qualche tocco addosso */
      try {
        app.contaSalita(1);
        app.ritoccaTempo(c, 5);
        app.commutaPausa(c);
        app.chiudiPausa(c);
        app.pagaTutto();
      } catch (e) { guai.push(nome + ' / ' + modo + ': esplode toccandolo — ' + e.message); }
      controlla(nome + ' / ' + modo + ' (toccato)', c);
    });
  });
  fermaOrologio();
  prova('dieci sere per cinque modi, prima e dopo averli toccati',
    !guai.length, [...new Set(guai)].slice(0, 4).join('\n        '));
}

gruppo('Una pausa che attraversa la notte, e altre cose lunghe');
{
  fermaOrologio();
  const guai = [];
  /* una pausa dimenticata accesa: al banco succede, e il tempo non
     puo' diventare negativo ne' il conto esplodere */
  const c = dentro(60, { children: 2, durationMinutes: 0, baseMinutes: 0, payLater: true });
  app.PAN.conto = c; app.PAN.ingresso = null;
  app.commutaPausa(c);
  [30, 120, 60 * 8, 60 * 24, 60 * 24 * 3].forEach(m => {
    const a = app.contiAperto(c, adesso() + m * 60000);
    if (a.contati < 0) guai.push('dopo ' + m + '′ di pausa i minuti sono ' + a.contati);
    if (Math.abs(a.contati - 60) > 0.5) guai.push('dopo ' + m + '′ di pausa i minuti contati sono ' + a.contati.toFixed(1) + ' invece di 60');
    if (!Number.isFinite(app.costOf(c).parkTotal)) guai.push('dopo ' + m + '′ di pausa il prezzo non e un numero');
  });
  prova('una pausa lasciata accesa per tre giorni non muove il conto',
    !guai.length, guai.slice(0, 3).join('\n        '));

  /* e un gruppo che resta dentro tantissimo: il prezzo si ferma
     all'ultima fascia, non sale all'infinito */
  const ultima = app.settings.tariffs[app.settings.tariffs.length - 1];
  const lungo = [];
  [3, 6, 12, 24].forEach(ore => {
    const d = dentro(ore * 60, { children: 1, durationMinutes: 0, baseMinutes: 0, payLater: true });
    const atteso = r2(ultima.p * 1);
    if (app.costOf(d).parkTotal !== atteso) {
      lungo.push(ore + ' ore: ' + app.costOf(d).parkTotal + ' invece di ' + atteso);
    }
  });
  prova('e oltre l ultima fascia il prezzo non sale piu', !lungo.length, lungo.join('\n        '));
}

/* ═════════════════════════════════════════════════════════
   L'ORA D'INGRESSO CHE SI SPOSTA, E IL TEMPO DI PARCO CHE
   DEVE SEGUIRLA

   L'ora d'ingresso si muove in tre modi: col piu' e col meno, col
   tasto "Ora", e DA SOLA -- mentre si registra un gruppo l'orario
   cammina con l'orologio. Tutti e tre spostavano solo `startTime`, e
   `parcoDa` -- da quando conta il tempo di parco -- restava dov'era.
   Il guasto non si vedeva subito: la scheda diceva un'ora d'uscita, il
   tablet si ricaricava, la riparazione dei dati rialzava `parcoDa`
   all'ingresso, e la stessa scheda ne diceva un'altra. Nel mezzo il
   gruppo era rosso quando non doveva, e allungando il tempo li' in
   mezzo l'app chiedeva di far pagare uno sforo che non esisteva.

   La regola: quello che vale in memoria e quello che vale dopo un
   ricaricamento DEVONO essere lo stesso numero. Sempre.
   ═════════════════════════════════════════════════════════ */
gruppo('Spostare l’ora d’ingresso si porta dietro il tempo di parco');
{
  fermaOrologio();
  const rileggi = c => app.normalizeEntries([JSON.parse(JSON.stringify(c))])[0];
  const oraDi = t => new VeraData(t).toTimeString().slice(0, 5);
  /* un gruppo come nasce al banco: prima i giri, poi il tempo. E' cosi'
     che `parcoDa` si timbra -- il tempo di parco parte da zero.
     L'OMAGGIO NON E' UN DETTAGLIO: senza, la riparazione dei dati
     rimette un'ora di serie (lo zero varrebbe «dato storto»), il tempo
     non partirebbe piu' da zero e `parcoDa` non si timbrerebbe. La
     prova girerebbe a vuoto: passerebbe misurando un ingresso che il
     guasto non poteva toccare. */
  const conTimbro = (min) => {
    const c = app.normalizeEntries([{
      id: 'i' + Math.random().toString(36).slice(2, 7),
      startTime: adesso(), createdAt: adesso(), oraManuale: true,
      children: 3, durationMinutes: 0, baseMinutes: 0, omaggio: 10, crazyJumping: 2
    }])[0];
    app.metteTempo(c, min);
    if (!app.num(c.parcoDa, 0)) throw new Error('la prova gira a vuoto: parcoDa non timbrato');
    return c;
  };

  const guai = [];
  /* si sposta di tutto: avanti (il regalo del banco), indietro (la
     correzione «erano entrati alle e venti»), e di niente */
  [-30, -10, -5, 0, 5, 8, 10, 25, 60].forEach(sposta => {
    [30, 60, 90].forEach(min => {
      const c = conTimbro(min);
      const eraFine = app.endTimeOf(c);
      app.mettiIngresso(c, c.startTime + sposta * 60000);
      const ora = app.endTimeOf(c);
      const dopoRilettura = app.endTimeOf(rileggi(c));
      const eti = sposta + '′ su ' + min + '′: ';
      if (ora !== dopoRilettura) {
        guai.push(eti + 'in memoria esce ' + oraDi(ora) + ', riletto ' + oraDi(dopoRilettura));
      }
      /* e l'uscita si sposta ESATTAMENTE come l'ingresso: ne' un
         minuto di piu' ne' uno di meno */
      if (ora !== eraFine + sposta * 60000) {
        guai.push(eti + 'l uscita si e mossa di ' +
          Math.round((ora - eraFine) / 60000) + '′ invece che di ' + sposta + '′');
      }
      /* e il prezzo non c'entra niente con l'orario: non deve muoversi */
      if (app.costOf(c).parkTotal !== app.costOf(rileggi(c)).parkTotal) {
        guai.push(eti + 'il prezzo cambia rileggendolo');
      }
    });
  });
  prova('l’uscita si muove con l’ingresso, e dice lo stesso numero dopo un ricaricamento',
    !guai.length, guai.slice(0, 4).join('\n        '));

  /* IL CASO DEL PAPA' CHE COMPRA IL TEMPO DOPO: e' entrato alle 21:40
     per due giri, alle 22:10 si ferma al parco. Quel `parcoDa` e' un
     momento vero dell'orologio, non un'etichetta: correggendo l'ora
     d'ingresso NON deve muoversi. */
  {
    const c = app.normalizeEntries([{
      id: 'dopo1', startTime: adesso() - 30 * 60000, createdAt: adesso() - 30 * 60000,
      oraManuale: true, children: 3, durationMinutes: 0, baseMinutes: 0, omaggio: 10, crazyJumping: 2
    }])[0];
    app.metteTempo(c, 30);                    /* compra adesso: parcoDa = adesso */
    const comprato = c.parcoDa;
    const fine = app.endTimeOf(c);
    app.mettiIngresso(c, c.startTime - 10 * 60000);   /* «erano entrati prima» */
    prova('il tempo comprato a metà serata NON si sposta correggendo l’ingresso',
      c.parcoDa === comprato && app.endTimeOf(c) === fine,
      'parcoDa mosso di ' + Math.round((c.parcoDa - comprato) / 60000) + '′');
    /* ma se l'ingresso passa OLTRE, il parco non puo' cominciare prima
       che arrivino: si fa portare avanti, e memoria e disco d'accordo */
    app.mettiIngresso(c, comprato + 20 * 60000);
    prova('ma l’ingresso spostato oltre se lo porta avanti lo stesso',
      c.parcoDa === comprato + 20 * 60000 &&
      app.endTimeOf(c) === app.endTimeOf(rileggi(c)),
      'parcoDa ' + oraDi(c.parcoDa) + ' ingresso ' + oraDi(c.startTime));
  }

  /* IL PAVIMENTO DEL REGALO si muove col tempo di parco: se restasse
     indietro, l'ora d'uscita resterebbe incollata dov'era */
  {
    const c = conTimbro(60);
    avanza(70);                               /* tempo scaduto */
    /* le due mosse che fa la card quando si apre un giro, in quest'ordine:
       si guarda dove finivano PRIMA, si conta il giro, e da li' parte il
       regalo (vedi `regalaDaAdesso`) */
    const finePrima = app.endTimeOf(c);
    app.metteCrazy(c, 3);
    app.regalaDaAdesso(c, finePrima);
    const conRegalo = app.endTimeOf(c);
    prova('un giro a tempo scaduto lascia il suo pavimento', app.num(c.regaloFinoA, 0) > 0);
    app.mettiIngresso(c, c.startTime + 15 * 60000);
    prova('e il pavimento si sposta con l’ingresso, senza divergere',
      app.endTimeOf(c) === conRegalo + 15 * 60000 &&
      app.endTimeOf(c) === app.endTimeOf(rileggi(c)),
      'esce ' + oraDi(app.endTimeOf(c)) + ', riletto ' + oraDi(app.endTimeOf(rileggi(c))));
    fermaOrologio();
  }

  /* E LO SFORO: e' lui che fa comparire il foglio «hanno sforato,
     glielo faccio pagare?». Con l'ingresso spostato in avanti il
     gruppo risultava sforato prima del tempo, e i soldi che l'app
     chiedeva erano di minuti mai passati. */
  {
    const c = conTimbro(60);
    app.mettiIngresso(c, c.startTime + 10 * 60000);
    avanza(65);                               /* dentro i sessanta+dieci */
    prova('con l’ingresso spostato avanti non risultano ancora sforati',
      app.sforoDi(c) === 0 && app.sforoDi(rileggi(c)) === 0,
      'sforo ' + Math.round(app.sforoDi(c) / 60000) + '′ / riletto ' +
      Math.round(app.sforoDi(rileggi(c)) / 60000) + '′');
    avanza(10);                               /* adesso si' */
    prova('e dopo sì, dello stesso identico numero di minuti',
      app.sforoDi(c) > 0 && app.sforoDi(c) === app.sforoDi(rileggi(c)),
      Math.round(app.sforoDi(c) / 60000) + '′ / ' + Math.round(app.sforoDi(rileggi(c)) / 60000) + '′');
    fermaOrologio();
  }

  /* IL GIRO VERO DEL BANCO, quello che ha fatto uscire il guasto:
     sono le 20:02, due giri di Crazy, poi un'ora, e mentre si contano
     i bambini l'orario d'ingresso cammina da solo. Nessuno ha toccato
     niente, e la scheda cambiava ora d'uscita al ricaricamento. */
  {
    const c = conTimbro(60);
    const fine = app.endTimeOf(c);
    avanza(8);
    app.mettiIngresso(c, app.roundTo5(new FintaData()).getTime());   /* ingressoLive */
    prova('registrare con calma non fa comparire minuti dal nulla',
      app.endTimeOf(c) === app.endTimeOf(rileggi(c)) &&
      app.endTimeOf(c) === fine + (c.startTime - (adesso() - 8 * 60000)),
      'esce ' + oraDi(app.endTimeOf(c)) + ', riletto ' + oraDi(app.endTimeOf(rileggi(c))));
    fermaOrologio();
  }

  /* E SVUOTARE IL TEMPO butta via anche i suoi timbri: se restassero,
     il tempo nuovo nascerebbe gia' scaduto */
  {
    const c = conTimbro(60);
    avanza(90);
    app.metteCrazy(c, 2);                     /* si lascia dietro il pavimento */
    const foto = JSON.parse(JSON.stringify(c));
    delete foto.parcoDa; delete foto.regaloFinoA;
    foto.startTime = adesso(); foto.durationMinutes = 60; foto.baseMinutes = undefined;
    const pulito = app.normalizeEntries([foto])[0];
    prova('svuotando il tempo, quello nuovo non nasce già scaduto',
      app.endTimeOf(pulito) > adesso(),
      'esce ' + oraDi(app.endTimeOf(pulito)) + ' e sono le ' + oraDi(adesso()));
    fermaOrologio();
  }
}

/* ═════════════════════════════════════════════════════════
   I TASTI DELL'ORA D'USCITA

   Nella sezione Parco l'ora d'uscita si sposta col meno e col piu', e
   il salto e' al quarto d'ora dell'orologio -- «me lo tieni fino alle
   tre?». Quel tasto scriveva la durata a mano invece di passare dalle
   funzioni che vendono il tempo, e chi scrive il tempo a mano finisce
   per raccontare una storia diversa da tutti gli altri.
   Qui si controlla che le due strade -- l'ora d'uscita e il piu'
   dell'Estendi -- arrivino allo STESSO posto, coi soldi e coi blocchi.
   ═════════════════════════════════════════════════════════ */
gruppo('L’ora d’uscita e l’Estendi devono raccontare la stessa storia');
{
  fermaOrologio();
  const rileggi = c => app.normalizeEntries([JSON.parse(JSON.stringify(c))])[0];
  const oraDi2 = t => new VeraData(t).toTimeString().slice(0, 5);
  /* quello che fa il tasto, nell'ordine in cui lo fa il gestore */
  const tastoUscita = (c, verso) => {
    if (c.payLater) return 0;
    const passo = app.uscitaAlQuarto(c, verso);
    if (!passo.delta) return 0;
    if (verso < 0 && app.num(c.regaloFinoA, 0) > passo.bersaglio) c.regaloFinoA = passo.bersaglio;
    app.ritoccaTempo(c, passo.delta);
    return passo.delta;
  };
  const gruppoDa = (min, extra) => app.normalizeEntries([Object.assign({
    id: 'u' + Math.random().toString(36).slice(2, 7), startTime: adesso(), createdAt: adesso(),
    oraManuale: true, children: 3, durationMinutes: min, baseMinutes: min || undefined
  }, extra || {})])[0];

  /* 1. L'USCITA VA DAVVERO DOVE DICE: sul quarto d'ora, in su e in giu' */
  {
    const guai = [];
    [15, 30, 47, 60, 95].forEach(min => {
      [0, 2].forEach(crazy => {
        [1, -1].forEach(verso => {
          const c = gruppoDa(min, crazy ? { crazyJumping: crazy } : null);
          const prima = app.endTimeOf(c);
          const mosso = tastoUscita(c, verso);
          if (!mosso) return;
          const u = new VeraData(app.endTimeOf(c));
          const eti = min + '′' + (crazy ? ' +' + crazy + ' giri' : '') + (verso > 0 ? ' col +' : ' col −');
          /* SOTTO I CINQUE MINUTI NON SI SCENDE, e li' il quarto d'ora
             non si puo' raggiungere: il tempo ha toccato il fondo, non
             e' il tasto che sbaglia. Chiederglielo lo stesso voleva
             dire misurare una cosa che il codice non ha mai promesso. */
          if (c.durationMinutes <= app.minimoTempo(c)) return;
          if ((u.getHours() * 60 + u.getMinutes()) % 15 !== 0) {
            guai.push(eti + ': finisce alle ' + oraDi2(app.endTimeOf(c)) + ', non su un quarto d’ora');
          }
          /* e si muove nel verso giusto, mai piu' di un quarto d'ora */
          const salto = (app.endTimeOf(c) - prima) / 60000;
          if (verso > 0 ? !(salto > 0 && salto <= 15) : !(salto < 0 && salto >= -15)) {
            guai.push(eti + ': si e mossa di ' + salto + '′');
          }
        });
      });
    });
    prova('l’uscita finisce sempre su un quarto d’ora, e si muove del verso giusto',
      !guai.length, guai.slice(0, 4).join('\n        '));
  }

  /* 2. STESSI MINUTI, STESSO CONTO: l'uscita contro l'Estendi.
     Il tasto scriveva la durata a mano e NON entrava nell'ultima
     vendita: gli stessi minuti lasciavano blocchi diversi, e il
     ritocco successivo cadeva su un blocco sbagliato. */
  {
    const guai = [];
    [[30, 30], [60, 30], [45, 15], [90, 60]].forEach(([min, venduti]) => {
      const a = gruppoDa(min); app.vendiBlocco(a, venduti);
      const b = rileggi(a);
      const mosso = tastoUscita(b, 1);
      app.ritoccaTempo(a, mosso);
      const eti = min + '′+' + venduti + '′ poi +' + mosso + '′: ';
      if (a.durationMinutes !== b.durationMinutes) guai.push(eti + 'minuti diversi');
      if (r2(app.costOf(a).parkTotal) !== r2(app.costOf(b).parkTotal)) {
        guai.push(eti + app.costOf(a).parkTotal + ' € col ritocco, ' + app.costOf(b).parkTotal + ' € con l’uscita');
      }
      if (JSON.stringify(a.aggiunte) !== JSON.stringify(b.aggiunte)) {
        guai.push(eti + 'blocchi diversi: ' + JSON.stringify(a.aggiunte) + ' e ' + JSON.stringify(b.aggiunte));
      }
    });
    prova('spostare l’uscita e premere il più dell’Estendi lasciano lo stesso conto',
      !guai.length, guai.slice(0, 4).join('\n        '));
  }

  /* 3. IL SOLO CRAZY CHE SI FERMA AL PARCO.
     La sua uscita e' fatta di minuti REGALATI, e quelli non si sommano
     al tempo comprato. Spostandola, il tempo di parco deve partire da
     ADESSO -- come fa il taglio -- e non dall'arrivo: se no gli si
     mangia tutto il tempo passato a saltare. E `baseMinutes` deve
     essere i minuti veri: da uno partiva lo scaglione sbagliato, ed e'
     il guasto dei 45,00 € invece di 36,00 €. */
  {
    const c = app.normalizeEntries([{
      id: 'sc', startTime: adesso() - 40 * 60000, createdAt: adesso() - 40 * 60000,
      oraManuale: true, children: 0, durationMinutes: 0, baseMinutes: 0,
      omaggio: 10, crazyJumping: 2, crazyGiri: [1, 1]
    }])[0];
    c.children = 3;
    /* UN TOCCO SOLO, e il paragone e' con chi compra quegli stessi
       minuti. Premendolo cinque volte si comprano cinque volte, e col
       listino A SCAGLIONI cinque acquisti non fanno il prezzo di uno:
       e' cosi' che deve essere -- chiedere il contrario voleva dire
       pretendere che allungare cinque volte costasse come comprare
       tutto subito, che non e' il listino di questo parco. */
    tastoUscita(c, 1);
    const minuti = c.durationMinutes;
    const gemello = app.normalizeEntries([{
      id: 'sc2', startTime: adesso() - 40 * 60000, createdAt: adesso() - 40 * 60000,
      oraManuale: true, children: 3, durationMinutes: 0, baseMinutes: 0,
      omaggio: 10, crazyJumping: 2, crazyGiri: [1, 1]
    }])[0];
    app.metteTempo(gemello, minuti);
    prova('il solo Crazy che si ferma al parco paga come se avesse toccato un taglio',
      r2(app.costOf(c).parkTotal) === r2(app.costOf(gemello).parkTotal) &&
      c.baseMinutes === gemello.baseMinutes,
      minuti + '′: ' + app.costOf(c).parkTotal + ' € (base ' + c.baseMinutes + ') contro ' +
      app.costOf(gemello).parkTotal + ' € (base ' + gemello.baseMinutes + ')');
    prova('e il suo tempo di parco comincia da adesso, non da quando è arrivato',
      app.num(c.parcoDa, 0) > 0 && c.parcoDa >= adesso() - 5 * 60000,
      'parcoDa ' + (c.parcoDa ? oraDi2(c.parcoDa) : 'non timbrato') + ', arrivato alle ' + oraDi2(c.startTime));
    /* E L'USCITA DEVE FINIRE NEL FUTURO, su un quarto d'ora.
       Misurando l'uscita di ADESSO -- fatta di minuti regalati e ormai
       passata -- il tasto puntava a un quarto d'ora gia' andato: gli
       vendeva un tempo scaduto prima di cominciare, e il gruppo
       nasceva rosso. E' il controllo che distingue le due strade:
       senza, la prova passava anche col guasto rimesso. */
    const fine3 = app.endTimeOf(c);
    const u3 = new VeraData(fine3);
    prova('e la sua uscita cade nel futuro, su un quarto d’ora',
      fine3 > adesso() && (u3.getHours() * 60 + u3.getMinutes()) % 15 === 0 &&
      fine3 - adesso() <= 15 * 60000,
      'esce alle ' + oraDi2(fine3) + ' e sono le ' + oraDi2(adesso()) +
      ' (comprati ' + minuti + '′)');
  }

  /* 4. COL PAVIMENTO DI UN REGALO il tasto non deve essere morto.
     Un giro fatto a tempo scaduto tiene l'uscita ferma a un'ora
     promessa: la durata da sola non la spiega piu', e premendo il piu'
     non si muoveva NIENTE mentre i soldi si muovevano lo stesso. */
  {
    const c = gruppoDa(30);
    avanza(40);
    const finePrima = app.endTimeOf(c);
    app.metteCrazy(c, 1);
    app.regalaDaAdesso(c, finePrima);
    const conPavimento = app.endTimeOf(c);
    prova('c’è davvero un pavimento da scavalcare', app.num(c.regaloFinoA, 0) > 0);
    tastoUscita(c, 1);
    prova('col pavimento di un regalo il più muove l’uscita davvero',
      app.endTimeOf(c) > conPavimento && app.endTimeOf(c) - conPavimento <= 15 * 60000,
      'era ' + oraDi2(conPavimento) + ', adesso ' + oraDi2(app.endTimeOf(c)));
    const su = app.endTimeOf(c);
    tastoUscita(c, -1);
    prova('e il meno la riporta indietro, senza restare incollata al pavimento',
      app.endTimeOf(c) < su, 'era ' + oraDi2(su) + ', adesso ' + oraDi2(app.endTimeOf(c)));
    fermaOrologio();
  }

  /* 5. E NIENTE DI TUTTO QUESTO DEVE DIVERGERE fra memoria e disco */
  {
    const guai = [];
    [15, 30, 60].forEach(min => {
      [1, -1, 1, 1, -1].forEach(verso => {
        const c = gruppoDa(min, { crazyJumping: 1 });
        tastoUscita(c, verso);
        if (app.endTimeOf(c) !== app.endTimeOf(rileggi(c))) guai.push(min + '′ verso ' + verso);
        if (r2(app.costOf(c).parkTotal) !== r2(app.costOf(rileggi(c)).parkTotal)) {
          guai.push(min + '′ verso ' + verso + ': prezzo diverso rileggendolo');
        }
      });
    });
    prova('e rileggendo il dato dal disco esce lo stesso orario e lo stesso prezzo',
      !guai.length, guai.slice(0, 3).join('\n        '));
  }
}

/* ---------- il verdetto ---------- */
console.log('\n' + '━'.repeat(52));
if (ko) {
  console.log('  ' + ko + ' CONTROLLI ROTTI su ' + (ok + ko) + '\n  - ' + rotti.join('\n  - '));
  process.exit(1);
}
console.log('  TUTTO A POSTO — ' + ok + ' controlli, ' + gruppi + ' gruppi');

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

/* Un gruppo dentro da tot minuti. NIENTE DURATE TONDE: a tempo aperto
   il prezzo si misura sull'orologio, e chi e' dentro da 30′ esatti
   cade sul confine fra due fasce -- fra una misura e la successiva
   passa qualche millesimo e il numero salta. La prova accuserebbe il
   codice di un salto fatto da lei. */
function dentro(min, extra) {
  const t0 = Date.now() - min * 60000;
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
  const fermo2 = app.contiAperto(c, Date.now() + 30 * 60000).contati;
  prova('e mezz’ora di orologio, da fermi, non aggiunge niente al conto',
    Math.abs(fermo2 - fermo1) < 0.2, fermo1.toFixed(2) + ' poi ' + fermo2.toFixed(2));
  prova('  e nemmeno tre ore', Math.abs(app.contiAperto(c, Date.now() + 180 * 60000).contati - fermo1) < 0.2);

  /* ora la scena vera: entrati da 73′, fermi da 30′, si riprende */
  const d = dentro(73);
  d.pausaDa = Date.now() - 30 * 60000;
  prova('da fermi si conta il tempo che avevano quando si sono fermati',
    Math.abs(app.contiAperto(d).contati - 43) < 0.2,
    'contati ' + app.contiAperto(d).contati.toFixed(2) + ' invece di 43');
  app.commutaPausa(d);
  prova('riprendendo non e’ piu’ in pausa', !app.contiAperto(d).inPausa);
  prova('e si riparte da dove si era rimasti, non da zero',
    Math.abs(app.contiAperto(d).contati - 43) < 0.2,
    'contati ' + app.contiAperto(d).contati.toFixed(2) + ' invece di 43');
  prova('e da li’ l’orologio ricomincia a correre',
    Math.abs(app.contiAperto(d, Date.now() + 10 * 60000).contati - 53) < 0.2,
    'dopo dieci minuti: ' + app.contiAperto(d, Date.now() + 10 * 60000).contati.toFixed(2));
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
  f.status = 'closed'; f.closedAt = Date.now();
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
      id: 'x', startTime: Date.now() - min * 60000, createdAt: Date.now() - min * 60000,
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
  const f = m => app.fasciaVicina(m);
  uguale('trentuno minuti stanno nella mezz’ora', f(31).m, 30);
  uguale('trentacinque, che sta in mezzo, pure', f(35).m, 30);
  uguale('trentasei passa ai quaranta', f(36).m, 40);
  uguale('quarantatre’ resta ai quaranta', f(43).m, 40);
  uguale('quarantasei passa ai cinquanta', f(46).m, 50);
  uguale('un minuto sta nei dieci', f(1).m, 10);
  uguale('e costa il primo scaglione', f(1).p, app.settings.tariffs[0].p);

  /* e il conto del gruppo lo segue */
  const guai = [];
  [31, 35, 36, 43, 58, 72].forEach(min => {
    const c = dentro(min);
    const atteso = r2(app.fasciaVicina(app.contiAperto(c).contati).p * 2);
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

/* ---------- il verdetto ---------- */
console.log('\n' + '━'.repeat(52));
if (ko) {
  console.log('  ' + ko + ' CONTROLLI ROTTI su ' + (ok + ko) + '\n  - ' + rotti.join('\n  - '));
  process.exit(1);
}
console.log('  TUTTO A POSTO — ' + ok + ' controlli, ' + gruppi + ' gruppi');

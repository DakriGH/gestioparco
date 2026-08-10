/* ============================================================
   LE ICONE DEL BAR, disegnate una per una.
   Le emoji cambiano faccia da un tablet all'altro e per "Schweppes" o
   "Brasilena" non ne esiste una giusta. Qui ogni forma e' fatta di
   pezzi che si colorano -- corpo, fascia dell'etichetta, onda, tappo,
   stella -- cosi' una Coca e' rossa con l'onda bianca, la Zero e' nera
   con l'onda rossa, e l'acqua frizzante e' la stessa bottiglia col
   TAPPO ROSSO.
   Si aggancia al menu PER NOME: se una voce non ha il suo disegno
   (per esempio una che hai aggiunto tu), resta la sua emoji.
   ============================================================ */
function svg(d) {
  return '<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">' + d + '</svg>';
}
const STELLA = (cx, cy, r, c) => {
  let p = '';
  for (let k = 0; k < 5; k++) {
    const a1 = -Math.PI/2 + k * 2*Math.PI/5, a2 = a1 + Math.PI/5;
    p += (k ? 'L' : 'M') + (cx + r*Math.cos(a1)).toFixed(1) + ' ' + (cy + r*Math.sin(a1)).toFixed(1) +
         'L' + (cx + r*0.42*Math.cos(a2)).toFixed(1) + ' ' + (cy + r*0.42*Math.sin(a2)).toFixed(1);
  }
  return '<path d="' + p + 'Z" fill="' + c + '"/>';
};

/* LATTINA: corpo, fascia, onda, e volendo un frutto sull'etichetta */
function lattina(o) {
  return svg(
    '<rect x="11" y="5.5" width="18" height="29" rx="4.5" fill="' + o.corpo + '"/>' +
    '<rect x="11" y="5.5" width="5" height="29" rx="4.5" fill="#fff" opacity=".13"/>' +
    (o.fascia ? '<rect x="11" y="14" width="18" height="11" fill="' + o.fascia + '"/>' : '') +
    (o.onda ? '<path d="M11 21.5c3.5-4 6-1 9 .5s5 .5 9-2.5v4.5c-4 2.6-6.4 4-9 2.6s-5.4-4-9-.6Z" fill="' + o.onda + '"/>' : '') +
    (o.frutto ? '<circle cx="20" cy="19.6" r="4.4" fill="' + o.frutto + '"/>' +
                '<circle cx="20" cy="19.6" r="4.4" stroke="#fff" stroke-width=".9" opacity=".7"/>' +
                (o.foglia ? '<path d="M20 15.4c1.6-1.7 3.6-1.5 3.6-1.5s.2 2-1.5 3.6c-.9.8-2.1-1.2-2.1-2.1Z" fill="#3AA655"/>' : '') : '') +
    (o.scritta ? '<rect x="14.5" y="17.5" width="11" height="3.4" rx="1.7" fill="' + o.scritta + '"/>' : '') +
    '<rect x="12.6" y="3.4" width="14.8" height="3" rx="1.5" fill="#D5D9E0"/>' +
    '<rect x="12.6" y="33" width="14.8" height="2.6" rx="1.3" fill="#B9BFC9"/>'
  );
}
/* BOTTIGLIA costruita dal CENTRO: ogni misura e' 20 +/- qualcosa,
   cosi' la simmetria non dipende dall'occhio ma dal conto.
   o.larga  -> forma tozza (Ichnusa)
   o.piccola-> bottiglietta di vetro (Brasilena) */
function bottiglia(o) {
  const larga = !!o.larga, mini = !!o.piccola;
  const bw = larga ? 22 : (mini ? 16 : 15);      /* larghezza del corpo */
  const nw = larga ? 6.4 : (mini ? 6 : 6);       /* larghezza del collo */
  const yTappo = larga ? 8.2 : (mini ? 8.6 : 3.4);
  const hTappo = 4.2;
  const ySpalla = larga ? 16.4 : (mini ? 16.8 : 11.6);   /* fine collo */
  const yCorpo = larga ? 21.6 : (mini ? 22 : 18.6);      /* inizio corpo dritto */
  const yFondo = 35.6, r = 2.8;
  const bx = 20 - bw / 2, bx2 = 20 + bw / 2;
  const nx = 20 - nw / 2, nx2 = 20 + nw / 2;
  const d =
    'M' + nx + ' ' + (yTappo + hTappo) +
    'L' + nx + ' ' + ySpalla +
    'C' + nx + ' ' + (ySpalla + 2) + ' ' + bx + ' ' + (yCorpo - 2.4) + ' ' + bx + ' ' + yCorpo +
    'L' + bx + ' ' + (yFondo - r) +
    'a' + r + ' ' + r + ' 0 0 0 ' + r + ' ' + r +
    'h' + (bw - 2 * r) +
    'a' + r + ' ' + r + ' 0 0 0 ' + r + ' ' + (-r) +
    'L' + bx2 + ' ' + yCorpo +
    'C' + bx2 + ' ' + (yCorpo - 2.4) + ' ' + nx2 + ' ' + (ySpalla + 2) + ' ' + nx2 + ' ' + ySpalla +
    'L' + nx2 + ' ' + (yTappo + hTappo) + 'Z';
  const yEt = yCorpo + 2.2, hEt = Math.min(9.4, yFondo - yEt - 2.4);
  return svg(
    '<path d="' + d + '" fill="' + (o.vetro || '#BFE6F2') + '"/>' +
    '<rect x="' + (bx + 1.4) + '" y="' + (yCorpo + 0.6) + '" width="2.6" height="' + (yFondo - yCorpo - 3) + '" rx="1.3" fill="#fff" opacity=".22"/>' +
    (o.etichetta ? '<rect x="' + bx + '" y="' + yEt + '" width="' + bw + '" height="' + hEt + '" rx="1.6" fill="' + o.etichetta + '"/>' : '') +
    (o.stella ? STELLA(20, yEt + hEt / 2, Math.min(3.4, hEt / 2.6), o.stella) : '') +
    (o.riga ? '<rect x="' + (bx + 1.6) + '" y="' + (yEt + hEt / 2 - 1.3) + '" width="' + (bw - 3.2) + '" height="2.6" rx="1.3" fill="' + o.riga + '"/>' : '') +
    '<rect x="' + (nx - 0.5) + '" y="' + yTappo + '" width="' + (nw + 1) + '" height="' + hTappo + '" rx="1.3" fill="' + (o.tappo || '#2F6FBF') + '"/>' +
    '<rect x="' + (nx - 0.5) + '" y="' + (yTappo + hTappo - 0.6) + '" width="' + (nw + 1) + '" height="1.6" fill="#000" opacity=".18"/>'
  );
}
/* UNA PATATINA: un disco ondulato, non un cerchio. */
function patatina(cx, cy, r, rot, chip, bordo) {
  const n = x => (Math.round(x * 100) / 100);
  return '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + rot + ')">' +
    '<ellipse rx="' + n(r) + '" ry="' + n(r * 0.72) + '" fill="' + chip + '"/>' +
    /* il contorno serve: senza, due patatine vicine si impastano in un
       grumo solo e non si contano piu' */
    '<ellipse rx="' + n(r) + '" ry="' + n(r * 0.72) + '" fill="none" stroke="' + bordo +
      '" stroke-width=".9"/>' +
    '<path d="M' + n(-r * 0.62) + ' .2q' + n(r * 0.31) + ' ' + n(-r * 0.62) + ' ' +
      n(r * 0.62) + ' 0t' + n(r * 0.62) + ' 0" stroke="' + bordo +
      '" stroke-width="1" fill="none" stroke-linecap="round"/></g>';
}
/* BUSTA DI PATATINE, aperta, con le patatine che escono.
   Prima era un rettangolo con gli angoli smussati e una finestra ovale
   nel mezzo: al banco la si scambiava per una lattina -- e di lattine,
   cinque righe piu' su, ce ne sono cinque. Adesso il sacchetto e' PIU'
   LARGO SOTTO CHE SOPRA (una lattina no), ha lo strappo a zig-zag in
   cima e tre patatine che ne escono: si riconosce da lontano e senza
   leggere il nome. */
function busta(o) {
  const corpo = o.corpo || '#F2C230';
  const chip = o.chip || '#E8A33D';
  const bordo = o.bordo || '#C4821F';
  return svg(
    /* le patatine che escono: disegnate PRIMA, cosi' il sacchetto le
       taglia in basso e sembrano uscire da dentro */
    patatina(13.4, 13, 3.9, -24, chip, bordo) +
    patatina(26.6, 12.4, 4, 22, chip, bordo) +
    patatina(20, 9.4, 4.2, -5, chip, bordo) +
    /* il sacchetto, con lo strappo in cima */
    '<path d="M13 15.4l1.9-2.4 1.9 2.4 1.9-2.4 1.9 2.4 1.9-2.4 1.9 2.4 1.9-2.4 1.9 2.4' +
      'L30 32.8a2.8 2.8 0 0 1-2.8 2.8H12.8A2.8 2.8 0 0 1 10 32.8L13 15.4Z" fill="' + corpo + '"/>' +
    /* il buio dentro, appena sotto lo strappo */
    '<path d="M13 15.4h15.2l.3 2.2H12.8l.2-2.2Z" fill="#000" opacity=".22"/>' +
    /* la luce sul fianco sinistro: da' il volume del sacchetto */
    '<path d="M14.6 18.6 12.9 32.4" stroke="#fff" stroke-width="2.4" opacity=".24" stroke-linecap="round"/>' +
    /* l\u2019etichetta chiara con due patatine sopra */
    '<rect x="12.2" y="22.4" width="15.6" height="7.6" rx="2.4" fill="#FBF7EC" opacity=".94"/>' +
    patatina(16.2, 26.2, 2.9, -14, chip, bordo) +
    /* accanto, due righe: sull\u2019etichetta c\u2019e\u2019 scritto qualcosa, e due
       patatine simmetriche sembravano due occhi */
    '<rect x="20" y="24.6" width="6.4" height="1.5" rx=".75" fill="' + bordo + '" opacity=".75"/>' +
    '<rect x="20" y="27.2" width="4.4" height="1.5" rx=".75" fill="' + bordo + '" opacity=".5"/>'
  );
}
/* SPRITZ. Due voci al banco, due disegni: il BASE e' il calice e
   basta, il COMPLETO ha attorno l'aperitivo -- olive, tarallini,
   patatine. Sono la stessa consumazione con o senza il mangiare, e il
   disegno lo dice senza leggere il prezzo. */
function spritz(o) {
  o = o || {};
  return svg(
    /* ciotoline dietro: solo nel completo */
    (!o.snack ? '' :
    '<ellipse cx="8.6" cy="31.4" rx="6.4" ry="4.2" fill="#2B2F3A"/>' +
    '<circle cx="6.4" cy="30" r="2.1" fill="#7BA83C"/><circle cx="10.4" cy="30.6" r="2.1" fill="#5F8C2E"/>' +
    '<circle cx="8.4" cy="32.8" r="2.1" fill="#7BA83C"/>' +
    '<ellipse cx="31.6" cy="31.8" rx="6.4" ry="4.2" fill="#2B2F3A"/>' +
    '<circle cx="29.6" cy="30.6" r="2.4" stroke="#D8A85A" stroke-width="1.5" fill="none"/>' +
    '<circle cx="33.4" cy="31.4" r="2.4" stroke="#C79647" stroke-width="1.5" fill="none"/>' +
    '<path d="M28.4 34.4c1.2-1.4 2.6-2 4-2s2.8.6 4 2c-1.6 1-3 1.4-4 1.4s-2.4-.4-4-1.4Z" fill="#E8A33D"/>') +
    /* il calice */
    '<path d="M11.4 6.6h17.2L22.6 17.8a2 2 0 0 0-.24 1V28h-2.6v-9.2a2 2 0 0 0-.24-1L11.4 6.6Z" fill="#FF7A29"/>' +
    '<path d="M13.8 8.6h12.4L23.2 14h-6.4L13.8 8.6Z" fill="#fff" opacity=".3"/>' +
    '<rect x="16.6" y="28" width="6.8" height="2.4" rx="1.2" fill="#D5D9E0"/>' +
    '<rect x="12.4" y="30.6" width="15.2" height="2.8" rx="1.4" fill="#D5D9E0"/>' +
    '<circle cx="27.6" cy="9.4" r="4.4" fill="#FFA53D"/>' +
    '<circle cx="27.6" cy="9.4" r="4.4" stroke="#fff" stroke-width="1" opacity=".85"/>' +
    '<path d="M27.6 5v8.8M23.2 9.4h8.8" stroke="#fff" stroke-width=".9" opacity=".8"/>'
  );
}
/* TAZZINA da caffe' */
function tazzina() {
  return svg(
    '<path d="M8.6 14h18.8v9.4a9.4 9.4 0 0 1-18.8 0V14Z" fill="#F2F3F7"/>' +
    '<path d="M10.6 16h14.8v7.4a7.4 7.4 0 0 1-14.8 0V16Z" fill="#5B3A22"/>' +
    '<path d="M27.4 16.6h3.4a3.6 3.6 0 0 1 0 7.2h-3.4" stroke="#F2F3F7" stroke-width="2.8" stroke-linecap="round"/>' +
    '<rect x="5.6" y="32.6" width="24.8" height="3.2" rx="1.6" fill="#D5D9E0"/>' +
    '<path d="M15 9.6c0-1.6 1.6-1.6 1.6-3.2M19.2 9.6c0-1.6 1.6-1.6 1.6-3.2" stroke="#B9BFC9" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>'
  );
}
/* BICCHIERINO DA AMARO: il vetro e' vetro, il liquore sta DENTRO.
   Prima il bicchiere era tutto pieno del colore del liquore: con un
   amaro solo bastava, ma adesso al banco ce ne sono sei e vanno
   riconosciuti al volo. Cambia il colore, cambia il livello, e chi ha
   un segno suo se lo tiene: il GELO del Capo (che si versa dal
   congelatore), la FETTA del limoncello, la FOGLIA del Kaciuto (alloro
   e finocchietto), la STELLA d\u2019oro del Rupes.
   o.livello -> quanto e' pieno (0..1), di suo tre quarti */
function bicchierino(o) {
  const yA = 12.6, yB = 25.8, alt = yB - yA;          /* il tratto dritto */
  const liv = Math.max(0, Math.min(1, o.livello == null ? 0.74 : o.livello));
  const u = 1 - liv;                                   /* quanto vuoto in cima */
  const n = x => (Math.round(x * 100) / 100);
  const yL = n(yA + u * alt);
  const xL = n(12.6 + 1.9 * u), xR = n(27.4 - 1.7 * u);
  const vetro = 'M12.6 12.6h14.8l-1.7 13.2a3.2 3.2 0 0 1-3.2 2.8h-4.8a3.2 3.2 0 0 1-3.2-2.8L12.6 12.6Z';
  const dentro = 'M' + xL + ' ' + yL + 'H' + xR +
    'L25.7 25.8a3.2 3.2 0 0 1-3.2 2.8h-4.8a3.2 3.2 0 0 1-3.2-2.8L' + xL + ' ' + yL + 'Z';
  return svg(
    '<path d="' + vetro + '" fill="#DCE6F0" opacity=".22"/>' +
    '<path d="' + dentro + '" fill="' + o.liquore + '"/>' +
    /* il pelo del liquore, un filo piu' chiaro */
    '<rect x="' + xL + '" y="' + yL + '" width="' + n(xR - xL) + '" height="1.3" rx=".65" fill="#fff" opacity=".28"/>' +
    /* il vetro: il bordo e il riflesso sul fianco */
    '<path d="' + vetro + '" fill="none" stroke="#C6D4E4" stroke-width="1.4" opacity=".65"/>' +
    '<path d="M15.4 14.4 16.8 25" stroke="#fff" stroke-width="1.6" opacity=".3" stroke-linecap="round"/>' +
    /* IL GELO: brina sul vetro e un fiocco. L\u2019amaro del Capo si
       versa ghiacciato, ed e\u2019 la prima cosa che si chiede. */
    (o.gelo ? '<circle cx="17.2" cy="19.4" r="1.1" fill="#fff" opacity=".75"/>' +
      '<circle cx="22.4" cy="22" r=".9" fill="#fff" opacity=".6"/>' +
      '<circle cx="20.4" cy="16.6" r=".8" fill="#fff" opacity=".5"/>' +
      '<path d="M30 8.6v7M26.6 10.4l6.8 4M33.4 10.4l-6.8 4" stroke="#BFE6F2" ' +
      'stroke-width="1.7" stroke-linecap="round"/>' : '') +
    /* LA FETTA DI LIMONE sul bordo */
    (o.fetta ? '<circle cx="27.4" cy="12.2" r="4.4" fill="' + o.fetta + '"/>' +
      '<circle cx="27.4" cy="12.2" r="4.4" fill="none" stroke="#FBF7EC" stroke-width="1"/>' +
      '<path d="M27.4 7.8v8.8M23 12.2h8.8" stroke="#FBF7EC" stroke-width=".9" opacity=".9"/>' : '') +
    /* LA FOGLIA: alloro e finocchietto, quello che c\u2019e\u2019 dentro */
    (o.foglia ? '<path d="M27.6 8.4c3.4-.6 5.4 1 5.4 1s-1.4 2.4-4.8 3c-1.8.4-2.4-3.6-.6-4Z" fill="#4E8C3A"/>' +
      '<path d="M27.8 11.6c1.8-1 3.6-1.4 3.6-1.4" stroke="#2F5F22" stroke-width=".9" ' +
      'stroke-linecap="round" fill="none"/>' : '') +
    /* LA STELLA D\u2019ORO: il Rupes e\u2019 quello premiato, e al banco lo si
       chiama cosi\u2019 -- "quello buono" */
    (o.stella ? STELLA(28.4, 10.4, 4.4, o.stella) : '') +
    /* gambo e piede */
    '<rect x="18.4" y="28" width="3.2" height="5.4" fill="#D5D9E0"/>' +
    '<rect x="13" y="32.8" width="14" height="3.2" rx="1.6" fill="#D5D9E0"/>'
  );
}
/* BAMBINI: bambino col palloncino - si capisce anche da solo */
function bimbo(c) {
  return svg(
    '<path d="M29.6 4.6c0 3-2.4 5.4-5.4 5.4S18.8 7.6 18.8 4.6 21.2-.8 24.2-.8s5.4 2.4 5.4 5.4Z" fill="' + c + '"/>' +
    '<circle cx="28" cy="8.6" r="5.6" fill="#E24B5A"/>' +
    '<path d="M28 14.2c-.6 1.4-.2 2.4.6 3.2" stroke="#E9E9F2" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
    '<path d="M28 14.2 16.6 22" stroke="#C9CDD6" stroke-width="1.1" stroke-linecap="round"/>' +
    '<circle cx="14.4" cy="14.6" r="5.6" fill="#F2C79C"/>' +
    '<path d="M9 14.2c0-3.6 2.4-6 5.4-6s5.4 2.4 5.4 6c-1.6-1.2-3.4-1.8-5.4-1.8S10.6 13 9 14.2Z" fill="' + c + '"/>' +
    '<path d="M8.4 36v-8.4c0-3.6 2.6-6.4 6-6.4s6 2.8 6 6.4V36H8.4Z" fill="' + c + '"/>' +
    '<rect x="10.6" y="30" width="3.2" height="6" rx="1.6" fill="#3A4152"/>' +
    '<rect x="15.4" y="30" width="3.2" height="6" rx="1.6" fill="#3A4152"/>' +
    '<circle cx="12.6" cy="14.8" r="1" fill="#0F1116"/><circle cx="16.4" cy="14.8" r="1" fill="#0F1116"/>'
  );
}
/* CRAZY JUMPING: trampolino con qualcuno per aria */
function saltatore(c) {
  return svg(
    /* il tappeto */
    '<ellipse cx="20" cy="29.4" rx="14.4" ry="4.6" fill="#2B2F3A"/>' +
    '<ellipse cx="20" cy="28.4" rx="14.4" ry="4.6" fill="' + c + '" opacity=".55"/>' +
    '<ellipse cx="20" cy="28.4" rx="10.6" ry="3.2" fill="#14141B"/>' +
    /* gambe del trampolino */
    '<path d="M7.6 30.4 4.4 36M32.4 30.4 35.6 36" stroke="#8C93A6" stroke-width="2.2" stroke-linecap="round"/>' +
    /* chi salta */
    '<circle cx="20" cy="6.2" r="3.6" fill="' + c + '"/>' +
    '<path d="M20 10.4c2.6 0 4.6 1.7 4.6 4v2.6l3.6 4.4-2.2 1.8-3-3.6v4.6h-6v-4.6l-3 3.6-2.2-1.8 3.6-4.4v-2.6c0-2.3 2-4 4.6-4Z" fill="' + c + '"/>' +
    /* le righe del rimbalzo */
    '<path d="M11.6 12.6c-1.2-1.2-1.8-2.6-1.8-4M28.4 12.6c1.2-1.2 1.8-2.6 1.8-4" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>'
  );
}
/* CLESSIDRA: la voce "Estendi tempo" nella linguetta Parco. Stessa
   fattura delle altre -- riempimento pieno, niente contorni sottili --
   cosi' in fila con bambino e saltatore sembra della stessa famiglia. */
function clessidra(c) {
  return svg(
    '<path d="M12 3h24v3.4c0 5-3.4 9.2-8 10.6v1.6c4.6 1.4 8 5.6 8 10.6V33H12v-3.8c0-5 3.4-9.2 8-10.6v-1.6c-4.6-1.4-8-5.6-8-10.6V3Z" fill="' + c + '"/>' +
    /* la sabbia in fondo, piu' scura: e' quello che rende leggibile la forma */
    '<path d="M15.4 30.2c.5-3.6 3.9-6.4 8.6-6.4s8.1 2.8 8.6 6.4H15.4Z" fill="rgba(0,0,0,.32)"/>' +
    /* i due bordi, come le tavolette delle clessidre vere */
    '<rect x="10" y="1.4" width="28" height="3.6" rx="1.8" fill="' + c + '"/>' +
    '<rect x="10" y="31" width="28" height="3.6" rx="1.8" fill="' + c + '"/>' +
    /* il filo di sabbia che cade */
    '<rect x="23.2" y="16" width="1.6" height="7" rx=".8" fill="rgba(0,0,0,.3)"/>'
  );
}
const ICONE = {
  /* --- parco --- */
  bimbi:  () => bimbo('#3B8CFF'),
  crazy:  () => saltatore('#B072FF'),
  tempo:  () => clessidra('#E8B44C'),
  /* --- bevande --- */
  /* identiche: cambia SOLO il tappo, come al banco */
  acqua:     () => bottiglia({ vetro:'#BFE6F2', tappo:'#2F6FBF', etichetta:'#2F6FBF', riga:'#EAF6FB' }),
  acquafriz: () => bottiglia({ vetro:'#BFE6F2', tappo:'#D93B3B', etichetta:'#2F6FBF', riga:'#EAF6FB' }),
  caffe:     () => tazzina(),
  coca:      () => lattina({ corpo:'#D2172F', onda:'#ffffff' }),
  cocaz:     () => lattina({ corpo:'#17181C', onda:'#D2172F' }),
  fanta:     () => lattina({ corpo:'#FF7A1E', onda:'#ffffff' }),
  sprite:    () => lattina({ corpo:'#1FA85C', onda:'#EAF6D8' }),
  schw:      () => bottiglia({ vetro:'#D8C77A', tappo:'#C9A227', etichetta:'#C9A227', riga:'#FBF7EC' }),
  gazz:      () => bottiglia({ vetro:'#E4EEF2', tappo:'#8FB8C9', etichetta:'#8FB8C9', riga:'#ffffff' }),
  estalim:   () => lattina({ corpo:'#E8B923', fascia:'#FBF7EC', frutto:'#FFE24A', foglia:true }),
  estapes:   () => lattina({ corpo:'#E8834F', fascia:'#FBF7EC', frutto:'#FFB58A', foglia:true }),
  bras:      () => bottiglia({ piccola:true, vetro:'#6B4226', tappo:'#C9A227', etichetta:'#C9A227', riga:'#5B3A22' }),
  /* --- snack --- */
  pata:      () => busta({ corpo:'#F2C230', chip:'#E8873D' }),
  /* --- birre --- */
  heine:     () => bottiglia({ vetro:'#1B7A3E', tappo:'#D2172F', etichetta:'#0F6431', stella:'#D2172F' }),
  nastro:    () => bottiglia({ vetro:'#C9A46A', tappo:'#1F4E9C', etichetta:'#1F4E9C', riga:'#FBF7EC' }),
  /* l'Ichnusa ha la bottiglia larga e bassa: e' la sua forma */
  ichnu:     () => bottiglia({ larga:true, vetro:'#8C5A28', tappo:'#D2172F', etichetta:'#D2172F', stella:'#FBF7EC' }),
  tenn:      () => bottiglia({ vetro:'#9C6B2F', tappo:'#D2172F', etichetta:'#D2172F', riga:'#FBF7EC' }),
  /* --- alcolici ---
     Sei amari in fila: cambia il colore del liquore e cambia il segno.
     Il Capo si versa ghiacciato, il limoncello ha la sua fetta, il
     Kaciuto e' di alloro e finocchietto, il Rupes e' quello premiato. */
  eremita:   () => bicchierino({ liquore:'#3C2A18', livello:.8 }),
  capo:      () => bicchierino({ liquore:'#2A1A12', livello:.78, gelo:true }),
  silano:    () => bicchierino({ liquore:'#8A5320', livello:.72 }),
  limon:     () => bicchierino({ liquore:'#F5E04A', livello:.7, fetta:'#FFE24A' }),
  kaciuto:   () => bicchierino({ liquore:'#4A5A22', livello:.76, foglia:true }),
  rupes:     () => bicchierino({ liquore:'#8C4A16', livello:.74, stella:'#E8C36B' }),
  /* restano per chi se li e' aggiunti a mano nel suo listino */
  amari:     () => bicchierino({ liquore:'#5B3A22' }),
  grappa:    () => bicchierino({ liquore:'#EDE7DA', livello:.66 }),
  spritz:    () => spritz(),
  spritzc:   () => spritz({ snack:true })
};

/* ---------- aggancio al menu del bar, per nome ---------- */
const NOMI_ICONE = {
  'acqua':'acqua', 'acqua frizzante':'acquafriz', 'acqua gassata':'acquafriz',
  'caffe':'caffe', 'caff\u00e8':'caffe',
  'coca cola':'coca', 'coca':'coca', 'coca cola zero':'cocaz', 'coca zero':'cocaz',
  'fanta':'fanta', 'sprite':'sprite', 'schweppes':'schw',
  'gazzosa':'gazz', 'gassosa':'gazz',
  /* il menu dell'app ha un "Estathè" solo: gli do il giallo del
     limone. Se un giorno lo sdoppi in limone e pesca, i due disegni
     sono gia' qui e si agganciano da soli */
  'estathe':'estalim', 'estathè':'estalim',
  'estathe limone':'estalim', 'estath\u00e8 limone':'estalim', 'the limone':'estalim',
  'estathe pesca':'estapes', 'estath\u00e8 pesca':'estapes', 'the pesca':'estapes',
  'brasilena':'bras', 'patatine':'pata',
  'heineken':'heine', 'nastro azzurro':'nastro', 'ichnusa':'ichnu',
  "tennent's":'tenn', 'tennents':'tenn', 'tennent':'tenn',
  'limoncello':'limon', 'amari':'amari', 'amaro':'amari',
  'grappa':'grappa',
  /* gli amari del banco, coi nomi come si dicono davvero */
  'eremita':'eremita', 'amaro eremita':'eremita',
  'amaro del capo':'capo', 'del capo':'capo', 'vecchio amaro del capo':'capo', 'capo':'capo',
  'amaro silano':'silano', 'silano':'silano',
  'kaciuto':'kaciuto', 'amaro kaciuto':'kaciuto', 'kachiuto':'kaciuto', 'cachiuto':'kaciuto',
  'rupes':'rupes', 'amaro rupes':'rupes',
  'spritz':'spritz', 'spritz base':'spritz', 'aperol spritz':'spritz', 'aperol':'spritz',
  'spritz completo':'spritzc', 'aperol spritz completo':'spritzc', 'spritz con snack':'spritzc',
  'bambini':'bimbi', 'ingresso':'bimbi', 'crazy jumping':'crazy', 'crazy':'crazy'
};
function chiaveIcona(nome) {
  const n = String(nome || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return NOMI_ICONE[n] || null;
}
/* Restituisce l'HTML dell'icona: il disegno se c'e', se no l'emoji che
   quella voce aveva gia' nel menu. */
function iconaBar(nome, emoji) {
  const k = chiaveIcona(nome);
  if (k && ICONE[k]) return ICONE[k]();
  return '<span class="bc-em">' + (emoji || '\ud83e\udd64') + '</span>';
}

/* ============================================================
   I SOLDI, coi colori veri: il 5 grigio, il 10 rosso, il 20 blu, il
   50 arancione; le monete da 2 e da 1 con l'anello di un metallo e il
   centro dell'altro, come sono davvero in mano.
   ============================================================ */
function banconota(val, carta, bordo, inchiostro) {
  return svg(
    '<rect x="2.5" y="9" width="35" height="22" rx="2.6" fill="' + carta + '"/>' +
    '<rect x="2.5" y="9" width="35" height="22" rx="2.6" fill="none" stroke="' + bordo + '" stroke-width="1.4"/>' +
    /* la finestra chiara a sinistra, come l'ologramma */
    '<rect x="5" y="11.6" width="7.4" height="16.8" rx="1.4" fill="#fff" opacity=".45"/>' +
    /* l'arco di stelle, appena accennato */
    '<circle cx="30.6" cy="14.6" r="1" fill="' + inchiostro + '" opacity=".55"/>' +
    '<circle cx="33.4" cy="17" r="1" fill="' + inchiostro + '" opacity=".55"/>' +
    '<circle cx="33.4" cy="23" r="1" fill="' + inchiostro + '" opacity=".55"/>' +
    '<circle cx="30.6" cy="25.4" r="1" fill="' + inchiostro + '" opacity=".55"/>' +
    '<text x="20.5" y="24.8" text-anchor="middle" font-family="Fredoka, sans-serif" ' +
      'font-size="13.5" font-weight="700" fill="' + inchiostro + '">' + val + '</text>'
  );
}
function moneta(val, fuori, dentro, inchiostro, piccola) {
  const r = piccola ? 14.5 : 16.5;
  return svg(
    '<circle cx="20" cy="20" r="' + r + '" fill="' + fuori + '"/>' +
    '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="#000" stroke-width="1" opacity=".18"/>' +
    '<circle cx="20" cy="20" r="' + (r - 4.2) + '" fill="' + dentro + '"/>' +
    '<path d="M20 ' + (20 - r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
      'l-2.6 0a' + (r - 2.6) + ' ' + (r - 2.6) + ' 0 0 0 ' + (-(r - 2.6)) + ' ' + (-(r - 2.6)) + 'Z" ' +
      'fill="#fff" opacity=".3"/>' +
    '<text x="20" y="25" text-anchor="middle" font-family="Fredoka, sans-serif" ' +
      'font-size="' + (piccola ? 11 : 13.5) + '" font-weight="700" fill="' + inchiostro + '">' + val + '</text>'
  );
}
/* quello che gira davvero in cassa, dal piu' grosso al piu' piccolo */
const SOLDI = {
  5000: () => banconota('50', '#F0B45C', '#C98426', '#7A4A0E'),
  2000: () => banconota('20', '#7FB6E8', '#3D7CB8', '#123E68'),
  1000: () => banconota('10', '#E08A8A', '#B84A4A', '#6B1414'),
  500:  () => banconota('5',  '#CFCBC3', '#9A958C', '#3E3B35'),
  200:  () => moneta('2€', '#C9CDD6', '#E8C36B', '#5A4413', true),
  100:  () => moneta('1€', '#E8C36B', '#C9CDD6', '#3A3D45', true),
  50:   () => moneta('50c', '#E3B457', '#D9A63F', '#5A4413', true),
  20:   () => moneta('20c', '#EAC46B', '#DDB55A', '#5A4413', true)
};
const iconaSoldi = c => (SOLDI[c] ? SOLDI[c]() : '');

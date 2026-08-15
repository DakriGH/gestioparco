/* ============================================================
   GESTIOPARCO — sprite avatar
   Disegno vettoriale a figura intera, pensato per essere
   riconoscibile sia a 46px sia a 132px, e per generare da solo
   i "tratti scritti" (cappellino rosso, zaino, occhiali...).

   Geometria di riferimento (viewBox 0 0 100 150):
     testa   cy 40  r 22
     collo   y 60-70
     busto   y 68-102
     gambe   y 100-138
     piedi   y 138-146
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- palette ---------- */
  // n = nome accordato: [maschile sing, femminile sing, maschile plur, femminile plur]
  /* Quindici tinte IN ORDINE DI COLORE -- caldi, freddi, poi i neutri --
     piu' la ruota, che nel pannello e' il sedicesimo posto. L'ordine
     conta: al banco si cerca "il verde" scorrendo con l'occhio, e una
     fila mescolata costringe a leggerle tutte. */
  const COLORS = [
    { c: '#E23D4B', n: ['rosso', 'rossa', 'rossi', 'rosse'] },
    { c: '#F97316', n: ['arancione', 'arancione', 'arancioni', 'arancioni'] },
    { c: '#FBBF24', n: ['giallo', 'gialla', 'gialli', 'gialle'] },
    { c: '#22C55E', n: ['verde', 'verde', 'verdi', 'verdi'] },
    { c: '#4F6B3A', n: ['verde militare', 'verde militare', 'verdi militare', 'verdi militare'] },
    { c: '#7DD3FC', n: ['azzurro chiaro', 'azzurra chiara', 'azzurri chiari', 'azzurre chiare'] },
    { c: '#0EA5E9', n: ['azzurro', 'azzurra', 'azzurri', 'azzurre'] },
    /* I COLORI SONO COLORI, I CAPI SONO CAPI. Qui c'era «jeans», che e'
       un tessuto: usato come nome di colore usciva «camicia jeans» per
       una camicia blu -- che si legge come una camicia di denim, non
       come il suo colore -- e «bracciale jeans», che non vuol dire
       niente. Il capo `jeans` esiste, sta in capi.js ed e' giusto che ci
       stia: uno puo' averli neri e restano jeans. Il COLORE invece si
       chiama col suo nome. Invariabile come «blu scuro», per la stessa
       ragione: blu non si accorda. */
    { c: '#3B5C88', n: ['blu grigio', 'blu grigio', 'blu grigio', 'blu grigio'] },
    { c: '#2547C4', n: ['blu', 'blu', 'blu', 'blu'] },
    /* blu resta invariabile anche accompagnato: "maglietta blu scuro",
       come si dice al banco */
    { c: '#16265E', n: ['blu scuro', 'blu scuro', 'blu scuro', 'blu scuro'] },
    { c: '#8B5CF6', n: ['viola', 'viola', 'viola', 'viola'] },
    { c: '#EC4899', n: ['rosa', 'rosa', 'rosa', 'rosa'] },
    { c: '#E3D2B4', n: ['beige', 'beige', 'beige', 'beige'] },
    { c: '#7C4A2D', n: ['marrone', 'marrone', 'marroni', 'marroni'] },
    { c: '#F4F6F8', n: ['bianco', 'bianca', 'bianchi', 'bianche'] },
    { c: '#9AA5B4', n: ['grigio', 'grigia', 'grigi', 'grigie'] },
    { c: '#1F2430', n: ['nero', 'nera', 'neri', 'nere'] }
  ];

  /* QUATTRO colori, non otto. Al banco una persona si guarda per due
     secondi: fra "castano" e "castano chiaro" non sceglie nessuno.
     Neri, marroni, biondi -- quello che si dice davvero guardando
     qualcuno -- piu' il grigio dei nonni, che nel guardaroba non ha una
     pastiglia sua (ce l'hanno gia' addosso) ma serve per chiamarlo col
     suo nome. Qualunque altra tinta si prende dalla ruota.
     I colori vecchi non si perdono — colorName() prende il più vicino,
     quindi un avatar "biondo platino" di ieri resta biondo. */
  const HAIR_COLORS = [
    { c: '#1E1712', n: ['nero', 'nera', 'neri', 'nere'] },
    { c: '#6B4226', n: ['marrone', 'marrone', 'marroni', 'marroni'] },
    { c: '#D8A657', n: ['biondo', 'bionda', 'biondi', 'bionde'] },
    { c: '#C9CDD3', n: ['grigio', 'grigia', 'grigi', 'grigie'] }
  ];
  const SCURI = HAIR_COLORS[0].c, BIONDI = HAIR_COLORS[2].c, GRIGI = HAIR_COLORS[3].c;

  const SKINS = ['#FFE0C0', '#F6CFA8', '#E8B98A', '#D19A68', '#B67A4C', '#8F5A33', '#6B4226', '#4A2C18'];

  /* Dieci fantasie, quelle che si distinguono a due metri. Erano
     quattordici e le quattro tolte -- oblique, zigzag, animalier,
     stelle -- a colpo d'occhio si confondevano con righe e pois. */
  const PATTERNS = [
    { key: 'solid', n: 'Nessuna', suf: '' },
    { key: 'stripes-h', n: 'Righe', suf: ' a righe' },
    { key: 'stripes-v', n: 'Vert.', suf: ' a righe verticali' },
    { key: 'dots', n: 'Pois', suf: ' a pois' },
    { key: 'plaid', n: 'Quadretti', suf: ' a quadretti' },
    { key: 'scacchi', n: 'Scacchi', suf: ' a scacchi' },
    { key: 'fiori', n: 'Fiori', suf: ' a fiori' },
    { key: 'cuori', n: 'Cuori', suf: ' a cuori' },
    { key: 'camo', n: 'Mimetico', suf: ' mimetic' },
    { key: 'logo', n: 'Scritta', suf: ' con una scritta' }
  ];

  /* ---------- cataloghi capi ----------
     g = genere/numero per l'accordo del colore:
     0 = maschile sing, 1 = femminile sing, 2 = masch. plur, 3 = femm. plur  */
  const HAIR = [
    { key: 'pelato', label: 'Pelato', em: '🧑‍🦲', g: 2, noun: 'Pelato', bare: true },
    { key: 'corti', label: 'Corti', em: '💇', g: 2, noun: 'Capelli corti' },
    { key: 'medio', label: 'Medi', em: '💇‍♂️', g: 2, noun: 'Capelli medi' },
    { key: 'lunghi', label: 'Lunghi', em: '💇‍♀️', g: 2, noun: 'Capelli lunghi' },
    { key: 'ricci', label: 'Ricci lunghi', em: '🧑‍🦱', g: 2, noun: 'Capelli ricci lunghi' },
    { key: 'riccimedi', label: 'Ricci medi', em: '🧑‍🦱', g: 2, noun: 'Capelli ricci medi' },
    { key: 'codino', label: 'Codino', em: '🎀', g: 2, noun: 'Codino' },
    { key: 'chignon', label: 'Chignon', em: '👩‍🦰', g: 2, noun: 'Chignon' },
    { key: 'treccine', label: 'Treccine', em: '🧶', g: 2, noun: 'Treccine' }
  ];

  const HAT = [
    { key: 'none', label: 'Niente', em: '🚫', skip: true },
    { key: 'cappellino', label: 'Cappellino', em: '🧢', g: 0, noun: 'Cappellino' },
    { key: 'panama', label: 'Cappello', em: '👒', g: 0, noun: 'Cappello di paglia' },
    { key: 'bandana', label: 'Bandana', em: '🏴', g: 1, noun: 'Bandana' },
    { key: 'lana', label: 'Cuffia', em: '🎿', g: 1, noun: 'Cuffia' }
  ];

  const GLASSES = [
    { key: 'none', label: 'Niente', em: '🚫', skip: true },
    { key: 'vista', label: 'Da vista', em: '👓', g: 2, noun: 'Occhiali' },
    { key: 'sole', label: 'Da sole', em: '🕶️', g: 2, noun: 'Occhiali da sole' }
  ];

  const FACIAL = [
    { key: 'none', label: 'Niente', em: '🚫', skip: true },
    { key: 'baffi', label: 'Baffi', em: '👨', g: 2, noun: 'Baffi' },
    { key: 'barba', label: 'Barba', em: '🧔', g: 1, noun: 'Barba' }
  ];

  /* MANICHE: una sola verità, letta sia dalla figura sia dall'icona.
     Prima la lunghezza era scritta due volte — nel disegno della
     figura e nella sagoma dell'icona — e le due si erano già scollate:
     la camicia aveva la manica lunga nell'icona e l'avambraccio nudo
     sulla figura. Chi la cambia ora la cambia in un posto solo. */
  const TOP = [
    { key: 'maglietta', label: 'Maglietta', em: '👕', g: 1, noun: 'Maglietta', maniche: 'corte' },
    { key: 'manicalunga', label: 'Maniche lunghe', em: '🥼', g: 1, noun: 'Maglia a maniche lunghe', maniche: 'lunghe' },
    { key: 'polo', label: 'Polo', em: '🎽', g: 1, noun: 'Polo', maniche: 'corte' },
    { key: 'camicia', label: 'Camicia', em: '👔', g: 1, noun: 'Camicia', maniche: 'lunghe' },
    { key: 'canotta', label: 'Canotta', em: '🎽', g: 1, noun: 'Canotta', maniche: 'nessuna' },
    { key: 'felpa', label: 'Felpa', em: '🧥', g: 1, noun: 'Felpa', maniche: 'lunghe' },
    { key: 'giacca', label: 'Giacca', em: '🧳', g: 1, noun: 'Giacca', maniche: 'lunghe' },
    { key: 'top', label: 'Top', em: '👚', g: 0, noun: 'Top', maniche: 'nessuna' },
    { key: 'vestito', label: 'Vestito', em: '👗', g: 0, noun: 'Vestito', maniche: 'nessuna' },
    /* l'unico che copre le gambe fino ai piedi: sotto non ci va niente */
    { key: 'vestitolungo', label: 'Vestito lungo', em: '👚', g: 0, noun: 'Vestito lungo', full: true, maniche: 'nessuna' }
  ];

  const PANTS = [
    { key: 'pantaloni', label: 'Lunghi', em: '👖', g: 2, noun: 'Pantaloni' },
    { key: 'pantaloncini', label: 'Corti', em: '🩳', g: 2, noun: 'Pantaloncini' },
    { key: 'jeans', label: 'Jeans', em: '👖', g: 2, noun: 'Jeans' },
    { key: 'jeanscorti', label: 'Jeans corti', em: '🩳', g: 2, noun: 'Jeans corti' },
    { key: 'leggings', label: 'Leggings', em: '👟', g: 2, noun: 'Leggings' },
    { key: 'gonna', label: 'Gonna', em: '👗', g: 1, noun: 'Gonna' },
    { key: 'gonnalunga', label: 'Gonna lunga', em: '👗', g: 1, noun: 'Gonna lunga' },
    { key: 'tuta', label: 'Tuta', em: '🧥', g: 2, noun: 'Pantaloni della tuta' }
  ];

  const SHOES = [
    { key: 'sneakers', label: 'Sneakers', em: '👟', g: 3, noun: 'Scarpe da ginnastica' },
    { key: 'sandali', label: 'Sandali', em: '🩴', g: 2, noun: 'Sandali' },
    { key: 'ciabatte', label: 'Ciabatte', em: '🩴', g: 3, noun: 'Ciabatte' },
    { key: 'stivali', label: 'Stivali', em: '🥾', g: 2, noun: 'Stivali' },
    { key: 'tacchi', label: 'Tacchi', em: '👠', g: 2, noun: 'Tacchi' },
    { key: 'scalzo', label: 'Scalzo', em: '🦶', skip: true }
  ];

  const BAG = [
    { key: 'none', label: 'Niente', em: '🚫', skip: true },
    { key: 'zaino', label: 'Zaino', em: '🎒', g: 0, noun: 'Zaino' },
    { key: 'borsa', label: 'Borsa', em: '👜', g: 1, noun: 'Borsa' },
    { key: 'marsupio', label: 'Marsupio', em: '👝', g: 0, noun: 'Marsupio' }
  ];

  const ROLES = [
    { key: 'mamma', label: 'Mamma', em: '👩' },
    { key: 'papa', label: 'Papà', em: '👨' },
    { key: 'nonna', label: 'Nonna', em: '👵' },
    { key: 'nonno', label: 'Nonno', em: '👴' },
    { key: 'ragazza', label: 'Ragazza', em: '👧' },
    { key: 'ragazzo', label: 'Ragazzo', em: '👦' },
    { key: 'baby', label: 'Babysitter', em: '🧑‍🍼' },
    { key: 'altro', label: 'Altro', em: '🧑' }
  ];

  function findIn(list, key) { return list.find(x => x.key === key) || list[0]; }

  function toRgb(hex) {
    let c = String(hex || '').replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16);
    return isNaN(n) ? null : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /* Nome del colore. Se la tinta non è esattamente in palette (succede con
     gli avatar salvati dalla versione precedente) si prende la più vicina,
     così il tratto scritto resta sempre utile: "maglietta rossa". */
  function colorName(hex, g, pool) {
    const list = pool || COLORS;
    const exact = list.find(c => c.c.toLowerCase() === String(hex || '').toLowerCase());
    if (exact) return exact.n[g || 0];
    const target = toRgb(hex);
    if (!target) return '';
    let best = null, bestD = Infinity;
    list.forEach(c => {
      const o = toRgb(c.c);
      const d = (o.r - target.r) ** 2 + (o.g - target.g) ** 2 + (o.b - target.b) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    });
    return best ? best.n[g || 0] : '';
  }

  /* ---------- modello ---------- */
  function defaultFor(role) {
    const a = {
      role: role || 'altro',
      skin: SKINS[1],
      hair: { style: 'medio', color: SCURI },
      hat: { style: 'none', color: '#E23D4B' },
      glasses: 'none',
      facial: 'none',
      top: { style: 'maglietta', color: '#0EA5E9', color2: '#F4F6F8', pattern: 'solid' },
      pants: { style: 'pantaloni', color: '#2547C4', color2: '#F4F6F8', pattern: 'solid' },
      shoes: { style: 'sneakers', color: '#F4F6F8' },
      bag: { style: 'none', color: '#7C4A2D' }
    };
    switch (role) {
      case 'mamma':
        a.hair = { style: 'lunghi', color: SCURI };
        a.top = { style: 'camicia', color: '#EC4899', color2: '#F4F6F8', pattern: 'solid' };
        a.bag = { style: 'borsa', color: '#7C4A2D' };
        break;
      case 'papa':
        a.hair = { style: 'corti', color: SCURI };
        a.top = { style: 'polo', color: '#2547C4', color2: '#F4F6F8', pattern: 'solid' };
        a.facial = 'barba';
        break;
      case 'nonna':
        a.hair = { style: 'chignon', color: GRIGI };
        a.top = { style: 'maglietta', color: '#8B5CF6', color2: '#F4F6F8', pattern: 'solid' };
        a.pants = { style: 'gonna', color: '#1F2430', color2: '#F4F6F8', pattern: 'solid' };
        a.glasses = 'vista';
        break;
      case 'nonno':
        a.hair = { style: 'pelato', color: GRIGI };
        a.hat = { style: 'panama', color: '#FBBF24' };
        a.top = { style: 'camicia', color: '#9AA5B4', color2: '#F4F6F8', pattern: 'solid' };
        a.glasses = 'vista';
        a.facial = 'baffi';
        break;
      case 'ragazza':
        a.hair = { style: 'codino', color: BIONDI };
        a.top = { style: 'maglietta', color: '#EC4899', color2: '#F4F6F8', pattern: 'dots' };
        a.pants = { style: 'jeanscorti', color: '#2547C4', color2: '#F4F6F8', pattern: 'solid' };
        break;
      case 'ragazzo':
        a.hair = { style: 'ricci', color: SCURI };
        a.top = { style: 'maglietta', color: '#22C55E', color2: '#F4F6F8', pattern: 'stripes-h' };
        a.pants = { style: 'pantaloncini', color: '#1F2430', color2: '#F4F6F8', pattern: 'solid' };
        break;
      case 'baby':
        a.hair = { style: 'treccine', color: SCURI };
        a.hat = { style: 'cappellino', color: '#FBBF24' };
        a.top = { style: 'felpa', color: '#0EA5E9', color2: '#F4F6F8', pattern: 'solid' };
        break;
    }
    return a;
  }

  /* Avatar di partenza per chi viene appena aggiunto: SOLO le caratteristiche
     base del ruolo (capelli, silhouette), nessun accessorio e tinte neutre.
     Si sceglie con l'emoji e poi si cambia quel poco che serve: mettere già
     cappelli, occhiali e colori vivaci voleva dire toglierli ogni volta.
     `defaultFor` resta com'è: serve a completare gli avatar vecchi. */
  const NEUTRO = { top: '#9AA5B4', pants: '#1F2430', shoes: '#F4F6F8' };
  function baseFor(role) {
    const a = {
      role: role || 'altro',
      skin: SKINS[1],
      hair: { style: 'corti', color: '#4A2E1E' },
      hat: { style: 'none', color: '#E23D4B' },
      glasses: 'none',
      facial: 'none',
      top: { style: 'maglietta', color: NEUTRO.top, color2: '#F4F6F8', pattern: 'solid' },
      pants: { style: 'pantaloni', color: NEUTRO.pants, color2: '#F4F6F8', pattern: 'solid' },
      shoes: { style: 'sneakers', color: NEUTRO.shoes },
      bag: { style: 'none', color: '#7C4A2D' }
    };
    /* LA TESTA E' L'ARCHETIPO. Il taglio di capelli non si sceglie più
       dal pannello, quindi è qui che si decide: ogni ruolo deve avere
       una testa che si riconosce da lontano e da ferma, se no otto
       figurine sembrano la stessa persona vestita diversa.
       Barba e occhiali fanno parte della testa, non sono accessori da
       spuntare: sono quello che distingue il nonno dal papà. */
    const sotto = (stile) => ({ style: stile, color: NEUTRO.pants, color2: '#F4F6F8', pattern: 'solid' });
    switch (role) {
      case 'mamma':
        a.hair = { style: 'lunghi', color: SCURI };
        break;
      case 'papa':
        a.hair = { style: 'corti', color: SCURI };
        a.facial = 'barba';
        break;
      case 'nonna':
        a.hair = { style: 'chignon', color: GRIGI };
        a.glasses = 'vista';
        a.pants = sotto('gonna');
        break;
      case 'nonno':
        a.hair = { style: 'pelato', color: GRIGI };
        a.facial = 'baffi';
        a.glasses = 'vista';
        break;
      case 'ragazza':
        a.hair = { style: 'codino', color: BIONDI };
        a.pants = sotto('jeanscorti');
        break;
      case 'ragazzo':
        a.hair = { style: 'ricci', color: SCURI };
        a.pants = sotto('jeanscorti');
        break;
      case 'baby':
        a.hair = { style: 'treccine', color: SCURI };
        a.pants = sotto('jeans');
        break;
      default:
        a.hair = { style: 'medio', color: SCURI };
    }
    return a;
  }

  /* Completa avatar parziali e converte il vecchio formato (dress.enabled) */
  /* UN PEZZO SOPRA L'ALTRO, SALTANDO I BUCHI.
     Object.assign copia anche le chiavi che valgono `undefined`, e
     cosi' un capo salvato come { style: 'maglietta', color: undefined }
     cancellava il colore di serie invece di lasciarlo: la figura usciva
     con fill="undefined", cioe' un pezzo invisibile. Qui i buchi si
     saltano e sotto resta quello che c'era. */
  function fondi(base, sopra) {
    const out = Object.assign({}, base);
    if (sopra && typeof sopra === 'object') {
      Object.keys(sopra).forEach(k => {
        if (sopra[k] !== undefined && sopra[k] !== null) out[k] = sopra[k];
      });
    }
    return out;
  }
  /* Un colore che non e' un colore fa sparire il pezzo senza dire
     niente. Arrivano da dati vecchi, da un salvataggio interrotto o da
     un sincronismo storto: meglio il colore di serie che un buco. */
  const TINTA = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  function tinta(v, ripiego) {
    return (typeof v === 'string' && TINTA.test(v.trim())) ? v.trim() : ripiego;
  }

  function normalize(av, role) {
    const base = defaultFor(role || (av && av.role) || 'altro');
    if (!av || typeof av !== 'object') return base;
    const out = {
      /* Quali pezzi sono stati scelti a mano. Se manca del tutto sono
         DATI VECCHI, salvati prima che l'app se lo segnasse: in quel
         caso si mostra tutto, com'era, invece di svuotare la
         descrizione di chi e' gia' registrato. */
      scelti: av.scelti ? Object.assign({}, av.scelti) : undefined,
      role: av.role || base.role,
      skin: tinta(av.skin, base.skin),
      hair: fondi(base.hair, av.hair),
      hat: fondi(base.hat, av.hat),
      glasses: typeof av.glasses === 'string' ? av.glasses : base.glasses,
      facial: typeof av.facial === 'string' ? av.facial : base.facial,
      top: fondi(base.top, av.top),
      pants: fondi(base.pants, av.pants),
      shoes: fondi(base.shoes, av.shoes),
      bag: fondi(base.bag, av.bag)
    };
    /* le tinte si controllano una per una: e' l'ultimo posto in cui si
       puo' fermare un colore storto prima che diventi un pezzo
       invisibile addosso a qualcuno */
    out.hair.color = tinta(out.hair.color, base.hair.color);
    out.hat.color = tinta(out.hat.color, base.hat.color);
    out.top.color = tinta(out.top.color, base.top.color);
    out.top.color2 = tinta(out.top.color2, base.top.color2);
    out.pants.color = tinta(out.pants.color, base.pants.color);
    out.pants.color2 = tinta(out.pants.color2, base.pants.color2);
    out.shoes.color = tinta(out.shoes.color, base.shoes.color);
    out.bag.color = tinta(out.bag.color, base.bag.color);
    // vecchio modello: vestito lungo come flag separato
    if (av.dress && av.dress.enabled) {
      out.top = {
        style: 'vestito',
        color: av.dress.color || base.top.color,
        color2: av.dress.color2 || base.top.color2,
        pattern: av.dress.pattern || 'solid'
      };
    }
    // vecchi occhiali/barba impliciti nel ruolo
    if (!av.glasses && (out.role === 'nonna' || out.role === 'nonno')) out.glasses = 'vista';
    if (!av.facial && out.role === 'nonno') out.facial = 'baffi';
    // stili non più esistenti → ripiego sensato
    const OLD_HAIR = { boccoli: 'ricci', pelata: 'pelato' };
    if (OLD_HAIR[out.hair.style]) out.hair.style = OLD_HAIR[out.hair.style];
    /* chi ha un gilet addosso da ieri si ritrova il top: e' il capo che
       ha preso il suo posto, e sparire lo avrebbe rimesso in maglietta */
    if (out.top.style === 'gilet') out.top.style = 'top';
    if (!HAIR.some(h => h.key === out.hair.style)) out.hair.style = 'corti';
    /* i due capi tolti diventano quello a cui somigliavano: chi e' gia'
       registrato col maglione non si ritrova in maglietta a gennaio */
    const TOP_TOLTI = { maglione: 'manicalunga', giubbotto: 'giacca' };
    if (TOP_TOLTI[out.top.style]) out.top.style = TOP_TOLTI[out.top.style];
    if (!TOP.some(t => t.key === out.top.style)) out.top.style = 'maglietta';
    if (!PANTS.some(p => p.key === out.pants.style)) out.pants.style = 'pantaloni';
    if (!SHOES.some(s => s.key === out.shoes.style)) out.shoes.style = 'sneakers';
    if (!HAT.some(h => h.key === out.hat.style)) out.hat.style = 'none';
    if (!BAG.some(b => b.key === out.bag.style)) out.bag.style = 'none';
    return out;
  }

  /* inquadrature per le miniature dell'editor: si vede solo il pezzo */
  const ZONE = {
    /* la figura INTERA ma senza i fianchi vuoti: il disegno sta fra 14
       e 86, e i quattordici pixel per parte erano aria che rubava
       larghezza ai capi qui accanto. La figura non si taglia mai --
       gonna lunga e borsa a tracolla ci stanno dentro. */
    figura: '14 0 72 150',
    testa:  '22 2 56 62',
    viso:   '26 18 48 42',
    busto:  '18 52 64 58',
    gambe:  '20 88 60 52',
    piedi:  '26 112 48 40',
    lato:   '12 56 76 62'
  };

  /* ---------- disegno ---------- */
  let seq = 0;
  const EDGE = 'var(--sprite-edge)';

  function shade(hex, amt) {
    let c = String(hex || '#888').replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16);
    if (isNaN(n)) return hex;
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
    return '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]
      .map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* IL FILO DELLE CUCITURE DEI JEANS.
     Era giallo miele -- come sui jeans da negozio -- ma addosso a un
     capo di un altro colore quel giallo era l'unica cosa che si
     vedeva, e i jeans verdi sembravano cuciti d'oro. Adesso e' il
     colore del capo molto piu' scuro, come le cuciture in tinta.
     Su un capo gia' scurissimo si schiarisce invece di scurire: una
     cucitura nera su stoffa nera non e' una cucitura, e' niente. */
  function filoDenim(hex) {
    const c = toRgb(hex);
    if (!c) return shade(hex, -58);
    const lum = (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
    return lum < 72 ? shade(hex, 44) : shade(hex, -58);
  }

  /* Il colore della fantasia NON si sceglie: è quello del capo, schiarito
     o scurito. Sceglierlo a parte era una domanda in più al banco per una
     cosa che si può decidere da sola, e con la regola "chiaro su scuro,
     scuro su chiaro" il motivo si vede sempre. */
  function coloreFantasia(hex) {
    let c = String(hex || '#888').replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16);
    if (isNaN(n)) return '#FFFFFF';
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luce = (r * 299 + g * 587 + b * 114) / 1000;
    return shade(hex, luce > 150 ? -78 : 86);
  }

  function patternDef(color, pattern, id, color2) {
    color = color || '#888';
    color2 = coloreFantasia(color);
    if (!pattern || pattern === 'solid') return { fill: color, def: '' };
    let s = '', size = 10;
    if (pattern === 'stripes-h') {
      size = 9; s = `<rect width="9" height="9" fill="${color}"/><rect width="9" height="4.5" fill="${color2}"/>`;
    } else if (pattern === 'stripes-v') {
      size = 9; s = `<rect width="9" height="9" fill="${color}"/><rect width="4.5" height="9" fill="${color2}"/>`;
    } else if (pattern === 'dots') {
      size = 9; s = `<rect width="9" height="9" fill="${color}"/><circle cx="4.5" cy="4.5" r="2" fill="${color2}"/>`;
    } else if (pattern === 'plaid') {
      size = 12; s = `<rect width="12" height="12" fill="${color}"/><rect y="4" width="12" height="3" fill="${color2}" opacity="0.8"/><rect x="4" width="3" height="12" fill="${color2}" opacity="0.8"/>`;
    } else if (pattern === 'camo') {
      /* MIMETICO VERO: macchie che si INCASTRANO fra loro e arrivano
         fino ai bordi della tessera, in quattro toni.
         Prima erano otto macchioline tonde staccate, con in mezzo il
         colore del capo a fare da fondo: a occhio erano dei pois
         sfrangiati, non una mimetica. Una mimetica non ha un fondo --
         ha solo macchie -- e i bordi sono spezzati, non tondi. */
      size = 26;
      const scuro = shade(color, -38), chiaro = shade(color, 30);
      s = `<rect width="26" height="26" fill="${color}"/>
        <path d="M0 0 L10 0 L12.5 3 L9 6.5 L11 9.5 L6 11 L1.5 8.5 L0 5 Z" fill="${scuro}"/>
        <path d="M14 0 L26 0 L26 6 L22.5 8.5 L17 7 L14.5 3.5 Z" fill="${color2}"/>
        <path d="M0 12 L4 11 L7.5 14 L6.5 18.5 L3 21 L0 19.5 Z" fill="${chiaro}"/>
        <path d="M10.5 8.5 L15.5 9.5 L19 13 L17.5 17.5 L12 19 L8.5 15.5 Z" fill="${scuro}"/>
        <path d="M21.5 10 L26 8.5 L26 17 L23 19 L20 16 L21 12.5 Z" fill="${chiaro}"/>
        <path d="M0 22.5 L4.5 22 L9 24 L10 26 L0 26 Z" fill="${color2}"/>
        <path d="M13 21 L18.5 20.5 L22 23 L21.5 26 L12.5 26 Z" fill="${scuro}"/>
        <path d="M24 20.5 L26 20 L26 26 L23.5 26 Z" fill="${chiaro}"/>`;
    } else if (pattern === 'stars') {
      size = 14; s = `<rect width="14" height="14" fill="${color}"/><path d="M7 2.4 L8.3 5.8 L11.9 5.8 L9 8 L10.1 11.5 L7 9.3 L3.9 11.5 L5 8 L2.1 5.8 L5.7 5.8 Z" fill="${color2}"/>`;
    } else if (pattern === 'logo') {
      /* LA SCRITTA NON E' UNA FANTASIA DA RIPETERE: e' UNA stampa, in
         mezzo al capo. Ripetuta a tessere diventava una manciata di
         barre sparse su tutta la maglietta -- cioe' una fantasia a
         righe, che e' quella della porta accanto.
         Qui la stoffa resta tinta unita e la scritta la mette chi
         disegna il capo, al centro del petto (o della gamba): si
         restituisce solo il COLORE con cui scriverla. */
      return { fill: color, def: '', scritta: color2 };
    } else if (pattern === 'diag') {
      size = 10; s = `<rect width="10" height="10" fill="${color}"/><path d="M-3 3 L3 -3 M0 10 L10 0 M7 13 L13 7" stroke="${color2}" stroke-width="3.2"/>`;
    } else if (pattern === 'scacchi') {
      size = 12; s = `<rect width="12" height="12" fill="${color}"/><rect width="6" height="6" fill="${color2}"/><rect x="6" y="6" width="6" height="6" fill="${color2}"/>`;
    } else if (pattern === 'fiori') {
      /* cinque petali attorno a un cuore più scuro: si legge anche
         piccolo, che è quello che serve su una maglietta di trenta pixel */
      let f = '';
      const fiore = (cx, cy) => {
        let d = '';
        for (let k = 0; k < 5; k++) {
          const a2 = k * 72 * Math.PI / 180;
          d += `<circle cx="${(cx + 3.2 * Math.cos(a2)).toFixed(1)}" cy="${(cy + 3.2 * Math.sin(a2)).toFixed(1)}" r="2.6" fill="${color2}"/>`;
        }
        return d + `<circle cx="${cx}" cy="${cy}" r="1.9" fill="${shade(color2, -42)}"/>`;
      };
      f = fiore(6, 6) + fiore(16, 16);
      size = 22; s = `<rect width="22" height="22" fill="${color}"/>` + f;
    } else if (pattern === 'cuori') {
      size = 12; s = `<rect width="12" height="12" fill="${color}"/>` +
        `<path d="M6 9.4 C2.2 6.8 2.6 3.6 4.6 3.2 C5.5 3 6 3.8 6 4.4 C6 3.8 6.5 3 7.4 3.2 C9.4 3.6 9.8 6.8 6 9.4 Z" fill="${color2}"/>`;
    } else if (pattern === 'zigzag') {
      size = 12; s = `<rect width="12" height="12" fill="${color}"/>` +
        `<path d="M0 4 L3 1 L6 4 L9 1 L12 4 M0 10 L3 7 L6 10 L9 7 L12 10" stroke="${color2}" stroke-width="2" fill="none"/>`;
    } else if (pattern === 'animalier') {
      size = 15; s = `<rect width="15" height="15" fill="${color}"/>` +
        `<ellipse cx="4" cy="4" rx="2.4" ry="1.8" fill="${shade(color, -46)}"/>` +
        `<ellipse cx="11" cy="8" rx="2.2" ry="1.6" fill="${shade(color, -46)}"/>` +
        `<ellipse cx="6" cy="12" rx="2.4" ry="1.7" fill="${shade(color, -46)}"/>`;
    }
    return {
      fill: `url(#${id})`,
      def: `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${s}</pattern>`
    };
  }

  /* LA SCRITTA STAMPATA: due parole, una grossa con le lettere
     accennate da tre tacche del colore del capo, e una sottile sotto.
     E' quello che si vede su una maglietta a due metri: non si legge
     cosa c'e' scritto, si vede CHE c'e' scritto qualcosa. */
  function scritta(cx, cy, w, col, sfondo) {
    const n = (v) => Math.round(v * 100) / 100;
    const h = Math.max(2.6, w * 0.27);
    const x = cx - w / 2, y = cy - h;
    let out = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h * 0.4)}" fill="${col}"/>`;
    [0.3, 0.52, 0.74].forEach(f => {
      out += `<rect x="${n(x + w * f)}" y="${n(y - 0.3)}" width="${n(Math.max(0.5, w * 0.05))}" ` +
        `height="${n(h + 0.6)}" fill="${sfondo}"/>`;
    });
    const w2 = w * 0.58, h2 = Math.max(1.5, h * 0.48);
    out += `<rect x="${n(cx - w2 / 2)}" y="${n(y + h + h * 0.38)}" width="${n(w2)}" ` +
      `height="${n(h2)}" rx="${n(h2 / 2)}" fill="${col}"/>`;
    return out;
  }

  function build(av, opts) {
    av = normalize(av);
    opts = opts || {};
    const id = 'a' + (++seq);
    const skin = av.skin;
    const skinDark = shade(skin, -26);
    const hairCol = av.hair.color;
    const hairStyle = av.hair.style;
    /* "vestito" e' un abito normale e i sotto restano scegliebili (una
       gonna sopra i leggings si vede eccome); "vestito lungo" invece
       arriva ai piedi e i sotto non hanno piu' senso */
    const isDress = av.top.style === 'vestito' || av.top.style === 'vestitolungo';
    const vestitoLungo = av.top.style === 'vestitolungo';

    const topP = patternDef(av.top.color, av.top.pattern, id + 't', av.top.color2);
    const botP = patternDef(av.pants.color, av.pants.pattern, id + 'p', av.pants.color2);
    const defs = topP.def + botP.def;

    const line = `stroke="${EDGE}" stroke-width="1"`;

    /* --- capelli dietro --- */
    let hairBack = '';
    if (hairStyle === 'lunghi') {
      hairBack = `<path d="M27 34 C23 56 25 78 30 88 L70 88 C75 78 77 56 73 34 Z" fill="${shade(hairCol, -14)}"/>`;
    } else if (hairStyle === 'ricci') {
      /* RICCI LUNGHI: la cascata di boccoli scende fin sotto le spalle.
         Sono due tagli diversi, e la differenza si vede di spalle. */
      hairBack = `<circle cx="29" cy="46" r="9" fill="${shade(hairCol, -12)}"/><circle cx="71" cy="46" r="9" fill="${shade(hairCol, -12)}"/>
                  <circle cx="27" cy="60" r="8.5" fill="${shade(hairCol, -16)}"/><circle cx="73" cy="60" r="8.5" fill="${shade(hairCol, -16)}"/>
                  <circle cx="31" cy="72" r="7.5" fill="${shade(hairCol, -20)}"/><circle cx="69" cy="72" r="7.5" fill="${shade(hairCol, -20)}"/>`;
    } else if (hairStyle === 'riccimedi') {
      /* RICCI MEDI: i boccoli si fermano all'altezza delle orecchie */
      hairBack = `<circle cx="30" cy="46" r="9" fill="${shade(hairCol, -12)}"/><circle cx="70" cy="46" r="9" fill="${shade(hairCol, -12)}"/>`;
    } else if (hairStyle === 'treccine') {
      hairBack = `<path d="M28 36 L24 76" stroke="${shade(hairCol, -12)}" stroke-width="7" stroke-linecap="round"/><path d="M72 36 L76 76" stroke="${shade(hairCol, -12)}" stroke-width="7" stroke-linecap="round"/>`;
    } else if (hairStyle === 'chignon') {
      /* la crocchia della nonna: alta e ben staccata dalla testa, con
         due giri di piega, se no a piccolo sembrava un cappello */
      hairBack = `<ellipse cx="50" cy="13" rx="13" ry="11" fill="${shade(hairCol, -12)}"/>
                  <path d="M40 13 Q50 6 60 13 M41 17 Q50 23 59 17" stroke="${shade(hairCol, -30)}" stroke-width="1.3" fill="none" opacity=".8"/>`;
    } else if (hairStyle === 'codino') {
      /* la coda: parte da dietro l'orecchio e scende lunga di fianco.
         Prima era un ciuffetto corto che si perdeva sul bordo. */
      hairBack = `<path d="M72 30 Q90 40 86 72 Q80 78 78 70 Q84 48 66 38 Z" fill="${shade(hairCol, -10)}"/>
                  <ellipse cx="74" cy="33" rx="5" ry="4.5" fill="${shade(hairCol, 18)}"/>`;
    }

    /* --- gambe --- */
    const legTop = 98;
    let legs = '';
    if (vestitoLungo || av.pants.style === 'gonna' || av.pants.style === 'gonnalunga') {
      legs = `<rect x="40" y="112" width="8.5" height="28" rx="4" fill="${skin}"/>
              <rect x="51.5" y="112" width="8.5" height="28" rx="4" fill="${skin}"/>`;
    } else if (av.pants.style === 'pantaloncini' || av.pants.style === 'jeanscorti') {
      legs = `<rect x="39" y="110" width="9.5" height="30" rx="4.5" fill="${skin}"/>
              <rect x="51.5" y="110" width="9.5" height="30" rx="4.5" fill="${skin}"/>`;
    } else if (av.pants.style === 'tuta') {
      legs = `<rect x="40" y="128" width="8" height="12" rx="3.5" fill="${skin}"/>
              <rect x="52" y="128" width="8" height="12" rx="3.5" fill="${skin}"/>`;
    } else {
      legs = `<rect x="40" y="130" width="8" height="10" rx="3.5" fill="${skin}"/>
              <rect x="52" y="130" width="8" height="10" rx="3.5" fill="${skin}"/>`;
    }

    /* --- scarpe: forme ben diverse fra loro --- */
    const sh = av.shoes.color;
    const shD = shade(sh, -45);
    let shoes = '';
    if (av.shoes.style === 'sandali') {
      // piede scoperto con due fasce sopra
      shoes = `<ellipse cx="44" cy="141" rx="8.5" ry="4.5" fill="${skin}" ${line}/>
               <ellipse cx="56" cy="141" rx="8.5" ry="4.5" fill="${skin}" ${line}/>
               <path d="M37 139 L51 139 M36.5 142.5 L51.5 142.5" stroke="${sh}" stroke-width="2.8" stroke-linecap="round"/>
               <path d="M49 139 L63 139 M48.5 142.5 L63.5 142.5" stroke="${sh}" stroke-width="2.8" stroke-linecap="round"/>`;
    } else if (av.shoes.style === 'tacchi') {
      // punta affusolata e tacco alto e sottile
      shoes = `<path d="M34 136 Q42 136 48 139 L49 143 L34 143 Z" fill="${sh}" ${line}/>
               <rect x="45.5" y="143" width="3" height="8" rx="1" fill="${shD}"/>
               <path d="M52 139 Q58 136 66 136 L66 143 L51 143 Z" fill="${sh}" ${line}/>
               <rect x="62.5" y="143" width="3" height="8" rx="1" fill="${shD}"/>`;
    } else if (av.shoes.style === 'stivali') {
      // gambale alto fino a mezzo polpaccio, con risvolto
      shoes = `<path d="M37 120 L49 120 L49 143 L35 143 Z" fill="${sh}" ${line}/>
               <path d="M51 120 L63 120 L65 143 L51 143 Z" fill="${sh}" ${line}/>
               <rect x="35.5" y="120" width="14" height="5" fill="${shD}"/>
               <rect x="50.5" y="120" width="13" height="5" fill="${shD}"/>
               <path d="M34 141 L50 141 M50 141 L66 141" stroke="${shD}" stroke-width="3"/>`;
    } else if (av.shoes.style === 'ciabatte') {
      // suola spessa e una fascia sola sul collo del piede
      shoes = `<ellipse cx="44" cy="141.5" rx="9" ry="4" fill="${sh}" ${line}/>
               <ellipse cx="56" cy="141.5" rx="9" ry="4" fill="${sh}" ${line}/>
               <path d="M38 138.5 Q44 135 50 138.5" stroke="${shD}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
               <path d="M50 138.5 Q56 135 62 138.5" stroke="${shD}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
    } else if (av.shoes.style === 'scalzo') {
      shoes = `<ellipse cx="44" cy="141" rx="7.5" ry="4.5" fill="${skin}"/>
               <ellipse cx="56" cy="141" rx="7.5" ry="4.5" fill="${skin}"/>
               <circle cx="38.5" cy="140" r="1.5" fill="${skinDark}"/>
               <circle cx="61.5" cy="140" r="1.5" fill="${skinDark}"/>`;
    } else {
      // sneakers: punta tonda, suola chiara spessa, lacci
      shoes = `<path d="M34 133 L48 133 L49 140 Q49 143.5 45 143.5 L34 143.5 Z" fill="${sh}" ${line}/>
               <path d="M52 133 L66 133 L66 143.5 L55 143.5 Q51 143.5 51 140 Z" fill="${sh}" ${line}/>
               <path d="M33 141 L49.5 141 M50.5 141 L67 141" stroke="${shade(sh, 55)}" stroke-width="4" stroke-linecap="round"/>
               <path d="M37 135.5 L44 135.5 M37.5 138 L44.5 138" stroke="${shD}" stroke-width="1.4" stroke-linecap="round"/>
               <path d="M55 135.5 L62 135.5 M55.5 138 L62.5 138" stroke="${shD}" stroke-width="1.4" stroke-linecap="round"/>`;
    }

    /* --- pantaloni / gonna ---
       I SEGNI sono quelli dell'icona, uno per uno: se l'icona ha la
       cintura, i passanti e la cucitura al centro, ce li ha anche la
       figura, con le stesse tinte. Altrimenti scegli un capo a destra
       e sulla figura ne compare un altro. */
    const cb = av.pants.color;
    let bottom = '';
    if (!vestitoLungo) {
      if (av.pants.style === 'gonna') {
        // svasata, con l'orlo ben largo: cintura, tre pieghe, orlo
        bottom = `<path d="M34 96 L66 96 L75 122 L25 122 Z" fill="${botP.fill}" ${line}/>
                  <path d="M25 122 Q50 127 75 122" fill="${botP.fill}" ${line}/>
                  <path d="M34 99.6 L66 99.6" stroke="${shade(cb, -42)}" stroke-width="2.6"/>
                  <path d="M42 103 L36 120 M50 103 L50 123 M58 103 L64 120" stroke="${shade(cb, -26)}" stroke-width="1.6" opacity=".78"/>
                  <path d="M26.6 121.8 Q50 126.4 73.4 121.8" fill="none" stroke="${shade(cb, -30)}" stroke-width="1.6"/>`;
      } else if (av.pants.style === 'pantaloncini') {
        // corti, si fermano sopra il ginocchio: le gambe restano scoperte
        bottom = `<path d="M33 96 L67 96 L66 114 L53 114 L50 105 L47 114 L34 114 Z" fill="${botP.fill}" ${line}/>
                  <path d="M33 99.6 L67 99.6" stroke="${shade(cb, -42)}" stroke-width="2.4"/>
                  <path d="M34 112 L47 112 M53 112 L66 112" stroke="${shade(cb, -34)}" stroke-width="2.2"/>
                  <path d="M50 100.4 L50 105" stroke="${shade(cb, -30)}" stroke-width="1" opacity=".6"/>`;
      } else if (av.pants.style === 'leggings') {
        /* aderenti fino alla caviglia: si vede la gamba, non il tubo */
        bottom = `<path d="M35 96 L65 96 L63 138 L54 138 L50 108 L46 138 L37 138 Z" fill="${botP.fill}" ${line}/>
                  <path d="M35 99 L65 99" stroke="${shade(cb, -42)}" stroke-width="2.2"/>
                  <path d="M41 104 L40 134 M59 104 L60 134" stroke="${shade(cb, 34)}" stroke-width="1" opacity=".55"/>`;
      } else if (av.pants.style === 'gonnalunga') {
        bottom = `<path d="M34 96 L66 96 L79 134 L21 134 Z" fill="${botP.fill}" ${line}/>
                  <path d="M21 134 Q50 140 79 134" fill="${botP.fill}" ${line}/>
                  <path d="M34 99.6 L66 99.6" stroke="${shade(cb, -42)}" stroke-width="2.6"/>
                  <path d="M42 103 L33 131 M50 103 L50 133 M58 103 L67 131" stroke="${shade(cb, -26)}" stroke-width="1.6" opacity=".78"/>`;
      } else if (av.pants.style === 'tuta') {
        // larghi, con la banda chiara sul fianco, i laccetti e i polsini
        bottom = `<path d="M32 96 L68 96 L67 132 L53 132 L50 108 L47 132 L33 132 Z" fill="${botP.fill}" ${line}/>
                  <path d="M32 99.4 L68 99.4" stroke="${shade(cb, -42)}" stroke-width="3.2"/>
                  <path d="M48.4 99.6 L47.4 104.4 M51.6 99.6 L52.6 104.4" stroke="${shade(cb, -50)}" stroke-width="1.3" stroke-linecap="round"/>
                  <path d="M33.6 102 L34.6 129 M66.4 102 L65.4 129" stroke="${shade(cb, 62)}" stroke-width="2.6"/>
                  <path d="M33 128.6 L47.5 128.6 M52.5 128.6 L67 128.6" stroke="${shade(cb, -36)}" stroke-width="3.2"/>`;
      } else if (av.pants.style === 'jeans' || av.pants.style === 'jeanscorti') {
        /* I jeans si riconoscono dalla CUCITURA chiara, dai passanti e
           dai rivetti, non dal blu: uno puo' averli neri e restano
           jeans. Sono gli stessi cinque segni dell'icona. */
        /* il filo in tinta, molto piu' scuro del capo: lo stesso di
           AV.filoDenim che usa l'icona, se no icona e figura
           racconterebbero due paia di jeans diversi */
        const filo = filoDenim(cb);
        const corti = av.pants.style === 'jeanscorti';
        const giu = corti ? 116 : 134;
        const sagoma = corti
          ? `M33 96 L67 96 L66 ${giu} L53 ${giu} L50 106 L47 ${giu} L34 ${giu} Z`
          : `M34 96 L66 96 L64.5 ${giu} L52.5 ${giu} L50 108 L47.5 ${giu} L35.5 ${giu} Z`;
        bottom = `<path d="${sagoma}" fill="${botP.fill}" ${line}/>
                  <path d="M38 96 L38 100.6 M50 96 L50 100.6 M62 96 L62 100.6" stroke="${shade(cb, -40)}" stroke-width="1.9"/>
                  <path d="M34 100.4 L66 100.4" stroke="${shade(cb, -46)}" stroke-width="3"/>
                  <path d="M34 98.2 L66 98.2 M34 102.6 L66 102.6" stroke="${filo}" stroke-width="1.3" opacity="1"/>
                  <path d="M38 105 Q42.4 105 44.2 109.4" fill="none" stroke="${filo}" stroke-width="1.4" opacity="1"/>
                  <path d="M62 105 Q57.6 105 55.8 109.4" fill="none" stroke="${filo}" stroke-width="1.4" opacity="1"/>
                  <circle cx="37.6" cy="103.8" r="1.15" fill="${filo}"/>
                  <circle cx="62.4" cy="103.8" r="1.15" fill="${filo}"/>
                  <path d="M50 102.6 L50 ${corti ? 106 : 108}" stroke="${shade(cb, -32)}" stroke-width="1" opacity=".6"/>` +
          (corti
            ? `<path d="M34 ${giu - 3.4} L47 ${giu - 3.4} M53 ${giu - 3.4} L66 ${giu - 3.4}" stroke="${shade(cb, -38)}" stroke-width="3"/>
               <path d="M34 ${giu - 5.6} L47 ${giu - 5.6} M53 ${giu - 5.6} L66 ${giu - 5.6}" stroke="${filo}" stroke-width="1.5" opacity="1"/>`
            : `<path d="M40 104 L39.4 ${giu - 2.4} M60 104 L60.6 ${giu - 2.4}" stroke="${filo}" stroke-width="1.4" opacity="1"/>
               <path d="M36 ${giu - 2} L47.4 ${giu - 2} M52.6 ${giu - 2} L64 ${giu - 2}" stroke="${filo}" stroke-width="1.2" opacity="1"/>`);
      } else {
        // lunghi, dritti: cintura, cuciture laterali e quella al centro
        bottom = `<path d="M34 96 L66 96 L64.5 134 L52.5 134 L50 108 L47.5 134 L35.5 134 Z" fill="${botP.fill}" ${line}/>
                  <path d="M34 99.6 L66 99.6" stroke="${shade(cb, -42)}" stroke-width="2.4"/>
                  <path d="M40.6 103 L39.8 132 M59.4 103 L60.2 132" stroke="${shade(cb, -26)}" stroke-width="1.5" opacity=".8"/>
                  <path d="M50 100.4 L50 108" stroke="${shade(cb, -30)}" stroke-width="1" opacity=".6"/>`;
      }
    }

    /* --- braccia ---
       SENZA MANICHE: canotta, gilet e i vestiti -- le stesse icone che
       a destra mostrano le spalle scoperte.
       MANICHE LUNGHE: manica lunga, camicia, felpa, giacca, maglione e
       giubbotto -- nelle icone la manica arriva al polso, e qui deve
       arrivarci anche sulla figura. Prima la camicia e il maglione
       lasciavano l'avambraccio nudo: l'icona diceva una cosa e la
       figura un'altra. */
    const ct = av.top.color;
    const maniche = (TOP.find(t => t.key === av.top.style) || {}).maniche || 'corte';
    const sleeveless = maniche === 'nessuna';
    const armFill = sleeveless ? skin : topP.fill;
    const arms = `
      <path d="M30 72 Q25 74 25 82 L26 94 Q26 98 30 98 Q34 98 34 94 L34 78 Z" fill="${armFill}" ${line}/>
      <path d="M70 72 Q75 74 75 82 L74 94 Q74 98 70 98 Q66 98 66 94 L66 78 Z" fill="${armFill}" ${line}/>
      <circle cx="29" cy="100" r="5" fill="${skin}"/>
      <circle cx="71" cy="100" r="5" fill="${skin}"/>`;
    const manicheLunghe = maniche === 'lunghe';
    const armsSkin = (sleeveless || manicheLunghe) ? '' : `
      <path d="M25 88 Q25 96 29 96 Q33 96 33 92 L33 88 Z" fill="${skin}"/>
      <path d="M75 88 Q75 96 71 96 Q67 96 67 92 L67 88 Z" fill="${skin}"/>`;
    /* il POLSINO delle maniche lunghe e l'ORLO di quelle corte: sono i
       due trattini che nelle icone chiudono la manica */
    const polsi = sleeveless ? ''
      : manicheLunghe
        ? `<path d="M25.4 92.6 L33.6 92.6 M74.6 92.6 L66.4 92.6" stroke="${shade(ct, -32)}" stroke-width="2.2"/>`
        : `<path d="M25.2 87.6 L33.2 87.6 M74.8 87.6 L66.8 87.6" stroke="${shade(ct, -32)}" stroke-width="1.8"/>`;

    /* --- busto --- */
    let torso = '';
    const bodyTop = 68;
    if (isDress) {
      /* scollo, VITA segnata e orlo tondo: gli stessi tre segni
         dell'icona. Il lungo aggiunge le pieghe verticali, il corto
         quelle che si aprono verso l'orlo. */
      const orlo = vestitoLungo ? 136 : 114;
      const largo = vestitoLungo ? 78 : 71;
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 70 58 64 L66 ${bodyTop} L70 78 L66 82 L${largo} ${orlo} L${100 - largo} ${orlo} L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M${100 - largo} ${orlo - 1} Q50 ${orlo + 5} ${largo} ${orlo - 1}" fill="${topP.fill}" ${line}/>
               <path d="M42 64 Q50 71 58 64" fill="none" stroke="${shade(ct, -40)}" stroke-width="1.8"/>
               <path d="M33.6 91 Q50 94.6 66.4 91" fill="none" stroke="${shade(ct, -36)}" stroke-width="2.6"/>` +
        (vestitoLungo
          ? `<path d="M43 98 L39 ${orlo - 2} M50 98 L50 ${orlo + 1} M57 98 L61 ${orlo - 2}" stroke="${shade(ct, -24)}" stroke-width="1.2" opacity=".65"/>`
          : `<path d="M43 97 L36 ${orlo - 2} M57 97 L64 ${orlo - 2}" stroke="${shade(ct, -22)}" stroke-width="1.2" opacity=".6"/>`) +
        `<path d="M${101.6 - largo} ${orlo + 0.4} Q50 ${orlo + 4} ${largo - 1.6} ${orlo + 0.4}" fill="none" stroke="${shade(ct, -30)}" stroke-width="1.5"/>`;
    } else if (av.top.style === 'canotta') {
      // spalline strette e scollo largo, come nell'icona
      torso = `<path d="M40 66 Q50 72 60 66 L64 78 L64 102 L36 102 L36 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M40 66 Q50 72.6 60 66" fill="none" stroke="${shade(ct, -40)}" stroke-width="1.8"/>
               <path d="M40 66.6 L37.6 77 M60 66.6 L62.4 77" stroke="${shade(ct, -26)}" stroke-width="2.4" stroke-linecap="round"/>
               <path d="M36 99.6 Q50 101.6 64 99.6" fill="none" stroke="${shade(ct, -28)}" stroke-width="1.5"/>`;
    } else if (av.top.style === 'polo') {
      // colletto a V e la finta con DUE bottoni
      torso = `<path d="M34 ${bodyTop} L42 64 L50 70 L58 64 L66 ${bodyTop} L70 78 L66 82 L66 102 L34 102 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M42.9 64 L50 72 L57.1 64 L61.6 66.5 L50 76.3 L38.4 66.5 Z" fill="${shade(ct, 34)}" stroke="${shade(ct, -30)}" stroke-width="0.9"/>
               <path d="M47.2 72 L47.2 82 M52.8 72 L52.8 82" stroke="${shade(ct, -34)}" stroke-width="1.1"/>
               <circle cx="50" cy="74.6" r="1.2" fill="${shade(ct, -52)}"/>
               <circle cx="50" cy="79.8" r="1.2" fill="${shade(ct, -52)}"/>`;
    } else if (av.top.style === 'camicia') {
      // colletto pieno, TRE bottoni e il taschino: come l'icona
      torso = `<path d="M34 ${bodyTop} L42 64 L50 70 L58 64 L66 ${bodyTop} L70 78 L66 82 L66 102 L34 102 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M42.9 64 L50 73.2 L57.1 64 L62.4 66.9 L50 78.7 L37.6 66.9 Z" fill="${shade(ct, 38)}" stroke="${shade(ct, -30)}" stroke-width="0.9"/>
               <path d="M50 73.2 L50 102" stroke="${shade(ct, -38)}" stroke-width="2.2"/>
               <circle cx="50" cy="82.4" r="1.3" fill="${shade(ct, -54)}"/>
               <circle cx="50" cy="89.8" r="1.3" fill="${shade(ct, -54)}"/>
               <circle cx="50" cy="97.1" r="1.3" fill="${shade(ct, -54)}"/>
               <path d="M37.8 81.2 L44.6 81.2 L44.6 87.4 L37.8 87.4 Z" fill="none" stroke="${shade(ct, -30)}" stroke-width="1.3"/>`;
    } else if (av.top.style === 'giacca') {
      /* risvolti, abbottonatura al centro, due bottoni e le tasche:
         gli stessi cinque segni dell'icona */
      /* la CRAVATTA e' quello che la fa riconoscere da lontano: e' del
         colore della fantasia, cosi' stacca sempre dal capo qualunque
         tinta si scelga */
      const crav = coloreFantasia(ct);
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 70 58 64 L66 ${bodyTop} L70 78 L66 82 L66 103 L34 103 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M46 65 L50 73 L54 65 L54 78 L46 78 Z" fill="#F4F6F8" stroke="${shade(ct, -40)}" stroke-width="0.7"/>
               <path d="M47.4 70.6 L52.6 70.6 L54.4 74.4 L50 77 L45.6 74.4 Z" fill="${crav}" stroke="rgba(0,0,0,.35)" stroke-width="0.6"/>
               <path d="M46.8 76.4 L53.2 76.4 L55.4 95 L50 99 L44.6 95 Z" fill="${crav}" stroke="rgba(0,0,0,.3)" stroke-width="0.6"/>
               <path d="M44.7 64 L50 72.6 L41.1 76.3 L39.3 66.5 Z M55.3 64 L50 72.6 L58.9 76.3 L60.7 66.5 Z" fill="${shade(ct, -34)}" stroke="${shade(ct, -46)}" stroke-width="0.8"/>
               <path d="M35.8 87.3 L44.7 87.3 M64.2 87.3 L55.3 87.3" stroke="${shade(ct, -36)}" stroke-width="1.8"/>
               <circle cx="58.6" cy="86.1" r="1.5" fill="${shade(ct, -54)}"/>
               <circle cx="58.6" cy="92.2" r="1.5" fill="${shade(ct, -54)}"/>`;
    } else if (av.top.style === 'top') {
      /* IL TOP: senza maniche come la canotta, ma FEMMINILE -- scollo a
         V, spalline sottili, vita segnata. La canotta invece e' dritta,
         collo tondo e spalline larghe: messe una accanto all'altra si
         distinguono senza leggere il nome.
         Dietro c'e' la pelle: il V lascia scoperto un pezzo di petto, e
         senza qualcosa sotto li' si vedeva il vuoto. */
      torso = `<path d="M38 66 Q50 73 62 66 L64 102 L36 102 Z" fill="${skin}"/>
               <path d="M41 64.5 L45.5 63.5 L50 74 L54.5 63.5 L59 64.5 L64 78 L62 89 L64.5 102 L35.5 102 L38 89 L36 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M45.5 63.5 L50 74 L54.5 63.5" fill="none" stroke="${shade(ct, -40)}" stroke-width="1.6"/>
               <path d="M37 88.4 Q50 91 63 88.4" fill="none" stroke="${shade(ct, -34)}" stroke-width="1.8"/>
               <path d="M36.4 99.6 Q50 101.6 63.6 99.6" fill="none" stroke="${shade(ct, -28)}" stroke-width="1.5"/>`;
    } else if (av.top.style === 'felpa') {
      /* cappuccio dietro la testa, i due LACCETTI con gli occhielli,
         la tasca a marsupio e il fondo a costine */
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 69 58 64 L66 ${bodyTop} L70 78 L66 82 L66 104 L34 104 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M28 76 Q25 53 39 47 L61 47 Q75 53 72 76 Q50 82 28 76 Z" fill="${shade(ct, 26)}" ${line}/>
               <path d="M34 74 Q33 60 40 55 M66 74 Q67 60 60 55" fill="none" stroke="${shade(ct, -14)}" stroke-width="1.4" opacity=".8"/>
               <path d="M45.6 73.6 L44 82.4 M54.4 73.6 L56 82.4" stroke="${shade(ct, -44)}" stroke-width="1.4" stroke-linecap="round"/>
               <circle cx="45.6" cy="73.2" r="1.1" fill="${shade(ct, -50)}"/>
               <circle cx="54.4" cy="73.2" r="1.1" fill="${shade(ct, -50)}"/>
               <path d="M37.6 88 L62.4 88 L59.8 95.9 L40.2 95.9 Z" fill="none" stroke="${shade(ct, -34)}" stroke-width="1.4"/>
               <path d="M34 100.6 L66 100.6" stroke="${shade(ct, -34)}" stroke-width="3"/>`;
    } else {
      // maglietta e manica lunga: scollo tondo e orlo in fondo
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 70 58 64 L66 ${bodyTop} L70 78 L66 82 L66 102 L34 102 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M42.9 63.6 Q50 69.6 57.1 63.6" fill="none" stroke="${shade(ct, -40)}" stroke-width="1.8"/>
               <path d="M34 99.8 Q50 102 66 99.8" fill="none" stroke="${shade(ct, -28)}" stroke-width="1.6"/>`;
    }

    /* --- borse --- */
    let bag = '';
    let bagSopra = '';
    const bg = av.bag.color;
    if (av.bag.style === 'zaino') {
      /* UNO ZAINO VISTO DA DAVANTI SONO GLI SPALLACCI, non due strisce
         che spuntano ai fianchi: quelle sotto il braccio quasi non si
         vedevano, e chi guardava la figura non capiva se lo zaino ci
         fosse. Il sacco resta dietro -- si affaccia dai fianchi -- e le
         due bretelle passano DAVANTI al busto, con la fibbia in mezzo.
         Si disegnano dopo il busto e dopo le braccia: e' l'unico modo
         perche' si vedano. */
      bag = `<rect x="22" y="68" width="12" height="30" rx="5.5" fill="${shade(bg, -16)}" ${line}/>
             <rect x="66" y="68" width="12" height="30" rx="5.5" fill="${shade(bg, -16)}" ${line}/>`;
      bagSopra = `<path d="M43 67 L45 99 M57 67 L55 99" stroke="${bg}" stroke-width="5.4"
                    stroke-linecap="round" fill="none"/>
                  <path d="M43 67 L45 99 M57 67 L55 99" stroke="${shade(bg, -34)}" stroke-width="1.1"
                    stroke-linecap="round" fill="none" opacity=".5"/>
                  <rect x="43.6" y="82" width="12.8" height="4.6" rx="2.3" fill="${shade(bg, -30)}"/>`;
    } else if (av.bag.style === 'borsa') {
      bag = `<path d="M67 78 Q72 68 77 78" stroke="${bg}" stroke-width="2.4" fill="none"/>
             <rect x="64" y="78" width="17" height="18" rx="4" fill="${bg}" ${line}/>`;
    } else if (av.bag.style === 'marsupio') {
      bag = `<path d="M32 90 L68 90" stroke="${bg}" stroke-width="3" stroke-linecap="round"/>
             <rect x="42" y="86" width="20" height="11" rx="5" fill="${bg}" ${line}/>`;
    }

    /* --- testa --- */
    const neck = `<path d="M44 56 L56 56 L56 68 L44 68 Z" fill="${skinDark}"/>`;
    const head = `<ellipse cx="50" cy="40" rx="21.5" ry="22.5" fill="${skin}"/>
                  <ellipse cx="28.5" cy="42" rx="4" ry="5" fill="${skin}"/>
                  <ellipse cx="71.5" cy="42" rx="4" ry="5" fill="${skin}"/>`;

    /* --- viso --- */
    const eyeY = 40;
    const eyeR = (av.role === 'ragazzo' || av.role === 'ragazza') ? 3 : 2.6;
    let face = `
      <ellipse cx="42.5" cy="${eyeY}" rx="${eyeR}" ry="${eyeR + 0.4}" fill="#25282F"/>
      <ellipse cx="57.5" cy="${eyeY}" rx="${eyeR}" ry="${eyeR + 0.4}" fill="#25282F"/>
      <circle cx="43.4" cy="${eyeY - 1}" r="0.9" fill="#fff"/>
      <circle cx="58.4" cy="${eyeY - 1}" r="0.9" fill="#fff"/>
      <ellipse cx="34" cy="46" rx="4" ry="2.6" fill="#F2726F" opacity="0.30"/>
      <ellipse cx="66" cy="46" rx="4" ry="2.6" fill="#F2726F" opacity="0.30"/>`;
    // sopracciglia: danno espressione e leggibilità in piccolo
    face += `<path d="M38 33.5 Q42.5 31.4 47 33.5" stroke="${shade(hairCol, -18)}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
             <path d="M53 33.5 Q57.5 31.4 62 33.5" stroke="${shade(hairCol, -18)}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
    const mouthCol = (av.role === 'mamma' || av.role === 'ragazza' || av.role === 'nonna') ? '#D94A6A' : '#8A4B45';
    face += `<path d="M45 49 Q50 53.5 55 49" stroke="${mouthCol}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    if (av.role === 'nonna' || av.role === 'nonno') {
      face += `<path d="M33 50 Q35.5 51.6 38 50" stroke="${skinDark}" stroke-width="0.9" fill="none"/>
               <path d="M62 50 Q64.5 51.6 67 50" stroke="${skinDark}" stroke-width="0.9" fill="none"/>`;
    }

    /* --- barba / baffi --- */
    let facial = '';
    if (av.facial === 'baffi') {
      facial = `<path d="M43 46.5 Q50 44.6 57 46.5 Q50 49.4 43 46.5 Z" fill="${shade(hairCol, 6)}"/>`;
    } else if (av.facial === 'barba') {
      facial = `<path d="M30 40 Q31 62 50 63 Q69 62 70 40 Q66 52 50 52 Q34 52 30 40 Z" fill="${shade(hairCol, 6)}"/>
                <path d="M43 46.5 Q50 44.6 57 46.5 Q50 49.4 43 46.5 Z" fill="${shade(hairCol, 14)}"/>`;
    }

    /* --- capelli davanti ---
       LA CALOTTA E' PIU' LARGA DELLA TESTA. La testa e' un'ellisse
       21,5 x 22,5 col vertice a 17,5; le ciocche arrivavano esattamente
       li' -- e fra l'una e l'altra restava una mezzaluna di pelle
       scoperta, coi capelli corti e col papa' in particolare: da
       lontano sembravano tutti un po' stempiati.
       Adesso il bordo di sopra e' un mezzo cerchio CONCENTRICO alla
       testa ma piu' grande (24 x 25, vertice a 15), quindi copre
       sempre; quello che cambia da un taglio all'altro e' la frangia,
       cioe' quanta fronte si vede. */
    const calotta = (frangia) =>
      'M26 40 A24 25 0 0 1 74 40 Q69.5 ' + frangia + ' 50 ' + frangia +
      ' Q30.5 ' + frangia + ' 26 40 Z';
    let hair = '';
    if (hairStyle === 'pelato') {
      /* PELATO VUOL DIRE PELATO. Aveva la corona di capelli ai lati --
         il nonno stempiato -- ma "pelato" adesso e' una scelta fra sei
         tagli, e chi la tocca vuole una testa senza capelli, non una
         mezza calvizie. Resta solo il luccichio sul cranio, che e' la
         cosa che si vede davvero su una testa rasata. */
      hair = `<ellipse cx="42" cy="27" rx="7.5" ry="4.6" fill="#ffffff" opacity=".2" transform="rotate(-18 42 27)"/>`;
    } else if (hairStyle === 'corti') {
      hair = `<path d="${calotta(28)}" fill="${hairCol}"/>`;
    } else if (hairStyle === 'medio') {
      hair = `<path d="${calotta(27)}" fill="${hairCol}"/>
              <path d="M27 34 Q24 44 27 52" stroke="${hairCol}" stroke-width="6" fill="none" stroke-linecap="round"/>
              <path d="M73 34 Q76 44 73 52" stroke="${hairCol}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    } else if (hairStyle === 'lunghi') {
      hair = `<path d="${calotta(25)}" fill="${hairCol}"/>`;
    } else if (hairStyle === 'ricci' || hairStyle === 'riccimedi') {
      hair = `<circle cx="33" cy="30" r="8" fill="${hairCol}"/><circle cx="43" cy="21" r="9" fill="${hairCol}"/>
              <circle cx="57" cy="21" r="9" fill="${hairCol}"/><circle cx="67" cy="30" r="8" fill="${hairCol}"/>
              <circle cx="50" cy="24" r="9" fill="${hairCol}"/>`;
    } else if (hairStyle === 'codino') {
      /* la riga di lato: dice "coda" anche prima di vedere la coda */
      hair = `<path d="${calotta(27)}" fill="${hairCol}"/>
              <path d="M40 19 Q36 27 34 38" stroke="${shade(hairCol, 24)}" stroke-width="1.6" fill="none" opacity=".85"/>`;
    } else if (hairStyle === 'chignon') {
      /* tirati indietro, lisci, con le tempie scoperte: la testa della
         signora che ha i capelli raccolti */
      hair = `<path d="${calotta(25)}" fill="${hairCol}"/>
              <path d="M34 30 Q42 22 50 21 Q58 22 66 30" stroke="${shade(hairCol, 20)}" stroke-width="1.3" fill="none" opacity=".7"/>`;
    } else if (hairStyle === 'treccine') {
      hair = `<path d="${calotta(27)}" fill="${hairCol}"/>
              <path d="M36 24 L34 32 M44 20 L43 29 M56 20 L57 29 M64 24 L66 32" stroke="${shade(hairCol, 22)}" stroke-width="1.4" stroke-linecap="round"/>`;
    }

    /* --- occhiali --- */
    let glasses = '';
    if (av.glasses === 'vista') {
      glasses = `<circle cx="42.5" cy="${eyeY}" r="7" fill="none" stroke="#3E4A5C" stroke-width="1.6"/>
                 <circle cx="57.5" cy="${eyeY}" r="7" fill="none" stroke="#3E4A5C" stroke-width="1.6"/>
                 <path d="M49.5 ${eyeY} L50.5 ${eyeY}" stroke="#3E4A5C" stroke-width="1.6"/>
                 <path d="M35.5 ${eyeY} L29 ${eyeY - 1} M64.5 ${eyeY} L71 ${eyeY - 1}" stroke="#3E4A5C" stroke-width="1.4"/>`;
    } else if (av.glasses === 'sole') {
      glasses = `<path d="M34 36 L48 36 Q49 44 42 44 Q35 44 34 36 Z" fill="#20242C" ${line}/>
                 <path d="M52 36 L66 36 Q65 44 58 44 Q51 44 52 36 Z" fill="#20242C" ${line}/>
                 <path d="M48 37.5 L52 37.5" stroke="#20242C" stroke-width="2"/>
                 <path d="M34 36.5 L29 37 M66 36.5 L71 37" stroke="#20242C" stroke-width="1.6"/>`;
    }

    /* --- cappello --- */
    let hat = '';
    const hc = av.hat.color;
    if (av.hat.style === 'cappellino') {
      hat = `<path d="M28 30 Q28 10 50 10 Q72 10 72 30 Z" fill="${hc}" ${line}/>
             <path d="M70 28 Q88 28 89 34 Q76 37 69 33 Z" fill="${shade(hc, -22)}" ${line}/>
             <circle cx="50" cy="12" r="2.4" fill="${shade(hc, -30)}"/>`;
    } else if (av.hat.style === 'panama') {
      hat = `<ellipse cx="50" cy="28" rx="33" ry="7.5" fill="${hc}" ${line}/>
             <path d="M32 27 Q32 8 50 8 Q68 8 68 27 Z" fill="${shade(hc, 12)}" ${line}/>
             <path d="M32 24 Q50 30 68 24 L68 27 Q50 32 32 27 Z" fill="${shade(hc, -32)}"/>`;
    } else if (av.hat.style === 'bandana') {
      hat = `<path d="M27 32 Q28 14 50 14 Q72 14 73 32 Q50 22 27 32 Z" fill="${hc}" ${line}/>
             <path d="M71 28 L84 40 L70 37 Z" fill="${shade(hc, -14)}" ${line}/>`;
    } else if (av.hat.style === 'lana') {
      hat = `<path d="M28 32 Q28 10 50 10 Q72 10 72 32 Z" fill="${hc}" ${line}/>
             <rect x="26" y="28" width="48" height="8" rx="4" fill="${shade(hc, 26)}" ${line}/>
             <circle cx="50" cy="9" r="5" fill="${shade(hc, 26)}"/>`;
    }

    /* la stampa: al centro del petto e, per i capi di sotto, sulla
       coscia -- che e' dove la si vede su un pantalone della tuta */
    const scrittaSopra = topP.scritta
      ? scritta(50, isDress ? 90 : 87, isDress ? 21 : 22, topP.scritta, av.top.color) : '';
    const scrittaSotto = (!vestitoLungo && botP.scritta)
      ? scritta(50, 110, 19, botP.scritta, av.pants.color) : '';

    const w = opts.width || '100%';
    const h = opts.height || '100%';
    // opts.zona ritaglia l'inquadratura su una parte sola (stile Mii)
    const vb = opts.zona ? (ZONE[opts.zona] || '0 0 100 150') : '0 0 100 150';
    return `<svg viewBox="${vb}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="avatar" preserveAspectRatio="xMidYMid meet">
      <defs>${defs}</defs>
      ${hairBack}
      ${legs}${shoes}${bottom}${scrittaSotto}
      ${neck}
      ${bag}
      ${torso}${scrittaSopra}${arms}${armsSkin}${polsi}${bagSopra}
      ${head}${face}${facial}
      ${hair}${glasses}${hat}
    </svg>`;
  }

  /* ---------- tratti scritti ----------
     Ordinati per "quanto aiutano a riconoscere qualcuno da lontano". */
  /* Con soloScelti = true escono solo i pezzi che qualcuno ha davvero
     toccato: il resto e' il vestito di partenza del ruolo, non una cosa
     vista addosso alla persona. */
  function traits(av, max, soloScelti) {
    av = normalize(av);
    const scelti = av.scelti;
    // niente elenco = avatar vecchio: si dice tutto quello che si sa
    const vale = (parte) => !soloScelti || !scelti || scelti[parte] === true;
    const out = [];
    const push = (list, key, color, extra, parte) => {
      if (!vale(parte)) return;
      const it = findIn(list, key);
      if (!it || it.skip) return;
      const cn = color ? colorName(color, it.g) : '';
      out.push({
        em: it.em,
        txt: (it.noun + (extra || '') + (cn ? ' ' + cn : '')).trim(),
        color: color || null
      });
    };

    // ordine = quanto aiuta a riconoscere una persona da lontano:
    // prima cappello e colore della maglia, poi il resto
    push(HAT, av.hat.style, av.hat.color, '', 'cappello');

    /* la coda della fantasia, accordata col capo: «a righe», «a fiori»,
       «mimetico» o «mimetica» */
    const codaFantasia = (chiave, g) => {
      const pat = PATTERNS.find(p => p.key === chiave);
      let suf = pat && pat.suf ? pat.suf : '';
      if (suf === ' mimetic') suf = (g === 1 || g === 3) ? ' mimetica' : ' mimetico';
      return suf;
    };

    if (vale('maglietta')) {
      const topIt = findIn(TOP, av.top.style);
      out.push({
        em: topIt.em,
        txt: (topIt.noun + ' ' + colorName(av.top.color, topIt.g) +
          codaFantasia(av.top.pattern, topIt.g)).trim(),
        color: av.top.color
      });
    }

    push(BAG, av.bag.style, av.bag.color, '', 'borsa');
    /* IL SOTTO SI DICE ANCHE CON LA SUA FANTASIA -- una gonna a fiori
       si vedeva e non si poteva scrivere. Non si dice solo sotto il
       vestito LUNGO, che i pantaloni li copre fino ai piedi: il vestito
       corto invece lascia vedere quello che c’e’ sotto, e infatti il
       guardaroba lo fa scegliere. */
    if (av.top.style !== 'vestitolungo' && vale('pantaloni')) {
      const pIt = findIn(PANTS, av.pants.style);
      if (!pIt.skip) out.push({
        em: pIt.em,
        txt: (pIt.noun + ' ' + colorName(av.pants.color, pIt.g) +
          codaFantasia(av.pants.pattern, pIt.g)).trim(),
        color: av.pants.color
      });
    }
    push(GLASSES, av.glasses, null, '', 'occhiali');
    push(FACIAL, av.facial, null, '', 'occhiali');

    /* I CAPELLI SI DICONO PER QUELLO CHE HAI SCELTO, non per quello
       che l'avatar ha addosso. Il taglio ce l'hanno tutti fin dal
       ruolo -- e' l'archetipo, non una cosa vista -- quindi scegliendo
       solo il colore usciva "Capelli LUNGHI neri" su una persona di cui
       nessuno aveva guardato la lunghezza: all'uscita si cerca una
       chioma lunga e si trova un rasato.
         colore soltanto  -> "Capelli neri"
         taglio soltanto  -> "Capelli lunghi"
         tutti e due      -> "Capelli lunghi neri"  */
    if (vale('capelli') || vale('taglio')) {
      const hairIt = findIn(HAIR, av.hair.style);
      const conTaglio = vale('taglio');
      const conColore = vale('capelli');
      if (hairIt.bare && conTaglio) {
        out.push({ em: hairIt.em, txt: 'Pelato', color: null });
      } else {
        const nome = conTaglio && !hairIt.bare ? hairIt.noun : 'Capelli';
        const tinta = conColore ? colorName(av.hair.color, hairIt.g, HAIR_COLORS) : '';
        out.push({
          em: hairIt.em,
          txt: (nome + (tinta ? ' ' + tinta : '')).trim(),
          color: conColore ? av.hair.color : null
        });
      }
    }

    push(SHOES, av.shoes.style, av.shoes.color, '', 'scarpe');
    return max ? out.slice(0, max) : out;
  }

  global.AV = {
    COLORS, HAIR_COLORS, SKINS, PATTERNS,
    HAIR, HAT, GLASSES, FACIAL, TOP, PANTS, SHOES, BAG, ROLES,
    build, traits, normalize, defaultFor, baseFor, colorName, findIn, shade, coloreFantasia,
    filoDenim, scritta,
    /* la stoffa: serve alle icone dei capi, che devono mostrare la
       fantasia VERA e non una sua imitazione. Un solo posto dove sono
       definite le trame, cosi' l'icona e la figura non divergono mai. */
    tessuto: patternDef
  };
})(window);

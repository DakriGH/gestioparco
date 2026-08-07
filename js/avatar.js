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
    { c: '#0EA5E9', n: ['azzurro', 'azzurra', 'azzurri', 'azzurre'] },
    { c: '#3B5C88', n: ['jeans', 'jeans', 'jeans', 'jeans'] },
    { c: '#2547C4', n: ['blu', 'blu', 'blu', 'blu'] },
    { c: '#8B5CF6', n: ['viola', 'viola', 'viola', 'viola'] },
    { c: '#EC4899', n: ['rosa', 'rosa', 'rosa', 'rosa'] },
    { c: '#E3D2B4', n: ['beige', 'beige', 'beige', 'beige'] },
    { c: '#7C4A2D', n: ['marrone', 'marrone', 'marroni', 'marroni'] },
    { c: '#F4F6F8', n: ['bianco', 'bianca', 'bianchi', 'bianche'] },
    { c: '#9AA5B4', n: ['grigio', 'grigia', 'grigi', 'grigie'] },
    { c: '#1F2430', n: ['nero', 'nera', 'neri', 'nere'] }
  ];

  /* TRE colori, non otto. Al banco una persona si guarda per due
     secondi: fra "castano" e "castano chiaro" non sceglie nessuno, e
     otto pastiglie rallentavano senza aggiungere niente. Scuri, biondi,
     grigi: quello che si nota davvero da lontano.
     I colori vecchi non si perdono — colorName() prende il più vicino,
     quindi un avatar "biondo platino" di ieri resta biondo. */
  const HAIR_COLORS = [
    { c: '#2A1E16', n: ['scuro', 'scura', 'scuri', 'scure'] },
    { c: '#D8A657', n: ['biondo', 'bionda', 'biondi', 'bionde'] },
    { c: '#C9CDD3', n: ['grigio', 'grigia', 'grigi', 'grigie'] }
  ];
  const SCURI = HAIR_COLORS[0].c, BIONDI = HAIR_COLORS[1].c, GRIGI = HAIR_COLORS[2].c;

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
    { key: 'ricci', label: 'Ricci', em: '🧑‍🦱', g: 2, noun: 'Capelli ricci' },
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
    { key: 'gilet', label: 'Gilet', em: '🦺', g: 0, noun: 'Gilet', maniche: 'nessuna' },
    { key: 'maglione', label: 'Maglione', em: '🧶', g: 0, noun: 'Maglione', maniche: 'lunghe' },
    { key: 'giubbotto', label: 'Giubbotto', em: '🧥', g: 0, noun: 'Giubbotto', maniche: 'lunghe' },
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
      skin: av.skin || base.skin,
      hair: Object.assign({}, base.hair, av.hair),
      hat: Object.assign({}, base.hat, av.hat),
      glasses: typeof av.glasses === 'string' ? av.glasses : base.glasses,
      facial: typeof av.facial === 'string' ? av.facial : base.facial,
      top: Object.assign({}, base.top, av.top),
      pants: Object.assign({}, base.pants, av.pants),
      shoes: Object.assign({}, base.shoes, av.shoes),
      bag: Object.assign({}, base.bag, av.bag)
    };
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
    if (!HAIR.some(h => h.key === out.hair.style)) out.hair.style = 'corti';
    if (!TOP.some(t => t.key === out.top.style)) out.top.style = 'maglietta';
    if (!PANTS.some(p => p.key === out.pants.style)) out.pants.style = 'pantaloni';
    if (!SHOES.some(s => s.key === out.shoes.style)) out.shoes.style = 'sneakers';
    if (!HAT.some(h => h.key === out.hat.style)) out.hat.style = 'none';
    if (!BAG.some(b => b.key === out.bag.style)) out.bag.style = 'none';
    return out;
  }

  /* inquadrature per le miniature dell'editor: si vede solo il pezzo */
  const ZONE = {
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
      /* Macchie irregolari e di tre toni su una tessera grande: quello
         di prima erano due ellissi ripetute ogni dieci pixel e a
         guardarlo si vedeva la griglia, non la mimetica. */
      size = 30;
      const scuro = shade(color, -34), chiaro = shade(color, 30);
      s = `<rect width="30" height="30" fill="${color}"/>
        <path d="M2 5 Q7 1 12 4 Q16 8 11 11 Q5 13 2 9 Z" fill="${color2}"/>
        <path d="M18 2 Q25 0 28 5 Q29 10 24 11 Q19 10 17 6 Z" fill="${scuro}"/>
        <path d="M6 16 Q12 14 15 19 Q16 24 10 25 Q4 24 4 20 Z" fill="${chiaro}"/>
        <path d="M20 15 Q27 15 29 20 Q30 26 24 27 Q18 26 18 21 Z" fill="${color2}"/>
        <path d="M0 24 Q4 22 6 26 Q6 30 2 30 L0 30 Z" fill="${scuro}"/>
        <path d="M12 27 Q17 26 18 30 L11 30 Z" fill="${scuro}"/>
        <path d="M25 11 Q29 12 29 15 L24 14 Z" fill="${chiaro}"/>`;
    } else if (pattern === 'stars') {
      size = 14; s = `<rect width="14" height="14" fill="${color}"/><path d="M7 2.4 L8.3 5.8 L11.9 5.8 L9 8 L10.1 11.5 L7 9.3 L3.9 11.5 L5 8 L2.1 5.8 L5.7 5.8 Z" fill="${color2}"/>`;
    } else if (pattern === 'logo') {
      /* Una SCRITTA vera, non due barre: parole di lunghezza diversa,
         con le lettere appena accennate. Due rettangoli tondi si
         leggevano come righe, che e' la fantasia della porta accanto. */
      size = 26;
      const parola = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${color2}"/>`;
      s = `<rect width="26" height="26" fill="${color}"/>` +
        parola(3, 6.5, 6, 3) + parola(10.5, 6.5, 4, 3) + parola(16, 6.5, 7, 3) +
        parola(5, 12, 9, 3) + parola(15.5, 12, 5.5, 3) +
        parola(7.5, 17.5, 4, 2.4) + parola(13, 17.5, 8, 2.4);
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
        const filo = '#E3B04B';
        const corti = av.pants.style === 'jeanscorti';
        const giu = corti ? 116 : 134;
        const sagoma = corti
          ? `M33 96 L67 96 L66 ${giu} L53 ${giu} L50 106 L47 ${giu} L34 ${giu} Z`
          : `M34 96 L66 96 L64.5 ${giu} L52.5 ${giu} L50 108 L47.5 ${giu} L35.5 ${giu} Z`;
        bottom = `<path d="${sagoma}" fill="${botP.fill}" ${line}/>
                  <path d="M38 96 L38 100.6 M50 96 L50 100.6 M62 96 L62 100.6" stroke="${shade(cb, -40)}" stroke-width="1.9"/>
                  <path d="M34 100.4 L66 100.4" stroke="${shade(cb, -46)}" stroke-width="3"/>
                  <path d="M34 98.4 L66 98.4 M34 102.4 L66 102.4" stroke="${filo}" stroke-width="0.85" opacity=".9"/>
                  <path d="M38 105 Q42.4 105 44.2 109.4" fill="none" stroke="${filo}" stroke-width="0.95" opacity=".9"/>
                  <path d="M62 105 Q57.6 105 55.8 109.4" fill="none" stroke="${filo}" stroke-width="0.95" opacity=".9"/>
                  <circle cx="37.6" cy="103.8" r="0.9" fill="${filo}"/>
                  <circle cx="62.4" cy="103.8" r="0.9" fill="${filo}"/>
                  <path d="M50 102.6 L50 ${corti ? 106 : 108}" stroke="${shade(cb, -32)}" stroke-width="1" opacity=".6"/>` +
          (corti
            ? `<path d="M34 ${giu - 3.4} L47 ${giu - 3.4} M53 ${giu - 3.4} L66 ${giu - 3.4}" stroke="${shade(cb, -38)}" stroke-width="3"/>
               <path d="M34 ${giu - 5.4} L47 ${giu - 5.4} M53 ${giu - 5.4} L66 ${giu - 5.4}" stroke="${filo}" stroke-width="1.1" opacity=".9"/>`
            : `<path d="M40 104 L39.4 ${giu - 2.4} M60 104 L60.6 ${giu - 2.4}" stroke="${filo}" stroke-width="1.1" opacity=".85"/>
               <path d="M36 ${giu - 2} L47.4 ${giu - 2} M52.6 ${giu - 2} L64 ${giu - 2}" stroke="${filo}" stroke-width="0.75" opacity=".8"/>`);
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
    } else if (av.top.style === 'maglione') {
      /* lana grossa: collo, coste verticali e fondo a coste. Il
         polsino lo mette la regola delle maniche lunghe. */
      torso = `<path d="M34 ${bodyTop} L42 65 Q50 71 58 65 L66 ${bodyTop} L70 78 L66 82 L66 104 L34 104 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M42.9 64.4 Q50 70.1 57.1 64.4 Q58.9 67.7 50 72.6 Q41.1 67.7 42.9 64.4 Z" fill="${shade(ct, -24)}"/>
               <path d="M39.3 78 L39.3 96 M46.4 78 L46.4 96 M53.6 78 L53.6 96 M60.7 78 L60.7 96" stroke="${shade(ct, 30)}" stroke-width="1.9" opacity=".85"/>
               <path d="M34 99.4 L66 99.4" stroke="${shade(ct, -32)}" stroke-width="3.2"/>`;
    } else if (av.top.style === 'giubbotto') {
      // piumino: QUATTRO trapuntature, la zip e il bottone in alto
      torso = `<path d="M33 ${bodyTop} L42 64 Q50 70 58 64 L67 ${bodyTop} L71 78 L67 82 L67 105 L33 105 L33 82 L29 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M33.4 75 L66.6 75 M33.4 82.4 L66.6 82.4 M33.4 89.7 L66.6 89.7 M33.4 97.1 L66.6 97.1" stroke="${shade(ct, -32)}" stroke-width="1.4" opacity=".9"/>
               <path d="M50 66 L50 105" stroke="${shade(ct, -50)}" stroke-width="2.4"/>
               <circle cx="50" cy="70" r="1.7" fill="${shade(ct, 48)}"/>`;
    } else if (av.top.style === 'giacca') {
      /* risvolti, abbottonatura al centro, due bottoni e le tasche:
         gli stessi cinque segni dell'icona */
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 70 58 64 L66 ${bodyTop} L70 78 L66 82 L66 103 L34 103 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M44.7 64 L50 72.6 L41.1 76.3 L39.3 66.5 Z M55.3 64 L50 72.6 L58.9 76.3 L60.7 66.5 Z" fill="${shade(ct, -34)}" stroke="${shade(ct, -46)}" stroke-width="0.8"/>
               <path d="M50 72.6 L50 103" stroke="${shade(ct, -46)}" stroke-width="2.4"/>
               <path d="M35.8 87.3 L44.7 87.3 M64.2 87.3 L55.3 87.3" stroke="${shade(ct, -36)}" stroke-width="1.8"/>
               <circle cx="54.3" cy="86.1" r="1.5" fill="${shade(ct, -54)}"/>
               <circle cx="54.3" cy="92.2" r="1.5" fill="${shade(ct, -54)}"/>`;
    } else if (av.top.style === 'gilet') {
      // scollo a V, TRE bottoni e le due tasche
      torso = `<path d="M40 66 Q50 72 60 66 L64 78 L64 103 L36 103 L36 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M45.6 65 L50 72.6 L54.4 65 L57.8 66.4 L50 76.9 L42.2 66.4 Z" fill="${shade(ct, 30)}" stroke="${shade(ct, -30)}" stroke-width="0.8"/>
               <path d="M50 76.9 L50 101.5" stroke="${shade(ct, -38)}" stroke-width="1.9"/>
               <circle cx="50" cy="82.4" r="1.4" fill="${shade(ct, -54)}"/>
               <circle cx="50" cy="89.1" r="1.4" fill="${shade(ct, -54)}"/>
               <circle cx="50" cy="95.9" r="1.4" fill="${shade(ct, -54)}"/>
               <path d="M38 91 L43.8 91 M62 91 L56.2 91" stroke="${shade(ct, -32)}" stroke-width="1.6"/>`;
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
    const bg = av.bag.color;
    if (av.bag.style === 'zaino') {
      bag = `<path d="M36 66 Q34 62 38 60 M64 66 Q66 62 62 60" stroke="${bg}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
             <rect x="24" y="70" width="11" height="26" rx="5" fill="${bg}" ${line}/>
             <rect x="65" y="70" width="11" height="26" rx="5" fill="${bg}" ${line}/>`;
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

    /* --- capelli davanti --- */
    let hair = '';
    if (hairStyle === 'pelato') {
      /* la corona di capelli del nonno: sopra niente, ai lati una fascia
         piena che scende fin sopra l'orecchio. Due trattini sbiaditi non
         si vedevano, e il nonno sembrava un ragazzo rasato. */
      hair = `<path d="M28 44 Q27 30 32 25 Q30 36 31 46 Z" fill="${hairCol}"/>
              <path d="M72 44 Q73 30 68 25 Q70 36 69 46 Z" fill="${hairCol}"/>
              <path d="M28 40 Q29 31 34 27" stroke="${hairCol}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
              <path d="M72 40 Q71 31 66 27" stroke="${hairCol}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    } else if (hairStyle === 'corti') {
      hair = `<path d="M28 40 Q28 18 50 18 Q72 18 72 40 Q68 28 50 28 Q32 28 28 40 Z" fill="${hairCol}"/>`;
    } else if (hairStyle === 'medio') {
      hair = `<path d="M27 44 Q27 17 50 17 Q73 17 73 44 Q70 27 50 27 Q30 27 27 44 Z" fill="${hairCol}"/>
              <path d="M27 34 Q24 44 27 52" stroke="${hairCol}" stroke-width="6" fill="none" stroke-linecap="round"/>
              <path d="M73 34 Q76 44 73 52" stroke="${hairCol}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    } else if (hairStyle === 'lunghi') {
      hair = `<path d="M27 42 Q27 16 50 16 Q73 16 73 42 Q70 24 50 24 Q30 24 27 42 Z" fill="${hairCol}"/>`;
    } else if (hairStyle === 'ricci') {
      hair = `<circle cx="33" cy="30" r="8" fill="${hairCol}"/><circle cx="43" cy="21" r="9" fill="${hairCol}"/>
              <circle cx="57" cy="21" r="9" fill="${hairCol}"/><circle cx="67" cy="30" r="8" fill="${hairCol}"/>
              <circle cx="50" cy="24" r="9" fill="${hairCol}"/>`;
    } else if (hairStyle === 'codino') {
      /* la riga di lato: dice "coda" anche prima di vedere la coda */
      hair = `<path d="M28 40 Q28 17 50 17 Q72 17 72 40 Q68 27 50 27 Q32 27 28 40 Z" fill="${hairCol}"/>
              <path d="M40 19 Q36 27 34 38" stroke="${shade(hairCol, 24)}" stroke-width="1.6" fill="none" opacity=".85"/>`;
    } else if (hairStyle === 'chignon') {
      /* tirati indietro, lisci, con le tempie scoperte: la testa della
         signora che ha i capelli raccolti */
      hair = `<path d="M28 40 Q28 17 50 17 Q72 17 72 40 Q69 25 50 25 Q31 25 28 40 Z" fill="${hairCol}"/>
              <path d="M34 30 Q42 22 50 21 Q58 22 66 30" stroke="${shade(hairCol, 20)}" stroke-width="1.3" fill="none" opacity=".7"/>`;
    } else if (hairStyle === 'treccine') {
      hair = `<path d="M28 40 Q28 17 50 17 Q72 17 72 40 Q68 27 50 27 Q32 27 28 40 Z" fill="${hairCol}"/>
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

    const w = opts.width || '100%';
    const h = opts.height || '100%';
    // opts.zona ritaglia l'inquadratura su una parte sola (stile Mii)
    const vb = opts.zona ? (ZONE[opts.zona] || '0 0 100 150') : '0 0 100 150';
    return `<svg viewBox="${vb}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="avatar" preserveAspectRatio="xMidYMid meet">
      <defs>${defs}</defs>
      ${hairBack}
      ${legs}${shoes}${bottom}
      ${neck}
      ${bag}
      ${torso}${arms}${armsSkin}${polsi}
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

    if (vale('maglietta')) {
      const topIt = findIn(TOP, av.top.style);
      const pat = PATTERNS.find(p => p.key === av.top.pattern);
      let patSuf = pat && pat.suf ? pat.suf : '';
      if (patSuf === ' mimetic') patSuf = topIt.g === 1 || topIt.g === 3 ? ' mimetica' : ' mimetico';
      out.push({
        em: topIt.em,
        txt: (topIt.noun + ' ' + colorName(av.top.color, topIt.g) + patSuf).trim(),
        color: av.top.color
      });
    }

    push(BAG, av.bag.style, av.bag.color, '', 'borsa');
    if (av.top.style !== 'vestito') push(PANTS, av.pants.style, av.pants.color, '', 'pantaloni');
    push(GLASSES, av.glasses, null, '', 'occhiali');
    push(FACIAL, av.facial, null, '', 'occhiali');

    if (vale('capelli')) {
      const hairIt = findIn(HAIR, av.hair.style);
      if (hairIt.bare) {
        out.push({ em: hairIt.em, txt: 'Pelato', color: null });
      } else {
        out.push({
          em: hairIt.em,
          txt: (hairIt.noun + ' ' + colorName(av.hair.color, hairIt.g, HAIR_COLORS)).trim(),
          color: av.hair.color
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
    /* la stoffa: serve alle icone dei capi, che devono mostrare la
       fantasia VERA e non una sua imitazione. Un solo posto dove sono
       definite le trame, cosi' l'icona e la figura non divergono mai. */
    tessuto: patternDef
  };
})(window);

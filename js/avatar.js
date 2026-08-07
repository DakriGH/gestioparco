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
  const COLORS = [
    { c: '#E23D4B', n: ['rosso', 'rossa', 'rossi', 'rosse'] },
    { c: '#F97316', n: ['arancione', 'arancione', 'arancioni', 'arancioni'] },
    { c: '#FBBF24', n: ['giallo', 'gialla', 'gialli', 'gialle'] },
    { c: '#22C55E', n: ['verde', 'verde', 'verdi', 'verdi'] },
    { c: '#0EA5E9', n: ['azzurro', 'azzurra', 'azzurri', 'azzurre'] },
    { c: '#2547C4', n: ['blu', 'blu', 'blu', 'blu'] },
    { c: '#8B5CF6', n: ['viola', 'viola', 'viola', 'viola'] },
    { c: '#EC4899', n: ['rosa', 'rosa', 'rosa', 'rosa'] },
    { c: '#7C4A2D', n: ['marrone', 'marrone', 'marroni', 'marroni'] },
    { c: '#1F2430', n: ['nero', 'nera', 'neri', 'nere'] },
    { c: '#F4F6F8', n: ['bianco', 'bianca', 'bianchi', 'bianche'] },
    { c: '#9AA5B4', n: ['grigio', 'grigia', 'grigi', 'grigie'] }
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

  const PATTERNS = [
    { key: 'solid', n: 'Tinta unita', suf: '' },
    { key: 'stripes-h', n: 'Righe', suf: ' a righe' },
    { key: 'stripes-v', n: 'Righe vert.', suf: ' a righe' },
    { key: 'diag', n: 'Oblique', suf: ' a righe oblique' },
    { key: 'dots', n: 'Pois', suf: ' a pois' },
    { key: 'plaid', n: 'Quadretti', suf: ' a quadretti' },
    { key: 'scacchi', n: 'Scacchi', suf: ' a scacchi' },
    { key: 'fiori', n: 'Fiori', suf: ' a fiori' },
    { key: 'cuori', n: 'Cuori', suf: ' a cuori' },
    { key: 'zigzag', n: 'Zigzag', suf: ' a zigzag' },
    { key: 'animalier', n: 'Animalier', suf: ' animalier' },
    { key: 'camo', n: 'Mimetico', suf: ' mimetic' },
    { key: 'stars', n: 'Stelle', suf: ' a stelle' },
    { key: 'logo', n: 'Stampa', suf: ' con stampa' }
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

  const TOP = [
    { key: 'maglietta', label: 'Maglietta', em: '👕', g: 1, noun: 'Maglietta' },
    { key: 'manicalunga', label: 'Maniche lunghe', em: '🥼', g: 1, noun: 'Maglia a maniche lunghe' },
    { key: 'polo', label: 'Polo', em: '🎽', g: 1, noun: 'Polo' },
    { key: 'camicia', label: 'Camicia', em: '👔', g: 1, noun: 'Camicia' },
    { key: 'canotta', label: 'Canotta', em: '🎽', g: 1, noun: 'Canotta' },
    { key: 'felpa', label: 'Felpa', em: '🧥', g: 1, noun: 'Felpa' },
    { key: 'giacca', label: 'Giacca', em: '🧳', g: 1, noun: 'Giacca' },
    { key: 'gilet', label: 'Gilet', em: '🦺', g: 0, noun: 'Gilet' },
    { key: 'vestito', label: 'Vestito', em: '👗', g: 0, noun: 'Vestito', full: true }
  ];

  const PANTS = [
    { key: 'pantaloni', label: 'Lunghi', em: '👖', g: 2, noun: 'Pantaloni' },
    { key: 'pantaloncini', label: 'Corti', em: '🩳', g: 2, noun: 'Pantaloncini' },
    { key: 'jeans', label: 'Jeans', em: '👖', g: 2, noun: 'Jeans' },
    { key: 'jeanscorti', label: 'Jeans corti', em: '🩳', g: 2, noun: 'Jeans corti' },
    { key: 'gonna', label: 'Gonna', em: '👗', g: 1, noun: 'Gonna' },
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
      size = 16; s = `<rect width="16" height="16" fill="${color}"/><ellipse cx="4" cy="5" rx="4.5" ry="3.2" fill="${shade(color, -34)}"/><ellipse cx="12" cy="11" rx="4.5" ry="3.2" fill="${shade(color, 30)}"/>`;
    } else if (pattern === 'stars') {
      size = 14; s = `<rect width="14" height="14" fill="${color}"/><path d="M7 2.4 L8.3 5.8 L11.9 5.8 L9 8 L10.1 11.5 L7 9.3 L3.9 11.5 L5 8 L2.1 5.8 L5.7 5.8 Z" fill="${color2}"/>`;
    } else if (pattern === 'logo') {
      size = 20; s = `<rect width="20" height="20" fill="${color}"/><circle cx="10" cy="10" r="4.4" fill="none" stroke="${color2}" stroke-width="2"/>`;
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
          d += `<circle cx="${(cx + 2.1 * Math.cos(a2)).toFixed(1)}" cy="${(cy + 2.1 * Math.sin(a2)).toFixed(1)}" r="1.7" fill="${color2}"/>`;
        }
        return d + `<circle cx="${cx}" cy="${cy}" r="1.2" fill="${shade(color2, -42)}"/>`;
      };
      f = fiore(4, 4) + fiore(11, 11);
      size = 15; s = `<rect width="15" height="15" fill="${color}"/>` + f;
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
    const isDress = av.top.style === 'vestito';

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
    if (isDress || av.pants.style === 'gonna') {
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

    /* --- pantaloni / gonna --- */
    let bottom = '';
    if (!isDress) {
      if (av.pants.style === 'gonna') {
        // svasata, con l'orlo ben largo
        bottom = `<path d="M34 96 L66 96 L75 122 L25 122 Z" fill="${botP.fill}" ${line}/>
                  <path d="M25 122 Q50 127 75 122" fill="${botP.fill}" ${line}/>`;
      } else if (av.pants.style === 'pantaloncini') {
        // corti, si fermano sopra il ginocchio: le gambe restano scoperte
        bottom = `<path d="M33 96 L67 96 L66 114 L53 114 L50 105 L47 114 L34 114 Z" fill="${botP.fill}" ${line}/>
                  <path d="M34 112 L47 112 M53 112 L66 112" stroke="${shade(av.pants.color, -40)}" stroke-width="1.6"/>`;
      } else if (av.pants.style === 'tuta') {
        // larghi, con la banda chiara sul fianco e i polsini
        bottom = `<path d="M32 96 L68 96 L67 132 L53 132 L50 108 L47 132 L33 132 Z" fill="${botP.fill}" ${line}/>
                  <path d="M33.5 98 L34.5 130 M66.5 98 L65.5 130" stroke="${shade(av.pants.color, 60)}" stroke-width="2.6"/>
                  <path d="M33 128 L47.5 128 M52.5 128 L67 128" stroke="${shade(av.pants.color, -40)}" stroke-width="3.4"/>`;
      } else if (av.pants.style === 'jeans' || av.pants.style === 'jeanscorti') {
        /* I jeans si riconoscono dalla CUCITURA chiara e dai rivetti,
           non dal blu: uno puo' averli neri e restano jeans. Quindi il
           filo e' sempre color miele e le tasche si vedono. */
        const filo = '#E3B04B';
        const corti = av.pants.style === 'jeanscorti';
        const giu = corti ? 116 : 134;
        const sagoma = corti
          ? `M33 96 L67 96 L66 ${giu} L53 ${giu} L50 106 L47 ${giu} L34 ${giu} Z`
          : `M34 96 L66 96 L64.5 ${giu} L52.5 ${giu} L50 108 L47.5 ${giu} L35.5 ${giu} Z`;
        bottom = `<path d="${sagoma}" fill="${botP.fill}" ${line}/>
                  <path d="M34 100 L66 100" stroke="${shade(av.pants.color, -42)}" stroke-width="3"/>
                  <path d="M34 98.5 L66 98.5 M34 101.8 L66 101.8" stroke="${filo}" stroke-width="0.8" opacity=".85"/>
                  <path d="M38 104 Q42 104 43.5 108" stroke="${filo}" stroke-width="0.9" fill="none" opacity=".8"/>
                  <path d="M62 104 Q58 104 56.5 108" stroke="${filo}" stroke-width="0.9" fill="none" opacity=".8"/>
                  <circle cx="37.6" cy="103.4" r="0.85" fill="${filo}"/>
                  <circle cx="62.4" cy="103.4" r="0.85" fill="${filo}"/>
                  <path d="M50 102 L50 ${giu - 4}" stroke="${shade(av.pants.color, -30)}" stroke-width="1" opacity=".55"/>` +
          (corti
            ? `<path d="M34 ${giu - 4} L47 ${giu - 4} M53 ${giu - 4} L66 ${giu - 4}" stroke="${shade(av.pants.color, -34)}" stroke-width="3.2"/>`
            : `<path d="M36.5 ${giu - 2} L47.5 ${giu - 2} M52.5 ${giu - 2} L64.5 ${giu - 2}" stroke="${filo}" stroke-width="0.8" opacity=".7"/>`);
      } else {
        // lunghi, dritti, con la cucitura al centro
        bottom = `<path d="M34 96 L66 96 L64.5 134 L52.5 134 L50 108 L47.5 134 L35.5 134 Z" fill="${botP.fill}" ${line}/>
                  <path d="M41 100 L40 132 M59 100 L60 132" stroke="${shade(av.pants.color, -34)}" stroke-width="1.2" opacity=".7"/>
                  <path d="M34 99.5 L66 99.5" stroke="${shade(av.pants.color, -40)}" stroke-width="2.4"/>`;
      }
    }

    /* --- braccia --- */
    const sleeveless = av.top.style === 'canotta' || isDress;
    const armFill = sleeveless ? skin : topP.fill;
    const arms = `
      <path d="M30 72 Q25 74 25 82 L26 94 Q26 98 30 98 Q34 98 34 94 L34 78 Z" fill="${armFill}" ${line}/>
      <path d="M70 72 Q75 74 75 82 L74 94 Q74 98 70 98 Q66 98 66 94 L66 78 Z" fill="${armFill}" ${line}/>
      <circle cx="29" cy="100" r="5" fill="${skin}"/>
      <circle cx="71" cy="100" r="5" fill="${skin}"/>`;
    /* con le maniche lunghe (e con la giacca) l'avambraccio NON si
       scopre: è l'unica differenza che si vede, ma si vede */
    const manicheLunghe = av.top.style === 'manicalunga' || av.top.style === 'giacca';
    const armsSkin = (sleeveless || manicheLunghe) ? '' : `
      <path d="M25 88 Q25 96 29 96 Q33 96 33 92 L33 88 Z" fill="${skin}"/>
      <path d="M75 88 Q75 96 71 96 Q67 96 67 92 L67 88 Z" fill="${skin}"/>`;

    /* --- busto --- */
    let torso = '';
    const bodyTop = 68;
    if (isDress) {
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 70 58 64 L66 ${bodyTop} L70 78 L66 82 L72 118 L28 118 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>`;
    } else if (av.top.style === 'canotta') {
      torso = `<path d="M40 66 Q50 72 60 66 L64 78 L64 102 L36 102 L36 78 Z" fill="${topP.fill}" ${line}/>`;
    } else if (av.top.style === 'polo') {
      torso = `<path d="M34 ${bodyTop} L42 64 L50 70 L58 64 L66 ${bodyTop} L70 78 L66 82 L66 102 L34 102 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M44 64 L50 73 L56 64" fill="none" stroke="${shade(av.top.color, -46)}" stroke-width="1.6"/>
               <circle cx="50" cy="78" r="1.1" fill="${shade(av.top.color, -46)}"/>`;
    } else if (av.top.style === 'camicia') {
      torso = `<path d="M34 ${bodyTop} L42 64 L50 70 L58 64 L66 ${bodyTop} L70 78 L66 82 L66 102 L34 102 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M43 64 L50 72 L57 64" fill="none" stroke="${shade(av.top.color, -46)}" stroke-width="2"/>
               <line x1="50" y1="72" x2="50" y2="102" stroke="${shade(av.top.color, -46)}" stroke-width="1.4"/>
               <circle cx="50" cy="82" r="1.1" fill="${shade(av.top.color, -46)}"/>
               <circle cx="50" cy="92" r="1.1" fill="${shade(av.top.color, -46)}"/>`;
    } else if (av.top.style === 'giacca') {
      /* aperta davanti, coi risvolti: da lontano si distingue dalla
         camicia perché si vede la maglia sotto */
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 70 58 64 L66 ${bodyTop} L70 78 L66 82 L66 103 L34 103 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M44 65 L50 76 L56 65 L58 66 L52 103 L48 103 L42 66 Z" fill="${shade(av.top.color, 36)}"/>
               <path d="M42 65 L50 77 L44 80 Z M58 65 L50 77 L56 80 Z" fill="${shade(av.top.color, -34)}"/>`;
    } else if (av.top.style === 'gilet') {
      torso = `<path d="M40 66 Q50 72 60 66 L64 78 L64 103 L36 103 L36 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M46 67 L50 78 L54 67 L52 103 L48 103 Z" fill="${shade(av.top.color, 32)}"/>
               <circle cx="50" cy="86" r="1.1" fill="${shade(av.top.color, -46)}"/>
               <circle cx="50" cy="94" r="1.1" fill="${shade(av.top.color, -46)}"/>`;
    } else if (av.top.style === 'felpa') {
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 69 58 64 L66 ${bodyTop} L70 78 L66 82 L66 104 L34 104 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>
               <path d="M40 63 Q50 58 60 63 Q50 74 40 63 Z" fill="${shade(av.top.color, -22)}" ${line}/>
               <path d="M44 90 L56 90 L56 98 L44 98 Z" fill="${shade(av.top.color, -16)}"/>`;
    } else {
      torso = `<path d="M34 ${bodyTop} L42 64 Q50 70 58 64 L66 ${bodyTop} L70 78 L66 82 L66 102 L34 102 L34 82 L30 78 Z" fill="${topP.fill}" ${line}/>`;
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
      ${torso}${arms}${armsSkin}
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

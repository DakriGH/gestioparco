/* ============================================================
   GESTIOPARCO — le icone dei capi
   Ogni capo disegnato DA SOLO, steso come in vetrina. Deve bastare
   l'icona: se devo leggere il nome sotto per capire che è una polo,
   l'icona non ha fatto il suo mestiere.

   Il colore e la FANTASIA sono quelli veri — la trama arriva da
   AV.tessuto(), lo stesso posto da cui la prende la figura, così
   l'icona e l'avatar non possono raccontare due cose diverse.

   Griglia: viewBox 0 0 48 48. Le spalle stanno a y 10, l'orlo a y 39;
   i capi di sotto partono dalla cintura a y 8. Tenere queste quote fa
   sì che una fila di icone sembri una fila di vestiti appesi, e non
   una raccolta di forme di misure diverse.
   ============================================================ */
(function (global) {
  'use strict';

  let seq = 0;
  const sc = (c, q) => (global.AV && AV.shade ? AV.shade(c, q) : c);

  /* Il capo si costruisce in tre strati:
       sagoma  — la stoffa, che porta colore e fantasia
       ombra   — una piega sola, sul lato sinistro, per dare volume
       segni   — colletto, bottoni, cuciture, tasche: è QUI che il capo
                 si riconosce, e vanno pochi e netti */
  function tee(c, maniche) {
    const lungo = maniche === 'lunghe';
    const corpo = lungo
      ? 'M17 10 L20 7.5 Q24 11 28 7.5 L31 10 L41 15 L38 34 L33 33 L33 39 Q24 41 15 39 L15 33 L10 34 L7 15 Z'
      : 'M17 10 L20 7.5 Q24 11 28 7.5 L31 10 L41 16 L36.5 22.5 L33 20.5 L33 39 Q24 41 15 39 L15 20.5 L11.5 22.5 L7 16 Z';
    return {
      sagoma: corpo,
      ombra: lungo ? 'M15 33 L10 34 L7 15 L17 10 L15 20 Z' : 'M15 20.5 L11.5 22.5 L7 16 L17 10 L15 14 Z',
      segni: `<path d="M20 7.5 Q24 12 28 7.5" fill="none" stroke="${sc(c, -40)}" stroke-width="1.3"/>` +
        (lungo
          ? `<path d="M8.6 30 L14.4 31 M39.4 30 L33.6 31" stroke="${sc(c, -32)}" stroke-width="1.5"/>`
          : `<path d="M12.4 20.6 L15 21 M35.6 20.6 L33 21" stroke="${sc(c, -32)}" stroke-width="1.4"/>`) +
        `<path d="M15 37.4 Q24 39.2 33 37.4" fill="none" stroke="${sc(c, -28)}" stroke-width="1.1" opacity=".8"/>`
    };
  }

  const CAPI = {
    /* ---------- sopra ---------- */
    maglietta: (c) => tee(c, 'corte'),
    manicalunga: (c) => tee(c, 'lunghe'),

    polo: (c) => ({
      sagoma: 'M17 10 L20 8 L28 8 L31 10 L41 16 L36.5 22.5 L33 20.5 L33 39 Q24 41 15 39 L15 20.5 L11.5 22.5 L7 16 Z',
      ombra: 'M15 20.5 L11.5 22.5 L7 16 L17 10 L15 14 Z',
      segni: `<path d="M20 8 L24 14.5 L28 8 L30.5 9.4 L24 18 L17.5 9.4 Z" fill="${sc(c, 34)}" stroke="${sc(c, -30)}" stroke-width="0.7"/>
              <path d="M22.4 14 L22.4 22.5 M25.6 14 L25.6 22.5" stroke="${sc(c, -34)}" stroke-width="0.9"/>
              <circle cx="24" cy="16.6" r="1" fill="${sc(c, -52)}"/>
              <circle cx="24" cy="20.8" r="1" fill="${sc(c, -52)}"/>
              <path d="M12.4 20.6 L15 21 M35.6 20.6 L33 21" stroke="${sc(c, -32)}" stroke-width="1.4"/>`
    }),

    camicia: (c) => ({
      sagoma: 'M17 10 L20 8 L28 8 L31 10 L41 16 L38 33 L33 32 L33 39 Q24 41 15 39 L15 32 L10 33 L7 16 Z',
      ombra: 'M15 32 L10 33 L7 16 L17 10 L15 20 Z',
      segni: `<path d="M20 8 L24 15.5 L28 8 L31 10.4 L24 20 L17 10.4 Z" fill="${sc(c, 38)}" stroke="${sc(c, -30)}" stroke-width="0.7"/>
              <path d="M24 15.5 L24 39" stroke="${sc(c, -38)}" stroke-width="1.5"/>
              <circle cx="24" cy="23" r="0.95" fill="${sc(c, -54)}"/>
              <circle cx="24" cy="29" r="0.95" fill="${sc(c, -54)}"/>
              <circle cx="24" cy="35" r="0.95" fill="${sc(c, -54)}"/>
              <path d="M17 22 L21 22 L21 27 L17 27 Z" fill="none" stroke="${sc(c, -30)}" stroke-width="0.9"/>
              <path d="M9.4 29.4 L14 30.4 M38.6 29.4 L34 30.4" stroke="${sc(c, -32)}" stroke-width="1.5"/>`
    }),

    canotta: (c) => ({
      sagoma: 'M18 8 L20.5 7.5 Q24 14 27.5 7.5 L30 8 L31.5 17 L33 39 Q24 41 15 39 L16.5 17 Z',
      ombra: 'M16.5 17 L18 8 L20.5 7.5 L19 16 L18 38 L15 39 Z',
      segni: `<path d="M20.5 7.5 Q24 14 27.5 7.5" fill="none" stroke="${sc(c, -40)}" stroke-width="1.3"/>
              <path d="M18 8 L16.8 15 M30 8 L31.2 15" stroke="${sc(c, -26)}" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M15 37.4 Q24 39.2 33 37.4" fill="none" stroke="${sc(c, -28)}" stroke-width="1.1" opacity=".8"/>`
    }),

    /* la felpa ha le maniche LUNGHE -- sulla figura arrivano al polso,
       e l'icona deve dire la stessa cosa */
    felpa: (c) => ({
      sagoma: 'M16 11 L20 8 Q24 11 28 8 L32 11 L42 17 L39 34 L34 33 L34 39 Q24 41.5 14 39 L14 33 L9 34 L6 17 Z',
      ombra: 'M14 33 L9 34 L6 17 L16 11 L14 20 Z',
      segni: `<path d="M18 8 Q24 18 30 8 Q33 11 31 15 Q24 21 17 15 Q15 11 18 8 Z" fill="${sc(c, 26)}" stroke="${sc(c, -30)}" stroke-width="0.8"/>
              <path d="M21.5 15.5 L20.6 23 M26.5 15.5 L27.4 23" stroke="${sc(c, -44)}" stroke-width="1.2" stroke-linecap="round"/>
              <circle cx="21.5" cy="15.4" r="0.8" fill="${sc(c, -50)}"/>
              <circle cx="26.5" cy="15.4" r="0.8" fill="${sc(c, -50)}"/>
              <path d="M17 27.5 L31 27.5 L29.5 34 L18.5 34 Z" fill="none" stroke="${sc(c, -34)}" stroke-width="1.1"/>
              <path d="M9.6 30.6 L14.4 31.6 M38.4 30.6 L33.6 31.6" stroke="${sc(c, -34)}" stroke-width="1.6"/>
              <path d="M14 36.5 L34 36.5" stroke="${sc(c, -34)}" stroke-width="2.4"/>`
    }),

    giacca: (c) => ({
      sagoma: 'M16 10 L21 8 L24 15 L27 8 L32 10 L42 16 L39 34 L34 33 L34 39 Q24 41 14 39 L14 33 L9 34 L6 16 Z',
      ombra: 'M14 33 L9 34 L6 16 L16 10 L14 20 Z',
      segni: `<path d="M21 8 L24 15 L19 18 L18 10 Z M27 8 L24 15 L29 18 L30 10 Z" fill="${sc(c, -34)}" stroke="${sc(c, -46)}" stroke-width="0.6"/>
              <path d="M24 15 L24 39" stroke="${sc(c, -46)}" stroke-width="1.7"/>
              <path d="M16 27 L21 27 M32 27 L27 27" stroke="${sc(c, -36)}" stroke-width="1.3"/>
              <circle cx="26.4" cy="26" r="1.1" fill="${sc(c, -54)}"/>
              <circle cx="26.4" cy="31" r="1.1" fill="${sc(c, -54)}"/>
              <path d="M9.4 30.4 L14 31.4 M38.6 30.4 L34 31.4" stroke="${sc(c, -34)}" stroke-width="1.5"/>`
    }),

    gilet: (c) => ({
      sagoma: 'M18 8 L21.5 7.5 L24 15 L26.5 7.5 L30 8 L32 17 L32.5 36 L24 39.5 L15.5 36 L16 17 Z',
      ombra: 'M16 17 L18 8 L21.5 7.5 L19.5 16 L18.5 35 L15.5 36 Z',
      segni: `<path d="M21.5 7.5 L24 15 L26.5 7.5 L28.4 8.4 L24 18.5 L19.6 8.4 Z" fill="${sc(c, 30)}" stroke="${sc(c, -30)}" stroke-width="0.7"/>
              <path d="M24 18.5 L24 38.6" stroke="${sc(c, -38)}" stroke-width="1.3"/>
              <circle cx="24" cy="23" r="1.05" fill="${sc(c, -54)}"/>
              <circle cx="24" cy="28.5" r="1.05" fill="${sc(c, -54)}"/>
              <circle cx="24" cy="34" r="1.05" fill="${sc(c, -54)}"/>
              <path d="M17 30 L20.5 30 M31 30 L27.5 30" stroke="${sc(c, -32)}" stroke-width="1.1"/>`
    }),

    maglione: (c) => ({
      sagoma: 'M17 10 L20 8 Q24 12 28 8 L31 10 L41 16 L38 33 L33 32 L33 39 Q24 41 15 39 L15 32 L10 33 L7 16 Z',
      ombra: 'M15 32 L10 33 L7 16 L17 10 L15 20 Z',
      segni: `<path d="M20 8 Q24 13 28 8 Q29 11 24 15 Q19 11 20 8 Z" fill="${sc(c, -24)}"/>
              <path d="M15 35.5 L33 35.5" stroke="${sc(c, -32)}" stroke-width="2.6"/>
              <path d="M9.6 30 L14.4 31 M38.4 30 L33.6 31" stroke="${sc(c, -32)}" stroke-width="2.2"/>
              <path d="M18 18 L18 34 M22 18 L22 34 M26 18 L26 34 M30 18 L30 34" stroke="${sc(c, 30)}" stroke-width="1.1" opacity=".7"/>`
    }),
    giubbotto: (c) => ({
      sagoma: 'M16 10 L20 8 Q24 11 28 8 L32 10 L42 16 L39 33 L34 32 L34 39 Q24 41 14 39 L14 32 L9 33 L6 16 Z',
      ombra: 'M14 32 L9 33 L6 16 L16 10 L14 20 Z',
      segni: `<path d="M14 17 L34 17 M14 23 L34 23 M14 29 L34 29 M14 35 L34 35" stroke="${sc(c, -32)}" stroke-width="1.3" opacity=".9"/>
              <path d="M24 9 L24 39" stroke="${sc(c, -50)}" stroke-width="1.9"/>
              <circle cx="24" cy="12.5" r="1.3" fill="${sc(c, 48)}"/>
              <path d="M9.6 30 L14.4 31 M38.4 30 L33.6 31" stroke="${sc(c, -32)}" stroke-width="1.5"/>`
    }),
    /* LUNGO: stretto, cade dritto e ARRIVA IN FONDO all'icona, con le
       pieghe verticali della stoffa lunga. La differenza col corto si
       vede prima di leggere il nome: uno finisce a meta', l'altro no. */
    vestitolungo: (c) => ({
      sagoma: 'M18 8 L20.5 7.5 Q24 13 27.5 7.5 L30 8 L31.5 16 L30.5 21 L33 45 L15 45 L17.5 21 L16.5 16 Z',
      ombra: 'M16.5 16 L18 8 L20.5 7.5 L19 15 L19.5 21 L17 45 L15 45 L17.5 21 Z',
      segni: `<path d="M20.5 7.5 Q24 13 27.5 7.5" fill="none" stroke="${sc(c, -40)}" stroke-width="1.3"/>
              <path d="M17.6 20.6 Q24 23 30.4 20.6" fill="none" stroke="${sc(c, -36)}" stroke-width="1.8"/>
              <path d="M20.6 24 L19 44 M24 24 L24 44 M27.4 24 L29 44" stroke="${sc(c, -24)}" stroke-width="1" opacity=".65"/>`
    }),
    leggings: (c) => ({
      sagoma: 'M15 8 L33 8 L31.5 42 L26 42 L24 22 L22 42 L16.5 42 Z',
      ombra: 'M15 8 L20 8 L19.5 42 L16.5 42 Z',
      segni: `<path d="M15 11 L33 11" stroke="${sc(c, -42)}" stroke-width="1.8"/>
              <path d="M19 14 L18.6 40 M29 14 L29.4 40" stroke="${sc(c, 34)}" stroke-width="0.9" opacity=".55"/>`
    }),
    /* LUNGA: dritta, stretta, e ARRIVA IN FONDO come il vestito lungo */
    gonnalunga: (c) => ({
      sagoma: 'M15 8 L33 8 L36 45 L12 45 Z',
      ombra: 'M15 8 L21 8 L17 45 L12 45 Z',
      segni: `<path d="M15 11.8 L33 11.8" stroke="${sc(c, -42)}" stroke-width="2.1"/>
              <path d="M20 14 L18.5 44 M24 14 L24 44 M28 14 L29.5 44" stroke="${sc(c, -26)}" stroke-width="1" opacity=".7"/>`
    }),

    /* CORTO: la gonna si apre larga e finisce a mezz'altezza, con sotto
       un dito di vuoto che si vede. */
    vestito: (c) => ({
      sagoma: 'M18 8 L20.5 7.5 Q24 13 27.5 7.5 L30 8 L31.5 16 L30.5 21 L39 33 Q24 36.5 9 33 L17.5 21 L16.5 16 Z',
      ombra: 'M16.5 16 L18 8 L20.5 7.5 L19 15 L19.5 21 L11 33 L9 33 L17.5 21 Z',
      segni: `<path d="M20.5 7.5 Q24 13 27.5 7.5" fill="none" stroke="${sc(c, -40)}" stroke-width="1.3"/>
              <path d="M17.6 20.6 Q24 23 30.4 20.6" fill="none" stroke="${sc(c, -36)}" stroke-width="1.8"/>
              <path d="M9.6 32.6 Q24 36 38.4 32.6" fill="none" stroke="${sc(c, -30)}" stroke-width="1.3"/>
              <path d="M20 24 L16 32 M28 24 L32 32" stroke="${sc(c, -22)}" stroke-width="0.9" opacity=".6"/>`
    }),

    /* ---------- sotto ---------- */
    pantaloni: (c) => ({
      sagoma: 'M14 8 L34 8 L33 42 L26 42 L24 22 L22 42 L15 42 Z',
      ombra: 'M14 8 L20 8 L19 42 L15 42 Z',
      segni: `<path d="M14 11.6 L34 11.6" stroke="${sc(c, -42)}" stroke-width="2"/>
              <path d="M19 14 L18.4 40 M29 14 L29.6 40" stroke="${sc(c, -26)}" stroke-width="0.9" opacity=".75"/>
              <path d="M24 12 L24 22" stroke="${sc(c, -30)}" stroke-width="0.9" opacity=".6"/>`
    }),
    pantaloncini: (c) => ({
      sagoma: 'M14 8 L34 8 L33 28 L26 28 L24 19 L22 28 L15 28 Z',
      ombra: 'M14 8 L20 8 L19 28 L15 28 Z',
      segni: `<path d="M14 11.6 L34 11.6" stroke="${sc(c, -42)}" stroke-width="2"/>
              <path d="M15 25.4 L22 25.4 M26 25.4 L33 25.4" stroke="${sc(c, -34)}" stroke-width="1.9"/>
              <path d="M24 12 L24 19" stroke="${sc(c, -30)}" stroke-width="0.9" opacity=".6"/>`
    }),
    jeans: (c) => ({
      sagoma: 'M14 8 L34 8 L33 42 L26 42 L24 22 L22 42 L15 42 Z',
      ombra: 'M14 8 L20 8 L19 42 L15 42 Z',
      segni: denim(c, 42, false)
    }),
    jeanscorti: (c) => ({
      sagoma: 'M14 8 L34 8 L33 28 L26 28 L24 19 L22 28 L15 28 Z',
      ombra: 'M14 8 L20 8 L19 28 L15 28 Z',
      segni: denim(c, 28, true)
    }),
    /* CORTA: si apre molto e finisce alta, a un terzo dell'icona */
    gonna: (c) => ({
      sagoma: 'M15 8 L33 8 L41 26 Q24 30 7 26 Z',
      ombra: 'M15 8 L21 8 L14 27 L7 26 Z',
      segni: `<path d="M15 11.8 L33 11.8" stroke="${sc(c, -42)}" stroke-width="2.1"/>
              <path d="M20 14 L15 25 M24 14 L24 27 M28 14 L33 25" stroke="${sc(c, -26)}" stroke-width="1" opacity=".7"/>
              <path d="M7.6 25.6 Q24 29.6 40.4 25.6" fill="none" stroke="${sc(c, -30)}" stroke-width="1.3"/>`
    }),
    tuta: (c) => ({
      sagoma: 'M13 8 L35 8 L34 42 L26 42 L24 22 L22 42 L14 42 Z',
      ombra: 'M13 8 L19 8 L18 42 L14 42 Z',
      segni: `<path d="M13 12 L35 12" stroke="${sc(c, -42)}" stroke-width="2.6"/>
              <path d="M22.4 12 L21.6 16 M25.6 12 L26.4 16" stroke="${sc(c, -50)}" stroke-width="1.1" stroke-linecap="round"/>
              <path d="M15.6 14 L16.6 39 M32.4 14 L31.4 39" stroke="${sc(c, 62)}" stroke-width="2.4"/>
              <path d="M14 38.6 L22 38.6 M26 38.6 L34 38.6" stroke="${sc(c, -36)}" stroke-width="2.8"/>`
    })
  };

  /* La cucitura color miele, i rivetti e le cinque tasche: sono LORO a
     dire "jeans", non il blu — uno può averli neri e restano jeans. */
  function denim(c, giu, corti) {
    const f = '#E3B04B';
    return `<path d="M14 12 L34 12" stroke="${sc(c, -46)}" stroke-width="2.4"/>
            <path d="M14 10.1 L34 10.1 M14 13.9 L34 13.9" stroke="${f}" stroke-width="0.7" opacity=".9"/>
            <path d="M17 8.4 L17 12 M24 8.4 L24 12 M31 8.4 L31 12" stroke="${sc(c, -40)}" stroke-width="1.6"/>
            <path d="M16.6 16 Q20.6 16 22.2 20" fill="none" stroke="${f}" stroke-width="0.85" opacity=".9"/>
            <path d="M31.4 16 Q27.4 16 25.8 20" fill="none" stroke="${f}" stroke-width="0.85" opacity=".9"/>
            <circle cx="16.2" cy="15.1" r="0.8" fill="${f}"/>
            <circle cx="31.8" cy="15.1" r="0.8" fill="${f}"/>
            <path d="M24 14 L24 ${corti ? 19 : 22}" stroke="${sc(c, -32)}" stroke-width="0.9" opacity=".6"/>` +
      (corti
        ? `<path d="M15 25 L22 25 M26 25 L33 25" stroke="${sc(c, -38)}" stroke-width="2.6"/>
           <path d="M15 23.6 L22 23.6 M26 23.6 L33 23.6" stroke="${f}" stroke-width="0.7" opacity=".8"/>`
        : `<path d="M19 16 L18.4 ${giu - 2} M29 16 L29.6 ${giu - 2}" stroke="${f}" stroke-width="0.65" opacity=".55"/>
           <path d="M15.4 ${giu - 1.6} L22 ${giu - 1.6} M26 ${giu - 1.6} L32.6 ${giu - 1.6}" stroke="${f}" stroke-width="0.7" opacity=".8"/>`);
  }

  /* ---------- i quattro accessori ----------
     Icone GENERICHE, e generici restano anche sulla figura: al banco
     nessuno guarda che modello di cappello sia, guarda che ce l'ha e
     di che colore. Quindi una forma sola per tipo, e il colore che
     cambia. */
  /* Gli accessori hanno la stessa struttura dei capi -- una SAGOMA per
     il taglio da adesivo e i SEGNI sopra -- cosi' prendono lo stesso
     bordo bianco spesso e la fila sembra una famiglia sola. */
  const ACCESSORI = {
    /* CAPELLI: una testa con la capigliatura SOPRA. La faccia resta
       bene in vista: se il colore coprisse tutta la testa, l'icona
       direbbe "faccia verde" invece di "capelli verdi". */
    capelli: (c) => ({
      sagoma: 'M11 26 Q10 8 24 8 Q38 8 37 26 Q37 30 35 32 Q36 22 24 22 Q12 22 13 32 Q11 30 11 26 Z',
      sotto: `<circle cx="24" cy="28" r="12" fill="#EFC9A2" stroke="rgba(18,18,26,.9)" stroke-width="2.4"/>`,
      segni: `<path d="M11.5 24 Q8 32 10.5 41" fill="none" stroke="${c}" stroke-width="5.5" stroke-linecap="round"/>
              <path d="M36.5 24 Q40 32 37.5 41" fill="none" stroke="${c}" stroke-width="5.5" stroke-linecap="round"/>
              <circle cx="19.5" cy="29" r="1.5" fill="#2A2A38"/><circle cx="28.5" cy="29" r="1.5" fill="#2A2A38"/>
              <path d="M20.5 34 Q24 36.5 27.5 34" fill="none" stroke="#2A2A38" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M15 15 Q24 11 33 15" fill="none" stroke="${sc(c, 34)}" stroke-width="1.6" opacity=".85"/>`
    }),

    /* CAPPELLO: berretto con una VISIERA bella larga -- e' la visiera
       che lo distingue da un cappuccio o da una cuffia, quindi deve
       sporgere per un terzo buono della cupola */
    cappello: (c) => ({
      sagoma: 'M10 32 Q10 9 24 9 Q38 9 38 25 Q48 26 48 31 Q48 35 43 35 L37 32.5 L10 32.5 Q9 32.5 9 31.5 Z',
      segni: `<path d="M37 25.5 Q47 26.5 47 31 Q47 34 43 34 L36.6 31.6 Z" fill="${sc(c, -30)}" stroke="rgba(18,18,26,.85)" stroke-width="1.8" stroke-linejoin="round"/>
              <path d="M10 29.4 L37 29.4" stroke="${sc(c, -44)}" stroke-width="4"/>
              <path d="M24 9.4 L24 27" stroke="${sc(c, -30)}" stroke-width="1.2" opacity=".7"/>
              <circle cx="24" cy="10.4" r="1.9" fill="${sc(c, 44)}"/>`
    }),

    /* SCARPE: una scarpa di profilo, grande */
    scarpe: (c) => ({
      sagoma: 'M6 34 L6 21 Q13 19 17.5 23 L26.5 30.5 Q33.5 32.5 38.5 33 Q43 33.5 43 37 L43 39.5 Q43 41.5 40.5 41.5 L8.5 41.5 Q6 41.5 6 39 Z',
      segni: `<path d="M6 37.4 L43 37.4" stroke="${sc(c, -48)}" stroke-width="4"/>
              <path d="M9.6 23.5 L16 27 M10.6 27.5 L18.4 31.4" stroke="${sc(c, 48)}" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M26.5 30.5 Q31 27 34.5 29.4" fill="none" stroke="${sc(c, -32)}" stroke-width="1.5"/>`
    }),

    /* ZAINO: spallacci, tasca e cinghia */
    zaino: (c) => ({
      sagoma: 'M11 17 Q11 11 18 11 L30 11 Q37 11 37 17 L37 37 Q37 42 32 42 L16 42 Q11 42 11 37 Z',
      sotto: `<path d="M17 12 Q17 5 24 5 Q31 5 31 12" fill="none" stroke="rgba(255,255,255,.94)" stroke-width="7" stroke-linecap="round"/>
              <path d="M17 12 Q17 5 24 5 Q31 5 31 12" fill="none" stroke="${sc(c, -36)}" stroke-width="3.4" stroke-linecap="round"/>`,
      segni: `<path d="M11 22 Q24 26.5 37 22" fill="none" stroke="${sc(c, -42)}" stroke-width="2.4"/>
              <path d="M17.5 28 L30.5 28 Q31.5 28 31.5 29 L31.5 36 Q31.5 37 30.5 37 L17.5 37 Q16.5 37 16.5 36 L16.5 29 Q16.5 28 17.5 28 Z" fill="${sc(c, -20)}" stroke="${sc(c, -46)}" stroke-width="1.6"/>
              <rect x="21.5" y="24.5" width="5" height="4.5" rx="1.4" fill="${sc(c, 46)}"/>`
    })
  };

  function accessorio(chiave, colore, misura) {
    const fn = ACCESSORI[chiave];
    if (!fn) return '';
    const m = misura || 44;
    const c = colore || '#9AA5B4';
    const d = fn(c);
    /* stesso taglio da adesivo dei capi: bordo bianco spesso, contorno
       scuro, poi il colore. La fila deve sembrare una sola famiglia di
       icone, non due. */
    return `<svg viewBox="-3 -3 54 54" width="${m}" height="${m}" aria-hidden="true">` +
      (d.sotto || '') +
      `<path d="${d.sagoma}" fill="none" stroke="rgba(255,255,255,.94)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="${d.sagoma}" fill="none" stroke="rgba(18,18,26,.9)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="${d.sagoma}" fill="${c}"/>` +
      d.segni + '</svg>';
  }

  /* Disegna un capo col suo colore e la sua fantasia. */
  function capo(chiave, colore, fantasia, misura) {
    const fn = CAPI[chiave];
    if (!fn) return '';
    const c = colore || '#9AA5B4';
    const id = 'k' + (++seq);
    const t = (global.AV && AV.tessuto) ? AV.tessuto(c, fantasia, id) : { fill: c, def: '' };
    const d = fn(c);
    const m = misura || 48;
    /* CONTORNO DA STICKER: il capo e' ritagliato come un adesivo.
       Tre passate sulla stessa sagoma —
         1. un bordo bianco spesso, che e' il taglio dell'adesivo;
         2. un contorno scuro netto, che disegna la forma;
         3. la stoffa.
       Un filo sottile non bastava: un capo nero spariva sul pannello
       scuro e uno bianco spariva sul tasto bianco della selezione. Con
       il bordo spesso la sagoma si stacca sempre, e da lontano si
       riconosce la forma prima ancora del colore.
       Il viewBox e' allargato di tre pixel per lato, se no il bordo
       grosso verrebbe tagliato ai margini. */
    return `<svg viewBox="-3 -3 54 54" width="${m}" height="${m}" aria-hidden="true">` +
      (t.def ? `<defs>${t.def}</defs>` : '') +
      `<path d="${d.sagoma}" fill="none" stroke="rgba(255,255,255,.94)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="${d.sagoma}" fill="none" stroke="rgba(18,18,26,.9)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="${d.sagoma}" fill="${t.fill}"/>` +
      (d.ombra ? `<path d="${d.ombra}" fill="rgba(0,0,0,.14)"/>` : '') +
      d.segni + '</svg>';
  }

  global.CAPI = { capo, accessorio, elenco: Object.keys(CAPI), accessori: Object.keys(ACCESSORI) };
})(window);

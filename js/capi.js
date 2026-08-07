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

    felpa: (c) => ({
      sagoma: 'M16 11 L20 8 Q24 11 28 8 L32 11 L42 17 L37.5 23.5 L34 21.5 L34 39 Q24 41.5 14 39 L14 21.5 L10.5 23.5 L6 17 Z',
      ombra: 'M14 21.5 L10.5 23.5 L6 17 L16 11 L14 16 Z',
      segni: `<path d="M18 8 Q24 18 30 8 Q33 11 31 15 Q24 21 17 15 Q15 11 18 8 Z" fill="${sc(c, 26)}" stroke="${sc(c, -30)}" stroke-width="0.8"/>
              <path d="M21.5 15.5 L20.6 23 M26.5 15.5 L27.4 23" stroke="${sc(c, -44)}" stroke-width="1.2" stroke-linecap="round"/>
              <circle cx="21.5" cy="15.4" r="0.8" fill="${sc(c, -50)}"/>
              <circle cx="26.5" cy="15.4" r="0.8" fill="${sc(c, -50)}"/>
              <path d="M17 27.5 L31 27.5 L29.5 34 L18.5 34 Z" fill="none" stroke="${sc(c, -34)}" stroke-width="1.1"/>
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
  const ACCESSORI = {
    /* CAPELLI: una testa vista di fronte con la capigliatura sopra.
       Prima era un ciuffo che galleggiava nel vuoto e non si capiva
       di che cosa fosse l'icona. */
    capelli: (c) => `<circle cx="24" cy="27" r="11" fill="#E8B98A" stroke="rgba(0,0,0,.5)" stroke-width="1.1"/>
      <path d="M12 27 Q11 10 24 10 Q37 10 36 27 Q33 17 24 17 Q15 17 12 27 Z" fill="${c}" stroke="rgba(0,0,0,.5)" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M12.5 24 Q9 31 11.5 39" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
      <path d="M35.5 24 Q39 31 36.5 39" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="20" cy="28" r="1.3" fill="#2A2A38"/><circle cx="28" cy="28" r="1.3" fill="#2A2A38"/>
      <path d="M21 33 Q24 35 27 33" fill="none" stroke="#2A2A38" stroke-width="1.2" stroke-linecap="round"/>`,

    /* CAPPELLO: un berretto con la VISIERA, visto di tre quarti.
       La cupola tonda da sola sembrava una ciotola. */
    cappello: (c) => `<path d="M12 28 Q12 12 24 12 Q36 12 36 28 Q24 32 12 28 Z" fill="${c}" stroke="rgba(0,0,0,.5)" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M35 25 Q44 26 44 31 Q44 33 41 33 L34 30 Z" fill="${sc(c, -26)}" stroke="rgba(0,0,0,.5)" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M12 27.5 Q24 31 36 27.5" fill="none" stroke="${sc(c, -40)}" stroke-width="2.4"/>
      <path d="M24 12 L24 29" stroke="${sc(c, -30)}" stroke-width="1" opacity=".7"/>
      <circle cx="24" cy="12.6" r="1.6" fill="${sc(c, 40)}"/>`,

    /* SCARPE: UNA scarpa di profilo, grande. Due scarpette piccole
       affiancate a 40px diventavano due macchie. */
    scarpe: (c) => `<path d="M7 34 L7 22 Q13 20.5 17 24 L26 31 Q33 33 38 33.5 Q42 34 42 37 L42 39 Q42 40.5 40 40.5 L9 40.5 Q7 40.5 7 38.5 Z" fill="${c}" stroke="rgba(0,0,0,.5)" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 37 L42 37" stroke="${sc(c, -46)}" stroke-width="3.4"/>
      <path d="M10 24.5 L16 27.5 M11 28 L18 31" stroke="${sc(c, 46)}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M26 31 Q30 28 33 30" fill="none" stroke="${sc(c, -30)}" stroke-width="1.2"/>`,

    /* ZAINO: spallacci, tasca e cinghia. Prima era una scatola. */
    zaino: (c) => `<path d="M17 12 Q17 7 24 7 Q31 7 31 12" fill="none" stroke="${sc(c, -34)}" stroke-width="2.6"/>
      <path d="M12 16 Q12 11 18 11 L30 11 Q36 11 36 16 L36 37 Q36 41 32 41 L16 41 Q12 41 12 37 Z" fill="${c}" stroke="rgba(0,0,0,.5)" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M12 21 Q24 25 36 21" fill="none" stroke="${sc(c, -40)}" stroke-width="2"/>
      <path d="M18 27 L30 27 Q31 27 31 28 L31 35 Q31 36 30 36 L18 36 Q17 36 17 35 L17 28 Q17 27 18 27 Z" fill="${sc(c, -20)}" stroke="${sc(c, -42)}" stroke-width="1"/>
      <rect x="22" y="24.5" width="4" height="4" rx="1" fill="${sc(c, 44)}"/>`
  };

  function accessorio(chiave, colore, misura) {
    const fn = ACCESSORI[chiave];
    if (!fn) return '';
    const m = misura || 44;
    return `<svg viewBox="0 0 48 48" width="${m}" height="${m}" aria-hidden="true">` +
      fn(colore || '#9AA5B4') + '</svg>';
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
    /* IL CONTORNO E' DOPPIO, e non e' un vezzo: un capo nero sul
       pannello scuro spariva, e un capo bianco spariva sul tasto
       bianco della selezione. Fuori un alone scuro, dentro un filo
       chiaro: uno dei due si stacca sempre, qualunque sia il fondo e
       qualunque sia il colore del capo. */
    return `<svg viewBox="0 0 48 48" width="${m}" height="${m}" aria-hidden="true">` +
      (t.def ? `<defs>${t.def}</defs>` : '') +
      `<path d="${d.sagoma}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3.2" stroke-linejoin="round"/>` +
      `<path d="${d.sagoma}" fill="${t.fill}" stroke="rgba(255,255,255,.5)" stroke-width="1.1" stroke-linejoin="round"/>` +
      (d.ombra ? `<path d="${d.ombra}" fill="rgba(0,0,0,.14)"/>` : '') +
      d.segni + '</svg>';
  }

  global.CAPI = { capo, accessorio, elenco: Object.keys(CAPI), accessori: Object.keys(ACCESSORI) };
})(window);

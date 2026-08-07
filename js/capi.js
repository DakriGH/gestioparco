/* ============================================================
   GESTIOPARCO — le icone dei capi
   Ogni capo disegnato DA SOLO, steso come in vetrina: la maglietta è
   una maglietta, i jeans sono jeans. Prima l'icona era la figura
   intera con quel pezzo cambiato: onesta, ma occupava un sacco di
   spazio e a colpo d'occhio erano tutte la stessa persona.

   Il colore e la FANTASIA sono quelli veri — la trama arriva da
   AV.tessuto(), lo stesso posto da cui la prende la figura, così
   l'icona e l'avatar non possono raccontare due cose diverse.

   Griglia di riferimento: viewBox 0 0 44 44.
   ============================================================ */
(function (global) {
  'use strict';

  let seq = 0;

  const scuro = (c, q) => (global.AV && AV.shade ? AV.shade(c, q) : c);

  /* Il capo si disegna in due strati: la SAGOMA piena color stoffa (che
     porta la fantasia) e sopra i DETTAGLI — colletto, cuciture, bottoni,
     tasche — che sono quelli a far riconoscere il capo. */
  const CAPI = {
    /* ---------- sopra ---------- */
    maglietta: (c) => ({
      sagoma: 'M14 8 L18 6 Q22 9 26 6 L30 8 L38 13 L34 19 L31 17 L31 37 Q22 39 13 37 L13 17 L10 19 L6 13 Z',
      extra: `<path d="M18 6 Q22 10 26 6" fill="none" stroke="${scuro(c, -34)}" stroke-width="1.2"/>`
    }),
    manicalunga: (c) => ({
      sagoma: 'M14 8 L18 6 Q22 9 26 6 L30 8 L39 13 L36 31 L31 30 L31 37 Q22 39 13 37 L13 30 L8 31 L5 13 Z',
      extra: `<path d="M18 6 Q22 10 26 6" fill="none" stroke="${scuro(c, -34)}" stroke-width="1.2"/>
              <path d="M6.4 27.5 L11.6 28.6 M37.6 27.5 L32.4 28.6" stroke="${scuro(c, -30)}" stroke-width="1.4"/>`
    }),
    polo: (c) => ({
      sagoma: 'M14 8 L18 6 L26 6 L30 8 L38 13 L34 19 L31 17 L31 37 Q22 39 13 37 L13 17 L10 19 L6 13 Z',
      extra: `<path d="M18 6 L22 12 L26 6 L28 7 L22 15 L16 7 Z" fill="${scuro(c, 30)}"/>
              <path d="M20.6 12 L20.6 20 M23.4 12 L23.4 20" stroke="${scuro(c, -30)}" stroke-width="0.9"/>
              <circle cx="22" cy="15" r="0.9" fill="${scuro(c, -46)}"/>
              <circle cx="22" cy="19" r="0.9" fill="${scuro(c, -46)}"/>`
    }),
    camicia: (c) => ({
      sagoma: 'M14 8 L18 6 L26 6 L30 8 L38 13 L35 30 L31 29 L31 37 Q22 39 13 37 L13 29 L9 30 L6 13 Z',
      extra: `<path d="M18 6 L22 13 L26 6 L29 8 L22 17 L15 8 Z" fill="${scuro(c, 34)}"/>
              <path d="M22 13 L22 37" stroke="${scuro(c, -34)}" stroke-width="1.4"/>
              <circle cx="22" cy="21" r="0.9" fill="${scuro(c, -50)}"/>
              <circle cx="22" cy="27" r="0.9" fill="${scuro(c, -50)}"/>
              <circle cx="22" cy="33" r="0.9" fill="${scuro(c, -50)}"/>
              <path d="M7.6 26.5 L12 27.4 M36.4 26.5 L32 27.4" stroke="${scuro(c, -30)}" stroke-width="1.3"/>`
    }),
    canotta: (c) => ({
      sagoma: 'M15 7 L18 6 Q22 12 26 6 L29 7 L30 14 L31 37 Q22 39 13 37 L14 14 Z',
      extra: `<path d="M18 6 Q22 12 26 6" fill="none" stroke="${scuro(c, -34)}" stroke-width="1.2"/>
              <path d="M15 7 L14.5 13 M29 7 L29.5 13" stroke="${scuro(c, -26)}" stroke-width="1.6"/>`
    }),
    felpa: (c) => ({
      sagoma: 'M13 9 L18 6 Q22 9 26 6 L31 9 L39 14 L35 20 L32 18 L32 37 Q22 39 12 37 L12 18 L9 20 L5 14 Z',
      extra: `<path d="M16 6 Q22 15 28 6 Q30 9 28 12 Q22 18 16 12 Q14 9 16 6 Z" fill="${scuro(c, 22)}"/>
              <path d="M20 13 L19.4 20 M24 13 L24.6 20" stroke="${scuro(c, -40)}" stroke-width="1.1" stroke-linecap="round"/>
              <path d="M15 27 L29 27 L29 33 L15 33 Z" fill="none" stroke="${scuro(c, -30)}" stroke-width="1.2"/>`
    }),
    giacca: (c) => ({
      sagoma: 'M13 8 L19 6 L22 12 L25 6 L31 8 L39 14 L36 31 L32 30 L32 37 Q22 39 12 37 L12 30 L8 31 L5 14 Z',
      extra: `<path d="M19 6 L22 12 L18 14 Z M25 6 L22 12 L26 14 Z" fill="${scuro(c, -32)}"/>
              <path d="M22 12 L22 37" stroke="${scuro(c, -40)}" stroke-width="1.6"/>
              <path d="M14 24 L18 24 M30 24 L26 24" stroke="${scuro(c, -34)}" stroke-width="1.2"/>
              <circle cx="24.5" cy="24" r="1" fill="${scuro(c, -50)}"/>`
    }),
    gilet: (c) => ({
      sagoma: 'M15 7 L19 6 L22 13 L25 6 L29 7 L31 14 L31 37 Q22 39 13 37 L13 14 Z',
      extra: `<path d="M19 6 L22 13 L25 6 L26.5 7 L22 16 L17.5 7 Z" fill="${scuro(c, 26)}"/>
              <path d="M22 16 L22 37" stroke="${scuro(c, -34)}" stroke-width="1.2"/>
              <circle cx="22" cy="22" r="1" fill="${scuro(c, -50)}"/>
              <circle cx="22" cy="28" r="1" fill="${scuro(c, -50)}"/>
              <circle cx="22" cy="34" r="1" fill="${scuro(c, -50)}"/>`
    }),
    vestito: (c) => ({
      sagoma: 'M15 7 L18 6 Q22 11 26 6 L29 7 L30 15 L34 37 Q22 40 10 37 L14 15 Z',
      extra: `<path d="M18 6 Q22 11 26 6" fill="none" stroke="${scuro(c, -34)}" stroke-width="1.2"/>
              <path d="M13.6 22 Q22 25 30.4 22" fill="none" stroke="${scuro(c, -30)}" stroke-width="1.4"/>`
    }),

    /* ---------- sotto ---------- */
    pantaloni: (c) => ({
      sagoma: 'M12 7 L32 7 L31 39 L24 39 L22 20 L20 39 L13 39 Z',
      extra: `<path d="M12 10.5 L32 10.5" stroke="${scuro(c, -40)}" stroke-width="1.8"/>
              <path d="M17 13 L16.5 37 M27 13 L27.5 37" stroke="${scuro(c, -26)}" stroke-width="0.9" opacity=".7"/>`
    }),
    pantaloncini: (c) => ({
      sagoma: 'M12 7 L32 7 L31 26 L24 26 L22 17 L20 26 L13 26 Z',
      extra: `<path d="M12 10.5 L32 10.5" stroke="${scuro(c, -40)}" stroke-width="1.8"/>
              <path d="M13 23.5 L20 23.5 M24 23.5 L31 23.5" stroke="${scuro(c, -30)}" stroke-width="1.6"/>`
    }),
    jeans: (c) => ({
      sagoma: 'M12 7 L32 7 L31 39 L24 39 L22 20 L20 39 L13 39 Z',
      extra: filo(c, 39, false)
    }),
    jeanscorti: (c) => ({
      sagoma: 'M12 7 L32 7 L31 26 L24 26 L22 17 L20 26 L13 26 Z',
      extra: filo(c, 26, true)
    }),
    gonna: (c) => ({
      sagoma: 'M13 7 L31 7 L36 33 Q22 37 8 33 Z',
      extra: `<path d="M13 10.5 L31 10.5" stroke="${scuro(c, -40)}" stroke-width="1.8"/>
              <path d="M19 13 L16 32 M25 13 L28 32" stroke="${scuro(c, -24)}" stroke-width="0.9" opacity=".65"/>`
    }),
    tuta: (c) => ({
      sagoma: 'M11 7 L33 7 L32 39 L24 39 L22 20 L20 39 L12 39 Z',
      extra: `<path d="M11 10.5 L33 10.5" stroke="${scuro(c, -40)}" stroke-width="2"/>
              <path d="M13.5 12 L14.5 37 M30.5 12 L29.5 37" stroke="${scuro(c, 58)}" stroke-width="2.2"/>
              <path d="M12 36 L20 36 M24 36 L32 36" stroke="${scuro(c, -34)}" stroke-width="2.6"/>`
    })
  };

  /* la cucitura color miele e i rivetti: sono LORO a dire "jeans",
     non il blu — uno può averli neri e restano jeans */
  function filo(c, giu, corti) {
    const f = '#E3B04B';
    return `<path d="M12 10.5 L32 10.5" stroke="${scuro(c, -42)}" stroke-width="2.2"/>
            <path d="M12 8.8 L32 8.8 M12 12.4 L32 12.4" stroke="${f}" stroke-width="0.7" opacity=".9"/>
            <path d="M15 14.5 Q18.5 14.5 20 18" fill="none" stroke="${f}" stroke-width="0.8" opacity=".85"/>
            <path d="M29 14.5 Q25.5 14.5 24 18" fill="none" stroke="${f}" stroke-width="0.8" opacity=".85"/>
            <circle cx="14.6" cy="13.6" r="0.75" fill="${f}"/>
            <circle cx="29.4" cy="13.6" r="0.75" fill="${f}"/>` +
      (corti
        ? `<path d="M13 ${giu - 2.5} L20 ${giu - 2.5} M24 ${giu - 2.5} L31 ${giu - 2.5}" stroke="${scuro(c, -34)}" stroke-width="2.4"/>`
        : `<path d="M14 ${giu - 2} L20 ${giu - 2} M24 ${giu - 2} L30 ${giu - 2}" stroke="${f}" stroke-width="0.7" opacity=".75"/>
           <path d="M17 14 L16.6 ${giu - 3} M27 14 L27.4 ${giu - 3}" stroke="${f}" stroke-width="0.6" opacity=".5"/>`);
  }

  /* Disegna un capo con il suo colore e la sua fantasia.
     chiave: 'maglietta', 'jeans', 'gonna'...  */
  function capo(chiave, colore, fantasia, misura) {
    const fn = CAPI[chiave];
    if (!fn) return '';
    const c = colore || '#9AA5B4';
    const id = 'k' + (++seq);
    const t = (global.AV && AV.tessuto) ? AV.tessuto(c, fantasia, id) : { fill: c, def: '' };
    const d = fn(c);
    const m = misura || 44;
    return `<svg viewBox="0 0 44 44" width="${m}" height="${m}" aria-hidden="true">` +
      (t.def ? `<defs>${t.def}</defs>` : '') +
      `<path d="${d.sagoma}" fill="${t.fill}" stroke="rgba(0,0,0,.45)" stroke-width="1" stroke-linejoin="round"/>` +
      d.extra + '</svg>';
  }

  global.CAPI = { capo, elenco: Object.keys(CAPI) };
})(window);

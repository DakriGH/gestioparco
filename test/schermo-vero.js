/* ══════════════════════════════════════════════════════════
   IL BANCO DI PROVA A VIDEO
   Gli altri file provano i CONTI dentro node, con un DOM finto: sono
   veloci e girano da soli, ma non premono i tasti. Questo preme i tasti
   davvero, nell'app vera, e controlla la cosa che il DOM finto non puo'
   vedere: che quello che appare a video sia anche quello che finisce
   sul disco.

   E' l'unico modo che ho di provare i flussi che rispondono IN
   DIFFERITA -- quelli che aprono un foglio e aspettano una scelta --
   ed e' proprio li' che si sono nascosti i guasti peggiori: il tempo
   che cambiava a video e non veniva salvato, l'estensione che sembrava
   non fare niente.

   COME SI USA
     1. apri l'app con  index.html?nosw
     2. apri la console del browser
     3. incolla il contenuto di questo file e premi invio

   Non serve niente di installato: nessun pacchetto, nessun browser
   pilotato. Cancella gli ingressi di prova che crea, quindi NON va
   lanciato su un tablet che sta lavorando.
   ══════════════════════════════════════════════════════════ */
(async function bancoAVideo() {
  'use strict';
  const att = ms => new Promise(r => setTimeout(r, ms));
  const esiti = [];
  const p = (nome, ok, dett) => esiti.push({ nome, ok: !!ok, dett: dett || '' });

  /* memoria e disco devono dire la stessa cosa: e' LA garanzia */
  const chiave = e => [e.id, e.status, e.children, e.crazyJumping, e.durationMinutes,
    e.paidPark, e.paidBar, e.parcoDa || 0, e.regaloFinoA || 0,
    e.sigla || '', String(e.note || '')].join('/');
  const allineati = () => {
    const disco = JSON.parse(localStorage.getItem('gp_entries') || '[]');
    return entries.map(chiave).sort().join('\n') === disco.map(chiave).sort().join('\n');
  };

  const card = () => document.querySelector('#view-active .entry');
  const cella = nome => [...card().querySelectorAll('.e-colonna > .e-cella')]
    .find(c => c.querySelector('.e-nome').textContent === nome);
  const tastiTempo = () => [...cella('Tempo').querySelectorAll('button:not(.e-aperto)')];
  const scelte = () => [...document.querySelectorAll('#modalRoot .scelta-riga')];
  const modale = () => !document.getElementById('modalRoot').classList.contains('hidden');
  const toastAnnulla = () => document.querySelector('#toast button.annulla');

  /* un gruppo dentro, sforato di quanto si vuole */
  const prepara = (sforo) => {
    localStorage.removeItem('gp_entries');
    entries.length = 0;
    draft = freshDraft();
    const ms5 = 5 * 60000;
    const t0 = Math.round((Date.now() - (30 + sforo) * 60000) / ms5) * ms5;
    const e = normalizeEntries([{
      id: 'prova' + Math.random().toString(36).slice(2, 7),
      startTime: t0, createdAt: t0, oraManuale: true,
      children: 2, durationMinutes: 30, baseMinutes: 30
    }])[0];
    entries.push(e);
    saveEntries();
    showArchive = false;
    switchTab('active');
    buildActiveView();
    return e;
  };

  /* ── 1. ALLUNGARE A CHI HA SFORATO: le due strade del foglio ── */
  prepara(25);
  tastiTempo()[1].click(); await att(150);
  p('sforo grosso: si apre il foglio', modale());
  scelte()[0].click(); await att(200);
  p('«riparti da adesso» salva davvero', allineati() && entries[0].durationMinutes === 35);
  p('  e non sono piu scaduti', endTimeOf(entries[0]) > Date.now());

  prepara(25);
  tastiTempo()[1].click(); await att(150);
  scelte()[1].click(); await att(200);
  p('«scala lo sforo» salva davvero', allineati() && entries[0].durationMinutes === 35);

  prepara(4);
  tastiTempo()[1].click(); await att(200);
  p('sforo piccolo: non chiede e salva', !modale() && allineati() && entries[0].durationMinutes === 35);

  /* ── 2. IL REGALO DI UN GIRO A TEMPO SCADUTO ── */
  prepara(6);
  card().querySelector('.e-crazycard [data-add="crazy"]:not(.bc-su)').click(); await att(200);
  const resta = (endTimeOf(entries[0]) - Date.now()) / 60000;
  p('un giro a tempo scaduto regala i minuti interi',
    resta >= settings.crazyExtraMinutes, Math.round(resta) + ' min');
  p('  e resta salvato', allineati());

  /* ── 3. USCITA, ELIMINA E I LORO ANNULLA ── */
  prepara(0);
  chiudiIngresso(entries[0]); await att(200);
  scelte()[0].click(); await att(700);
  p('uscita: salvata', allineati() && entries[0].status === 'closed');
  if (toastAnnulla()) toastAnnulla().click(); await att(250);
  p('  e l annulla la disfa', allineati() && entries[0].status === 'active');

  chiudiIngresso(entries[0]); await att(200);
  scelte()[1].click(); await att(600);
  p('elimina: salvata', allineati() && entries.length === 0);
  if (toastAnnulla()) toastAnnulla().click(); await att(250);
  p('  e l annulla la disfa', allineati() && entries.length === 1);

  /* ── 4. ARCHIVIO: elimina e rimetti dentro, coi loro annulla ── */
  {
    const e = entries[0];
    const d = dueOf(e);
    e.costoFinale = { parco: d.park, bar: d.bar };
    e.status = 'closed'; e.closedAt = Date.now();
    saveEntries(); showArchive = true; buildActiveView(); await att(150);
    [...document.querySelectorAll('.arch-tasti button')].find(b => /Elimina/.test(b.textContent)).click();
    await att(150);
    [...document.querySelectorAll('#modalRoot button')].find(b => /Conferma/.test(b.textContent)).click();
    await att(300);
    p('archivio, elimina: salvata', allineati() && entries.length === 0);
    if (toastAnnulla()) toastAnnulla().click(); await att(250);
    p('  e l annulla la disfa', allineati() && entries.length === 1);

    showArchive = true; buildActiveView(); await att(150);
    [...document.querySelectorAll('.arch-tasti button')].find(b => /Rimetti/.test(b.textContent)).click();
    await att(250);
    p('archivio, rimetti dentro: salvata', allineati() && entries[0].status === 'active');
    if (toastAnnulla()) toastAnnulla().click(); await att(250);
    p('  e l annulla lo riarchivia', allineati() && entries[0].status === 'closed');
  }

  /* ── 5. LA NOTA: si legge senza aprire, si scrive toccandola ── */
  /* si torna fra chi e' dentro: la sezione prima lascia in vista
     l'archivio, e li' le schede sono un'altra cosa */
  showArchive = false;
  prepara(0);
  {
    const striscia = card().querySelector('.e-nota');
    p('a vuoto la nota non ingombra la lista',
      striscia && striscia.getBoundingClientRect().height === 0);
    card().querySelector('.e-riga').click(); await att(250);
    p('  e col tocco compare', card().querySelector('.e-nota').getBoundingClientRect().height > 0);
    card().querySelector('.e-nota').click(); await att(200);
    const campo = document.querySelector('.nota-campo');
    p('  toccandola si apre il foglio', !!campo);
    if (campo) {
      campo.value = 'torta in frigo';
      [...document.querySelectorAll('#modalRoot button')].find(b => /Salva/.test(b.textContent)).click();
      await att(250);
      p('  e la nota si salva', allineati() && entries[0].note === 'torta in frigo');
      if (toastAnnulla()) toastAnnulla().click(); await att(250);
      p('  e l annulla la toglie', allineati() && !String(entries[0].note || '').trim());
    }
  }

  /* ── 6. NIENTE ESCE DALLO SCHERMO ── */
  {
    showArchive = false; switchTab('active'); buildActiveView(); await att(150);
    const lim = document.documentElement.clientWidth;
    const fuori = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.getBoundingClientRect().right > lim + 1) fuori.push(el.className || el.tagName);
    });
    p('niente esce dallo schermo a ' + innerWidth + 'px',
      !fuori.length, [...new Set(fuori)].slice(0, 4).join(', '));
  }

  /* ── il verdetto ── */
  localStorage.removeItem('gp_entries');
  entries.length = 0;
  saveEntries();
  buildActiveView();

  const ko = esiti.filter(x => !x.ok);
  console.log('\n' + '━'.repeat(52));
  esiti.forEach(x => console.log((x.ok ? '  ok   ' : '  NO   ') + x.nome + (x.dett ? '   ' + x.dett : '')));
  console.log('━'.repeat(52));
  console.log(ko.length
    ? '  ' + ko.length + ' ROTTI su ' + esiti.length
    : '  TUTTO A POSTO — ' + esiti.length + ' controlli a video');
  console.log('━'.repeat(52));
  return ko.length ? 'ROTTI: ' + ko.map(x => x.nome).join(' | ') : 'tutto a posto';
})();

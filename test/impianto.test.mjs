/* L'IMPIANTO: che i pezzi si chiamino davvero come li chiama il codice.

       node test/impianto.test.mjs

   Gli altri file provano che i CONTI tornano. Questo prova una cosa
   piu' stupida e piu' insidiosa: che quando il codice cerca `#toast` o
   `.pc-fondo`, quella roba esista per davvero.
   E' il genere di guasto che non fa rumore -- un querySelector che non
   trova niente torna null e il tasto muore in silenzio -- e che si
   scopre al banco, col cliente davanti.

   Qui si legge il SORGENTE, non si esegue: niente browser, niente
   finte. Se un domani qualcuno rinomina una classe nel CSS e si
   dimentica il JS, questo file lo dice prima che se ne accorga lui. */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, '..');
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8');

let fatti = 0, rotti = 0;
const gruppi = [];
function gruppo(nome) { gruppi.push(nome); console.log('\n━━ ' + nome); }
function prova(nome, cond, dettaglio) {
  fatti++;
  if (cond) { console.log('   ok   ' + nome); return true; }
  rotti++;
  console.log('  FALLITO ' + nome + (dettaglio ? '\n          ' + dettaglio : ''));
  return false;
}

const APP = leggi('js/app.js');
const CSS = leggi('css/app.css');
const HTML = leggi('index.html');
const SW = leggi('sw.js');

/* ══════════════════════════════════════════════════════════ */
gruppo('Gli identificativi cercati dal codice esistono nella pagina');
{
  /* $('#qualcosa') e getElementById('qualcosa'): se non c'e', il tasto
     non risponde e nessuno se ne accorge finche' non lo preme. */
  const cercati = new Set();
  for (const m of APP.matchAll(/\$\('#([\w-]+)'\)/g)) cercati.add(m[1]);
  for (const m of APP.matchAll(/getElementById\('([\w-]+)'\)/g)) cercati.add(m[1]);
  const presenti = new Set();
  for (const m of HTML.matchAll(/id="([\w-]+)"/g)) presenti.add(m[1]);
  /* alcuni nascono da JS: si accettano se il codice li crea davvero */
  const fattiDalCodice = new Set();
  for (const m of APP.matchAll(/id="([\w-]+)"/g)) fattiDalCodice.add(m[1]);
  for (const m of APP.matchAll(/\.id = '([\w-]+)'/g)) fattiDalCodice.add(m[1]);
  const mancanti = [...cercati].filter(id => !presenti.has(id) && !fattiDalCodice.has(id));
  prova(cercati.size + ' identificativi cercati, tutti trovati', mancanti.length === 0,
    'mancano: ' + mancanti.join(', '));
}

gruppo('Le classi che il codice cerca sono scritte da qualche parte');
{
  /* querySelector('.roba'): la classe deve comparire almeno una volta
     in un pezzo di HTML -- nel modello dentro app.js o nella pagina --
     se no si sta cercando una cosa che nessuno crea. */
  const cercate = new Set();
  for (const m of APP.matchAll(/querySelector(?:All)?\('\.([\w-]+)/g)) cercate.add(m[1]);
  const scritte = (APP + HTML).replace(/querySelector(?:All)?\('\.[\w-]+/g, '');
  const mancanti = [...cercate].filter(c =>
    !new RegExp('class="[^"]*\\b' + c + '\\b').test(scritte) &&
    !new RegExp("classList\\.(?:add|toggle)\\('" + c + "'").test(scritte) &&
    !new RegExp("el\\('[a-z]+', '[^']*\\b" + c + "\\b").test(scritte));
  prova(cercate.size + ' classi cercate, tutte create da qualcuno', mancanti.length === 0,
    'nessuno crea: ' + mancanti.join(', '));
}

gruppo('Le classi accese dal codice hanno un vestito nel CSS');
{
  /* classList.add('x') senza una regola .x nel CSS vuol dire che
     l'effetto voluto non si vede: e' il difetto piu' silenzioso di
     tutti, perche' il codice "funziona". */
  const accese = new Set();
  for (const m of APP.matchAll(/classList\.(?:add|toggle)\('([\w-]+)'/g)) accese.add(m[1]);
  /* queste servono al codice per ritrovare le cose, non a vestirle */
  const soloPerCercare = new Set(['vola', 'aperto', 'nato', 'messo', 'presa', 'saldata']);
  const senzaVestito = [...accese].filter(c =>
    !soloPerCercare.has(c) && !new RegExp('\\.' + c + '\\b').test(CSS));
  prova(accese.size + ' classi accese, tutte vestite', senzaVestito.length === 0,
    'senza regola CSS: ' + senzaVestito.join(', '));
}

gruppo('Il service worker mette in cache file che esistono');
{
  const dentro = [...SW.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(x => x && !x.endsWith('/'));
  const mancanti = dentro.filter(f => !existsSync(join(RADICE, f)));
  prova(dentro.length + ' file elencati, tutti sul disco', mancanti.length === 0,
    'non esistono: ' + mancanti.join(', '));

  /* e al contrario: quello che la pagina carica deve stare in cache,
     se no l'app parte a meta' quando manca la rete */
  const caricati = [...HTML.matchAll(/(?:src|href)="\.\/([^"?]+)/g)].map(m => m[1])
    .filter(f => /\.(js|css)$/.test(f) && !f.includes('vendor/'));
  const fuori = caricati.filter(f => !SW.includes("'./" + f + "'"));
  prova(caricati.length + ' file caricati dalla pagina, tutti in cache', fuori.length === 0,
    'fuori dalla cache: ' + fuori.join(', '));
}

gruppo('La versione e la stessa dappertutto');
{
  const vers = [...HTML.matchAll(/\?v=(\d+)/g)].map(m => m[1]);
  const unica = [...new Set(vers)];
  prova('index.html usa una sola versione (' + unica.join('/') + ')', unica.length === 1,
    'ne usa ' + unica.length + ': ' + unica.join(', '));
  const cache = (SW.match(/gestioparco-v(\d+)/) || [])[1];
  prova('il service worker ha la sua versione (v' + cache + ')', !!cache);
  /* le pagine di studio possono restare indietro, l'app no */
  const manifest = existsSync(join(RADICE, 'manifest.json'));
  prova('il manifest c’e’', manifest);
}

gruppo('Niente resti di lavorazione nel codice che gira');
{
  const righe = APP.split('\n');
  const stampe = righe.map((r, i) => [i + 1, r])
    .filter(([, r]) => /console\.log\(/.test(r) && !/^\s*\/\//.test(r));
  prova('nessun console.log dimenticato', stampe.length === 0,
    'righe: ' + stampe.map(([n]) => n).join(', '));
  const debugger_ = /\bdebugger\b/.test(APP.replace(/\/\*[\s\S]*?\*\//g, ''));
  prova('nessun debugger', !debugger_);
  const todo = (APP.match(/TODO|FIXME|XXX/g) || []).length;
  prova('nessun TODO appeso', todo === 0, todo + ' trovati');
}

gruppo('Le funzioni che il pannello chiama esistono davvero');
{
  /* Il pannello e' costruito da una stringa con dentro data-a="...":
     ogni comando deve avere il suo ramo nel gestore dei tocchi, se no
     il tasto c'e' ma non fa niente. */
  const comandi = new Set();
  for (const m of APP.matchAll(/data-a="([\w-]+)"/g)) comandi.add(m[1]);
  const senzaRamo = [...comandi].filter(c => !new RegExp("d\\.a === '" + c + "'").test(APP));
  prova(comandi.size + ' comandi nel disegno, tutti con il loro ramo', senzaRamo.length === 0,
    'nessuno risponde a: ' + senzaRamo.join(', '));

  /* e al contrario: un ramo che nessun tasto chiama piu' e' codice
     morto che confonde chi legge */
  const rami = new Set();
  for (const m of APP.matchAll(/d\.a === '([\w-]+)'/g)) rami.add(m[1]);
  const orfani = [...rami].filter(r => !comandi.has(r));
  prova(rami.size + ' rami, nessuno orfano', orfani.length === 0,
    'nessun tasto chiama: ' + orfani.join(', '));
}

gruppo('Le liste che arrivano da fuori passano tutte da lista()');
{
  /* `x || []` non protegge da una stringa, e una stringa e' proprio
     quello che arriva da un salvataggio vecchio o da una copia
     ripristinata male: `"niente".reduce` non esiste e porta giu' la
     schermata intera. Le liste che vengono da FUORI -- ingressi,
     righe del bar, persone, tariffe, listino -- devono passare da
     lista(), che di una non-lista fa una lista vuota. */
  const fuori = ['barItems', 'people', 'tariffs', 'barMenu', 'braceletSlots', 'quickDurations'];
  const colpevoli = [];
  fuori.forEach(nome => {
    const quante = APP.split('.' + nome + " || []").length - 1;
    if (quante) colpevoli.push(nome + ' ×' + quante);
  });
  prova('nessuna lista di fuori protetta solo con "|| []"', colpevoli.length === 0,
    'ancora scoperte: ' + colpevoli.join(', '));
  prova('lista() esiste e fa il suo mestiere',
    /function lista\(x\) \{ return Array\.isArray\(x\)/.test(APP));
}

gruppo('Ogni funzione chiamata esiste davvero');
{
  /* IL GUASTO PIU' STUPIDO E PIU' CARO.
     Ritoccando un pezzo grosso di file si puo' portare via una
     funzione che sta li' in mezzo: il file resta valido, `node --check`
     e' contento, le prove sui conti passano -- e al banco quel tasto
     lancia "non e' definita" e non fa niente. E' successo davvero: la
     patch dell'hub si e' portata via il foglio dell'uscita, e me ne
     sono accorto solo premendo il tasto a mano.
     Qui si guarda ogni `nome(...)` del file e si pretende che quel
     nome sia definito da qualche parte: nel file stesso, negli altri
     file dell'app, o fra le cose che il browser mette a disposizione. */
  const fonti = ['js/app.js', 'js/avatar.js', 'js/capi.js', 'js/icone.js', 'js/dati.js', 'js/cloud.js']
    .filter(f => existsSync(join(RADICE, f)))
    .map(f => leggi(f)).join('\n');

  const definiti = new Set();
  for (const m of fonti.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) definiti.add(m[1]);
  for (const m of fonti.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) definiti.add(m[1]);
  for (const m of fonti.matchAll(/([A-Za-z_$][\w$]*)\s*[:,]\s*(?:function|\()/g)) definiti.add(m[1]);
  /* i parametri e le variabili di comodo: si accettano tutti i nomi
     che compaiono come argomenti di una funzione o in una destrutturazione */
  for (const m of fonti.matchAll(/\(([^()]{0,200})\)\s*=>/g))
    m[1].split(',').forEach(x => { const n = x.trim().replace(/[^\w$].*$/, ''); if (n) definiti.add(n); });
  for (const m of fonti.matchAll(/function[^(]*\(([^()]{0,200})\)/g))
    m[1].split(',').forEach(x => { const n = x.trim().replace(/[^\w$].*$/, ''); if (n) definiti.add(n); });

  /* quello che c'e' comunque: browser, linguaggio, e i nomi delle
     nostre librerie */
  const DATI = new Set(('Math JSON Date Number String Object Array Boolean RegExp Error Promise Map Set ' +
    'parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent setTimeout clearTimeout ' +
    'setInterval clearInterval requestAnimationFrame cancelAnimationFrame fetch alert confirm prompt ' +
    'Blob File FileReader URL Image Intl Symbol Proxy Reflect WeakMap WeakSet BigInt structuredClone ' +
    'queueMicrotask atob btoa TextEncoder TextDecoder AbortController Event CustomEvent PointerEvent ' +
    'MouseEvent KeyboardEvent ResizeObserver IntersectionObserver MutationObserver Notification ' +
    'AV CAPI ICONE CLOUD DATI Sortable firebase getComputedStyle matchMedia print open close ' +
    'if for while switch catch return typeof instanceof new delete void in of do else try finally ' +
    'function class extends super this arguments eval Function Array32 Uint8Array Float32Array').split(/\s+/));

  const chiamati = new Map();
  /* si saltano le chiamate su un oggetto (`x.metodo(`), che non sono
     nostre funzioni ma metodi di qualcun altro */
  const app = leggi('js/app.js');
  /* via i commenti E le stringhe: dentro le stringhe c'e' il CSS
     (`rgba(`, `translateY(`) e l'HTML, che non sono chiamate a
     funzioni nostre ma ci somigliano moltissimo */
  const senzaCommenti = app
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(new RegExp('`(?:[^`\\\\]|\\\\.)*`', 'g'), '``')
    .replace(new RegExp("'(?:[^'\\\\\\n]|\\\\.)*'", 'g'), "''")
    .replace(new RegExp('"(?:[^"\\\\\\n]|\\\\.)*"', 'g'), '""')
    /* e via anche i modelli di ricerca: dentro /^bar_(.+)_\d+$/ c'e'
       un "bar_(" che sembra una chiamata e non lo e' */
    .replace(new RegExp('/(?:[^/\\\\\\n]|\\\\.)+/[gimsuy]*', 'g'), ' RE ');
  for (const m of senzaCommenti.matchAll(/(^|[^\w$.])([a-z][\w$]*)\s*\(/g)) {
    const n = m[2];
    if (!definiti.has(n) && !DATI.has(n)) chiamati.set(n, (chiamati.get(n) || 0) + 1);
  }
  const fantasmi = [...chiamati.keys()];
  prova('nessuna funzione fantasma', fantasmi.length === 0,
    'chiamate ma non definite: ' + fantasmi.join(', '));
}

gruppo('Le azioni che fanno danno si possono rimangiare');
{
  /* A una cassa si sbaglia in fretta: il dito prende "Paga tutto"
     invece di "Resto", l'ingresso accanto invece di quello giusto. Le
     quattro azioni che tolgono o spostano davvero qualcosa devono
     lasciare un tasto per tornare indietro. */
  prova('il messaggio sa portare un tasto', /function toast\(msg, annulla\)/.test(APP));
  prova('e resta piu a lungo quando c e', /annulla \? 6000 : 2000/.test(APP));
  /* si guarda dentro il pezzo di codice che segue l'azione: se non
     c'e' un `fatto(` li' vicino, quell'azione non si puo' rimangiare */
  [['Ingresso eliminato', 'eliminare un ingresso'],
   ['Uscita registrata', 'far uscire un gruppo'],
   ['Incassati ', 'incassare tutto'],
   ["fatto('Svuotato'", 'svuotare la bozza']].forEach(([che, nome]) => {
    const i = APP.indexOf(che);
    prova('si puo annullare: ' + nome,
      i > 0 && APP.slice(Math.max(0, i - 300), i + 500).includes('fatto('));
  });
  prova('si rimette una fotografia, non si ricalcola al contrario',
    /function fotografia\(c\)/.test(APP) && /function rimetti\(c, foto\)/.test(APP));
}

gruppo('L’avviso di chi sfora viene a cercarti');
{
  prova('guarda anche fuori dalla lista',
    /L'AVVISO GUARDA SEMPRE|lista\(entries\)\.forEach\(e => \{[\s\S]{0,200}avvisaSforato/.test(APP));
  prova('una volta sola per gruppo', /gaAvvisati\.has\(entry\.id\)/.test(APP));
  prova('chi era gia sforato all avvio non e una notizia',
    /function avvisiGiaVisti\(\)/.test(APP) && APP.includes('avvisiGiaVisti();'));
  prova('toccandolo si va li e la scheda batte',
    /function mostraSforato[\s\S]{0,400}evidenzia/.test(APP));
  prova('e se ne va da solo', /setTimeout\(\(\) => \{[\s\S]{0,120}a\.classList\.remove\('su'\)/.test(APP));
}

gruppo('Nel guardaroba i bersagli non si pestano i piedi');
{
  /* IL GUASTO CHE C'ERA. Le pastiglie del guardaroba sono piccole, e
     per farle prendere bene ognuna si porta dietro un rettangolo
     invisibile piu' largo di quello che si vede. Fantasie e colori
     erano due file attaccate -- due pixel -- e quei due rettangoli si
     SOVRAPPONEVANO: toccando il bordo basso di una fantasia si
     cambiava il colore. Non era un'impressione, capitava davvero.
     Qui si rifa' il conto con i numeri veri del CSS: lo stacco fra le
     due file deve essere almeno quanto i due bersagli sporgono. */
  const num = (re) => { const m = CSS.match(re); return m ? parseFloat(m[1]) : NaN; };
  const sporgeFant = -num(/\.armadio \.fant button::after \{[^}]*inset:\s*(-?[\d.]+)px/);
  const sporgeTinte = -num(/\.armadio \.tinte button::after \{[^}]*inset:\s*(-?[\d.]+)px/);
  const stacco = num(/\.armadio \.stacco\.forte \{[^}]*min-height:\s*([\d.]+)px/);
  prova('i due bersagli sporgono ' + sporgeFant + ' e ' + sporgeTinte + ' pixel',
    sporgeFant > 0 && sporgeTinte > 0);
  prova('lo stacco fra le due file ne tiene ' + stacco + ': non si toccano',
    stacco >= sporgeFant + sporgeTinte,
    'servono almeno ' + (sporgeFant + sporgeTinte) + 'px');

  /* e che gli stacchi ci siano davvero, tutti e quattro */
  prova('il guardaroba mette quattro stacchi', (APP.match(/STACCO(_FORTE)?\b/g) || []).length >= 6);
  prova('due sono forti: fantasia/colore e capi/colore',
    (APP.match(/STACCO_FORTE/g) || []).length >= 3);
}

gruppo("L'aria che avanza va al guardaroba, e non schiaccia nessuno");
{
  /* Il riquadro si allunga SOLO mentre si veste qualcuno, e solo per
     crescere: `flex: 1 0 auto`. Con l'1 in mezzo -- cioe' potendo
     restringersi -- su uno schermo basso invece di far scorrere il
     vano schiaccerebbe i capi, che e' lo stesso guasto delle card del
     bar tornato da un'altra porta. */
  prova('il pannello sa quando si sta vestendo', /classList\.toggle\('veste'/.test(APP));
  const blocco = (CSS.match(/\.pan-conto\.veste[^{]*\{[^}]*\}/g) || []).join(' ');
  prova('e allora il riquadro si allunga', /flex:\s*1 0 auto/.test(blocco));
  prova('ma puo solo crescere, mai schiacciare',
    !/\.pan-conto\.veste[^{]*\{[^}]*flex:\s*1 1 /.test(CSS));
  /* gli stacchi elastici hanno un tetto: su uno schermo altissimo il
     guardaroba non deve diventare una lista sparpagliata */
  prova('gli stacchi hanno un minimo e un massimo',
    /\.armadio \.stacco \{[^}]*min-height:[^}]*max-height:/.test(CSS));
  prova('e cosi le file dei capi', /\.armadio \.roba > \.capi[^{]*\{[^}]*max-height:/.test(CSS));
  /* il margine di serie del titolo: 25 pixel che non serviva a niente */
  prova('il titolo di "Chi accompagna" non si porta il margine del browser',
    /\.testa-viola h2 \{[^}]*margin:\s*0/.test(CSS));
}

gruppo('Estendi tempo: una sezione sua, e i prezzi veri');
{
  /* I tagli rapidi SOSTITUISCONO la durata; questi tasti la
     AGGIUNGONO. Sono due domande diverse -- "quanto restano?" quando
     entrano, "quanto ancora?" quando sono dentro -- e finche' erano
     gli stessi quattro pulsanti, premere "30m" su un'ora gia' passata
     ACCORCIAVA il tempo senza che niente avvertisse. */
  prova('la sezione c e nel pannello', APP.includes('tp-est'));
  prova('e ha il suo aspetto nel foglio di stile', /\.tp-est \{/.test(CSS));
  prova('compare solo su chi e gia dentro', /classList\.toggle\('hidden', !suUno\)/.test(APP));
  prova('i tasti aggiungono, non sostituiscono',
    /d\.a === 'est'[\s\S]{0,500}durationMinutes = clamp\(m \+ quanti/.test(APP));
  prova('e ogni vendita di tempo resta scritta',
    /d\.a === 'est'[\s\S]{0,700}c\.aggiunte = lista\(c\.aggiunte\)\.concat/.test(APP));
  prova('il prezzo e quello del cartello per QUEL blocco',
    /vendute\.reduce\(\(a, m\) => a \+ priceFor\(up5\(m\)\), 0\)/.test(APP));
  prova('e le vendite non possono valere piu del tempo che c e',
    /function sistemaAggiunte/.test(APP) && (APP.match(/sistemaAggiunte\(/g) || []).length >= 4);

  /* il prezzo scritto sul tasto non e' una tabella a parte: e' il
     costo di dopo meno quello di adesso, con la stessa costOf() che fa
     il conto vero. Se un domani cambia il listino, cambia da sola. */
  prova('il prezzo dell aggiunta passa da costOf', /function costoEstensione[\s\S]{0,300}costOf\(/.test(APP));
  prova('e si spegne a tempo aperto', /if \(c\.payLater\) return;[\s\S]{0,200}durationMinutes = clamp\(m \+/.test(APP));

  /* il posto per la sezione e' stato preso dove c'era una COPIA */
  prova('la riga di comandi sparisce mentre la scheda vola',
    /\.entry\.vola \.e-fila \{[^}]*display:\s*none/.test(CSS));
  prova('e l uscita e finita nella barra del conto', APP.includes('data-uscita'));
  prova('col suo tasto che funziona', /d\.uscita !== undefined[\s\S]{0,120}chiudiIngresso\(PAN\.ingresso\)/.test(APP));
}

gruppo('Il conto sopra o sotto, a scelta');
{
  /* Non c'e' una risposta giusta: sotto e' dove arriva il pollice,
     sopra e' dove guarda chi legge prima la cifra. Si sceglie dalle
     impostazioni, e cambiare idea non deve ridisegnare niente -- si
     cambia solo l'ORDINE dei due pezzi dentro il pannello. */
  prova('l interruttore c e', HTML.includes('setContoSu') || APP.includes('setContoSu'));
  prova('e ricorda la scelta', APP.includes('settings.contoInAlto'));
  prova('e' + String.fromCharCode(39) + ' solo una classe sul pannello',
    /classList\.toggle\('conto-su'/.test(APP));
  prova('che nel CSS cambia l ordine, non il codice',
    /\.pan-conto\.conto-su \.pc-fondo \{[^}]*order:\s*-1/.test(CSS));
  prova('e la striscia si incolla in cima invece che in fondo',
    /\.pan-conto\.conto-su \.bc-fondo \{[^}]*top:\s*0/.test(CSS));
}

gruppo('Il bancone scorre, ma le card non si schiacciano');
{
  /* Una griglia con un'altezza decisa da fuori ACCORCIA le sue righe
     per farci stare tutto: le card del bar si schiacciavano a sessanta
     pixel e disegno, prezzo e tasti finivano tagliati sotto il bordo
     -- sembrava che non si aprissero piu'. E' il difetto piu' subdolo
     di una lista che scorre, perche' il codice "funziona". */
  const dove = CSS.indexOf('.pan-conto .pc-bar {');
  const css = CSS.slice(dove, dove + 400);
  prova('le righe del bancone non si accorciano', /grid-auto-rows:\s*min-content/.test(css));
  prova('e il bancone si prende lo spazio che avanza', /flex:\s*1 1 auto/.test(css));
  prova('scorrendo lo dice', /\.pc-bar\.scorre/.test(CSS) && APP.includes('sfumaBancone'));
  prova('e la card appena presa si porta a vista',
    /LA CARD CRESCE QUANDO LA PRENDI[\s\S]{0,600}scrollTop \+= sotto/.test(APP));
}

gruppo('Le liste lunghe non si disegnano tutte in un colpo');
{
  /* A fine stagione l'archivio ha migliaia di ingressi: disegnarli
     tutti vuol dire decine di migliaia di riquadri nella pagina, un
     secondo per aprirlo e la tavoletta che se li porta dietro. Ne
     bastano gli ultimi -- l'archivio serve a riaprire uno sbaglio, e
     uno sbaglio e' sempre di poco fa -- con un tasto per vedere tutto. */
  prova('l’archivio ha una soglia', /const ARCHIVIO_A_VISTA = \d+/.test(APP));
  prova('e la soglia e’ un numero sensato',
    (() => { const m = APP.match(/const ARCHIVIO_A_VISTA = (\d+)/); return m && +m[1] >= 50 && +m[1] <= 500; })());
  prova('c’e’ il tasto per vedere tutto', APP.includes('Mostra tutti ('));
  prova('e riaprendo l’archivio si riparte dagli ultimi',
    /showArchive = !showArchive; archivioTutto = false;/.test(APP));
}

gruppo('I file di prova ci sono tutti e si chiamano fra loro');
{
  const prove = readdirSync(join(RADICE, 'test')).filter(f => f.endsWith('.test.mjs'));
  prova('quattro file di prova (' + prove.join(', ') + ')', prove.length >= 4);
  prove.forEach(f => {
    const t = leggi('test/' + f);
    prova(f + ' carica l’app vera o legge il sorgente',
      /caricaApp|readFileSync/.test(t));
  });
}

/* ══════════════════════════════════════════════════════════ */
console.log('\n' + '━'.repeat(52));
if (rotti) {
  console.log('  ' + rotti + ' CONTROLLI ROTTI su ' + fatti);
  process.exitCode = 1;
} else {
  console.log('  TUTTO A POSTO — ' + fatti + ' controlli, ' + gruppi.length + ' gruppi');
}
console.log('━'.repeat(52));

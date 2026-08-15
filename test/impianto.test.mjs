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

gruppo('Nessuna funzione scritta e poi dimenticata');
{
  /* IL GUASTO CHE HA INSEGNATO QUESTO CONTROLLO. `redrawCard()` era
     scritta apposta per ridisegnare la scheda quando cambia il
     vestito, e non la chiamava NESSUNO: la figura piccola nella lista
     restava vecchia e nessun test se ne accorgeva -- il controllo dei
     fantasmi guarda le funzioni CHIAMATE e non trovate, non quelle
     trovate e mai chiamate.
     Le sette qui sotto sono resti di disegni passati: restano lì per
     ora (le casse sono in servizio, non è il momento di potare), ma da
     adesso una NUOVA funzione dimenticata fa fallire la prova. */
  const restiNoti = ['fmtDate', 'fmtDur', 'conAlfa', 'pickRole', 'bcScaffali', 'bcVociDi', 'redrawCard'];
  const pulito = APP
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const definite = [...pulito.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
  const morte = definite.filter(n =>
    (pulito.match(new RegExp('\\b' + n + '\\b', 'g')) || []).length <= 1);
  const nuove = morte.filter(n => restiNoti.indexOf(n) < 0);
  prova(definite.length + ' funzioni, nessuna NUOVA scritta e mai chiamata',
    nuove.length === 0, 'mai chiamate: ' + nuove.join(', '));
  /* e i resti noti non devono moltiplicarsi */
  prova('i resti da potare sono ancora ' + restiNoti.length,
    morte.length <= restiNoti.length, 'adesso sono ' + morte.length + ': ' + morte.join(', '));
}

gruppo('La striscia della lista: tre gruppi, ognuno col suo nome');
{
  /* C'ERANO CINQUE COPPIE MENO/PIU' IDENTICHE su due righe -- bambini,
     pagati, minuti, giri, giri pagati -- con le etichette da otto
     pixel in mezzo: la stessa forma voleva dire cinque cose diverse, e
     per sapere quale bisognava leggere. Adesso sono tre, ognuna col
     suo nome sopra in chiaro, e sono tre cose diverse fra loro.
     Il resto -- pagare, correggere una volta vecchia, cancellarla --
     lo fa lo Scontrino, che ha lo spazio per farlo bene. */
  prova('ogni gruppo ha il suo nome scritto',
    /mkCella\('[^']*', 'children', 1, 'Bambini'\)/.test(APP) &&
    /mkCella\(null, 'durationMinutes', 5, 'Tempo'\)/.test(APP) &&
    /e-nome', 'Crazy Jumping'/.test(APP));
  /* IL CRAZY NON E' PIU' UN NUMERO: e' una lista di giri, e i due
     tasti dicono cosa fanno. Il piu' e il meno non contano piu' su
     «l'ultima volta aperta» -- un giro che esisteva solo nella testa
     di chi premeva -- ma dentro il giro che hai davanti. */
  prova('il Crazy ha i due tasti dei giri',
    /Aggiungi giro/.test(APP) && /Modifica giro/.test(APP));
  prova('«aggiungi» apre davvero un giro nuovo',
    /gNuovo\.onclick[\s\S]{0,400}giroNuovo\(entry\)/.test(APP));
  prova('e il salva butta via il giro rimasto vuoto',
    /d\.gsalva !== undefined[\s\S]{0,220}viaGiro\(entry, \+d\.gsalva\)/.test(APP));
  prova('«modifica» sceglie, corregge e cancella',
    /d\.gsel !== undefined[\s\S]{0,80}giroScelto = \+d\.gsel/.test(APP) &&
    /d\.gvia !== undefined[\s\S]{0,140}viaGiro\(entry, \+d\.gvia\)/.test(APP) &&
    /d\.gpiu !== undefined[\s\S]{0,140}cambiaGiro\(entry, \+d\.gpiu, 1\)/.test(APP));
  prova('e i soldi passano dal conto, come sempre',
    /conConto\(entry, \(\) => cambiaGiro\(entry, \+d\.gmeno, -1\)\)/.test(APP) &&
    /conConto\(entry, \(\) => viaGiro\(entry, \+d\.gvia\)\)/.test(APP));
  prova('chiudendo la scheda si chiude anche l editor',
    /giriDiChi === entry\.id\) \{ chiudiGiri\(\); disegnaGiri\(\); \}/.test(APP));
  prova('la cella dei giri si prende lo spazio che avanza',
    /\.e-fila > \.e-cgiri \{ flex: 1 1 auto/.test(CSS));
  prova('e i tre tasti del conto pure',
    /\.e-azioni button\.conto \{ flex: 1 1 0/.test(CSS));
  prova('e il nome ha il suo aspetto', /\.e-nome \{/.test(CSS));
  prova('tre gruppi e basta: niente piu celle del pagato',
    !/function mkCellaPagate/.test(APP) && !/function mkCellaCrazy/.test(APP));
  prova('niente piu giro scelto da tenere a mente',
    !/giroDiLista/.test(APP) && !/giroLista/.test(APP));
  /* il piu' del Crazy apre lo stesso una volta, se non ce n'e' una */
  prova('il piu del Crazy conta dentro una volta',
    /if \(voce === 'crazy'\)[\s\S]{0,220}giroNuovo\(entry\)[\s\S]{0,120}cambiaGiro\(entry, giroOra\(entry\), d\)/.test(APP));
  /* e quello che e' sparito da qui c'e' nello Scontrino */
  prova('le volte si sistemano nello scontrino',
    /data-gpiu="/.test(APP) && /data-gvia="/.test(APP) && /sc-g-nuovo/.test(APP));
}

gruppo('Il vestito cambiato si vede subito anche nella lista');
{
  /* Si vestiva qualcuno dal conto e la figura piccola della scheda "In
     corso" restava quella di prima: si usciva guardando un avatar
     vecchio, che e' esattamente la cosa per cui la figura esiste.
     syncCard() girava a ogni tocco ma guardava solo i numeri. */
  prova('la riga sa rivestirsi', /function vestiRiga/.test(APP));
  prova('e la firma di chi c e comprende il vestito',
    /function firmaGente[\s\S]{0,220}JSON\.stringify\(p\.avatar\)/.test(APP));
  prova('syncCard se ne accorge e la riveste',
    /sigGente !== firma[\s\S]{0,140}vestiRiga\(r, entry\)/.test(APP));
  prova('e ritinge anche il pallino del bracciale', (() => {
    const i = APP.indexOf('function syncCard(entry) {');
    if (i < 0) return false;
    const fine = APP.indexOf('\nfunction ', i + 10);
    return APP.slice(i, fine > 0 ? fine : undefined).indexOf('aggiornaPallino(entry);') > 0;
  })());
  /* IL PAGATO NON STA PIU' NELLA STRISCIA: erano due coppie identiche
     a quelle della quantita', attaccate -- si segnava di aver preso i
     soldi credendo di aggiungere un bambino. Adesso si segna nello
     Scontrino, dove ogni riga dice cos'e' e quanto vale. Qui resta il
     VERDE quando e' tutto pagato, che e' un colore, non un tasto. */
  prova('il gruppo diventa verde quando e tutto pagato',
    /r\.sKids\.box\.classList\.toggle\('pagata'/.test(APP) &&
    /r\.sCrazy\.box\.classList\.toggle\('pagata'/.test(APP));
  prova('e il pagato si segna nello scontrino',
    /data-scpiu="/.test(APP) && /data-sctutta="/.test(APP));
  prova('la scheda si tiene i pezzi da rivestire',
    /cardRefs\.set\([\s\S]{0,320}avBox, nome, tratti, apriParco, sigGente/.test(APP));
}

gruppo('Le animazioni non spostano quello che si misura');
{
  /* IL GUASTO. Il pannello entrava spostato di nove pixel in giu'
     (`bcEntra` addosso a `.pan-conto`), e proprio in quei trecento
     millisecondi si misurava quanto e' alto: la misura veniva nove
     pixel corta, e al PRIMO TOCCO -- che rimisura da fermo -- tutto il
     conto in fondo saltava giu'. Il rimedio non e' togliere
     l'animazione: e' non farla al pezzo che viene misurato. */
  prova('il pannello non si muove mentre entra',
    !/\.pan-conto\.arriva \{/.test(CSS) &&
    /\.pan-conto\.arriva > \.pc-scala/.test(CSS));
  /* e le quattro card del Parco entravano una per volta, a quaranta
     millisecondi l'una dall'altra: cambiando linguetta la schermata si
     ricomponeva a pezzi e sembrava che stesse ancora caricando */
  prova('la schermata entra tutta insieme, non a pezzi',
    !/\.pc-parco\.entra > \.card:nth-child/.test(CSS));
  prova('con una animazione sola per i tre vani',
    /\.pc-parco\.entra, \.bc-griglia\.entra, \.pc-scontrino\.entra/.test(CSS));
}

gruppo('Il guardaroba non si sfascia quando compare l’Estendi');
{
  /* LA PEZZA DISEGNATA NON DECIDE QUANTO E' ALTA LA FILA. Mimetico e
     scritta sono un <svg> vero (e' l'unico modo perche' la pastiglia
     mostri la stoffa che finisce davvero addosso), e un svg quadrato
     largo quanto la pastiglia si porta dietro la SUA altezza: la fila
     delle fantasie diventava alta il doppio e finiva sopra le
     pastiglie del colore. */
  prova('il disegno della pezza sta fuori dal flusso',
    /\.armadio \.fant \.sw > svg \{[^}]*position: absolute/.test(CSS));
  prova('e la pastiglia lo ritaglia',
    /\.armadio \.fant \.sw \{[^}]*overflow: hidden/.test(CSS));
  /* e col guardaroba aperto sotto l'Estendi ci si sta lo stesso */
  prova('col pannello di chi e dentro il guardaroba si stringe',
    /\.pan-conto\.con-estendi \.armadio/.test(CSS));
  prova('e il pannello se lo dice da se', /con-estendi/.test(APP));
}

gruppo('Il banco degli amari, e ognuno col suo disegno');
{
  const ICO = leggi('js/icone.js');
  /* Una voce "Amari" sola non bastava: al banco si chiedono per nome,
     costano diverso, e a fine giornata si vuole sapere QUALE e' andato. */
  ['Eremita', 'Amaro del Capo', 'Amaro Silano', 'Limoncello', 'Kaciuto', 'Rupes',
   'Spritz base', 'Spritz completo'].forEach(n => {
    prova('nel listino c e ' + n, APP.indexOf("name: '" + n + "'") > 0);
  });
  /* il listino sta SALVATO su ogni tavoletta: senza la migrazione, le
     casse restavano con "Amari" e "Grappa" per sempre */
  prova('e arriva anche su chi ha gia l app', /amariNuovi/.test(APP));
  ['eremita', 'capo', 'silano', 'kaciuto', 'rupes', 'spritzc'].forEach(k => {
    prova('il disegno di ' + k, new RegExp('\\n\\s*' + k + ':\\s*\\(\\)').test(ICO));
  });
  prova('e i nomi del banco ci arrivano',
    /'amaro del capo':'capo'/.test(ICO) && /'kaciuto':'kaciuto'/.test(ICO) &&
    /'spritz completo':'spritzc'/.test(ICO));
  /* la busta sembrava una lattina: adesso ha lo strappo e le patatine */
  /* non e' una lattina: saldature seghettate, fianchi che rientrano */
  prova('la busta delle patatine e seghettata sopra e sotto',
    /function busta/.test(ICO) && /l1\.375 -1\.8l1\.375 1\.8/.test(ICO));
  prova('e ha i fianchi a parentesi, come quelle vere',
    /C27\.8 14 27\.8 27/.test(ICO) && /C12\.2 27 12\.2 14/.test(ICO));
}

gruppo('I giri del Crazy stanno nella sua card');
{
  /* Il tempo del Crazy si conta a giri, non a teste: tre che salgono
     insieme sono un giro solo. E in giri diversi sale chi vuole --
     "3 poi 2" non e' "5" -- quindi i giri si scrivono uno per uno. */
  prova('i giri sono una lista, non un numero', /function giriCrazy/.test(APP));
  prova('e i minuti si contano sui giri',
    /function minutiCrazy[\s\S]{0,600}turniCrazy\(e\) - primoGratis/.test(APP));
  /* i dieci minuti del solo Crazy SONO il primo giro: sommarci anche i
     minuti del giro voleva dire regalare due volte la stessa cosa */
  prova('e il primo giro del solo Crazy e gia nell omaggio',
    /primoGratis = omaggioDi\(e\) > 0 \? 1 : 0/.test(APP));
  prova('e il tempo regalato si chiede a una funzione sola',
    /function regalatiDi/.test(APP) &&
    /startTime \+ \(num\(e\.durationMinutes, 0\) \+ regalatiDi\(e\)\)/.test(APP));
  /* LA CARD RESTA QUELLA DELLE ALTRE: il piu' e il meno di sempre.
     Quello che cambiano dentro e' il GIRO SCELTO, e il giro si sceglie
     toccandolo nello storico qui accanto. Cosi' si corregge un giro
     vecchio senza una seconda fila di tasti a video. */
  prova('la card tiene i tasti di sempre',
    /'<div class="bc-zone"><span class="bc-chip">'/.test(APP) && !/function zonaGiri/.test(APP));
  prova('e il numero e quello del GIRO che si sta segnando',
    /function quantiOra/.test(APP) && /bc-chip">' \+ \(v\.id === 'crazy' \? quantiOra\(\)/.test(APP));
  prova('c e uno storico dei giri, a destra', /function storicoGiri/.test(APP) &&
    /\.bc-storico \{[^}]*width/.test(CSS));
  prova('ogni giro si tocca per sceglierlo', APP.includes('data-sel="'));
  prova('e il piu e il meno lavorano su QUELLO',
    /function metteCrazy[\s\S]{0,700}clamp\(giroScelto, 0, g\.length - 1\)/.test(APP));
  prova('quello scelto si vede acceso', /\.bc-storico \.st-riga\.on \.st-g \{/.test(CSS));
  prova('e c e un tasto per aprirne un altro', APP.includes('data-giro="crazy"'));
  prova('che apre un giro VUOTO: non fa salire nessuno da solo',
    /function giroNuovo[\s\S]{0,400}g\.push\(0\)/.test(APP) &&
    !/function giroNuovo[\s\S]{0,400}concat\(\[1\]\)/.test(APP));
  prova('ogni giro si puo cancellare', APP.includes('data-gvia="') && /function viaGiro/.test(APP));
  prova('e la crocetta ha un tasto suo, staccato dalla riga',
    /\.bc-storico \.st-via \{/.test(CSS));
  prova('lo storico sta ACCANTO, non sotto: la card non cresce',
    /\.bc-card\.con-storico \{[^}]*flex-direction:\s*row/.test(CSS));
  prova('la parte normale resta larga come le altre card',
    /\.bc-card\.con-storico \.bc-lato \{[^}]*flex:\s*0 0 calc\(\(100% - 12px\) \/ 2\)/.test(CSS));
  prova('e la card si prende la casella vuota accanto',
    /\.bc-card\.con-storico \{[^}]*grid-column:\s*span 2/.test(CSS));
  prova('i giri sono righe che scorrono',
    /\.bc-storico \.st-lista \{[^}]*overflow-y:\s*auto/.test(CSS) &&
    /\.bc-storico \.st-lista \{[^}]*flex-direction:\s*column/.test(CSS));
  prova('cambiando gruppo si riparte dall ultimo giro',
    /giroScelto = 99/.test(APP));
  prova('e la composizione si legge sulla riga del prezzo',
    /\.bc-gi \{[^}]*margin-left/.test(CSS) && APP.includes('bcGiriTesto'));
  /* i soldi restano a testa: e' il tempo che non si moltiplica */
  prova('i soldi seguono le salite, non i giri',
    /const crazy = clamp\(entry\.crazyJumping, 0, 1e6\) \* settings\.crazyJumpingPrice/.test(APP));
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
  /* L'USCITA STA NEL MENU DELLA SCHEDA, NON DENTRO IL CONTO. C'e'
     stata per un po' in fondo al pannello, accanto a «Paga tutto»:
     cioe' sotto le dita di chi lo aveva aperto per segnare una birra.
     Adesso il menu della scheda ha tre tasti che dicono dove portano
     -- Modifica (il Parco), Bar (il bancone), Uscita -- e dal conto si
     torna indietro con «Fatto». */
  prova('l uscita non sta piu nella barra del conto', !APP.includes('data-uscita'));
  prova('i quattro tasti del menu ci sono tutti',
    /const payBtn = mkAct\('[^']*Modifica', 'conto'/.test(APP) &&
    /const barBtn = mkAct\('[^']*Bar', 'conto'/.test(APP) &&
    /const scBtn = mkAct\('[^']*Scontrino', 'conto'/.test(APP) &&
    /mkAct\('[^']*Uscita', 'forte'/.test(APP));
  prova('e portano ognuno alla sua linguetta',
    /Modifica[\s\S]{0,120}apriConto\('Parco'\)/.test(APP) &&
    /Bar', 'conto'[\s\S]{0,120}apriConto\(primaCategoriaBar\(\)\)/.test(APP) &&
    /Scontrino', 'conto'[\s\S]{0,120}apriConto\('Scontrino'\)/.test(APP));
  prova('l uscita chiude l ingresso', /Uscita', 'forte'[\s\S]{0,120}chiudiIngresso\(entry\)/.test(APP));
  prova('e i tre tasti che aprono il conto si spengono insieme',
    /function spegniConto[\s\S]{0,300}barBtn\.classList\.remove\('on'\)[\s\S]{0,120}scBtn\.classList\.remove\('on'\)/.test(APP));
  prova('a conto aperto il tasto cambia linguetta invece di chiudere',
    /GIA' APERTO, MA SU UN'ALTRA LINGUETTA[\s\S]{0,600}PAN\.cat !== cat\) \{\s*PAN\.cat = cat;/.test(APP));
  prova('rifacendo la scheda si torna sulla linguetta di prima',
    /const catEra = PAN\.cat[\s\S]{0,600}apriConto\(catEra\)/.test(APP));
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

gruppo('I capi restano dentro il loro riquadro');
{
  /* Col pannello aperto su chi e' gia' dentro c'e' anche l'Estendi, e
     le file dei capi vengono strette a sessantasei pixel. I pulsanti
     pero' ne volevano settantasette -- un nome lungo va a capo su due
     righe -- e gli undici di troppo finivano SOTTO il riquadro,
     addosso all'etichetta della fila dopo: «Maglietta» sbordava sulla
     scritta «Fantasia».
     Le due regole che lo impediscono: la riga della griglia vale
     quanto il riquadro, e dentro il pulsante a cedere e' il disegno --
     che rimpicciolisce restando intero -- non il nome. */
  prova('la fila dei capi vale quanto il suo riquadro',
    /\.armadio \.capi \{[^}]*grid-auto-rows: minmax\(0, 1fr\)/.test(CSS));
  prova('il disegno puo’ stringersi',
    /\.armadio \.capo svg \{[^}]*flex: 0 1 auto;\s*min-height: 0/.test(CSS));
  prova('e il nome sotto no', /\.armadio \.capo \.nm \{ flex: 0 0 auto; \}/.test(CSS));
}

gruppo('Il tempo si muove da un posto solo');
{
  /* Due tasti che fanno la stessa cosa in due modi diversi sono un
     prezzo che cambia a seconda di dove hai toccato. Il piu' e il meno
     della striscia devono passare da `ritoccaTempo` come quelli del
     pannello: e' l'unico che sa che un ritocco entra nell'ultima
     vendita invece di lasciarla li' intera. */
  prova('la striscia non scrive i minuti a mano',
    /key === 'durationMinutes'\) conConto\(entry, \(\) => ritoccaTempo\(entry, d\)\)/.test(APP));
  prova('e i minuti si leggono come nel pannello',
    /r\.sTime\.val\.textContent = entry\.payLater \? '\\u2014' : fmtMin\(/.test(APP));
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

gruppo('Ogni linguetta apre dove dice il suo nome');
{
  /* Si ricordavano l'ultima linguetta aperta: uscendo dal Bar e tornando
     su «+ Nuovo» ci si trovava il bancone al posto dei bambini, cioe' la
     schermata che fa la cosa piu' frequente dell'app si apriva sulla
     seconda. */
  prova('+ Nuovo apre sul Parco, sempre',
    /montaPannello\(\$\('#view-new'\), draft, \{ cat: 'Parco' \}\)/.test(APP));
  prova('e il Bar sul bancone, sempre',
    /montaPannello\(\$\('#view-bar'\), draftBar, \{ cat: primaCategoriaBar\(\) \}\)/.test(APP));
}

gruppo('Il banner della scheda dice anche quanto dura');
{
  /* C'erano solo «dalle» e «alle»: per sapere se erano mezz'ora o un'ora
     bisognava fare la sottrazione a mente, su ogni scheda, mentre si
     guarda la lista di colpo d'occhio -- che e' il modo in cui questa
     lista si guarda.
     I minuti sono quelli che i due orari BRACCIANO -- cioe' compresi i
     regalati dal Crazy -- e non `durationMinutes`: con due giri l'uscita
     e' alle 20:23 partendo dalle 19:45, e li' va letto 38m, non 30m. Se
     no il banner direbbe due cose diverse nella stessa riga. Quanto
     hanno COMPRATO, che e' un altro numero, sta nella fascia del Tempo. */
  prova('la durata si ricava dai due orari, non dai minuti comprati',
    /const durata = Math\.round\(\(endTimeOf\(entry\) - entry\.startTime\) \/ 60000\)/.test(APP),
    'se usasse durationMinutes non tornerebbe col Crazy');
  prova('e finisce nel banner accanto agli orari',
    /<b class="dur">' \+ fmtMin\(durata\)/.test(APP));
  prova('a tempo aperto non si scrive nessuna durata',
    /entry\.payLater \? '' : '<b class="dur">/.test(APP),
    'senza un orario di fine non c’è una durata da scrivere');
  prova('e la durata ha il suo stile nella pastiglia', /\.e-orari \.dur \{/.test(CSS));
}

gruppo('Nella scheda lunga, il Crazy si apre sotto la sua cella');
{
  /* Il riquadro dei giri stava fuori dalla fila, cioe' in fondo alla
     scheda, sotto i quattro tasti: si toccava «Aggiungi giro» in alto e
     la cosa compariva dall'altra parte, oltre roba che non c'entrava. */
  prova('il riquadro dei giri sta dentro la fila, subito dopo il Crazy',
    /fila\.appendChild\(sCrazy\.box\);[\s\S]{0,900}?fila\.appendChild\(giriBox\);/.test(APP));
  prova('e non è più appeso in fondo alla scheda',
    APP.indexOf('dentro.appendChild(giriBox)') < 0);
  prova('e si prende una riga sua', /\.e-fila > \.e-giri \{[^}]*flex: 1 0 100%/.test(CSS));

  /* IL «PAGA TUTTO» RAPIDO: per incassare bisognava aprire il conto,
     andare nello Scontrino e premere il tasto la' dentro -- tre tocchi
     per la cosa piu' frequente che succede a chi sta uscendo. */
  prova('c’è il tasto Paga nella riga dei comandi', /'conto paga'/.test(APP));
  prova('dice la cifra che resta', /Paga ' \+ eur\(resta\)/.test(APP));
  prova('e a conto saldato sparisce invece di restare spento',
    /btn\.classList\.toggle\('hidden', !\(resta > 0\.005\)\)/.test(APP));
  prova('si rinfresca insieme al resto della scheda',
    /aggiornaPaga\(r\.pagaBtn, entry\)/.test(APP));
  prova('e quello che incassa si può annullare',
    /fatto\('Incassati ' \+ eur\(entrati\)[\s\S]{0,220}rimetti\(entry, foto\)/.test(APP));
}

gruppo('L’app si apre anche quando la rete c’è a metà');
{
  /* Senza linea `fetch` fallisce subito e si passa alla copia offline: un
     attimo. Ma con la linea DEBOLE -- il wifi visto da lontano, o il
     portale di un hotspot che si mangia le richieste -- `fetch` non
     fallisce: ASPETTA, e il browser aspetta parecchio prima di
     arrendersi. Con la pagina servita rete-prima, l'app restava bianca
     per tutto quel tempo: minuti.
     Un'app fatta per lavorare senza rete non puo' restare ostaggio di
     una rete che c'e' a meta'. */
  prova('c’è un limite di attesa per la rete', /ATTESA_RETE\s*=\s*(\d+)/.test(SW));
  const m = SW.match(/ATTESA_RETE\s*=\s*(\d+)/);
  prova('e sta sotto i cinque secondi',
    !!m && Number(m[1]) > 0 && Number(m[1]) <= 5000, m ? m[1] + ' ms' : '');
  prova('la pagina ci passa attraverso',
    /conTempo\(dallaRete, ATTESA_RETE/.test(SW));
  prova('e anche CSS e JS quando la versione in cache è diversa',
    /conTempo\(net, ATTESA_RETE/.test(SW));
  prova('ma alla primissima apertura, senza copia offline, si aspetta la rete',
    /\.then\(r => r \|\| dallaRete\)/.test(SW));

  /* stessa famiglia: l'avvio non deve restare appeso all'archivio */
  const DATI = leggi('js/dati.js');
  prova('l’apertura dell’archivio gestisce anche il caso "bloccata"',
    /onblocked/.test(DATI),
    'senza onblocked la promessa non si chiude mai e l’app non parte');
  prova('e l’avvio parte comunque se l’archivio non risponde',
    /setTimeout\(\(\) => vai\(null\), \d+\)/.test(APP));
}

gruppo('Il Bar ha lo stesso scheletro di «+ Nuovo»');
{
  /* Le due viste ospitano lo STESSO pannello, che cambia padrone. Le
     regole di impaginazione pero' nominavano solo #view-new: il Bar
     restava un blocco, il pannello dentro non veniva stirato, e la zona
     che scala perdeva una sessantina di pixel -- quanto basta a far
     scendere la griglia del bancone da tre colonne a due. Bancone e
     scontrino si vedevano schiacciati. */
  prova('la vista del Bar esiste', HTML.indexOf('id="view-bar"') >= 0);
  prova('la linguetta del Bar sta PRIMA di quella di + Nuovo',
    HTML.indexOf('data-tab="bar"') >= 0 &&
    HTML.indexOf('data-tab="bar"') < HTML.indexOf('data-tab="new"'));
  /* ogni regola che stira #view-new deve nominare anche #view-bar */
  const orfane = [];
  CSS.split('}').forEach(blocco => {
    const sel = blocco.split('{')[0];
    if (!sel || sel.indexOf('#view-new') < 0) return;
    if (sel.indexOf('#view-bar') < 0) orfane.push(sel.trim().replace(/\s+/g, ' ').slice(0, 80));
  });
  prova('nessuna regola stira solo + Nuovo lasciando indietro il Bar',
    orfane.length === 0, orfane.join(' | '));
  prova('e switchTab accende e spegne anche la vista del Bar',
    /#view-bar'\)\.classList\.toggle\('hidden'/.test(APP));
}

gruppo('La giornata finisce alle quattro anche per le copie del giorno');
{
  const DATI = leggi('js/dati.js');
  /* La copia del giorno si archiviava col giorno del calendario mentre
     tutto il resto dell'app ragiona per giornate che finiscono alle
     quattro: una serata che scavallava finiva in due chiavi diverse, e
     le due settimane promesse dal README diventavano una settimana di
     nottate. `dati.js` si carica prima di `app.js` e non puo' chiamare
     `giornataDi`: gliela si affaccia come GIORNATA_DI. */
  prova('app.js affaccia giornataDi come GIORNATA_DI',
    /window\.GIORNATA_DI\s*=\s*giornataDi/.test(APP));
  prova('dati.js ci passa per archiviare la copia',
    /GIORNATA_DI/.test(DATI));
  prova('e non torna a inventarsi il giorno da solo',
    !/function oggi\(\)\s*\{\s*const d = new Date\(\);/.test(DATI));
  prova('una richiesta a vuoto restituisce null, non se stessa',
    /esito\.result === undefined \? null : esito\.result/.test(DATI));
}

gruppo('Il primo caricamento in cloud non muore sul lotto da cinquecento');
{
  const CLOUD = leggi('js/cloud.js');
  /* Un batch di Firestore tiene 500 operazioni: con tutto in un lotto
     solo, un tablet che aveva lavorato da solo per una stagione non
     caricava NIENTE, e l'unica traccia era un console.warn. */
  const m = CLOUD.match(/PER_LOTTO\s*=\s*(\d+)/);
  prova('gli ingressi salgono a scaglioni', !!m, 'manca PER_LOTTO in cloud.js');
  prova('e lo scaglione sta sotto il limite di Firestore',
    !!m && Number(m[1]) > 0 && Number(m[1]) <= 500,
    m ? 'PER_LOTTO = ' + m[1] : '');
  prova('chi chiede il caricamento sa quanti ne sono saliti davvero',
    /Saliti '? ?\+? ?n/.test(APP) || /n >= quanti/.test(APP));

  /* L'ora la mette il server: con Date.now() del tablet, una cassa con
     l'orologio avanti vinceva sempre il "conta l'ultimo". */
  prova('si scrive anche il timbro del server', /serverTimestamp/.test(CLOUD));
  prova('e chi confronta lo preferisce all’ora del tablet',
    /function quandoAgg/.test(APP) && /quandoAgg\(c\.dato\) > quandoAgg\(entries\[i\]\)/.test(APP));
  prova('il timbro non entra nella firma del contenuto',
    /k !== 'aggS'/.test(APP));
}

gruppo('Il service worker tiene in cache una versione sola, e solo se buona');
{
  /* Restando in cache sia `?v=306` sia `?v=307`, la ricerca con
     ignoreSearch pescava la vecchia, la vedeva diversa e andava in rete:
     dopo il primo aggiornamento l'app non partiva piu' dalla cache. */
  prova('le versioni vecchie dello stesso file se ne vanno',
    /function potaVersioni/.test(SW) && /potaVersioni\(c, req\)/.test(SW));
  /* e un 404 di passaggio non deve diventare la pagina offline */
  const doc = SW.slice(SW.indexOf('if (isDoc)'), SW.indexOf('// CSS/JS'));
  prova('anche il documento entra in cache solo se e’ una risposta buona',
    /res\.status === 200/.test(doc));
  /* il nome della cache e' il secondo contatore: se non sale, le copie
     vecchie restano anche cambiando ?v= */
  prova('il nome della cache e’ numerato', /const CACHE = 'gestioparco-v(\d+)'/.test(SW));
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

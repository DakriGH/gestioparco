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

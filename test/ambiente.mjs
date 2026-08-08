/* Carica il codice VERO dell'app dentro node, con un finto browser
   attorno. Cosi' i test provano le funzioni che girano davvero al
   banco: una copia scritta a parte divergerebbe al primo ritocco e i
   test direbbero che va tutto bene mentre l'app sbaglia i conti. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, '..');

/* Un elemento finto che risponde a tutto senza fare niente: al codice
   dei conti il DOM non serve, ma qualche funzione lo sfiora. */
function nodoFinto() {
  const n = {
    style: {}, dataset: {}, classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; }
    },
    children: [], childNodes: [],
    innerHTML: '', textContent: '', value: '', className: '',
    appendChild(x) { return x; }, insertBefore(x) { return x; }, removeChild(x) { return x; },
    replaceWith() {}, remove() {}, closest() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    setAttribute() {}, getAttribute() { return null; }, focus() {}, blur() {}, click() {},
    contains() { return false; }, matches() { return false; }, insertAdjacentHTML() {}
  };
  return n;
}

const magazzino = new Map();

export function caricaApp() {
  const doc = nodoFinto();
  doc.createElement = () => nodoFinto();
  doc.createTextNode = () => nodoFinto();
  doc.documentElement = nodoFinto();
  doc.body = nodoFinto();
  doc.head = nodoFinto();
  doc.getElementById = () => null;
  doc.readyState = 'complete';

  const ctx = {
    document: doc,
    navigator: { onLine: true, serviceWorker: undefined, userAgent: 'node' },
    location: { href: 'http://test/', search: '', reload() {} },
    localStorage: {
      getItem: k => (magazzino.has(k) ? magazzino.get(k) : null),
      setItem: (k, v) => magazzino.set(k, String(v)),
      removeItem: k => magazzino.delete(k),
      clear: () => magazzino.clear()
    },
    console,
    /* la finestra ascolta resize e orientationchange per rimettere a
       misura il pannello: qui non succede mai niente, ma il codice deve
       poterselo agganciare senza schiantarsi */
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    innerWidth: 834, innerHeight: 1194, devicePixelRatio: 2,
    getComputedStyle: () => ({ paddingBottom: '10px', getPropertyValue: () => '' }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: fn => setTimeout(fn, 0),
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    fetch: () => Promise.reject(new Error('niente rete nei test')),
    Math, JSON, Date, Number, String, Object, Array, Boolean, RegExp, Error, Promise, Map, Set,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const leggi = f => readFileSync(join(RADICE, f), 'utf8');
  vm.runInContext(leggi('js/icone.js'), ctx, { filename: 'icone.js' });
  vm.runInContext(leggi('js/avatar.js'), ctx, { filename: 'avatar.js' });
  vm.runInContext(leggi('js/capi.js'), ctx, { filename: 'capi.js' });

  /* l'ultima riga di app.js accende l'applicazione: nei test non
     serve, servono le funzioni */
  let sorgente = leggi('js/app.js').replace(/\npartenza\(\);\s*$/, '\n');
  vm.runInContext(sorgente, ctx, { filename: 'app.js' });

  /* le impostazioni di serie, senza passare da init() */
  vm.runInContext('settings = defaultSettings(); entries = [];', ctx);

  /* Le `const` e le `let` del file non diventano proprieta' del
     contesto -- solo le `function` lo fanno -- quindi si affacciano a
     mano. I `get`/`set` servono perche' `draft` e `entries` vengono
     RIASSEGNATE dall'app: una copia sarebbe subito vecchia. */
  vm.runInContext(`window.__app = {
    get settings() { return settings; }, set settings(v) { settings = v; },
    get entries() { return entries; }, set entries(v) { entries = v; },
    get draft() { return draft; }, set draft(v) { draft = v; },
    AV: AV, CAPI: CAPI,
    PAN: PAN, C: C, r2: r2, tocchi: tocchi,
    contoParco: contoParco, contoCrazy: contoCrazy, contoBar: contoBar,
    contoResta: contoResta, contoPagatoParco: contoPagatoParco,
    contoPagatoCrazy: contoPagatoCrazy, contoPagatoBar: contoPagatoBar,
    bcPag: bcPag, bcPagGrezzo: bcPagGrezzo, importoRiga: importoRiga,
    totaleRiga: totaleRiga, prezzoUnita: prezzoUnita, saveEntries: saveEntries
  };`, ctx);

  const app = ctx.__app;
  /* tutto il resto (le function) sta gia' sul contesto */
  for (const k of Object.keys(ctx)) {
    if (!(k in app) && typeof ctx[k] === 'function') app[k] = ctx[k];
  }
  return app;
}

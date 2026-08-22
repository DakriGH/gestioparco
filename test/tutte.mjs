/* TUTTE LE PROVE, una dopo l'altra.

       node test/tutte.mjs

   Nove file, nove mestieri diversi:
     impianto  — che i pezzi si chiamino davvero come li chiama il codice
     conti     — le regole del denaro, una per una
     schermo   — che quello che si VEDE dica quello che dicono i conti
     giornata  — la vita intera di un ingresso, e la cassa che torna
     aperto    — il tempo aperto, che e' l'unico prezzo che si muove da solo
     tempesta  — sequenze a caso, lunghe e assurde, con gli invarianti
     vestiti   — l'icona e la figura devono dire la stessa cosa
     salvezza  — le reti: backup, dati storti, giornata che cambia alle 4
     incrocio  — ogni combinazione possibile, e le regole che non devono
                 cadere in nessuna

   Uno solo che si lamenta e questo esce male: al banco non esiste
   "quasi a posto". */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const PROVE = ['impianto', 'conti', 'schermo', 'giornata', 'aperto', 'tempesta', 'vestiti', 'salvezza', 'incrocio'];

/* DUE GIRI: con la grafica di sempre e con la Grafica 2.0 accesa.
   La 2.0 e' una modalita' di prova che cambia quello che viene
   disegnato, e mezza app la legge mentre disegna. Girando le prove solo
   col vecchio -- che e' quello di serie -- una rottura della modalita'
   nuova non la vedrebbe nessuno fino al banco. Il secondo giro accende
   `settings.grafica2` di serie (vedi `ambiente.mjs`) e rifa' tutto. */
const GIRI = [
  { nome: 'grafica di sempre', env: {} },
  { nome: 'Grafica 2.0', env: { GRAFICA2: '1' } }
];

let controlli = 0, gruppi = 0, rotte = [];
console.log('');
for (const giro of GIRI) {
  console.log('  ── ' + giro.nome);
  for (const nome of PROVE) {
    const r = spawnSync(process.execPath, [join(QUI, nome + '.test.mjs')],
      { encoding: 'utf8', env: Object.assign({}, process.env, giro.env) });
    const fuori = (r.stdout || '') + (r.stderr || '');
    const buono = fuori.match(/TUTTO A POSTO — (\d+) controlli, (\d+) gruppi/);
    if (buono && r.status === 0) {
      controlli += +buono[1]; gruppi += +buono[2];
      console.log('  ✓ ' + nome.padEnd(10) + buono[1].padStart(4) + ' controlli · ' + buono[2] + ' gruppi');
    } else {
      rotte.push(nome + ' (' + giro.nome + ')');
      const male = fuori.match(/(\d+) CONTROLLI (?:ROTTI|FALLITI) su (\d+)/);
      console.log('  ✗ ' + nome.padEnd(10) + (male ? male[1] + ' ROTTI su ' + male[2] : 'non e’ nemmeno partita'));
      /* si stampa solo quello che non va: il resto e' rumore */
      fuori.split('\n').filter(l => /FALLITO|^   NO|Error|error/.test(l)).slice(0, 8)
        .forEach(l => console.log('      ' + l.trim()));
    }
  }
  console.log('');
}

console.log('━'.repeat(52));
if (rotte.length) {
  console.log('  SI E’ ROTTO: ' + rotte.join(', '));
  process.exitCode = 1;
} else {
  console.log('  TUTTO A POSTO — ' + controlli + ' controlli in ' + gruppi + ' gruppi, ' +
              PROVE.length + ' file × ' + GIRI.length + ' grafiche');
}
console.log('━'.repeat(52) + '\n');

/* TUTTE LE PROVE, una dopo l'altra.

       node test/tutte.mjs

   Cinque file, cinque mestieri diversi:
     impianto  — che i pezzi si chiamino davvero come li chiama il codice
     conti     — le regole del denaro, una per una
     giornata  — la vita intera di un ingresso, e la cassa che torna
     tempesta  — sequenze a caso, lunghe e assurde, con gli invarianti
     vestiti   — l'icona e la figura devono dire la stessa cosa

   Uno solo che si lamenta e questo esce male: al banco non esiste
   "quasi a posto". */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const PROVE = ['impianto', 'conti', 'giornata', 'tempesta', 'vestiti'];

let controlli = 0, gruppi = 0, rotte = [];
console.log('');
for (const nome of PROVE) {
  const r = spawnSync(process.execPath, [join(QUI, nome + '.test.mjs')], { encoding: 'utf8' });
  const fuori = (r.stdout || '') + (r.stderr || '');
  const buono = fuori.match(/TUTTO A POSTO — (\d+) controlli, (\d+) gruppi/);
  if (buono && r.status === 0) {
    controlli += +buono[1]; gruppi += +buono[2];
    console.log('  ✓ ' + nome.padEnd(10) + buono[1].padStart(4) + ' controlli · ' + buono[2] + ' gruppi');
  } else {
    rotte.push(nome);
    const male = fuori.match(/(\d+) CONTROLLI ROTTI su (\d+)/);
    console.log('  ✗ ' + nome.padEnd(10) + (male ? male[1] + ' ROTTI su ' + male[2] : 'non e’ nemmeno partita'));
    /* si stampa solo quello che non va: il resto e' rumore */
    fuori.split('\n').filter(l => /FALLITO|Error|error/.test(l)).slice(0, 8)
      .forEach(l => console.log('      ' + l.trim()));
  }
}

console.log('\n' + '━'.repeat(52));
if (rotte.length) {
  console.log('  SI E’ ROTTO: ' + rotte.join(', '));
  process.exitCode = 1;
} else {
  console.log('  TUTTO A POSTO — ' + controlli + ' controlli in ' + gruppi + ' gruppi, ' +
              PROVE.length + ' file');
}
console.log('━'.repeat(52) + '\n');

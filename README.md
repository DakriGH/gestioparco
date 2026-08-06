# Gestione Parco

App di cassa per un parco divertimenti: registra chi entra, quanto resta, quanto paga, e
soprattutto aiuta a **riconoscere le persone all'uscita** avendo avuto pochi secondi per
memorizzarle.

Si usa su un **tablet grande tenuto in verticale**. Tutti i comandi stanno in alto, perché
sotto compare la tastiera.

## Come si installa sul tablet

1. Apri l'indirizzo dell'app col browser del tablet (Chrome).
2. Menù ⋮ → **Installa app** (oppure *Aggiungi a schermata Home*).
3. Aprila dall'icona 🎡: parte a schermo intero e **funziona senza rete**.

Dopo la prima apertura non serve più internet: pagina, stili, font e icone restano
sul tablet.

## Dove finiscono i dati

Sul tablet, in due posti diversi, e non se ne vanno da soli:

- ogni salvataggio va sia nella memoria veloce del browser sia in un **archivio**
  (IndexedDB). Se il browser svuota la prima, all'avvio l'app si rimette a posto dalla seconda;
- si chiede al sistema lo **spazio protetto**, così il tablet non butta via i dati per fare
  posto ad altro. A un'app installata dalla schermata Home viene concesso da solo;
- ogni giorno viene tenuta una **fotografia** di tutto, per due settimane: se qualcosa va
  storto si torna indietro dalle Impostazioni;
- resta il **backup su file**, che è la copia vera: quella la controlli tu.

L'unica cosa che cancella tutto è *"cancella dati del sito"* fatto a mano dalle impostazioni
del browser. Per quello serve il backup su file, o il cloud.

## Cloud (facoltativo, si accende dopo)

Di serie l'app lavora **solo su questo tablet**, senza account. Volendo si accende un
salvataggio in cloud con accesso a utente e password, e allora il registro diventa **unico e
condiviso**: quello che registra una cassa lo vedono subito le altre, e senza rete si lavora
lo stesso perché i dati partono da soli quando la linea torna.

Istruzioni: [GUIDA-CLOUD.md](GUIDA-CLOUD.md).

## Com'è fatta

Niente framework e niente compilazione: si apre `index.html` e funziona.

| File | Cosa fa |
|---|---|
| `index.html` | solo l'ossatura |
| `css/app.css` | tutto l'aspetto, colori come variabili |
| `js/app.js` | la logica: ingressi, tempi, conti, schermate |
| `js/avatar.js` | gli sprite delle persone e i tratti scritti |
| `js/dati.js` | archivio, copie del giorno, spazio protetto |
| `js/cloud.js` | accesso e sincronizzazione (spento finché non lo configuri) |
| `sw.js` | funzionamento senza rete |

Dopo aver toccato CSS o JS va alzato il numero `?v=` in `index.html`: è quello che
garantisce che il tablet veda la versione nuova.

Con `index.html?nosw` il funzionamento offline si disattiva e si ripulisce: serve quando si
sta lavorando al codice.

<!-- prova build 1786009433 -->

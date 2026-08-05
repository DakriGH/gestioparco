# Accendere il cloud (Firebase)

Finché non fai questi passaggi l'app funziona **esattamente come prima**: tutto sul tablet,
nessun login, nessuna schermata d'accesso. Il cloud si accende solo quando in
`js/firebase-config.js` ci sono i dati veri del tuo progetto.

È gratis e non chiede la carta di credito (piano Spark). Per una cassa di un parco i limiti
gratuiti sono enormemente più alti di quello che serve.

---

## 1. Creare il progetto (3 minuti)

1. Vai su <https://console.firebase.google.com> ed entra col tuo account Google.
2. **Crea un progetto** → dagli un nome (es. `gestione-parco`) → puoi disattivare Google Analytics.

## 2. Accendere l'accesso con email e password

Nel progetto: **Build → Authentication → Inizia** → scheda **Sign-in method** →
abilita **Email/Password** → Salva.

> Da qui, in **Authentication → Users**, vedi e crei gli account del personale. Se vuoi che
> nessuno possa registrarsi da solo, crea tu gli account qui e togli il tasto
> "Crea un accesso nuovo" dall'app (dimmelo e lo levo).

## 3. Creare il database

**Build → Firestore Database → Crea database** → scegli **modalità produzione** e la regione
`eur3 (europe-west)`.

## 4. Copiare la configurazione nell'app

**⚙️ Impostazioni progetto → Le tue app → icona web `</>`** → registra l'app (nome qualsiasi,
niente hosting per ora). Ti mostra un blocco così:

```js
const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "gestione-parco.firebaseapp.com",
  projectId: "gestione-parco",
  storageBucket: "gestione-parco.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234:web:abcd"
};
```

Copia quei sei valori dentro `js/firebase-config.js`, al posto delle virgolette vuote.
Ricarica l'app: comparirà la schermata d'accesso.

> Questi valori **non sono password**: sono pubblici per costruzione. A proteggere i dati
> ci pensano le regole del passo 5.

## 5. Mettere le regole di sicurezza

Nel file `firestore.rules` (già pronto in questa cartella) c'è la regola giusta: legge e scrive
**solo chi ha fatto l'accesso**. Per caricarla, dalla console:

**Firestore Database → Regole** → incolla il contenuto di `firestore.rules` → **Pubblica**.

Oppure da riga di comando, se hai Node:

```bash
npx firebase-tools deploy --only firestore:rules
```

---

## Mettere l'app online (facoltativo)

Così i tablet la aprono da un indirizzo, senza copiare la cartella su ognuno.

```bash
npx firebase-tools login
```

```bash
npx firebase-tools deploy --only hosting
```

Ti dà un indirizzo tipo `https://gestione-parco.web.app`. Aprilo dal tablet e usa
"Aggiungi alla schermata Home": si comporta come un'app vera, a schermo intero.

---

## Come si comporta l'app

- **Il registro è uno solo.** Chi entra vede gli stessi ingressi degli altri banchi, in tempo
  reale: se la cassa 1 registra un gruppo, sulla cassa 2 compare da solo.
- **Senza rete si lavora lo stesso.** Le modifiche restano in coda sul tablet e partono da
  sole appena torna la linea. Nelle impostazioni il pallino diventa giallo.
- **Se due casse toccano lo stesso gruppo**, vale l'ultima modifica fatta.
- **Il tema chiaro/scuro resta di ogni tablet**, non si sincronizza.
- **La prima volta che entri** da un tablet che ha già lavorato da solo, quello che c'è
  sale in cloud da solo. C'è anche il tasto *"Manda in cloud tutto quello che c'è qui"*.
- **Il backup su file continua a funzionare** ed è sempre una buona idea: è la tua copia,
  e non dipende da nessuno.

## Se qualcosa non va

| Cosa vedi | Cosa fare |
|---|---|
| "Nella console Firebase manca Email/Password" | passo 2 non fatto |
| "Email o password non corretti" | crea l'accesso col tasto "Crea un accesso nuovo", o dalla console in Authentication → Users |
| Pallino rosso "Cloud non raggiungibile" | controlla i sei valori del passo 4 |
| Entri ma non vedi gli ingressi degli altri | regole non pubblicate (passo 5), o `PARCO_ID` diverso fra i tablet |

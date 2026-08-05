/* ------------------------------------------------------------------
   Configurazione del cloud (Firebase).

   Finché questo file resta com'è, l'app funziona ESATTAMENTE come prima:
   tutto su questo tablet, nessun login. Il cloud si accende solo quando
   qui dentro ci sono i dati veri del tuo progetto.

   Come riempirlo (5 minuti, gratis, senza carta di credito):
     1. console.firebase.google.com → "Crea un progetto"
     2. nel progetto: Build → Authentication → Sign-in method →
        abilita "Email/Password"
     3. Build → Firestore Database → "Crea database" (modalità produzione)
     4. Impostazioni progetto (⚙️) → Le tue app → icona web </> →
        registra l'app: ti mostra un blocco `firebaseConfig`
     5. copia quei valori qui sotto e ricarica l'app

   Questi valori NON sono password: sono pubblici per progetto: a proteggere
   i dati ci pensano le regole in `firestore.rules` (solo chi ha fatto
   l'accesso legge e scrive).
   ------------------------------------------------------------------ */
window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

/* Il registro è uno solo e lo vedono tutti quelli che entrano.
   Cambia questo nome solo se un giorno gestisci due parchi diversi. */
window.PARCO_ID = 'parco';

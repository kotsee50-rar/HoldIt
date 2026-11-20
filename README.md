# IXH26-project

### <nome_progetto>
Track: XRPL Application
Target: DAO, Tesorerie Aziendali, Fondi Web3.
Elevator Pitch: "Il primo Execution Engine nativo su XRPL che protegge le tesorerie istituzionali dallo slippage e dal front-running. Esegue ordini massivi in modo frazionato e, opzionalmente, confidenziale."

### 1. Il Problema (Il Doloroso Status Quo)
Le DAO e le aziende crypto gestiscono enormi quantità di token. Quando devono liquidare fondi per pagare stipendi o fornitori sul DEX nativo di XRPL (che è completamente trasparente), si trovano di fronte a due disastri:

Lo Slippage: Un ordine "Market Sell" di 100.000 token fa crollare l'order book. La tesoreria perde il 10-15% del valore in pochi secondi.

Il Front-Running: Non appena la transazione appare nella mempool, i bot (MEV) la vedono, vendono prima della tesoreria, il prezzo crolla, e i bot ricomprano a prezzo scontato.

### 2. La Soluzione
TreasuryGuard è una dashboard (non-custodial) dove la tesoreria deposita i token e imposta un Mandato.

Esempio: "Voglio vendere 100.000 token. Tolleranza massima di slippage: 0.5%."
Il nostro Agente di Esecuzione prende il controllo, legge l'order book in tempo reale e inizia a inviare micro-ordini (OfferCreate) solo quando le condizioni di mercato sono sicure, senza mai impattare il prezzo.

### 3. Architettura Tecnica (Cosa vedere nel codice)
Il progetto si basa al 100% sull'infrastruttura nativa di XRPL (niente EVM, niente bridge).

Frontend (React/Next.js): Una dashboard in due pannelli:

Public View: L'order book reale di XRPL (tramite API book_offers). Mostra l'assenza di enormi "Sell Wall".

Treasury View: L'input del mandato, il volume eseguito, la progress bar e il badge di successo dello slippage.

Backend / Execution Agent (Node.js con xrpl.js):

Legge i dati di mercato.

Calcola la profondità e la dimensione ottimale del "chunk" (frammento).

Esegue la transazione, aspetta i 3-5 secondi di finalità di XRPL, verifica il prezzo e passa al chunk successivo.

(Upgrade ZK - Solo se avete lo sviluppatore Rust):

Invece di eseguire in chiaro, il mandato viene nascosto in uno Smart Escrow (XLS-0100).

Un circuito RISC Zero (zkVM) genera una prova crittografica che attesta: "Il prezzo attuale è superiore alla mia soglia segreta, quindi autorizzo l'esecuzione di questo chunk".

La proof viene verificata on-chain dall'escrow (tramite il validatore ZK nativo di XRPL), sbloccando l'esecuzione senza rivelare al mercato l'intenzione della DAO.

### 4. La Demo (Il momento "Wow" per i giudici)
La demo non deve essere un terminale, ma uno scontro visivo:

Il Disastro: L'utente clicca "Naive Market Sell". Sullo schermo, un ordine da 100.000 token svuota l'order book, il prezzo crolla e un alert rosso recita "Slippage: 14% - Value Destroyed".

La Soluzione: L'utente clicca "Esegui con TreasuryGuard". L'app mostra l'Agente che invia chunk da 5.000 token. La progress bar si riempie dolcemente. L'order book pubblico non mostra nessuna anomalia. Un alert verde finale recita "Ordine completato. Slippage: 0.3% - Treasury Safe".

### 5. Mappatura sui Criteri di Valutazione (Perché vince)
Idea (Originalità): Risolve un problema finanziario reale per le istituzioni. Se usate l'upgrade ZK, siete gli unici a portare la vera privacy istituzionale su XRPL (differenziandovi da progetti come Pyramid che fanno solo retail).

Implementazione (Codice): Usa l'SDK ufficiale (xrpl.js), sfrutta la velocità del DEX di XRPL e (opzionalmente) le nuove frontiere degli Smart Escrow e ZK.

Demo Quality: Il confronto side-by-side (Naive vs. Guarded) è visivamente schiacciante. I giudici capiscono il valore in 5 secondi.

Potential (Scalabilità): È un modello SaaS B2B. Le DAO pagherebbero volentieri una fee in basis point per non perdere il 15% del loro capitale. XRPL è pensata per le istituzioni: questo è il tool che mancava.

Piano d'Azione per il Team (Cosa fare ORA)
Decidete la strada: Avete un mago di Rust? Fate la versione ZK (Pivot B). Non ce l'avete? Fate la versione standard (Execution Engine classico). Entrambe sono forti.

Backend: Scrivete la funzione executeOrder(amount, maxSlippage). Fate in modo che prenda l'order book, calcoli i pezzi e invii le transazioni a raffica controllando che il prezzo medio non sfori il limite.

Frontend: Costruite l'interfaccia con i due pannelli e l'animazione della progress bar. È il 50% del voto sulla demo.

Pitch: Preparate il discorso sui "milioni persi dalle DAO a causa del front-running". Colpite l'emotività finanziaria dei giudici.

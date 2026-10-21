# Plan: Diario di diagnostica

## Sintesi

Tre file nuovi e aggiunte minime a quelli esistenti. Il processo main possiede il diario: `log-journal.js` scrive su disco e ruota i file, `log-diagnostics.js` decide che cosa vale la pena annotare e si abbona agli eventi di sistema, finestra e processi. Il renderer contribuisce con un solo canale IPC nuovo (`debug-beat`): `log-heartbeat.js` conta i fotogrammi disegnati, quelli consegnati dalla camera e i giri di un timer, e ogni dieci secondi manda il riepilogo al main, che lo traduce in una riga sola.

## File coinvolti

- `log-journal.js` (nuovo, main) — apre un file per avvio in `logs/` sotto i dati utente, cancella i più vecchi tenendo gli ultimi cinque, espone `logLine(categoria, testo)` e il path della cartella. Unico punto del progetto che scrive righe di diagnostica su disco.
- `log-diagnostics.js` (nuovo, main) — che cosa osservare: schermi, alimentazione, finestra, processi figli, console del renderer, e la lettura del battito con il riconoscimento delle combinazioni anomale.
- `log-heartbeat.js` (nuovo, renderer) — i tre contatori e l'invio del battito. Non interpreta niente: conta e spedisce.
- `main.js` — apre il diario e avvia la diagnostica come prima cosa in `initialize`, aggancia `watchWindow` alla finestra appena creata, registra il canale `debug-beat`, aggiunge la voce di menu "Open Logs Folder" e annota nel diario crash del renderer, avvio fallito ed eccezioni non gestite.
- `preload.js` — canale `debug-beat` in whitelist (`send`).
- `renderer.js` — istanzia e avvia `Heartbeat` subito dopo il face tracker, prima di `startCamera` così il diario copre anche un avvio della camera che fallisce; espone `describeTrackingState()` per la riga del battito.
- `index.html` — `<script>` di `log-heartbeat.js` prima di `renderer.js`.
- `log-shipper.js` (nuovo, main, 2026-10-21) — spedizione al server: ogni 30 s le righe nuove di ogni diario in `logs/` verso `https://home-server.tail6fec67.ts.net/diari/ricevi`, a pezzi di righe intere.
- `face-tracker-diary.js` (nuovo, renderer, 2026-10-21) — la riga del face tracking nel battito e il flag acceso/spento che il main confronta con il menu.
- `face-detection-client.js` — contatori per il battito (richieste, risposte, volti, errori, frame saltati) e cattura di `onerror` del worker.
- Lato server, nel repo homelab: `host/api/scenarios/diari/ricevi.py` (endpoint `POST /diari/ricevi` di homelab-api), file in `~/data/diari/<app>/<computer>/`.

## Decisioni di design

- **Il diario vive nel main, non nel renderer.** Il renderer è il processo che può morire o piantarsi: se fosse lui a scrivere, mancherebbero proprio le righe che spiegano il guasto. Il main sopravvive ai crash della finestra, quindi può annotare sia il crash sia il silenzio che lo precede.
- **Scrittura sincrona** (`appendFileSync`): del diario servono soprattutto le ultime righe prima di un blocco, e un buffer in memoria è esattamente ciò che si perde quando un processo muore di schianto. A una riga ogni dieci secondi il costo è invisibile.
- **Tre contatori, non uno.** Il timer dice se il codice della finestra gira, i fotogrammi disegnati dicono se Windows compone ancora la finestra, quelli della camera dicono se lo stream è vivo. Sono i tre guasti che a occhio sembrano tutti "l'app si è congelata" e chiedono rimedi opposti; un contatore solo non li separa.
- **Fotogrammi decodificati oltre a quelli consegnati.** `requestVideoFrameCallback` si ferma insieme al disegno della finestra, quindi durante un blocco del compositing segnalerebbe a torto una camera morta — ed è la stessa ambiguità che può far scattare il watchdog dello stallo camera per un guasto che con la camera non c'entra. `getVideoPlaybackQuality().totalVideoFrames` continua a salire, ed è quindi l'unico contatore che permette di dire "la camera stava consegnando mentre l'immagine era ferma". Verificato sul posto il 2026-09-14: a regime i due conteggi coincidono.
- **Le anomalie sono scritte a parole, e solo ai bordi.** La riga di stato resta un dato grezzo; quando la combinazione dei contatori disegna la firma di un guasto noto, il diario lo scrive in italiano. Si annota l'inizio e il rientro con la durata: un guasto lungo altrimenti scriverebbe centinaia di righe identiche e sommergerebbe gli eventi che lo spiegano.
- **Finestra nascosta o minimizzata esclusa dal giudizio**: lì Windows smette di disegnare apposta e ogni riga sarebbe un falso allarme. Lo stato si legge dal main (`isVisible`/`isMinimized`) oltre che dal renderer (`document.hidden`), perché sono cose diverse e in un blocco possono divergere.
- **I `console.log` esistenti diventano righe di diario** via `webContents.on("console-message")`, invece di introdurre una seconda API di logging per il renderer: riavvio della camera, riciclo del motore di rilevamento e pausa al buio finiscono nel file senza toccare i punti che li scrivono. Un solo modo di annotare, quello che c'era già.
- **`move` e `resize` non si annotano**: durante un trascinamento con AltSnap arrivano a raffica. Si annota solo il passaggio della finestra da uno schermo all'altro, che è il dato che serve all'ipotesi "si blocca solo sul monitor esterno".
- **Sempre acceso, nessun interruttore.** Il guasto è raro e non si prevede: un interruttore garantirebbe soltanto che il diario sia spento il giorno che serve.
- **Rotazione per avvio, non per data.** Un file per avvio, ordinabile per nome perché il nome contiene la data ISO; si tengono gli ultimi cinque e ogni file si ferma a 20 MB. Chi indaga vuole "l'ultima volta che è successo", che è quasi sempre un avvio intero.
- **Categorie in italiano** (`avvio`, `battito`, `anomalia`, `finestra`, `schermo`, `alimentazione`, `console`): il diario lo legge anche l'utente, e la prima cosa che deve poter fare è cercare `anomalia` nel file.

- **Nessuna memoria di spedizione sull'app.** Ogni pezzo dichiara da che byte comincia, il server accoda solo la parte nuova e risponde con quanti byte ha: è quella risposta a dire da dove ripartire. Il primo contatto con un file è una domanda a vuoto, così i diari vecchi non si rispediscono a ogni avvio. Niente doppioni dopo un invio ripetuto, niente buchi dopo un invio perso, niente file di stato da tenere allineato.
- **Il diario locale è anche la coda.** Se il server non risponde non serve un buffer a parte: le righe sono già sul disco, si riprova al giro dopo. Il tetto di 40 richieste per giro fa recuperare in qualche giro una lunga assenza senza una raffica sola.
- **Il face tracking annota con `console.log`**, che il travaso della console porta già nel diario: le transizioni (acceso/spento con motivo, inseguimento partito/arrivato) passano da lì, i contatori dal battito.
- **Il disaccordo menu/finestra ha un suo stato**, separato dalle anomalie dell'immagine, perché può durare insieme a loro e nessuno dei due deve nascondere l'altro.

## Invarianti

- Il diario non deve mai poter fermare l'app: ogni errore di scrittura lo chiude in silenzio e lascia la console come unico canale.
- `logLine` è l'unico punto che scrive su disco righe di diagnostica. Chi vuole annotare qualcosa passa da lì.
- Il renderer non decide mai se qualcosa è un'anomalia: conta e spedisce. L'interpretazione sta tutta in `log-diagnostics.js`, dove si può correggere senza toccare la finestra.

## Rischi noti

- Le soglie del riconoscimento (pausa del timer oltre 3 s, silenzio del battito oltre 25 s) sono scelte a tavolino: i primi diari veri diranno se generano falsi allarmi.
- `performance.memory` non è standard: se un domani sparisse, la riga riporterebbe 0 senza rompere niente.

# Plan: L'immagine che si ferma

## Sintesi

Una sentinella sola nel renderer (`video-stall-watcher.js`) confronta quattro volte al secondo i fotogrammi decodificati dalla camera con quelli davvero mostrati, e da quel confronto capisce da che parte sta il guasto; poi chiama uno dei due rimedi. Il riavvio dello stream resta in casa del renderer, che già lo sa fare; la scossa alla finestra è mestiere del main, e ci arriva sul canale `repaint-request`, dove `window-repaint.js` applica due gradini e ospita anche il ritocco periodico opzionale.

## File coinvolti

- `video-stall-watcher.js` (nuovo, renderer) — conta i fotogrammi mostrati, controlla ogni 250 ms, classifica il guasto confrontando i due conteggi e chiama `onPresentationStall` o `onCameraStall`. Espone il conteggio cumulativo, letto anche dal diario.
- `window-repaint.js` (nuovo, main) — i due gradini della scossa, l'intervallo minimo fra tentativi, il freno quando il blocco non risponde, e `setPeriodicRefresh` per il ritocco a orologio.
- `face-tracker.js` — perde il watchdog sullo stallo (`watchVideoFrames`, il conteggio dentro `detectTick`, `maybeRestartStalledCamera`) e il callback `restartCamera`. Torna sotto le 200 righe.
- `face-tracker-view.js` — accoglie `isTinyStep` e `isAtTarget`, due soglie di pura geometria della vista che stavano in fondo a `face-tracker.js`.
- `face-tracker-tuning.js` — via `videoStallTimeoutMs` e `videoStallRestartCooldownMs`: non sono manopole del face tracking, vivono accanto alla sentinella che le usa.
- `renderer.js` — istanzia la sentinella e le passa i due rimedi; non passa più `restartCamera` al face tracker.
- `log-heartbeat.js` — legge il conteggio dei fotogrammi mostrati dalla sentinella invece di tenerne uno suo.
- `main.js` — canale `repaint-request`, chiave di settings `windowRefreshSeconds`, voce di menu "Auto Refresh" nel submenu Window, avvio del ritocco periodico dopo `createWindow`.
- `preload.js`, `index.html` — canale in whitelist e script della sentinella.

## Decisioni di design

- **Una sentinella sola, non una per feature.** Quella vecchia viveva dentro `face-tracker.js`: sorvegliava solo a tracking acceso e conosceva una sola causa, quindi per il blocco del disegno ordinava il riavvio della webcam — cura sbagliata per quel guasto, e nessuna cura affatto per chi tiene il tracking spento. La sorveglianza dell'immagine non è una funzione del face tracking: è una funzione dell'app.
- **La rilevazione conta fotogrammi, non millisecondi.** Un timeout a tempo ("niente sullo schermo da N ms") va tarato contro la webcam più lenta possibile, e al buio le webcam scendono a pochi fotogrammi al secondo: per stare tranquilli servirebbero due secondi buoni. Confrontare i due conteggi sullo stesso giro — decodificati contro mostrati — si tara invece da solo: se la camera è lenta, in quel giro non decodifica niente nemmeno lei e non si conclude nulla. È questo a permettere mezzo secondo di reattività senza falsi allarmi, che è quello che l'utente ha chiesto (2026-09-14: preferisce un microscopico scatto a un blocco).
- **Due giri a vuoto, non uno.** Un solo giro con fotogrammi decodificati e nessuno mostrato può capitare per il normale sfasamento fra arrivo e presentazione, quando un fotogramma cade a cavallo di due controlli. Due di fila no. Con giri da 250 ms fanno mezzo secondo di reattività.
- **Due attese diverse**: mezzo secondo per il blocco del disegno, quattro secondi per il riavvio della camera. Il primo rimedio è invisibile e senza conseguenze, quindi può scattare presto; il secondo rifà lo stream e merita più prudenza.
- **Rimedi in scala, dal più leggero.** Primo gradino le due mosse che non spostano niente: `webContents.invalidate()` e la riaffermazione del primo piano (`setAlwaysOnTop` spento e riacceso), che su Windows rimette la finestra nella banda topmost da cui un'app a schermo intero può averla sfrattata e obbliga il gestore delle finestre a rifare i conti su di lei. Secondo gradino, mezzo secondo dopo, anche lo spostamento di un pixel, che è ciò che fa l'utente a mano e che sappiamo funzionare.
- **Il focus non si tocca mai.** `focus()` e `show()` sbloccherebbero di sicuro, ma strapperebbero la tastiera a quello che l'utente sta scrivendo, in piena call: una cura peggiore del male. Stessa logica per `moveTop()`, che con "Always on Top" spento imporrebbe un ordine di finestre che l'utente ha deliberatamente rifiutato — il primo piano si riafferma solo a chi lo ha chiesto.
- **Il ritorno dopo la spinta è rimandato di 50 ms**: due `setBounds` nello stesso istante Windows li accorpa e non forzano niente. E due spinte non si accavallano mai: la seconda leggerebbe come posizione di casa quella già spostata, e la finestra migrerebbe di un pixel a ogni blocco invece di tornare dov'era — difetto trovato in prova il 2026-09-14, prima che arrivasse in mano all'utente.
- **Un blocco che non risponde non si insegue all'infinito**: dopo una decina di tentativi fitti la cadenza scende a uno ogni cinque secondi. Senza, una finestra irrecuperabile verrebbe scossa due volte al secondo per ore, con altrettante scritture della posizione su disco.
- **La scossa periodica è la stessa scossa, con un secondo innesco.** `setPeriodicRefresh` non ha logica propria: chiama le stesse due funzioni del gradino due. È la rete per il caso che la sentinella non può coprire — se a piantarsi è il codice della finestra, nessuno chiederà mai niente al main. Spenta di serie, perché è una pezza sulla pezza: si accende solo se un blocco sfugge alla scossa automatica. Il singolo ritocco non finisce nel diario, altrimenti a cinque secondi di cadenza seppellirebbe ogni altra riga.
- **La scossa la dà il main**: la finestra è sua. Il renderer si accorge del guasto — è lui che ha i contatori — ma non tocca la finestra, coerente con il resto del progetto dove il main è l'unico proprietario di finestra e settings.
- **Niente reload come ultimo rimedio**: rifarebbe la webcam da zero con un nero visibile, ed è sproporzionato per un guasto che si risolve con uno spostamento. Se i diari mostrassero blocchi che resistono a entrambi i gradini, se ne riparla con i dati.

- **Il codice fermo lo sorveglia il main (2026-10-21).** La sentinella chiama `onAlive` a ogni giro, il renderer lo gira al main sul canale `renderer-alive`, e `window-repaint.js` controlla ogni 250 ms quanto è passato dall'ultimo: oltre un secondo chiama `requestRepaint`, quindi stessi gradini, stesso freno, un solo posto che scuote. Il segno di vita parte dalla sentinella e non da un timer nuovo perché è già il giro che gira sempre, dal primo avvio. Se il giro del main stesso è arrivato in ritardo (computer in sospensione) l'attesa riparte da zero invece di scattare.
- **Le scosse non sono spostamenti dell'utente.** `window-repaint.js` espone `isNudgeInProgress()` e `log-diagnostics.js` ignora gli eventi di spostamento che cadono dentro una scossa.

## Invarianti

- La finestra torna sempre alla posizione esatta da cui è partita: la spinta non deve mai lasciare residui, nemmeno dopo molti blocchi consecutivi.
- Un solo posto conta i fotogrammi mostrati (`video-stall-watcher.js`): diario e sentinella leggono lo stesso contatore, non due.
- Un solo posto scuote la finestra (`window-repaint.js`): rilevazione automatica e ritocco periodico chiamano le stesse funzioni.
- Il renderer non tocca la finestra e il main non conta fotogrammi.
- Il primo riavvio della camera non deve aspettare nessun intervallo: l'intervallo minimo vale fra due riavvii, non fra l'avvio dell'app e il primo.

## Rischi noti

- `webContents.invalidate()` e la riaffermazione del primo piano potrebbero non bastare su una superficie grafica persa: per quello esiste il secondo gradino. I diari diranno quale dei due lavora davvero.
- Con "Auto Refresh" acceso la posizione della finestra viene riscritta su disco a ogni ritocco (`electron-window-state` reagisce agli eventi di spostamento). Innocuo, ma è una ragione in più per lasciarlo spento se non serve.

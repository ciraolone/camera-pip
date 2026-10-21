# Diario di diagnostica

Un registro su file di quello che succede all'app mentre gira, pensato per una cosa sola: quando l'immagine si ferma, poter capire **a posteriori** quale dei guasti possibili è stato, invece di ripartire ogni volta dalle ipotesi. Serve perché il blocco è raro, capita mentre l'utente sta lavorando (spesso in call) e non è riproducibile a comando: l'unico modo di studiarlo è che l'app se lo sia annotato da sola.

## Chiarimenti

### Sessione 2026-09-14

- Q: Perché serve un diario, se i blocchi si vedono a occhio? → A: Perché "l'immagine è ferma" è il sintomo comune di almeno tre guasti diversi, con rimedi opposti: la camera che smette di consegnare fotogrammi, la finestra che Windows non compone più (immagine congelata ma app viva), e il codice della finestra che si pianta davvero. A occhio sono indistinguibili; nei contatori no.
- Q: Che cosa distingue i tre casi? → A: Tre contatori che scorrono in parallelo e si confrontano fra loro: i giri di un timer (il codice gira), i fotogrammi disegnati (Windows compone la finestra), i fotogrammi della camera. Il conteggio dei fotogrammi decodificati va contato a parte, perché è l'unico che continua a salire anche mentre la finestra non viene disegnata.
- Q: Il diario va acceso quando serve? → A: No, è sempre attivo. Il guasto è raro e non si prevede: un interruttore garantirebbe solo che sia spento proprio il giorno che capita. Il costo è una riga ogni dieci secondi.
- Q: Dove finiscono i file e come ci si arriva? → A: In `logs/` dentro la cartella dati dell'app, con un file per avvio; dal menu del tasto destro una voce apre direttamente la cartella in Esplora risorse, così non c'è da cercare percorsi a mano.
- Q: Il diario può crescere senza controllo? → A: No. Si tengono gli ultimi cinque avvii e ogni file si ferma a 20 MB, circa dodici giorni di funzionamento continuo.

## Scenari

### Il diario registra da solo, senza che nessuno lo accenda

Dal momento in cui l'app parte, un file nuovo raccoglie quello che succede. Test: TBD.

- A ogni avvio nasce un file nuovo, con nell'intestazione versione dell'app, versione di Windows, stato dell'accelerazione grafica e schermi collegati.
- Ogni dieci secondi viene scritta una riga di stato con i contatori, la memoria occupata, lo stato della camera e quello del face tracking.
- I file dei vecchi avvii si cancellano da soli: ne restano gli ultimi cinque.
- Dal menu del tasto destro una voce apre la cartella dei log.

### Le combinazioni anomale vengono dette a parole

Chi rilegge il diario non deve interpretare numeri: quando i contatori disegnano la firma di un guasto, l'app lo scrive in chiaro. Test: TBD.

- Se la finestra smette di essere disegnata mentre la camera continua a consegnare fotogrammi, il diario scrive che l'immagine è ferma ma l'app è viva, e che il sospetto è il compositing (schermo esterno, GPU, occlusione).
- Se la camera smette di consegnare fotogrammi mentre la finestra viene ancora disegnata, il diario lo distingue dal caso precedente.
- Se il codice della finestra resta fermo per più di qualche secondo, il diario lo registra con la durata della pausa.
- Se la finestra smette del tutto di farsi sentire, è il processo principale ad annotarne il silenzio.
- Un guasto che dura a lungo non riempie il file di righe uguali: si annota quando comincia e quando rientra, con quanto è durato.
- Una finestra nascosta o minimizzata non genera falsi allarmi: lì Windows smette di disegnare apposta.

### Gli eventi che possono spiegare un blocco vengono annotati sul momento

Oltre alle righe di stato, il diario registra i fatti che possono essere la causa. Test: TBD.

- Schermi aggiunti, rimossi o cambiati di risoluzione, scala o posizione.
- Sospensione, risveglio, blocco e sblocco del computer, passaggio da rete a batteria.
- Passaggio della finestra da uno schermo all'altro, e ogni volta che viene mostrata, nascosta, minimizzata o ripristinata.
- Morte di un processo interno dell'app (in particolare quello grafico) e morte o ricarica della finestra.
- I messaggi che l'app già scrive in console (riavvio della camera, riciclo del motore di rilevamento, pausa al buio) finiscono nel diario senza doverli riscrivere.

## Non-goals

- Nessun invio di dati fuori dal computer: il diario resta un file locale, letto solo se e quando serve.
- Nessuna riparazione automatica **dentro il diario**: qui si osserva e si annota. Il rimedio al blocco del disegno esiste, ma è una feature a sé (vedi `003-immagine-ferma`) che nel diario si limita a lasciare le sue righe `rimedio`.
- Nessuna interfaccia per leggere i log dentro l'app: si aprono con un editor di testo qualsiasi.
- Niente registrazione di immagini o audio: solo contatori e stati.

## Assunzioni

- Il numero di fotogrammi disegnati si misura con `requestAnimationFrame`, che si ferma quando Windows non compone più la finestra: è proprio quel buco nel conteggio il segnale cercato. L'app disattiva già la limitazione dei fotogrammi in secondo piano (`backgroundThrottling: false`), quindi una finestra in secondo piano ma visibile continua a contare normalmente.
- I fotogrammi decodificati letti da `getVideoPlaybackQuality()` continuano a salire anche mentre la finestra non viene disegnata. Verificato sul posto il 2026-09-14: su uno stream della webcam i due conteggi coincidono quando tutto funziona.
- Una riga ogni dieci secondi è abbastanza fitta da inquadrare il minuto in cui è successo qualcosa, e abbastanza rada da non pesare.

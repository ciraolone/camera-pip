# Diario di diagnostica

Un registro su file di quello che succede all'app mentre gira, pensato per una cosa sola: quando l'immagine si ferma, poter capire **a posteriori** quale dei guasti possibili è stato, invece di ripartire ogni volta dalle ipotesi. Serve perché il blocco è raro, capita mentre l'utente sta lavorando (spesso in call) e non è riproducibile a comando: l'unico modo di studiarlo è che l'app se lo sia annotato da sola.

## Chiarimenti

### Sessione 2026-09-14

- Q: Perché serve un diario, se i blocchi si vedono a occhio? → A: Perché "l'immagine è ferma" è il sintomo comune di almeno tre guasti diversi, con rimedi opposti: la camera che smette di consegnare fotogrammi, la finestra che Windows non compone più (immagine congelata ma app viva), e il codice della finestra che si pianta davvero. A occhio sono indistinguibili; nei contatori no.
- Q: Che cosa distingue i tre casi? → A: Tre contatori che scorrono in parallelo e si confrontano fra loro: i giri di un timer (il codice gira), i fotogrammi disegnati (Windows compone la finestra), i fotogrammi della camera. Il conteggio dei fotogrammi decodificati va contato a parte, perché è l'unico che continua a salire anche mentre la finestra non viene disegnata.
- Q: Il diario va acceso quando serve? → A: No, è sempre attivo. Il guasto è raro e non si prevede: un interruttore garantirebbe solo che sia spento proprio il giorno che capita. Il costo è una riga ogni dieci secondi.
- Q: Dove finiscono i file e come ci si arriva? → A: In `logs/` dentro la cartella dati dell'app, con un file per avvio; dal menu del tasto destro una voce apre direttamente la cartella in Esplora risorse, così non c'è da cercare percorsi a mano.
- Q: Il diario può crescere senza controllo? → A: No. Si tengono gli ultimi cinque avvii e ogni file si ferma a 20 MB, circa dodici giorni di funzionamento continuo.

### Sessione 2026-10-21

- Q: Perché il diario deve uscire dal computer? → A: L'app gira sul laptop, che dal server non si raggiunge: un diario che resta lì dentro va recuperato a mano ogni volta, e per indagare il face tracking che smette di funzionare serve leggerlo subito. Decisione di Andrea: l'app lo spedisce da sola al server di casa.
- Q: Per quale strada? → A: Solo dalla rete privata (tailnet), verso un piccolo ricevitore dentro homelab-api (`POST /diari/ricevi`), che rifiuta le richieste arrivate da internet. Sul server i file finiscono in `~/data/diari/camera-pip/<computer>/`, uno per avvio come sul laptop.
- Q: Cosa succede se il laptop è fuori casa o senza rete? → A: Niente si perde: il file sul disco del laptop fa da coda, e alla prima occasione la spedizione riprende dal punto esatto in cui si era fermata, compresi i diari degli avvii precedenti.
- Q: Cosa deve raccontare del face tracking? → A: Abbastanza da distinguere a freddo i modi in cui "non fa niente": chi l'ha acceso o spento e perché, rilevatore fermo o che non risponde, volto non trovato, rilevamento rallentato, inseguimenti partiti e arrivati, e se il menu e la finestra sono d'accordo.

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
- I messaggi che l'app già scrive in console (riavvio della camera, riciclo del motore di rilevamento, rallentamento senza volto) finiscono nel diario senza doverli riscrivere.

### Il diario arriva da solo sul server di casa

Chi indaga legge il diario dal server, senza toccare il laptop. Test: TBD.

- Ogni trenta secondi le righe nuove partono verso il server, se il laptop è nella rete privata.
- Sul server ogni avvio ha il suo file, nella cartella del computer da cui arriva.
- Se il server non si raggiunge, il diario lo annota una volta sola, e annota anche quando l'invio riprende.
- Dopo un'assenza di rete o un riavvio dell'app la spedizione riprende dal punto giusto: sul server non mancano righe e non ce ne sono di doppie.
- Le richieste che arrivano da internet invece che dalla rete privata vengono rifiutate.

### Il face tracking racconta cosa sta facendo

Quando il tracking smette di muovere l'inquadratura, il diario dice quale dei possibili motivi è. Test: TBD.

- Ogni accensione e spegnimento è annotato con chi l'ha deciso: il menu, un comando manuale di zoom o spostamento, l'avvio dell'app, il rilevatore che non riesce a partire.
- Ogni riga di stato riporta la cadenza della ricerca (piena o rallentata senza volto), lo stato del rilevatore e da quanto non risponde, quante richieste, risposte, volti trovati, errori e fotogrammi saltati negli ultimi dieci secondi, se un volto è agganciato, se l'inseguimento è in corso e la vista applicata.
- Ogni inseguimento annota quando parte, di quanto il volto era fuori zona, e quando arriva; il rientro alla vista neutra per volto assente è annotato a parte.
- Se il menu dice che il tracking è acceso ma la finestra l'ha spento (o il contrario), il diario lo segnala come anomalia, con l'inizio e il rientro.
- Gli errori che sfuggono al motore di rilevamento finiscono nel diario invece di fermarlo in silenzio; le eccezioni non gestite della finestra riportano file e riga.
- Ogni spostamento o ridimensionamento della finestra è annotato una volta, alla fine del gesto, con la posizione finale; anche le ricariche della finestra sono annotate.

## Non-goals

- Nessun invio fuori dalla rete di casa: il diario va solo al server di Andrea, mai a servizi esterni.
- Nessuna riparazione automatica **dentro il diario**: qui si osserva e si annota. Il rimedio al blocco del disegno esiste, ma è una feature a sé (vedi `003-immagine-ferma`) che nel diario si limita a lasciare le sue righe `rimedio`.
- Nessuna interfaccia per leggere i log dentro l'app: si aprono con un editor di testo qualsiasi.
- Niente registrazione di immagini o audio: solo contatori e stati.

## Assunzioni

- Il numero di fotogrammi disegnati si misura con `requestAnimationFrame`, che si ferma quando Windows non compone più la finestra: è proprio quel buco nel conteggio il segnale cercato. L'app disattiva già la limitazione dei fotogrammi in secondo piano (`backgroundThrottling: false`), quindi una finestra in secondo piano ma visibile continua a contare normalmente.
- I fotogrammi decodificati letti da `getVideoPlaybackQuality()` continuano a salire anche mentre la finestra non viene disegnata. Verificato sul posto il 2026-09-14: su uno stream della webcam i due conteggi coincidono quando tutto funziona.
- Una riga ogni dieci secondi è abbastanza fitta da inquadrare il minuto in cui è successo qualcosa, e abbastanza rada da non pesare.

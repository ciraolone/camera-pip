# L'immagine che si ferma

L'app deve accorgersi da sola quando l'immagine nella finestra smette di aggiornarsi, capire quale dei due guasti possibili è, e rimediare senza che l'utente debba fare niente. Il sintomo è sempre lo stesso — un fotogramma congelato — ma le cause sono due e vogliono cure opposte: o la webcam ha smesso di consegnare fotogrammi, o Windows ha smesso di disegnare la finestra.

## Chiarimenti

### Sessione 2026-09-14

- Q: Il blocco è la webcam o la finestra? → A: La finestra. Verificato dall'utente: spostandola l'immagine riparte subito. Se fosse la webcam, spostare la finestra non cambierebbe niente.
- Q: Perché è la finestra a bloccarsi? → A: È un difetto noto di Windows con Chromium: la finestra smette di essere ricomposta e resta con sopra l'ultimo fotogramma. L'app ne disattiva già la causa più comune (il calcolo di "finestra coperta"), ma restano le altre — perdita della superficie grafica dopo un risveglio del monitor, cambio di scheda video, schermo esterno che va e viene.
- Q: Si può togliere la causa alla radice? → A: No, non dall'esterno: il difetto sta in Windows e in Chromium. Quello che si può fare è che l'app se ne accorga in mezzo secondo e si dia da sola la stessa scossa che le dà l'utente spostandola, così il blocco non arriva mai a farsi vedere.
- Q: Perché mezzo secondo e non due? → A: Perché l'utente preferisce un microscopico scatto a un blocco, e un falso allarme costa quasi niente (una richiesta di ridisegno invisibile). Mezzo secondo è possibile solo grazie a come è fatta la rilevazione: non "sono passati N millisecondi senza fotogrammi" — che con una webcam lenta al buio sarebbe un falso allarme continuo — ma "la camera ne ha consegnati di nuovi e sullo schermo non ne è comparso nemmeno uno". Questa si tara da sola sulla velocità della webcam.
- Q: La scossa si vede? → A: Il primo gradino no: sono una richiesta pulita di ridisegno e la riaffermazione del primo piano, che non spostano niente. Il secondo aggiunge uno spostamento di un pixel con ritorno immediato alla posizione esatta di prima: a occhio non si distingue.
- Q: Oltre allo spostamento, si può forzare il ritorno in primo piano? → A: Sì, ed è la seconda metà della scossa invisibile: su Windows una finestra sempre-in-primo-piano può perdere quel posto — un'app a schermo intero glielo porta via — e riaffermarlo obbliga il gestore delle finestre a rifare i conti su di lei. Il focus però non si tocca mai: rubarlo mentre l'utente scrive altrove sarebbe peggio del guasto. E il primo piano si riafferma solo a chi lo ha chiesto: con "Always on Top" spento non si forza niente.
- Q: Serve anche una scossa periodica, indipendente dalla rilevazione? → A: Sì, come opzione spenta di serie. È la rete per i blocchi che la sentinella non può vedere: se a piantarsi è il codice della finestra, quello non chiede niente a nessuno. Si accende se un blocco dovesse sfuggire alla scossa automatica.
- Q: Perché la sorveglianza non stava già facendo il suo mestiere? → A: Perché viveva dentro il face tracking, quindi era attiva solo a tracking acceso, e conosceva una sola causa: per questo guasto prescriveva il riavvio della webcam, che non c'entra e non risolve. Ora è una sentinella sola, sempre accesa, che distingue i due casi.

### Sessione 2026-10-21

- Q: Che blocco è sfuggito alla scossa automatica? → A: Sul laptop, appena Andrea è passato a un'altra finestra, si è fermato per 16 secondi tutto il codice della finestra, non solo il disegno: la camera continuava a decodificare, ma la sentinella, che vive in quel codice, non poteva accorgersene. Spostando la finestra è ripartito subito.
- Q: Basta "Auto Refresh"? → A: Copre il caso, ma scuote la finestra a orologio anche quando non serve, e la durata massima del blocco è l'intervallo scelto. Andrea ha scelto un controllo automatico: il processo principale, che in quel blocco resta vivo, riceve dalla finestra un segno di vita quattro volte al secondo e, se per un secondo non arriva niente, dà la stessa scossa della sentinella. "Auto Refresh" resta nel menu come rete in più, ma non dovrebbe più servire.
- Q: Le scosse riempiono il diario? → A: Non più: gli spostamenti di un pixel fatti dall'app non si annotano come spostamenti della finestra, altrimenti con "Auto Refresh" a 5 secondi il diario si riempiva di una riga ogni 5 secondi.

## Scenari

### L'app riconosce quale dei due guasti è

La distinzione si fa confrontando i fotogrammi che la camera decodifica con quelli che il video mostra davvero: i primi continuano a salire anche mentre la finestra non viene disegnata. Test: TBD.

- Se la camera ha decodificato fotogrammi nuovi e sullo schermo non ne è comparso nemmeno uno, il guasto è il disegno della finestra.
- Se non arriva più niente da nessuna delle due parti, il guasto è lo stream e va riavviato.
- Una webcam lenta non viene mai scambiata per un guasto: nei giri in cui non mostra niente non sta decodificando niente nemmeno lei, e non si conclude nulla.
- La sorveglianza è attiva sempre, anche con il face tracking spento.
- A finestra nascosta o durante il riavvio dello stream non scatta nulla: lì è normale che i fotogrammi non arrivino.

### La finestra congelata si sblocca da sola

Quando è il disegno a essersi fermato, l'app fa da sé quello che l'utente farebbe spostando la finestra. Test: TBD.

- Dopo mezzo secondo di immagine ferma l'app chiede a Windows di ridisegnare la finestra e riafferma il primo piano: due mosse che non spostano niente.
- Se dopo un altro mezzo secondo è ancora ferma, aggiunge lo spostamento di un pixel e la rimette esattamente dov'era.
- Il primo piano si riafferma solo se l'utente ha "Always on Top" acceso, e in nessun caso viene rubato il focus alla finestra su cui sta lavorando.
- La finestra torna sempre alla posizione di partenza: nessuna deriva, nemmeno dopo molti blocchi consecutivi.
- Un blocco che non risponde a nessuna scossa non fa scuotere la finestra all'infinito: dopo una decina di tentativi fitti si continua a provare, ma con calma.
- I tentativi finiscono nel diario, così a freddo si sa quante volte è successo e quale gradino è servito.
- Passato mezzo minuto di quiete, un blocco nuovo riparte dal gradino leggero.

### La finestra col codice fermo si sblocca da sola

Il blocco che la sentinella non vede, perché si ferma insieme al codice della finestra. Test: TBD.

- La finestra manda al processo principale un segno di vita quattro volte al secondo, sempre, anche a face tracking spento.
- Se per più di un secondo non ne arriva nessuno, il processo principale dà la stessa scossa in scala della sentinella, con lo stesso freno ai tentativi.
- Nel diario resta una riga che dice per quanto il codice è rimasto senza segni di vita.
- Non scatta niente a finestra nascosta o ridotta a icona, mentre la pagina si sta caricando, se la finestra è andata in crash, né prima del primo segno di vita.
- Al risveglio del computer non scatta un falso allarme: se anche il processo principale è rimasto fermo, l'attesa riparte da zero.

### La scossa si può anche dare a orologio

Rete di sicurezza opzionale per i blocchi che nessuna rilevazione può cogliere. Test: TBD.

- Nel menu Window una voce "Auto Refresh" sceglie ogni quanto ripetere la scossa completa: Off, 5, 15, 30 o 60 secondi.
- Di serie è Off: la scossa automatica basta, e questa serve solo se qualcosa le sfugge.
- La scelta sopravvive alla chiusura e riapertura dell'app.
- Il singolo ritocco non viene annotato nel diario: a quella cadenza seppellirebbe ogni altra riga. Si annota solo quando l'opzione viene accesa o spenta.
- Nemmeno lo spostamento di un pixel finisce nel diario come "spostata o ridimensionata": vale per tutte le scosse, automatiche o a orologio.

### La webcam incastrata viene riavviata, come prima

Il comportamento che c'era già resta, ma ora vale sempre. Test: TBD.

- Se la camera smette di consegnare fotogrammi per qualche secondo, l'app riavvia da sola lo stream.
- Fra due riavvii passano almeno quindici secondi, per non martellare un dispositivo malmesso.
- Il primo riavvio non aspetta nessun intervallo, nemmeno se il guasto arriva nei primi secondi di vita dell'app.
- Il riavvio avviene anche a face tracking spento, cosa che prima non succedeva.

## Non-goals

- Nessun tentativo di correggere il difetto di Windows o di Chromium: si rimedia all'effetto, non alla causa, perché la causa non è in questa app.
- Nessun furto di focus: la finestra non viene mai portata davanti a quella su cui l'utente sta lavorando.
- Nessun ricaricamento della finestra come rimedio: rimetterebbe in piedi la webcam da zero, con un nero visibile, per un problema che si risolve con una scossa.

## Assunzioni

- I fotogrammi mostrati si contano con `requestVideoFrameCallback`, che tace quando la finestra non viene composta; quelli decodificati si leggono da `getVideoPlaybackQuality()`, che continua a salire. È la differenza fra i due a separare i casi — verificato sul posto il 2026-09-14: a regime i due conteggi coincidono.
- Due giri di controllo consecutivi con fotogrammi decodificati e nessuno mostrato sono un guasto e non uno sfasamento: un giro solo può capitare quando un fotogramma cade a cavallo fra due controlli, due di fila no. Verificato in simulazione il 2026-09-14 su webcam da 30, 3 e 1 fotogrammi al secondo: nessun falso allarme.
- Lo spostamento di un pixel con ritorno immediato non disturba AltSnap: quando l'utente sta trascinando la finestra, la finestra viene ridisegnata e nessun blocco può essere in corso.

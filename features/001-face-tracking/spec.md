# Face tracking

Inseguimento automatico e molto delicato del volto: l'app rileva dove sta la faccia nel video della webcam e sposta da sola l'inquadratura digitale (lo stesso meccanismo di zoom e offset già comandabile a mano) per tenerla nella parte centrale in alto. Tutto avviene in locale, sul flusso video già acquisito: la webcam non viene toccata.

## Chiarimenti

### Sessione 2026-07-07

- Q: Il tracking deve valere solo nella finestra PiP o anche per chi vede l'utente in call? → A: Solo nella finestra PiP, consapevolmente: con tracking attivo la finestrella non mostra più l'inquadratura esatta della call; quando serve il controllo fedele, si spegne il tracking.
- Q: Il tracking può regolare anche lo zoom? → A: Comportamento definibile nelle impostazioni: zoom spento, oppure zoom abilitato con un massimo configurabile. Lo zoom resta a zero (1.0x) di default e viene alzato solo quando serve per portare il volto nella posizione bersaglio, mai oltre il massimo.
- Q: Cosa fanno i comandi manuali (Ctrl+frecce, Ctrl+/−) con il tracking attivo? → A: Lo spengono: qualsiasi comando manuale di offset o zoom disattiva il tracking e la spunta nel menu si toglie da sola.
- Q: Cosa fa l'inquadratura quando non c'è nessun volto? → A: Dopo qualche secondo senza volto, torna lentamente alla vista neutra (nessuno spostamento, zoom a 1.0x); quando un volto ricompare, l'inseguimento riprende.
- Q: Con più volti nel campo visivo, quale si insegue? → A: Il più grande nell'immagine (cioè il più vicino alla webcam), con un po' di stabilità per non saltare tra volti di dimensioni simili.
- Q: Quale valore di partenza per il tetto di zoom del tracking? → A: 1.5x, così il tracking funziona fin dal primo uso con un ingrandimento leggero (con Off e zoom a 1.0x sembrerebbe rotto).
- Q: (prima sessione di taratura) Come si regola la delicatezza del movimento? → A: Tre setting a menu: velocità su 5 livelli (default 3; il livello 4 replica la prima consegna), ritardo di partenza da 0 a 2 secondi a passi di 0.5 (default 0), tolleranza su 5 livelli (default 3). Lo zoom inoltre va tenuto in ogni momento al minimo indispensabile entro il tetto configurato.
- Q: (seconda sessione di taratura) Quali rifiniture per la qualità del movimento? → A: Partenza graduale oltre che arrivo graduale (accelera e decelera dolcemente), velocità adattiva (correzioni piccole lente, spostamenti ampi più decisi, fino al doppio), filtro anti-tremolio sul rilevamento. Parcheggiate nel backlog: scorciatoia da tastiera, toggle nella tray, indicatore di stato.

### Sessione 2026-08-10

- Q: Il tracking sembra alzare lo zoom anche quando non servirebbe. Da dove viene? → A: Dal bersaglio verticale, che era un punto solo ("occhi a un terzo dall'alto"). Spostare l'inquadratura in verticale è possibile solo grazie al margine creato dallo zoom, quindi ogni scostamento dal punto costava ingrandimento: con gli occhi a metà immagine servivano già 1.33x, sotto la metà anche più del tetto di 1.5x.
- Q: Come si risolve? → A: Il bersaglio diventa una zona invece che un punto, e vale su entrambi gli assi: finché gli occhi stanno nella zona il tracking non muove niente e non spende ingrandimento. Una sola manopola a menu ("Tracking Framing") con tre livelli, perché una zona verticale da sola non basta: col bersaglio orizzontale fisso al centro esatto bastavano 8 punti percentuali di scarto laterale per chiedere 1.25x.
- Q: Quanto larga la zona, e quale livello di serie? → A: Sei livelli su una scala unica, come già per velocità e tolleranza. Il livello 1 è il bersaglio puntuale della prima consegna (centro esatto, occhi a un terzo); salendo la zona si allarga su entrambi gli assi fino al livello 6. Di serie il 3, che accetta il volto nel 30% centrale in larghezza e nella metà alta in altezza. In larghezza la scala cresce più piano che in altezza, perché in orizzontale il bersaglio è il centro esatto e ogni punto percentuale di scarto laterale si paga più caro in ingrandimento.
- Q: Il tetto di zoom ha abbastanza gradini? → A: Aggiunti 1.25x e 1.75x fra i valori proposti, per poter tenere l'ingrandimento più basso senza spegnerlo del tutto.
- Q: Quando il tracking interviene, dove deve portare il volto? → A: Verso il punto bersaglio (centro in orizzontale, un terzo dall'alto in verticale), non solo appena dentro il bordo della zona: un intervento deve rimettere il volto in posizione buona, altrimenti ne riesce subito. L'ingrandimento però resta quello minimo che serve a farlo rientrare nella zona: comprarne di più per centrarlo perfettamente costerebbe molto e il rientro dello zoom lo disferebbe subito dopo.
- Q: Come si capisce a occhio cosa sta facendo il tracking? → A: Con il pannello info della webcam attivo compaiono anche il riquadro della zona e il mirino del punto bersaglio, disegnati dagli stessi valori che usa la policy.
- Q: Partenza e frenata si possono accentuare? → A: Sì, nuovo setting "Easing" su tre livelli (di serie il 2): il livello 1 è il movimento della prima consegna, salendo la partenza diventa più graduale. Il tetto è fissato dove il movimento comincerebbe a oltrepassare il bersaglio, cosa che lo spec vieta.
- Q: Il menu comincia a essere lungo. → A: Tutte le voci del tracking, interruttore compreso, stanno sotto un'unica voce "Face Tracking"; dentro il sottomenu il prefisso "Tracking" sparisce dalle etichette.

## Scenari

### Attivazione e disattivazione

Il face tracking si accende e si spegne da una voce del menu del tasto destro, come le altre opzioni dell'app. Test: TBD.

- Nel menu contestuale compare una voce "Face tracking" con spunta on/off.
- Lo stato scelto sopravvive alla chiusura e riapertura dell'app.
- Spegnendo il tracking l'inquadratura resta dov'è: nessuno scatto di ritorno.
- Qualsiasi comando manuale di offset o zoom (Ctrl+frecce, Ctrl+/−, reset) spegne il tracking: da quel momento comanda l'utente, e la spunta nel menu si toglie da sola.

### Il volto viene tenuto in alto al centro

Con il tracking attivo, quando la persona si sposta davanti alla webcam l'inquadratura la segue dolcemente, riportando il volto nella zona bersaglio: centrato in orizzontale, nella parte alta del riquadro. Test: TBD.

- Il volto, a regime, appare centrato in orizzontale e nella parte alta dell'inquadratura.
- Finché gli occhi stanno nella zona ammessa l'inquadratura non si muove affatto e l'ingrandimento resta a 1.0x.
- Quando il volto esce dalla zona, l'inseguimento non si limita a rimetterlo appena dentro il bordo: lo porta verso il punto bersaglio, per quanto l'ingrandimento disponibile lo consente.
- Con il pannello info della webcam attivo si vedono il riquadro della zona ammessa e il mirino del punto bersaglio, per capire a colpo d'occhio cosa sta facendo il tracking.
- Dal menu si sceglie quanto la zona è esigente (Tracking Framing, sei livelli): al livello 1 il volto va tenuto centrato in orizzontale e con gli occhi a un terzo esatto dall'alto, salendo la zona si allarga progressivamente fino al livello 6. Di serie è il livello 3.
- Il movimento dell'inquadratura è lento e morbido, mai a scatti.
- Il movimento parte in modo graduale e arriva in modo graduale: accelera dolcemente, poi decelera avvicinandosi al bersaglio, senza mai oltrepassarlo.
- Gli spostamenti ampi vengono recuperati con un passo più deciso (fino al doppio) rispetto alle piccole correzioni, a parità di morbidezza.
- L'inquadratura non tremola mai, nemmeno alla tolleranza più bassa: il micro-rumore del rilevamento viene assorbito prima di muovere qualsiasi cosa.
- Piccoli spostamenti del volto (parlare, gesticolare da fermi) non muovono l'inquadratura: reagisce solo a spostamenti veri e propri.
- Il tracking funziona in modo coerente anche con il flip attivo (immagine specchiata): il volto viene inseguito nella direzione giusta.
- La velocità dell'inseguimento si regola dal menu su cinque livelli (Speed): 1 il più lento, 5 il più rapido.
- Quanto partenza e frenata sono accentuate si regola su tre livelli (Easing): al livello 1 il movimento parte con la spinta piena, salendo prende velocità più gradualmente. In nessun livello il movimento oltrepassa il bersaglio.
- Dal menu si può impostare un ritardo di partenza (Tracking Delay, da 0 a 2 secondi a passi di 0.5): il movimento comincia solo se il volto resta fuori tolleranza per almeno quel tempo; se rientra prima, l'inquadratura non si muove affatto.
- La tolleranza si regola dal menu su cinque livelli (Tracking Tolerance): decide di quanto il volto può allontanarsi dal bersaglio prima che l'inseguimento parta.

### Il tracking usa lo zoom solo quando serve

Lo zoom è una risorsa che il tracking spende con parsimonia. A riposo l'immagine sta a ingrandimento zero (1.0x); quando spostare l'inquadratura non basta a portare il volto nella zona bersaglio, il tracking alza lo zoom del minimo necessario, entro un tetto configurabile. Test: TBD.

- Dal menu del tasto destro, nel submenu "Tracking Zoom", si sceglie la modalità zoom del tracking: spento, oppure abilitato con un massimo scelto fra i valori proposti.
- Di serie il massimo è 1.5x: il tracking ha margine di manovra fin dal primo utilizzo, con un ingrandimento leggero.
- Con zoom spento, il tracking sposta solo l'inquadratura entro il margine disponibile al livello di zoom corrente (a 1.0x non ha spazio di manovra e resta fermo).
- Con zoom abilitato, il tracking usa il minimo ingrandimento necessario a portare il volto nella zona bersaglio, senza mai superare il massimo configurato.
- L'ingrandimento è tenuto in ogni momento al minimo indispensabile: appena ne basta meno per tenere il volto in posizione, rientra dolcemente da solo — senza bisogno di un nuovo spostamento — e durante il rientro il volto resta fermo nel riquadro.

### Senza volto, ritorno lento alla vista neutra

Quando nessun volto è rilevato per qualche secondo, l'inquadratura torna da sola alla vista neutra: nessuno spostamento e zoom a 1.0x. Test: TBD.

- Se il volto sparisce (persona uscita, girata di spalle), per i primi secondi l'inquadratura resta ferma dov'è.
- Superata la soglia di assenza, l'inquadratura rientra dolcemente verso la vista neutra, con la stessa morbidezza di ogni altro movimento del tracking.
- Quando un volto ricompare — anche a metà del rientro — l'inseguimento riprende normalmente.

### L'inquadratura non esce mai dai bordi dell'immagine

Lo spostamento automatico è vincolato ai bordi del video: l'inquadratura può arrivare al massimo al bordo dell'immagine, mai oltre. Test: TBD.

- In nessun momento compaiono bande nere o zone vuote ai lati del riquadro.
- Se il volto si avvicina al limite del campo visivo della webcam, l'inquadratura si ferma al bordo dell'immagine anche se il volto non è più nella zona bersaglio.
- Quando il volto rientra verso il centro del campo visivo, l'inseguimento riprende normalmente.

## Edge case

- Più volti nel campo visivo: si insegue il più grande (il più vicino alla webcam), con un margine di stabilità per non saltare tra volti di dimensioni simili.
- Cambio webcam con tracking attivo: il tracking continua a funzionare sul nuovo dispositivo senza dover essere riattivato.
- Volto parzialmente fuori dal campo visivo della webcam: il tracking fa quel che può entro il vincolo dei bordi, senza comportamenti erratici.
- Sessioni lunghe: se il motore di rilevamento va in errore, il tracking si auto-ripristina (o al peggio si spegne da solo); il video dell'app non deve mai congelarsi per colpa del tracking.
- Il tracking non degrada la fluidità: né il video né il movimento di inseguimento devono diventare scattosi con il tracking acceso, anche su macchine modeste.
- Camera che smette di consegnare fotogrammi con tracking attivo (driver incastrato, camera contesa da un altro programma): l'app riavvia da sola lo stream entro pochi secondi invece di restare congelata, senza martellare il dispositivo (al più un tentativo ogni ~15 secondi).

## Non-goals

- Il tracking non cambia ciò che vedono gli altri in call: agisce solo sull'immagine dentro la finestra PiP. Con tracking attivo la finestrella non è più un controllo fedele dell'inquadratura reale — scelta consapevole, si spegne quando serve verificarla.
- Nessun controllo fisico della webcam (motori PTZ, zoom ottico): si lavora solo sull'immagine già ricevuta.
- Nessun riconoscimento dell'identità: l'app rileva *che* c'è un volto e dove, non *di chi* è.
- Nessun inseguimento di più volti contemporaneamente o inquadratura "di gruppo".
- Nessun invio di immagini o dati fuori dal computer: il rilevamento gira interamente in locale.

## Assunzioni

- Il tracking pilota solo i meccanismi di inquadratura digitale già esistenti (zoom e offset), senza introdurre un secondo modo di trasformare il video — coerente con la regola "un solo modo di fare ogni cosa".
- La zona bersaglio "centrale in alto" si intende come: volto centrato in orizzontale, con gli occhi all'incirca a un terzo dall'alto del riquadro — taratura fine da fare dal vivo con l'utente.
- Il rilevamento gira a frequenza ridotta (pochi controlli al secondo, non a ogni fotogramma) per tenere basso il consumo di CPU — la delicatezza richiesta non ha bisogno di reattività istantanea.
- La soglia di "volto assente" prima del rientro alla vista neutra è di qualche secondo (~3s) — taratura fine da fare dal vivo con l'utente.

## Domande aperte

Nessuna al momento.

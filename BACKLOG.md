<!-- Parcheggio ufficiale delle idee e attività rimandate consapevolmente: voci raggruppate per ambito, ognuna con titolo in maiuscolo e un breve paragrafo per riprenderla a distanza di tempo. Le voci chiuse si rimuovono, non si barrano. -->

# Backlog

## Diagnostica

- **SPEGNIMENTO-FANTASMA** — La rete di sicurezza sui crash del renderer spegne `faceTracking` nei settings ogni volta che il processo della finestra muore per cause anomale, e una chiusura forzata dall'esterno (Task Manager, kill) rientra in quel caso: l'app si riapre con il tracking spento senza che sia successo niente di grave. Visto tre volte durante le prove del 2026-09-14. Ora che il diario registra la memoria battito per battito, si può distinguere il crash da esaurimento — l'unico che giustifica lo spegnimento — da una terminazione esterna, e spegnere solo nel primo caso.
- **SOGLIE-DIARIO** — Le soglie del riconoscimento anomalie (pausa del timer oltre 3 s, silenzio del battito oltre 25 s) sono scelte a tavolino. Dopo qualche diario vero vanno riviste: se compaiono anomalie nei momenti in cui l'app funzionava bene, sono troppo strette.

## Face tracking

- **SCORCIATOIA** — Scorciatoia da tastiera (es. Ctrl+T) per accendere/spegnere il face tracking senza passare dal menu. Utile perché qualsiasi comando manuale lo spegne e riattivarlo dal menu è macchinoso, specie in call.
- **TRAY** — Toggle del face tracking anche nel menu della tray icon, accanto a Show/Hide, per comandarlo senza portare la finestra in primo piano.
- **INDICATORE** — Segnale visivo discreto dello stato del tracking (puntino in un angolo o breve lampeggio del bordo al toggle). Da pesare contro la pulizia della finestra: decidere con l'utente forma e posizione.
- **BUIO-SOGLIE** — La pausa automatica al buio ha soglie fisse nel codice (`darkSuspendLuma` 35, `lightResumeLuma` 55 su una scala 0-255). Se in qualche stanza il tracking si mette in pausa mentre funzionerebbe ancora, o non si mette in pausa quando servirebbe, la leva è ritarare quei due numeri leggendo la riga "Luce" del pannello info. Se dovesse capitare spesso, allora vale un interruttore a menu (o una soglia scelta dall'utente) invece di un valore fisso.
- **ZOOM-TOLLERANZA** — Emerso analizzando lo zoom di troppo (2026-08-10), svuotato ma non chiuso dal bersaglio a zona. Lo zoom necessario è calcolato per rientrare nella zona morta di arresto (`deadZoneStopFraction`, 2% fisso), non nella tolleranza scelta dall'utente: alzare Tracking Tolerance rende l'inseguimento più raro ma non riduce di un filo l'ingrandimento. Con la zona bersaglio larga il 2% pesa su una distanza molto più corta, quindi si nota poco; se ricomparisse, legare il calcolo alla tolleranza è la leva.
- **ZOOM-TRANSITORI** — Emerso nella stessa analisi. Il target di zoom sale immediatamente al valore appena calcolato ma scende solo con un margine di 0.15 (`zoomReleaseMargin`): un abbassamento di testa di mezzo secondo alza lo zoom e quando ci si rialza non torna giù, perché la discesa non supera il margine. Da valutare un margine più stretto o una media dei valori richiesti nell'ultimo secondo.

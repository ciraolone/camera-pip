<!-- Parcheggio ufficiale delle idee e attività rimandate consapevolmente: voci raggruppate per ambito, ognuna con titolo in maiuscolo e un breve paragrafo per riprenderla a distanza di tempo. Le voci chiuse si rimuovono, non si barrano. -->

# Backlog

## Face tracking

- **SCORCIATOIA** — Scorciatoia da tastiera (es. Ctrl+T) per accendere/spegnere il face tracking senza passare dal menu. Utile perché qualsiasi comando manuale lo spegne e riattivarlo dal menu è macchinoso, specie in call.
- **TRAY** — Toggle del face tracking anche nel menu della tray icon, accanto a Show/Hide, per comandarlo senza portare la finestra in primo piano.
- **INDICATORE** — Segnale visivo discreto dello stato del tracking (puntino in un angolo o breve lampeggio del bordo al toggle). Da pesare contro la pulizia della finestra: decidere con l'utente forma e posizione.
- **ZOOM-TOLLERANZA** — Emerso analizzando lo zoom di troppo (2026-08-10), svuotato ma non chiuso dal bersaglio a zona. Lo zoom necessario è calcolato per rientrare nella zona morta di arresto (`deadZoneStopFraction`, 2% fisso), non nella tolleranza scelta dall'utente: alzare Tracking Tolerance rende l'inseguimento più raro ma non riduce di un filo l'ingrandimento. Con la zona bersaglio larga il 2% pesa su una distanza molto più corta, quindi si nota poco; se ricomparisse, legare il calcolo alla tolleranza è la leva.
- **ZOOM-TRANSITORI** — Emerso nella stessa analisi. Il target di zoom sale immediatamente al valore appena calcolato ma scende solo con un margine di 0.15 (`zoomReleaseMargin`): un abbassamento di testa di mezzo secondo alza lo zoom e quando ci si rialza non torna giù, perché la discesa non supera il margine. Da valutare un margine più stretto o una media dei valori richiesti nell'ultimo secondo.

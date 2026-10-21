# Tasks: Aggiornamento dal menu

- [x] T1 — Versione in fondo al menu.
- [x] T2 — `publish.js` e `npm run publish`: build, copia in `~/releases/camera-pip/`, `latest.json`. Verifica: `latest.json` della 1.16.0 raggiungibile dalla tailnet; zip scaricato e avviato sul PC fisso, diario arrivato al server — 2026-10-21.
- [x] T3 — `app-updater.js`: controllo, scaricamento con verifica, script di scambio, rilancio. Con la 1.16.0 sul laptop lo scambio non partiva: PowerShell lanciato direttamente da Electron muore con l'app. Corretto nella 1.16.2 lanciandolo via `cmd /c start`. Verifica: aggiornamento vero 1.16.1 → 1.16.2 sul PC fisso, con scaricamento, impronta, scambio e riapertura sulla 1.16.2 — 2026-10-21. Confermato sul laptop: 1.16.2 → 1.16.3 dal menu — 2026-10-21.
- [ ] T4 — Avvisi per già aggiornato, server irraggiungibile, Electron diverso, scaricamento rovinato. Visto finora solo l'avviso di aggiornamento non installato (laptop, 1.16.0); gli altri tre si vedranno alla prima occasione.

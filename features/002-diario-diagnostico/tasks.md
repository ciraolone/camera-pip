# Tasks: Diario di diagnostica

- [x] T1 — `log-journal.js`: file per avvio in `logs/`, rotazione a cinque avvii, tetto di 20 MB, scrittura sincrona che non può far cadere l'app. Verifica: dopo un avvio esiste un file nuovo con l'intestazione di versione.
- [x] T2 — `log-diagnostics.js`: istantanea d'avvio (versioni, grafica, schermi), abbonamento a schermi, alimentazione, processi figli. Verifica: il file d'avvio elenca gli schermi collegati.
- [x] T3 — `log-diagnostics.js`: sorveglianza della finestra (visibilità, passaggio fra schermi, blocchi) e travaso della console del renderer. Verifica: i messaggi del face tracking compaiono nel diario.
- [x] T4 — `log-heartbeat.js` + canale `debug-beat`: tre contatori e riepilogo ogni dieci secondi. Verifica: una riga `battito` ogni dieci secondi con contatori coerenti (fotogrammi disegnati ≈ 60/s, camera ≈ fps della webcam).
- [x] T5 — Riconoscimento delle combinazioni anomale, con inizio e rientro invece di righe ripetute. Verifica: simulati fuori dall'app i quattro casi (finestra non disegnata, camera morta, codice fermo, finestra nascosta) — 2026-09-14.
- [x] T6 — Voce di menu "Open Logs Folder". Verifica: apre la cartella in Esplora risorse.

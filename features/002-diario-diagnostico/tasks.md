# Tasks: Diario di diagnostica

- [x] T1 — `log-journal.js`: file per avvio in `logs/`, rotazione a cinque avvii, tetto di 20 MB, scrittura sincrona che non può far cadere l'app. Verifica: dopo un avvio esiste un file nuovo con l'intestazione di versione.
- [x] T2 — `log-diagnostics.js`: istantanea d'avvio (versioni, grafica, schermi), abbonamento a schermi, alimentazione, processi figli. Verifica: il file d'avvio elenca gli schermi collegati.
- [x] T3 — `log-diagnostics.js`: sorveglianza della finestra (visibilità, passaggio fra schermi, blocchi) e travaso della console del renderer. Verifica: i messaggi del face tracking compaiono nel diario.
- [x] T4 — `log-heartbeat.js` + canale `debug-beat`: tre contatori e riepilogo ogni dieci secondi. Verifica: una riga `battito` ogni dieci secondi con contatori coerenti (fotogrammi disegnati ≈ 60/s, camera ≈ fps della webcam).
- [x] T5 — Riconoscimento delle combinazioni anomale, con inizio e rientro invece di righe ripetute. Verifica: simulati fuori dall'app i quattro casi (finestra non disegnata, camera morta, codice fermo, finestra nascosta) — 2026-09-14.
- [x] T6 — Voce di menu "Open Logs Folder". Verifica: apre la cartella in Esplora risorse.
- [x] T7 — Ricevitore `POST /diari/ricevi` in homelab-api. Verifica: provati invio normale, doppione, pezzo sovrapposto, buco e richiesta da internet — 2026-10-21.
- [x] T8 — `log-shipper.js`: spedizione ogni 30 s con ripresa dal punto confermato dal server. Verifica: simulata l'app contro il server vero, con un diario vecchio già presente e con la rete assente al primo giro — 2026-10-21.
- [x] T9 — Racconto del face tracking: motivi di accensione e spegnimento, contatori del rilevatore nel battito, inseguimenti, disaccordo menu/finestra, errori del worker, fine degli spostamenti della finestra. Verifica: riga del battito controllata su un tracker finto; sul laptop resta da vedere al primo avvio della 1.15.0.

# Plan: Aggiornamento dal menu

## Sintesi

Si aggiorna solo il pacchetto del codice dell'app (`resources/app.asar`, ~14 MB), non il motore Electron (~100 MB), che cambia di rado. Il server pubblica in `~/releases/camera-pip/` (servita su `https://home-server.tail6fec67.ts.net/ota/camera-pip/`) il pacchetto e un `latest.json` con versione, versione di Electron, impronta SHA-256 e nome dello zip completo. L'app scarica il pacchetto accanto a quello in uso, ne verifica l'impronta, e affida la sostituzione a un piccolo script PowerShell che aspetta la chiusura dell'app, scambia i file e la riapre.

## File coinvolti

- `app-updater.js` (nuovo, main) — lettura di `latest.json`, confronto delle versioni, scaricamento e verifica, preparazione e lancio dello script di scambio, avvisi a Andrea.
- `main.js` — voci di menu "Check for Updates" e versione.
- `publish.js` (nuovo, si lancia sul server con `npm run publish`) — build Windows, copia di zip e pacchetto in `~/releases/camera-pip/`, scrittura di `latest.json`.

## Decisioni di design

- **Solo il pacchetto del codice, e solo con lo stesso Electron.** Un pacchetto costruito per un'altra versione di Electron potrebbe non partire: `latest.json` porta la versione di Electron, e se non coincide con quella installata l'app non scarica niente e rimanda allo zip completo.
- **Lo scambio lo fa uno script dopo la chiusura.** Su Windows il pacchetto in uso è bloccato dal processo che lo legge: va sostituito ad app chiusa. Lo script aspetta l'uscita del processo (con un tetto di 30 s), sposta il nuovo pacchetto al posto del vecchio e rilancia l'eseguibile. Il file scaricato ha estensione `.next`, non `.asar`, perché Electron tratta ogni `.asar` come un archivio da aprire e non come un file da scrivere.
- **Impronta prima di tutto.** Nessun file viene toccato se lo SHA-256 del pacchetto scaricato non coincide con quello di `latest.json`.
- **Errori dichiarati.** Ogni fallimento diventa un avviso a schermo e una riga `aggiornamento` nel diario; un laptop fuori casa è una condizione normale, quindi niente segnalazione al server degli errori.
- **Build dal server senza rcedit.** rcedit richiede wine, che sul server non c'è: l'icona dell'eseguibile resta quella di Electron, l'icona di finestra e barra no. È un dettaglio estetico dell'installazione completa, l'aggiornamento non tocca l'eseguibile.

## Invarianti

- `latest.json` si scrive per ultimo, dopo che il pacchetto è al suo posto: un'app che legge una versione nuova trova sempre il file corrispondente.
- Il pacchetto pubblicato ha il nome della versione (`app-<versione>.asar`): non si sovrascrive mai un file che un altro scaricamento potrebbe star leggendo.

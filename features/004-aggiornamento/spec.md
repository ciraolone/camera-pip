# Aggiornamento dal menu

L'app si aggiorna da sola con una voce del menu del tasto destro, invece di dover scaricare uno zip e sostituire la cartella a mano a ogni versione. Serve perché l'app gira sul laptop e le correzioni arrivano spesso: ogni giro manuale è un'occasione per restare su una versione vecchia senza accorgersene.

## Chiarimenti

### Sessione 2026-10-21

- Q: Da dove arrivano gli aggiornamenti? → A: Dal server di casa, nella cartella pubblicata solo sulla rete privata (`/ota/camera-pip/`). Ogni versione nuova la prepara e la pubblica Claude dal server; Andrea non tocca zip né cartelle.
- Q: L'aggiornamento parte da solo? → A: No, lo chiede Andrea dal menu. Un riavvio inatteso in mezzo a una call sarebbe peggio di una versione vecchia.
- Q: E la prima volta? → A: Serve un'ultima installazione a mano, quella della versione che contiene l'aggiornatore. Da lì in poi basta il menu.
- Q: Si vede che versione è installata? → A: Sì, in fondo al menu c'è il numero di versione (richiesta di Andrea del 2026-10-21).

## Scenari

### La versione installata si legge dal menu

Test: TBD.

- In fondo al menu del tasto destro una riga non cliccabile mostra il numero di versione dell'app.

### Aggiornare dal menu

Dalla voce "Check for Updates" l'app scopre se sul server c'è una versione più nuova e, se Andrea conferma, la installa e si riapre da sola. Test: TBD.

- Se la versione installata è già l'ultima, un avviso lo dice, con il numero di versione.
- Se c'è una versione più nuova, l'avviso ne mostra il numero e chiede se aggiornare adesso, avvertendo che l'app si riaprirà.
- Confermato, l'app scarica la versione nuova, controlla che sia arrivata integra, si chiude, la mette al posto della vecchia e si riapre da sola già aggiornata, con le impostazioni di prima.
- Se Andrea non conferma, non succede niente.
- Se il server non si raggiunge (laptop fuori dalla rete di casa), l'avviso lo dice in chiaro invece di restare in silenzio.
- Se la versione nuova richiede un pacchetto completo (motore dell'app cambiato), l'avviso lo dice e indica dove scaricarlo, invece di installare qualcosa che non partirebbe.
- Se lo scaricamento è incompleto o rovinato, l'app non tocca niente e lo dice.
- Ogni tentativo, riuscito o fallito, lascia la sua riga nel diario.

## Non-goals

- Nessun controllo automatico in sottofondo né avviso spontaneo di versione nuova.
- Nessun aggiornamento fuori dalla rete di casa.
- Nessun ritorno automatico alla versione precedente: se una versione nuova ha un problema, se ne pubblica una corretta.

## Assunzioni

- L'app è installata in una cartella dove l'utente può scrivere (scompattata dallo zip, non in Programmi).

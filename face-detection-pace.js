/**
 * Cadenza del rilevamento volto: decide, a ogni giro del ciclo di rilevamento di face-tracker.js, se è il momento di chiedere un rilevamento. Finché un volto si vede si cerca a ogni giro; se non se ne vede nessuno da faceIdleAfterMs (stanza buia, utente alzato) si continua a cercare ma a faceIdleDetectionIntervalMs, così il costo scende di circa sette volte e un volto che ricompare viene ritrovato entro un giro. Annota nel diario, tramite la console, il passaggio fra le due cadenze, e lo espone a pannello info e battito. Ha sostituito la pausa al buio basata sulla luminosità media del fotogramma, che con uno sfondo nero e il volto ben visibile misurava 22 su 255, scambiava la scena per buio e fermava il tracking mentre funzionava (diario del 2026-10-21: 38 rilevamenti su 38 con il volto): la domanda giusta non è "c'è luce?" ma "si vede un volto?". Usato solo da face-tracker.js; le due soglie stanno in face-tracker-tuning.js.
 */

class DetectionPace {
  constructor() {
    this.reset();
  }

  reset() {
    this.isSlowed = false;
    this.lastRequestAt = -Infinity;
  }

  // Ritorna true se il rilevamento va chiesto adesso, e in quel caso conta il giro come richiesta fatta
  isDue(now, lastFaceSeenAt) {
    this.noteSlowdown(now - lastFaceSeenAt >= TRACKING_TUNING.faceIdleAfterMs);
    if (
      this.isSlowed &&
      now - this.lastRequestAt < TRACKING_TUNING.faceIdleDetectionIntervalMs
    ) {
      return false;
    }
    this.lastRequestAt = now;
    return true;
  }

  noteSlowdown(isSlowed) {
    if (isSlowed === this.isSlowed) {
      return;
    }
    this.isSlowed = isSlowed;
    console.log(
      isSlowed
        ? "Face tracking: nessun volto da un po', rilevamento rallentato"
        : 'Face tracking: volto ritrovato, rilevamento a piena cadenza',
    );
  }
}

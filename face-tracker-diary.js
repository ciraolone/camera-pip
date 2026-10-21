/**
 * Fotografia del face tracking per il battito del diario (log-heartbeat.js), presa ogni dieci secondi. Ritorna se il tracking è acceso nella finestra — il main lo confronta con la spunta del menu — e una riga che racconta cosa stava facendo: cadenza del rilevamento (piena o rallentata perché non si vede nessun volto), stato del worker di rilevamento e da quanto non risponde, quante richieste, risposte, volti trovati, errori e frame saltati negli ultimi dieci secondi, se un volto è agganciato, se l'inseguimento è in corso e la vista applicata. È la riga che permette di capire a freddo perché il tracking "non fa niente": spento, senza volto da un po', rilevatore fermo, rilevatore che non risponde o volto non trovato sono guasti diversi che a occhio sembrano uguali. Legge soltanto: non cambia niente nel tracker.
 */

function describeTrackingForDiary(faceTracker, view) {
  if (!faceTracker) {
    return { isTrackingEnabled: false, tracking: 'non ancora creato' };
  }
  // I contatori si leggono anche a tracking spento, così si azzerano e il battito dopo la riaccensione non si porta dietro numeri vecchi
  const detection = faceTracker.detection.takeDiaryCounters();
  if (!faceTracker.isEnabled) {
    return { isTrackingEnabled: false, tracking: 'spento' };
  }
  const parts = [
    `acceso cadenza=${faceTracker.getIsDetectionSlowed() ? 'rallentata-nessun-volto' : 'piena'}`,
    `cicli=${faceTracker.detectionTimer ? 'attivi' : 'FERMI'}`,
    `rilevatore=${detection.state} ultima-risposta=${detection.sinceLastResult}`,
    `rilevamenti(chiesti=${detection.requested} risposte=${detection.results} con-volto=${detection.withFace} errori=${detection.errors} saltati=${detection.skippedBusy})`,
    `volto=${faceTracker.face ? 'agganciato' : 'nessuno'} inseguimento=${faceTracker.policy.isChasing ? 'sì' : 'no'}`,
    `vista(zoom=${view.zoom.toFixed(2)} x=${Math.round(view.offsetX)} y=${Math.round(view.offsetY)})`,
  ];
  if (detection.lastError) {
    parts.push(`ultimo-errore=${detection.lastError}`);
  }
  return { isTrackingEnabled: true, tracking: parts.join(' ') };
}

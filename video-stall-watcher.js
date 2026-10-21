/**
 * Sentinella dell'immagine ferma. Quattro volte al secondo confronta due
 * conteggi: i fotogrammi che la camera ha decodificato e quelli che il video
 * ha davvero mostrato. Se la camera ne ha consegnati di nuovi e sullo schermo
 * non ne è comparso nemmeno uno, nessuno sta più disegnando la finestra
 * (onPresentationStall, si chiede al main di scuoterla); se invece non arriva
 * più niente da nessuna delle due parti, è la camera a essersi incastrata e
 * va riavviato lo stream (onCameraStall). Il confronto fra i due conteggi si
 * tara da solo sulla velocità della webcam: una camera che consegna tre
 * fotogrammi al secondo, al buio, non viene mai scambiata per un guasto,
 * perché in quei giri non decodifica niente nemmeno lei. È l'unica sentinella
 * dell'immagine del progetto — prima viveva dentro face-tracker.js, quindi
 * sorvegliava solo con il tracking acceso, e per il blocco del disegno
 * prescriveva la cura sbagliata. Gira sempre, dal primo avvio della camera. Il
 * conteggio cumulativo dei fotogrammi mostrati lo legge anche il diario
 * (log-heartbeat.js), che non ne tiene un secondo. A ogni giro chiama anche
 * onAlive: è il segno di vita che il main aspetta per accorgersi del blocco che
 * questa sentinella non può vedere, quello del codice della finestra stesso.
 */

const STALL_CHECK_INTERVAL_MS = 250;
// Due giri a vuoto di fila, cioè mezzo secondo: uno solo può capitare per il
// normale sfasamento fra il momento in cui un fotogramma arriva e quello in
// cui viene mostrato, quando cade a cavallo di due giri.
const PRESENTATION_STALL_CHECKS = 2;
const CAMERA_STALL_TIMEOUT_MS = 4000; // il riavvio dello stream è pesante: si concede più tempo prima di deciderlo
const CAMERA_RESTART_COOLDOWN_MS = 15000; // distanza minima fra due riavvii, per non martellare un dispositivo malmesso

class VideoStallWatcher {
  constructor({ videoElement, onCameraStall, onPresentationStall, onAlive }) {
    this.videoElement = videoElement;
    this.onAlive = onAlive;
    this.onCameraStall = onCameraStall;
    this.onPresentationStall = onPresentationStall;
    this.deliveredFrames = 0; // cumulativo da inizio sessione, letto anche dal diario
    this.lastPresentedFrames = 0;
    this.lastDecodedFrames = 0;
    this.blindChecks = 0; // giri di fila con fotogrammi decodificati ma nessuno mostrato
    this.lastActivityAt = 0;
    this.lastCameraRestartAt = null; // null = mai riavviata: il primo riavvio non deve aspettare nessun intervallo
    this.timer = null;
  }

  getDeliveredFrames() {
    return this.deliveredFrames;
  }

  start() {
    if (this.timer) {return;}
    this.lastActivityAt = performance.now();
    this.lastDecodedFrames = this.readDecodedFrames();
    this.lastPresentedFrames = this.deliveredFrames;
    this.watchVideoFrames();
    this.timer = setInterval(() => this.check(), STALL_CHECK_INTERVAL_MS);
  }

  // Conta i fotogrammi davvero mostrati. currentTime non serve allo scopo: su
  // uno stream live avanza con l'orologio anche se i fotogrammi non arrivano
  // più (verificato con la sonda del 2026-07-09).
  watchVideoFrames() {
    this.videoElement.requestVideoFrameCallback(() => {
      this.deliveredFrames += 1;
      this.watchVideoFrames();
    });
  }

  check() {
    this.onAlive();
    const now = performance.now();
    const decodedFrames = this.readDecodedFrames();
    const decodedInRound = decodedFrames - this.lastDecodedFrames;
    const presentedInRound = this.deliveredFrames - this.lastPresentedFrames;
    this.lastDecodedFrames = decodedFrames;
    this.lastPresentedFrames = this.deliveredFrames;
    // Il video non deve mostrare niente (finestra nascosta, stream in riavvio
    // con i conteggi ripartiti da zero): si riparte puliti da qui
    if (this.isVideoIdle() || decodedInRound < 0) {
      this.resetActivity(now);
      return;
    }
    if (presentedInRound > 0) {
      this.resetActivity(now);
      return;
    }
    if (decodedInRound > 0) {
      this.reportBlindRound(now);
      return;
    }
    if (now - this.lastActivityAt < CAMERA_STALL_TIMEOUT_MS) {return;}
    this.lastActivityAt = now;
    this.restartStalledCamera(now);
  }

  resetActivity(now) {
    this.blindChecks = 0;
    this.lastActivityAt = now;
  }

  // La camera ha consegnato e sullo schermo non è comparso niente: è il
  // disegno della finestra a essersi fermato, non lo stream.
  reportBlindRound(now) {
    this.lastActivityAt = now;
    this.blindChecks += 1;
    if (this.blindChecks < PRESENTATION_STALL_CHECKS) {return;}
    this.blindChecks = 0;
    console.error(
      'Immagine ferma: la finestra non mostra più fotogrammi mentre la camera consegna, chiedo la scossa',
    );
    this.onPresentationStall();
  }

  isVideoIdle() {
    return (
      document.hidden ||
      this.videoElement.readyState < 2 ||
      !this.videoElement.videoWidth
    );
  }

  restartStalledCamera(now) {
    // Il confronto con null darebbe "0", cioè l'orologio dall'avvio della
    // pagina: una camera che muore nei primi quindici secondi non verrebbe
    // riavviata subito ma solo quando l'app è in piedi da abbastanza tempo
    if (
      this.lastCameraRestartAt !== null &&
      now - this.lastCameraRestartAt < CAMERA_RESTART_COOLDOWN_MS
    )
      {return;}
    this.lastCameraRestartAt = now;
    console.error(
      'Immagine ferma: la camera non consegna più fotogrammi, riavvio lo stream',
    );
    this.onCameraStall();
  }

  // Conta i fotogrammi arrivati dalla camera anche mentre la finestra non
  // viene disegnata, quando requestVideoFrameCallback tace: è ciò che separa
  // una camera morta da un'immagine che nessuno ridisegna.
  readDecodedFrames() {
    if (!this.videoElement.getVideoPlaybackQuality) {return 0;}
    return this.videoElement.getVideoPlaybackQuality().totalVideoFrames;
  }
}

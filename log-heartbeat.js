/**
 * Battito della finestra per il diario. Tiene tre contatori che scorrono in
 * parallelo — i giri di un timer (il codice della finestra è vivo), i
 * fotogrammi disegnati (Windows sta ancora componendo la finestra) e quelli
 * mostrati dal video, che conta già video-stall-watcher.js e qui si leggono
 * da lì invece di contarli una seconda volta — e ogni dieci secondi li manda
 * al processo main sul canale debug-beat, insieme allo stato della traccia
 * video, alla memoria occupata e allo stato del face tracking (acceso o no e
 * una riga di dettaglio, preparata da face-tracker-diary.js). È
 * il confronto fra questi contatori a distinguere, a posteriori, un'app
 * bloccata da un'immagine ferma perché nessuno la ridisegna: la lettura la fa
 * log-diagnostics.js, qui si contano e basta.
 */

const HEARTBEAT_TICK_MS = 1000; // giro del timer: la sua irregolarità misura i blocchi del codice
const HEARTBEAT_BEAT_MS = 10000; // ogni quanto il riepilogo parte verso il main

class Heartbeat {
  constructor({
    videoElement,
    getVideoTrack,
    getDeliveredFrames,
    describeTracking,
  }) {
    this.videoElement = videoElement;
    this.getVideoTrack = getVideoTrack;
    this.getDeliveredFrames = getDeliveredFrames;
    this.describeTracking = describeTracking;
    this.paintedFrames = 0;
    this.deliveredFramesAtStart = 0;
    this.timerTicks = 0;
    this.maxTimerGapMs = 0;
    this.lastTickAt = 0;
    this.beatStartedAt = 0;
    this.decodedFramesAtStart = 0;
    this.currentTimeAtStart = 0;
  }

  start() {
    this.lastTickAt = this.beatStartedAt = performance.now();
    this.decodedFramesAtStart = this.readDecodedFrames();
    this.deliveredFramesAtStart = this.getDeliveredFrames();
    this.currentTimeAtStart = this.videoElement.currentTime;
    this.countPaintedFrames();
    setInterval(() => this.tick(), HEARTBEAT_TICK_MS);
  }

  // Se la finestra smette di essere disegnata questa catena si ferma senza
  // errori e riparte da sola quando Windows ricomincia a comporla: è proprio
  // il buco nel conteggio il segnale che si vuole registrare.
  countPaintedFrames() {
    requestAnimationFrame(() => {
      this.paintedFrames += 1;
      this.countPaintedFrames();
    });
  }

  tick() {
    const now = performance.now();
    this.timerTicks += 1;
    this.maxTimerGapMs = Math.max(this.maxTimerGapMs, now - this.lastTickAt);
    this.lastTickAt = now;
    if (now - this.beatStartedAt < HEARTBEAT_BEAT_MS) {
      return;
    }
    this.sendBeat(now);
  }

  sendBeat(now) {
    const decodedFrames = this.readDecodedFrames();
    const deliveredFrames = this.getDeliveredFrames();
    const videoTrack = this.getVideoTrack();
    window.electronAPI.send('debug-beat', {
      expectedTicks: Math.round((now - this.beatStartedAt) / HEARTBEAT_TICK_MS),
      timerTicks: this.timerTicks,
      maxTimerGapMs: Math.round(this.maxTimerGapMs),
      paintedFrames: this.paintedFrames,
      deliveredFrames: deliveredFrames - this.deliveredFramesAtStart,
      decodedFrames: decodedFrames - this.decodedFramesAtStart,
      currentTimeDelta: this.videoElement.currentTime - this.currentTimeAtStart,
      trackState: videoTrack ? videoTrack.readyState : 'assente',
      isTrackMuted: videoTrack ? videoTrack.muted : false,
      isHidden: document.hidden,
      heapMegabytes: this.readHeapMegabytes(),
      ...this.describeTracking(),
    });
    this.timerTicks = 0;
    this.maxTimerGapMs = 0;
    this.paintedFrames = 0;
    this.beatStartedAt = now;
    this.deliveredFramesAtStart = deliveredFrames;
    this.decodedFramesAtStart = decodedFrames;
    this.currentTimeAtStart = this.videoElement.currentTime;
  }

  // Conta i fotogrammi arrivati dalla camera anche mentre la finestra non
  // viene disegnata, quando requestVideoFrameCallback tace: è l'unico
  // contatore che distingue una camera morta da un'immagine che nessuno
  // ridisegna, cioè i due guasti che a occhio sembrano identici.
  readDecodedFrames() {
    if (!this.videoElement.getVideoPlaybackQuality) {
      return 0;
    }
    return this.videoElement.getVideoPlaybackQuality().totalVideoFrames;
  }

  readHeapMegabytes() {
    if (!performance.memory) {
      return 0;
    }
    return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
  }
}

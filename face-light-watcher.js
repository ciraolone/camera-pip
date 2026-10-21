/**
 * Sentinella della luce ambientale per il face tracking. Campiona a bassa
 * cadenza la luminosità media del fotogramma della webcam — ridotto a pochi
 * pixel su un canvas fuori schermo — e avvisa il FaceTracker quando la stanza
 * è diventata troppo buia perché il rilevamento abbia senso (onDarkness) e
 * quando la luce è tornata (onLight). Le due soglie sono diverse apposta e
 * ogni cambio di stato va confermato per qualche secondo: così un'ombra di
 * passaggio o una mano davanti all'obiettivo non fanno accendere e spegnere il
 * tracking di continuo. La misura continua anche mentre il rilevamento è
 * sospeso, ed è l'unico modo per accorgersi che la luce è tornata. Le soglie
 * stanno in face-tracker-tuning.js, l'unico utilizzatore è face-tracker.js.
 */

class LightWatcher {
  constructor({ videoElement, onDarkness, onLight }) {
    this.videoElement = videoElement;
    this.onDarkness = onDarkness;
    this.onLight = onLight;
    this.sampleCanvas = null;
    this.sampleContext = null;
    this.timer = null;
    this.isDark = false;
    this.pendingSince = null; // da quando la soglia opposta è superata senza interruzioni
    this.lastLuma = null; // ultima misura, letta dal pannello info
  }

  getLastLuma() {
    return this.lastLuma;
  }

  start() {
    if (this.timer) return;
    this.isDark = false;
    this.pendingSince = null;
    this.timer = setInterval(() => this.check(), TRACKING_TUNING.lightCheckIntervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.isDark = false;
    this.pendingSince = null;
    this.lastLuma = null;
  }

  check() {
    // A finestra nascosta il video non consegna fotogrammi: misurare qui
    // leggerebbe l'ultimo fotogramma rimasto e deciderebbe su un'immagine vecchia
    if (document.hidden) return;
    const luma = this.measureLuma();
    if (luma === null) return;
    this.lastLuma = luma;
    const hasCrossedThreshold = this.isDark
      ? luma >= TRACKING_TUNING.lightResumeLuma
      : luma <= TRACKING_TUNING.darkSuspendLuma;
    if (!hasCrossedThreshold) {
      this.pendingSince = null;
      return;
    }
    const now = performance.now();
    if (this.pendingSince === null) this.pendingSince = now;
    const confirmMs = this.isDark ? TRACKING_TUNING.lightConfirmMs : TRACKING_TUNING.darkConfirmMs;
    if (now - this.pendingSince < confirmMs) return;
    this.pendingSince = null;
    this.isDark = !this.isDark;
    if (this.isDark) this.onDarkness();
    else this.onLight();
  }

  // Il fotogramma si riduce a poche decine di pixel prima di leggerlo: la
  // luminosità media non cambia, il costo della lettura sì (qualche centinaio
  // di pixel invece di un milione). Luma secondo Rec. 709, come la percepisce
  // l'occhio: il verde pesa molto più del blu.
  measureLuma() {
    const video = this.videoElement;
    if (video.readyState < 2 || !video.videoWidth) return null;
    const width = TRACKING_TUNING.lightSampleWidth;
    const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
    if (!this.sampleContext || this.sampleCanvas.height !== height) {
      this.sampleCanvas = new OffscreenCanvas(width, height);
      this.sampleContext = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
    this.sampleContext.drawImage(video, 0, 0, width, height);
    const { data } = this.sampleContext.getImageData(0, 0, width, height);
    let total = 0;
    for (let index = 0; index < data.length; index += 4) {
      total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    }
    return total / (data.length / 4);
  }
}

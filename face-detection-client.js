/**
 * Lato app del rilevamento volto: gestisce il worker (face-detection-worker.js)
 * che fa girare MediaPipe fuori dal thread principale. Legge via IPC i byte
 * del worker e degli asset MediaPipe (canale read-vendor-file), avvia il
 * worker da blob URL, gli invia i frame come ImageBitmap ridotti — uno alla
 * volta: se il rilevamento è più lento della cadenza, i frame in eccesso si
 * saltano invece di accodarsi — e riconsegna le detection al FaceTracker. Qui
 * vivono il watchdog (errori consecutivi → restart del detector nel worker),
 * il riciclo preventivo anti-leak a intervalli regolari e la resa definitiva
 * (onFatalError) se anche il ripristino fallisce. stop() termina il worker e
 * libera la memoria del runtime: alla riaccensione si riparte da zero.
 */

class FaceDetectionClient {
  constructor({ onDetections, onFatalError }) {
    this.onDetections = onDetections;
    this.onFatalError = onFatalError;
    this.worker = null;
    this.isReady = false;
    this.isStarting = false;
    this.isBusyDetecting = false;
    this.isRestarting = false;
    this.detectionFailures = 0;
    this.detectorReadyAt = 0;
  }

  async start() {
    if (this.worker || this.isStarting) return;
    this.isStarting = true;
    try {
      const readFile = (fileName) => window.electronAPI.invoke('read-vendor-file', fileName);
      const [workerSource, bundleBytes, wasmLoaderBytes, wasmBinaryBytes, modelBytes] = await Promise.all([
        readFile('face-detection-worker.js'),
        readFile('vision_bundle.mjs'),
        readFile('vision_wasm_internal.js'),
        readFile('vision_wasm_internal.wasm'),
        readFile('blaze_face_short_range.tflite'),
      ]);
      const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      this.worker = new Worker(workerUrl);
      this.worker.onmessage = (event) => this.handleWorkerMessage(event.data);
      const assets = { bundleBytes, wasmLoaderBytes, wasmBinaryBytes, modelBytes };
      this.worker.postMessage({ type: 'init', assets }, [
        bundleBytes.buffer,
        wasmLoaderBytes.buffer,
        wasmBinaryBytes.buffer,
        modelBytes.buffer,
      ]);
    } catch (error) {
      console.error('Face tracking: inizializzazione MediaPipe fallita', error);
      this.stop();
      this.onFatalError();
    }
    this.isStarting = false;
  }

  stop() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.isReady = false;
    this.isBusyDetecting = false;
    this.isRestarting = false;
    this.detectionFailures = 0;
  }

  requestDetection(video) {
    if (!this.worker || !this.isReady || this.isBusyDetecting || this.isRestarting) return;
    if (performance.now() - this.detectorReadyAt >= TRACKING_TUNING.detectorRecycleIntervalMs) {
      // Riciclo preventivo: il runtime MediaPipe accumula risorse a ogni frame anche senza errori (leak noto)
      console.log('Face tracking: riciclo preventivo del detector');
      this.restartDetector();
      return;
    }
    this.isBusyDetecting = true;
    const timestampMs = performance.now();
    const frameWidth = TRACKING_TUNING.detectionFrameWidth;
    const frameHeight = Math.round((frameWidth * video.videoHeight) / video.videoWidth);
    // Il ridimensionamento avviene qui (asincrono, fuori dal percorso di rendering):
    // al worker arriva solo un bitmap piccolo da leggere, mai il frame pieno
    createImageBitmap(video, { resizeWidth: frameWidth, resizeHeight: frameHeight, resizeQuality: 'low' })
      .then((frame) => {
        if (!this.worker) {
          frame.close();
          this.isBusyDetecting = false;
          return;
        }
        this.worker.postMessage({ type: 'detect', frame, timestampMs }, [frame]);
      })
      .catch((error) => {
        this.isBusyDetecting = false;
        this.recordDetectionFailure(error);
      });
  }

  handleWorkerMessage(message) {
    if (message.type === 'ready') {
      const isRestart = this.isRestarting;
      this.isReady = true;
      this.isBusyDetecting = false;
      this.isRestarting = false;
      this.detectorReadyAt = performance.now();
      console.log(isRestart ? 'Face tracking: MediaPipe ripristinato' : 'Face tracking: MediaPipe pronto');
      return;
    }
    if (message.type === 'init-error') {
      console.error('Face tracking: avvio del detector fallito, tracking spento', message.message);
      this.stop();
      this.onFatalError();
      return;
    }
    if (message.type === 'result') {
      this.isBusyDetecting = false;
      this.detectionFailures = 0;
      this.onDetections(message.detections);
      return;
    }
    if (message.type === 'error') {
      this.isBusyDetecting = false;
      this.recordDetectionFailure(message.message);
    }
  }

  // Watchdog: dopo qualche errore consecutivo il detector viene ricreato nel
  // worker; se anche il ripristino fallisce arriva init-error e il tracking si
  // spegne da solo. Il video non deve mai richiedere un riavvio per colpa nostra.
  recordDetectionFailure(reason) {
    this.detectionFailures += 1;
    if (this.detectionFailures < TRACKING_TUNING.detectionFailuresBeforeRestart || this.isRestarting) return;
    console.error('Face tracking: detection in errore, reinizializzo MediaPipe', reason);
    this.detectionFailures = 0;
    this.restartDetector();
  }

  restartDetector() {
    if (!this.worker || this.isRestarting) return;
    this.isRestarting = true;
    this.isReady = false;
    this.worker.postMessage({ type: 'restart' });
  }
}

/**
 * Worker di rilevamento volto. Gira in un thread separato dal resto dell'app:
 * riceve una volta i byte di MediaPipe (bundle, runtime WASM, modello) con il
 * messaggio init, costruisce il FaceDetector e poi risponde ai messaggi detect
 * (un ImageBitmap già ridotto) con le detection in forma minimale e
 * serializzabile. Vive quanto un detector: il riciclo (preventivo o per
 * errori) è una terminazione decisa da face-detection-client.js — l'unico
 * interlocutore — che poi crea un worker nuovo; è la terminazione a liberare
 * la memoria del runtime. Tenere MediaPipe qui dentro toglie il costo del
 * rilevamento dal thread che disegna video e movimento, e isola il suo
 * contesto grafico dal rendering del video dell'app. Worker classico, non
 * module: il runtime di MediaPipe si carica con importScripts, che nei module
 * worker non esiste.
 */

let detector = null;
let sampleCanvas = null;
let sampleContext = null;

const asBlobUrl = (bytes, mimeType) => URL.createObjectURL(new Blob([bytes], { type: mimeType }));

async function initDetector(assets) {
  try {
    const visionBundle = await import(asBlobUrl(assets.bundleBytes, 'text/javascript'));
    detector = await visionBundle.FaceDetector.createFromOptions(
      {
        wasmLoaderPath: asBlobUrl(assets.wasmLoaderBytes, 'text/javascript'),
        wasmBinaryPath: asBlobUrl(assets.wasmBinaryBytes, 'application/wasm'),
      },
      {
        baseOptions: {
          modelAssetBuffer: assets.modelBytes,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
      }
    );
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'init-error', message: String(error) });
  }
}

function detectFrame(frame, timestampMs) {
  if (!sampleContext) {
    sampleCanvas = new OffscreenCanvas(frame.width, frame.height);
    sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (sampleCanvas.width !== frame.width || sampleCanvas.height !== frame.height) {
    sampleCanvas.width = frame.width;
    sampleCanvas.height = frame.height;
  }
  sampleContext.drawImage(frame, 0, 0);
  frame.close();
  const pixels = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
  const result = detector.detectForVideo(pixels, timestampMs);
  return result.detections.map((detection) => ({
    boundingBox: {
      originX: detection.boundingBox.originX,
      originY: detection.boundingBox.originY,
      width: detection.boundingBox.width,
      height: detection.boundingBox.height,
    },
    keypoints: detection.keypoints.map((keypoint) => ({ x: keypoint.x, y: keypoint.y })),
  }));
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') {
    initDetector(message.assets);
    return;
  }
  if (message.type !== 'detect') return;
  if (!detector) {
    message.frame.close();
    self.postMessage({ type: 'error', message: 'detector assente' });
    return;
  }
  try {
    self.postMessage({ type: 'result', detections: detectFrame(message.frame, message.timestampMs) });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error) });
  }
};

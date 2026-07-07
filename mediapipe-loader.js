/**
 * Caricamento di MediaPipe Tasks Vision per il face tracking. Espone una
 * singola funzione loadFaceDetector() che legge bundle JS, runtime WASM e
 * modello BlazeFace da vendor/mediapipe/ tramite il canale IPC
 * read-vendor-file, monta bundle e runtime come blob URL e restituisce un
 * FaceDetector pronto in modalità VIDEO. È l'unico punto del progetto che
 * tocca MediaPipe: face-tracker.js riceve il detector già costruito. I file
 * non si caricano con path relativi perché Chromium blocca fetch/XHR verso
 * file:// (vedi plan della feature 001-face-tracking).
 */

const MEDIAPIPE_VENDOR_FILES = {
  bundle: 'vision_bundle.mjs',
  wasmLoader: 'vision_wasm_internal.js',
  wasmBinary: 'vision_wasm_internal.wasm',
  model: 'blaze_face_short_range.tflite',
};

async function loadFaceDetector() {
  const readVendorFile = (fileName) =>
    window.electronAPI.invoke('read-vendor-file', fileName);

  const [bundleBytes, wasmLoaderBytes, wasmBinaryBytes, modelBytes] = await Promise.all([
    readVendorFile(MEDIAPIPE_VENDOR_FILES.bundle),
    readVendorFile(MEDIAPIPE_VENDOR_FILES.wasmLoader),
    readVendorFile(MEDIAPIPE_VENDOR_FILES.wasmBinary),
    readVendorFile(MEDIAPIPE_VENDOR_FILES.model),
  ]);

  const asBlobUrl = (bytes, mimeType) =>
    URL.createObjectURL(new Blob([bytes], { type: mimeType }));

  const visionBundle = await import(asBlobUrl(bundleBytes, 'text/javascript'));

  return visionBundle.FaceDetector.createFromOptions(
    {
      wasmLoaderPath: asBlobUrl(wasmLoaderBytes, 'text/javascript'),
      wasmBinaryPath: asBlobUrl(wasmBinaryBytes, 'application/wasm'),
    },
    {
      baseOptions: {
        modelAssetBuffer: new Uint8Array(modelBytes),
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
    }
  );
}

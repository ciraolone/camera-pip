/**
 * Tutte le manopole di taratura del face tracking, raccolte in un file solo
 * per la sessione di taratura dal vivo: cadenze, zona morta, isteresi e le
 * scale dei setting esposti nel menu (velocità, tolleranza, inquadratura).
 * Le scale sono mappe scelta dell'utente → valore fisico: la scelta vive nei
 * settings (main.js) e arriva al FaceTracker via IPC. Usato solo da
 * face-tracker.js e face-chase-policy.js.
 */

const TRACKING_TUNING = {
  detectionIntervalMs: 150, // ~7 Hz di detection: bastano per un inseguimento delicato
  detectionFrameWidth: 256, // larghezza del frame ridotto passato al detector (px)
  detectionFailuresBeforeRestart: 5, // errori consecutivi prima di ricreare il detector
  detectorRecycleIntervalMs: 10 * 60 * 1000, // riciclo preventivo del worker di detection: il runtime MediaPipe accumula risorse a ogni frame anche senza errori (leak noto); si termina e ricrea il worker intero, l'unico riciclo che libera davvero la memoria
  videoStallTimeoutMs: 4000, // nessun fotogramma consegnato per tanto così (a finestra visibile) → riavvio dello stream della camera
  videoStallRestartCooldownMs: 15000, // distanza minima fra due riavvii della camera per stallo
  deadZoneStopFraction: 0.02, // errore (frazione del lato corto della finestra) sotto cui l'inseguimento si ferma
  faceAbsenceTimeoutMs: 3000, // attesa senza volto prima del rientro alla vista neutra
  faceStickinessRatio: 0.8, // il volto agganciato resta scelto finché è almeno l'80% del più grande
  sameFaceMaxDistance: 0.15, // distanza normalizzata massima per riconoscere lo stesso volto fra due giri
  faceSmoothingAlpha: 0.45, // filtro anti-tremolio sul centro-occhi: media mobile esponenziale (1 = filtro spento)
  adaptiveSpeedGain: 1, // boost massimo di velocità sugli spostamenti ampi (1 = fino al doppio, 0 = spento)
  adaptiveSpeedSpan: 0.35, // frazione del lato corto della finestra a cui il boost satura
  zoomScanStep: 0.05, // passo della ricerca del minimo zoom necessario
  zoomReleaseMargin: 0.15, // lo zoom scende solo se il necessario è più basso di almeno tanto così
  persistIntervalMs: 1000, // throttle del salvataggio di zoom/offset nei settings
};

// Setting "Tracking Speed" (1-5) → rapidità della molla in rad/s. Il livello 4
// replica il passo percepito della prima consegna (costante di tempo ~900ms).
const TRACKING_SPEED_OMEGAS = { 1: 0.5, 2: 0.73, 3: 1.07, 4: 1.78, 5: 2.9 };

// Setting "Tracking Easing" (1-3) → quanto è ammorbidita l'accelerazione, come
// frazione di 1/omega. Il livello 1 (zero) è la molla nuda della prima
// consegna; salendo, partenza e arrivo diventano più graduali e il movimento
// dura di più a parità di velocità. Oltre 0.6 il movimento comincia a
// oltrepassare il bersaglio: il margine è voluto, non allargarlo senza
// rimisurare l'overshoot a tutte le velocità.
const TRACKING_EASING_RATIOS = { 1: 0, 2: 0.3, 3: 0.6 };

// Setting "Tracking Tolerance" (1-5) → frazione del lato corto della finestra
// oltre cui il volto è considerato fuori posto. Il livello 3 è la tolleranza
// della prima consegna.
const TRACKING_TOLERANCE_FRACTIONS = { 1: 0.03, 2: 0.05, 3: 0.07, 4: 0.1, 5: 0.14 };

// Setting "Tracking Framing" (1-6) → dove devono stare gli occhi, in frazioni
// della finestra (0,0 = angolo in alto a sinistra). Ogni livello porta due
// cose: il punto bersaglio, dove l'inseguimento porta il volto quando
// interviene, e i bordi della zona in cui il volto è considerato a posto. Il
// bersaglio non è il centro geometrico della zona: in verticale sta a un terzo
// dall'alto (regola dei terzi), più in alto del centro della finestra.
// Al livello 1 i bordi collassano sul bersaglio, la zona sparisce e si ricade
// sul comportamento della prima consegna; salendo la zona si allarga su
// entrambi gli assi. Le zone larghe esistono perché lo spostamento
// dell'inquadratura vive solo nel margine creato dallo zoom: pretendere una
// posizione esatta in ogni istante costa ingrandimento anche quando il volto è
// già inquadrato benissimo. La larghezza cresce più piano dell'altezza perché
// in orizzontale il bersaglio è il centro esatto, quindi ogni punto
// percentuale di scarto laterale si paga più caro.
const TRACKING_FRAMING_ZONES = {
  1: { targetX: 0.5, targetY: 1 / 3, left: 0.5, right: 0.5, top: 1 / 3, bottom: 1 / 3 },
  2: { targetX: 0.5, targetY: 1 / 3, left: 0.425, right: 0.575, top: 0.17, bottom: 0.42 },
  3: { targetX: 0.5, targetY: 1 / 3, left: 0.35, right: 0.65, top: 0, bottom: 0.5 },
  4: { targetX: 0.5, targetY: 1 / 3, left: 0.3, right: 0.7, top: 0, bottom: 0.58 },
  5: { targetX: 0.5, targetY: 1 / 3, left: 0.25, right: 0.75, top: 0, bottom: 0.65 },
  6: { targetX: 0.5, targetY: 1 / 3, left: 0.175, right: 0.825, top: 0, bottom: 0.8 },
};

const DEFAULT_TRACKING_FRAMING = 3;

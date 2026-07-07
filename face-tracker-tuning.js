/**
 * Tutte le manopole di taratura del face tracking, raccolte in un file solo
 * per la sessione di taratura dal vivo: cadenze, bersaglio, zona morta,
 * isteresi e le scale dei setting a livelli esposti nel menu (velocità,
 * tolleranza). Le scale sono mappe livello → valore fisico: il livello scelto
 * dall'utente vive nei settings (main.js) e arriva al FaceTracker via IPC.
 * Usato solo da face-tracker.js.
 */

const TRACKING_TUNING = {
  detectionIntervalMs: 150, // ~7 Hz di detection: bastano per un inseguimento delicato
  targetEyeFraction: 1 / 3, // quota degli occhi dall'alto della finestra
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

// Setting "Tracking Tolerance" (1-5) → frazione del lato corto della finestra
// oltre cui il volto è considerato fuori posto. Il livello 3 è la tolleranza
// della prima consegna.
const TRACKING_TOLERANCE_FRACTIONS = { 1: 0.03, 2: 0.05, 3: 0.07, 4: 0.1, 5: 0.14 };

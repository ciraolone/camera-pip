/**
 * Decide che cosa vale la pena annotare nel diario (log-journal.js) per capire, a freddo, perché l'immagine si è fermata o il face tracking ha smesso di lavorare. Osserva dal processo main gli schermi collegati, gli eventi di alimentazione e risveglio, la finestra (spostamenti, passaggi fra schermi, visibilità, ricariche, blocchi) e la morte dei processi figli, e riversa nel diario anche i messaggi di console del renderer, così i log già scritti nel resto dell'app finiscono nel file senza doverli riscrivere. Riceve inoltre il battito che la finestra manda ogni dieci secondi (log-heartbeat.js) e lo traduce in una riga sola, segnalando a parte le combinazioni anomale: è quel confronto fra contatori a distinguere un'app bloccata da una finestra che nessuno disegna più da una camera che non consegna più fotogrammi. Dallo stesso battito ricava anche il disaccordo fra il menu e la finestra sul face tracking.
 */

const os = require('os');
const path = require('path');

const { app, screen, powerMonitor } = require('electron');

const { logLine } = require('./log-journal');
const { isNudgeInProgress } = require('./window-repaint');

const BEAT_SILENCE_MS = 25000; // oltre questo silenzio della finestra, lo annota il main
const BLOCKED_RENDERER_GAP_MS = 3000; // pausa del timer oltre cui il codice della finestra è considerato fermo
const CONSOLE_LEVELS = ['dettaglio', 'info', 'avviso', 'errore'];
const WINDOW_SETTLE_MS = 1000; // fine di un trascinamento: tanto silenzio dopo l'ultimo move/resize

let getMainWindow = () => null;
let isTrackingWanted = () => false;
let windowSettleTimer = null;
let currentTrackingMismatch = null;
let lastBeatAt = 0;
let lastWindowDisplayId = null;
let currentAnomaly = null;
let anomalyStartedAt = 0;

function startDiagnostics(windowGetter, trackingWantedGetter) {
  getMainWindow = windowGetter;
  isTrackingWanted = trackingWantedGetter;
  logStartupSnapshot();
  watchDisplays();
  watchPower();
  app.on('child-process-gone', (event, details) => {
    if (details.reason === 'clean-exit') {
      return;
    } // chiusura normale dell'app
    logLine(
      'anomalia',
      `processo ${details.type} terminato: ${details.reason}${details.exitCode !== undefined ? ` (codice ${details.exitCode})` : ''}`,
    );
  });
  lastBeatAt = Date.now();
  setInterval(checkRendererSilence, 10000);
}

function logStartupSnapshot() {
  logLine(
    'avvio',
    `Camera PiP ${app.getVersion()} | Electron ${process.versions.electron} | Chromium ${process.versions.chrome} | Windows ${os.release()}`,
  );
  const gpuStatus = app.getGPUFeatureStatus();
  logLine(
    'avvio',
    `grafica: ${Object.entries(gpuStatus)
      .map(([feature, state]) => `${feature}=${state}`)
      .join(' ')}`,
  );
  logDisplays('avvio');
}

function describeDisplay(display) {
  const { x, y, width, height } = display.bounds;
  return `#${display.id} ${width}x${height}@(${x},${y}) scala=${display.scaleFactor} ${display.internal ? 'interno' : 'esterno'}`;
}

function logDisplays(category) {
  const displays = screen.getAllDisplays();
  logLine(
    category,
    `schermi collegati (${displays.length}): ${displays.map(describeDisplay).join('  ·  ')}`,
  );
}

// Uno schermo che va e viene è il primo sospettato quando l'immagine si ferma
// solo sul monitor esterno: qui si annota ogni cambio di topologia, compresi
// quelli senza scollegamento (risoluzione, scala, risveglio dallo standby).
function watchDisplays() {
  screen.on('display-added', () => logDisplays('schermo'));
  screen.on('display-removed', () => logDisplays('schermo'));
  screen.on('display-metrics-changed', (event, display, changedMetrics) => {
    logLine(
      'schermo',
      `metriche cambiate (${changedMetrics.join(', ')}): ${describeDisplay(display)}`,
    );
  });
}

function watchPower() {
  [
    'suspend',
    'resume',
    'lock-screen',
    'unlock-screen',
    'shutdown',
    'on-ac',
    'on-battery',
  ].forEach((eventName) =>
    powerMonitor.on(eventName, () => logLine('alimentazione', eventName)),
  );
}

function describeWindow(window) {
  if (!window || window.isDestroyed()) {
    return 'finestra assente';
  }
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  return `finestra ${bounds.width}x${bounds.height}@(${bounds.x},${bounds.y}) schermo #${display.id} visibile=${window.isVisible() ? 'sì' : 'no'} minimizzata=${window.isMinimized() ? 'sì' : 'no'}`;
}

function watchWindow(window) {
  ['show', 'hide', 'minimize', 'restore', 'focus', 'blur'].forEach(
    (eventName) =>
      window.on(eventName, () =>
        logLine('finestra', `${eventName} — ${describeWindow(window)}`),
      ),
  );
  // move e resize arrivano a raffica durante un trascinamento con AltSnap: si
  // annota il passaggio da uno schermo all'altro e, una volta sola, dove la
  // finestra si è fermata alla fine del gesto
  window.on('move', () => noteWindowMoved(window));
  window.on('resize', () => noteWindowMoved(window));
  window.webContents.on('did-finish-load', () =>
    logLine('finestra', 'pagina caricata (avvio o ricarica)'),
  );
  window.webContents.on('unresponsive', () =>
    logLine(
      'anomalia',
      `la finestra ha smesso di rispondere — ${describeWindow(window)}`,
    ),
  );
  window.webContents.on('responsive', () =>
    logLine('finestra', 'la finestra ha ripreso a rispondere'),
  );
  // I console.log/error già sparsi nell'app (riavvio camera, riciclo del
  // detector, rallentamento senza volto) finiscono così nel diario senza toccarli: un solo
  // modo di annotare, quello che esiste già
  // File e riga servono per le eccezioni non gestite, che arrivano da qui
  window.webContents.on(
    'console-message',
    (event, level, message, line, sourceId) => {
      const source = sourceId ? ` (${path.basename(sourceId)}:${line})` : '';
      logLine(
        'console',
        `${CONSOLE_LEVELS[level] ?? level}: ${message}${source}`,
      );
    },
  );
  noteWindowDisplayChange(window);
}

function noteWindowMoved(window) {
  // Le scosse dell'app contro l'immagine ferma non sono spostamenti: con "Auto Refresh" a 5s riempirebbero il diario
  if (isNudgeInProgress()) {
    return;
  }
  noteWindowDisplayChange(window);
  clearTimeout(windowSettleTimer);
  windowSettleTimer = setTimeout(() => {
    if (!window.isDestroyed()) {
      logLine(
        'finestra',
        `spostata o ridimensionata — ${describeWindow(window)}`,
      );
    }
  }, WINDOW_SETTLE_MS);
}

function noteWindowDisplayChange(window) {
  const display = screen.getDisplayMatching(window.getBounds());
  if (display.id === lastWindowDisplayId) {
    return;
  }
  lastWindowDisplayId = display.id;
  logLine('finestra', `ora sta su ${describeDisplay(display)}`);
}

function handleRendererBeat(beat) {
  lastBeatAt = Date.now();
  const window = getMainWindow();
  logLine('battito', `${describeBeat(beat)} — ${describeWindow(window)}`);
  reportAnomaly(findBeatAnomaly(beat, window));
  noteTrackingMismatch(beat);
}

// Menu e finestra in disaccordo: la spunta c'è ma il tracking è fermo. Stato a
// parte da currentAnomaly: può durare insieme a un blocco dell'immagine.
function noteTrackingMismatch(beat) {
  const wanted = isTrackingWanted();
  const mismatch =
    wanted === beat.isTrackingEnabled
      ? null
      : `face tracking ${wanted ? 'acceso' : 'spento'} nel menu ma ${beat.isTrackingEnabled ? 'acceso' : 'spento'} nella finestra`;
  if (mismatch === currentTrackingMismatch) {
    return;
  }
  logLine('anomalia', mismatch ?? `rientrata: ${currentTrackingMismatch}`);
  currentTrackingMismatch = mismatch;
}

// Un guasto che dura mezz'ora scriverebbe centottanta righe identiche e
// sommergerebbe il resto: si annota quando comincia e quando rientra, con
// quanto è durato. È l'inizio e la fine che servono per incrociarli con gli
// altri eventi del diario.
function reportAnomaly(anomaly) {
  if (anomaly === currentAnomaly) {
    return;
  }
  if (anomaly) {
    logLine('anomalia', anomaly);
    currentAnomaly = anomaly;
    anomalyStartedAt = Date.now();
    return;
  }
  logLine(
    'anomalia',
    `rientrata dopo ${Math.round((Date.now() - anomalyStartedAt) / 1000)}s: ${currentAnomaly}`,
  );
  currentAnomaly = null;
}

function describeBeat(beat) {
  return [
    `codice=${beat.timerTicks}/${beat.expectedTicks} pausaMax=${(beat.maxTimerGapMs / 1000).toFixed(1)}s`,
    `disegnati=${beat.paintedFrames}`,
    `camera(consegnati=${beat.deliveredFrames} decodificati=${beat.decodedFrames} orologio=+${beat.currentTimeDelta.toFixed(1)}s stato=${beat.trackState}${beat.isTrackMuted ? ' MUTO' : ''})`,
    `nascosta=${beat.isHidden ? 'sì' : 'no'}`,
    `memoria=${beat.heapMegabytes}MB`,
    `tracking=${beat.tracking}`,
  ].join(' | ');
}

// Tre guasti diversi si presentano tutti come "l'app si è congelata" e
// vogliono rimedi opposti, ma si distinguono incrociando tre contatori: il
// timer dice se il codice della finestra gira ancora, i fotogrammi disegnati
// dicono se Windows sta ancora componendo la finestra, quelli della camera
// dicono se lo stream è vivo. I fotogrammi decodificati contano anche mentre
// la finestra non viene disegnata, quindi sono l'unico modo di sapere che la
// camera stava consegnando durante un blocco del disegno.
function findBeatAnomaly(beat, window) {
  if (beat.maxTimerGapMs >= BLOCKED_RENDERER_GAP_MS) {
    return `il codice della finestra si è fermato per ${(beat.maxTimerGapMs / 1000).toFixed(1)}s`;
  }
  // A finestra nascosta o minimizzata Chromium smette di disegnare apposta:
  // non è un guasto e non va segnalato
  if (
    beat.isHidden ||
    !window ||
    window.isDestroyed() ||
    !window.isVisible() ||
    window.isMinimized()
  ) {
    return null;
  }
  if (beat.paintedFrames === 0 && beat.decodedFrames > 0) {
    return 'la finestra non viene più disegnata mentre la camera continua a consegnare: sospetto compositing (schermo esterno, GPU, occlusione)';
  }
  if (beat.paintedFrames === 0) {
    return 'la finestra non viene più disegnata';
  }
  if (beat.decodedFrames === 0) {
    return 'la camera non consegna più fotogrammi';
  }
  return null;
}

// Se la finestra tace, a parlare resta il main: il silenzio va annotato da
// qui, altrimenti nel diario resterebbe solo un buco senza spiegazione.
function checkRendererSilence() {
  if (Date.now() - lastBeatAt < BEAT_SILENCE_MS) {
    return;
  }
  lastBeatAt = Date.now();
  logLine(
    'anomalia',
    `nessun battito dalla finestra da oltre ${BEAT_SILENCE_MS / 1000}s — ${describeWindow(getMainWindow())}`,
  );
}

module.exports = { startDiagnostics, watchWindow, handleRendererBeat };

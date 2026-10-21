/**
 * Rimedio all'immagine congelata, lato processo main. Quando la finestra
 * smette di essere disegnata da Windows mentre la camera continua a
 * consegnare fotogrammi — il guasto riconosciuto da video-stall-watcher.js —
 * qui si fa, in automatico, quello che l'utente farebbe a mano per sbloccarla.
 * Due scosse in scala: prima le due invisibili (richiesta di ridisegno e
 * riaffermazione del primo piano), mezzo secondo dopo, se non è bastato, anche
 * lo spostamento di un pixel con ritorno alla posizione esatta. La stessa
 * scossa completa può essere ripetuta a intervalli regolari, a prescindere da
 * qualunque rilevazione, se l'utente accende "Auto Refresh" nel menu:
 * setPeriodicRefresh è l'unico posto che accende e spegne quel giro. I
 * tentativi finiscono nel diario (log-journal.js), così a freddo si sa se il
 * rimedio ha funzionato e quale gradino è servito.
 */

const { logLine } = require("./log-journal");

const REPAINT_COOLDOWN_MS = 400; // la sentinella richiama ogni mezzo secondo: deve passare
const REPAINT_SLOW_COOLDOWN_MS = 5000; // cadenza di ripiego quando il blocco non risponde a niente
const ATTEMPTS_BEFORE_SLOWING = 10; // ~4 secondi di tentativi fitti, poi si rallenta
const REPAINT_SERIES_RESET_MS = 30000; // dopo tanta calma il prossimo blocco riparte dal gradino leggero
const NUDGE_RESTORE_DELAY_MS = 50; // due spostamenti nello stesso istante Windows li accorpa, e non forzano niente

let lastRepaintAt = 0;
let attemptsInSeries = 0;
let pendingNudgeRestore = null;
let periodicTimer = null;

function requestRepaint(window) {
  if (!canShake(window)) return;
  const now = Date.now();
  // Un blocco che non risponde a nessuna scossa non deve far scuotere la
  // finestra due volte al secondo per sempre: dopo una decina di tentativi si
  // continua a provare, ma con calma
  const cooldown = attemptsInSeries >= ATTEMPTS_BEFORE_SLOWING ? REPAINT_SLOW_COOLDOWN_MS : REPAINT_COOLDOWN_MS;
  if (now - lastRepaintAt < cooldown) return;
  if (now - lastRepaintAt > REPAINT_SERIES_RESET_MS) attemptsInSeries = 0;
  lastRepaintAt = now;
  attemptsInSeries += 1;
  if (attemptsInSeries === 1) {
    logLine("rimedio", "immagine ferma: chiedo il ridisegno e riaffermo il primo piano");
    redraw(window);
    return;
  }
  logLine("rimedio", `immagine ancora ferma (tentativo ${attemptsInSeries}): aggiungo lo spostamento di un pixel`);
  redraw(window);
  nudgeWindow(window);
}

// Ritocco periodico, indipendente da qualunque rilevazione: rete di sicurezza
// per i blocchi che la sentinella non può vedere, per esempio se a piantarsi è
// il codice della finestra, che allora non chiede niente a nessuno. Spento di
// serie: se la scossa automatica fa il suo mestiere, questo non serve.
function setPeriodicRefresh(getWindow, intervalSeconds) {
  const wasRunning = Boolean(periodicTimer);
  clearInterval(periodicTimer);
  periodicTimer = null;
  if (!intervalSeconds) {
    // Spento di serie: senza questa guardia il diario si aprirebbe con una
    // riga che annuncia lo spegnimento di una cosa mai accesa
    if (wasRunning) logLine("rimedio", "ritocco periodico della finestra spento");
    return;
  }
  logLine("rimedio", `ritocco periodico della finestra ogni ${intervalSeconds}s`);
  // Il singolo ritocco non si annota: a questa cadenza seppellirebbe il resto
  periodicTimer = setInterval(() => {
    const window = getWindow();
    if (!canShake(window)) return;
    redraw(window);
    nudgeWindow(window);
  }, intervalSeconds * 1000);
}

function canShake(window) {
  return Boolean(window) && !window.isDestroyed() && window.isVisible() && !window.isMinimized();
}

// Le due mosse che non spostano niente. Il ritorno in cima è l'altra metà
// della scossa: su Windows una finestra sempre-in-primo-piano può perdersi
// quel posto (un'app a schermo intero glielo porta via) e riaffermarlo
// costringe il gestore delle finestre a rifare i conti su di lei. Il primo
// piano si tocca solo se l'utente lo vuole, e il focus mai: rubarlo mentre sta
// scrivendo altrove sarebbe peggio del guasto.
function redraw(window) {
  window.webContents.invalidate();
  if (!window.isAlwaysOnTop()) return;
  window.setAlwaysOnTop(false);
  window.setAlwaysOnTop(true);
}

// È la scossa che dà l'utente quando trascina la finestra per sbloccarla: lo
// spostamento obbliga Windows a ricomporla da capo. A occhio non si vede.
// Due spinte non si possono accavallare: la seconda leggerebbe come posizione
// di casa quella già spostata di un pixel, e la finestra migrerebbe di un
// pixel a ogni blocco invece di tornare sempre dov'era.
function nudgeWindow(window) {
  if (pendingNudgeRestore) return;
  const bounds = window.getBounds();
  window.setBounds({ ...bounds, x: bounds.x + 1 });
  pendingNudgeRestore = setTimeout(() => {
    pendingNudgeRestore = null;
    if (window.isDestroyed()) return;
    window.setBounds(bounds);
  }, NUDGE_RESTORE_DELAY_MS);
}

module.exports = { requestRepaint, setPeriodicRefresh };

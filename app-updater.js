/**
 * Aggiornamento dell'app dal menu, lato processo main (feature 004). checkForUpdates legge dal server di casa il latest.json pubblicato da publish.js, lo confronta con la versione installata e, se Andrea conferma, scarica il nuovo pacchetto del codice (resources/app.asar), ne verifica l'impronta SHA-256, lo deposita accanto a quello in uso come app.asar.next e affida a uno script PowerShell lo scambio: lo script aspetta che l'app si chiuda, mette il pacchetto nuovo al posto del vecchio e la riapre. Si aggiorna solo il codice, mai il motore Electron: se la versione nuova richiede un Electron diverso, l'avviso rimanda allo zip completo. reportFailedSwap, chiamata all'avvio, si accorge se lo scambio della volta prima non è riuscito (il .next è ancora lì) e lo dice. Ogni passo lascia una riga "aggiornamento" nel diario, ogni fallimento anche un avviso a schermo.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

const { app, dialog, net } = require('electron');
// original-fs e non fs: il fs di Electron tratta i file .asar come archivi da aprire, non come file da leggere o spostare
const fs = require('original-fs');

const { logLine } = require('./log-journal');

const RELEASES_URL = 'https://home-server.tail6fec67.ts.net/ota/camera-pip/';
const LATEST_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 180000; // ~14 MB anche su una rete lenta

async function checkForUpdates(window) {
  logLine(
    'aggiornamento',
    `controllo richiesto dal menu, installata ${app.getVersion()}`,
  );
  try {
    if (!app.isPackaged) {
      throw new Error(
        'updates work only in the installed app, not when started from the source folder',
      );
    }
    const latest = await fetchLatest();
    if (!isNewerVersion(latest.version, app.getVersion())) {
      logLine(
        'aggiornamento',
        `già all'ultima versione (${latest.version} sul server)`,
      );
      await dialog.showMessageBox(window, {
        type: 'info',
        message: `Camera PiP is up to date (v${app.getVersion()}).`,
      });
      return;
    }
    if (latest.electronVersion !== process.versions.electron) {
      await offerFullPackage(window, latest);
      return;
    }
    if (!(await confirmUpdate(window, latest))) {
      logLine(
        'aggiornamento',
        `aggiornamento a ${latest.version} rifiutato da Andrea`,
      );
      return;
    }
    await installUpdate(latest);
  } catch (error) {
    logLine('aggiornamento', `fallito: ${error.message}`);
    await dialog.showMessageBox(window, {
      type: 'error',
      message: 'Update failed',
      detail: error.message,
    });
  }
}

async function fetchLatest() {
  let response;
  try {
    response = await net.fetch(`${RELEASES_URL}latest.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(LATEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `The update server cannot be reached: the laptop must be on the home network (Tailscale). (${error.message})`,
    );
  }
  if (!response.ok) {
    throw new Error(`The update server answered ${response.status}.`);
  }
  return response.json();
}

function isNewerVersion(candidate, installed) {
  const candidateParts = candidate.split('.').map(Number);
  const installedParts = installed.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (candidateParts[index] !== installedParts[index]) {
      return candidateParts[index] > installedParts[index];
    }
  }
  return false;
}

async function offerFullPackage(window, latest) {
  logLine(
    'aggiornamento',
    `${latest.version} richiede Electron ${latest.electronVersion} (installato ${process.versions.electron}): serve lo zip completo`,
  );
  await dialog.showMessageBox(window, {
    type: 'warning',
    message: `Version ${latest.version} needs a full reinstall.`,
    detail: `It runs on a newer engine, so it cannot be installed from the menu. Download it from:\n${RELEASES_URL}${latest.zipFile}`,
  });
}

async function confirmUpdate(window, latest) {
  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    message: `Version ${latest.version} is available (installed: ${app.getVersion()}).`,
    detail: 'Camera PiP will close and reopen by itself, already updated.',
    buttons: ['Update now', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  });
  return response === 0;
}

async function installUpdate(latest) {
  logLine('aggiornamento', `scarico ${latest.asarFile}`);
  const response = await net.fetch(`${RELEASES_URL}${latest.asarFile}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Download failed: the server answered ${response.status}.`);
  }
  const packageBytes = Buffer.from(await response.arrayBuffer());
  const digest = crypto.createHash('sha256').update(packageBytes).digest('hex');
  if (digest !== latest.sha256) {
    throw new Error(
      'The downloaded update is damaged (checksum mismatch). Nothing was changed.',
    );
  }
  const nextPath = pendingPackagePath();
  await fs.promises.writeFile(nextPath, packageBytes);
  logLine(
    'aggiornamento',
    `pacchetto ${latest.version} verificato, chiudo l'app per lo scambio`,
  );
  launchSwapScript(nextPath);
  app.quit();
}

function pendingPackagePath() {
  return path.join(process.resourcesPath, 'app.asar.next');
}

// Lo scambio non si può fare da qui: su Windows il pacchetto in uso resta bloccato finché il processo vive. Lo script riprova lo spostamento per qualche secondo (Windows può tardare a rilasciare il file anche dopo l'uscita) e riapre comunque l'app: se lo scambio è fallito, all'avvio reportFailedSwap trova il .next ancora lì e lo dice.
function launchSwapScript(nextPath) {
  const quote = (text) => `'${text.replace(/'/g, "''")}'`;
  const script = [
    '$deadline = (Get-Date).AddSeconds(30)',
    `while ((Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 200 }`,
    'for ($attempt = 0; $attempt -lt 20; $attempt++) {',
    `  try { Move-Item -LiteralPath ${quote(nextPath)} -Destination ${quote(path.join(process.resourcesPath, 'app.asar'))} -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 }`,
    '}',
    `Start-Process -FilePath ${quote(process.execPath)}`,
  ].join('\r\n');
  const scriptPath = path.join(os.tmpdir(), 'camera-pip-update.ps1');
  fs.writeFileSync(scriptPath, script);
  spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      scriptPath,
    ],
    { detached: true, stdio: 'ignore', windowsHide: true },
  ).unref();
}

function reportFailedSwap() {
  const nextPath = pendingPackagePath();
  if (!app.isPackaged || !fs.existsSync(nextPath)) {
    return;
  }
  logLine(
    'anomalia',
    `aggiornamento non installato: il pacchetto nuovo è rimasto in ${nextPath}, gira ancora la ${app.getVersion()}`,
  );
  fs.rmSync(nextPath, { force: true });
  dialog.showMessageBox({
    type: 'warning',
    message: 'The last update could not be installed.',
    detail: `Camera PiP is still on version ${app.getVersion()}. Try "Check for Updates" again.`,
  });
}

module.exports = { checkForUpdates, reportFailedSwap };

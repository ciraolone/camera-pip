/**
 * Pubblicazione di una versione per l'aggiornamento dal menu (feature 004). Si lancia sul server di casa con `npm run publish`: costruisce il pacchetto Windows con electron-builder (zip, senza il passaggio rcedit di build.js, che sul server non ha wine), copia in ~/releases/camera-pip/ lo zip completo e il pacchetto del codice come app-<versione>.asar, e scrive per ultimo latest.json con versione, versione di Electron, impronta SHA-256 e nomi dei file. È il file che app-updater.js legge da https://home-server.tail6fec67.ts.net/ota/camera-pip/. Tiene solo le ultime tre versioni pubblicate, per non riempire il disco di zip da 100 MB.
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { version } = require('./package.json');

const RELEASES_FOLDER = path.join(os.homedir(), 'releases', 'camera-pip');
const VERSIONS_KEPT = 3;
const unpackedAsar = path.join(
  __dirname,
  'dist',
  'win-unpacked',
  'resources',
  'app.asar',
);
const zipName = `Camera-PiP-v${version}.zip`;
const asarName = `app-${version}.asar`;

function main() {
  execSync('npx electron-builder --win zip', {
    stdio: 'inherit',
    cwd: __dirname,
  });
  fs.mkdirSync(RELEASES_FOLDER, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'dist', zipName),
    path.join(RELEASES_FOLDER, zipName),
  );
  fs.copyFileSync(unpackedAsar, path.join(RELEASES_FOLDER, asarName));
  const latest = {
    version,
    electronVersion: readElectronVersion(),
    asarFile: asarName,
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(unpackedAsar))
      .digest('hex'),
    zipFile: zipName,
  };
  // Per ultimo, e con uno spostamento atomico: chi legge una versione nuova deve trovare il suo pacchetto già al suo posto
  const latestPath = path.join(RELEASES_FOLDER, 'latest.json');
  fs.writeFileSync(`${latestPath}.tmp`, JSON.stringify(latest, null, 2));
  fs.renameSync(`${latestPath}.tmp`, latestPath);
  removeOldVersions();
  console.log(`Pubblicata la ${version}: ${JSON.stringify(latest)}`);
}

// La versione esatta che electron-builder ha messo nello zip, non l'intervallo scritto in package.json
function readElectronVersion() {
  return require('electron/package.json').version;
}

function removeOldVersions() {
  const byVersion = (name) =>
    name
      .match(/(\d+)\.(\d+)\.(\d+)/)
      .slice(1)
      .map(Number);
  const compare = (left, right) => {
    const [a, b] = [byVersion(left), byVersion(right)];
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  };
  for (const prefix of ['app-', 'Camera-PiP-v']) {
    const files = fs
      .readdirSync(RELEASES_FOLDER)
      .filter((name) => name.startsWith(prefix) && /\d+\.\d+\.\d+/.test(name))
      .sort(compare);
    files
      .slice(0, Math.max(0, files.length - VERSIONS_KEPT))
      .forEach((name) => fs.rmSync(path.join(RELEASES_FOLDER, name)));
  }
}

main();

/**
 * Spedizione del diario al server di casa, lato processo main. Ogni trenta secondi manda all'endpoint /diari/ricevi di homelab-api, raggiungibile solo dalla tailnet, le righe nuove di ogni diario presente in logs/ (log-journal.js), a pezzi di righe intere. Non tiene nessuna memoria propria di cosa è già partito: a ogni pezzo il server risponde con quanti byte di quel file ha in mano, ed è quel numero a dire da dove ripartire. Così dopo una rete assente, un laptop in sospensione o un riavvio dell'app la spedizione riprende esattamente dal punto giusto, compresi i diari degli avvii precedenti, senza buchi né doppioni. Il diario sul disco resta l'originale e la coda d'attesa insieme: se il server non risponde non si perde niente, si riprova al giro dopo. Nel diario si annota solo quando l'invio si interrompe e quando riprende, non ogni tentativo.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { net } = require('electron');

const { getLogsFolder, listJournalNames, logLine } = require('./log-journal');

// Nome della macchina dentro la tailnet di Andrea: è l'unica strada, il server non è esposto altrove per questo endpoint
const RECEIVER_URL = 'https://home-server.tail6fec67.ts.net/diari/ricevi';
const APP_NAME = 'camera-pip';
const SHIPPING_INTERVAL_MS = 30000;
const CHUNK_MAX_BYTES = 256 * 1024; // il server rifiuta oltre 1 MB
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REQUESTS_PER_ROUND = 40; // dopo giorni offline si recupera in qualche giro, senza una raffica sola

const confirmedBytes = new Map(); // nome del file → byte che il server ha confermato di avere
let isShipping = false;
let isReceiverDown = false;

function startShipping() {
  shipRound();
  setInterval(shipRound, SHIPPING_INTERVAL_MS);
}

async function shipRound() {
  if (isShipping) {return;}
  isShipping = true;
  try {
    let requestsLeft = MAX_REQUESTS_PER_ROUND;
    for (const fileName of listJournalNames()) {
      requestsLeft = await shipJournal(fileName, requestsLeft);
      if (requestsLeft <= 0) {break;}
    }
    noteReceiverUp();
  } catch (error) {
    noteReceiverDown(error);
  } finally {
    isShipping = false;
  }
}

async function shipJournal(fileName, requestsLeft) {
  const filePath = path.join(getLogsFolder(), fileName);
  const size = fs.statSync(filePath).size;
  while (requestsLeft > 0) {
    const isKnown = confirmedBytes.has(fileName);
    const from = isKnown ? confirmedBytes.get(fileName) : 0;
    // Il primo contatto con un file è una domanda a vuoto, "quanto ne hai già?": mandare righe alla cieca rispedirebbe ogni diario vecchio a ogni avvio
    const chunk = isKnown
      ? await readWholeLines(filePath, from, size)
      : Buffer.alloc(0);
    // Niente di nuovo, oppure l'ultima riga è ancora a metà: se ne riparla al giro dopo
    if (isKnown && chunk.length === 0) {return requestsLeft;}
    requestsLeft -= 1;
    confirmedBytes.set(fileName, await sendChunk(fileName, from, chunk));
  }
  return requestsLeft;
}

// Il pezzo si taglia all'ultimo a capo: il server riceve solo righe intere, e un carattere accentato non viene mai spezzato a metà
async function readWholeLines(filePath, from, size) {
  const length = Math.min(Math.max(size - from, 0), CHUNK_MAX_BYTES);
  if (length === 0) {return Buffer.alloc(0);}
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, from);
    return buffer.subarray(0, buffer.lastIndexOf(0x0a) + 1);
  } finally {
    await handle.close();
  }
}

async function sendChunk(fileName, from, chunk) {
  const query = new URLSearchParams({
    app: APP_NAME,
    macchina: os.hostname(),
    file: fileName,
    da: String(from),
  });
  const response = await net.fetch(`${RECEIVER_URL}?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: chunk,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok)
    {throw new Error(
      `il server ha risposto ${response.status}: ${await response.text()}`,
    );}
  const { ricevuti } = await response.json();
  return ricevuti;
}

// Un laptop fuori casa o senza rete è la normalità, non un guasto: si annota il passaggio, una volta, e si riprova in silenzio
function noteReceiverDown(error) {
  if (isReceiverDown) {return;}
  isReceiverDown = true;
  logLine(
    'invio',
    `invio del diario al server interrotto, riprovo ogni ${SHIPPING_INTERVAL_MS / 1000}s: ${error?.message ?? error}`,
  );
}

function noteReceiverUp() {
  if (!isReceiverDown) {return;}
  isReceiverDown = false;
  logLine('invio', 'invio del diario al server ripreso');
}

module.exports = { startShipping };

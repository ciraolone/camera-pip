/**
 * Diario su file dell'app, lato processo main. Apre a ogni avvio un file
 * nuovo dentro la sottocartella logs/ dei dati utente, cancella i più vecchi
 * tenendo solo gli ultimi avvii e offre una sola funzione di scrittura
 * (logLine) che antepone data, ora e categoria al testo. Espone anche il path
 * della cartella, che serve alla voce di menu che la apre in Esplora risorse,
 * e l'elenco dei diari presenti, che legge chi li spedisce al server
 * (log-shipper.js).
 * È l'unico punto del progetto che scrive su disco righe di diagnostica: chi
 * vuole annotare qualcosa passa da qui, non apre file per conto suo. Non
 * decide mai cosa vale la pena annotare — quello è mestiere di
 * log-diagnostics.js.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_JOURNAL_FILES = 5; // avvii conservati, il più vecchio se ne va
const MAX_JOURNAL_BYTES = 20 * 1024 * 1024; // ~12 giorni di battiti continui

let journalPath = null;
let logsFolder = null;
let writtenBytes = 0;
let isJournalClosed = false;

function openJournal(userDataPath) {
  logsFolder = path.join(userDataPath, 'logs');
  fs.mkdirSync(logsFolder, { recursive: true });
  removeOldJournals();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  journalPath = path.join(logsFolder, `camera-pip-${stamp}.log`);
  writtenBytes = 0;
  isJournalClosed = false;
  return journalPath;
}

function getLogsFolder() {
  return logsFolder;
}

// Scrittura sincrona voluta: del diario servono soprattutto le ultime righe
// prima di un blocco, e un buffer in memoria è esattamente la parte che si
// perde quando il processo muore di schianto. A una riga ogni dieci secondi
// il costo di appendFileSync è invisibile.
function logLine(category, text) {
  if (!journalPath || isJournalClosed) {
    return;
  }
  const line = `${new Date().toISOString()} | ${category} | ${text}${os.EOL}`;
  try {
    fs.appendFileSync(journalPath, line);
    writtenBytes += Buffer.byteLength(line);
    if (writtenBytes >= MAX_JOURNAL_BYTES) {
      isJournalClosed = true;
      fs.appendFileSync(
        journalPath,
        `${new Date().toISOString()} | diario | file pieno, smetto di scrivere fino al prossimo avvio${os.EOL}`,
      );
    }
  } catch (error) {
    // Un diario che non riesce a scrivere non deve mai fermare l'app: si
    // chiude da solo e resta solo la console
    isJournalClosed = true;
    console.error('Diario: scrittura fallita, log disattivato', error);
  }
}

// I nomi contengono la data in formato ISO, quindi l'ordine alfabetico è già
// l'ordine cronologico: non serve leggere le date dal filesystem.
function listJournalNames() {
  return fs
    .readdirSync(logsFolder)
    .filter((name) => name.startsWith('camera-pip-') && name.endsWith('.log'))
    .sort();
}

function removeOldJournals() {
  const files = listJournalNames();
  const toRemove = files.slice(
    0,
    Math.max(0, files.length - (MAX_JOURNAL_FILES - 1)),
  );
  toRemove.forEach((name) =>
    fs.rmSync(path.join(logsFolder, name), { force: true }),
  );
}

module.exports = { openJournal, getLogsFolder, listJournalNames, logLine };

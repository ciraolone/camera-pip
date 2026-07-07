/**
 * Preload della finestra PiP: unico ponte fra renderer e main. Espone su
 * window.electronAPI un wrapper di ipcRenderer (send/receive/invoke) filtrato
 * da una whitelist rigida di canali: tutto ciò che non è in CHANNELS viene
 * ignorato o rifiutato. Se una feature introduce un canale IPC nuovo, va
 * aggiunto qui, altrimenti non passa.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Allowed IPC channels for security
const CHANNELS = {
  send: ['devices-updated', 'device-active', 'webcam-info-update', 'zoom-request', 'offset-request', 'auto-flip-state-changed'],
  receive: ['device-selected', 'settings-changed', 'webcam-info-toggled', 'webcam-info-data', 'zoom-changed', 'offset-changed', 'flip-changed', 'face-tracking-changed', 'face-tracking-tuning-changed'],
  invoke: ['get-settings', 'read-vendor-file']
};

// Secure IPC wrapper
const electronAPI = {
  // Send data to main process (varargs: set-level/set-position viaggiano con
  // direzione + valore, due argomenti)
  send: (channel, ...args) => {
    if (CHANNELS.send.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  // Receive data from main process
  receive: (channel, callback) => {
    if (CHANNELS.receive.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  // Invoke main process functions
  invoke: (channel, ...args) => {
    if (CHANNELS.invoke.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel ${channel} not allowed`));
  }
};

// Expose secure API to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

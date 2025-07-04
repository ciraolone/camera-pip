const { contextBridge, ipcRenderer } = require('electron');

// Esponi in modo sicuro le API di Electron al processo di rendering
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    // Canali autorizzati per l'invio
    let validChannels = ['devices-list'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    // Canali autorizzati per la ricezione
    let validChannels = ['select-device'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  invoke: (channel, ...args) => {
    // Canali autorizzati per invoke
    let validChannels = ['get-selected-device'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject('Canale non autorizzato');
  }
});

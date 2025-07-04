const { contextBridge, ipcRenderer } = require('electron');

// Esponi in modo sicuro le API di Electron al processo di rendering
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    // Canali autorizzati per l'invio
    let validChannels = ['devices-list', 'set-selected-device'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    // Canali autorizzati per la ricezione
    let validChannels = ['select-device', 'refresh-devices', 'settings-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  invoke: (channel, ...args) => {
    // Canali autorizzati per invoke
    let validChannels = ['get-selected-device', 'get-video-settings'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject('Canale non autorizzato');
  }
});

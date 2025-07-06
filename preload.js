const { contextBridge, ipcRenderer } = require('electron');

// Allowed IPC channels for security
const CHANNELS = {
  send: ['devices-updated', 'device-active', 'webcam-info-update'],
  receive: ['device-selected', 'settings-changed', 'webcam-info-toggled', 'webcam-info-data'],
  invoke: ['get-settings']
};

// Secure IPC wrapper
const electronAPI = {
  // Send data to main process
  send: (channel, data) => {
    if (CHANNELS.send.includes(channel)) {
      ipcRenderer.send(channel, data);
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

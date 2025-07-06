const { contextBridge, ipcRenderer } = require('electron');

// === CONSTANTS ===
const ALLOWED_SEND_CHANNELS = [
  'devices-list',
  'set-selected-device'
];

const ALLOWED_RECEIVE_CHANNELS = [
  'select-device',
  'refresh-devices',
  'settings-changed'
];

const ALLOWED_INVOKE_CHANNELS = [
  'get-selected-device',
  'get-video-settings'
];

/**
 * Valida se un canale è autorizzato per l'invio
 * @param {string} channel - Nome del canale
 * @returns {boolean} True se autorizzato
 */
function isValidSendChannel(channel) {
  const isValid = ALLOWED_SEND_CHANNELS.includes(channel);
  if (!isValid) {
    console.warn('Tentativo di invio su canale non autorizzato:', channel);
  }
  return isValid;
}

/**
 * Valida se un canale è autorizzato per la ricezione
 * @param {string} channel - Nome del canale
 * @returns {boolean} True se autorizzato
 */
function isValidReceiveChannel(channel) {
  const isValid = ALLOWED_RECEIVE_CHANNELS.includes(channel);
  if (!isValid) {
    console.warn('Tentativo di ricezione su canale non autorizzato:', channel);
  }
  return isValid;
}

/**
 * Valida se un canale è autorizzato per invoke
 * @param {string} channel - Nome del canale
 * @returns {boolean} True se autorizzato
 */
function isValidInvokeChannel(channel) {
  const isValid = ALLOWED_INVOKE_CHANNELS.includes(channel);
  if (!isValid) {
    console.warn('Tentativo di invoke su canale non autorizzato:', channel);
  }
  return isValid;
}

/**
 * Gestisce l'invio sicuro di dati al processo principale
 * @param {string} channel - Nome del canale
 * @param {any} data - Dati da inviare
 */
function secureSend(channel, data) {
  if (!isValidSendChannel(channel)) {
    console.error('Canale di invio non autorizzato:', channel);
    return;
  }

  try {
    ipcRenderer.send(channel, data);
  } catch (error) {
    console.error('Errore durante l\'invio:', error);
  }
}

/**
 * Gestisce la ricezione sicura di dati dal processo principale
 * @param {string} channel - Nome del canale
 * @param {Function} callback - Funzione di callback
 */
function secureReceive(channel, callback) {
  if (!isValidReceiveChannel(channel)) {
    console.error('Canale di ricezione non autorizzato:', channel);
    return;
  }

  if (typeof callback !== 'function') {
    console.error('Callback non valido per canale:', channel);
    return;
  }

  try {
    ipcRenderer.on(channel, (event, ...args) => {
      callback(...args);
    });
  } catch (error) {
    console.error('Errore durante la configurazione del listener:', error);
  }
}

/**
 * Gestisce l'invocazione sicura di funzioni nel processo principale
 * @param {string} channel - Nome del canale
 * @param {...any} args - Argomenti da passare
 * @returns {Promise<any>} Promessa con il risultato
 */
async function secureInvoke(channel, ...args) {
  if (!isValidInvokeChannel(channel)) {
    console.error('Canale di invocazione non autorizzato:', channel);
    return Promise.reject(new Error(`Canale non autorizzato: ${channel}`));
  }

  try {
    const result = await ipcRenderer.invoke(channel, ...args);
    return result;
  } catch (error) {
    console.error('Errore durante l\'invocazione:', error);
    throw error;
  }
}

// === CONTEXT BRIDGE SETUP ===

/**
 * Espone le API sicure al processo di rendering
 * Utilizza contextBridge per mantenere l'isolamento del contesto
 */
try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // Funzione per inviare dati al processo principale
    send: secureSend,

    // Funzione per ricevere dati dal processo principale
    receive: secureReceive,

    // Funzione per invocare funzioni nel processo principale
    invoke: secureInvoke,

    // Funzioni di utilità per debugging (solo in sviluppo)
    debug: {
      getAllowedChannels: () => ({
        send: ALLOWED_SEND_CHANNELS,
        receive: ALLOWED_RECEIVE_CHANNELS,
        invoke: ALLOWED_INVOKE_CHANNELS
      })
    }
  });

} catch (error) {
  console.error('Errore durante l\'esposizione delle API:', error);
}

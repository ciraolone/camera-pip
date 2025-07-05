// === CONSTANTS ===
const VIDEO_ELEMENT_ID = 'webcam';
const CAMERA_PERMISSION_RETRY_DELAY = 2000; // 2 secondi
const MAX_RETRY_ATTEMPTS = 3;

// === GLOBAL VARIABLES ===
let videoElement;
let currentVideoStream = null;
let currentDeviceId = null;
let retryAttempts = 0;
let isInitialized = false;

// === INITIALIZATION ===

/**
 * Inizializza l'applicazione renderer
 * Configura gli elementi DOM e avvia la webcam
 */
async function initializeRenderer() {
  console.log('🎬 Inizializzazione renderer...');

  try {
    // Ottieni riferimento all'elemento video
    videoElement = document.getElementById(VIDEO_ELEMENT_ID);

    if (!videoElement) {
      throw new Error(`Elemento video con ID '${VIDEO_ELEMENT_ID}' non trovato`);
    }

    console.log('📹 Elemento video trovato e configurato');

    // Configura i gestori di eventi
    setupEventHandlers();

    // Avvia la webcam con le impostazioni salvate
    await startWebcamWithSavedSettings();

    // Ottieni e invia la lista dei dispositivi al processo principale
    await requestAndSendDevicesList();

    isInitialized = true;
    console.log('✅ Renderer inizializzato con successo');

  } catch (error) {
    console.error('❌ Errore durante l\'inizializzazione del renderer:', error);
    showErrorMessage('Errore durante l\'inizializzazione dell\'applicazione');
  }
}

/**
 * Configura tutti i gestori di eventi per la comunicazione con il processo principale
 */
function setupEventHandlers() {
  console.log('🔧 Configurazione gestori eventi...');

  try {
    // Evento per cambiare dispositivo
    window.electronAPI.receive('select-device', handleDeviceSelectionFromMain);

    // Evento per aggiornare la lista dei dispositivi
    window.electronAPI.receive('refresh-devices', handleDevicesRefreshRequest);

    // Evento per applicare nuove impostazioni video
    window.electronAPI.receive('settings-changed', handleVideoSettingsChange);

    // Configura gestori eventi per l'elemento video
    if (videoElement) {
      videoElement.addEventListener('loadstart', () => {
        console.log('📹 Inizio caricamento video stream');
      });

      videoElement.addEventListener('loadedmetadata', () => {
        console.log('📹 Metadati video caricati');
        console.log(`📐 Dimensioni video: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
      });

      videoElement.addEventListener('error', (error) => {
        console.error('❌ Errore elemento video:', error);
      });
    }

    console.log('✅ Gestori eventi configurati');

  } catch (error) {
    console.error('❌ Errore durante la configurazione dei gestori eventi:', error);
  }
}

/**
 * Avvia la webcam utilizzando le impostazioni salvate
 */
async function startWebcamWithSavedSettings() {
  console.log('🚀 Avvio webcam con impostazioni salvate...');

  try {
    // Ottieni il dispositivo salvato
    const savedDeviceId = await window.electronAPI.invoke('get-selected-device');
    console.log('📷 Dispositivo salvato:', savedDeviceId || 'Nessuno');

    // Avvia il video con il dispositivo salvato (o default se nessuno)
    await startVideoStream(savedDeviceId);

  } catch (error) {
    console.error('❌ Errore durante l\'avvio della webcam:', error);
    await handleWebcamError(error);
  }
}

// === VIDEO STREAM MANAGEMENT ===

/**
 * Avvia lo stream video con il dispositivo specificato
 * @param {string|null} deviceId - ID del dispositivo da utilizzare (null per default)
 */
async function startVideoStream(deviceId) {
  console.log('🎥 Avvio stream video...');
  console.log('📷 Dispositivo richiesto:', deviceId || 'Default');

  try {
    // Ferma lo stream corrente se attivo
    await stopCurrentVideoStream();

    // Ottieni le impostazioni video correnti
    const videoSettings = await getVideoSettings();
    console.log('⚙️ Impostazioni video:', videoSettings);

    // Crea i constraints per getUserMedia
    const constraints = createVideoConstraints(deviceId, videoSettings);
    console.log('📋 Constraints video:', constraints);

    // Richiedi accesso alla webcam
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('✅ Stream video ottenuto con successo');

    // Applica lo stream all'elemento video
    videoElement.srcObject = stream;
    currentVideoStream = stream;
    currentDeviceId = deviceId;

    // Reset del contatore di retry
    retryAttempts = 0;

    console.log('📹 Stream video avviato con successo');

  } catch (error) {
    console.error('❌ Errore durante l\'avvio dello stream video:', error);
    await handleWebcamError(error);
  }
}

/**
 * Ferma lo stream video corrente
 */
async function stopCurrentVideoStream() {
  if (!currentVideoStream) {
    console.log('🔇 Nessuno stream video attivo da fermare');
    return;
  }

  console.log('🛑 Fermando stream video corrente...');

  try {
    // Ferma tutte le tracce dello stream
    currentVideoStream.getTracks().forEach(track => {
      console.log(`🔇 Fermando traccia: ${track.kind} (${track.label})`);
      track.stop();
    });

    // Pulisci i riferimenti
    currentVideoStream = null;
    if (videoElement) {
      videoElement.srcObject = null;
    }

    console.log('✅ Stream video fermato con successo');

  } catch (error) {
    console.error('❌ Errore durante l\'arresto dello stream video:', error);
  }
}

/**
 * Ottiene le impostazioni video correnti dal processo principale
 * @returns {Promise<Object>} Oggetto con risoluzione e fps
 */
async function getVideoSettings() {
  try {
    const settings = await window.electronAPI.invoke('get-video-settings');
    console.log('📊 Impostazioni video ottenute:', settings);
    return settings;
  } catch (error) {
    console.error('❌ Errore durante il recupero delle impostazioni video:', error);
    // Restituisci impostazioni predefinite
    return {
      resolution: '1920x1080',
      fps: 60
    };
  }
}

/**
 * Crea i constraints per getUserMedia basati sulle impostazioni
 * @param {string|null} deviceId - ID del dispositivo
 * @param {Object} videoSettings - Impostazioni video (risoluzione e fps)
 * @returns {Object} Constraints per getUserMedia
 */
function createVideoConstraints(deviceId, videoSettings) {
  console.log('🔧 Creazione constraints video...');

  // Parsing della risoluzione
  const [width, height] = videoSettings.resolution.split('x').map(Number);

  const constraints = {
    video: {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: videoSettings.fps }
    }
  };

  // Aggiungi device ID se specificato
  if (deviceId) {
    constraints.video.deviceId = { exact: deviceId };
    console.log('📷 Dispositivo specifico richiesto:', deviceId);
  } else {
    console.log('📷 Utilizzo dispositivo predefinito');
  }

  return constraints;
}

/**
 * Gestisce gli errori della webcam con retry automatico
 * @param {Error} error - Errore da gestire
 */
async function handleWebcamError(error) {
  console.error('🚨 Gestione errore webcam:', error.message);

  // Analizza il tipo di errore
  if (error.name === 'NotFoundError' || error.name === 'DeviceNotFoundError') {
    console.error('📷 Dispositivo non trovato');
    showErrorMessage('Dispositivo webcam non trovato');

  } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    console.error('🔒 Permesso negato per la webcam');
    showErrorMessage('Permesso negato per accedere alla webcam');

  } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    console.error('📹 Webcam in uso da un\'altra applicazione');
    showErrorMessage('Webcam già in uso da un\'altra applicazione');

  } else if (error.name === 'OverconstrainedError') {
    console.error('⚙️ Impostazioni video non supportate');
    await retryWithFallbackSettings();

  } else {
    console.error('❓ Errore webcam sconosciuto:', error);
    await retryConnection();
  }
}

/**
 * Ritenta la connessione con impostazioni di fallback
 */
async function retryWithFallbackSettings() {
  console.log('🔄 Retry con impostazioni di fallback...');

  try {
    // Usa impostazioni più conservative
    const fallbackConstraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    };

    if (currentDeviceId) {
      fallbackConstraints.video.deviceId = { exact: currentDeviceId };
    }

    const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    videoElement.srcObject = stream;
    currentVideoStream = stream;

    console.log('✅ Connessione riuscita con impostazioni di fallback');

  } catch (fallbackError) {
    console.error('❌ Errore anche con impostazioni di fallback:', fallbackError);
    await retryConnection();
  }
}

/**
 * Ritenta la connessione con delay
 */
async function retryConnection() {
  if (retryAttempts >= MAX_RETRY_ATTEMPTS) {
    console.error('❌ Raggiunto numero massimo di tentativi di riconnessione');
    showErrorMessage('Impossibile connettersi alla webcam dopo diversi tentativi');
    return;
  }

  retryAttempts++;
  console.log(`🔄 Tentativo di riconnessione ${retryAttempts}/${MAX_RETRY_ATTEMPTS}...`);

  await new Promise(resolve => setTimeout(resolve, CAMERA_PERMISSION_RETRY_DELAY));

  try {
    await startVideoStream(currentDeviceId);
  } catch (error) {
    console.error('❌ Errore durante il retry:', error);
    await handleWebcamError(error);
  }
}

/**
 * Mostra un messaggio di errore all'utente
 * @param {string} message - Messaggio da mostrare
 */
function showErrorMessage(message) {
  console.log('📢 Mostrando messaggio di errore:', message);

  // Crea un elemento di errore se non esiste
  let errorElement = document.getElementById('error-message');
  if (!errorElement) {
    errorElement = document.createElement('div');
    errorElement.id = 'error-message';
    errorElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      font-family: Arial, sans-serif;
      font-size: 16px;
      z-index: 1000;
      max-width: 300px;
    `;
    document.body.appendChild(errorElement);
  }

  errorElement.textContent = message;
  errorElement.style.display = 'block';

  // Nascondi il messaggio dopo 5 secondi
  setTimeout(() => {
    if (errorElement) {
      errorElement.style.display = 'none';
    }
  }, 5000);
}

// === DEVICE MANAGEMENT ===

/**
 * Richiede la lista dei dispositivi e la invia al processo principale
 */
async function requestAndSendDevicesList() {
  console.log('📋 Richiesta lista dispositivi...');

  try {
    // Prima richiedi il permesso per la webcam
    await requestCameraPermission();

    // Ottieni la lista dei dispositivi
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log(`📱 Dispositivi totali trovati: ${devices.length}`);

    // Filtra e serializza i dispositivi (solo proprietà necessarie)
    const serializedDevices = devices.map(device => ({
      deviceId: device.deviceId,
      kind: device.kind,
      label: device.label || `Dispositivo ${device.deviceId.substring(0, 8)}`,
      groupId: device.groupId
    }));

    // Conta i dispositivi video
    const videoDevices = serializedDevices.filter(device => device.kind === 'videoinput');
    console.log(`📹 Dispositivi video trovati: ${videoDevices.length}`);

    // Log dettagliato dei dispositivi video
    videoDevices.forEach((device, index) => {
      console.log(`📷 Dispositivo ${index + 1}: ${device.label} (${device.deviceId})`);
    });

    // Invia la lista al processo principale
    window.electronAPI.send('devices-list', serializedDevices);
    console.log('📡 Lista dispositivi inviata al processo principale');

  } catch (error) {
    console.error('❌ Errore durante la richiesta dei dispositivi:', error);
    await handleDeviceListError(error);
  }
}

/**
 * Richiede il permesso per la telecamera
 */
async function requestCameraPermission() {
  console.log('🔐 Richiesta permesso telecamera...');

  try {
    // Richiedi permesso con constraints minimal
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    // Ferma immediatamente lo stream (era solo per il permesso)
    stream.getTracks().forEach(track => track.stop());

    console.log('✅ Permesso telecamera ottenuto');

  } catch (error) {
    console.error('❌ Errore durante la richiesta del permesso:', error);
    throw error;
  }
}

/**
 * Gestisce gli errori durante la richiesta della lista dispositivi
 * @param {Error} error - Errore da gestire
 */
async function handleDeviceListError(error) {
  console.error('🚨 Gestione errore lista dispositivi:', error.message);

  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    console.error('🔒 Permesso negato per enumerare i dispositivi');
    showErrorMessage('Permesso negato per accedere ai dispositivi multimediali');

    // Invia una lista vuota al processo principale
    window.electronAPI.send('devices-list', []);

  } else {
    console.error('❓ Errore sconosciuto durante l\'enumerazione dei dispositivi');

    // Retry dopo un delay
    setTimeout(() => {
      console.log('🔄 Retry richiesta lista dispositivi...');
      requestAndSendDevicesList();
    }, CAMERA_PERMISSION_RETRY_DELAY);
  }
}

// === EVENT HANDLERS ===

/**
 * Gestisce la selezione di un dispositivo dal processo principale
 * @param {string} deviceId - ID del dispositivo selezionato
 */
function handleDeviceSelectionFromMain(deviceId) {
  console.log('🎯 Richiesta cambio dispositivo dal menu:', deviceId);

  if (!deviceId) {
    console.warn('⚠️ ID dispositivo vuoto ricevuto');
    return;
  }

  // Avvia lo stream con il nuovo dispositivo
  startVideoStream(deviceId);
}

/**
 * Gestisce la richiesta di aggiornamento della lista dispositivi
 */
function handleDevicesRefreshRequest() {
  console.log('🔄 Richiesta aggiornamento lista dispositivi dal processo principale');
  requestAndSendDevicesList();
}

/**
 * Gestisce il cambio delle impostazioni video
 */
function handleVideoSettingsChange() {
  console.log('⚙️ Cambio impostazioni video rilevato');

  if (!isInitialized) {
    console.warn('⚠️ Renderer non ancora inizializzato, ignoro cambio impostazioni');
    return;
  }

  // Riavvia lo stream con le nuove impostazioni
  console.log('🔄 Riavvio stream con nuove impostazioni...');
  startVideoStream(currentDeviceId);
}

// === UTILITY FUNCTIONS ===

/**
 * Controlla se l'API getUserMedia è supportata
 * @returns {boolean} True se supportata
 */
function isGetUserMediaSupported() {
  const isSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  console.log('🔍 Supporto getUserMedia:', isSupported ? 'Sì' : 'No');
  return isSupported;
}

/**
 * Ottiene informazioni sul browser corrente
 * @returns {Object} Informazioni sul browser
 */
function getBrowserInfo() {
  const userAgent = navigator.userAgent;
  const info = {
    userAgent: userAgent,
    isChrome: /Chrome/.test(userAgent),
    isFirefox: /Firefox/.test(userAgent),
    isEdge: /Edge/.test(userAgent),
    isSafari: /Safari/.test(userAgent) && !/Chrome/.test(userAgent)
  };

  console.log('🌐 Info browser:', info);
  return info;
}

// === INITIALIZATION AND STARTUP ===

/**
 * Funzione di avvio principale del renderer
 * Viene eseguita quando il DOM è caricato
 */
function startApplication() {
  console.log('🚀 Avvio applicazione renderer...');

  // Controlla il supporto delle API necessarie
  if (!isGetUserMediaSupported()) {
    console.error('❌ API getUserMedia non supportata');
    showErrorMessage('Il tuo browser non supporta l\'accesso alla webcam');
    return;
  }

  // Log informazioni del browser
  getBrowserInfo();

  // Inizializza il renderer
  initializeRenderer();
}

// === STARTUP ===

// Avvia l'applicazione quando il DOM è caricato
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApplication);
} else {
  startApplication();
}

console.log('🎬 Script renderer.js caricato, in attesa del DOM...');

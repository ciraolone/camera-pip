const { app, BrowserWindow, Menu, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const windowStateKeeper = require('electron-window-state');

// === CONSTANTS ===
const APP_TITLE = 'Ciraolone';
const DEFAULT_WINDOW_WIDTH = 800;
const DEFAULT_WINDOW_HEIGHT = 600;
const DEFAULT_RESOLUTION = '1920x1080';
const DEFAULT_FPS = 60;

// === GLOBAL VARIABLES ===
let applicationStore;
let mainApplicationWindow;
let currentVideoDevices = [];

// === CONFIGURATION CONSTANTS ===
const SUPPORTED_RESOLUTIONS = [
  { label: '1080p (1920x1080)', resolution: '1920x1080' },
  { label: '720p (1280x720)', resolution: '1280x720' },
  { label: '480p (640x480)', resolution: '640x480' },
];

const SUPPORTED_FPS_OPTIONS = [
  { label: '60 FPS', fps: 60 },
  { label: '30 FPS', fps: 30 },
];

/**
 * Crea e configura la finestra principale dell'applicazione
 * Gestisce il ripristino dello stato della finestra (posizione e dimensioni)
 */
function createMainWindow() {

  try {
    // Carica lo stato precedente della finestra
    const windowState = windowStateKeeper({
      defaultWidth: DEFAULT_WINDOW_WIDTH,
      defaultHeight: DEFAULT_WINDOW_HEIGHT
    });


    // Crea la finestra con configurazioni di sicurezza
    mainApplicationWindow = new BrowserWindow({
      title: APP_TITLE,
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,     // Sicurezza: disabilita Node.js nel renderer
        contextIsolation: true,     // Sicurezza: isola il contesto
        enableRemoteModule: false,  // Sicurezza aggiuntiva
        webSecurity: true          // Sicurezza web
      }
    });

    // Gestisci automaticamente lo stato della finestra
    windowState.manage(mainApplicationWindow);

    // Carica l'interfaccia utente
    mainApplicationWindow.loadFile('index.html');


    // Gestisci eventi della finestra
    setupWindowEventHandlers();

  } catch (error) {
    console.error('Errore durante la creazione della finestra:', error);
    throw error;
  }
}

/**
 * Configura i gestori di eventi per la finestra principale
 */
function setupWindowEventHandlers() {
  if (!mainApplicationWindow) {
    return;
  }

  // Evento quando la finestra è pronta
  mainApplicationWindow.webContents.once('dom-ready', () => {
    // DOM pronto
  });

  // Evento di chiusura finestra
  mainApplicationWindow.on('closed', () => {
    mainApplicationWindow = null;
  });

  // Gestione errori di caricamento
  mainApplicationWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    // Errore di caricamento
  });
}

/**
 * Ottiene le impostazioni video correnti dallo store
 * @returns {Object} Oggetto con risoluzione e fps
 */
function getCurrentVideoSettings() {
  if (!applicationStore) {
    console.warn('Store non disponibile, utilizzo impostazioni predefinite');
    return {
      resolution: DEFAULT_RESOLUTION,
      fps: DEFAULT_FPS
    };
  }

  const settings = {
    resolution: applicationStore.get('selectedResolution', DEFAULT_RESOLUTION),
    fps: applicationStore.get('selectedFps', DEFAULT_FPS)
  };

  return settings;
}

/**
 * Ottiene l'ID del dispositivo selezionato dallo store
 * @returns {string|null} ID del dispositivo o null se non selezionato
 */
function getSelectedDeviceId() {
  if (!applicationStore) {
    console.warn('Store non disponibile per ottenere dispositivo selezionato');
    return null;
  }

  const deviceId = applicationStore.get('selectedDeviceId');
  return deviceId;
}

/**
 * Salva l'ID del dispositivo selezionato nello store
 * @param {string} deviceId - ID del dispositivo da salvare
 */
function saveSelectedDeviceId(deviceId) {
  if (!applicationStore) {
    console.error('Store non disponibile per salvare dispositivo');
    return;
  }

  if (!deviceId) {
    console.warn('Tentativo di salvare dispositivo vuoto');
    return;
  }

  applicationStore.set('selectedDeviceId', deviceId);
}

/**
 * Salva le impostazioni video nello store
 * @param {string} resolution - Risoluzione video
 * @param {number} fps - Frame rate
 */
function saveVideoSettings(resolution, fps) {
  if (!applicationStore) {
    console.error('Store non disponibile per salvare impostazioni video');
    return;
  }

  if (resolution) {
    applicationStore.set('selectedResolution', resolution);
  }

  if (fps) {
    applicationStore.set('selectedFps', fps);
  }
}

/**
 * Crea il menu dell'applicazione con le opzioni per telecamere e impostazioni
 * @param {Array} videoDevices - Array di dispositivi video disponibili
 */
function createApplicationMenu(videoDevices = []) {

  try {
    const selectedDeviceId = getSelectedDeviceId();
    const currentSettings = getCurrentVideoSettings();

    // Crea sottomenu per dispositivi video
    const deviceSubmenu = createDeviceSubmenu(videoDevices, selectedDeviceId);

    // Crea sottomenu per impostazioni video
    const videoSettingsSubmenu = createVideoSettingsSubmenu(currentSettings);

    // Definisci la struttura del menu principale
    const menuTemplate = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Esci',
            role: 'quit',
            accelerator: 'CmdOrCtrl+Q'
          }
        ]
      },
      {
        label: 'Visualizza',
        submenu: [
          {
            label: 'Ricarica',
            role: 'reload',
            accelerator: 'CmdOrCtrl+R'
          },
          {
            label: 'Ricarica forzata',
            role: 'forceReload',
            accelerator: 'CmdOrCtrl+Shift+R'
          },
          { type: 'separator' },
          {
            label: 'Strumenti sviluppo',
            role: 'toggleDevTools',
            accelerator: 'F12'
          }
        ]
      },
      {
        label: 'Seleziona Telecamera',
        submenu: deviceSubmenu
      },
      {
        label: 'Impostazioni Video',
        submenu: videoSettingsSubmenu
      }
    ];

    // Costruisci e imposta il menu
    const applicationMenu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(applicationMenu);


  } catch (error) {
    console.error('Errore durante la creazione del menu:', error);
    // Crea un menu di base in caso di errore
    createBasicMenu();
  }
}

/**
 * Crea il sottomenu per la selezione dei dispositivi
 * @param {Array} videoDevices - Array di dispositivi video
 * @param {string} selectedDeviceId - ID del dispositivo attualmente selezionato
 * @returns {Array} Array di elementi del menu
 */
function createDeviceSubmenu(videoDevices, selectedDeviceId) {
  if (!videoDevices || videoDevices.length === 0) {
    return [{ label: 'Nessuna telecamera trovata', enabled: false }];
  }

  return videoDevices.map(device => {
    const deviceLabel = device.label || `Telecamera ${device.deviceId.substring(0, 8)}...`;
    const isSelected = device.deviceId === selectedDeviceId;

    return {
      label: deviceLabel,
      type: 'radio',
      checked: isSelected,
      click: () => handleDeviceSelection(device.deviceId)
    };
  });
}

/**
 * Gestisce la selezione di un dispositivo video
 * @param {string} deviceId - ID del dispositivo selezionato
 */
function handleDeviceSelection(deviceId) {
  try {
    // Salva la selezione
    saveSelectedDeviceId(deviceId);

    // Invia al renderer per cambiare il dispositivo
    if (mainApplicationWindow && mainApplicationWindow.webContents) {
      mainApplicationWindow.webContents.send('select-device', deviceId);
    }
  } catch (error) {
    // Errore durante la selezione
  }
}

/**
 * Crea il sottomenu per le impostazioni video
 * @param {Object} currentSettings - Impostazioni video correnti
 * @returns {Array} Array di elementi del menu
 */
function createVideoSettingsSubmenu(currentSettings) {

  const resolutionSubmenu = SUPPORTED_RESOLUTIONS.map(res => ({
    label: res.label,
    type: 'radio',
    checked: res.resolution === currentSettings.resolution,
    click: () => handleResolutionChange(res.resolution)
  }));

  const fpsSubmenu = SUPPORTED_FPS_OPTIONS.map(opt => ({
    label: opt.label,
    type: 'radio',
    checked: opt.fps === currentSettings.fps,
    click: () => handleFpsChange(opt.fps)
  }));

  return [
    {
      label: 'Risoluzione',
      submenu: resolutionSubmenu
    },
    {
      label: 'Frame Rate',
      submenu: fpsSubmenu
    }
  ];
}

/**
 * Gestisce il cambio di risoluzione
 * @param {string} resolution - Nuova risoluzione selezionata
 */
function handleResolutionChange(resolution) {
  try {
    saveVideoSettings(resolution, null);
    notifySettingsChanged();

    // Aggiorna il menu per riflettere le nuove impostazioni
    createApplicationMenu(currentVideoDevices);
  } catch (error) {
    // Errore durante il cambio risoluzione
  }
}

/**
 * Gestisce il cambio di frame rate
 * @param {number} fps - Nuovo frame rate selezionato
 */
function handleFpsChange(fps) {
  try {
    saveVideoSettings(null, fps);
    notifySettingsChanged();

    // Aggiorna il menu per riflettere le nuove impostazioni
    createApplicationMenu(currentVideoDevices);
  } catch (error) {
    // Errore durante il cambio frame rate
  }
}

/**
 * Notifica al renderer che le impostazioni sono cambiate
 */
function notifySettingsChanged() {
  if (mainApplicationWindow && mainApplicationWindow.webContents) {
    mainApplicationWindow.webContents.send('settings-changed');
  }
}

/**
 * Crea un menu di base in caso di errore
 */
function createBasicMenu() {
  const basicMenuTemplate = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'Visualizza',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    }
  ];

  const basicMenu = Menu.buildFromTemplate(basicMenuTemplate);
  Menu.setApplicationMenu(basicMenu);
}

/**
 * Configura tutti i gestori IPC (Inter-Process Communication)
 * Questi gestori permettono la comunicazione tra main process e renderer process
 */
function setupIpcHandlers() {
  try {
    // Gestisci la lista dei dispositivi ricevuta dal renderer
    ipcMain.on('devices-list', handleDevicesListReceived);

    // Gestisci richieste per ottenere il dispositivo selezionato
    ipcMain.handle('get-selected-device', handleGetSelectedDevice);

    // Gestisci richieste per ottenere le impostazioni video
    ipcMain.handle('get-video-settings', handleGetVideoSettings);
  } catch (error) {
    throw error;
  }
}

/**
 * Gestisce la ricezione della lista dei dispositivi dal renderer
 * @param {Event} event - Evento IPC
 * @param {Array} devices - Array di dispositivi ricevuti
 */
function handleDevicesListReceived(event, devices) {
  try {
    if (!devices || !Array.isArray(devices)) {
      currentVideoDevices = [];
      createApplicationMenu([]);
      return;
    }

    // Filtra solo i dispositivi video
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    // Aggiorna la cache globale
    currentVideoDevices = videoDevices;

    // Aggiorna il menu con i nuovi dispositivi
    createApplicationMenu(videoDevices);

    // Log dettagliato dei dispositivi
    videoDevices.forEach((device, index) => {
      // Dispositivo disponibile
    });
  } catch (error) {
    // Errore durante la gestione della lista dispositivi
  }
}

/**
 * Gestisce la richiesta di ottenere il dispositivo selezionato
 * @param {Event} event - Evento IPC
 * @returns {Promise<string|null>} ID del dispositivo selezionato
 */
async function handleGetSelectedDevice(event) {

  try {
    const selectedDeviceId = getSelectedDeviceId();
    return selectedDeviceId;

  } catch (error) {
    console.error('Errore durante il recupero del dispositivo selezionato:', error);
    return null;
  }
}

/**
 * Gestisce la richiesta di ottenere le impostazioni video
 * @param {Event} event - Evento IPC
 * @returns {Promise<Object>} Oggetto con le impostazioni video
 */
async function handleGetVideoSettings(event) {

  try {
    const settings = getCurrentVideoSettings();
    return settings;

  } catch (error) {
    console.error('Errore durante il recupero delle impostazioni video:', error);
    return {
      resolution: DEFAULT_RESOLUTION,
      fps: DEFAULT_FPS
    };
  }
}

/**
 * Richiede i permessi della telecamera per macOS
 * Su Windows i permessi sono gestiti automaticamente dal browser
 * @returns {Promise<boolean>} True se i permessi sono stati concessi
 */
async function requestCameraPermissions() {

  // Solo su macOS è necessario richiedere esplicitamente i permessi
  if (process.platform !== 'darwin') {
    return true;
  }


  try {
    const cameraAccess = await systemPreferences.askForMediaAccess('camera');

    if (cameraAccess) {
      return true;
    } else {
      return false;
    }

  } catch (error) {
    console.error('Errore durante la richiesta dei permessi:', error);
    return false;
  }
}

/**
 * Inizializza l'applicazione con tutti i componenti necessari
 */
async function initializeApplication() {

  try {
    // Inizializza lo store per le impostazioni
    await initializeStore();

    // Configura i gestori IPC
    setupIpcHandlers();

    // Richiedi i permessi della telecamera (solo su macOS)
    const hasPermissions = await requestCameraPermissions();
    if (!hasPermissions) {
      app.quit();
      return;
    }

    // Crea il menu iniziale
    createApplicationMenu();

    // Crea la finestra principale
    createMainWindow();


  } catch (error) {
    console.error('Errore critico durante l\'inizializzazione:', error);
    app.quit();
  }
}

/**
 * Inizializza lo store per le impostazioni persistenti
 */
async function initializeStore() {
  try {
    // Importa dynamicamente electron-store (ES module)
    const { default: Store } = await import('electron-store');
    applicationStore = new Store();

    // Log delle impostazioni correnti
    const currentSettings = getCurrentVideoSettings();
    const selectedDevice = getSelectedDeviceId();
  } catch (error) {
    throw error;
  }
}

/**
 * Gestisce la chiusura dell'applicazione
 */
function handleApplicationShutdown() {
  // Su macOS, le app tipicamente restano attive anche quando tutte le finestre sono chiuse
  if (process.platform !== 'darwin') {
    app.quit();
  }
}

/**
 * Gestisce la riattivazione dell'applicazione (principalmente per macOS)
 */
function handleApplicationActivation() {
  // Su macOS è comune ricreare una finestra quando l'icona nel dock viene cliccata
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
}

// === EVENT HANDLERS ===

/**
 * Gestisce l'evento 'ready' dell'applicazione
 * Viene chiamato quando Electron ha terminato l'inizializzazione
 */
app.whenReady().then(() => {
  initializeApplication();
});

/**
 * Gestisce l'evento 'window-all-closed'
 * Viene chiamato quando tutte le finestre sono state chiuse
 */
app.on('window-all-closed', () => {
  handleApplicationShutdown();
});

/**
 * Gestisce l'evento 'activate' dell'applicazione
 * Viene chiamato quando l'applicazione viene riattivata (principalmente su macOS)
 */
app.on('activate', () => {
  handleApplicationActivation();
});

/**
 * Gestisce l'evento 'before-quit' dell'applicazione
 * Viene chiamato prima che l'applicazione si chiuda
 */
app.on('before-quit', () => {
  // Cleanup eventuali risorse
  if (mainApplicationWindow) {
    // Cleanup finestra principale
  }
});

/**
 * Gestisce gli errori non catturati nell'applicazione
 */
process.on('uncaughtException', (error) => {
  // In produzione, potresti voler terminare l'applicazione
  // app.quit();
});

/**
 * Gestisce le promise rejections non gestite
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Promise rejection non gestita:', reason);
  console.error('Promise:', promise);
});

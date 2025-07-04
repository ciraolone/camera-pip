const { app, BrowserWindow, Menu, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const windowStateKeeper = require('electron-window-state');

let store;
let mainWindow;

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 600
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // using a preload script is a good practice
      nodeIntegration: false, // è più sicuro
      contextIsolation: true, // è più sicuro
    }
  });

  mainWindowState.manage(mainWindow);

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools(); // Apri DevTools all'avvio per debug
}

// Funzione per creare/aggiornare il menu dell'applicazione
function createMenu(videoDevices = []) {
  const selectedDeviceId = store.get('selectedDeviceId');
  console.log('Dispositivo salvato per il menu:', selectedDeviceId);

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Seleziona Camera',
      submenu: videoDevices.length > 0 ? videoDevices.map(device => {
        return {
          label: device.label || `Camera ${device.deviceId.substring(0, 8)}...`,
          type: 'radio',
          checked: device.deviceId === selectedDeviceId,
          click: () => {
            // Salva direttamente e invia al renderer
            store.set('selectedDeviceId', device.deviceId);
            mainWindow.webContents.send('select-device', device.deviceId);
          }
        };
      }) : [{ label: 'Nessuna camera trovata', enabled: false }]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  const { default: Store } = await import('electron-store');
  store = new Store();

  // Crea il menu iniziale prima della creazione della finestra
  createMenu();

  // Gestione della richiesta dei dispositivi dal renderer
  ipcMain.on('devices-list', (event, devices) => {
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    // Aggiorna il menu con i dispositivi disponibili
    createMenu(videoDevices);
  });

  ipcMain.handle('get-selected-device', async () => {
    return store.get('selectedDeviceId');
  });

  // Su Windows, la richiesta di permesso è gestita dal browser, ma su macOS è necessaria.
  // Questa chiamata assicura la compatibilità e gestisce i permessi a livello di sistema operativo.
  if (process.platform === 'darwin') { // Specifica per macOS
    const cameraAccess = await systemPreferences.askForMediaAccess('camera');
    if (!cameraAccess) {
      console.log("Accesso alla camera negato dall'utente.");
      app.quit();
      return;
    }
  }

  // Crea la finestra solo dopo che lo store e gli handler IPC sono pronti
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

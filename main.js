const { app, BrowserWindow, Menu, ipcMain, systemPreferences } = require('electron');
const path = require('path');

let store;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // using a preload script is a good practice
      nodeIntegration: false, // è più sicuro
      contextIsolation: true, // è più sicuro
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools(); // Apri DevTools all'avvio per debug
}

app.whenReady().then(async () => {
  const { default: Store } = await import('electron-store');
  store = new Store();

  // Gestione della richiesta dei dispositivi dal renderer
  ipcMain.on('devices-list', (event, devices) => {
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const selectedDeviceId = store.get('selectedDeviceId');

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
              mainWindow.webContents.send('select-device', device.deviceId);
            }
          };
        }) : [{ label: 'Nessuna camera trovata', enabled: false }]
      }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
  });

  ipcMain.on('set-selected-device', (event, deviceId) => {
    store.set('selectedDeviceId', deviceId);
    // Ricarica il menu per mostrare la selezione corrente
    const devices = store.get('devices'); // Assumendo che i device siano stati salvati
    if (devices) {
      // Codice per rigenerare il menu omesso per brevità, 
      // la logica in 'devices-list' viene già rieseguita quando si ricarica la lista
    }
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

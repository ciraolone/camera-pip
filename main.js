const { app, BrowserWindow, Menu, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const windowStateKeeper = require('electron-window-state');

// Constants
const APP_CONFIG = {
  title: 'Ciraolone',
  defaultWidth: 800,
  defaultHeight: 600,
  defaultResolution: 'default',
  defaultFps: 'default'
};

const RESOLUTIONS = [
  { label: 'Default', value: 'default' },
  { label: '4K (3840x2160)', value: '3840x2160' },
  { label: '1080p (1920x1080)', value: '1920x1080' },
  { label: '720p (1280x720)', value: '1280x720' },
  { label: '480p (640x480)', value: '640x480' },
  { label: '360p (640x360)', value: '640x360' }
];

const FPS_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: '60 FPS', value: 60 },
  { label: '59.94 FPS', value: 59.94 },
  { label: '30 FPS', value: 30 },
  { label: '29.97 FPS', value: 29.97 },
  { label: '24 FPS', value: 24 }
];

// Global state
let store;
let mainWindow;
let videoDevices = [];
let keyDebounceTimer = null;
let lastKeyTime = 0;
const KEY_DEBOUNCE_DELAY = 150; // Milliseconds

// Initialize store
async function initStore() {
  const { default: Store } = await import('electron-store');
  store = new Store();
}

// Window management
function createWindow() {
  const windowState = windowStateKeeper({
    defaultWidth: APP_CONFIG.defaultWidth,
    defaultHeight: APP_CONFIG.defaultHeight
  });

  const settings = getSettings();

  mainWindow = new BrowserWindow({
    title: APP_CONFIG.title,
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    autoHideMenuBar: true,
    alwaysOnTop: settings.alwaysOnTop,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    }
  });

  windowState.manage(mainWindow);
  mainWindow.loadFile('index.html');

  // Setup context menu for right-click
  mainWindow.webContents.on('context-menu', (e, params) => {
    const settings = getSettings();
    const contextMenu = buildContextMenu(settings);
    contextMenu.popup(mainWindow, params.x, params.y);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control || input.meta) {
      const currentTime = Date.now();

      // Prevent key repeat - only allow one action per key press
      if (input.type === 'keyDown' && currentTime - lastKeyTime > KEY_DEBOUNCE_DELAY) {
        if (input.key === '=' || input.key === '+') {
          lastKeyTime = currentTime;
          changeZoom('in');
        } else if (input.key === '-') {
          lastKeyTime = currentTime;
          changeZoom('out');
        } else if (input.key === '0') {
          lastKeyTime = currentTime;
          changeZoom('reset');
        }
      }
    }
  });
}

// Settings management
function getSettings() {
  return {
    resolution: store?.get('resolution', APP_CONFIG.defaultResolution) || APP_CONFIG.defaultResolution,
    fps: store?.get('fps', APP_CONFIG.defaultFps) || APP_CONFIG.defaultFps,
    selectedDeviceId: store?.get('selectedDeviceId') || null,
    showWebcamInfo: store?.get('showWebcamInfo', false) || false,
    alwaysOnTop: store?.get('alwaysOnTop', false) || false,
    zoomLevel: store?.get('zoomLevel', 1) || 1
  };
}

function saveSettings(settings) {
  if (!store) return;

  Object.entries(settings).forEach(([key, value]) => {
    if (value !== undefined) {
      store.set(key, value);
    }
  });
}

// Menu management
function buildContextMenu(settings) {
  const deviceSubmenu = videoDevices.length > 0
    ? videoDevices.map(device => ({
      label: device.label || `Camera ${device.deviceId.substring(0, 8)}`,
      type: 'radio',
      checked: device.deviceId === settings.selectedDeviceId,
      click: () => selectDevice(device.deviceId)
    }))
    : [{ label: 'No cameras found', enabled: false }];

  const resolutionSubmenu = RESOLUTIONS.map(res => ({
    label: res.label,
    type: 'radio',
    checked: res.value === settings.resolution,
    click: () => changeResolution(res.value)
  }));

  const fpsSubmenu = FPS_OPTIONS.map(fps => ({
    label: fps.label,
    type: 'radio',
    checked: fps.value === settings.fps,
    click: () => changeFps(fps.value)
  }));

  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: settings.alwaysOnTop,
          click: () => toggleAlwaysOnTop()
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Settings',
      submenu: [
        { label: 'Camera', submenu: deviceSubmenu },
        { type: 'separator' },
        { label: 'Resolution', submenu: resolutionSubmenu },
        { label: 'Frame Rate', submenu: fpsSubmenu },
        { type: 'separator' },
        {
          label: 'Zoom Reset',
          click: () => changeZoom('reset')
        },
        { type: 'separator' },
        {
          label: 'Info webcam',
          type: 'checkbox',
          checked: settings.showWebcamInfo,
          click: () => toggleWebcamInfo()
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

function createMenu() {
  // Remove application menu bar
  Menu.setApplicationMenu(null);
}

// Device selection
function selectDevice(deviceId) {
  saveSettings({ selectedDeviceId: deviceId });
  mainWindow?.webContents.send('device-selected', deviceId);
}

// Settings changes
function changeResolution(resolution) {
  saveSettings({ resolution });
  notifySettingsChanged();
}

function changeFps(fps) {
  saveSettings({ fps });
  notifySettingsChanged();
}

function toggleWebcamInfo() {
  const settings = getSettings();
  const newValue = !settings.showWebcamInfo;
  saveSettings({ showWebcamInfo: newValue });
  notifySettingsChanged();
  mainWindow?.webContents.send('webcam-info-toggled', newValue);
}

function toggleAlwaysOnTop() {
  const settings = getSettings();
  const newValue = !settings.alwaysOnTop;
  saveSettings({ alwaysOnTop: newValue });
  mainWindow?.setAlwaysOnTop(newValue);
  notifySettingsChanged();
}

function notifySettingsChanged() {
  createMenu();
  mainWindow?.webContents.send('settings-changed');
}

// Zoom management
function changeZoom(direction) {
  const settings = getSettings();
  let newZoomLevel = settings.zoomLevel;

  if (direction === 'in') {
    newZoomLevel = Math.min(newZoomLevel + 0.1, 5); // Max zoom 5x
  } else if (direction === 'out') {
    newZoomLevel = Math.max(newZoomLevel - 0.1, 1.0); // Min zoom 1.0x (cannot go below window fill)
  } else if (direction === 'reset') {
    newZoomLevel = 1;
  }

  newZoomLevel = Math.round(newZoomLevel * 10) / 10; // Round to 1 decimal
  saveSettings({ zoomLevel: newZoomLevel });
  mainWindow?.webContents.send('zoom-changed', newZoomLevel);
}

// Permission handling
async function requestCameraPermission() {
  if (process.platform !== 'darwin') return true;

  try {
    return await systemPreferences.askForMediaAccess('camera');
  } catch (error) {
    console.error('Camera permission error:', error);
    return false;
  }
}

// IPC handlers
function setupIPC() {
  ipcMain.on('devices-updated', (event, devices) => {
    videoDevices = devices.filter(device => device.kind === 'videoinput');
    createMenu();
  });

  ipcMain.handle('get-settings', () => getSettings());

  // Handle device selection from renderer
  ipcMain.on('device-active', (event, deviceId) => {
    if (deviceId) {
      saveSettings({ selectedDeviceId: deviceId });
      createMenu(); // Update menu to reflect active device
    }
  });

  // Handle webcam info update
  ipcMain.on('webcam-info-update', (event, info) => {
    if (mainWindow) {
      mainWindow.webContents.send('webcam-info-data', info);
    }
  });

  // Handle zoom requests from renderer
  ipcMain.on('zoom-request', (event, direction, value) => {
    if (direction === 'set-level' && typeof value === 'number') {
      // Direct zoom level setting from renderer
      const newZoomLevel = Math.round(value * 10) / 10;
      saveSettings({ zoomLevel: newZoomLevel });
      // Don't send back to renderer to avoid loop
    } else {
      changeZoom(direction);
    }
  });
}

// App initialization
async function initialize() {
  try {
    await initStore();
    setupIPC();

    if (!(await requestCameraPermission())) {
      app.quit();
      return;
    }

    createMenu();
    createWindow();
  } catch (error) {
    console.error('Initialization error:', error);
    app.quit();
  }
}

// App events
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
});

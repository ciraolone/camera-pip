/**
 * Processo main di Electron. Crea la finestra frameless e la tray icon,
 * possiede i settings (electron-store) e li serve al renderer via IPC,
 * costruisce il menu contestuale del tasto destro (camera, risoluzione, fps,
 * flip, face tracking, finestra) e gestisce le scorciatoie da tastiera. I
 * comandi manuali di zoom/offset passano da changeZoom/changeOffset e
 * spengono il face tracking; il renderer persiste i valori del tracking con
 * i canali set-level/set-position, che salvano senza rimandare l'evento.
 * Serve anche al renderer, via read-vendor-file, gli asset di
 * vendor/mediapipe/ e il worker del face tracking (whitelist rigida).
 */

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  systemPreferences,
} = require("electron");
const path = require("path");
const fs = require("fs");
const windowStateKeeper = require("electron-window-state");

// Set AppUserModelId early so Windows correctly associates window and taskbar button
app.setAppUserModelId("com.camerapip.app");

// Constants
const APP_CONFIG = {
  title: "Ciraolone",
  defaultWidth: 800,
  defaultHeight: 600,
  defaultResolution: "default",
  defaultFps: "default",
  defaultFlip: "normal",
};

const RESOLUTIONS = [
  { label: "Default", value: "default" },
  { label: "4K (3840x2160)", value: "3840x2160" },
  { label: "1080p (1920x1080)", value: "1920x1080" },
  { label: "720p (1280x720)", value: "1280x720" },
  { label: "480p (640x480)", value: "640x480" },
  { label: "360p (640x360)", value: "640x360" },
];

const FPS_OPTIONS = [
  { label: "Default", value: "default" },
  { label: "60 FPS", value: 60 },
  { label: "59.94 FPS", value: 59.94 },
  { label: "50 FPS", value: 50 },
  { label: "30 FPS", value: 30 },
  { label: "29.97 FPS", value: 29.97 },
  { label: "25 FPS", value: 25 },
  { label: "24 FPS", value: 24 },
];

const FLIP_OPTIONS = [
  { label: "Normal", value: "normal" },
  { label: "Flipped", value: "flipped" },
  { label: "Auto", value: "auto" },
];

// 0 = Off: il tracking sposta solo l'inquadratura, senza mai toccare lo zoom
const TRACKING_ZOOM_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "1.5x", value: 1.5 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
];

// I livelli di velocità e tolleranza sono chiavi delle scale fisiche definite
// in face-tracker-tuning.js: qui vive solo la scelta dell'utente
const TRACKING_SPEED_OPTIONS = [
  { label: "1 (slowest)", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5 (fastest)", value: 5 },
];

// Attesa prima che l'inseguimento parta dopo uno spostamento, in secondi
const TRACKING_DELAY_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "0.5s", value: 0.5 },
  { label: "1s", value: 1 },
  { label: "1.5s", value: 1.5 },
  { label: "2s", value: 2 },
];

// Quanto il volto può allontanarsi dal bersaglio prima che l'inseguimento parta
const TRACKING_TOLERANCE_OPTIONS = [
  { label: "1 (smallest)", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5 (largest)", value: 5 },
];

// Unici file serviti dal handler read-vendor-file: whitelist rigida
// (nome richiesto → path relativo alla root dell'app). Il worker del face
// tracking è codice nostro, non vendor, ma passa dallo stesso canale: il
// renderer non può leggerlo in altro modo (fetch/XHR verso file:// bloccati).
const RENDERER_READABLE_FILES = {
  "vision_bundle.mjs": ["vendor", "mediapipe", "vision_bundle.mjs"],
  "vision_wasm_internal.js": ["vendor", "mediapipe", "vision_wasm_internal.js"],
  "vision_wasm_internal.wasm": ["vendor", "mediapipe", "vision_wasm_internal.wasm"],
  "blaze_face_short_range.tflite": ["vendor", "mediapipe", "blaze_face_short_range.tflite"],
  "face-detection-worker.js": ["face-detection-worker.js"],
};

// Global state
let store;
let mainWindow;
let tray;
let videoDevices = [];
let lastKeyTime = 0;
const KEY_DEBOUNCE_DELAY = 150; // Milliseconds

// Initialize store
async function initStore() {
  const { default: Store } = await import("electron-store");
  store = new Store();
}

// Window management
function createWindow() {
  const windowState = windowStateKeeper({
    defaultWidth: APP_CONFIG.defaultWidth,
    defaultHeight: APP_CONFIG.defaultHeight,
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
    // skipTaskbar is user-configurable: frameless Electron windows flash the
    // taskbar button when moved by external tools (AltSnap, etc.). Setting it
    // true hides the button — the tray icon is always present to restore.
    skipTaskbar: settings.skipTaskbar,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
    },
  });

  Menu.setApplicationMenu(null);
  windowState.manage(mainWindow);
  mainWindow.loadFile("index.html");

  mainWindow.webContents.on("context-menu", (e, params) => {
    e.preventDefault();
    const settings = getSettings();
    const contextMenu = buildContextMenu(settings);
    contextMenu.popup({ window: mainWindow, x: params.x, y: params.y });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("show", updateTrayMenu);
  mainWindow.on("hide", updateTrayMenu);
  mainWindow.on("minimize", updateTrayMenu);
  mainWindow.on("restore", updateTrayMenu);

  // Setup keyboard shortcuts
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const currentTime = Date.now();

    // Prevent key repeat - only allow one action per key press
    if (
      input.type === "keyDown" &&
      currentTime - lastKeyTime > KEY_DEBOUNCE_DELAY
    ) {
      if (input.control || input.meta) {
        if (input.key === "i" || input.key === "I") {
          lastKeyTime = currentTime;
          toggleWebcamInfo();
          event.preventDefault();
        } else if (input.key === "=" || input.key === "+") {
          lastKeyTime = currentTime;
          changeZoom("in");
          event.preventDefault();
        } else if (input.key === "-") {
          lastKeyTime = currentTime;
          changeZoom("out");
          event.preventDefault();
        } else if (input.key === "0") {
          lastKeyTime = currentTime;
          changeZoom("reset");
          changeOffset("reset");
          event.preventDefault();
        } else if (input.key === "ArrowUp") {
          lastKeyTime = currentTime;
          changeOffset("up");
          event.preventDefault();
        } else if (input.key === "ArrowDown") {
          lastKeyTime = currentTime;
          changeOffset("down");
          event.preventDefault();
        } else if (input.key === "ArrowLeft") {
          lastKeyTime = currentTime;
          changeOffset("left");
          event.preventDefault();
        } else if (input.key === "ArrowRight") {
          lastKeyTime = currentTime;
          changeOffset("right");
          event.preventDefault();
        }
      }
    }
  });
}

// Tray management
function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const isVisible = mainWindow?.isVisible() && !mainWindow?.isMinimized();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: isVisible ? "Hide" : "Show", click: toggleWindow },
      { type: "separator" },
      { role: "quit" },
    ])
  );
}

function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "icon.ico"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Camera PiP");
  tray.on("click", toggleWindow);
  updateTrayMenu();
}

// Settings management
function getSettings() {
  return {
    resolution:
      store?.get("resolution", APP_CONFIG.defaultResolution) ||
      APP_CONFIG.defaultResolution,
    fps: store?.get("fps", APP_CONFIG.defaultFps) || APP_CONFIG.defaultFps,
    selectedDeviceId: store?.get("selectedDeviceId") || null,
    showWebcamInfo: store?.get("showWebcamInfo", false) || false,
    alwaysOnTop: store?.get("alwaysOnTop", false) || false,
    zoomLevel: store?.get("zoomLevel", 1) || 1,
    offsetX: store?.get("offsetX", 0) || 0,
    offsetY: store?.get("offsetY", 0) || 0,
    flip: store?.get("flip", APP_CONFIG.defaultFlip) || APP_CONFIG.defaultFlip,
    autoFlipActive: store?.get("autoFlipActive", false) || false,
    skipTaskbar: store?.get("skipTaskbar", false) || false,
    faceTracking: store ? store.get("faceTracking", false) : false,
    // Niente "|| default": 0 (Off) è un valore valido e "||" lo mangerebbe
    faceTrackingMaxZoom: store ? store.get("faceTrackingMaxZoom", 1.5) : 1.5,
    faceTrackingSpeed: store ? store.get("faceTrackingSpeed", 3) : 3,
    faceTrackingDelay: store ? store.get("faceTrackingDelay", 0) : 0,
    faceTrackingTolerance: store ? store.get("faceTrackingTolerance", 3) : 3,
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
function buildRadioSubmenu(options, currentValue, onSelect) {
  return options.map((option) => ({
    label: option.label,
    type: "radio",
    checked: option.value === currentValue,
    click: () => onSelect(option.value),
  }));
}

function buildTrackingSubmenus(settings) {
  const forKey = (key) => (value) => changeTrackingSetting(key, value);
  return [
    { label: "Tracking Zoom", submenu: buildRadioSubmenu(TRACKING_ZOOM_OPTIONS, settings.faceTrackingMaxZoom, forKey("faceTrackingMaxZoom")) },
    { label: "Tracking Speed", submenu: buildRadioSubmenu(TRACKING_SPEED_OPTIONS, settings.faceTrackingSpeed, forKey("faceTrackingSpeed")) },
    { label: "Tracking Delay", submenu: buildRadioSubmenu(TRACKING_DELAY_OPTIONS, settings.faceTrackingDelay, forKey("faceTrackingDelay")) },
    { label: "Tracking Tolerance", submenu: buildRadioSubmenu(TRACKING_TOLERANCE_OPTIONS, settings.faceTrackingTolerance, forKey("faceTrackingTolerance")) },
  ];
}

function buildContextMenu(settings) {
  const deviceSubmenu =
    videoDevices.length > 0
      ? videoDevices.map((device) => ({
          label: device.label || `Camera ${device.deviceId.substring(0, 8)}`,
          type: "radio",
          checked: device.deviceId === settings.selectedDeviceId,
          click: () => selectDevice(device.deviceId),
        }))
      : [{ label: "No cameras found", enabled: false }];

  const resolutionSubmenu = buildRadioSubmenu(RESOLUTIONS, settings.resolution, changeResolution);
  const fpsSubmenu = buildRadioSubmenu(FPS_OPTIONS, settings.fps, changeFps);
  const flipSubmenu = buildRadioSubmenu(FLIP_OPTIONS, settings.flip, changeFlip);

  const template = [
    { label: "Camera", submenu: deviceSubmenu },
    { type: "separator" },
    { label: "Resolution", submenu: resolutionSubmenu },
    { label: "Frame Rate", submenu: fpsSubmenu },
    { label: "Flip", submenu: flipSubmenu },
    { type: "separator" },
    {
      label: "Face Tracking",
      type: "checkbox",
      checked: settings.faceTracking,
      click: () => toggleFaceTracking(),
    },
    ...buildTrackingSubmenus(settings),
    { type: "separator" },
    {
      label: "Always on Top",
      type: "checkbox",
      checked: settings.alwaysOnTop,
      click: () => toggleAlwaysOnTop(),
    },
    {
      label: "Hide from Taskbar",
      type: "checkbox",
      checked: settings.skipTaskbar,
      click: () => toggleSkipTaskbar(),
    },
    {
      label: "Info webcam",
      type: "checkbox",
      checked: settings.showWebcamInfo,
      click: () => toggleWebcamInfo(),
    },
    { type: "separator" },
    {
      label: "Zoom Reset",
      click: () => changeZoom("reset"),
    },
    {
      label: "Offset Reset",
      click: () => changeOffset("reset"),
    },
    { type: "separator" },
    { role: "reload" },
    { role: "toggleDevTools" },
    { type: "separator" },
    { role: "quit" },
  ];

  return Menu.buildFromTemplate(template);
}

// Device selection
function selectDevice(deviceId) {
  saveSettings({ selectedDeviceId: deviceId });
  mainWindow?.webContents.send("device-selected", deviceId);
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

function changeFlip(flip) {
  saveSettings({ flip });
  // Don't call notifySettingsChanged() to avoid camera restart
  mainWindow?.webContents.send("flip-changed", flip);
}

// Face tracking management
function toggleFaceTracking() {
  const settings = getSettings();
  const newValue = !settings.faceTracking;
  saveSettings({ faceTracking: newValue });
  mainWindow?.webContents.send("face-tracking-changed", newValue);
}

function changeTrackingSetting(key, value) {
  saveSettings({ [key]: value });
  mainWindow?.webContents.send("face-tracking-tuning-changed", getTrackingTuning());
}

// L'oggetto di taratura viaggia sempre intero sul canale unico
// face-tracking-tuning-changed: un solo modo di propagarla al renderer
function getTrackingTuning() {
  const settings = getSettings();
  return {
    maxZoom: settings.faceTrackingMaxZoom,
    speed: settings.faceTrackingSpeed,
    delaySeconds: settings.faceTrackingDelay,
    tolerance: settings.faceTrackingTolerance,
  };
}

// Qualsiasi comando manuale di zoom/offset ridà il controllo all'utente:
// il tracking si spegne e la spunta nel menu sparisce (scenario
// "Attivazione e disattivazione" della feature 001)
function disableFaceTrackingForManualCommand() {
  const settings = getSettings();
  if (!settings.faceTracking) return;
  saveSettings({ faceTracking: false });
  mainWindow?.webContents.send("face-tracking-changed", false);
}

function toggleWebcamInfo() {
  const settings = getSettings();
  const newValue = !settings.showWebcamInfo;
  saveSettings({ showWebcamInfo: newValue });
  notifySettingsChanged();
  mainWindow?.webContents.send("webcam-info-toggled", newValue);
}

function toggleAlwaysOnTop() {
  const settings = getSettings();
  const newValue = !settings.alwaysOnTop;
  saveSettings({ alwaysOnTop: newValue });
  mainWindow?.setAlwaysOnTop(newValue);
}

function toggleSkipTaskbar() {
  const settings = getSettings();
  const newValue = !settings.skipTaskbar;
  saveSettings({ skipTaskbar: newValue });
  mainWindow?.setSkipTaskbar(newValue);
}

function notifySettingsChanged() {
  mainWindow?.webContents.send("settings-changed");
}

// Offset management
function changeOffset(direction) {
  disableFaceTrackingForManualCommand();
  const settings = getSettings();
  let newOffsetX = settings.offsetX;
  let newOffsetY = settings.offsetY;
  const step = 5; // Pixel per step

  switch (direction) {
    case "up":
      newOffsetY = Math.max(newOffsetY - step, -200);
      break;
    case "down":
      newOffsetY = Math.min(newOffsetY + step, 200);
      break;
    case "left":
      newOffsetX = Math.max(newOffsetX - step, -200);
      break;
    case "right":
      newOffsetX = Math.min(newOffsetX + step, 200);
      break;
    case "reset":
      newOffsetX = 0;
      newOffsetY = 0;
      break;
  }

  saveSettings({ offsetX: newOffsetX, offsetY: newOffsetY });
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("offset-changed", {
      x: newOffsetX,
      y: newOffsetY,
    });
  }
}

// Zoom management
function changeZoom(direction) {
  disableFaceTrackingForManualCommand();
  const settings = getSettings();
  let newZoomLevel = settings.zoomLevel;

  if (direction === "in") {
    newZoomLevel = Math.min(newZoomLevel + 0.1, 5); // Max zoom 5x
  } else if (direction === "out") {
    newZoomLevel = Math.max(newZoomLevel - 0.1, 1.0); // Min zoom 1.0x (cannot go below window fill)
  } else if (direction === "reset") {
    newZoomLevel = 1;
  }

  newZoomLevel = Math.round(newZoomLevel * 10) / 10; // Round to 1 decimal
  saveSettings({ zoomLevel: newZoomLevel });
  mainWindow?.webContents.send("zoom-changed", newZoomLevel);
}

// Permission handling
async function requestCameraPermission() {
  if (process.platform !== "darwin") return true;

  try {
    return await systemPreferences.askForMediaAccess("camera");
  } catch (error) {
    console.error("Camera permission error:", error);
    return false;
  }
}

// IPC handlers
function setupIPC() {
  ipcMain.on("devices-updated", (event, devices) => {
    videoDevices = devices.filter((device) => device.kind === "videoinput");
  });

  ipcMain.handle("get-settings", () => getSettings());

  // Handle device selection from renderer
  ipcMain.on("device-active", (event, deviceId) => {
    if (deviceId) {
      saveSettings({ selectedDeviceId: deviceId });
    }
  });

  // Handle webcam info update
  ipcMain.on("webcam-info-update", (event, info) => {
    if (mainWindow) {
      mainWindow.webContents.send("webcam-info-data", info);
    }
  });

  // Handle zoom requests from renderer
  ipcMain.on("zoom-request", (event, direction, value) => {
    if (direction === "set-level" && typeof value === "number") {
      // Direct zoom level setting from renderer
      const newZoomLevel = Math.round(value * 10) / 10;
      saveSettings({ zoomLevel: newZoomLevel });
      // Don't send back to renderer to avoid loop
    } else {
      changeZoom(direction);
    }
  });

  // Handle offset requests from renderer
  ipcMain.on("offset-request", (event, direction, value) => {
    if (direction === "set-position" && typeof value === "object") {
      // Direct offset setting from renderer
      const newOffsetX = Math.round(value.x);
      const newOffsetY = Math.round(value.y);
      saveSettings({ offsetX: newOffsetX, offsetY: newOffsetY });
      // Don't send back to renderer to avoid loop
    } else {
      changeOffset(direction);
    }
  });

  // Handle auto flip state changes from renderer
  ipcMain.on("auto-flip-state-changed", (event, autoFlipActive) => {
    saveSettings({ autoFlipActive });
  });

  // I file whitelistati (asset MediaPipe + worker del tracking) si servono via
  // IPC perché fetch/XHR verso file:// è bloccato da Chromium — vedi plan 001
  ipcMain.handle("read-vendor-file", (event, fileName) => {
    const relativePath = RENDERER_READABLE_FILES[fileName];
    if (!relativePath) {
      throw new Error(`File non consentito: ${fileName}`);
    }
    return fs.readFileSync(path.join(__dirname, ...relativePath));
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

    createWindow();
    createTray();
  } catch (error) {
    console.error("Initialization error:", error);
    app.quit();
  }
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// App events
app.whenReady().then(initialize);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// Error handling
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection:", reason);
});

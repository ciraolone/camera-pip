// Camera PiP Renderer
class CameraPiP {
  constructor() {
    this.videoElement = null;
    this.currentStream = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.webcamInfoElement = null;
    this.showWebcamInfo = false;
    this.currentZoom = 1;
    this.minZoomLevel = 1; // Will be calculated based on window/video dimensions

    this.init();
  }

  // Initialize application
  async init() {
    try {
      this.videoElement = document.getElementById('webcam');
      this.webcamInfoElement = document.getElementById('webcam-info');

      if (!this.videoElement) {
        throw new Error('Video element not found');
      }

      this.setupEventListeners();
      await this.updateDeviceList();

      // Start camera with saved device ID
      const settings = await this.getSettings();
      this.showWebcamInfo = settings.showWebcamInfo;
      this.currentZoom = settings.zoomLevel || 1;
      this.updateWebcamInfoVisibility();
      this.applyZoom(this.currentZoom);

      await this.startCamera(settings.selectedDeviceId);
    } catch (error) {
      console.error('Initialization error:', error);
      this.showError('Failed to initialize camera');
    }
  }

  // Setup event listeners
  setupEventListeners() {
    // IPC events
    window.electronAPI.receive('device-selected', (deviceId) => {
      this.startCamera(deviceId);
    });

    window.electronAPI.receive('settings-changed', () => {
      this.restartCamera();
    });

    window.electronAPI.receive('webcam-info-toggled', (show) => {
      this.showWebcamInfo = show;
      this.updateWebcamInfoVisibility();
    });

    window.electronAPI.receive('zoom-changed', (zoomLevel) => {
      this.currentZoom = zoomLevel;
      this.applyZoom(zoomLevel);
    });

    // Video events
    this.videoElement.addEventListener('error', (e) => {
      console.error('Video error:', e);
      this.handleError(new Error('Video playback error'));
    });

    this.videoElement.addEventListener('loadedmetadata', () => {
      this.updateWebcamInfo();
      this.calculateMinZoom();
      this.applyZoom(this.currentZoom); // Re-apply zoom with new minimum
    });

    // Window resize event
    window.addEventListener('resize', () => {
      this.calculateMinZoom();
      this.applyZoom(this.currentZoom);
    });
  }

  // Start camera with optional device ID
  async startCamera(deviceId = null) {
    try {
      await this.stopCamera();

      const settings = await this.getSettings();
      const actualDeviceId = deviceId || settings.selectedDeviceId;
      const constraints = this.createConstraints(actualDeviceId, settings);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = stream;
      this.currentStream = stream;
      this.retryCount = 0;

      // Notify main process about active device
      if (actualDeviceId) {
        window.electronAPI.send('device-active', actualDeviceId);
      }

    } catch (error) {
      console.error('Camera start error:', error);
      await this.handleError(error);
    }
  }

  // Stop current camera stream
  async stopCamera() {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  // Restart camera with current settings
  async restartCamera() {
    const settings = await this.getSettings();
    await this.startCamera(settings.selectedDeviceId);
  }

  // Get settings from main process
  async getSettings() {
    try {
      return await window.electronAPI.invoke('get-settings');
    } catch (error) {
      console.error('Settings error:', error);
      return {
        resolution: 'default',
        fps: 'default',
        selectedDeviceId: null
      };
    }
  }

  // Create video constraints
  createConstraints(deviceId, settings) {
    const constraints = {
      video: {}
    };

    // Handle resolution
    if (settings.resolution !== 'default') {
      const [width, height] = settings.resolution.split('x').map(Number);
      constraints.video.width = { ideal: width };
      constraints.video.height = { ideal: height };
    }

    // Handle frame rate
    if (settings.fps !== 'default') {
      constraints.video.frameRate = { ideal: settings.fps };
    }

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }

    return constraints;
  }

  // Handle camera errors
  async handleError(error) {
    console.error('Camera error:', error.name, error.message);

    switch (error.name) {
      case 'NotFoundError':
      case 'DeviceNotFoundError':
        this.showError('Camera not found');
        break;

      case 'NotAllowedError':
      case 'PermissionDeniedError':
        this.showError('Camera permission denied');
        break;

      case 'NotReadableError':
      case 'TrackStartError':
        this.showError('Camera in use by another application');
        break;

      case 'OverconstrainedError':
        await this.retryWithFallback();
        break;

      default:
        await this.retryConnection();
    }
  }

  // Retry with fallback settings
  async retryWithFallback() {
    try {
      const fallbackConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      this.videoElement.srcObject = stream;
      this.currentStream = stream;

    } catch (error) {
      await this.retryConnection();
    }
  }

  // Retry connection
  async retryConnection() {
    if (this.retryCount >= this.maxRetries) {
      this.showError('Unable to connect to camera after multiple attempts');
      return;
    }

    this.retryCount++;
    await new Promise(resolve => setTimeout(resolve, this.retryDelay));

    const settings = await this.getSettings();
    await this.startCamera(settings.selectedDeviceId);
  }

  // Update device list
  async updateDeviceList() {
    try {
      // Request camera permission first
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());

      // Get device list
      const devices = await navigator.mediaDevices.enumerateDevices();
      const serialized = devices.map(device => ({
        deviceId: device.deviceId,
        kind: device.kind,
        label: device.label || `Device ${device.deviceId.substring(0, 8)}`,
        groupId: device.groupId
      }));

      // Send to main process
      window.electronAPI.send('devices-updated', serialized);

    } catch (error) {
      console.error('Device list error:', error);
      window.electronAPI.send('devices-updated', []);
    }
  }

  // Show error message
  showError(message) {
    let errorDiv = document.getElementById('error-message');

    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.id = 'error-message';
      errorDiv.style.cssText = `
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
      document.body.appendChild(errorDiv);
    }

    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    setTimeout(() => {
      if (errorDiv) {
        errorDiv.style.display = 'none';
      }
    }, 5000);
  }

  // Update webcam info visibility
  updateWebcamInfoVisibility() {
    if (this.webcamInfoElement) {
      if (this.showWebcamInfo) {
        this.webcamInfoElement.classList.add('visible');
        this.updateWebcamInfo();
      } else {
        this.webcamInfoElement.classList.remove('visible');
      }
    }
  }

  // Update webcam info display
  updateWebcamInfo() {
    if (!this.showWebcamInfo || !this.webcamInfoElement || !this.videoElement) return;

    const resolutionInfo = document.getElementById('resolution-info');
    const fpsInfo = document.getElementById('fps-info');
    const zoomInfo = document.getElementById('zoom-info');

    if (resolutionInfo && fpsInfo && zoomInfo) {
      const videoWidth = this.videoElement.videoWidth;
      const videoHeight = this.videoElement.videoHeight;

      if (videoWidth && videoHeight) {
        resolutionInfo.textContent = `Res: ${videoWidth}x${videoHeight}`;

        // Get actual FPS from video track
        if (this.currentStream) {
          const videoTracks = this.currentStream.getVideoTracks();
          if (videoTracks.length > 0) {
            const settings = videoTracks[0].getSettings();
            const fps = settings.frameRate ? Math.round(settings.frameRate) : '--';
            fpsInfo.textContent = `FPS: ${fps}`;
          }
        }
      }

      // Update zoom info
      zoomInfo.textContent = `Zoom: ${this.currentZoom.toFixed(1)}x`;
    }
  }

  // Apply zoom to video element
  applyZoom(zoomLevel) {
    if (!this.videoElement) return;

    // Calculate minimum zoom to fill window
    this.calculateMinZoom();

    // The main process already ensures zoom is not below minimum
    // but we double-check here for safety
    const adjustedZoomLevel = Math.max(zoomLevel, this.minZoomLevel);

    // Update current zoom
    this.currentZoom = adjustedZoomLevel;

    // Apply zoom using CSS transform
    // object-fit: cover in CSS already handles filling the window at 1.0x
    this.videoElement.style.transform = `scale(${adjustedZoomLevel})`;
    this.videoElement.style.transformOrigin = 'center center';

    // Update webcam info to show new zoom level
    this.updateWebcamInfo();
  }

  // Calculate minimum zoom level to fill window
  calculateMinZoom() {
    if (!this.videoElement || !this.videoElement.videoWidth || !this.videoElement.videoHeight) {
      this.minZoomLevel = 1;
      return;
    }

    // With object-fit: cover, the video already fills the window
    // So minimum zoom should be 1.0 (no scaling needed)
    this.minZoomLevel = 1.0;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new CameraPiP());
} else {
  new CameraPiP();
}

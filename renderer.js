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
    this.currentOffsetX = 0;
    this.currentOffsetY = 0;
    this.currentFlip = 'normal';
    this.lastKeyTime = 0;
    this.lastKeyTime = 0;

    // Auto flip state management
    this.autoFlipActive = false; // Tracks current flip state in auto mode
    this.autoFlipThresholdActivate = 0.6; // 60% of screen to activate flip
    this.autoFlipThresholdDeactivate = 0.4; // 40% of screen to deactivate flip
    this.autoFlipTimer = null; // Timer for delayed flip activation
    this.autoFlipDelay = 1000; // 1 second delay before flip changes

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
      this.currentOffsetX = settings.offsetX || 0;
      this.currentOffsetY = settings.offsetY || 0;
      this.currentFlip = settings.flip || 'normal';
      this.autoFlipActive = settings.autoFlipActive || false;
      this.updateWebcamInfoVisibility();
      this.applyZoom(this.currentZoom);
      this.applyOffset(this.currentOffsetX, this.currentOffsetY);
      this.applyFlip(this.currentFlip);

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

    window.electronAPI.receive('offset-changed', (offset) => {
      this.currentOffsetX = offset.x;
      this.currentOffsetY = offset.y;
      this.applyOffset(offset.x, offset.y);
    });

    window.electronAPI.receive('flip-changed', (flip) => {
      this.applyFlip(flip);
    });

    // Keyboard shortcuts handler
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        const currentTime = Date.now();

        // Prevent key repeat
        if (currentTime - this.lastKeyTime > 150) {
          if (e.key === '=' || e.key === '+') {
            this.lastKeyTime = currentTime;
            window.electronAPI.send('zoom-request', 'in');
            e.preventDefault();
          } else if (e.key === '-') {
            this.lastKeyTime = currentTime;
            window.electronAPI.send('zoom-request', 'out');
            e.preventDefault();
          } else if (e.key === '0') {
            this.lastKeyTime = currentTime;
            window.electronAPI.send('zoom-request', 'reset');
            e.preventDefault();
          } else if (e.key === 'ArrowUp') {
            this.lastKeyTime = currentTime;
            window.electronAPI.send('offset-request', 'up');
            e.preventDefault();
          } else if (e.key === 'ArrowDown') {
            this.lastKeyTime = currentTime;
            window.electronAPI.send('offset-request', 'down');
            e.preventDefault();
          } else if (e.key === 'ArrowLeft') {
            this.lastKeyTime = currentTime;
            window.electronAPI.send('offset-request', 'left');
            e.preventDefault();
          } else if (e.key === 'ArrowRight') {
            this.lastKeyTime = currentTime;
            window.electronAPI.send('offset-request', 'right');
            e.preventDefault();
          }
        }
      }
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
      this.applyOffset(this.currentOffsetX, this.currentOffsetY); // Re-apply offset
      this.applyFlip(this.currentFlip); // Re-apply flip
    });

    // Window resize event
    window.addEventListener('resize', () => {
      this.calculateMinZoom();
      this.applyZoom(this.currentZoom);
      this.applyOffset(this.currentOffsetX, this.currentOffsetY);
      this.applyFlip(this.currentFlip);
      // Update window info when resizing
      this.forceUpdateWebcamInfo();
      // Note: checkAutoFlip() is handled by the periodic interval, not needed here
    });

    // Window move/position change event
    window.addEventListener('beforeunload', () => {
      this.forceUpdateWebcamInfo();
    });

    // Window focus event - check position immediately when window gets focus
    window.addEventListener('focus', () => {
      if (this.currentFlip === 'auto') {
        // Clear any pending timer and check position immediately
        if (this.autoFlipTimer) {
          clearTimeout(this.autoFlipTimer);
          this.autoFlipTimer = null;
        }
        this.checkAutoFlipImmediate();
      }
      if (this.showWebcamInfo) {
        this.forceUpdateWebcamInfo();
      }
    });

    // Page visibility change event - check position when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.currentFlip === 'auto') {
        // Clear any pending timer and check position immediately
        if (this.autoFlipTimer) {
          clearTimeout(this.autoFlipTimer);
          this.autoFlipTimer = null;
        }
        this.checkAutoFlipImmediate();
      }
    });

    // Update window info periodically for position changes
    setInterval(() => {
      if (this.showWebcamInfo) {
        this.forceUpdateWebcamInfo();
      }
      // Check auto flip when window moves
      if (this.currentFlip === 'auto') {
        this.checkAutoFlip();
      }
    }, 500); // Update every 500ms for smoother monitoring
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

  // Get window information
  getWindowInfo() {
    const windowSize = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    const windowPosition = {
      x: window.screenX,
      y: window.screenY
    };

    // Calculate distances from screen edges
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;

    const distanceFromLeft = windowPosition.x;
    const distanceFromTop = windowPosition.y;
    const distanceFromRight = screenWidth - (windowPosition.x + windowSize.width);
    const distanceFromBottom = screenHeight - (windowPosition.y + windowSize.height);

    const distances = {
      left: Math.max(0, distanceFromLeft),
      top: Math.max(0, distanceFromTop),
      right: Math.max(0, distanceFromRight),
      bottom: Math.max(0, distanceFromBottom)
    };

    return { windowSize, windowPosition, distances };
  }

  // Update webcam info display
  updateWebcamInfo() {
    if (!this.showWebcamInfo || !this.webcamInfoElement || !this.videoElement) return;

    const resolutionInfo = document.getElementById('resolution-info');
    const fpsInfo = document.getElementById('fps-info');
    const zoomInfo = document.getElementById('zoom-info');
    const offsetInfo = document.getElementById('offset-info');
    const windowSizeInfo = document.getElementById('window-size-info');
    const windowDistanceInfo = document.getElementById('window-distance-info');

    if (resolutionInfo && fpsInfo && zoomInfo && offsetInfo && windowSizeInfo && windowDistanceInfo) {
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

      // Update offset info
      offsetInfo.textContent = `Offset: ${this.currentOffsetX}, ${this.currentOffsetY}`;

      // Update window info
      const windowInfo = this.getWindowInfo();
      windowSizeInfo.textContent = `Finestra: ${windowInfo.windowSize.width}x${windowInfo.windowSize.height}`;
      windowDistanceInfo.textContent = `Distance: L${windowInfo.distances.left} T${windowInfo.distances.top} R${windowInfo.distances.right} B${windowInfo.distances.bottom}`;
    }
  }

  // Force update webcam info regardless of visibility
  forceUpdateWebcamInfo() {
    const resolutionInfo = document.getElementById('resolution-info');
    const fpsInfo = document.getElementById('fps-info');
    const zoomInfo = document.getElementById('zoom-info');
    const offsetInfo = document.getElementById('offset-info');
    const windowSizeInfo = document.getElementById('window-size-info');
    const windowDistanceInfo = document.getElementById('window-distance-info');

    if (resolutionInfo && fpsInfo && zoomInfo && offsetInfo && windowSizeInfo && windowDistanceInfo) {
      const videoWidth = this.videoElement?.videoWidth;
      const videoHeight = this.videoElement?.videoHeight;

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

      // Always update zoom and offset info
      zoomInfo.textContent = `Zoom: ${this.currentZoom.toFixed(1)}x`;
      offsetInfo.textContent = `Offset: ${this.currentOffsetX}, ${this.currentOffsetY}`;

      // Always update window info
      const windowInfo = this.getWindowInfo();
      windowSizeInfo.textContent = `Finestra: ${windowInfo.windowSize.width}x${windowInfo.windowSize.height}`;
      windowDistanceInfo.textContent = `Distance: L${windowInfo.distances.left} T${windowInfo.distances.top} R${windowInfo.distances.right} B${windowInfo.distances.bottom}`;
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

    // Apply transforms with flip consideration
    this.applyAllTransformsWithFlip();

    // Force update webcam info regardless of visibility
    this.forceUpdateWebcamInfo();
  }

  // Apply offset to video element
  applyOffset(offsetX, offsetY) {
    if (!this.videoElement) return;

    // Update current offset
    this.currentOffsetX = offsetX;
    this.currentOffsetY = offsetY;

    // Apply transforms with flip consideration
    this.applyAllTransformsWithFlip();

    // Force update webcam info regardless of visibility
    this.forceUpdateWebcamInfo();
  }

  // Apply all transforms considering flip
  applyAllTransformsWithFlip() {
    if (!this.videoElement) return;

    const baseTransforms = this.getCurrentTransforms();
    const effectiveFlip = this.getEffectiveFlip();

    let finalTransform;
    if (effectiveFlip === 'flipped') {
      finalTransform = `scaleX(-1) ${baseTransforms}`;
    } else {
      finalTransform = baseTransforms;
    }

    this.videoElement.style.transform = finalTransform;
    this.videoElement.style.transformOrigin = 'center center';
  }

  // Apply flip to video element
  applyFlip(flip) {
    if (!this.videoElement) return;

    // Save previous flip mode to detect actual changes
    const previousFlip = this.currentFlip;

    // Update current flip
    this.currentFlip = flip;

    // Reset timer when changing flip mode, but preserve autoFlipActive state
    if (flip !== 'auto') {
      // Clear timer when switching away from auto mode
      if (this.autoFlipTimer) {
        clearTimeout(this.autoFlipTimer);
        this.autoFlipTimer = null;
      }
    }

    // Apply transforms with flip consideration
    this.applyAllTransformsWithFlip();

    // Force update webcam info regardless of visibility
    this.forceUpdateWebcamInfo();
  }

  // Get current transforms (without flip)
  getCurrentTransforms() {
    const transforms = [];

    // 1. Offset (translate)
    if (this.currentOffsetX !== 0 || this.currentOffsetY !== 0) {
      transforms.push(`translate(${this.currentOffsetX}px, ${this.currentOffsetY}px)`);
    }

    // 2. Zoom (scale)
    if (this.currentZoom !== 1) {
      transforms.push(`scale(${this.currentZoom})`);
    }

    const result = transforms.join(' ');
    return result;
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

  // Check window position as percentage of screen width
  getWindowPositionPercentage() {
    const windowInfo = this.getWindowInfo();
    const screenWidth = window.screen.width;
    const windowCenterX = windowInfo.windowPosition.x + (windowInfo.windowSize.width / 2);

    return windowCenterX / screenWidth;
  }

  // Determine effective flip state (considering auto mode with hysteresis)
  getEffectiveFlip() {
    if (this.currentFlip === 'auto') {
      // In auto mode, return the state based on autoFlipActive only
      // The timer system in checkAutoFlip() manages when to change this state
      return this.autoFlipActive ? 'flipped' : 'normal';
    }
    return this.currentFlip;
  }

  // Check auto flip with delayed execution and timer reset
  checkAutoFlip() {
    if (this.currentFlip !== 'auto') return;

    // If timer is already running, don't start a new check
    if (this.autoFlipTimer) {
      return;
    }

    // Check if flip state should change
    const positionPercentage = this.getWindowPositionPercentage();
    let shouldFlip = false;

    if (!this.autoFlipActive) {
      // Flip is currently off, check if we should activate it
      shouldFlip = positionPercentage > this.autoFlipThresholdActivate;
    } else {
      // Flip is currently on, check if we should deactivate it
      // Keep flip active unless position goes below deactivate threshold
      shouldFlip = positionPercentage >= this.autoFlipThresholdDeactivate;
    }

    // Only proceed if there's a state change needed
    const needsChange = shouldFlip !== this.autoFlipActive;

    if (needsChange) {
      // Set new timer to apply the change
      this.autoFlipTimer = setTimeout(() => {
        // Re-check position in case it changed during the delay
        const currentPositionPercentage = this.getWindowPositionPercentage();
        let finalShouldFlip = false;

        if (!this.autoFlipActive) {
          finalShouldFlip = currentPositionPercentage > this.autoFlipThresholdActivate;
        } else {
          finalShouldFlip = currentPositionPercentage >= this.autoFlipThresholdDeactivate;
        }

        // Apply the change if still needed
        if (finalShouldFlip !== this.autoFlipActive) {
          this.autoFlipActive = finalShouldFlip;
          this.applyAllTransformsWithFlip();
          // Save the autoFlipActive state
          window.electronAPI.send('auto-flip-state-changed', this.autoFlipActive);
        }

        this.autoFlipTimer = null;
      }, this.autoFlipDelay);
    }
  }

  // Check auto flip immediately without delay (for window restore/focus events)
  checkAutoFlipImmediate() {
    if (this.currentFlip !== 'auto') return;

    // Check current position
    const positionPercentage = this.getWindowPositionPercentage();
    let shouldFlip = false;

    if (!this.autoFlipActive) {
      // Flip is currently off, check if we should activate it
      shouldFlip = positionPercentage > this.autoFlipThresholdActivate;
    } else {
      // Flip is currently on, check if we should deactivate it
      // Keep flip active unless position goes below deactivate threshold
      shouldFlip = positionPercentage >= this.autoFlipThresholdDeactivate;
    }

    // Apply the change immediately if needed
    if (shouldFlip !== this.autoFlipActive) {
      this.autoFlipActive = shouldFlip;
      this.applyAllTransformsWithFlip();
      // Save the autoFlipActive state
      window.electronAPI.send('auto-flip-state-changed', this.autoFlipActive);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new CameraPiP());
} else {
  new CameraPiP();
}

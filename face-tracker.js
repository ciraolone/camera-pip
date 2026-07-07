/**
 * Face tracking della finestra PiP. FaceTracker rileva il volto con MediaPipe
 * (via mediapipe-loader.js) e pilota i meccanismi esistenti di zoom/offset di
 * CameraPiP per tenere gli occhi centrati in orizzontale a un terzo dall'alto.
 * Qui vivono il ciclo di vita (enable/disable, sospensioni) e i due loop:
 * detection a cadenza ridotta con filtro anti-tremolio (face-selection.js) e
 * movimento a requestAnimationFrame. Le decisioni sono delegate a
 * face-chase-policy.js, l'integrazione del moto alla molla di face-motion.js,
 * la matematica della vista a face-tracker-view.js e la taratura a
 * face-tracker-tuning.js. Persiste zoom/offset via IPC con throttle.
 */

class FaceTracker {
  constructor({ videoElement, applyZoom, applyOffset, getEffectiveFlip, getView }) {
    this.videoElement = videoElement;
    this.applyZoom = applyZoom;
    this.applyOffset = applyOffset;
    this.getView = getView;
    this.motion = new TrackingMotion();
    this.policy = new ChasePolicy({
      getView,
      getEffectiveFlip,
      getTuning: () => this.tuning,
      persistView: () => this.persistView(),
    });
    this.detector = null;
    // Taratura scelta dall'utente: arriva dai settings via setTuning (main → IPC)
    this.tuning = { maxZoom: 0, speed: 3, delaySeconds: 0, tolerance: 3 };
    this.isEnabled = false;
    this.face = null; // centro-occhi filtrato del volto agganciato, coordinate normalizzate del frame raw
    this.lastFaceSeenAt = 0;
    this.lastVideoTime = -1;
    this.detectionTimer = null;
    this.animationFrameId = null;
    this.lastFrameAt = 0;
    this.lastPersistAt = 0;
  }

  setTuning(tuning) {
    this.tuning = tuning;
    this.policy.clampZoomTarget(tuning.maxZoom);
  }

  async setEnabled(isEnabled) {
    this.isEnabled = isEnabled;
    if (!isEnabled) {
      this.stopLoops();
      return;
    }
    if (!this.detector) {
      try {
        this.detector = await loadFaceDetector();
        console.log('Face tracking: MediaPipe pronto');
      } catch (error) {
        console.error('Face tracking: inizializzazione MediaPipe fallita', error);
        this.isEnabled = false;
        return;
      }
    }
    // Il toggle può essere stato rispento durante l'attesa dell'init
    if (this.isEnabled) this.startLoops();
  }

  startLoops() {
    if (this.detectionTimer) return;
    // Il periodo di grazia senza volto parte da ora, non dall'epoca 0
    this.lastFaceSeenAt = this.lastFrameAt = performance.now();
    this.detectionTimer = setInterval(() => this.detectTick(), TRACKING_TUNING.detectionIntervalMs);
    this.animationFrameId = requestAnimationFrame((now) => this.movementTick(now));
  }

  stopLoops() {
    clearInterval(this.detectionTimer);
    cancelAnimationFrame(this.animationFrameId);
    this.detectionTimer = null;
    this.animationFrameId = null;
    this.face = null;
    this.policy.reset();
    this.motion.reset();
  }

  detectTick() {
    const video = this.videoElement;
    if (document.hidden || video.readyState < 2 || !video.videoWidth) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    const result = this.detector.detectForVideo(video, performance.now());
    const selected = selectTrackedFace(result.detections, this.face,
      TRACKING_TUNING.faceStickinessRatio, TRACKING_TUNING.sameFaceMaxDistance);
    if (!selected) {
      this.face = null;
      this.policy.onFaceLost();
      return;
    }
    this.face = smoothFacePosition(this.face, eyeCenterOf(selected),
      TRACKING_TUNING.faceSmoothingAlpha, TRACKING_TUNING.sameFaceMaxDistance);
    this.lastFaceSeenAt = performance.now();
  }

  movementTick(now) {
    this.animationFrameId = requestAnimationFrame((next) => this.movementTick(next));
    const deltaSeconds = Math.min(now - this.lastFrameAt, 100) / 1000;
    this.lastFrameAt = now;
    const geometry = computeViewGeometry(this.videoElement);
    if (!geometry) return;
    const desired = this.policy.desiredFor(this.face, this.lastFaceSeenAt, geometry, now);
    if (!desired) {
      this.motion.reset();
      return;
    }
    const view = this.getView();
    const omega = TRACKING_SPEED_OMEGAS[this.tuning.speed] * desired.speedBoost;
    const next = this.motion.step(view, desired, geometry, omega, deltaSeconds);
    const isStill = Math.abs(next.zoom - view.zoom) < 0.0005 && Math.abs(next.offsetX - view.offsetX) < 0.05 && Math.abs(next.offsetY - view.offsetY) < 0.05;
    if (isStill) return;
    this.applyZoom(next.zoom);
    this.applyOffset(next.offsetX, next.offsetY);
    if (now - this.lastPersistAt >= TRACKING_TUNING.persistIntervalMs) {
      this.lastPersistAt = now;
      this.persistView();
    }
  }

  persistView() {
    const view = this.getView();
    window.electronAPI.send('zoom-request', 'set-level', view.zoom);
    window.electronAPI.send('offset-request', 'set-position', { x: view.offsetX, y: view.offsetY });
  }
}

/**
 * Face tracking della finestra PiP. FaceTracker coordina il rilevamento del
 * volto — delegato a face-detection-client.js, che fa girare MediaPipe in un
 * worker separato — e pilota i meccanismi esistenti di zoom/offset di
 * CameraPiP per tenere gli occhi centrati in orizzontale a un terzo dall'alto.
 * Qui vivono il ciclo di vita (enable/disable, sospensioni), i due loop
 * (invio frame a cadenza ridotta e movimento a requestAnimationFrame), il
 * filtro anti-tremolio (face-selection.js) e la sospensione automatica al
 * buio comandata dalla sentinella della luce (face-light-watcher.js).
 * Dell'immagine che si ferma non si occupa più: quella sorveglianza vale
 * anche a tracking spento e vive in video-stall-watcher.js. Le decisioni sono
 * delegate a face-chase-policy.js, il moto alla molla di face-motion.js,
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
    this.detection = new FaceDetectionClient({
      onDetections: (detections) => this.handleDetections(detections),
      onFatalError: () => this.setEnabled(false),
    });
    this.lightWatcher = new LightWatcher({
      videoElement,
      onDarkness: () => this.suspendForDarkness(),
      onLight: () => this.resumeFromDarkness(),
    });
    // Taratura scelta dall'utente: arriva dai settings via setTuning (main → IPC)
    this.tuning = { maxZoom: 0, speed: 3, delaySeconds: 0, tolerance: 3, framing: DEFAULT_TRACKING_FRAMING, easing: 1 };
    this.isEnabled = false;
    this.isSuspendedForDarkness = false; // rilevamento fermo perché la stanza è buia, tracking comunque acceso
    this.face = null; // centro-occhi filtrato del volto agganciato, coordinate normalizzate del frame raw
    this.lastFaceSeenAt = 0;
    this.lastVideoTime = -1;
    this.detectionTimer = null;
    this.animationFrameId = null;
    this.lastFrameAt = 0;
    this.lastPersistAt = 0;
    this.movementSpeed = 0; // px/s dell'ultimo passo applicato, letto dal pannello info
    this.peakMovementSpeed = 0; // picco della corsa in corso, azzerato quando il moto si ferma
  }

  getMovementSpeed() {
    return { current: this.movementSpeed, peak: this.peakMovementSpeed };
  }

  getLightState() {
    return { luma: this.lightWatcher.getLastLuma(), isSuspended: this.isSuspendedForDarkness };
  }

  setTuning(tuning) {
    this.tuning = tuning;
    this.policy.clampZoomTarget(tuning.maxZoom);
  }

  setEnabled(isEnabled) {
    this.isEnabled = isEnabled;
    if (!isEnabled) {
      this.detection.stop();
      this.stopLoops();
      return;
    }
    this.detection.start();
    this.startLoops();
  }

  startLoops() {
    if (this.detectionTimer) return;
    // Il periodo di grazia senza volto parte da ora, non dall'epoca 0
    this.lastFaceSeenAt = this.lastFrameAt = performance.now();
    this.lightWatcher.start();
    this.detectionTimer = setInterval(() => this.detectTick(), TRACKING_TUNING.detectionIntervalMs);
    this.animationFrameId = requestAnimationFrame((now) => this.movementTick(now));
  }

  stopLoops() {
    this.lightWatcher.stop();
    this.isSuspendedForDarkness = false;
    clearInterval(this.detectionTimer);
    cancelAnimationFrame(this.animationFrameId);
    this.detectionTimer = null;
    this.animationFrameId = null;
    this.face = null;
    this.policy.reset();
    this.motion.reset();
    this.movementSpeed = 0;
    this.peakMovementSpeed = 0;
  }

  detectTick() {
    const video = this.videoElement;
    if (document.hidden || video.readyState < 2 || !video.videoWidth) return;
    if (this.isSuspendedForDarkness) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    this.detection.requestDetection(video);
  }

  // Al buio il rilevamento non ha niente da trovare: si ferma il detector — e
  // con il worker che muore se ne va anche la memoria del runtime MediaPipe —
  // mentre l'inquadratura, dichiarato assente il volto, rientra alla vista
  // neutra con il solito movimento morbido, senza scatti. La camera resta
  // comunque sorvegliata: quel mestiere è di video-stall-watcher.js, che gira
  // sempre, anche a tracking spento.
  suspendForDarkness() {
    if (!this.isEnabled || this.isSuspendedForDarkness) return;
    console.log('Face tracking: troppo buio, rilevamento sospeso');
    this.isSuspendedForDarkness = true;
    this.detection.stop();
    this.face = null;
    this.policy.onFaceLost();
  }

  resumeFromDarkness() {
    if (!this.isEnabled || !this.isSuspendedForDarkness) return;
    console.log('Face tracking: luce tornata, rilevamento ripreso');
    this.isSuspendedForDarkness = false;
    this.detection.start();
  }

  handleDetections(detections) {
    const selected = selectTrackedFace(detections, this.face,
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
      this.recordMovementSpeed(0, deltaSeconds);
      return;
    }
    const view = this.getView();
    const omega = TRACKING_SPEED_OMEGAS[this.tuning.speed] * desired.speedBoost;
    const easingRatio = TRACKING_EASING_RATIOS[this.tuning.easing] ?? 0;
    const next = this.motion.step(view, desired, geometry, omega, easingRatio, deltaSeconds);
    // Il passo si scarta solo se è minuscolo *e* la vista è già arrivata: un
    // passo minuscolo mentre il bersaglio è ancora lontano è la partenza
    // graduale dell'easing, e scartarlo la faceva sparire del tutto.
    if (isTinyStep(view, next) && isAtTarget(view, desired)) {
      this.recordMovementSpeed(0, deltaSeconds);
      return;
    }
    this.recordMovementSpeed(Math.hypot(next.offsetX - view.offsetX, next.offsetY - view.offsetY), deltaSeconds);
    this.applyZoom(next.zoom);
    this.applyOffset(next.offsetX, next.offsetY);
    if (now - this.lastPersistAt >= TRACKING_TUNING.persistIntervalMs) {
      this.lastPersistAt = now;
      this.persistView();
    }
  }

  // deltaSeconds può essere 0 se due frame cadono nello stesso millisecondo.
  recordMovementSpeed(distance, deltaSeconds) {
    const speed = deltaSeconds > 0 ? distance / deltaSeconds : 0;
    // Il picco si azzera all'inizio di una corsa nuova, non alla fine di
    // quella vecchia: così dopo l'arrivo resta leggibile nel pannello info.
    if (this.movementSpeed === 0 && speed > 0) this.peakMovementSpeed = 0;
    this.movementSpeed = speed;
    this.peakMovementSpeed = Math.max(this.peakMovementSpeed, speed);
  }

  persistView() {
    const view = this.getView();
    window.electronAPI.send('zoom-request', 'set-level', view.zoom);
    window.electronAPI.send('offset-request', 'set-position', { x: view.offsetX, y: view.offsetY });
  }
}

/**
 * Politica di inseguimento del face tracking: decide, frame per frame, se e
 * verso quale vista muoversi. Contiene la zona morta con isteresi e ritardo
 * di partenza, la scelta del minimo zoom necessario con anti flip-flop, il
 * rientro dello zoom quando non è più indispensabile e il ritorno alla vista
 * neutra quando il volto manca da qualche secondo. Ritorna null quando non
 * c'è niente da fare, altrimenti un target {zoom, offsetX, offsetY,
 * speedBoost} che face-tracker.js integra con la molla di face-motion.js.
 */

class ChasePolicy {
  constructor({ getView, getEffectiveFlip, getTuning, persistView }) {
    this.getView = getView;
    this.getEffectiveFlip = getEffectiveFlip;
    this.getTuning = getTuning;
    this.persistView = persistView;
    this.reset();
  }

  reset() {
    this.isChasing = false;
    this.isReleasingZoom = false;
    this.chasePendingSince = null;
    this.zoomTarget = 1;
  }

  clampZoomTarget(maxZoom) {
    this.zoomTarget = Math.min(this.zoomTarget, Math.max(maxZoom, 1));
  }

  onFaceLost() {
    this.chasePendingSince = null;
  }

  desiredFor(face, lastFaceSeenAt, geometry, now) {
    if (!face) return this.neutralReturn(lastFaceSeenAt, now);
    const view = this.getView();
    const isFlipped = this.getEffectiveFlip() === 'flipped';
    const placement = computeFacePlacement(face, geometry, isFlipped, TRACKING_TUNING.targetEyeFraction);
    const shortSide = Math.min(geometry.windowWidth, geometry.windowHeight);
    const error = faceErrorAt(placement, view.zoom, view.offsetX, view.offsetY);
    if (!this.shouldChase(error, shortSide, now)) {
      return this.maybeReleaseZoom(placement, geometry, view, shortSide);
    }
    const zoom = this.getTuning().maxZoom > 0 ? this.updateZoomTarget(placement, geometry, shortSide) : view.zoom;
    // Spostamenti ampi → passo più deciso: il boost cresce con l'errore e satura
    const speedBoost = 1 + TRACKING_TUNING.adaptiveSpeedGain * Math.min(error / shortSide / TRACKING_TUNING.adaptiveSpeedSpan, 1);
    return { zoom, speedBoost, ...desiredOffsetsFor(placement, zoom) };
  }

  // Zona morta con isteresi più ritardo di partenza: l'inseguimento parte solo
  // se il volto resta fuori tolleranza per tutto il ritardo configurato.
  shouldChase(error, shortSide, now) {
    const tuning = this.getTuning();
    if (this.isChasing) {
      if (error >= TRACKING_TUNING.deadZoneStopFraction * shortSide) return true;
      this.isChasing = false;
      this.persistView(); // fotografa la posizione di riposo appena raggiunta
      return false;
    }
    if (error < TRACKING_TOLERANCE_FRACTIONS[tuning.tolerance] * shortSide) {
      this.chasePendingSince = null;
      return false;
    }
    if (this.chasePendingSince === null) this.chasePendingSince = now;
    if (now - this.chasePendingSince < tuning.delaySeconds * 1000) return false;
    this.chasePendingSince = null;
    this.isChasing = true;
    return true;
  }

  // Il target di zoom sale subito al minimo necessario, ma scende solo con un
  // margine: evita il flip-flop quando il volto balla attorno alla soglia.
  updateZoomTarget(placement, geometry, shortSide) {
    const needed = minimalZoomFor(placement, geometry, this.getTuning().maxZoom,
      TRACKING_TUNING.deadZoneStopFraction * shortSide, TRACKING_TUNING.zoomScanStep);
    if (needed > this.zoomTarget) this.zoomTarget = needed;
    if (needed <= this.zoomTarget - TRACKING_TUNING.zoomReleaseMargin) this.zoomTarget = Math.max(needed, 1);
    return this.zoomTarget;
  }

  // Lo zoom si tiene sempre al minimo indispensabile: quando l'inseguimento è
  // fermo e l'ingrandimento supera il necessario, rientra da solo tenendo il
  // volto fermo sullo schermo (gli offset compensano la scalatura).
  maybeReleaseZoom(placement, geometry, view, shortSide) {
    const maxZoom = this.getTuning().maxZoom;
    if (maxZoom <= 0) return null;
    const needed = minimalZoomFor(placement, geometry, maxZoom,
      TRACKING_TUNING.deadZoneStopFraction * shortSide, TRACKING_TUNING.zoomScanStep);
    // Il target scende solo con margine (anti flip-flop) e mai sotto il necessario
    if (needed > this.zoomTarget || needed <= this.zoomTarget - TRACKING_TUNING.zoomReleaseMargin) {
      this.zoomTarget = Math.min(Math.max(needed, 1), maxZoom);
    }
    if (view.zoom <= this.zoomTarget + 0.01) {
      if (this.isReleasingZoom) {
        this.isReleasingZoom = false;
        this.persistView(); // fotografa lo zoom di riposo raggiunto
      }
      return null;
    }
    this.isReleasingZoom = true;
    return { zoom: this.zoomTarget, speedBoost: 1, ...zoomReleaseOffsetsFor(placement, view, this.zoomTarget) };
  }

  neutralReturn(lastFaceSeenAt, now) {
    if (now - lastFaceSeenAt < TRACKING_TUNING.faceAbsenceTimeoutMs) return null;
    const view = this.getView();
    // Con "Tracking Zoom" su Off lo zoom appartiene all'utente: si rientra solo con l'offset
    const neutralZoom = this.getTuning().maxZoom > 0 ? 1 : view.zoom;
    const isNeutral = Math.abs(view.offsetX) < 0.5 && Math.abs(view.offsetY) < 0.5 && Math.abs(view.zoom - neutralZoom) < 0.005;
    if (!isNeutral) {
      this.isChasing = true;
      this.zoomTarget = 1;
      return { zoom: neutralZoom, offsetX: 0, offsetY: 0, speedBoost: 1 };
    }
    if (this.isChasing) {
      this.isChasing = false;
      this.persistView(); // fotografa la vista neutra raggiunta
    }
    return null;
  }
}

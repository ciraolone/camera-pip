/**
 * Integrazione del movimento del face tracking: una molla criticamente
 * smorzata per ciascuna componente (offset X/Y e zoom) che accelera
 * dolcemente e decelera senza oltrepassare il bersaglio. Tiene lo stato
 * delle velocità fra un frame e l'altro; il clamp ai bordi azzera la
 * velocità della componente bloccata per evitare cariche residue che
 * scatterebbero al rilascio. Usato solo da face-tracker.js.
 */

class TrackingMotion {
  constructor() {
    this.reset();
  }

  reset() {
    this.velocityX = 0;
    this.velocityY = 0;
    this.velocityZoom = 0;
  }

  // Un passo di integrazione dalla vista corrente verso il target desired
  // ({zoom, offsetX, offsetY}); ritorna la vista da applicare.
  step(view, desired, geometry, omega, deltaSeconds) {
    const zoomStep = springStep(view.zoom, this.velocityZoom, desired.zoom, omega, deltaSeconds);
    const zoom = Math.max(zoomStep.position, 1);
    this.velocityZoom = zoom === zoomStep.position ? zoomStep.velocity : 0;
    const bounds = offsetBoundsFor(geometry, zoom);
    const stepX = springStep(view.offsetX, this.velocityX, desired.offsetX, omega, deltaSeconds);
    const stepY = springStep(view.offsetY, this.velocityY, desired.offsetY, omega, deltaSeconds);
    const offsetX = clampAbs(stepX.position, bounds.x);
    const offsetY = clampAbs(stepY.position, bounds.y);
    this.velocityX = offsetX === stepX.position ? stepX.velocity : 0;
    this.velocityY = offsetY === stepY.position ? stepY.velocity : 0;
    return { zoom, offsetX, offsetY };
  }
}

// Molla criticamente smorzata: converge al bersaglio senza oscillare, con
// velocità che parte da zero e si spegne all'arrivo. omega in rad/s.
function springStep(position, velocity, target, omega, deltaSeconds) {
  const acceleration = omega * omega * (target - position) - 2 * omega * velocity;
  const nextVelocity = velocity + acceleration * deltaSeconds;
  return { position: position + nextVelocity * deltaSeconds, velocity: nextVelocity };
}

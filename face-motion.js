/**
 * Integrazione del movimento del face tracking: una molla criticamente
 * smorzata per ciascuna componente (offset X/Y e zoom) che accelera
 * dolcemente e decelera senza oltrepassare il bersaglio, con in più un
 * ammorbidimento regolabile dell'accelerazione che accentua la partenza e
 * l'arrivo graduali. Tiene fra un frame e l'altro la velocità e
 * l'accelerazione di ogni componente; il clamp ai bordi azzera entrambe per
 * la componente bloccata, per evitare cariche residue che scatterebbero al
 * rilascio. Usato solo da face-tracker.js.
 */

class TrackingMotion {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = restingComponent();
    this.y = restingComponent();
    this.zoom = restingComponent();
  }

  // Un passo di integrazione dalla vista corrente verso il target desired
  // ({zoom, offsetX, offsetY}); ritorna la vista da applicare.
  step(view, desired, geometry, omega, easingRatio, deltaSeconds) {
    const easing = accelerationSmoothingFor(omega, easingRatio, deltaSeconds);
    const zoomStep = springStep(view.zoom, this.zoom, desired.zoom, omega, easing, deltaSeconds);
    const zoom = Math.max(zoomStep.position, 1);
    this.zoom = zoom === zoomStep.position ? zoomStep : restingComponent();
    const bounds = offsetBoundsFor(geometry, zoom);
    const stepX = springStep(view.offsetX, this.x, desired.offsetX, omega, easing, deltaSeconds);
    const stepY = springStep(view.offsetY, this.y, desired.offsetY, omega, easing, deltaSeconds);
    const offsetX = clampAbs(stepX.position, bounds.x);
    const offsetY = clampAbs(stepY.position, bounds.y);
    this.x = offsetX === stepX.position ? stepX : restingComponent();
    this.y = offsetY === stepY.position ? stepY : restingComponent();
    return { zoom, offsetX, offsetY };
  }
}

function restingComponent() {
  return { velocity: 0, acceleration: 0 };
}

// Quanto l'accelerazione può cambiare in un frame. Senza filtro la molla parte
// già alla spinta massima: è quello che rende la partenza poco graduale. La
// costante di tempo è una frazione di 1/omega invece di un valore assoluto,
// così l'effetto resta lo stesso a tutte le velocità e il polo aggiunto non si
// avvicina mai a quello della molla — è la condizione che tiene il sistema
// senza oscillazioni (verificato in simulazione su tutte le combinazioni).
function accelerationSmoothingFor(omega, easingRatio, deltaSeconds) {
  if (easingRatio <= 0) return 1;
  return 1 - Math.exp(-deltaSeconds * omega / easingRatio);
}

// Molla criticamente smorzata: converge al bersaglio senza oscillare, con
// velocità che parte da zero e si spegne all'arrivo. omega in rad/s.
function springStep(position, component, target, omega, easing, deltaSeconds) {
  const commanded = omega * omega * (target - position) - 2 * omega * component.velocity;
  const acceleration = component.acceleration + (commanded - component.acceleration) * easing;
  const velocity = component.velocity + acceleration * deltaSeconds;
  return { position: position + velocity * deltaSeconds, velocity, acceleration };
}

/**
 * Matematica pura della vista per il face tracking: converte le coordinate
 * normalizzate del volto (frame raw della webcam) nella geometria della
 * finestra, calcola gli offset che portano gli occhi sul punto bersaglio, il
 * clamp che impedisce all'inquadratura di uscire dai bordi dell'immagine e il
 * minimo zoom necessario. L'inquadratura mira sempre al punto bersaglio; la
 * zona ammessa è solo un metro alternativo per misurare l'errore, e serve a
 * decidere quando muoversi e quanto zoom tenere a riposo. Solo funzioni pure
 * senza stato: lo stato e i loop vivono in face-tracker.js, che con
 * face-chase-policy.js è l'unico consumatore di questo file.
 */

// Misure di layout (offsetWidth/Height), non toccate dai transform CSS: con
// object-fit: contain l'area video visibile può essere più piccola dell'elemento
// per camere non-16:9.
function computeViewGeometry(videoElement) {
  if (!videoElement.videoWidth || !videoElement.videoHeight) return null;
  const scale = Math.min(
    videoElement.offsetWidth / videoElement.videoWidth,
    videoElement.offsetHeight / videoElement.videoHeight
  );
  return {
    contentWidth: videoElement.videoWidth * scale,
    contentHeight: videoElement.videoHeight * scale,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
  };
}

// Posizione del volto nel piano dell'elemento (origine al centro), punto
// bersaglio e bordi della zona ammessa. Le coordinate del volto arrivano dal
// frame raw, mai specchiato: il flip entra solo nella posizione a schermo.
function computeFacePlacement(face, geometry, isFlipped, zone) {
  return {
    flipSign: isFlipped ? -1 : 1,
    faceCx: (face.u - 0.5) * geometry.contentWidth,
    faceCy: (face.v - 0.5) * geometry.contentHeight,
    targetX: (zone.targetX - 0.5) * geometry.windowWidth,
    targetY: (zone.targetY - 0.5) * geometry.windowHeight,
    zoneLeft: (zone.left - 0.5) * geometry.windowWidth,
    zoneRight: (zone.right - 0.5) * geometry.windowWidth,
    zoneTop: (zone.top - 0.5) * geometry.windowHeight,
    zoneBottom: (zone.bottom - 0.5) * geometry.windowHeight,
  };
}

// Dove appaiono gli occhi nella finestra (origine al centro) con questi zoom e
// offset. Con flip attivo lo specchio inverte solo l'asse orizzontale.
function screenPositionOf(placement, zoom, offsetX, offsetY) {
  return {
    x: placement.flipSign * (zoom * placement.faceCx + offsetX),
    y: zoom * placement.faceCy + offsetY,
  };
}

function clampBetween(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

// Gli offset che portano gli occhi esattamente sul punto bersaglio. È l'unico
// bersaglio dell'inquadratura: la zona non sposta mai la mira, decide soltanto
// quando vale la pena muoversi (vedi faceErrorFromZone).
function desiredOffsetsFor(placement, zoom) {
  return {
    offsetX: placement.flipSign * placement.targetX - zoom * placement.faceCx,
    offsetY: placement.targetY - zoom * placement.faceCy,
  };
}

// Distanza in pixel dal punto bersaglio: dice quanto manca all'inquadratura
// giusta, quindi governa l'arresto dell'inseguimento e il calcolo dello zoom.
function faceErrorFromTarget(placement, zoom, offsetX, offsetY) {
  const screen = screenPositionOf(placement, zoom, offsetX, offsetY);
  return Math.hypot(screen.x - placement.targetX, screen.y - placement.targetY);
}

// Distanza in pixel dalla zona ammessa, zero finché gli occhi ci stanno
// dentro: dice se c'è motivo di muoversi, quindi governa la partenza
// dell'inseguimento e fin dove lo zoom può rientrare a riposo.
function faceErrorFromZone(placement, zoom, offsetX, offsetY) {
  const screen = screenPositionOf(placement, zoom, offsetX, offsetY);
  return Math.hypot(
    screen.x - clampBetween(screen.x, placement.zoneLeft, placement.zoneRight),
    screen.y - clampBetween(screen.y, placement.zoneTop, placement.zoneBottom)
  );
}

// Clamp ai bordi (invariante del plan della feature 001): oltre questi limiti
// comparirebbero bande vuote ai lati del riquadro.
function offsetBoundsFor(geometry, zoom) {
  return {
    x: Math.max(0, (geometry.contentWidth * zoom - geometry.windowWidth) / 2),
    y: Math.max(0, (geometry.contentHeight * zoom - geometry.windowHeight) / 2),
  };
}

function clampAbs(value, bound) {
  return Math.min(Math.max(value, -bound), bound);
}

// Offset che mantengono il volto fermo sullo schermo mentre lo zoom scende a
// un nuovo valore: si ricava la posizione attuale a schermo e la si impone al
// nuovo zoom. Usato dal release "zoom al minimo indispensabile".
function zoomReleaseOffsetsFor(placement, view, zoom) {
  const screen = screenPositionOf(placement, view.zoom, view.offsetX, view.offsetY);
  return {
    offsetX: placement.flipSign * screen.x - zoom * placement.faceCx,
    offsetY: screen.y - zoom * placement.faceCy,
  };
}

// L'errore che resta a questo zoom dopo aver puntato al bersaglio e subito il
// clamp ai bordi: zero quando il bersaglio è raggiungibile, positivo quando
// l'immagine finisce prima. errorAt sceglie il metro (bersaglio o zona).
function residualErrorAt(placement, geometry, zoom, errorAt) {
  const bounds = offsetBoundsFor(geometry, zoom);
  const offsets = desiredOffsetsFor(placement, zoom);
  return errorAt(placement, zoom, clampAbs(offsets.offsetX, bounds.x), clampAbs(offsets.offsetY, bounds.y));
}

// Il minimo zoom (a passi di scanStep) che porta l'errore misurato da errorAt
// entro stopRadius rispettando il clamp; maxZoom se non basta mai.
function minimalZoomFor(placement, geometry, maxZoom, stopRadius, scanStep, errorAt) {
  for (let zoom = 1; zoom <= maxZoom + 1e-9; zoom += scanStep) {
    if (residualErrorAt(placement, geometry, zoom, errorAt) <= stopRadius) return zoom;
  }
  return maxZoom;
}

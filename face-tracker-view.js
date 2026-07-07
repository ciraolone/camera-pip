/**
 * Matematica pura della vista per il face tracking: converte le coordinate
 * normalizzate del volto (frame raw della webcam) nella geometria della
 * finestra, calcola gli offset che portano gli occhi nel punto bersaglio, il
 * clamp che impedisce all'inquadratura di uscire dai bordi dell'immagine e il
 * minimo zoom necessario a rendere raggiungibile il bersaglio. Solo funzioni
 * pure senza stato: lo stato e i loop vivono in face-tracker.js, che è
 * l'unico consumatore di questo file.
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

// Posizione del volto nel piano dell'elemento (origine al centro) e bersaglio
// verticale degli occhi. Le coordinate del volto arrivano dal frame raw, mai
// specchiato: il flip entra solo nel calcolo della posizione a schermo.
function computeFacePlacement(face, geometry, isFlipped, targetEyeFraction) {
  return {
    flipSign: isFlipped ? -1 : 1,
    faceCx: (face.u - 0.5) * geometry.contentWidth,
    faceCy: (face.v - 0.5) * geometry.contentHeight,
    targetY: (targetEyeFraction - 0.5) * geometry.windowHeight,
  };
}

// L'offset che centra il volto in orizzontale è identico con e senza flip:
// lo specchio mappa il centro sul centro. Cambierebbe solo con un bersaglio
// orizzontale diverso dal centro (targetX ≠ 0).
function desiredOffsetsFor(placement, zoom) {
  return {
    offsetX: -zoom * placement.faceCx,
    offsetY: placement.targetY - zoom * placement.faceCy,
  };
}

// Distanza in pixel fra dove appaiono gli occhi a schermo e il punto bersaglio.
function faceErrorAt(placement, zoom, offsetX, offsetY) {
  const screenX = placement.flipSign * (zoom * placement.faceCx + offsetX);
  const screenY = zoom * placement.faceCy + offsetY;
  return Math.hypot(screenX, screenY - placement.targetY);
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
  const screenX = placement.flipSign * (view.zoom * placement.faceCx + view.offsetX);
  const screenY = view.zoom * placement.faceCy + view.offsetY;
  return {
    offsetX: placement.flipSign * screenX - zoom * placement.faceCx,
    offsetY: screenY - zoom * placement.faceCy,
  };
}

// Il minimo zoom (a passi di scanStep) con cui il bersaglio diventa
// raggiungibile rispettando il clamp; maxZoom se non basta mai.
function minimalZoomFor(placement, geometry, maxZoom, stopRadius, scanStep) {
  for (let zoom = 1; zoom <= maxZoom + 1e-9; zoom += scanStep) {
    const bounds = offsetBoundsFor(geometry, zoom);
    const offsets = desiredOffsetsFor(placement, zoom);
    const offsetX = clampAbs(offsets.offsetX, bounds.x);
    const offsetY = clampAbs(offsets.offsetY, bounds.y);
    if (faceErrorAt(placement, zoom, offsetX, offsetY) <= stopRadius) return zoom;
  }
  return maxZoom;
}

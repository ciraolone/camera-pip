/**
 * Selezione del volto da inseguire fra i rilevamenti di MediaPipe: vince il
 * più grande nell'immagine (il più vicino alla webcam), con un'isteresi che
 * tiene agganciato il volto già inseguito finché resta di dimensioni
 * paragonabili, per non saltare fra volti simili. Funzioni pure senza stato,
 * usate solo da face-tracker.js, che passa il volto dell'ultimo giro e le
 * soglie di taratura.
 */

// previousFace è il centro-occhi dell'ultimo giro ({u, v} normalizzati) o null.
function selectTrackedFace(detections, previousFace, stickinessRatio, sameFaceMaxDistance) {
  if (!detections || detections.length === 0) return null;
  let largest = detections[0];
  for (const detection of detections) {
    if (faceAreaOf(detection) > faceAreaOf(largest)) largest = detection;
  }
  const tracked = findPreviousFace(detections, previousFace, sameFaceMaxDistance);
  if (tracked && faceAreaOf(tracked) >= faceAreaOf(largest) * stickinessRatio) return tracked;
  return largest;
}

// Il volto già agganciato è quello col centro-occhi più vicino a quello
// dell'ultimo giro, se abbastanza vicino da poter essere lo stesso volto.
function findPreviousFace(detections, previousFace, sameFaceMaxDistance) {
  if (!previousFace) return null;
  let best = null;
  let bestDistance = sameFaceMaxDistance;
  for (const detection of detections) {
    const eyes = eyeCenterOf(detection);
    const distance = Math.hypot(eyes.u - previousFace.u, eyes.v - previousFace.v);
    if (distance < bestDistance) {
      best = detection;
      bestDistance = distance;
    }
  }
  return best;
}

function faceAreaOf(detection) {
  return detection.boundingBox.width * detection.boundingBox.height;
}

// Keypoint 0 e 1 di BlazeFace: occhio destro e sinistro, normalizzati sul frame raw.
function eyeCenterOf(detection) {
  const [rightEye, leftEye] = detection.keypoints;
  return { u: (rightEye.x + leftEye.x) / 2, v: (rightEye.y + leftEye.y) / 2 };
}

// Filtro anti-tremolio: media mobile esponenziale sul centro-occhi per
// assorbire il micro-rumore della detection. Oltre snapDistance si riparte
// dalla posizione nuova (cambio volto o spostamento repentino), senza
// trascinare la media attraverso il salto.
function smoothFacePosition(previousFace, eyes, smoothingAlpha, snapDistance) {
  if (!previousFace) return eyes;
  if (Math.hypot(eyes.u - previousFace.u, eyes.v - previousFace.v) > snapDistance) return eyes;
  return {
    u: previousFace.u + (eyes.u - previousFace.u) * smoothingAlpha,
    v: previousFace.v + (eyes.v - previousFace.v) * smoothingAlpha,
  };
}

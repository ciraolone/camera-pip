/**
 * Riquadro diagnostico del face tracking, disegnato sopra il video: mostra la
 * zona in cui il volto è considerato a posto e il mirino del punto bersaglio
 * verso cui l'inseguimento lo porta quando ne esce. Serve a capire a occhio
 * cosa sta facendo il tracking, quindi compare insieme al pannello info della
 * webcam e si aggiorna a ogni cambio di taratura. I bordi arrivano da
 * TRACKING_FRAMING_ZONES, la stessa mappa che usa la policy: il riquadro non
 * può quindi mentire su dove sia davvero la zona. Usato solo da renderer.js.
 */

class FramingOverlay {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.zoneElement = rootElement.querySelector('#framing-zone');
    this.targetElement = rootElement.querySelector('#framing-target');
    this.framing = DEFAULT_TRACKING_FRAMING;
    this.isVisible = false;
  }

  setFraming(framing) {
    this.framing = framing;
    this.render();
  }

  setVisible(isVisible) {
    this.isVisible = isVisible;
    this.render();
  }

  render() {
    this.rootElement.classList.toggle('visible', this.isVisible);
    if (!this.isVisible) return;
    const zone = TRACKING_FRAMING_ZONES[this.framing] ?? TRACKING_FRAMING_ZONES[DEFAULT_TRACKING_FRAMING];
    this.zoneElement.style.left = toPercent(zone.left);
    this.zoneElement.style.top = toPercent(zone.top);
    this.zoneElement.style.width = toPercent(zone.right - zone.left);
    this.zoneElement.style.height = toPercent(zone.bottom - zone.top);
    this.targetElement.style.left = toPercent(zone.targetX);
    this.targetElement.style.top = toPercent(zone.targetY);
  }
}

function toPercent(fraction) {
  return `${fraction * 100}%`;
}

# Camera PiP

Webcam Picture-in-Picture per Windows (Electron).

## Scopo

Mostra il feed della webcam in una piccola finestra frameless sempre in primo piano, ridimensionabile e posizionabile liberamente. Pensata per video call / streaming dove vuoi tenere d'occhio la tua camera senza ingombrare lo schermo: un modo pratico per controllare inquadratura, posa e luce mentre lavori in altre finestre.

Spostamento e ridimensionamento avvengono sempre tramite [AltSnap](https://github.com/RamonUnch/AltSnap) (Alt+drag).

## Build

```bash
npm run build
```

Usa `build.js` custom invece di `electron-builder` diretto: su questo sistema mancano i privilegi per creare symbolic link, quindi `signAndEditExecutable: false` disabilita il download di `winCodeSign`, e un passaggio con `rcedit` incorpora icona e metadati nell'`.exe` dopo il packaging.

## Note

- Titolo finestra: "Ciraolone" (soprannome intenzionale).
- `icon.png` (512x512) e il sorgente per rigenerare `icon.ico` se serve.

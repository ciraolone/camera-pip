# Camera PiP - CLAUDE.md

## Obiettivo Principale

**Camera PiP** è un'applicazione Electron per Windows che fornisce una finestra Picture-in-Picture per webcam con controlli avanzati. L'applicazione permette di visualizzare il feed della webcam in una finestra sempre in primo piano, ridimensionabile e posizionabile liberamente sullo schermo.

## Configurazioni Importanti

### Struttura del Progetto
- **main.js**: Processo principale Electron con gestione finestre, menu contestuali e IPC
- **renderer.js**: Logica frontend per gestione webcam, zoom, offset e auto-flip
- **preload.js**: Bridge sicuro tra renderer e main process
- **index.html**: UI principale dell'applicazione
- **package.json**: Configurazione Electron con script di build per Windows

### Configurazioni Webcam
- **Risoluzioni supportate**: Default, 4K, 1080p, 720p, 480p, 360p
- **Frame rates**: Default, 60, 59.94, 50, 30, 29.97, 25, 24 FPS
- **Modalità flip**: Normal, Flipped, Auto (con hysteresis per posizione finestra)

### Persistenza Dati
- Utilizza `electron-store` per salvare impostazioni utente
- Utilizza `electron-window-state` per ricordare posizione e dimensioni finestra

## Problemi Risolti e Soluzioni

### Auto Flip con Hysteresis e Persistenza Stato
**Problema**: Il flip automatico della webcam cambiava troppo frequentemente quando la finestra era vicina al centro dello schermo e non persisteva lo stato tra le sessioni.

**Soluzione**: Implementato sistema avanzato di hysteresis con persistenza:
- **Attivazione flip**: 60% dello schermo (da sinistra)
- **Disattivazione flip**: 40% dello schermo (da sinistra)  
- **Delay**: 1 secondo prima di applicare il cambio
- **Timer reset**: Annulla timer pendenti quando la finestra si sposta nuovamente
- **Persistenza stato**: `autoFlipActive` salvato in electron-store e ripristinato all'avvio
- **Controllo immediato**: Funzione `checkAutoFlipImmediate()` per eventi window focus/visibility
- **IPC sync**: Comunicazione bidirezionale main ↔ renderer per sincronizzazione stato

### Frame Rate Options
**Recente aggiunta**: Supporto per 25 FPS e 50 FPS nelle opzioni di frame rate.

### Gestione Zoom e Offset
**Problema**: Sincronizzazione tra processo principale e renderer per zoom/offset.

**Soluzione**: 
- IPC bidirezionale per aggiornamenti
- Gestione keyboard shortcuts con debouncing (150ms)
- Limiti di zoom (1.0x - 5.0x) e offset (-200px - +200px)

## Best Practices Emerse

### Gestione Errori Webcam
1. **Retry automatico** con fallback a risoluzione 720p@30fps
2. **Gestione permessi** specifici per piattaforma (macOS Camera permission)
3. **Error handling** categorizzato per tipo di errore

### Performance
1. **Debouncing** per eventi keyboard (150ms)
2. **Interval timer** per aggiornamenti posizione finestra (500ms)
3. **Event cleanup** appropriato per streams webcam

### Sicurezza
1. **Context isolation** abilitato
2. **Node integration** disabilitato
3. **Web security** abilitato
4. **Preload script** per API bridge sicuro

## Scorciatoie da Tastiera

- **Ctrl/Cmd + I**: Toggle info webcam
- **Ctrl/Cmd + +**: Zoom in
- **Ctrl/Cmd + -**: Zoom out  
- **Ctrl/Cmd + 0**: Reset zoom e offset
- **Ctrl/Cmd + Frecce**: Sposta offset webcam

## Script di Build

### Development
```bash
npm start          # Avvia in modalità sviluppo
npm run dev        # Avvia con logging abilitato
```

### Production
```bash
npm run build      # Build con electron-builder (ZIP con versioning)
```

### Problemi Build Tools
**electron-packager**: Non funziona su questo sistema a causa di errori di privilegi sui symbolic link per code signing. Genera errori come:
```
ERROR: Cannot create symbolic link : A required privilege is not held by the client
```

**electron-builder**: Funziona correttamente e crea ZIP file distribuibili con gestione automatica delle versioni.

### Build System - Dettagli Implementazione
- **Script build**: Cancella automaticamente la versione corrente esistente prima di ricrearla
- **Naming**: `Camera-PiP-v{version}.zip` (es. `Camera-PiP-v1.1.0.zip`)
- **Versioni precedenti**: Mantenute automaticamente in `dist/`
- **Note package.json**: electron-builder funziona correttamente | electron-packager ha errori privilegi symbolic link

## Note Tecniche Specifiche

### Auto Flip Logic
- Posizione finestra calcolata come percentuale larghezza schermo
- Centro finestra utilizzato come punto di riferimento
- Sistema di hysteresis previene oscillazioni continue
- Timer delayed execution per stabilità (1000ms delay)
- **Event-driven immediato**: `checkAutoFlipImmediate()` per focus/visibility events
- **Persistenza stato**: `autoFlipActive` sincronizzato tra main e renderer via IPC
- **Timer management**: Reset automatico timer pendenti su cambi modalità o eventi immediati

### Video Constraints
- Fallback automatico a constraints meno restrittivi in caso di `OverconstrainedError`
- Gestione dinamica device ID per selezione webcam
- Support per richieste resolution e framerate ideali

### Window Management
- Frame disabled per look moderno
- Always on top opzionale 
- Context menu per tutte le configurazioni
- Window state persistence tra sessioni

### Gestione Stato
- Settings centralizzati in `electron-store`
- Sync bidirezionale main ↔ renderer
- Auto-save per tutte le modifiche configurazione

## Build System Completo

### Build Tools Supportati
- **electron-builder**: ✅ **FUNZIONANTE** - Tool principale per build e packaging
- **electron-packager**: ❌ **NON FUNZIONANTE** - Errori privilegi symbolic link

### Configurazione Build Ottimizzata
La configurazione è stata ottimizzata per creare solo file ZIP versionati:

#### package.json - sezione scripts:
```json
{
  "build": "node -e \"const fs=require('fs'),path=require('path'),{version}=require('./package.json');const oldZip=path.join('dist',`Camera-PiP-v${version}.zip`);if(fs.existsSync(oldZip))fs.unlinkSync(oldZip);\" && electron-builder"
}
```

#### package.json - sezione build:
```json
{
  "build": {
    "appId": "com.camerapip.app",
    "productName": "Camera PiP",
    "directories": {
      "output": "dist"
    },
    "files": ["**/*"],
    "win": {
      "target": "zip",
      "sign": false,
      "icon": null,
      "artifactName": "Camera-PiP-v${version}.${ext}"
    }
  }
}
```

### Gestione Versioni Automatica
- **Script intelligente**: Cancella automaticamente solo la versione corrente esistente
- **Naming pattern**: `Camera-PiP-v{version}.zip` (es. `Camera-PiP-v1.1.0.zip`)
- **Versioni precedenti**: Mantenute automaticamente in `dist/`
- **Output pulito**: Solo file essenziali nel risultato finale

### Problemi Risolti durante Sviluppo

#### Problema Code Signing
**Issue**: Errori di privilegi sui symbolic link durante download tool di code signing:
```
ERROR: Cannot create symbolic link : A required privilege is not held by the client
```
**Soluzione**: Configurato `"sign": false` - errori ignorabili, build funziona comunque

#### Problema Configurazione artifactName
**Issue**: `artifactName` a livello globale non funzionava con target ZIP
**Soluzione**: Spostato `artifactName` dentro la sezione `win` specifica (da documentazione electron-builder)

#### Problema Script Ridondanti  
**Issue**: Multipli script di build (`build`, `build:win`, `dist`, `package`, `package:clean`)
**Soluzione**: Eliminati tutti tranne `build` con electron-builder + script gestione versioni

## Dipendenze Principali

- **electron**: ^28.0.0 - Framework applicazione
- **electron-store**: ^10.1.0 - Persistenza settings
- **electron-window-state**: ^5.0.3 - Gestione stato finestra
- **electron-builder**: ^24.13.3 - Build e packaging (UNICO SUPPORTATO)

## Build Target Finale

- **Platform**: Windows (win32)
- **Architecture**: x64
- **Output**: ZIP file versionato in cartella `dist/`
- **App ID**: com.camerapip.app
- **Product Name**: Camera PiP
- **File risultante**: `Camera-PiP-v1.1.0.zip` (177MB circa)
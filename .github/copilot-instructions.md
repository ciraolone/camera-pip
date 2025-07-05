<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Camera PiP - Istruzioni per Copilot

## Descrizione del Progetto
Applicazione Electron per Windows che mostra il feed della webcam in una finestra desktop. L'app è progettata per essere semplice, intuitiva e robusta, con un'interfaccia moderna e pulita. Il codice è stato completamente refactorato per seguire le best practice moderne.

## Ambiente di Utilizzo
- **Sistema Operativo**: Windows (primario), macOS e Linux supportati
- **Webcam**: OBSBOT Tail Air Camera (testata), compatibile con qualsiasi webcam WebRTC
- **Versione Electron**: 28.x
- **Node.js**: Versione moderna con supporto ES modules

## Tecnologie e Librerie Utilizzate
- **Electron**: Framework per applicazioni desktop (v28.x)
- **HTML/CSS/JavaScript**: Frontend dell'applicazione
- **WebRTC getUserMedia API**: Accesso sicuro alla webcam
- **Electron Store**: Persistenza delle impostazioni utente
- **Electron Window State**: Gestione stato finestra (posizione/dimensioni)
- **IPC (Inter-Process Communication)**: Comunicazione sicura tra processi

## Architettura del Progetto
```
Camera PiP/
├── main.js           # Processo principale Electron (Main Process)
├── renderer.js       # Logica frontend e gestione webcam (Renderer Process)
├── preload.js        # Script sicurezza per IPC
├── index.html        # Interfaccia utente principale
├── package.json      # Configurazione progetto e dipendenze
└── README.md         # Documentazione completa
```

## Funzionalità Implementate
### Core Features
- ✅ Selezione dinamica webcam da menu
- ✅ Persistenza completa delle impostazioni
- ✅ Ripristino automatico posizione/dimensioni finestra
- ✅ Controllo risoluzione video (1080p, 720p, 480p)
- ✅ Controllo frame rate (60fps, 30fps)
- ✅ Gestione errori robusta con retry automatico
- ✅ Logging dettagliato per debugging

### Sicurezza
- ✅ Context isolation attivo
- ✅ Node integration disabilitato nel renderer
- ✅ Validazione rigorosa canali IPC
- ✅ Web security attiva

## Principi di Sviluppo da Seguire
### Architettura del Codice
- **Modularità**: Ogni funzione ha una responsabilità specifica
- **Costanti**: Usa costanti per valori di configurazione
- **Documentazione**: Ogni funzione deve avere un commento JSDoc
- **Logging**: Ogni operazione importante deve essere loggata con emoji

### Pattern di Codice Stabiliti
```javascript
// Struttura tipica per funzioni
/**
 * Descrizione della funzione
 * @param {type} parameter - Descrizione parametro
 * @returns {type} Descrizione return
 */
function functionName(parameter) {
  console.log('🎯 Operazione iniziata...');
  try {
    // Logica principale
    console.log('✅ Operazione completata');
  } catch (error) {
    console.error('❌ Errore:', error);
  }
}
```

### Gestione Errori
- **Try-catch**: Sempre wrappare operazioni che possono fallire
- **Retry Logic**: Implementare retry automatico per operazioni critiche
- **User Feedback**: Mostrare messaggi di errore comprensibili
- **Logging**: Sempre loggare errori con stack trace

### Comunicazione IPC
- **Validazione**: Tutti i canali devono essere validati in preload.js
- **Sicurezza**: Solo canali autorizzati possono essere usati
- **Logging**: Loggare tutti i messaggi IPC per debugging

## Convenzioni Naming
- **Variabili**: camelCase (es. `currentVideoStream`)
- **Costanti**: UPPER_SNAKE_CASE (es. `DEFAULT_RESOLUTION`)
- **Funzioni**: camelCase descrittivo (es. `handleDeviceSelection`)
- **File**: kebab-case per CSS, camelCase per JS

## Emoji per Logging
- 🚀 Inizializzazione
- 📹 Operazioni video
- 📷 Operazioni webcam
- 🔧 Configurazione
- 📊 Dati/Statistiche
- 🎯 Operazioni utente
- ✅ Successo
- ❌ Errore
- ⚠️ Warning
- 🔐 Sicurezza
- 📡 Comunicazione IPC

## Estensioni Future Pianificate
- [ ] Cattura screenshot con tasto rapido
- [ ] Registrazione video locale
- [ ] Filtri webcam in tempo reale
- [ ] Picture-in-Picture nativo del browser
- [ ] Hotkey globali per controllo
- [ ] Supporto multi-monitor
- [ ] Preset di posizionamento finestra
- [ ] Modalità always-on-top opzionale

## Linee Guida per la Conversazione
- **Concisione**: Risposte dirette, no saluti/ringraziamenti
- **Spiegazioni**: Linguaggio semplice, no tecnicismi complessi
- **Esempi**: Sempre fornire esempi di codice quando possibile
- **Coerenza**: Seguire i pattern già stabiliti nel progetto
- **Logging**: Includere sempre log appropriati nelle modifiche

## Debugging
- **Console logs**: Ampiamente usati per tracciare il flusso
- **DevTools**: Accessibili via F12 o menu
- **Error handling**: Tutti gli errori sono catturati e loggati
- **IPC communication**: Tracciata completamente nei log

## Note Tecniche Importanti
- Il progetto usa **dynamic imports** per electron-store (ES module)
- La gestione degli stream video include **cleanup automatico**
- I **constraints video** sono configurabili e hanno fallback
- Le **impostazioni** sono persistenti tramite electron-store
- La **sicurezza IPC** è implementata con whitelist di canali

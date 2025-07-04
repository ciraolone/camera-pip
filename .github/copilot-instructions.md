<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Camera PiP - Istruzioni per Copilot

## Descrizione del Progetto
Questo è un'applicazione Electron per Windows che mostra il feed della webcam in una finestra desktop. L'app è progettata per essere semplice e intuitiva, con un'interfaccia moderna e pulita.

## Tecnologie Utilizzate
- **Electron**: Framework per creare app desktop con tecnologie web
- **HTML/CSS/JavaScript**: Frontend dell'applicazione
- **WebRTC getUserMedia API**: Per accedere alla webcam
- **Canvas API**: Per catturare screenshot

## Struttura del Progetto
- `main.js`: Processo principale di Electron
- `index.html`: Interfaccia utente principale
- `renderer.js`: Logica del frontend e gestione della webcam
- `package.json`: Configurazione del progetto e dipendenze

## Funzionalità Principali
1. **Avvio/Fermata Camera**: Controllo del feed della webcam
2. **Screenshot**: Cattura e salvataggio di immagini
3. **Interfaccia Moderna**: Design con glassmorphism e gradients
4. **Responsive**: Adattabile a diverse dimensioni della finestra

## Linee Guida per lo Sviluppo
- Mantieni il codice pulito e ben commentato
- Usa moderne API web per la gestione della webcam
- Implementa una gestione degli errori robusta
- Assicurati che l'interfaccia sia intuitiva e accessibile
- Testa sempre le funzionalità su Windows

## Possibili Estensioni Future
- Funzionalità Picture-in-Picture
- Registrazione video
- Filtri ed effetti per la camera
- Supporto per multiple telecamere
- Impostazioni avanzate per la qualità video

## Linee Guida per la Conversazione
- Sii estremamente conciso: non salutare, non ringraziare, non scusarti.
- Spiegami considerando che non sono un esperto, non entrare nei tecnicismi.

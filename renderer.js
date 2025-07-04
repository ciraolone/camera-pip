const video = document.getElementById('webcam');
let currentStream;

// Funzione per avviare lo stream video
async function startVideo(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    video: { deviceId: deviceId ? { exact: deviceId } : undefined }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    currentStream = stream;
  } catch (error) {
    console.error('Errore nell\'accesso alla webcam:', error);
  }
}

// Ottieni i dispositivi e inviali al processo principale per creare il menu
async function getDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true }); // Richiedi il permesso
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Estrai solo le proprietà necessarie perché l'oggetto completo non può essere serializzato
    const plainDevices = devices.map(device => ({
      deviceId: device.deviceId,
      kind: device.kind,
      label: device.label,
    }));
    window.electronAPI.send('devices-list', plainDevices);
  } catch (error) {
    console.error('Impossibile ottenere i permessi per la webcam:', error);
  }
}

// Avvia il video con la camera salvata o quella di default
async function initialize() {
  const savedDeviceId = await window.electronAPI.invoke('get-selected-device');
  await startVideo(savedDeviceId);
  await getDevices();
}

initialize();

// Ricevi l'evento per cambiare camera dal processo principale
window.electronAPI.receive('select-device', (deviceId) => {
  startVideo(deviceId);
  window.electronAPI.send('set-selected-device', deviceId); // Salva il dispositivo selezionato
});

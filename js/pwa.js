/**
 * Gestión de capacidades PWA:
 * - Registro del Service Worker
 * - Banner y botón de instalación
 * - Detección de conexión offline/online
 */

let deferredInstallPrompt = null;

export function initPWA(onInstallAvailable) {
  // 1. Registrar Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then(reg => {
          console.log('[PWA] Service Worker registrado exitosamente con scope:', reg.scope);
        })
        .catch(err => {
          console.warn('[PWA] Fallo al registrar Service Worker:', err);
        });
    });
  }

  // 2. Escuchar evento de instalación
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (typeof onInstallAvailable === 'function') {
      onInstallAvailable(true);
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (typeof onInstallAvailable === 'function') {
      onInstallAvailable(false);
    }
    console.log('[PWA] SuperPrecios QRO instalada en el dispositivo.');
  });

  // 3. Indicador de estado de conexión
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();
}

export async function promptInstallApp() {
  if (!deferredInstallPrompt) {
    alert('Para instalar la app en iOS: Toca el botón Compartir y selecciona "Agregar al inicio". En Android/Chrome: Usa el menú de 3 puntos e "Instalar aplicación".');
    return;
  }

  deferredInstallPrompt.prompt();
  const choiceResult = await deferredInstallPrompt.userChoice;
  if (choiceResult.outcome === 'accepted') {
    console.log('[PWA] El usuario aceptó la instalación.');
  }
  deferredInstallPrompt = null;
}

function updateNetworkStatus() {
  const offlineBadge = document.getElementById('offline-badge');
  if (!offlineBadge) return;

  if (!navigator.onLine) {
    offlineBadge.classList.remove('hidden');
    offlineBadge.textContent = '📡 Modo Offline (Datos guardados)';
  } else {
    offlineBadge.classList.add('hidden');
  }
}

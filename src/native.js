import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics } from '@capacitor/haptics';

/**
 * ============================================================
 * POPULIVE — PONTE VERSO IL NATIVO (Capacitor)
 * ============================================================
 * Unico file che importa Capacitor. Sul web tutte le funzioni
 * fanno la cosa "normale" del browser, così il resto dell'app
 * non deve sapere se gira in una pagina web o dentro l'app
 * iOS/Android.
 * ============================================================
 */

/** true quando l'app gira dentro il contenitore nativo iOS/Android. */
export function isNative() {
  return Capacitor.isNativePlatform();
}

/**
 * Apre un URL esterno (es. checkout Stripe).
 * - web: navigazione classica della pagina
 * - app: browser in-app (Custom Tabs / SFSafariViewController), così
 *   la WebView dell'app non viene abbandonata e al termine si rientra
 *   tramite Universal/App Link.
 */
export async function openExternal(url) {
  if (isNative()) {
    await Browser.open({ url, presentationStyle: 'popover' });
  } else {
    window.location.href = url;
  }
}

/** Chiude il browser in-app se aperto (no-op sul web). */
export async function closeInAppBrowser() {
  if (!isNative()) return;
  try {
    await Browser.close();
  } catch {
    /* già chiuso o non supportato: ignorato */
  }
}

/**
 * Registra un handler per gli URL con cui l'app viene aperta
 * (Universal/App Link, es. QR /checkin/:id). Sul web non fa nulla.
 * Ritorna una funzione di cleanup.
 */
export function onAppUrlOpen(handler) {
  if (!isNative()) return () => {};
  const listener = CapApp.addListener('appUrlOpen', ({ url }) => {
    try {
      const parsed = new URL(url);
      handler({ pathname: parsed.pathname, search: parsed.search });
    } catch {
      /* URL non valido: ignorato */
    }
  });
  return () => {
    listener.then((l) => l.remove());
  };
}

/**
 * Registra un handler per il ritorno dell'app in primo piano.
 * - app: evento nativo appStateChange di Capacitor. Su iPhone
 *   visibilitychange nella WebView non arriva in modo affidabile al
 *   ritorno dal background (test 1d, ottobre 2026: geofence mai
 *   controllato finché l'app non veniva chiusa e riaperta).
 * - web: visibilitychange della pagina.
 * Ritorna una funzione di cleanup.
 */
export function onAppForeground(handler) {
  if (isNative()) {
    const listener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handler();
    });
    return () => {
      listener.then((l) => l.remove());
    };
  }
  function onVisible() {
    if (document.visibilityState === 'visible') handler();
  }
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}

/**
 * Stato del permesso di posizione SENZA chiederlo (nessun prompt):
 * 'granted' | 'denied' | 'prompt' | 'unknown'.
 * - app: lo chiede al sistema operativo tramite il plugin. Nella
 *   WebView di Capacitor navigator.permissions risponde sempre
 *   'prompt' anche a permesso concesso (verificato su Android il
 *   28/9: Capacitor concede la posizione alla pagina una richiesta
 *   alla volta, senza ricordarla), quindi lì non è affidabile.
 * - web: Permissions API del browser, dove esiste.
 */
export async function getLocationPermissionState() {
  try {
    if (isNative()) {
      const { location } = await Geolocation.checkPermissions();
      return location === 'granted' ? 'granted' : location === 'denied' ? 'denied' : 'prompt';
    }
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state;
    }
  } catch {
    /* plugin o API non disponibili: stato sconosciuto */
  }
  return 'unknown';
}

/**
 * Posizione attuale, una volta sola: { latitude, longitude, accuracy }
 * oppure null (permesso negato, GPS spento, tempo scaduto).
 * - app: plugin Geolocation (ottobre 2026). Su iPhone navigator.geolocation
 *   passa dalla WebView, e WebKit mostra un SECONDO avviso oltre a quello
 *   di sistema, intestato al "sito" — nell'app, "localhost" (visto sulla
 *   build TestFlight 9, test 1d). Il plugin parla direttamente con il
 *   sistema operativo: un solo avviso, quello vero dell'app. Se il
 *   permesso non è ancora stato chiesto, lo chiede lui.
 * - web: navigator.geolocation, con le stesse opzioni.
 *
 * Nell'app le richieste partono UNA ALLA VOLTA (bug B23, ottobre 2026).
 * Su iOS il plugin ha un solo gestore di posizione condiviso: tutte le
 * richieste in attesa ricevono la stessa posizione, con la precisione
 * dell'ultima chiesta. Al ritorno in primo piano partono insieme il
 * geofence (alta precisione) e l'aggiornamento missioni (bassa): il
 * geofence riceveva una posizione approssimativa, la scartava (margine
 * oltre 150 m) e non metteva mai fuori chi era lontano.
 */
let nativePositionQueue = Promise.resolve();

export async function getCurrentPosition({
  enableHighAccuracy = false,
  timeout = 8000,
  maximumAge = 300000,
} = {}) {
  try {
    if (isNative()) {
      // Rete di sicurezza: una richiesta che il plugin non chiude mai non
      // deve bloccare per sempre quelle dopo.
      const request = nativePositionQueue.then(() =>
        Promise.race([
          Geolocation.getCurrentPosition({ enableHighAccuracy, timeout, maximumAge }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout + 2000)
          ),
        ])
      );
      nativePositionQueue = request.catch(() => {});
      const { coords } = await request;
      return { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
    }
    if (!navigator.geolocation) return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          }),
        () => resolve(null),
        { enableHighAccuracy, timeout, maximumAge }
      );
    });
  } catch {
    return null; // permesso negato o posizione non disponibile
  }
}

/**
 * Vibrazione per un evento ricevuto (Like, match, messaggi… — v.
 * App.jsx, decisione D2 del 2/10). 'strong' per gli eventi più
 * importanti (Superlike, Pulse, match), 'normal' per gli altri.
 * - app: plugin Haptics (su iOS navigator.vibrate non esiste; la
 *   durata lì viene ignorata, il sistema usa la sua vibrazione)
 * - web: navigator.vibrate, dove il browser lo supporta
 * Mai un errore verso chi chiama: senza vibrazione l'app va avanti.
 */
export async function vibrate(intensity = 'normal') {
  const duration = intensity === 'strong' ? 400 : 200;
  try {
    if (isNative()) {
      await Haptics.vibrate({ duration });
    } else {
      navigator.vibrate?.(duration);
    }
  } catch {
    /* vibrazione non disponibile: ignorata */
  }
}

/**
 * Registra un handler per il pulsante "indietro" hardware di Android.
 * Sul web non fa nulla. Ritorna una funzione di cleanup.
 */
export function onBackButton(handler) {
  if (!isNative()) return () => {};
  const listener = CapApp.addListener('backButton', handler);
  return () => {
    listener.then((l) => l.remove());
  };
}

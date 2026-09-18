import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

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

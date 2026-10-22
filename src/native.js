import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics } from '@capacitor/haptics';
import { FirebaseMessaging, Importance } from '@capacitor-firebase/messaging';

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
 * ============================================================
 * NOTIFICHE PUSH (D3, ottobre 2026)
 * ============================================================
 * Firebase Cloud Messaging su Android e iOS (plugin
 * @capacitor-firebase/messaging): il backend manda la push a ogni
 * Like, Superlike, Pulse, match e messaggio (populive-push.js), così
 * chi resta nel radar con l'app chiusa lo sa. Con l'app aperta la push
 * non si vede (iOS: presentationOptions vuoto in capacitor.config.ts;
 * Android: FCM non mostra le notifiche in primo piano): bastano gli
 * eventi socket. Sul web niente push: tutte le funzioni non fanno nulla.
 * ============================================================
 */

/**
 * Stato del permesso delle notifiche SENZA chiederlo:
 * 'granted' | 'denied' | 'prompt' | 'unsupported' (web).
 * Su Android prima della 13 il permesso non esiste: risulta 'granted'.
 */
export async function getPushPermissionState() {
  if (!isNative()) return 'unsupported';
  try {
    const { receive } = await FirebaseMessaging.checkPermissions();
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** Mostra l'avviso di sistema del permesso; restituisce lo stato finale. */
export async function requestPushPermission() {
  if (!isNative()) return 'unsupported';
  try {
    const { receive } = await FirebaseMessaging.requestPermissions();
    return receive === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

// Canali Android: suono e vibrazione di una notifica dipendono dal
// canale, non dal messaggio. Il backend sceglie 'interactions_silent'
// quando l'interruttore "Notifiche aptiche" è spento (D3). Creati una
// volta per avvio; ricrearli non cambia le scelte fatte dall'utente
// nelle impostazioni di Android.
let pushChannelsReady = null;
function ensurePushChannels() {
  if (Capacitor.getPlatform() !== 'android') return Promise.resolve();
  if (!pushChannelsReady) {
    pushChannelsReady = Promise.all([
      FirebaseMessaging.createChannel({
        id: 'interactions',
        name: 'Like, Pulse e messaggi',
        description: 'Like, Superlike, Pulse, match e messaggi in chat',
        importance: Importance.High,
        vibration: true,
      }),
      FirebaseMessaging.createChannel({
        id: 'interactions_silent',
        name: 'Like, Pulse e messaggi (senza vibrazione)',
        description: 'Le stesse notifiche, senza suono né vibrazione',
        importance: Importance.Low,
        vibration: false,
      }),
    ]).catch(() => {
      pushChannelsReady = null; // si riprova al prossimo avvio
    });
  }
  return pushChannelsReady;
}

/**
 * Token Firebase di questo dispositivo, da mandare al backend:
 * { token, platform: 'android' | 'ios' } oppure null (web, permesso
 * mancante, Firebase non raggiungibile). Non chiede il permesso: va
 * chiamata solo a permesso concesso.
 */
export async function getPushToken() {
  if (!isNative()) return null;
  try {
    await ensurePushChannels();
    const { token } = await FirebaseMessaging.getToken();
    return token ? { token, platform: Capacitor.getPlatform() } : null;
  } catch {
    return null;
  }
}

/**
 * Firebase può rinnovare il token in qualunque momento: l'handler
 * riceve { token, platform } da rimandare al backend. Ritorna una
 * funzione di cleanup.
 */
export function onPushTokenChange(handler) {
  if (!isNative()) return () => {};
  const listener = FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
    if (token) handler({ token, platform: Capacitor.getPlatform() });
  });
  return () => {
    listener.then((l) => l.remove());
  };
}

/**
 * Tocco su una notifica: l'handler riceve i suoi dati ({ type,
 * conversationId, pulseId, interactionId… }, v. populive-push.js nel
 * backend). Arriva anche se il tocco ha aperto l'app da chiusa: il
 * plugin conserva l'evento finché qualcuno non si mette in ascolto.
 * Ritorna una funzione di cleanup.
 */
export function onPushTapped(handler) {
  if (!isNative()) return () => {};
  const listener = FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    handler(event?.notification?.data || {});
  });
  return () => {
    listener.then((l) => l.remove());
  };
}

/**
 * ============================================================
 * BLUETOOTH: CHI HAI VICINO NEL RADAR (D4 strada B, ottobre 2026)
 * ============================================================
 * Plugin nostro, dentro l'app (nessuna libreria esterna trasmette via
 * Bluetooth LE): Android BlePresencePlugin.java accanto a MainActivity,
 * iOS BlePresencePlugin.swift. Ogni telefono nel radar trasmette il
 * codice della serata che gli dà il server (8 caratteri, anonimo) e
 * ascolta quelli degli altri; a ogni avvistamento arriva { code, rssi }
 * (al massimo uno al secondo per codice). Funziona solo con l'app
 * aperta: in background il plugin si spegne da solo e si riaccende al
 * ritorno. La vicinanza si calcola in proximity.js. Sul web niente.
 * ============================================================
 */
const BlePresence = registerPlugin('BlePresence');

/** 'granted' | 'denied' | 'prompt' | 'unsupported' (web), senza chiederlo. */
export async function getProximityPermissionState() {
  if (!isNative()) return 'unsupported';
  try {
    const { bluetooth } = await BlePresence.checkPermissions();
    return bluetooth === 'granted' ? 'granted' : bluetooth === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** Mostra l'avviso di sistema del Bluetooth; restituisce lo stato finale. */
export async function requestProximityPermission() {
  if (!isNative()) return 'unsupported';
  try {
    const { bluetooth } = await BlePresence.requestPermissions();
    return bluetooth === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Accende trasmissione e ascolto con il proprio codice. Richiamarla con
 * lo stesso codice non fa danni (riparte da capo: serve anche dopo aver
 * riacceso il Bluetooth). Mai un errore verso chi chiama: Bluetooth
 * spento, permesso mancante o telefono senza Bluetooth LE = il radar
 * funziona come prima, senza vicinanza.
 */
export async function startProximity(code) {
  if (!isNative() || !code) return false;
  try {
    await BlePresence.start({ code });
    return true;
  } catch {
    return false;
  }
}

/** Spegne trasmissione e ascolto. */
export async function stopProximity() {
  if (!isNative()) return;
  try {
    await BlePresence.stop();
  } catch {
    /* già spento */
  }
}

/**
 * Bluetooth del telefono: 'on' | 'off' | 'unsupported' | 'unknown'. Su
 * iPhone, prima del permesso, 'unknown' (leggerlo farebbe comparire
 * l'avviso del permesso).
 */
export async function getBluetoothState() {
  if (!isNative()) return 'unsupported';
  try {
    const { state } = await BlePresence.getState();
    return state || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Chiede di accendere il Bluetooth. Nessuna app può accenderlo da sola:
 * Android mostra l'avviso di sistema "PopuLive vuole attivare il
 * Bluetooth", iPhone quello di Apple con il pulsante Impostazioni.
 * Restituisce lo stato subito dopo; un'accensione successiva arriva con
 * onBluetoothStateChange (e il plugin riparte da solo).
 */
export async function requestBluetoothEnable() {
  if (!isNative()) return 'unsupported';
  try {
    const { state } = await BlePresence.requestEnable();
    return state || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** L'handler riceve 'on' o 'off' quando l'utente cambia il Bluetooth. */
export function onBluetoothStateChange(handler) {
  if (!isNative()) return () => {};
  const listener = BlePresence.addListener('stateChange', (event) => {
    if (event?.state) handler(event.state);
  });
  return () => {
    listener.then((l) => l.remove());
  };
}

/** L'handler riceve { code, rssi } a ogni avvistamento. Ritorna il cleanup. */
export function onProximity(handler) {
  if (!isNative()) return () => {};
  const listener = BlePresence.addListener('proximity', (event) => {
    if (event?.code && Number.isFinite(event.rssi)) handler({ code: event.code, rssi: event.rssi });
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

import { getLocationPermissionState, getCurrentPosition } from './native';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

/**
 * ============================================================
 * POPULIVE — CLIENT API CENTRALIZZATO
 * ============================================================
 * Prima, ogni schermata mandava un header "x-user-id" scritto a
 * mano — un sistema che chiunque poteva falsificare (bastava
 * scrivere un ID a caso per "diventare" un altro utente). Ora
 * l'identità vera arriva da un token firmato dal server al login,
 * e questo file è l'UNICO posto che lo gestisce: lo salva, lo
 * legge, lo aggiunge automaticamente a ogni richiesta. Tutte le
 * altre schermate chiamano semplicemente apiFetch(...) invece di
 * fetch(...), senza doversi preoccupare del token.
 * ============================================================
 */

const TOKEN_KEY = 'pl_token';
const USER_ID_KEY = 'pl_user_id';

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setSession(token, userId) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_ID_KEY, userId);
  } catch {
    /* ignorato — se localStorage non è disponibile, la sessione
                semplicemente non sopravvive a un refresh, ma l'app non crasha */
  }
}

function getStoredUserId() {
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
  } catch {
    /* ignorato */
  }
}

/**
 * ============================================================
 * ULTIMO LOCALE — per sopravvivere a un aggiornamento pagina
 * ============================================================
 * L'essere "dentro" un'Arena vive solo in memoria (arenaSessionId),
 * quindi un semplice refresh lo cancellava sempre, costringendo a
 * riscansionare il QR anche restando fisicamente nello stesso
 * locale — un problema vero, trovato durante un test dal vivo.
 * Salviamo il venueId E la serata (arenaSessionId) in cui si è
 * entrati col QR. All'avvio l'app ritenta il check-in mandando
 * anche la serata: il server lo accetta solo se è ancora quella di
 * oggi e la persona ci era già entrata (bug B8, 2/10 — prima si
 * salvava solo il locale, che non scadeva mai: riaprendo l'app
 * giorni dopo, da casa, si veniva fatti entrare nella serata del
 * giorno senza nessun QR).
 * ============================================================
 */
const LAST_VENUE_KEY = 'pl_last_venue';
const LEGACY_LAST_VENUE_KEY = 'pl_last_venue_id'; // solo il venueId, senza serata: non più valido

function getLastVenue() {
  try {
    localStorage.removeItem(LEGACY_LAST_VENUE_KEY);
    const saved = JSON.parse(localStorage.getItem(LAST_VENUE_KEY));
    return saved?.venueId && saved?.arenaSessionId ? saved : null;
  } catch {
    return null;
  }
}

function setLastVenue(venueId, arenaSessionId) {
  try {
    localStorage.setItem(LAST_VENUE_KEY, JSON.stringify({ venueId, arenaSessionId }));
  } catch {
    /* ignorato */
  }
}

function clearLastVenue() {
  try {
    localStorage.removeItem(LAST_VENUE_KEY);
  } catch {
    /* ignorato */
  }
}

/**
 * Sostituto di fetch() che aggiunge da solo il token, se presente.
 * Se il server risponde 401 (token scaduto/non valido), ripuliamo
 * la sessione salvata — così l'app sa di dover tornare al login
 * invece di restare bloccata a ripetere richieste che falliranno
 * sempre.
 */
// Ultima risposta (accetta/rifiuta/sospendi) a un Superlike o a una
// Pulse partita da QUESTO telefono, da qualunque schermata: il match
// che ne nasce arriva via socket a entrambi, ma chi ha appena toccato
// "Accetta" non deve sentirlo vibrare (v. chat_unlocked in App.jsx).
// Segnato PRIMA della richiesta: l'evento socket arriva di solito
// prima della risposta HTTP.
let lastOwnDecisionAt = 0;

function isRecentOwnDecision(withinMs = 5000) {
  return Date.now() - lastOwnDecisionAt < withinMs;
}

async function apiFetch(path, options = {}) {
  if (/\/respond$/.test(path)) lastOwnDecisionAt = Date.now();
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
  }

  return res;
}

export {
  API_BASE,
  getToken,
  getStoredUserId,
  setSession,
  clearSession,
  apiFetch,
  isRecentOwnDecision,
  getLastVenue,
  setLastVenue,
  clearLastVenue,
};

/**
 * ============================================================
 * POSIZIONE GPS — per le missioni sponsorizzate
 * ============================================================
 * Chiede il permesso al browser SOLO quando viene chiamata (mai
 * all'avvio dell'app senza motivo) — va richiamata unicamente
 * quando la persona ha già attivato il consenso "Ricevi missioni
 * sponsorizzate", mai prima. Fallisce in silenzio se il permesso
 * viene negato o il browser non supporta la geolocalizzazione —
 * niente di grave, la persona semplicemente non riceverà missioni
 * finché non concede l'accesso.
 * ============================================================
 */
// La posizione arriva da native.js (plugin nell'app, niente secondo
// avviso "localhost" su iPhone; navigator.geolocation sul web).
async function requestAndSendLocation(userId) {
  const position = await getCurrentPosition({
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 300000,
  });
  if (!position) return; // permesso negato o errore — nessun blocco per la persona
  try {
    await apiFetch(`/api/profile/${userId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: position.latitude, longitude: position.longitude }),
    });
  } catch {
    // Silenzioso — un aggiornamento di posizione mancato non è mai un
    // problema grave: si riprova al prossimo ritorno in app (v.
    // refreshLocationIfConsented qui sotto).
  }
}

/**
 * Aggiornamento della posizione nel tempo (28/9, decisione
 * dell'utente): prima veniva salvata una volta sola, all'attivazione
 * del consenso, e chi si spostava continuava a ricevere missioni
 * "vicine" al punto di allora. Chiamata all'apertura dell'app e a
 * ogni ritorno in primo piano, ma fa davvero qualcosa solo se:
 *  - il permesso GPS è GIÀ concesso — mai un prompt a sorpresa
 *    all'avvio. Lo stato arriva da native.js (sistema operativo
 *    nell'app, Permissions API sul web); se è sconosciuto si
 *    prosegue: il consenso dato in app resta il vincolo vero;
 *  - il consenso "missioni sponsorizzate" è attivo — senza, la
 *    posizione non viene nemmeno letta, non solo non salvata;
 *  - sono passati almeno 10 minuti dall'ultimo aggiornamento, per
 *    non accendere il GPS a ogni cambio di app.
 */
const LOCATION_REFRESH_MIN_INTERVAL_MS = 10 * 60 * 1000;
let lastLocationRefreshAt = 0;

async function refreshLocationIfConsented(userId) {
  if (Date.now() - lastLocationRefreshAt < LOCATION_REFRESH_MIN_INTERVAL_MS) return;
  try {
    const permission = await getLocationPermissionState();
    if (permission !== 'granted' && permission !== 'unknown') return;
    const res = await apiFetch(`/api/profile/${userId}/settings`);
    const data = await res.json();
    if (!data.success || !data.settings?.sponsoredMissionsEnabled) return;
    lastLocationRefreshAt = Date.now();
    requestAndSendLocation(userId);
  } catch {
    /* nessun aggiornamento questa volta — si riprova al prossimo ritorno in app */
  }
}

/**
 * Geofence del radar (28/9) — "sei ancora nel locale?". Manda la
 * posizione attuale UNA volta a /api/checkin/location-ping (che non
 * la salva mai): oltre 2 km il server chiude il check-in e toglie la
 * persona dal radar degli altri. Decisione D1 dell'utente: SOLO se il
 * permesso di posizione è già concesso, mai un prompt nuovo — chi
 * non l'ha dato semplicemente non viene controllato.
 * Non manda niente se la posizione è troppo imprecisa (es. posizione
 * "approssimativa" di Android, oltre 1 km): rischierebbe di buttare
 * fuori chi è dentro. Con il raggio di 2 km (ottobre 2026) un errore
 * fino a 1 km non basta a sbagliare di molto.
 * Ritorna la risposta del server, oppure null se non ha controllato.
 */
const GEOFENCE_MAX_ACCURACY_METERS = 1000;

async function checkStillAtVenue(arenaSessionId) {
  if (!arenaSessionId) return null;
  if ((await getLocationPermissionState()) !== 'granted') return null;
  const position = await getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000,
  });
  if (!position || position.accuracy > GEOFENCE_MAX_ACCURACY_METERS) return null;
  try {
    const res = await apiFetch('/api/checkin/location-ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arenaSessionId,
        latitude: position.latitude,
        longitude: position.longitude,
      }),
    });
    return await res.json();
  } catch {
    return null; // rete assente: nessuna decisione, si riprova al prossimo ritorno in app
  }
}

export { requestAndSendLocation, refreshLocationIfConsented, checkStillAtVenue };

/**
 * ============================================================
 * CARICAMENTO FOTO PROFILO (29/8)
 * ============================================================
 * Estratta da ProfileCreation.jsx (dove viveva da sola, mai
 * condivisa) perché ora serve ANCHE da Settings.jsx — permettere di
 * cambiare la foto anche DOPO la registrazione iniziale, non solo
 * la prima volta. Stessa identica logica, un solo posto da
 * mantenere invece di due copie che rischiano di disallinearsi.
 * Non serve mai l'API Secret lato client, solo cloud name + preset
 * (entrambi pubblici, sicuri da avere nel codice frontend).
 * ============================================================
 */
const CLOUDINARY_CLOUD_NAME = 'rjkegdrp';
const CLOUDINARY_UPLOAD_PRESET = 'populive_profile_photos';

async function uploadPhotoToStorage(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error('Upload verso Cloudinary non riuscito');
  }

  const data = await res.json();
  return data.secure_url; // questo è l'URL da salvare in photo_url
}

export { uploadPhotoToStorage };

/**
 * ============================================================
 * OTTIMIZZAZIONE FOTO — leggerezza su reti deboli (31/8)
 * ============================================================
 * Prima ogni foto veniva mostrata alla risoluzione ORIGINALE di
 * caricamento, ovunque comparisse — anche un piccolo cerchietto da
 * 40px nella classifica scaricava la stessa foto pesante di una
 * vista a schermo intero. Cloudinary (già usato per il caricamento)
 * sa ridimensionare/comprimere AL VOLO inserendo alcuni parametri
 * nell'indirizzo stesso della foto — nessun nuovo caricamento,
 * nessuna modifica al server, la trasformazione avviene sui loro
 * server e viene messa in cache.
 *
 * width/height: le dimensioni VERE a cui la foto viene mostrata a
 * schermo (in pixel CSS) — la funzione chiede automaticamente il
 * doppio (2x) per restare nitida sugli schermi retina, pratica
 * comune. Se non specificate, applica comunque compressione/
 * formato automatici SENZA ridimensionare (utile per usi dove la
 * dimensione varia troppo per fissarla, es. sfondo a schermo
 * intero).
 * g_face: per i ritagli quadrati/circolari (avatar), centra sul
 * volto rilevato invece che al centro geometrico — evita di
 * tagliare teste per sbaglio.
 * ============================================================
 */
function getOptimizedPhotoUrl(url, { width, height, crop = true } = {}) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return url; // non un URL Cloudinary riconoscibile — meglio restituirlo invariato che rischiare di romperlo
  }
  const sizePart =
    width && height ? `w_${width * 2},h_${height * 2}${crop ? ',c_fill,g_face' : ',c_limit'},` : '';
  return url.replace('/upload/', `/upload/${sizePart}q_auto,f_auto/`);
}

export { getOptimizedPhotoUrl };

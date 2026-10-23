import { onProximity, startProximity, stopProximity } from './native';

/**
 * ============================================================
 * POPULIVE — CHI HAI VICINO ADESSO (D4 strada B, ottobre 2026)
 * ============================================================
 * Raccoglie gli avvistamenti Bluetooth del plugin (v. native.js) e
 * mette ogni codice in una fascia di vicinanza.
 *
 * Tre fasce (decisione dell'utente, 23/10, dopo le prove tra iPhone e
 * Samsung; prima era un solo livello "vicino"):
 * - 'near'   — vicino, segnale da NEAR_RSSI in su: in testa al radar,
 *              icona con il segnale pieno;
 * - 'medium' — media distanza, da MEDIUM_RSSI a NEAR_RSSI: subito dopo,
 *              icona con metà segnale;
 * - lontano  — sotto MEDIUM_RSSI o non rilevato: nessuna icona (il
 *              codice semplicemente non compare tra i livelli).
 * Le soglie vengono dalla prova del 23/10 (segnale dell'iPhone sul
 * Samsung): −30 a contatto, da −58 a −73 a media distanza, circa −81
 * nell'altra stanza. Il segnale cambia da modello a modello: da
 * ritoccare se nei locali veri le fasce risultano troppo larghe o strette.
 *
 * - Il segnale (RSSI, in dBm: più è vicino a 0, più il telefono è
 *   vicino) si media sugli avvistamenti degli ultimi 10 secondi: un
 *   corpo in mezzo o il telefono in tasca lo fanno oscillare molto.
 * - Si sale di fascia appena la media supera la soglia, si scende solo
 *   HYSTERESIS_DB sotto (isteresi): senza margine chi sta sul confine
 *   salterebbe di continuo da un'icona all'altra.
 * - Chi non si sente da 20 secondi è dimenticato (lontano).
 *
 * Tutto resta sul telefono: al server non arriva niente.
 * ============================================================
 */

const NEAR_RSSI = -58;
const MEDIUM_RSSI = -73;
const HYSTERESIS_DB = 4;
const AVERAGE_WINDOW_MS = 10000;
const FORGET_MS = 20000;
const SWEEP_INTERVAL_MS = 2000;

const sightings = new Map(); // codice → { samples: [{ at, rssi }], level: 'near' | 'medium' | null }
const listeners = new Set();
let levels = new Map(); // codice → 'near' | 'medium' (i lontani non ci sono)
let removeNativeListener = null;
let sweepTimer = null;
let activeCode = null;

// Fascia per la media del segnale, tenendo conto di quella attuale:
// per restare in una fascia basta stare HYSTERESIS_DB sotto la sua soglia.
function levelFor(average, current) {
  const margin = (level) =>
    current === level || (current === 'near' && level === 'medium') ? HYSTERESIS_DB : 0;
  if (average >= NEAR_RSSI - margin('near')) return 'near';
  if (average >= MEDIUM_RSSI - margin('medium')) return 'medium';
  return null;
}

function recompute() {
  const now = Date.now();
  const next = new Map();
  for (const [code, entry] of sightings) {
    entry.samples = entry.samples.filter((s) => now - s.at <= FORGET_MS);
    if (entry.samples.length === 0) {
      sightings.delete(code);
      continue;
    }
    const recent = entry.samples.filter((s) => now - s.at <= AVERAGE_WINDOW_MS);
    const samples = recent.length > 0 ? recent : entry.samples.slice(-1);
    const average = samples.reduce((sum, s) => sum + s.rssi, 0) / samples.length;
    entry.level = levelFor(average, entry.level);
    if (entry.level) next.set(code, entry.level);
  }
  const changed =
    next.size !== levels.size || [...next].some(([code, level]) => levels.get(code) !== level);
  if (changed) {
    levels = next;
    listeners.forEach((listener) => listener(levels));
  }
}

function handleSighting({ code, rssi }) {
  const entry = sightings.get(code) || { samples: [], level: null };
  entry.samples.push({ at: Date.now(), rssi });
  sightings.set(code, entry);
  recompute();
}

/**
 * Accende il Bluetooth con il proprio codice della serata. Richiamata
 * con lo stesso codice (es. al ritorno in primo piano) riaccende solo
 * il plugin, senza perdere gli avvistamenti raccolti.
 */
export async function startNearby(code) {
  if (activeCode !== code) clearSightings();
  activeCode = code;
  if (!removeNativeListener) removeNativeListener = onProximity(handleSighting);
  if (!sweepTimer) sweepTimer = setInterval(recompute, SWEEP_INTERVAL_MS);
  return startProximity(code);
}

/** Spegne il Bluetooth e dimentica tutto (uscita dalla serata). */
export async function stopNearby() {
  activeCode = null;
  if (removeNativeListener) removeNativeListener();
  removeNativeListener = null;
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
  clearSightings();
  await stopProximity();
}

function clearSightings() {
  sightings.clear();
  if (levels.size > 0) {
    levels = new Map();
    listeners.forEach((listener) => listener(levels));
  }
}

/**
 * Il listener riceve subito, e poi a ogni cambiamento, la mappa
 * codice → fascia ('near' | 'medium') dei telefoni rilevati; chi è
 * lontano non c'è. Ritorna la funzione per smettere di ascoltare.
 */
export function subscribeNearby(listener) {
  listeners.add(listener);
  listener(levels);
  return () => listeners.delete(listener);
}

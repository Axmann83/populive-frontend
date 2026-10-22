import { onProximity, startProximity, stopProximity } from './native';

/**
 * ============================================================
 * POPULIVE — CHI HAI VICINO ADESSO (D4 strada B, ottobre 2026)
 * ============================================================
 * Raccoglie gli avvistamenti Bluetooth del plugin (v. native.js) e
 * decide quali codici sono "vicini". Un solo livello (decisione
 * dell'utente, 22/10): il segnale Bluetooth è impreciso, e due livelli
 * salterebbero di continuo dall'uno all'altro.
 *
 * - Il segnale (RSSI, in dBm: più è vicino a 0, più il telefono è
 *   vicino) si media sugli avvistamenti degli ultimi 10 secondi: un
 *   corpo in mezzo o il telefono in tasca lo fanno oscillare molto.
 * - Si diventa vicini con una media da NEAR_RSSI in su, e si smette di
 *   esserlo solo sotto FAR_RSSI (isteresi): senza margine chi sta sul
 *   confine salirebbe e scenderebbe nella griglia di continuo.
 * - Chi non si sente da 20 secondi non è più vicino.
 * Le soglie sono un punto di partenza, da tarare nelle prove sui
 * telefoni veri (cambiano da modello a modello).
 *
 * Tutto resta sul telefono: al server non arriva niente.
 * ============================================================
 */

const NEAR_RSSI = -75;
const FAR_RSSI = -82;
const AVERAGE_WINDOW_MS = 10000;
const FORGET_MS = 20000;
const SWEEP_INTERVAL_MS = 2000;

const sightings = new Map(); // codice → { samples: [{ at, rssi }], near }
const listeners = new Set();
let nearCodes = new Set();
let removeNativeListener = null;
let sweepTimer = null;
let activeCode = null;

function recompute() {
  const now = Date.now();
  const next = new Set();
  for (const [code, entry] of sightings) {
    entry.samples = entry.samples.filter((s) => now - s.at <= FORGET_MS);
    if (entry.samples.length === 0) {
      sightings.delete(code);
      continue;
    }
    const recent = entry.samples.filter((s) => now - s.at <= AVERAGE_WINDOW_MS);
    const samples = recent.length > 0 ? recent : entry.samples.slice(-1);
    const average = samples.reduce((sum, s) => sum + s.rssi, 0) / samples.length;
    entry.near = entry.near ? average >= FAR_RSSI : average >= NEAR_RSSI;
    if (entry.near) next.add(code);
  }
  const changed = next.size !== nearCodes.size || [...next].some((code) => !nearCodes.has(code));
  if (changed) {
    nearCodes = next;
    listeners.forEach((listener) => listener(nearCodes));
  }
}

function handleSighting({ code, rssi }) {
  const entry = sightings.get(code) || { samples: [], near: false };
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
  if (nearCodes.size > 0) {
    nearCodes = new Set();
    listeners.forEach((listener) => listener(nearCodes));
  }
}

/**
 * Il listener riceve subito, e poi a ogni cambiamento, l'insieme dei
 * codici vicini. Ritorna la funzione per smettere di ascoltare.
 */
export function subscribeNearby(listener) {
  listeners.add(listener);
  listener(nearCodes);
  return () => listeners.delete(listener);
}

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — PULSE DELLA SERATA (M11, novembre 2026)
 * ============================================================
 * Le Pulse si comprano con Stripe per la serata in cui si è dentro,
 * al prezzo di quella serata, e valgono solo lì fino alla chiusura
 * del locale. Qui ciò che serve a più schermate (radar, invio,
 * scheda Pulse, acquisto):
 *   - usePulseNight(arenaSessionId): prezzo, chiusura e saldo, sempre
 *     aggiornati: si ricarica da solo quando qualcuno chiama
 *     notifyPulseNightChanged() (acquisto, invio, evento dal server);
 *   - syncPulsePurchases(): al ritorno da Stripe chiede al server di
 *     controllare gli acquisti in attesa;
 *   - formattazione di prezzi e orari.
 * ============================================================
 */

const CHANGED_EVENT = 'pl-pulse-night-changed';

export function notifyPulseNightChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function usePulseNight(arenaSessionId) {
  const [info, setInfo] = useState(null);

  const reload = useCallback(async () => {
    if (!arenaSessionId) {
      setInfo(null);
      return;
    }
    try {
      const res = await apiFetch(`/api/arena-sessions/${arenaSessionId}/pulse-night`);
      const data = await res.json();
      if (data.success) setInfo(data);
    } catch {
      /* rete assente: resta l'ultimo valore */
    }
  }, [arenaSessionId]);

  useEffect(() => {
    reload();
    window.addEventListener(CHANGED_EVENT, reload);
    return () => window.removeEventListener(CHANGED_EVENT, reload);
  }, [reload]);

  return { info, reload };
}

// Acquisto avviato su Stripe e non ancora controllato: al ritorno
// nell'app (o alla chiusura della pagina di pagamento) si controlla.
// L'ora d'inizio serve al server per dire l'esito dei soli acquisti
// avviati da allora; sul web sopravvive al ricaricamento della pagina
// (Stripe rimanda a una pagina nuova), quindi sta anche in
// sessionStorage, che può mancare (navigazione privata): si va avanti
// lo stesso.
const STARTED_KEY = 'pl_pulse_checkout_started';
let checkoutStartedAt = null;

export function markCheckoutStarted() {
  checkoutStartedAt = Date.now();
  try {
    sessionStorage.setItem(STARTED_KEY, String(checkoutStartedAt));
  } catch {
    /* solo in memoria */
  }
}

export function isCheckoutPending() {
  return checkoutStartedAt !== null;
}

function takeCheckoutStartedAt() {
  let started = checkoutStartedAt;
  try {
    started = started ?? Number(sessionStorage.getItem(STARTED_KEY)) ?? null;
    sessionStorage.removeItem(STARTED_KEY);
  } catch {
    /* solo in memoria */
  }
  checkoutStartedAt = null;
  return started || null;
}

/**
 * Chiede al server lo stato vero degli acquisti in attesa (lo legge da
 * Stripe). Ritorna 'credited' se un acquisto avviato da questo
 * pagamento è stato accreditato, 'refunded' se rimborsato (pagato a
 * serata finita), altrimenti 'none'.
 */
export async function syncPulsePurchases() {
  const since = takeCheckoutStartedAt();
  try {
    const res = await apiFetch('/api/pulse-purchases/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since }),
    });
    const data = await res.json();
    notifyPulseNightChanged();
    if (data.results?.includes('credited')) return 'credited';
    if (data.results?.includes('refunded')) return 'refunded';
  } catch {
    /* il webhook accrediterà comunque */
  }
  return 'none';
}

export function formatEuro(cents) {
  if (cents == null) return '';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

// "02:00", sempre in ora italiana come gli orari dei locali.
export function formatNightTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Meno di un'ora alla chiusura: i testi diventano un avviso.
export function isEndingSoon(deadline) {
  if (!deadline) return false;
  const ms = new Date(deadline).getTime() - Date.now();
  return ms > 0 && ms <= 60 * 60 * 1000;
}

export function pulsesLabel(n) {
  return n === 1 ? '1 Pulse' : `${n} Pulse`;
}

// Testo dell'avviso di fine serata, uguale alla push del server.
export function nightEndingText({ venueName, closingTime, pulsesLeft = 0, toCollect = 0 }) {
  const parts = [];
  if (pulsesLeft > 0) parts.push(`${pulsesLeft} Pulse da usare`);
  if (toCollect > 0) parts.push(`${toCollect} drink da ritirare al bancone`);
  const when = closingTime ? `Alle ${closingTime}` : "Tra meno di un'ora";
  return `${when} finisce la serata da ${venueName || 'questo locale'}: hai ancora ${parts.join(' e ')}. Dopo scadono.`;
}

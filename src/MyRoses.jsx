import { useState, useEffect, useCallback } from 'react';
import { PulseWaveIcon } from './PopuLiveIcons';

import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — I TUOI PULSE (componente reale)
 * ============================================================
 * Lista di tutti i Pulse ricevuti. Quelli ancora "pending" si
 * possono toccare per riaprire la stessa schermata di decisione
 * (PulseNotification) che si vede quando arrivano in tempo reale —
 * utile per chi non li ha gestiti subito e vuole tornarci sopra.
 *
 * In cima, il saldo di Pulse pronti da INVIARE — gratis settimanali
 * + pre-pagati comprati in pacchetto (mai a scadenza, utilizzabili
 * in qualunque locale partner). Prima l'unico modo di avere un
 * Pulse extra era pagarlo uno alla volta al momento dell'invio.
 * ============================================================
 */
export default function MyPulses({ userId, onOpenPulse }) {
  const [pulses, setPulses] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null); // null | productId in corso
  const [purchaseError, setPurchaseError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pulsesRes, balanceRes] = await Promise.all([
        apiFetch(`/api/users/${userId}/pulses`),
        apiFetch(`/api/users/${userId}/pulse-balance`),
      ]);
      const pulsesData = await pulsesRes.json();
      const balanceData = await balanceRes.json();
      if (pulsesData.success) setPulses(pulsesData.pulses);
      if (balanceData.success) setBalance(balanceData);
    } catch (err) {
      console.error('Errore nel caricamento dei Pulse:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const [bundleOptions, setBundleOptions] = useState([]);

  useEffect(() => {
    apiFetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const options = data.products
            .filter((p) => p.product_type === 'pulse_bundle')
            .sort((a, b) => (a.effect_config?.credits || 0) - (b.effect_config?.credits || 0));
          setBundleOptions(options);
        }
      })
      .catch(() => {});
  }, []);

  const buyBundle = useCallback(async (productId) => {
    setPurchasing(productId);
    setPurchaseError(null);
    try {
      const purchaseRes = await apiFetch('/api/purchases/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const purchaseData = await purchaseRes.json();

      if (purchaseData.requiresPayment) {
        window.location.href = purchaseData.checkoutUrl;
        return;
      }

      if (purchaseData.success) {
        load(); // account di prova/gratis: il saldo è già aggiornato sul server
      } else {
        setPurchaseError('Qualcosa è andato storto — riprova.');
      }
    } catch {
      setPurchaseError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setPurchasing(null);
    }
  }, [load]);

  if (loading) return <div className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>Caricamento…</div>;

  const totalAvailable = (balance?.freeBalance || 0) + (balance?.paidCredits || 0);

  return (
    <div className="pl-screen">
      {/* Saldo — sempre in cima, prima della lista */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid rgba(47,211,232,0.3)', borderRadius: 14, padding: 12, marginBottom: 10, boxShadow: 'var(--shadow-glow-cyan)' }}>
        <PulseWaveIcon size={26} color="var(--cyan)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{totalAvailable} Pulse pronti da inviare</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {balance?.freeBalance || 0} gratis · {balance?.paidCredits || 0} pre-pagati
          </div>
        </div>
      </div>

      {/* Opzioni di acquisto — una per ciascun pacchetto nel
          catalogo (oggi 1 e 5, in futuro se ne aggiungiamo altri
          compaiono qui da soli, senza toccare il codice). */}
      {bundleOptions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {bundleOptions.map((p) => (
            <button
              key={p.id}
              onClick={() => buyBundle(p.id)}
              disabled={purchasing !== null}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'var(--surface-2)', border: '1px solid rgba(228,212,200,0.16)', borderRadius: 12,
                padding: '10px 8px', cursor: purchasing !== null ? 'default' : 'pointer',
                opacity: purchasing !== null && purchasing !== p.id ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cyan)' }}>
                {purchasing === p.id ? 'Un attimo…' : `+${p.effect_config?.credits || 1} Pulse`}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(p.price_cents / 100).toFixed(2)}€</span>
            </button>
          ))}
        </div>
      )}
      {purchaseError && <p className="pl-error" style={{ marginBottom: 10 }}>{purchaseError}</p>}

      {pulses.length === 0 && (
        <div className="pl-hint" style={{ textAlign: 'center', marginTop: 20 }}>Ancora nessun Pulse ricevuto stasera.</div>
      )}

      {pulses.map((r) => (
        <div
          key={r.pulseId}
          className="pl-pulse-option"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
          onClick={() => {
            if (r.status === 'pending') onOpenPulse(r);
          }}
        >
          <PulseWaveIcon size={22} color="var(--cyan)" />
          <div style={{ flex: 1 }}>
            <div className="pl-pulse-title">{r.drinkType}</div>
            <div className="pl-pulse-price">
              {r.senderName ? r.senderName : 'Ammiratore misterioso'} · {r.venueName}
            </div>
          </div>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const labels = {
    pending: { text: 'Da decidere', color: 'var(--cyan)' },
    accepted: { text: 'Accettata', color: 'var(--teak)' },
    redeemed: { text: 'Riscattata', color: 'var(--text-muted)' },
    rejected: { text: 'Rifiutata', color: 'var(--text-muted)' },
    ignored: { text: 'In sospeso', color: 'var(--text-muted)' },
  };
  const label = labels[status] || { text: status, color: 'var(--text-muted)' };
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: label.color, whiteSpace: 'nowrap' }}>
      {label.text}
    </span>
  );
}

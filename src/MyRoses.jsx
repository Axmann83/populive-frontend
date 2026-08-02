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
 * ============================================================
 */
export default function MyPulses({ userId, onOpenPulse }) {
  const [pulses, setPulses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/users/${userId}/pulses`);
      const data = await res.json();
      if (data.success) setPulses(data.pulses);
    } catch (err) {
      console.error('Errore nel caricamento dei Pulse:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>Caricamento…</div>;

  if (pulses.length === 0) {
    return <div className="pl-hint" style={{ textAlign: 'center', marginTop: 40 }}>Ancora nessun Pulse stasera.</div>;
  }

  return (
    <div className="pl-screen">
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

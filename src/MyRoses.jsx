import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

export default function MyRoses({ userId, onOpenRosa }) {
  const [roses, setRoses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/${userId}/roses`, {
        headers: { 'x-user-id': userId },
      });
      const data = await res.json();
      if (data.success) setRoses(data.roses);
    } catch (err) {
      console.error('Errore nel caricamento delle Rose:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>Caricamento…</div>;

  if (roses.length === 0) {
    return <div className="pl-hint" style={{ textAlign: 'center', marginTop: 40 }}>Nessuna Rosa ricevuta ancora stasera.</div>;
  }

  return (
    <div className="pl-screen">
      {roses.map((r) => (
        <div
          key={r.rosaId}
          className="pl-rosa-option"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
          onClick={() => {
            if (r.status === 'pending') onOpenRosa(r);
          }}
        >
          <div style={{ fontSize: 22 }}>🌹</div>
          <div style={{ flex: 1 }}>
            <div className="pl-rosa-title">{r.drinkType}</div>
            <div className="pl-rosa-price">
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

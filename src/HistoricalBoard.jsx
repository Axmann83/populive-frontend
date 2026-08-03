import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';
import { History } from './PopuLiveIcons';
import ProfileFullScreen from './ProfileFullScreen';

/**
 * ============================================================
 * POPULIVE — BACHECA STORICA
 * ============================================================
 * Chi ha fatto check-in in QUESTO locale negli ultimi 7 giorni —
 * per chi ha visto qualcuno dal vivo ma non ha fatto in tempo a
 * interagire quella sera stessa. Mostra solo chi ha scelto di
 * comparire qui (consenso facoltativo già raccolto in Impostazioni).
 * ============================================================
 */
export default function HistoricalBoard({ venueId, currentUserId, onClose }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/venues/${venueId}/historical-checkins`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data.success) setPeople(data.people); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [venueId]);

  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onClose}>Chiudi ✕</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <History size={18} color="var(--cyan)" />
        <h3 style={{ margin: 0 }}>Bacheca storica</h3>
      </div>
      <p className="pl-hint" style={{ marginBottom: 14 }}>
        Chi ha fatto check-in qui negli ultimi 7 giorni e ha scelto di comparire qui.
      </p>

      {loading && <p className="pl-hint">Caricamento…</p>}

      {!loading && people.length === 0 && (
        <p className="pl-hint" style={{ textAlign: 'center', marginTop: 20 }}>
          Nessuno da mostrare per ora — o nessuno è passato di qui negli ultimi giorni, o non ha attivato questa opzione.
        </p>
      )}

      <div className="pl-radar-list">
        {people.map((p) => (
          <div key={p.userId} className="pl-radar-card" onClick={() => setSelectedUserId(p.userId)} style={{ cursor: 'pointer' }}>
            <span className="pl-radar-card-avatar">
              {p.photoUrl ? <img src={p.photoUrl} alt={p.displayName} /> : p.avatarEmoji}
            </span>
            <span className="pl-radar-card-id">{p.displayName}</span>
          </div>
        ))}
      </div>

      {selectedUserId && (
        <ProfileFullScreen
          userId={selectedUserId}
          arenaSessionId={null}
          currentUserId={currentUserId}
          venueId={venueId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
}

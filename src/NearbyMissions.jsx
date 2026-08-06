import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';
import { Target } from './PopuLiveIcons';
import MissionClaim from './MissionClaim';

/**
 * ============================================================
 * POPULIVE — MISSIONI VICINO A TE
 * ============================================================
 * Le notifiche push vere non funzionano sulla web app su iPhone
 * (Apple le ha rimosse per le app web in UE) — questa lista dentro
 * l'app è quello che sostituisce l'avviso automatico: la persona
 * la trova quando apre l'app, invece di riceverla da sola.
 *
 * Vuota per chi non ha mai attivato "Ricevi missioni sponsorizzate"
 * nelle Impostazioni, o per chi non ha ancora una posizione nota —
 * mai un errore, semplicemente "niente da vedere qui".
 * ============================================================
 */
export default function NearbyMissions({ onClose }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMissionId, setOpenMissionId] = useState(null);

  useEffect(() => {
    apiFetch('/api/missions/near-me')
      .then((r) => r.json())
      .then((data) => { if (data.success) setMissions(data.missions); })
      .finally(() => setLoading(false));
  }, []);

  if (openMissionId) {
    return (
      <MissionClaim
        missionId={openMissionId}
        onClose={() => setOpenMissionId(null)}
        viaQrScan={false}
      />
    );
  }

  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onClose}>Chiudi ✕</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Target size={18} color="var(--cyan)" />
        <h3 style={{ margin: 0 }}>Missioni vicino a te</h3>
      </div>
      <p className="pl-hint" style={{ marginBottom: 14 }}>
        Solo missioni attive nel tuo raggio, in base all'ultima posizione nota.
      </p>

      {loading && <p className="pl-hint">Caricamento…</p>}

      {!loading && missions.length === 0 && (
        <p className="pl-hint" style={{ textAlign: 'center', marginTop: 20 }}>
          Niente da vedere qui per ora — o non ci sono missioni attive vicino a te, o non hai ancora attivato "Ricevi missioni sponsorizzate" nelle Impostazioni.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {missions.map((m) => (
          <div
            key={m.missionId}
            onClick={() => setOpenMissionId(m.missionId)}
            style={{ cursor: 'pointer', background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 14, padding: 12, boxShadow: 'var(--shadow-sm)' }}
          >
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
              {m.sponsorName} · {formatDistance(m.distanceMeters)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{m.claimText}</div>
            <div style={{ fontSize: 11.5, color: 'var(--cyan)', fontWeight: 700 }}>+{m.bonusPoints} punti</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDistance(meters) {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

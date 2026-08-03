import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';
import { Target } from './PopuLiveIcons';

/**
 * ============================================================
 * POPULIVE — MISSIONE SPONSORIZZATA (claim via QR)
 * ============================================================
 * Si apre quando si scansiona il QR stampato dal negozio sponsor.
 * Prima mostra il claim ("recati da X per Y punti"), poi — solo
 * dopo conferma esplicita — registra il completamento e assegna
 * i punti. Per ora basta la presenza fisica (il QR stesso ne è
 * già la prova): punti bonus per una spesa minima sono
 * un'estensione futura, non ancora costruita.
 * ============================================================
 */
export default function MissionClaim({ missionId, onClose }) {
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null); // { bonusPoints, sponsorName } | { reason }

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/missions/${missionId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setMission(data.success ? data.mission : { notFound: true }); })
      .catch(() => { if (!cancelled) setMission({ notFound: true }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [missionId]);

  async function confirm() {
    setConfirming(true);
    try {
      const res = await apiFetch(`/api/missions/${missionId}/complete`, { method: 'POST' });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, reason: 'network_error' });
    } finally {
      setConfirming(false);
    }
  }

  const errorMessages = {
    mission_not_found: 'Questa missione non esiste (più).',
    mission_inactive: 'Questa missione non è più attiva.',
    mission_not_in_window: 'Questa missione non è disponibile in questo momento.',
    already_completed: 'Hai già completato questa missione.',
    network_error: 'Non siamo riusciti a raggiungere il server — riprova.',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 340, background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.14)', borderRadius: 20, padding: '28px 24px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>

        {loading && <p className="pl-hint">Caricamento…</p>}

        {!loading && mission?.notFound && (
          <>
            <p className="pl-error">Questa missione non esiste (più).</p>
            <button className="pl-send-btn" style={{ marginTop: 16 }} onClick={onClose}>Chiudi</button>
          </>
        )}

        {!loading && mission && !mission.notFound && !result && (
          <>
            <Target size={32} color="var(--cyan)" style={{ marginBottom: 6 }} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Missione da {mission.sponsorName}
            </div>
            <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, margin: '0 0 10px' }}>{mission.claimText}</h2>
            <p className="pl-hint" style={{ marginBottom: 18 }}>
              Conferma per ottenere <strong style={{ color: 'var(--cyan)' }}>+{mission.bonusPoints} punti</strong>
            </p>
            <button className="pl-send-btn" onClick={confirm} disabled={confirming}>
              {confirming ? 'Un attimo…' : 'Conferma la tua presenza'}
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11.5, marginTop: 12, cursor: 'pointer' }}
            >
              Annulla
            </button>
          </>
        )}

        {result?.success && (
          <>
            <div style={{ fontSize: 34, marginBottom: 6 }}>🎉</div>
            <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, margin: '0 0 6px' }}>Missione completata!</h2>
            <p className="pl-hint" style={{ marginBottom: 18 }}>
              +{result.bonusPoints} punti da {result.sponsorName}
            </p>
            <button className="pl-send-btn" onClick={onClose}>Continua</button>
          </>
        )}

        {result && result.success === false && (
          <>
            <p className="pl-error">{errorMessages[result.reason] || 'Qualcosa è andato storto.'}</p>
            <button className="pl-send-btn" style={{ marginTop: 16 }} onClick={onClose}>Chiudi</button>
          </>
        )}
      </div>
    </div>
  );
}

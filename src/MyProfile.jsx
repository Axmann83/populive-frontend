import { useState, useEffect } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

export default function MyProfile({ userId, arenaSessionId, onOpenSettings }) {
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const rankingRes = await fetch(`${API_BASE}/api/users/${userId}/ranking-summary?arenaSessionId=${arenaSessionId || ''}`, {
          headers: { 'x-user-id': userId },
        });
        const rankingData = await rankingRes.json();
        if (!cancelled && rankingData.success) {
          setRanking(rankingData.summary);
        }
      } catch (err) {
        console.error('Errore nel caricamento della classifica personale:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, arenaSessionId]);

  if (loading) return <div className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>Caricamento…</div>;

  return (
    <div className="pl-screen">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onOpenSettings}
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}
          aria-label="Impostazioni"
        >
          ⚙️
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 10 }}>
        <div className="pl-rank-avatar" style={{ width: 64, height: 64, fontSize: 28, border: '2px solid var(--teak)' }}>🙂</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, marginTop: 8 }}>Tu</div>
      </div>

      {ranking && (
        <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
          <RankCounter label="Stanotte" rank={ranking.localRank} points={ranking.localPoints} />
          <RankCounter label="Globale" rank={ranking.globalRank} points={ranking.globalPoints} accent="var(--teak)" />
        </div>
      )}
    </div>
  );
}

function RankCounter({ label, rank, points, accent }) {
  return (
    <div style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid rgba(228,212,200,0.1)', borderRadius: 12, padding: 10, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: accent || 'var(--text)' }}>
        {rank ? `#${rank}` : '—'}
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>{label} · {points ?? 0} pt</div>
    </div>
  );
}

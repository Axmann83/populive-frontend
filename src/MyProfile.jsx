import { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from './PopuLiveIcons';

import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — IL TUO PROFILO (componente reale)
 * ============================================================
 * A differenza di un profilo altrui visto dal radar, qui il
 * proprietario vede SEMPRE i propri dati di classifica reali, a
 * prescindere dal toggle show_ranking_on_profile — quel toggle
 * riguarda solo cosa vedono gli ALTRI (v. Settings.jsx e la
 * discussione già fatta su questo punto).
 * ============================================================
 */
export default function MyProfile({ userId, arenaSessionId, onOpenSettings }) {
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const rankingRes = await apiFetch(`/api/users/${userId}/ranking-summary?arenaSessionId=${arenaSessionId || ''}`);
        const rankingData = await rankingRes.json();
        if (!cancelled && rankingData.success) {
          setRanking(rankingData.summary);
        }
      } catch (err) {
        // Se qualcosa va storto (server, rete, ecc.), non restiamo
        // bloccati su "Caricamento" per sempre — mostriamo la
        // schermata comunque, semplicemente senza i contatori.
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
          aria-label="Impostazioni"
        >
          <SettingsIcon size={20} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 10 }}>
        <div className="pl-rank-avatar" style={{ width: 64, height: 64, fontSize: 28, border: '2px solid var(--teak)', overflow: 'hidden' }}>
          {ranking?.photoUrl
            ? <img src={ranking.photoUrl} alt={ranking.displayName || 'Tu'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (ranking?.avatarEmoji || '🙂')}
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, marginTop: 8 }}>{ranking?.displayName || 'Tu'}</div>
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
    <div style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid rgba(228,212,200,0.1)', borderRadius: 12, padding: 10, textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 17, color: accent || 'var(--text)' }}>
        {rank ? `#${rank}` : '—'}
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>{label} · {points ?? 0} pt</div>
    </div>
  );
}

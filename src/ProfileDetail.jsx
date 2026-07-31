import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';

export default function ProfileDetail({ userId, arenaSessionId, onClose, onBack }) {
  const [profile, setProfile] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [profileRes, rankingRes] = await Promise.all([
          apiFetch(`/api/users/${userId}/public-profile?arenaSessionId=${arenaSessionId || ''}`),
          apiFetch(`/api/users/${userId}/ranking-summary?arenaSessionId=${arenaSessionId || ''}`),
        ]);
        const profileData = await profileRes.json();
        const rankingData = await rankingRes.json();
        if (!cancelled) {
          if (profileData.success) setProfile(profileData.profile);
          if (rankingData.success) setRanking(rankingData.summary);
        }

        if (arenaSessionId) {
          apiFetch('/api/profile-views', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ viewedUserId: userId, arenaSessionId }),
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Errore nel caricamento del profilo completo:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, arenaSessionId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg, #0D0D0D)', zIndex: 65, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 6px' }}>
        <button onClick={onBack} style={navBtnStyle} aria-label="Indietro">‹</button>
        <button onClick={onClose} style={navBtnStyle} aria-label="Chiudi">✕</button>
      </div>

      {loading || !profile ? (
        <div className="pl-hint" style={{ textAlign: 'center', marginTop: 60 }}>Caricamento…</div>
      ) : (
        <div style={{ padding: '10px 20px 40px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--teak)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42 }}>
              {profile.photoUrl
                ? <img src={profile.photoUrl} alt={profile.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : profile.avatarEmoji}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18 }}>{profile.displayName}</span>
              {profile.isTopConnector && <span title="Top Connector">🔗</span>}
              {profile.isTopSpender && <span title="Top Spender">💰</span>}
              {profile.isFounder && <span title="Founder">👑</span>}
            </div>
            {profile.instantInfluencerCategory && (
              <div style={{ ...influencerPillStyle, marginTop: 8 }}>
                ✨ Instant Influencer · {profile.instantInfluencerCategory}
              </div>
            )}
          </div>

          {ranking && !ranking.hidden && (
            <div style={{ display: 'flex', gap: 8, margin: '18px 0' }}>
              <RankBox label="Stanotte" rank={ranking.localRank} points={ranking.localPoints} />
              <RankBox label="Globale" rank={ranking.globalRank} points={ranking.globalPoints} accent="var(--teak)" />
            </div>
          )}
          {ranking?.hidden && (
            <div className="pl-hint" style={{ textAlign: 'center', margin: '18px 0' }}>
              Ha scelto di non mostrare la sua posizione in classifica
            </div>
          )}

          {profile.bio && (
            <div style={{ marginTop: 10 }}>
              <div className="pl-section-label">Bio</div>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>{profile.bio}</p>
            </div>
          )}

          {profile.hashtags?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="pl-section-label">Hashtag</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profile.hashtags.map((h) => (
                  <span key={h} className="pl-hashtag">{h}</span>
                ))}
              </div>
            </div>
          )}

          {profile.sponsoredProducts?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="pl-section-label">Prodotti sponsorizzati</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profile.sponsoredProducts.map((p) => (
                  
                    key={p.url}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--surface-2)', border: '1px solid rgba(228,212,200,0.14)',
                      borderRadius: 12, padding: '10px 14px', textDecoration: 'none',
                      color: 'var(--text)', fontSize: 12.5, fontWeight: 600,
                    }}
                  >
                    {p.name}
                    <span style={{ color: 'var(--gold-medal, #E8C77E)' }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RankBox({ label, rank, points, accent }) {
  return (
    <div style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid rgba(228,212,200,0.1)', borderRadius: 12, padding: 10, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: accent || 'var(--text)' }}>
        {rank ? `#${rank}` : '—'}
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>{label} · {points ?? 0} pt</div>
    </div>
  );
}

const navBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: '1px solid rgba(228,212,200,0.2)',
  background: 'var(--surface-2, #1E1E1E)',
  color: 'var(--text, #F6F1EC)',
  fontSize: 18,
  cursor: 'pointer',
};

const influencerPillStyle = {
  display: 'inline-block',
  padding: '4px 11px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color: '#0D0D0D',
  background: 'var(--gold-medal, #E8C77E)',
};

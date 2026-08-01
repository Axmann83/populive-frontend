import { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from './PopuLiveIcons';

import { apiFetch } from './apiClient';

const MAX_HASHTAGS = 5;

/**
 * ============================================================
 * POPULIVE — IL TUO PROFILO (componente reale)
 * ============================================================
 * A differenza di un profilo altrui visto dal radar, qui il
 * proprietario vede SEMPRE i propri dati di classifica reali, a
 * prescindere dal toggle show_ranking_on_profile — quel toggle
 * riguarda solo cosa vedono gli ALTRI (v. Settings.jsx e la
 * discussione già fatta su questo punto).
 *
 * Bio e hashtag — prima si potevano scrivere SOLO una volta, in
 * fase di registrazione, senza nessun modo di cambiarli dopo.
 * Ora si vedono qui, con un vero tasto "Modifica".
 * ============================================================
 */
export default function MyProfile({ userId, arenaSessionId, onOpenSettings }) {
  const [ranking, setRanking] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [rankingRes, profileRes] = await Promise.all([
          apiFetch(`/api/users/${userId}/ranking-summary?arenaSessionId=${arenaSessionId || ''}`),
          apiFetch(`/api/users/${userId}/public-profile?arenaSessionId=${arenaSessionId || ''}`),
        ]);
        const rankingData = await rankingRes.json();
        const profileData = await profileRes.json();
        if (!cancelled) {
          if (rankingData.success) setRanking(rankingData.summary);
          if (profileData.success) setProfile(profileData.profile);
        }
      } catch (err) {
        // Se qualcosa va storto (server, rete, ecc.), non restiamo
        // bloccati su "Caricamento" per sempre — mostriamo la
        // schermata comunque, semplicemente senza i contatori.
        console.error('Errore nel caricamento del profilo personale:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, arenaSessionId]);

  if (loading) return <div className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>Caricamento…</div>;

  if (editing) {
    return (
      <EditProfileForm
        userId={userId}
        initialBio={profile?.bio || ''}
        initialHashtags={profile?.hashtags?.map((h) => h.replace(/^#/, '')) || []}
        onSaved={(newBio, newHashtags) => {
          setProfile({ ...profile, bio: newBio, hashtags: newHashtags.map((h) => `#${h}`) });
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

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

      {/* Bio e hashtag — finalmente visibili e modificabili anche
          dopo la registrazione, non solo quella prima volta. */}
      <div style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="pl-section-label" style={{ margin: 0 }}>Bio e hashtag</div>
          <button
            onClick={() => setEditing(true)}
            style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >
            Modifica
          </button>
        </div>

        {profile?.bio ? (
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)', marginTop: 8 }}>{profile.bio}</p>
        ) : (
          <p className="pl-hint" style={{ marginTop: 8 }}>Non hai ancora scritto una bio.</p>
        )}

        {profile?.hashtags?.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {profile.hashtags.map((h) => (
              <span key={h} className="pl-hashtag">{h}</span>
            ))}
          </div>
        ) : (
          <p className="pl-hint" style={{ marginTop: 4 }}>Nessun hashtag ancora — aiutano i brand della tua categoria a trovarti.</p>
        )}
      </div>
    </div>
  );
}

function EditProfileForm({ userId, initialBio, initialHashtags, onSaved, onCancel }) {
  const [bio, setBio] = useState(initialBio);
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags] = useState(initialHashtags);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function addHashtag() {
    const clean = hashtagInput.trim().replace(/^#/, '').toLowerCase();
    if (!clean || hashtags.length >= MAX_HASHTAGS || hashtags.includes(clean)) return;
    setHashtags([...hashtags, clean]);
    setHashtagInput('');
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/profile/${userId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio, hashtagNames: hashtags }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved(bio, hashtags);
      } else {
        setError(data.reason === 'too_many_hashtags' ? `Massimo ${MAX_HASHTAGS} hashtag` : 'Qualcosa è andato storto.');
      }
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pl-screen">
      <div className="pl-sheet-close" onClick={onCancel}>Annulla ✕</div>
      <h3>Modifica bio e hashtag</h3>

      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Una breve bio (facoltativa)"
        maxLength={280}
      />

      <div className="pl-hashtag-input-row">
        <input
          value={hashtagInput}
          onChange={(e) => setHashtagInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
          placeholder="#fitness, #nightlife..."
        />
        <button type="button" onClick={addHashtag}>Aggiungi</button>
      </div>
      <div className="pl-hashtag-list">
        {hashtags.map((h) => (
          <span key={h} className="pl-hashtag-pill">
            #{h}
            <button type="button" onClick={() => setHashtags(hashtags.filter((x) => x !== h))}>✕</button>
          </span>
        ))}
      </div>
      <p className="pl-hint">Gli hashtag ti rendono trovabile dai brand della tua categoria — max {MAX_HASHTAGS}.</p>

      {error && <p className="pl-error">{error}</p>}
      <button className="pl-send-btn" onClick={save} disabled={saving}>
        {saving ? 'Salvataggio…' : 'Salva modifiche'}
      </button>
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

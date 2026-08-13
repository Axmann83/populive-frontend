import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Zap, BadgeCheck, PulseWaveIcon } from './PopuLiveIcons';

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
export default function MyProfile({ userId, arenaSessionId, onOpenSettings, pendingMatches, onOpenMatch }) {
  const [ranking, setRanking] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [matchProfiles, setMatchProfiles] = useState({}); // { [withUserId]: { displayName, photoUrl } }

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

  // Nome e foto di ciascun match in sospeso — senza questo, tutti i
  // bottoni della lista sotto sarebbero identici e indistinguibili
  // ("Apri la chat", uguale per tutti). Recuperati solo per i
  // withUserId che non conosciamo ancora, mai richiesti di nuovo.
  useEffect(() => {
    if (!pendingMatches || pendingMatches.length === 0) return;
    const missing = pendingMatches.filter((m) => m.withUserId && !matchProfiles[m.withUserId]);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(missing.map((m) =>
      apiFetch(`/api/users/${m.withUserId}/public-profile?arenaSessionId=${arenaSessionId || ''}`)
        .then((r) => r.json())
        .then((data) => ({ userId: m.withUserId, data }))
        .catch(() => ({ userId: m.withUserId, data: null }))
    )).then((results) => {
      if (cancelled) return;
      setMatchProfiles((prev) => {
        const next = { ...prev };
        results.forEach(({ userId: uid, data }) => {
          if (data?.success) {
            next[uid] = { displayName: data.profile.displayName, photoUrl: data.profile.photoUrl };
          }
        });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [pendingMatches, matchProfiles, arenaSessionId]);

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

      {/* Match in sospeso — non spariscono mai da soli, restano
          qui finché non si tocca davvero per aprire la chat. È il
          modo per ritrovare un match anche molto tempo dopo che la
          notifica in alto è già scomparsa. */}
      {pendingMatches && pendingMatches.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(255,61,110,0.3)', borderRadius: 14, padding: 12, marginBottom: 14 }}>
          <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
            {pendingMatches.length > 1 ? `${pendingMatches.length} nuovi match` : 'Nuovo match'}
          </div>
          {pendingMatches.map((m) => {
            const info = matchProfiles[m.withUserId];
            return (
              <button
                key={m.conversationId}
                onClick={() => onOpenMatch(m.conversationId)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  background: 'var(--surface)', border: 'none', borderRadius: 10,
                  padding: '10px 12px', marginBottom: 6, cursor: 'pointer', color: 'var(--text)',
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {info?.photoUrl ? (
                    <img src={info.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <PulseWaveIcon size={14} color="var(--cyan)" />
                  )}
                </div>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 12.5, fontWeight: 600 }}>
                  {info ? `Chat con ${info.displayName}` : 'Apri la chat'}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>›</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 10 }}>
        <div
          className="pl-rank-avatar"
          onClick={() => ranking?.photoUrl && setShowPhoto(true)}
          style={{ width: 64, height: 64, fontSize: 28, border: '2px solid var(--teak)', overflow: 'hidden', cursor: ranking?.photoUrl ? 'pointer' : 'default' }}
        >
          {ranking?.photoUrl
            ? <img src={ranking.photoUrl} alt={ranking.displayName || 'Tu'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (ranking?.avatarEmoji || '🙂')}
        </div>
        <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 15, marginTop: 8 }}>{ranking?.displayName || 'Tu'}</div>
      </div>

      {/* Foto a tutto schermo — per vedere esattamente come ci si
          presenta a chi ti trova sul radar, non solo il cerchietto
          piccolo. Compare solo se c'è davvero una foto (niente da
          ingrandire per chi usa ancora l'emoji come avatar). */}
      {showPhoto && ranking?.photoUrl && (
        <div
          onClick={() => setShowPhoto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <button
            onClick={() => setShowPhoto(false)}
            style={{ position: 'absolute', top: 18, right: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 16, cursor: 'pointer', backdropFilter: 'blur(4px)' }}
            aria-label="Chiudi"
          >
            ✕
          </button>
          <img
            src={ranking.photoUrl}
            alt={ranking.displayName || 'Tu'}
            style={{ maxWidth: '92%', maxHeight: '80%', borderRadius: 16, objectFit: 'contain', boxShadow: 'var(--shadow-lg)' }}
          />
        </div>
      )}

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

      {/* Premium e Verificato — i pagamenti esistevano già dietro le
          quinte da settimane, mancava solo un modo per l'utente di
          vederli e comprarli davvero. */}
      <PremiumVerifiedSection
        profile={profile}
        arenaSessionId={arenaSessionId}
        onProfileRefresh={(updated) => setProfile({ ...profile, ...updated })}
      />
    </div>
  );
}

function PremiumVerifiedSection({ profile, arenaSessionId, onProfileRefresh }) {
  const [purchasing, setPurchasing] = useState(null); // 'premium' | 'verified' | null
  const [error, setError] = useState(null);

  const buy = useCallback(async (productType, key) => {
    setPurchasing(key);
    setError(null);
    try {
      const catalogRes = await apiFetch('/api/products');
      const catalogData = await catalogRes.json();
      const product = catalogData.products?.find((p) => p.product_type === productType);
      if (!product) {
        setError('Prodotto non disponibile al momento.');
        return;
      }

      const purchaseRes = await apiFetch('/api/purchases/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, arenaSessionId }),
      });
      const purchaseData = await purchaseRes.json();

      if (purchaseData.requiresPayment) {
        window.location.href = purchaseData.checkoutUrl;
        return; // usciamo dall'app per andare su Stripe
      }

      // Account di prova/gratis: l'effetto è già stato applicato sul
      // server, aggiorniamo la vista senza dover ricaricare la pagina.
      if (purchaseData.success) {
        if (productType === 'premium_subscription') {
          onProfileRefresh({ isPremium: true });
        } else if (productType === 'verified_badge') {
          onProfileRefresh({ verificationPending: true });
        }
      } else {
        setError('Qualcosa è andato storto — riprova.');
      }
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setPurchasing(null);
    }
  }, [arenaSessionId, onProfileRefresh]);

  return (
    <div style={{ marginTop: 18 }}>
      <div className="pl-section-label">Stato profilo</div>

      {/* Premium */}
      {profile?.isPremium ? (
        <StatusBadgeCard
          icon={Zap}
          color="var(--cyan)"
          title="Premium attivo"
          sub={profile.premiumExpiresAt ? `Fino al ${new Date(profile.premiumExpiresAt).toLocaleDateString('it-IT')}` : 'Punti moltiplicati 1.2x'}
        />
      ) : (
        <PurchaseCard
          icon={Zap}
          title="Diventa Premium"
          sub="1.2x sui punti guadagnati per 30 giorni"
          buttonLabel={purchasing === 'premium' ? 'Un attimo…' : 'Attiva'}
          disabled={purchasing !== null}
          onClick={() => buy('premium_subscription', 'premium')}
        />
      )}

      {/* Verificato */}
      {profile?.isVerified ? (
        <StatusBadgeCard icon={BadgeCheck} color="var(--gold-medal, #E8C77E)" title="Profilo Verificato" sub="La tua identità è confermata" />
      ) : profile?.verificationPending ? (
        <StatusBadgeCard icon={BadgeCheck} color="var(--text-muted)" title="Verifica in corso" sub="La rivediamo a mano, ci vuole un po'" />
      ) : (
        <PurchaseCard
          icon={BadgeCheck}
          title="Verifica il profilo"
          sub="Badge identità confermata, revisione manuale"
          buttonLabel={purchasing === 'verified' ? 'Un attimo…' : 'Richiedi'}
          disabled={purchasing !== null}
          onClick={() => buy('verified_badge', 'verified')}
        />
      )}

      {error && <p className="pl-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function StatusBadgeCard({ icon: Icon, color, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: `1px solid ${color}55`, borderRadius: 14, padding: 12, marginBottom: 8, boxShadow: 'var(--shadow-sm)' }}>
      <Icon size={22} color={color} />
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
    </div>
  );
}

function PurchaseCard({ icon: Icon, title, sub, buttonLabel, disabled, onClick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 14, padding: 12, marginBottom: 8, boxShadow: 'var(--shadow-sm)' }}>
      <Icon size={22} color="var(--teak)" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{ background: 'var(--cyan)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 11, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, flexShrink: 0 }}
      >
        {buttonLabel}
      </button>
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={hashtags.includes('pr')}
          onChange={(e) => {
            if (e.target.checked) {
              if (!hashtags.includes('pr') && hashtags.length < MAX_HASHTAGS) {
                setHashtags([...hashtags, 'pr']);
              }
            } else {
              setHashtags(hashtags.filter((h) => h !== 'pr'));
            }
          }}
          style={{ width: 16, height: 16, marginBottom: 0 }}
        />
        <span style={{ fontSize: 12 }}>Sono un PR — rendimi trovabile dai locali che cercano organizzatori</span>
      </label>

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
      <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 800, fontSize: 17, color: accent || 'var(--text)' }}>
        {rank ? `#${rank}` : '—'}
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>{label} · {points ?? 0} pt</div>
    </div>
  );
}

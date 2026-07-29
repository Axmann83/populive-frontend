import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';
import { RosaSend } from './RosaFlow';
import ProfileDetail from './ProfileDetail';

export default function ProfileFullScreen({ userId, arenaSessionId, currentUserId, venueId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState(null);
  const [showRosaSend, setShowRosaSend] = useState(false);
  const [rosaSentConfirmation, setRosaSentConfirmation] = useState(false);
  const [showProfileDetail, setShowProfileDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/users/${userId}/public-profile?arenaSessionId=${arenaSessionId || ''}`);
        const data = await res.json();
        if (!cancelled && data.success) setProfile(data.profile);

        if (arenaSessionId) {
          apiFetch('/api/profile-views', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ viewedUserId: userId, arenaSessionId }),
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Errore nel caricamento del profilo:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, arenaSessionId]);

  async function sendQuickInteraction(type) {
    setActionState('sending');
    try {
      const res = await apiFetch('/api/interactions/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: userId, arenaSessionId, type }),
      });
      const data = await res.json();
      if (data.success) {
        setActionState(type === 'like' ? 'liked' : 'superliked');
      } else if (data.reason === 'superlike_balance_exhausted') {
        setActionState(null);
        offerSuperlikePurchase();
      } else {
        setActionState(null);
      }
    } catch {
      setActionState(null);
    }
  }

  async function offerSuperlikePurchase() {
    const confirmed = window.confirm('Superlike esauriti per questa settimana. Vuoi acquistarne altri 5?');
    if (!confirmed) return;

    try {
      const catalogRes = await apiFetch('/api/products');
      const catalogData = await catalogRes.json();
      const product = catalogData.products?.find((p) => p.product_type === 'superlike_credits');
      if (!product) return;

      const purchaseRes = await apiFetch('/api/purchases/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, arenaSessionId }),
      });
      const purchaseData = await purchaseRes.json();

      if (purchaseData.requiresPayment) {
        window.location.href = purchaseData.checkoutUrl;
      }
    } catch (err) {
      console.error('Errore nella proposta di acquisto Superlike:', err);
    }
  }

  if (showRosaSend) {
    return (
      <div style={overlayStyle}>
        <RosaSend
          senderId={currentUserId}
          receiverId={userId}
          arenaSessionId={arenaSessionId}
          venueId={venueId}
          onCancel={() => setShowRosaSend(false)}
          onSent={() => {
            setShowRosaSend(false);
            setRosaSentConfirmation(true);
            setTimeout(() => setRosaSentConfirmation(false), 2500);
          }}
        />
      </div>
    );
  }

  return (
    <div style={fullScreenStyle}>
      <button onClick={onClose} style={closeButtonStyle} aria-label="Chiudi">✕</button>

      {loading || !profile ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="pl-hint">Caricamento…</div>
        </div>
      ) : (
        <>
          <div style={photoContainerStyle}>
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.displayName} style={photoImgStyle} />
            ) : (
              <div style={{ ...photoImgStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 120 }}>
                {profile.avatarEmoji}
              </div>
            )}
            <div style={gradientOverlayStyle} />
          </div>

          <div style={infoOverlayStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 22 }}>{profile.displayName}</span>
                {profile.isTopConnector && <span title="Top Connector">🔗</span>}
                {profile.isTopSpender && <span title="Top Spender">💰</span>}
                {profile.isFounder && <span title="Founder">👑</span>}
              </div>
              <button onClick={() => setShowProfileDetail(true)} style={arrowButtonStyle} aria-label="Profilo completo">›</button>
            </div>
            {profile.bio && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>{profile.bio}</p>}
            {profile.hashtags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {profile.hashtags.map((h) => (
                  <span key={h} className="pl-hashtag">{h}</span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <ActionButton
                icon="♥"
                label={actionState === 'liked' ? 'Inviato' : 'Like'}
                onClick={() => sendQuickInteraction('like')}
                disabled={actionState !== null}
                active={actionState === 'liked'}
              />
              <ActionButton
                icon="★"
                label={actionState === 'superliked' ? 'Inviato' : 'Superlike'}
                onClick={() => sendQuickInteraction('superlike')}
                disabled={actionState !== null}
                active={actionState === 'superliked'}
              />
              <ActionButton
                icon="🌹"
                label="Rosa"
                onClick={() => setShowRosaSend(true)}
                disabled={actionState === 'sending'}
              />
            </div>
          </div>
        </>
      )}

      {rosaSentConfirmation && (
        <div style={toastStyle}>Rosa inviata 🌹</div>
      )}

      {showProfileDetail && (
        <ProfileDetail
          userId={userId}
          arenaSessionId={arenaSessionId}
          onBack={() => setShowProfileDetail(false)}
          onClose={() => { setShowProfileDetail(false); onClose(); }}
        />
      )}
    </div>
  );
}

function ActionButton({ icon, label, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '12px 8px',
        borderRadius: 14,
        border: active ? '1.5px solid var(--cyan)' : '1px solid rgba(228,212,200,0.25)',
        background: active ? 'rgba(47,211,232,0.15)' : 'rgba(23,23,23,0.7)',
        color: active ? 'var(--cyan)' : 'var(--text)',
        fontSize: 20,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled && !active ? 0.5 : 1,
        backdropFilter: 'blur(4px)',
      }}
    >
      <span>{icon}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

const fullScreenStyle = {
  position: 'fixed',
  inset: 0,
  background: '#000',
  zIndex: 60,
  overflow: 'hidden',
};

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.85)',
  zIndex: 61,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 0,
};

const closeButtonStyle = {
  position: 'absolute',
  top: 18,
  right: 18,
  zIndex: 5,
  width: 38,
  height: 38,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(0,0,0,0.5)',
  color: '#fff',
  fontSize: 16,
  cursor: 'pointer',
  backdropFilter: 'blur(4px)',
};

const arrowButtonStyle = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.3)',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  backdropFilter: 'blur(4px)',
  flexShrink: 0,
};

const photoContainerStyle = {
  position: 'absolute',
  inset: 0,
};

const photoImgStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  background: 'var(--surface-2)',
};

const gradientOverlayStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '45%',
  background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0))',
};

const infoOverlayStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  padding: '0 20px 32px',
  color: '#fff',
};

const toastStyle = {
  position: 'absolute',
  left: '50%',
  bottom: 100,
  transform: 'translateX(-50%)',
  background: 'var(--surface-2)',
  border: '1px solid rgba(47,211,232,0.4)',
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 600,
  padding: '9px 18px',
  borderRadius: 999,
  zIndex: 10,
};

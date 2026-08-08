import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';
import { PulseSend } from './RosaFlow';
import ProfileDetail from './ProfileDetail';
import { Heart, Star, PulseWaveIcon, Link2, Coins, Crown, Sparkles } from './PopuLiveIcons';

/**
 * ============================================================
 * POPULIVE — PROFILO A TUTTO SCHERMO (dal radar)
 * ============================================================
 * Pensata apposta per l'uso reale in un locale buio e affollato:
 * una sola schermata, foto grande per riconoscere subito la
 * persona, e i tre bottoni di interazione già lì — niente menu
 * intermedi, niente passaggi in più. Come deciso insieme: se
 * tocchi "Pulse", si apre il riquadro di scelta (drink + variante)
 * SOPRA questa stessa schermata, stesso principio "un tocco, una
 * schermata".
 * ============================================================
 */
export default function ProfileFullScreen({ userId, arenaSessionId, currentUserId, venueId, onClose, viaHistoricalBoard }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState(null); // null | 'liked' | 'superliked' | 'sending'
  const [showPulseSend, setShowPulseSend] = useState(false);
  const [pulseSentConfirmation, setPulseSentConfirmation] = useState(false);
  const [showProfileDetail, setShowProfileDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/users/${userId}/public-profile?arenaSessionId=${arenaSessionId || ''}`);
        const data = await res.json();
        if (!cancelled && data.success) setProfile(data.profile);

        // Registra la visita — genera punti (a te e a chi guardi),
        // La visita conta per i punti solo se sei dentro un'Arena
        // VERA, oppure se arrivi dalla Bacheca Storica (un contesto
        // differito apposta, non ha senso pretendere un'Arena attiva
        // in quel caso — è proprio il punto della funzionalità).
        if (arenaSessionId || viaHistoricalBoard) {
          apiFetch('/api/profile-views', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ viewedUserId: userId, arenaSessionId, viaHistoricalBoard }),
          }).catch(() => {}); // non blocchiamo la visualizzazione del profilo per questo
        }
      } catch (err) {
        console.error('Errore nel caricamento del profilo:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, arenaSessionId, viaHistoricalBoard]);

  async function sendQuickInteraction(type) {
    // type: 'like' | 'superlike'
    setActionState('sending');
    try {
      const res = await apiFetch('/api/interactions/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: userId, arenaSessionId, type, viaHistoricalBoard }),
      });
      const data = await res.json();
      if (data.success) {
        setActionState(type === 'like' ? 'liked' : 'superliked');
      } else if (data.reason === 'requires_premium_for_historical_board') {
        setActionState(null);
        window.alert('Serve Premium per contattare qualcuno dalla Bacheca Storica — puoi attivarlo dal tuo profilo.');
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

  // Saldo Superlike a zero — proponiamo subito l'acquisto di un
  // nuovo pacchetto, invece di lasciare l'utente con un bottone che
  // non fa nulla. Il prodotto si cerca per SKU nel catalogo (l'id
  // vero è generato dal database, non lo conosciamo in anticipo).
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
      // Se freeOrTest (account di prova), il saldo è già ricaricato
      // lato server — nessun'altra azione necessaria qui.
    } catch (err) {
      console.error('Errore nella proposta di acquisto Superlike:', err);
    }
  }

  if (showPulseSend) {
    return (
      <div style={overlayStyle}>
        <PulseSend
          senderId={currentUserId}
          receiverId={userId}
          arenaSessionId={arenaSessionId}
          venueId={venueId}
          onCancel={() => setShowPulseSend(false)}
          onSent={() => {
            setShowPulseSend(false);
            setPulseSentConfirmation(true);
            setTimeout(() => setPulseSentConfirmation(false), 2500);
          }}
        />
      </div>
    );
  }

  return (
    <div style={fullScreenStyle}>
      {/* X per chiudere — sempre in alto, sempre raggiungibile */}
      <button onClick={onClose} style={closeButtonStyle} aria-label="Chiudi">✕</button>

      {loading || !profile ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="pl-hint">Caricamento…</div>
        </div>
      ) : (
        <>
          {/* Foto grande sullo sfondo — il pezzo chiave per
              riconoscere qualcuno al buio, in un locale affollato.
              Se non ha una foto, un grande sfondo con l'emoji. */}
          <div style={photoContainerStyle}>
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.displayName} style={photoImgStyle} />
            ) : (
              <div style={{ ...photoImgStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 120 }}>
                {profile.avatarEmoji}
              </div>
            )}
            {/* Sfumatura scura in basso, per leggere nome/hashtag
                sopra la foto senza doverli mettere in un riquadro
                separato che coprirebbe troppo. */}
            <div style={gradientOverlayStyle} />
          </div>

          {/* Nome, badge, hashtag — sovrapposti in basso */}
          <div style={infoOverlayStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 22 }}>{profile.displayName}</span>
                {profile.isTopConnector && <Link2 size={14} color="#C7C9CC" title="Top Connector" />}
                {profile.isTopSpender && <Coins size={14} color="#E8C77E" title="Top Spender" />}
                {profile.isFounder && <Crown size={14} color="#E8C77E" title="Founder" />}
              </div>
              {/* La freccetta verso il profilo completo — bio per
                  intero e la sua posizione in classifica, se ha
                  scelto di mostrarla. */}
              <button onClick={() => setShowProfileDetail(true)} style={arrowButtonStyle} aria-label="Profilo completo">›</button>
            </div>
            {/* Status Instant Influencer — un accordo commerciale
                vero (impostato solo dai founder, mai auto-dichiarato
                come gli hashtag liberi), quindi merita un trattamento
                visivo diverso dai badge guadagnati sopra: una pillola
                ben visibile, non una piccola icona nello stesso
                angolino, altrimenti si confonderebbe con gli altri
                e perderebbe peso. */}
            {profile.instantInfluencerCategory && (
              <div style={influencerPillStyle}>
                <Sparkles size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Instant Influencer · {profile.instantInfluencerCategory}
              </div>
            )}
            {profile.bio && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>{profile.bio}</p>}
            {profile.hashtags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {profile.hashtags.map((h) => (
                  <span key={h} className="pl-hashtag">{h}</span>
                ))}
              </div>
            )}

            {/* Dalla Bacheca Storica: SOLO Superlike — niente Like
                (l'anonimato non protegge nessuno, non è più in
                tempo reale) né Pulse (non sei fisicamente lì, non
                potresti mai riscattarlo). */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              {!viaHistoricalBoard && (
                <ActionButton
                  icon={Heart}
                  label={actionState === 'liked' ? 'Inviato' : 'Like'}
                  onClick={() => sendQuickInteraction('like')}
                  disabled={actionState !== null}
                  active={actionState === 'liked'}
                />
              )}
              <ActionButton
                icon={Star}
                label={actionState === 'superliked' ? 'Inviato' : 'Superlike'}
                onClick={() => sendQuickInteraction('superlike')}
                disabled={actionState !== null}
                active={actionState === 'superliked'}
              />
              {!viaHistoricalBoard && (
                <ActionButton
                  icon={PulseWaveIcon}
                  label="Pulse"
                  onClick={() => setShowPulseSend(true)}
                  disabled={actionState === 'sending'}
                />
              )}
            </div>
          </div>
        </>
      )}

      {pulseSentConfirmation && (
        <div style={{ ...toastStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          <PulseWaveIcon size={14} /> Pulse inviato
        </div>
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

function ActionButton({ icon: Icon, label, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={active ? 'pl-confirm-wave-wrap' : ''}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '12px 8px',
        borderRadius: 14,
        border: active ? '1.5px solid var(--cyan)' : '1px solid rgba(228,212,200,0.25)',
        background: active ? 'rgba(255,61,110,0.15)' : 'rgba(23,23,23,0.7)',
        color: active ? 'var(--cyan)' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled && !active ? 0.5 : 1,
        backdropFilter: 'blur(4px)',
        boxShadow: active ? 'var(--shadow-glow-cyan)' : 'var(--shadow-sm)',
        animation: active ? 'pl-pop 0.4s ease' : 'none',
        overflow: 'visible',
      }}
    >
      {active && (
        <>
          <span className="pl-confirm-wave"></span>
          <span className="pl-confirm-wave"></span>
          <span className="pl-confirm-wave"></span>
        </>
      )}
      <Icon size={22} strokeWidth={2} fill={active ? 'currentColor' : 'none'} />
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
  boxShadow: '0 4px 12px -2px rgba(0,0,0,0.5)',
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
  boxShadow: '0 4px 12px -2px rgba(0,0,0,0.4)',
};

const influencerPillStyle = {
  display: 'inline-block',
  marginTop: 6,
  padding: '4px 11px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color: '#0D0D0D',
  background: 'linear-gradient(135deg, #F4DFA0 0%, #E8C77E 60%, #C9A15C 100%)',
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
  border: '1px solid rgba(255,61,110,0.4)',
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 600,
  padding: '9px 18px',
  borderRadius: 999,
  zIndex: 10,
  boxShadow: 'var(--shadow-lg)',
};

import { useState } from 'react';
import { apiFetch } from './apiClient';
import { Star } from './PopuLiveIcons';
import ProfileFullScreen from './ProfileFullScreen';

/**
 * ============================================================
 * POPULIVE — SUPERLIKE RICEVUTO (puro, senza Pulse allegata)
 * ============================================================
 * Il backend gestisce accetta/rifiuta/ignora da tempo — questo
 * pezzo di interfaccia mancava del tutto: senza di lui, chi
 * riceveva un Superlike puro non lo scopriva mai. Il profilo di
 * chi lo invia è già visibile qui, prima ancora di decidere —
 * natura del Superlike fin dall'inizio, mai anonimo.
 * ============================================================
 */
export default function SuperlikeNotification({ superlike, currentUserId, arenaSessionId, venueId, onResolved }) {
  const [actionState, setActionState] = useState(null); // null | 'accepted' | 'rejected' | 'ignored' | 'sending'
  const [showFullProfile, setShowFullProfile] = useState(false);

  async function respond(action) {
    setActionState('sending');
    try {
      const res = await apiFetch(`/api/interactions/${superlike.interactionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setActionState(action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'ignored');
        setTimeout(() => onResolved(data), action === 'accept' ? 1200 : 600);
      } else {
        setActionState(null);
      }
    } catch {
      setActionState(null);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 340, background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.14)', borderRadius: 20, padding: '28px 24px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>

        {actionState === null && (
          <>
            <div
              onClick={() => superlike.senderId && setShowFullProfile(true)}
              style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 14px', border: '2px solid var(--cyan)', cursor: superlike.senderId ? 'pointer' : 'default' }}
            >
              {superlike.senderPhotoUrl ? (
                <img src={superlike.senderPhotoUrl} alt={superlike.senderName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, background: 'var(--surface-2)' }}>
                  {superlike.senderAvatarEmoji || '🙂'}
                </div>
              )}
            </div>
            {showFullProfile && superlike.senderId && (
              <ProfileFullScreen
                userId={superlike.senderId}
                arenaSessionId={arenaSessionId}
                currentUserId={currentUserId}
                venueId={venueId}
                onClose={() => setShowFullProfile(false)}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <Star size={16} color="var(--cyan)" fill="var(--cyan)" />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Superlike ricevuto</span>
            </div>
            <h2 style={{ fontFamily: "'Unbounded',sans-serif", fontSize: 18, margin: '0 0 18px' }}>{superlike.senderName}</h2>

            <button className="pl-send-btn" onClick={() => respond('accept')} style={{ marginBottom: 8 }}>
              Accetta — apri la chat
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => respond('ignore')}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(228,212,200,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Lascia in sospeso
              </button>
              <button
                onClick={() => respond('reject')}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(228,212,200,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Rifiuta
              </button>
            </div>
          </>
        )}

        {actionState === 'sending' && <p className="pl-hint">Un attimo…</p>}

        {actionState === 'accepted' && (
          <>
            <div style={{ fontSize: 34, marginBottom: 6 }}>💬</div>
            <h2 style={{ fontFamily: "'Unbounded',sans-serif", fontSize: 18, margin: 0 }}>Chat aperta!</h2>
          </>
        )}

        {actionState === 'rejected' && <p className="pl-hint">Rifiutato.</p>}
        {actionState === 'ignored' && <p className="pl-hint">Lasciato in sospeso.</p>}
      </div>
    </div>
  );
}

import { useState, useCallback } from 'react';
import { getOptimizedPhotoUrl } from './apiClient';
import { Star } from './PopuLiveIcons';
import ProfileFullScreen from './ProfileFullScreen';

/**
 * ============================================================
 * POPULIVE — BACHECA STORICA, VISTA "STORIES"
 * ============================================================
 * A differenza delle Stories vere (Instagram e simili), qui NON
 * c'è nessun limite a quante volte si può tornare indietro — chi
 * ha intravisto qualcuno per trenta secondi al buio ha bisogno di
 * più di un'occhiata per riconoscerlo, non ha senso obbligarlo ad
 * andare solo avanti.
 *
 * Tocco a destra = avanti, tocco a sinistra = indietro (nessun
 * limite in nessuna delle due direzioni). Il Superlike resta
 * l'unica azione possibile da qui, stessa regola già decisa per
 * la bacheca storica in generale.
 * ============================================================
 */
export default function HistoricalStories({ people, currentUserId, onClose }) {
  const [index, setIndex] = useState(0);
  const [openProfile, setOpenProfile] = useState(false);

  const current = people[index];

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, people.length - 1));
  }, [people.length]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  function handleTap(e) {
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const tapX = e.clientX - left;
    if (tapX < width / 2) goBack();
    else goNext();
  }

  if (!current) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 85 }}>
      {/* Barra di avanzamento — un segmento per persona, pieno fino
          a quella corrente. Non è un limite di visualizzazione,
          solo un riferimento visivo di "dove sei nella sequenza". */}
      <div style={{ position: 'absolute', top: 10, left: 12, right: 12, display: 'flex', gap: 4, zIndex: 3 }}>
        {people.map((p, i) => (
          <div key={p.userId} style={{ flex: 1, height: 3, borderRadius: 999, background: i <= index ? 'var(--cyan)' : 'rgba(255,255,255,0.25)' }} />
        ))}
      </div>

      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 22, right: 14, zIndex: 3, width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 15, cursor: 'pointer' }}
        aria-label="Chiudi"
      >
        ✕
      </button>

      {/* Zona di tocco per navigare — sinistra=indietro, destra=avanti.
          Nessun tetto su quante volte si può tornare indietro. */}
      <div onClick={handleTap} style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}>
        {current.photoUrl ? (
          <img src={getOptimizedPhotoUrl(current.photoUrl, { width: 800, height: 1400, crop: false })} alt={current.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 140, background: 'var(--surface-2)' }}>
            {current.avatarEmoji || '🙂'}
          </div>
        )}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0))' }} />
      </div>

      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 30, zIndex: 3, color: '#fff' }}>
        <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{current.displayName}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
          Visto qui {formatRelativeDay(current.lastSeenAt)}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setOpenProfile(true); }}
            style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Guarda profilo
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setOpenProfile(true); }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            <Star size={14} />
            Superlike
          </button>
        </div>
      </div>

      {/* Il tocco su "Guarda profilo"/"Superlike" apre il profilo vero
          a tutto schermo — stessa schermata di sempre, con SOLO il
          Superlike disponibile (viaHistoricalBoard), coerente con
          quanto già deciso per la bacheca storica. */}
      {openProfile && (
        <ProfileFullScreen
          userId={current.userId}
          arenaSessionId={null}
          currentUserId={currentUserId}
          onClose={() => setOpenProfile(false)}
          viaHistoricalBoard
        />
      )}
    </div>
  );
}

function formatRelativeDay(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'oggi';
  if (diffDays === 1) return 'ieri';
  return `${diffDays} giorni fa`;
}

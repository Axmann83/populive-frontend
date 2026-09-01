import { useState, useEffect } from 'react';
import { PulseWaveIcon, MessageCircle } from './PopuLiveIcons';
import { apiFetch, getOptimizedPhotoUrl } from './apiClient';

/**
 * ============================================================
 * POPULIVE — CENTRO CHAT
 * ============================================================
 * Prima queste due liste ("Nuovo match" e "Le tue chat") vivevano
 * annidate in cima al Profilo — con più chat salvate diventava
 * scomodo scorrere insieme al resto. Spostate qui, in una
 * schermata propria raggiungibile dalla barra in basso, stile
 * Tinder (un "centro messaggi" dedicato).
 *
 * pendingMatches: match sbloccati ma mai ancora aperti (vivono solo
 *   nella sessione in corso, arrivano via socket in App.jsx).
 * activeChats: TUTTE le conversazioni ancora accessibili, lette
 *   fresche dal server (sopravvivono a un refresh) — filtrate qui
 *   sotto per non duplicare quelle già mostrate come "nuovo match".
 * ============================================================
 */
export default function ChatCenter({ pendingMatches, activeChats, onOpenMatch, arenaSessionId }) {
  const [matchProfiles, setMatchProfiles] = useState({}); // { [withUserId]: { displayName, photoUrl } }

  useEffect(() => {
    const allEntries = [...(pendingMatches || []), ...(activeChats || [])];
    if (allEntries.length === 0) return;
    const missing = allEntries.filter((m) => m.withUserId && !matchProfiles[m.withUserId]);
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
  }, [pendingMatches, activeChats, matchProfiles, arenaSessionId]);

  const savedChats = (activeChats || []).filter(
    (c) => !(pendingMatches || []).some((m) => m.conversationId === c.conversationId)
  );
  const isEmpty = (!pendingMatches || pendingMatches.length === 0) && savedChats.length === 0;

  function renderRow(entry) {
    const info = matchProfiles[entry.withUserId];
    return (
      <button
        key={entry.conversationId}
        onClick={() => onOpenMatch(entry.conversationId)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)', border: 'none', borderRadius: 14,
          padding: '12px 14px', marginBottom: 8, cursor: 'pointer', color: 'var(--text)',
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {info?.photoUrl ? (
            <img src={getOptimizedPhotoUrl(info.photoUrl, { width: 40, height: 40 })} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <PulseWaveIcon size={18} color="var(--cyan)" />
          )}
        </div>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 13.5, fontWeight: 600 }}>
          {info ? info.displayName : 'Apri la chat'}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>›</span>
      </button>
    );
  }

  return (
    <div className="pl-screen">
      <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 16 }}>
        Le tue chat
      </div>

      {isEmpty && (
        <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--text-muted)' }}>
          <MessageCircle size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
          <p className="pl-hint">Ancora nessuna chat — arriveranno qui appena scatta un match.</p>
        </div>
      )}

      {pendingMatches && pendingMatches.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
            {pendingMatches.length > 1 ? `${pendingMatches.length} nuovi match` : 'Nuovo match'}
          </div>
          {pendingMatches.map(renderRow)}
        </div>
      )}

      {savedChats.length > 0 && (
        <div>
          {pendingMatches && pendingMatches.length > 0 && (
            <div className="pl-section-label" style={{ marginBottom: 8 }}>Conversazioni</div>
          )}
          {savedChats.map(renderRow)}
        </div>
      )}
    </div>
  );
}

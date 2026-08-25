import { useState, useEffect } from 'react';
import ProfileFullScreen from './ProfileFullScreen';
import { Heart, Star, PulseWaveIcon, Bell } from './PopuLiveIcons';
import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — SCHERMATA "LIKE"
 * ============================================================
 * Nuova icona in basso (23/8, sostituisce Notifiche lì — quella
 * si è spostata in alto, ora è solo storico degli esiti).
 * Pensata per essere leggibile e toccabile al buio in un locale:
 * riquadri grandi, non righe piccole con testo fitto.
 *
 * Due schede, RICEVUTI e INVIATI:
 *   - RICEVUTI: solo ciò che aspetta ancora una decisione. Un Like
 *     mostra un cuoricino al posto della foto (resta anonimo,
 *     "hai un ammiratore"). Superlike/Pulse mostrano la foto vera,
 *     grande, cliccabile per il profilo completo — e sotto, nello
 *     stesso riquadro, i tre bottoni Accetta/Sospendi/Rifiuta.
 *     Decisa (o un match Like+Like) → sparisce da qui, la chat si
 *     trova pronta sotto l'icona Chat.
 *   - INVIATI: TUTTA la cronologia di ciò che si è mandato (non
 *     solo in sospeso) — sempre con la foto vera (nessun
 *     anonimato dal lato di chi ha scelto quella persona), nessun
 *     bottone, solo il tocco per rivedere il profilo. Pensata per
 *     tornare facilmente sui profili che hanno colpito — anche
 *     per controllare se un Instant Influencer ha caricato
 *     qualcosa di nuovo tra una serata e l'altra.
 * ============================================================
 */

const KIND_META = {
  like: { icon: Heart, label: 'Like', color: 'var(--cyan)' },
  superlike: { icon: Star, label: 'Superlike', color: 'var(--gold-medal, #D4A85C)' },
  pulse_standalone: { icon: PulseWaveIcon, label: 'Pulse', color: 'var(--cyan)' },
  pulse_like: { icon: PulseWaveIcon, label: 'Pulse+Like', color: 'var(--cyan)' },
  pulse_simple: { icon: PulseWaveIcon, label: 'Pulse', color: 'var(--gold-medal, #D4A85C)' },
  pulse_super: { icon: PulseWaveIcon, label: 'Pulse+Superlike', color: 'var(--gold-medal, #D4A85C)' },
};

const SENT_STATUS_LABELS = {
  sent: 'In attesa',
  pending: 'In attesa',
  matched: 'Match',
  accepted: 'Accettato',
  redeemed: 'Riscattato',
  rejected: 'Rifiutato',
  ignored: 'In sospeso',
  expired: 'Scaduto',
};

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ora';
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`;
  return new Date(dateString).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

export default function LikeCenter({ userId, arenaSessionId, venueId, onOpenChat, onSeen }) {
  const [tab, setTab] = useState('ricevuti'); // 'ricevuti' | 'inviati'
  const [pending, setPending] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingItem, setViewingItem] = useState(null); // { userId, isPendingDecision, kind, id } | null
  const [respondingIds, setRespondingIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch(`/api/users/${userId}/pending-received-interactions`).then((r) => r.json()),
      apiFetch(`/api/users/${userId}/sent-interactions-history`).then((r) => r.json()),
    ])
      .then(([pendingData, sentData]) => {
        if (cancelled) return;
        if (pendingData.success) setPending(pendingData.items);
        if (sentData.success) setSent(sentData.items);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  // Aprire davvero questa schermata azzera il pallino sulla scheda.
  useEffect(() => {
    apiFetch(`/api/users/${userId}/mark-like-center-seen`, { method: 'POST' }).catch(() => {});
    onSeen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleRespond(item, action) {
    const key = `${item.kind}-${item.id}`;
    if (respondingIds.has(key)) return;
    setRespondingIds((prev) => new Set(prev).add(key));

    const endpoint = item.kind === 'superlike'
      ? `/api/interactions/${item.id}/respond`
      : `/api/pulses/${item.id}/respond`;

    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (!data.success) {
        window.alert('Non è stato possibile completare l\'azione. Riprova.');
        return;
      }

      // Accettare un Superlike o una Pulse+Superlike apre subito la
      // chat, esattamente come dal popup dal vivo.
      if (action === 'accept' && data.conversationId) {
        onOpenChat?.(data.conversationId);
      }

      // Pulse+Like accettata: la chat non è automatica, dipende dal
      // minigioco.
      if (action === 'accept' && item.kind === 'pulse_like' && data.canStillPlayGuessGame) {
        window.alert('Pulse accettata! Vai nella scheda Pulse per provare a indovinare chi te l\'ha mandata e sbloccare la chat.');
      }

      // Decisa: sparisce da qui, qualunque sia stata la scelta.
      setPending((prev) => prev.filter((p) => !(p.kind === item.kind && p.id === item.id)));
      setViewingItem(null);
    } catch {
      window.alert('Non è stato possibile completare l\'azione — controlla la connessione e riprova.');
    } finally {
      setRespondingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const items = tab === 'ricevuti' ? pending : sent;

  return (
    <div className="pl-screen">
      <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 14 }}>
        Like
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['ricevuti', 'inviati'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '9px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
              border: tab === t ? '1.5px solid var(--cyan)' : '1.5px solid rgba(228,212,200,0.16)',
              background: tab === t ? 'rgba(255,61,110,0.1)' : 'transparent',
              color: tab === t ? 'var(--cyan)' : 'var(--text-muted)',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <p className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>Caricamento…</p>}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--text-muted)' }}>
          <Bell size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
          <p className="pl-hint">
            {tab === 'ricevuti' ? 'Niente da decidere per ora.' : 'Non hai ancora mandato nulla.'}
          </p>
        </div>
      )}

      {!loading && tab === 'ricevuti' && items.map((item) => {
        const meta = KIND_META[item.kind] || {};
        const hasPhoto = !!item.sender?.photoUrl;
        const responding = respondingIds.has(`${item.kind}-${item.id}`);
        return (
          <div key={`${item.kind}-${item.id}`} style={{ background: 'var(--surface-2)', borderRadius: 18, overflow: 'hidden', marginBottom: 16, border: '1px solid rgba(217,204,192,0.12)' }}>
            <div
              onClick={hasPhoto ? () => setViewingItem({ userId: item.sender.userId, isPendingDecision: true, kind: item.kind, id: item.id }) : undefined}
              style={{
                width: '100%', height: 200, position: 'relative', cursor: hasPhoto ? 'pointer' : 'default',
                background: hasPhoto ? `center/cover url(${item.sender.photoUrl})` : 'linear-gradient(160deg,#2a1620,#1a1013)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(20,16,15,0.75)', backdropFilter: 'blur(4px)', padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: meta.color }}>
                {item.kind === 'like' ? 'Ammiratore misterioso' : meta.label}
              </div>
              {!hasPhoto && <Heart size={56} color="var(--cyan)" fill="var(--cyan)" style={{ opacity: 0.9 }} />}
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {item.sender ? item.sender.displayName : 'Hai ricevuto un Like'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {item.drinkType ? `${item.drinkType} · ` : ''}{item.venueName} · {timeAgo(item.createdAt)}
              </div>
            </div>
            {item.kind !== 'like' && (
              <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
                <button
                  onClick={() => handleRespond(item, 'accept')}
                  disabled={responding}
                  style={{ flex: 1, padding: 11, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF6690,#FF3D6E)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: responding ? 'default' : 'pointer', opacity: responding ? 0.6 : 1 }}
                >
                  Accetta
                </button>
                <button
                  onClick={() => handleRespond(item, 'ignore')}
                  disabled={responding}
                  style={{ flex: 1, padding: 11, borderRadius: 12, border: '1.5px solid rgba(228,212,200,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: responding ? 'default' : 'pointer', opacity: responding ? 0.6 : 1 }}
                >
                  Sospendi
                </button>
                <button
                  onClick={() => handleRespond(item, 'reject')}
                  disabled={responding}
                  style={{ flex: 1, padding: 11, borderRadius: 12, border: '1.5px solid rgba(228,212,200,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: responding ? 'default' : 'pointer', opacity: responding ? 0.6 : 1 }}
                >
                  Rifiuta
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!loading && tab === 'inviati' && items.map((item) => {
        const meta = KIND_META[item.kind] || {};
        const statusLabel = SENT_STATUS_LABELS[item.status];
        return (
          <div
            key={`${item.kind}-${item.id}`}
            onClick={() => setViewingItem({ userId: item.otherPerson.userId, isPendingDecision: false })}
            style={{ background: 'var(--surface-2)', borderRadius: 18, overflow: 'hidden', marginBottom: 16, border: '1px solid rgba(217,204,192,0.12)', cursor: 'pointer' }}
          >
            <div
              style={{
                width: '100%', height: 200, position: 'relative',
                background: `center/cover url(${item.otherPerson.photoUrl})`,
              }}
            >
              <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(20,16,15,0.75)', backdropFilter: 'blur(4px)', padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: meta.color }}>
                {meta.label}
              </div>
              {statusLabel && (
                <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(20,16,15,0.75)', backdropFilter: 'blur(4px)', padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {statusLabel}
                </div>
              )}
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{item.otherPerson.displayName}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {item.drinkType ? `${item.drinkType} · ` : ''}{item.venueName} · {timeAgo(item.createdAt)}
              </div>
            </div>
          </div>
        );
      })}

      {viewingItem && (
        <ProfileFullScreen
          userId={viewingItem.userId}
          arenaSessionId={arenaSessionId}
          currentUserId={userId}
          venueId={venueId}
          onClose={() => setViewingItem(null)}
          decisionActions={viewingItem.isPendingDecision ? {
            onAccept: () => handleRespond(viewingItem, 'accept'),
            onReject: () => handleRespond(viewingItem, 'reject'),
            onIgnore: () => handleRespond(viewingItem, 'ignore'),
          } : null}
          hideActionButtons={!viewingItem.isPendingDecision}
        />
      )}
    </div>
  );
}

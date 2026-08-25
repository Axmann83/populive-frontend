import { useState, useEffect } from 'react';
import SwipeableRow from './SwipeableRow';
import ProfileFullScreen from './ProfileFullScreen';
import { Star, PulseWaveIcon, Bell, PartyPopper } from './PopuLiveIcons';
import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — CENTRO NOTIFICHE
 * ============================================================
 * Ristretto (23/8) al puro STORICO DEGLI ESITI, dopo l'introduzione
 * della nuova schermata "Like" (icona a sé in basso): le interazioni
 * INVIATE e quelle RICEVUTE ancora da decidere vivono ora
 * ESCLUSIVAMENTE lì. Qui restano solo due cose:
 *   - Match confermati da Like reciproco — resta QUI finché nessuno
 *     dei due interagisce davvero (stile "Nuovi match" di Tinder).
 *     Toccare la foto apre direttamente la chat.
 *   - Ricevute che ERANO in sospeso e ora hanno un esito finale
 *     (accettata/rifiutata/riscattata/scaduta) — un registro di
 *     cosa è già successo, senza più nessun bottone d'azione.
 *
 * L'identità viene mostrata SOLO quando le regole di anonimato
 * dell'app lo permettono già altrove (deciso lato server, mai qui).
 * ============================================================
 */

const KIND_META = {
  like_match: { icon: PartyPopper, color: 'var(--gold-medal, #D4A85C)', label: 'Match' },
  superlike: { icon: Star, color: 'var(--gold-medal, #D4A85C)', label: 'Superlike' },
  pulse_standalone: { icon: PulseWaveIcon, color: 'var(--cyan)', label: 'Pulse' },
  pulse_like: { icon: PulseWaveIcon, color: 'var(--cyan)', label: 'Pulse+Like' },
  pulse_simple: { icon: PulseWaveIcon, color: 'var(--gold-medal, #D4A85C)', label: 'Pulse' },
  pulse_super: { icon: PulseWaveIcon, color: 'var(--gold-medal, #D4A85C)', label: 'Pulse+Superlike' },
};

const STATUS_LABELS = {
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

function describeEntry(entry) {
  if (entry.direction === 'match') {
    return entry.otherPerson ? `Hai matchato con ${entry.otherPerson.displayName}! 🎉` : 'Hai fatto un nuovo match!';
  }
  const kindLabel = KIND_META[entry.kind]?.label || entry.kind;
  const who = entry.otherPerson ? entry.otherPerson.displayName : 'Qualcuno';
  return entry.otherPerson
    ? `${who} ti ha mandato un ${kindLabel}`
    : `Hai ricevuto un ${kindLabel}`;
}

export default function NotificationCenter({ userId, onSeen, arenaSessionId, venueId, onOpenChat }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingUserId, setViewingUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/users/${userId}/interaction-history`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success) setHistory(data.history);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  // Aprire davvero questa schermata azzera il pallino sulla scheda
  // — segnaliamo al server (per la prossima volta) E al genitore
  // (per sparire subito, senza aspettare un altro giro al server).
  useEffect(() => {
    apiFetch(`/api/users/${userId}/mark-notifications-seen`, { method: 'POST' }).catch(() => {});
    onSeen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Nasconde solo QUESTA riga — mai la riga vera sottostante (Like/
  // Superlike/Pulse restano intatti, servono anche altrove). Sparisce
  // subito dalla lista, senza aspettare la risposta del server.
  function handleDismiss(entry) {
    setHistory((prev) => prev.filter((h) => !(h.kind === entry.kind && h.id === entry.id)));
    apiFetch(`/api/users/${userId}/notifications/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: entry.kind, entryId: entry.id }),
    }).catch(() => {});
  }

  function handleClearAll() {
    if (!window.confirm('Svuotare tutto il Centro Notifiche? Quelle nuove che arriveranno dopo restano visibili.')) return;
    setHistory([]);
    apiFetch(`/api/users/${userId}/notifications/clear-all`, { method: 'POST' }).catch(() => {});
  }

  // Foto cliccabile — comportamento diverso a seconda del tipo:
  // su un match apre DIRETTAMENTE la chat (stile Tinder: tocchi la
  // foto del match, parti a scriverle), su tutto il resto apre il
  // profilo completo di quella persona.
  function handlePhotoClick(entry) {
    if (entry.kind === 'like_match') {
      if (entry.conversationId) onOpenChat?.(entry.conversationId);
      return;
    }
    if (entry.otherPerson?.userId) setViewingUserId(entry.otherPerson.userId);
  }

  return (
    <div className="pl-screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 18 }}>
          Centro Notifiche
        </div>
        {!loading && history.length > 0 && (
          <button
            onClick={handleClearAll}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 4 }}
          >
            Ripulisci tutto
          </button>
        )}
      </div>

      {loading && <p className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>Caricamento…</p>}

      {!loading && history.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--text-muted)' }}>
          <Bell size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
          <p className="pl-hint">Ancora nessun esito — arriveranno qui appena succede qualcosa.</p>
        </div>
      )}

      {!loading && history.map((entry) => {
        const meta = KIND_META[entry.kind] || {};
        const Icon = meta.icon || Bell;
        const statusLabel = STATUS_LABELS[entry.status];
        const photoClickable = entry.kind === 'like_match' ? !!entry.conversationId : !!entry.otherPerson?.userId;

        return (
          <SwipeableRow key={`${entry.kind}-${entry.id}`} onDismiss={() => handleDismiss(entry)}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--surface-2)', padding: '12px 14px',
              }}
            >
              <div
                onClick={photoClickable ? () => handlePhotoClick(entry) : undefined}
                style={{
                  width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                  background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: photoClickable ? 'pointer' : 'default',
                  border: photoClickable ? '1.5px solid var(--cyan)' : 'none',
                }}
              >
                {entry.otherPerson?.photoUrl ? (
                  <img src={entry.otherPerson.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Icon size={18} color={meta.color || 'var(--text-muted)'} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{describeEntry(entry)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {entry.direction === 'match' ? (
                    <span style={{ color: meta.color }}>🎉 Match</span>
                  ) : (
                    <span style={{ color: meta.color }}>↘ Ricevuta</span>
                  )}
                  {entry.direction !== 'match' && statusLabel && <span>· {statusLabel}</span>}
                  {entry.drinkType && <span>· {entry.drinkType}</span>}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {timeAgo(entry.createdAt)}
              </div>
            </div>
          </SwipeableRow>
        );
      })}

      {viewingUserId && (
        <ProfileFullScreen
          userId={viewingUserId}
          arenaSessionId={arenaSessionId}
          currentUserId={userId}
          venueId={venueId}
          onClose={() => setViewingUserId(null)}
          hideActionButtons
        />
      )}
    </div>
  );
}

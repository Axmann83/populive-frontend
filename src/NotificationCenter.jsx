import { useState, useEffect } from 'react';
import { Heart, Star, PulseWaveIcon, Bell, PartyPopper } from './PopuLiveIcons';
import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — CENTRO NOTIFICHE
 * ============================================================
 * Storico cronologico completo — Like, Superlike, Pulse (tutte le
 * varianti), sia inviate sia ricevute, in un unico elenco. Prima
 * non esisteva nulla di simile: le uniche tracce erano le notifiche
 * "a caldo" del momento, mai una lista da poter riguardare dopo.
 *
 * L'identità di chi ha mandato/ricevuto viene mostrata SOLO quando
 * le regole di anonimato dell'app lo permettono già altrove (deciso
 * lato server, mai qui) — altrimenti resta "Qualcuno".
 * ============================================================
 */

const KIND_META = {
  like: { icon: Heart, color: 'var(--cyan)', label: 'Like' },
  like_match: { icon: PartyPopper, color: 'var(--gold-medal, #D4A85C)', label: 'Match' },
  superlike: { icon: Star, color: 'var(--gold-medal, #D4A85C)', label: 'Superlike' },
  pulse_standalone: { icon: PulseWaveIcon, color: 'var(--cyan)', label: 'Pulse' },
  pulse_like: { icon: PulseWaveIcon, color: 'var(--cyan)', label: 'Pulse+Like' },
  pulse_super: { icon: PulseWaveIcon, color: 'var(--gold-medal, #D4A85C)', label: 'Pulse+Superlike' },
};

const STATUS_LABELS = {
  pending: 'Da decidere',
  accepted: 'Accettata',
  redeemed: 'Riscattata',
  rejected: 'Rifiutata',
  ignored: 'In sospeso',
  expired: 'Scaduta',
  sent: null, // per Like/Superlike lo stato "sent" è il default, non serve mostrarlo
  matched: 'Match',
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
  if (entry.direction === 'sent') {
    return `Hai mandato un ${kindLabel} a ${entry.otherPerson ? who : 'una persona'}`;
  }
  return entry.otherPerson
    ? `${who} ti ha mandato un ${kindLabel}`
    : `Hai ricevuto un ${kindLabel}`;
}

export default function NotificationCenter({ userId, onSeen }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

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
          <p className="pl-hint">Ancora nessuna interazione — arriveranno qui appena succede qualcosa.</p>
        </div>
      )}

      {!loading && history.map((entry) => {
        const meta = KIND_META[entry.kind] || {};
        const Icon = meta.icon || Bell;
        const statusLabel = STATUS_LABELS[entry.status];
        return (
          <div
            key={`${entry.kind}-${entry.id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--surface-2)', borderRadius: 14,
              padding: '12px 14px', marginBottom: 8,
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  <span style={{ color: entry.direction === 'sent' ? 'var(--text-muted)' : meta.color }}>
                    {entry.direction === 'sent' ? '↗ Inviata' : '↘ Ricevuta'}
                  </span>
                )}
                {entry.direction !== 'match' && statusLabel && <span>· {statusLabel}</span>}
                {entry.drinkType && <span>· {entry.drinkType}</span>}
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {timeAgo(entry.createdAt)}
            </div>
            <button
              onClick={() => handleDismiss(entry)}
              aria-label="Rimuovi notifica"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from './apiClient';
import { onBackButton } from './native';
import { askConfirm, isConfirmOpen, showToast } from './Dialogs';

/**
 * ============================================================
 * POPULIVE — SEGNALA E BLOCCA (B2, novembre 2026)
 * ============================================================
 * Regola 1.2 di Apple: da un profilo e da una chat si deve poter
 * segnalare la persona e bloccarla. Tre motivi (decisione D-B2 del
 * 1/11) più un testo facoltativo; le segnalazioni le controllano gli
 * Architetti dalla dashboard (sezione Segnalazioni).
 *
 *   <SafetyMenuButton userId displayName onBlocked />
 *     → "⋯" che apre "Segnala" / "Blocca" (profilo a tutto schermo e
 *       profilo completo);
 *   <ReportSheet … />  → la finestra della segnalazione (anche dalla chat);
 *   blockUserWithConfirm(…) → chiede conferma e blocca.
 *
 * Dopo un blocco l'evento PAIR_HIDDEN_EVENT avvisa radar e classifica
 * di togliere la persona subito (lo stesso evento arriva dal server
 * via socket, 'pair_hidden', agli altri dispositivi e a chi è stato
 * bloccato, v. App.jsx).
 * ============================================================
 */

export const PAIR_HIDDEN_EVENT = 'populive:pair-hidden';

export function announcePairHidden(userId) {
  window.dispatchEvent(new CustomEvent(PAIR_HIDDEN_EVENT, { detail: { userId } }));
}

export function onPairHidden(callback) {
  const listener = (e) => e.detail?.userId && callback(e.detail.userId);
  window.addEventListener(PAIR_HIDDEN_EVENT, listener);
  return () => window.removeEventListener(PAIR_HIDDEN_EVENT, listener);
}

const REASONS = [
  { value: 'adult_content', label: 'Nudo o contenuti per adulti' },
  { value: 'harassment', label: 'Molestie, odio o bullismo' },
  { value: 'fake_or_spam', label: 'Profilo falso, spam o truffa' },
];

// Da un profilo si blocca la persona (userId); da una chat si passa la
// conversazione, il server sa chi è l'altra persona.
export async function blockUserWithConfirm({ userId, conversationId, displayName }) {
  const confirmed = await askConfirm({
    title: `Bloccare ${displayName || 'questa persona'}?`,
    message:
      'Non potrete più vedervi né contattarvi, in nessun locale; se avete una chat, viene rimossa. Potrai sbloccare questa persona dalle Impostazioni.',
    confirmLabel: 'Blocca',
    danger: true,
  });
  if (!confirmed) return false;
  try {
    const path = conversationId
      ? `/api/chat/${conversationId}/block`
      : `/api/users/${userId}/block`;
    const res = await apiFetch(path, { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      showToast('Non siamo riusciti a bloccare questa persona — riprova.', { tone: 'error' });
      return false;
    }
    if (userId) announcePairHidden(userId);
    showToast(`Hai bloccato ${displayName || 'questa persona'}.`, { tone: 'success' });
    return true;
  } catch {
    showToast('Connessione assente — riprova.', { tone: 'error' });
    return false;
  }
}

/**
 * Finestra della segnalazione. Dopo l'invio propone anche il blocco
 * (chi segnala di solito non vuole più vedere quella persona), con
 * onBlocked se lo sceglie.
 */
export function ReportSheet({
  reportedUserId,
  conversationId,
  context,
  displayName,
  onClose,
  onBlocked,
}) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(
    () =>
      onBackButton(() => {
        if (!isConfirmOpen()) onClose?.();
      }),
    [onClose]
  );

  async function submit() {
    if (!reason || sending) return;
    setSending(true);
    try {
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportedUserId, conversationId, context, reason, details }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast('Segnalazione non inviata — riprova.', { tone: 'error' });
        setSending(false);
        return;
      }
    } catch {
      showToast('Connessione assente — riprova.', { tone: 'error' });
      setSending(false);
      return;
    }
    onClose?.();
    showToast('Segnalazione inviata. Grazie: la controlleremo al più presto.', {
      tone: 'success',
    });
    const blocked = await blockUserWithConfirm({
      userId: conversationId ? null : reportedUserId,
      conversationId,
      displayName,
    });
    if (blocked) onBlocked?.();
  }

  return createPortal(
    <div className="pl-dialog-backdrop" onClick={onClose}>
      <div
        className="pl-dialog pl-report"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pl-report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="pl-dialog-title" id="pl-report-title">
          Segnala {displayName || ''}
        </h3>
        <p className="pl-dialog-message">
          {context === 'chat'
            ? 'Qual è il problema in questa chat? Chi segnali non lo saprà.'
            : 'Qual è il problema con questo profilo? Chi segnali non lo saprà.'}
        </p>
        <div className="pl-report-options" role="radiogroup">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={reason === r.value}
              className={`pl-report-option ${reason === r.value ? 'pl-report-option-on' : ''}`}
              onClick={() => setReason(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          className="pl-report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Vuoi aggiungere qualcosa? (facoltativo)"
          maxLength={1000}
          rows={3}
        />
        <div className="pl-dialog-actions">
          <button type="button" className="pl-dialog-cancel" onClick={onClose}>
            Annulla
          </button>
          <button
            type="button"
            className="pl-dialog-confirm pl-dialog-danger"
            onClick={submit}
            disabled={!reason || sending}
            style={{ opacity: !reason || sending ? 0.5 : 1 }}
          >
            {sending ? 'Invio…' : 'Segnala'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * "⋯" sui profili degli altri: apre la scelta tra Segnala e Blocca.
 * style = posizione del bottone, decisa da chi lo usa.
 */
export function SafetyMenuButton({ userId, displayName, style, onBlocked }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    return onBackButton(() => setMenuOpen(false));
  }, [menuOpen]);

  async function block() {
    setMenuOpen(false);
    if (await blockUserWithConfirm({ userId, displayName })) onBlocked?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        style={{ ...menuButtonStyle, ...style }}
        aria-label="Segnala o blocca"
      >
        ⋯
      </button>
      {menuOpen &&
        createPortal(
          <div className="pl-dialog-backdrop" onClick={() => setMenuOpen(false)}>
            <div
              className="pl-dialog pl-safety-menu"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="pl-dialog-title">{displayName}</h3>
              <button
                type="button"
                className="pl-safety-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setReporting(true);
                }}
              >
                Segnala
              </button>
              <button
                type="button"
                className="pl-safety-menu-item pl-safety-menu-danger"
                onClick={block}
              >
                Blocca
              </button>
              <button
                type="button"
                className="pl-safety-menu-item pl-safety-menu-cancel"
                onClick={() => setMenuOpen(false)}
              >
                Annulla
              </button>
            </div>
          </div>,
          document.body
        )}
      {reporting && (
        <ReportSheet
          reportedUserId={userId}
          context="profile"
          displayName={displayName}
          onClose={() => setReporting(false)}
          onBlocked={onBlocked}
        />
      )}
    </>
  );
}

const menuButtonStyle = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(0,0,0,0.5)',
  color: '#fff',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  boxShadow: '0 4px 12px -2px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(4px)',
};

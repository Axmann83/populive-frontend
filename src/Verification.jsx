import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck } from './PopuLiveIcons';
import { apiFetch, uploadPhotoToStorage } from './apiClient';
import { showToast } from './Dialogs';
import { onBackButton } from './native';
import WavesSpinner from './WavesSpinner';
import { StatusBadgeCard, PurchaseCard } from './ProfileCards';

/**
 * ============================================================
 * BADGE VERIFICATO (lotto 9, 11/11) — gratis
 * ============================================================
 * "Chiedi la verifica" → il server assegna un gesto a caso → selfie con
 * la fotocamera frontale mentre lo si fa → invio. Un Architetto lo
 * confronta con le foto del profilo dalla dashboard (sezione Verifiche)
 * e approva o rifiuta; l'esito arriva anche come push. Stati dal server
 * (GET /api/verification): none | challenge | pending | rejected | verified.
 * ============================================================
 */
export default function VerificationCard() {
  const [state, setState] = useState(null); // risposta di GET /api/verification
  const [gesture, setGesture] = useState(null); // { key, text } quando il pannello è aperto
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/verification');
      const data = await res.json();
      if (data.success) setState(data);
    } catch {
      /* resta lo stato precedente */
    }
  }, []);

  useEffect(() => {
    load();
    // Esito arrivato mentre si è nell'app (evento socket in App.jsx)
    window.addEventListener('pl-verification-changed', load);
    return () => window.removeEventListener('pl-verification-changed', load);
  }, [load]);

  async function start() {
    setBusy(true);
    try {
      const res = await apiFetch('/api/verification/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) setGesture(data.gesture);
      else if (data.reason === 'already_pending') await load();
      else showToast('Qualcosa è andato storto — riprova.', { tone: 'error' });
    } catch {
      showToast('Connessione assente — riprova.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  if (state.status === 'verified') {
    return (
      <StatusBadgeCard
        icon={BadgeCheck}
        color="#3897F0"
        title="Profilo Verificato"
        sub="Accanto al tuo nome c'è la spunta blu"
      />
    );
  }
  if (state.status === 'pending') {
    return (
      <StatusBadgeCard
        icon={BadgeCheck}
        color="var(--text-muted)"
        title="Verifica in corso"
        sub="Stiamo confrontando il selfie con le tue foto: ti avvisiamo appena è fatto"
      />
    );
  }

  return (
    <>
      <PurchaseCard
        icon={BadgeCheck}
        title={state.status === 'rejected' ? 'Verifica non riuscita' : 'Verifica il profilo'}
        sub={
          state.status === 'rejected'
            ? `${state.rejectReason} Puoi riprovare.`
            : 'Gratis: un selfie con un gesto e ottieni la spunta blu'
        }
        buttonLabel={
          busy ? (
            <WavesSpinner size="sm" inline />
          ) : state.status === 'rejected' ? (
            'Riprova'
          ) : (
            'Inizia'
          )
        }
        disabled={busy}
        onClick={start}
      />
      {gesture && (
        <SelfieSheet
          gesture={gesture}
          onClose={() => setGesture(null)}
          onSent={() => {
            setGesture(null);
            setState({ success: true, status: 'pending' });
            showToast('Selfie inviato: ti avvisiamo appena il profilo è verificato.', {
              tone: 'success',
            });
          }}
        />
      )}
    </>
  );
}

function SelfieSheet({ gesture, onClose, onSent }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => onBackButton(() => onClose()), [onClose]);
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function send() {
    if (!file || sending) return;
    setSending(true);
    try {
      const selfieUrl = await uploadPhotoToStorage(file);
      const res = await apiFetch('/api/verification/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfieUrl }),
      });
      const data = await res.json();
      if (data.success) {
        onSent();
        return;
      }
      showToast('Selfie non inviato — riprova.', { tone: 'error' });
    } catch {
      showToast('Caricamento non riuscito — riprova.', { tone: 'error' });
    }
    setSending(false);
  }

  return createPortal(
    <div className="pl-dialog-backdrop" onClick={onClose}>
      <div
        className="pl-dialog"
        role="dialog"
        aria-labelledby="pl-verify-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="pl-dialog-title" id="pl-verify-title">
          Verifica il profilo
        </h3>
        <p className="pl-dialog-message">
          Scatta un selfie mentre fai questo gesto. Lo vede solo chi controlla le verifiche, non
          finisce sul profilo.
        </p>
        <div className="pl-verify-gesture">{gesture.text}</div>
        {previewUrl && <img className="pl-verify-preview" src={previewUrl} alt="Il tuo selfie" />}
        {/* capture="user": sul telefono apre la fotocamera frontale */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="user"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) setFile(e.target.files[0]);
            e.target.value = '';
          }}
        />
        <div className="pl-dialog-actions">
          <button
            type="button"
            className="pl-dialog-cancel"
            onClick={() => inputRef.current?.click()}
            disabled={sending}
          >
            {file ? 'Rifai il selfie' : 'Scatta il selfie'}
          </button>
          <button
            type="button"
            className="pl-dialog-confirm"
            onClick={send}
            disabled={!file || sending}
            style={{ opacity: !file || sending ? 0.5 : 1 }}
          >
            {sending ? <WavesSpinner size="sm" inline /> : 'Invia'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

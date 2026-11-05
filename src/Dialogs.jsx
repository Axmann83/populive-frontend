import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { onBackButton } from './native';

/**
 * ============================================================
 * POPULIVE — AVVISI E CONFERME (B15, M5, M6 — novembre 2026)
 * ============================================================
 * Al posto di window.alert / window.confirm: nell'app quelli del
 * sistema mostrano come titolo l'indirizzo della WebView
 * ("localhost"), hanno lo stile del telefono e non quello di
 * PopuLive, e bloccano tutta la pagina finché non si risponde.
 *
 *   showToast('Messaggio non inviato', { tone: 'error' })
 *     → striscia in basso che sparisce da sola (o con un tocco);
 *   if (await askConfirm({ title, message, confirmLabel })) …
 *     → finestra con due bottoni, true se si conferma.
 *
 * Funzioni normali, chiamabili da qualunque punto (anche fuori dai
 * componenti): <DialogHost /> le disegna ed è montato una sola
 * volta in index.js.
 * ============================================================
 */

let toasts = [];
let confirms = []; // in coda: se ne mostra una alla volta
let nextId = 1;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

// tone: 'info' | 'success' | 'error'. Senza duration resta a schermo
// in base alla lunghezza del testo (da 2,5 a 7 secondi).
export function showToast(message, { tone = 'info', duration } = {}) {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }];
  emit();
  const ms = duration ?? Math.min(7000, 2500 + message.length * 35);
  setTimeout(() => dismissToast(id), ms);
}

function dismissToast(id) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

// danger: bottone di conferma rosso, per le scelte che non si possono
// annullare (bloccare, svuotare, uscire).
export function askConfirm({
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  danger = false,
}) {
  return new Promise((resolve) => {
    confirms = [
      ...confirms,
      { id: nextId++, title, message, confirmLabel, cancelLabel, danger, resolve },
    ];
    emit();
  });
}

// Per chi gestisce a sua volta il tasto indietro di Android (es. la
// chat): con una conferma aperta il tasto chiude solo quella.
export function isConfirmOpen() {
  return confirms.length > 0;
}

function answerConfirm(id, value) {
  const current = confirms.find((c) => c.id === id);
  if (!current) return;
  confirms = confirms.filter((c) => c.id !== id);
  emit();
  current.resolve(value);
}

export function DialogHost() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const confirm = confirms[0];

  return createPortal(
    <>
      {toasts.length > 0 && (
        <div className="pl-toast-stack" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pl-toast pl-toast-${t.tone}`}
              role={t.tone === 'error' ? 'alert' : 'status'}
              onClick={() => dismissToast(t.id)}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
      {confirm && <ConfirmDialog key={confirm.id} confirm={confirm} />}
    </>,
    document.body
  );
}

function ConfirmDialog({ confirm }) {
  const confirmButtonRef = useRef(null);
  useEffect(() => {
    confirmButtonRef.current?.focus({ preventScroll: true });
    function onKey(e) {
      if (e.key === 'Escape') answerConfirm(confirm.id, false);
    }
    document.addEventListener('keydown', onKey);
    // Tasto indietro di Android = Annulla, come per la finestra del
    // sistema; senza, Android uscirebbe dall'app con la conferma aperta.
    // Chiusa al giro dopo: gli altri ascoltatori dello stesso tocco (la
    // chat) devono ancora vederla aperta, in qualunque ordine arrivino.
    const removeBack = onBackButton(() => setTimeout(() => answerConfirm(confirm.id, false), 0));
    return () => {
      document.removeEventListener('keydown', onKey);
      removeBack();
    };
  }, [confirm.id]);

  return (
    <div className="pl-dialog-backdrop" onClick={() => answerConfirm(confirm.id, false)}>
      <div
        className="pl-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`pl-dialog-title-${confirm.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        {confirm.title && (
          <h3 className="pl-dialog-title" id={`pl-dialog-title-${confirm.id}`}>
            {confirm.title}
          </h3>
        )}
        {confirm.message && <p className="pl-dialog-message">{confirm.message}</p>}
        <div className="pl-dialog-actions">
          <button
            type="button"
            className="pl-dialog-cancel"
            onClick={() => answerConfirm(confirm.id, false)}
          >
            {confirm.cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            className={confirm.danger ? 'pl-dialog-confirm pl-dialog-danger' : 'pl-dialog-confirm'}
            onClick={() => answerConfirm(confirm.id, true)}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

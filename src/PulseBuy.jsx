import { useState } from 'react';
import { createPortal } from 'react-dom';

import { apiFetch } from './apiClient';
import { openExternal } from './native';
import { showToast } from './Dialogs';
import { TERMS_URL, openLegalLink } from './legalLinks';
import { PulseWaveIcon } from './PopuLiveIcons';
import {
  usePulseNight,
  notifyPulseNightChanged,
  markCheckoutStarted,
  formatEuro,
  formatNightTime,
  isEndingSoon,
  pulsesLabel,
} from './pulseNight';

/**
 * ============================================================
 * POPULIVE — COMPRA PULSE (M11, novembre 2026)
 * ============================================================
 * Pannello in basso, sopra qualunque schermata (radar, profilo,
 * scheda Pulse). Si scelgono quante Pulse comprare per stasera, al
 * prezzo della serata, e si paga su una pagina di Stripe. Testi da
 * SPEC-acquisti-in-app.md ("Testi"): la Pulse è sempre una
 * consumazione vera al bancone, mai un gettone digitale.
 * Il saldo si aggiorna da solo al ritorno da Stripe (App.jsx →
 * syncPulsePurchases) o con l'evento del server.
 * ============================================================
 */
export default function PulseBuySheet({ arenaSessionId, onClose, onBought }) {
  const { info } = usePulseNight(arenaSessionId);
  const [quantity, setQuantity] = useState(1);
  const [paying, setPaying] = useState(false);
  const [waitingForStripe, setWaitingForStripe] = useState(false);
  const [error, setError] = useState(null);

  const max = info?.maxPerPurchase || 10;
  const closing = formatNightTime(info?.deadline);

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      const res = await apiFetch('/api/pulse-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arenaSessionId, quantity }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(purchaseErrorMessage(data.reason));
        return;
      }
      if (data.requiresPayment) {
        markCheckoutStarted();
        setWaitingForStripe(true);
        openExternal(data.checkoutUrl);
        return;
      }
      // Account di prova: accreditate subito, senza Stripe.
      notifyPulseNightChanged();
      showToast(`Aggiunte ${pulsesLabel(quantity)} per stasera.`, { tone: 'success' });
      onBought?.();
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setPaying(false);
    }
  }

  let body;
  if (!info) {
    body = <p className="pl-hint">Caricamento…</p>;
  } else if (!info.isAvailable) {
    body = <p className="pl-hint">In questo locale le Pulse non sono disponibili.</p>;
  } else if (!info.isOpen) {
    body = <p className="pl-hint">La serata è finita: le Pulse non si possono più comprare.</p>;
  } else if (!info.canBuy) {
    body = (
      <p className="pl-hint">
        Per comprare Pulse devi essere dentro il locale: inquadra di nuovo il QR di {info.venueName}
        .
      </p>
    );
  } else {
    body = (
      <>
        <p className="pl-hint" style={{ lineHeight: 1.5 }}>
          Una Pulse è una consumazione vera da offrire a qualcuno qui da {info.venueName}: la ritira
          al bancone. Stasera una Pulse vale <strong>{formatEuro(info.priceCents)}</strong>. Paghi
          con carta tramite Stripe. Valgono solo stasera in questo locale: quelle che non usi
          scadono alla chiusura ({closing}) e non vengono rimborsate. Se una Pulse viene rifiutata,
          ti torna indietro.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            margin: '10px 0 4px',
          }}
        >
          <button
            aria-label="Una Pulse in meno"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || paying}
            style={stepperButtonStyle}
          >
            −
          </button>
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 22 }}>
              {quantity}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              Pulse · {formatEuro(info.priceCents * quantity)}
            </div>
          </div>
          <button
            aria-label="Una Pulse in più"
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
            disabled={quantity >= max || paying}
            style={stepperButtonStyle}
          >
            +
          </button>
        </div>

        {info.available > 0 && (
          <p className="pl-hint" style={{ textAlign: 'center' }}>
            Ne hai già {info.available} da usare stasera.
          </p>
        )}

        <a
          href={`${TERMS_URL}#pulse`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openLegalLink}
          style={{ fontSize: 11, color: 'var(--teak)', textAlign: 'center', margin: '4px 0 8px' }}
        >
          Condizioni delle Pulse
        </a>

        {waitingForStripe && (
          <p className="pl-hint" style={{ textAlign: 'center' }}>
            Completa il pagamento nella pagina di Stripe: al ritorno le Pulse compaiono qui.
          </p>
        )}
        {error && <p className="pl-error">{error}</p>}
        <button className="pl-send-btn" onClick={pay} disabled={paying}>
          {paying ? 'Un attimo…' : `Paga con Stripe · ${formatEuro(info.priceCents * quantity)}`}
        </button>
      </>
    );
  }

  return createPortal(
    <div
      className="pl-fullscreen-modal"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        height: '100dvh',
        width: '100vw',
        background: 'rgba(0,0,0,0.85)',
        zIndex: 75,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        // Il pannello si ferma sopra i tasti del telefono (B6)
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface)',
          borderRadius: '24px 24px 0 0',
          padding: 20,
          boxSizing: 'border-box',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="pl-sheet">
          <div className="pl-sheet-close" onClick={onClose}>
            Chiudi ✕
          </div>
          <h3>Compra Pulse</h3>
          {body}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Riga sotto il radar: quante Pulse restano stasera, fino a che ora,
 * e "Compra". Nell'ultima ora prima della chiusura diventa un avviso.
 * Nascosta nei locali in cui le Pulse non si vendono.
 */
export function PulseNightBar({ arenaSessionId }) {
  const { info } = usePulseNight(arenaSessionId);
  const [showBuy, setShowBuy] = useState(false);
  if (!info?.isAvailable || !info.isOpen) return null;

  const endingSoon = isEndingSoon(info.deadline);
  const closing = formatNightTime(info.deadline);
  const toCollectText =
    info.toCollect > 0 ? ` · ${info.toCollect} drink da ritirare al bancone` : '';

  return (
    <>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 14,
          border: `1px solid ${endingSoon ? 'var(--red)' : 'rgba(255,61,110,0.3)'}`,
          background: 'var(--surface)',
        }}
      >
        <PulseWaveIcon size={20} color="var(--cyan)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            {info.available > 0
              ? `${pulsesLabel(info.available)} da usare stasera`
              : `Offri un drink · ${formatEuro(info.priceCents)} a Pulse`}
          </div>
          <div style={{ fontSize: 10, color: endingSoon ? 'var(--red)' : 'var(--text-muted)' }}>
            {endingSoon
              ? `La serata finisce alle ${closing}: dopo le Pulse scadono${toCollectText}`
              : `Valide fino alle ${closing}${toCollectText}`}
          </div>
        </div>
        {info.canBuy && (
          <button
            onClick={() => setShowBuy(true)}
            style={{
              padding: '7px 13px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--cyan)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Compra
          </button>
        )}
      </div>
      {showBuy && (
        <PulseBuySheet
          arenaSessionId={arenaSessionId}
          onClose={() => setShowBuy(false)}
          onBought={() => setShowBuy(false)}
        />
      )}
    </>
  );
}

const stepperButtonStyle = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: '1px solid rgba(228,212,200,0.2)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 20,
  fontWeight: 700,
  cursor: 'pointer',
};

function purchaseErrorMessage(reason) {
  const messages = {
    pulse_night_ended: 'La serata è finita: le Pulse non si possono più comprare.',
    not_checked_in: 'Per comprare Pulse devi essere dentro il locale.',
    pulses_not_available_here: 'In questo locale le Pulse non sono disponibili.',
    invalid_quantity: 'Quantità non valida.',
    payment_unavailable: 'Il pagamento non è disponibile in questo momento — riprova tra poco.',
  };
  return messages[reason] || 'Qualcosa è andato storto — riprova.';
}

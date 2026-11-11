import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { apiFetch } from './apiClient';
import { checkoutReturnParams, openCheckout } from './native';
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
import WavesSpinner from './WavesSpinner';

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
        body: JSON.stringify({ arenaSessionId, quantity, ...checkoutReturnParams() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(purchaseErrorMessage(data.reason));
        return;
      }
      if (data.requiresPayment) {
        markCheckoutStarted();
        setWaitingForStripe(true);
        openCheckout(data.checkoutUrl);
        return;
      }
      // Account di prova: accreditate subito, senza Stripe.
      notifyPulseNightChanged();
      showToast(`Aggiunti ${pulsesLabel(quantity)} per stasera.`, { tone: 'success' });
      onBought?.();
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setPaying(false);
    }
  }

  let body;
  if (!info) {
    body = <WavesSpinner />;
  } else if (!info.isAvailable) {
    body = <p className="pl-hint">In questo locale i Pulse non sono disponibili.</p>;
  } else if (!info.isOpen) {
    body = <p className="pl-hint">La serata è finita: i Pulse non si possono più comprare.</p>;
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
          Un Pulse è una consumazione vera da offrire a qualcuno qui da {info.venueName}: la ritira
          al bancone. Stasera un Pulse vale <strong>{formatEuro(info.priceCents)}</strong>. Paghi
          con carta tramite Stripe. Valgono solo stasera in questo locale: quelli che non usi
          scadono alla chiusura ({closing}) e non vengono rimborsati. Se un Pulse viene rifiutato,
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
            aria-label="Un Pulse in meno"
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
            aria-label="Un Pulse in più"
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
          Condizioni dei Pulse
        </a>

        {waitingForStripe && (
          <p className="pl-hint" style={{ textAlign: 'center' }}>
            Completa il pagamento nella pagina di Stripe: al ritorno i Pulse compaiono qui.
          </p>
        )}
        {error && <p className="pl-error">{error}</p>}
        <button className="pl-send-btn" onClick={pay} disabled={paying}>
          {paying ? (
            <WavesSpinner size="sm" inline />
          ) : (
            `Paga con Stripe · ${formatEuro(info.priceCents * quantity)}`
          )}
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
        paddingBottom: 'var(--pl-sheet-gap)',
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
          paddingBottom: 'calc(20px + var(--pl-sheet-inner))',
          boxSizing: 'border-box',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="pl-sheet">
          <div className="pl-sheet-close" onClick={onClose}>
            Chiudi{' '}
            <span className="pl-sheet-close-x" aria-hidden="true">
              ✕
            </span>
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
 * Avviso sotto il radar (09/11, richiesta dell'utente): compare SOLO
 * nell'ultima ora prima della chiusura, e solo se restano Pulse da
 * usare o drink da ritirare. Il saldo e l'acquisto stanno nella scheda
 * Pulse; toccando l'avviso ci si va. Si ricontrolla ogni minuto, così
 * compare da solo quando si entra nell'ultima ora.
 */
export function PulseEndingWarning({ arenaSessionId, onOpenPulses }) {
  const { info } = usePulseNight(arenaSessionId);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!info?.isAvailable || !info.isOpen || !isEndingSoon(info.deadline)) return null;
  const pulsesLeft = info.available || 0;
  const toCollect = info.toCollect || 0;
  if (pulsesLeft === 0 && toCollect === 0) return null;

  const parts = [];
  if (pulsesLeft > 0) parts.push(`${pulsesLabel(pulsesLeft)} da usare`);
  if (toCollect > 0) parts.push(`${toCollect} drink da ritirare al bancone`);

  return (
    <div
      role="button"
      onClick={onOpenPulses}
      style={{
        marginTop: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 14,
        border: '1px solid var(--red)',
        background: 'var(--surface)',
        cursor: onOpenPulses ? 'pointer' : 'default',
      }}
    >
      <PulseWaveIcon size={20} color="var(--red)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          La serata finisce alle {formatNightTime(info.deadline)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--red)' }}>
          Hai ancora {parts.join(' e ')}: dopo scadono.
        </div>
      </div>
      {onOpenPulses && <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>›</span>}
    </div>
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
    pulse_night_ended: 'La serata è finita: i Pulse non si possono più comprare.',
    not_checked_in: 'Per comprare Pulse devi essere dentro il locale.',
    pulses_not_available_here: 'In questo locale i Pulse non sono disponibili.',
    invalid_quantity: 'Quantità non valida.',
    payment_unavailable: 'Il pagamento non è disponibile in questo momento — riprova tra poco.',
  };
  return messages[reason] || 'Qualcosa è andato storto — riprova.';
}

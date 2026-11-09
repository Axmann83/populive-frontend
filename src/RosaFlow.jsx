import { useState, useEffect, useCallback } from 'react';
import ProfileFullScreen from './ProfileFullScreen';

import { apiFetch } from './apiClient';
import PulseBuySheet from './PulseBuy';
import {
  usePulseNight,
  notifyPulseNightChanged,
  formatEuro,
  formatNightTime,
  pulsesLabel,
} from './pulseNight';
import WavesSpinner from './WavesSpinner';

/**
 * ============================================================
 * POPULIVE — CICLO PULSE COMPLETO (componenti reali)
 * ============================================================
 * Tre pezzi, ognuno collegato a un endpoint vero:
 *   1) PulseSend       → POST /api/pulses/send
 *   2) PulseNotification → POST /api/pulses/:id/respond
 *   3) PulseRedeemSeal  → POST /api/pulses/:id/redeem
 * Una sola Pulse dal novembre 2026 (decisione A5): svela subito chi
 * la manda e, se accettata, apre la chat. Tolte le varianti anonima,
 * "+ Like" (con il minigioco "indovina chi") e "+ Superlike".
 * Dal novembre 2026 (M11) la Pulse si compra prima, per la serata
 * (PulseBuy.jsx), e inviarla la scala dal saldo: niente più scelta
 * del drink dal listino, vale una consumazione al prezzo della serata.
 * ============================================================
 */

// ------------------------------------------------------------
// 1) INVIO
// ------------------------------------------------------------
export function PulseSend({ receiverId, arenaSessionId, onSent, onCancel }) {
  const { info } = usePulseNight(arenaSessionId);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [showBuy, setShowBuy] = useState(false);

  const available = info?.available || 0;

  const handleSend = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/pulses/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId, arenaSessionId }),
      });
      const data = await res.json();
      notifyPulseNightChanged();
      if (!data.success) {
        if (data.reason === 'no_pulses_left') setShowBuy(true);
        setError(reasonToMessage(data.reason));
        return;
      }
      onSent(data.pulseId);
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setSending(false);
    }
  }, [receiverId, arenaSessionId, onSent]);

  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onCancel}>
        Chiudi ✕
      </div>
      <h3>Offri un drink con un Pulse</h3>

      {!info && <WavesSpinner />}

      {info && !info.isAvailable && (
        <p className="pl-hint">In questo locale i Pulse non sono disponibili.</p>
      )}

      {info && info.isAvailable && (
        <>
          <div className="pl-pulse-option selected" style={{ cursor: 'default' }}>
            <div className="pl-pulse-title">Una consumazione al bancone di {info.venueName}</div>
            <div className="pl-pulse-price">
              Stasera un Pulse vale {formatEuro(info.priceCents)} · la ritira al bancone entro la
              chiusura ({formatNightTime(info.deadline)})
            </div>
          </div>
          <p className="pl-hint" style={{ textAlign: 'center' }}>
            {available > 0
              ? `Hai ${pulsesLabel(available)} da usare stasera.`
              : 'Non hai Pulse da usare stasera.'}
          </p>
        </>
      )}

      <p className="pl-hint" style={{ marginBottom: 14 }}>
        Se chi lo riceve accetta, si apre la chat. Se lo rifiuta, il Pulse ti torna indietro.
      </p>

      {error && <p className="pl-error">{error}</p>}
      {info?.isAvailable && available > 0 && (
        <button className="pl-send-btn" onClick={handleSend} disabled={sending}>
          {sending ? 'Invio…' : 'Invia Pulse'}
        </button>
      )}
      {info?.isAvailable && available === 0 && info.isOpen && (
        <button className="pl-send-btn" onClick={() => setShowBuy(true)}>
          Compra Pulse
        </button>
      )}

      {showBuy && (
        <PulseBuySheet
          arenaSessionId={arenaSessionId}
          onClose={() => setShowBuy(false)}
          onBought={() => {
            setShowBuy(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

function reasonToMessage(reason) {
  const messages = {
    blocked_by_receiver: 'Non puoi inviare nulla a questo profilo.',
    receiver_requires_verified: 'Questo profilo accetta contatti solo da utenti verificati.',
    receiver_requires_premium: 'Questo profilo accetta contatti solo da utenti premium.',
    cannot_interact_with_self: 'Non puoi inviare un Pulse a te stesso.',
    no_pulses_left: 'Non hai Pulse da usare stasera: comprane per inviarlo.',
    pulse_night_ended: 'La serata è finita: i Pulse non si possono più inviare.',
  };
  return messages[reason] || 'Invio non riuscito — riprova.';
}

// ------------------------------------------------------------
// 2) NOTIFICA DI RICEZIONE
// ------------------------------------------------------------
export function PulseNotification({ pulse, currentUserId, arenaSessionId, venueId, onResolved }) {
  const [loading, setLoading] = useState(false);
  const [redeemInfo, setRedeemInfo] = useState(null);
  const [showFullProfile, setShowFullProfile] = useState(false);
  // Le Pulse di oggi svelano sempre chi le manda; restano nel
  // database alcune vecchie anonime ('standalone', 'like') di prima
  // del novembre 2026, che danno solo il drink.
  const showsSender = pulse.tier === 'simple' || pulse.tier === 'super';
  const [error, setError] = useState(null);

  async function respond(action) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/pulses/${pulse.pulseId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.success) {
        // Già decisa (elenco vecchio, altro telefono): prima la
        // finestra restava aperta e i bottoni non facevano nulla (B9,
        // 1/11). Si chiude e l'elenco delle Pulse si ricarica.
        if (
          data.reason === 'already_decided' ||
          data.reason === 'not_found_or_not_yours' ||
          data.reason === 'pulse_night_ended'
        ) {
          onResolved({ action: 'stale' });
        } else {
          setError('Non è andata a buon fine, riprova.');
        }
        return;
      }

      if (action === 'accept') {
        if (data.conversationId) {
          // Nessuna schermata intermedia apposta: la chat si sblocca
          // da sola (v. banner/lista match), e la Pulse resta in
          // lista pronta da riscattare quando si vuole — un
          // passaggio in meno rispetto a un primo tentativo con una
          // conferma di mezzo, semplificato su richiesta esplicita.
          // Con conversationId App.jsx apre subito la chat, come
          // promette il pulsante "Apri la chat" (bug B11, 2/10).
          onResolved({
            action: 'accepted',
            chatUnlocked: true,
            conversationId: data.conversationId,
          });
        } else {
          setRedeemInfo({ redeemCode: data.redeemCode });
        }
      } else {
        onResolved({ action });
      }
    } catch {
      setError('Connessione assente, riprova.');
    } finally {
      setLoading(false);
    }
  }

  if (redeemInfo) {
    return (
      <PulseRedeemSeal
        pulseId={pulse.pulseId}
        redeemCode={redeemInfo.redeemCode}
        venueId={venueId}
        onDone={() => onResolved({ action: 'redeemed' })}
      />
    );
  }

  // Dove e entro quando si ritira (M11): solo in quel locale, entro
  // la chiusura di stasera.
  const collectHint =
    pulse.venueName && pulse.deadline
      ? ` Se accetti, ritira la tua consumazione al bancone di ${pulse.venueName} entro la chiusura (${formatNightTime(pulse.deadline)}).`
      : '';
  const copy = showsSender
    ? {
        title: `${pulse.senderName || 'Qualcuno'} ti offre un drink con un Pulse`,
        sub: `Vuoi accettarla? Il tuo profilo è già visibile a chi l'ha inviata.${collectHint}`,
      }
    : {
        title: 'Un ammiratore misterioso ti ha inviato un Pulse',
        sub: `Vuoi accettarlo? Riscattabile al bancone.`,
      };

  return (
    <div className="pl-sheet">
      {/* Chiudere senza decidere (B9, 1/11): la Pulse resta com'era */}
      <div className="pl-sheet-close" onClick={() => onResolved({ action: 'closed' })}>
        Chiudi ✕
      </div>
      {/* Anteprima vera del profilo di chi la manda, stessa
          esperienza già costruita per il Superlike. */}
      {showsSender && (
        <div
          onClick={() => pulse.senderId && setShowFullProfile(true)}
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            overflow: 'hidden',
            margin: '0 auto 14px',
            border: '2px solid var(--cyan)',
            cursor: pulse.senderId ? 'pointer' : 'default',
          }}
        >
          {pulse.senderPhotoUrl ? (
            <img
              src={pulse.senderPhotoUrl}
              alt={pulse.senderName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 38,
                background: 'var(--surface-2)',
              }}
            >
              {pulse.senderAvatarEmoji || '🙂'}
            </div>
          )}
        </div>
      )}
      {showFullProfile && pulse.senderId && (
        <ProfileFullScreen
          userId={pulse.senderId}
          arenaSessionId={arenaSessionId}
          currentUserId={currentUserId}
          venueId={venueId}
          onClose={() => setShowFullProfile(false)}
          decisionActions={{
            onAccept: () => {
              setShowFullProfile(false);
              respond('accept');
            },
            onReject: () => {
              setShowFullProfile(false);
              respond('reject');
            },
            onIgnore: () => {
              setShowFullProfile(false);
              respond('ignore');
            },
          }}
        />
      )}
      <h3 style={{ textAlign: showsSender ? 'center' : 'left' }}>{copy.title}</h3>
      <p className="pl-hint" style={{ textAlign: showsSender ? 'center' : 'left' }}>
        {copy.sub}
      </p>

      <div className="pl-redeem-actions">
        {/* Già in sospeso (aperta dalla scheda Pulse, D9): resta solo da decidere */}
        {pulse.status !== 'ignored' && (
          <button disabled={loading} onClick={() => respond('ignore')}>
            Lascia in sospeso
          </button>
        )}
        <button disabled={loading} onClick={() => respond('reject')} className="pl-btn-reject">
          Rifiuta
        </button>
      </div>
      <button className="pl-send-btn" disabled={loading} onClick={() => respond('accept')}>
        {showsSender ? 'Accetta e apri la chat' : 'Accetta il Pulse'}
      </button>
      {error && <p className="pl-error">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------
// 3) RISCATTO AL BANCONE — sigillo con timer, mostrato al bartender
// ------------------------------------------------------------
// onCancel (facoltativo): "Non ora" — dalla scheda Pulse prima non
// c'era modo di uscire senza riscattare (B10, 1/11).
export function PulseRedeemSeal({ pulseId, redeemCode, venueId, onDone, onCancel }) {
  const [state, setState] = useState('idle'); // idle | live | expired | confirmed
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [flash, setFlash] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (state !== 'live') return;
    if (secondsLeft <= 0) {
      setState('expired');
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [state, secondsLeft]);

  function activate() {
    setState('live');
    setSecondsLeft(30);
  }

  // QUESTO è il gesto chiave: il bartender stesso, guardando il
  // sigillo attivo, tocca lo schermo del telefono del cliente.
  // Un solo tocco fa DUE cose insieme, senza bisogno di alcun
  // dispositivo o account separato per lo staff:
  //   1) il flash istantaneo dimostra che il codice è "vivo" ora,
  //      non un video mostrato in differita (un video non reagisce)
  //   2) lo stesso tocco chiama l'API di riscatto — il gesto DI
  //      VERIFICA e la CONFERMA sono la stessa identica azione.
  async function handleSealTap() {
    if (state !== 'live') return;
    setFlash(true);
    setTimeout(() => setFlash(false), 350);

    const res = await apiFetch(`/api/pulses/${pulseId}/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redeemCode, venueId }),
    });
    const data = await res.json();
    if (data.success) {
      setState('confirmed');
      setTimeout(onDone, 1000);
    } else if (data.reason === 'wrong_venue') {
      setErrorMessage(
        'Questo Pulse è valido solo nel locale in cui è stato ricevuto — qui non può essere riscattato.'
      );
    } else if (data.reason === 'pulse_expired') {
      setErrorMessage(
        'Questo Pulse è scaduto: andava ritirato entro la chiusura del locale di quella sera.'
      );
    } else if (data.reason === 'code_expired') {
      setErrorMessage(
        'Il tempo per confermare è scaduto — tocca di nuovo "Tieni premuto" per riprovare.'
      );
      setState('idle');
    } else {
      setErrorMessage('Qualcosa è andato storto — riprova.');
    }
  }

  return (
    <div className="pl-sheet pl-redeem-card">
      {onCancel && state !== 'confirmed' && (
        <div
          className="pl-sheet-close"
          onClick={onCancel}
          style={{ alignSelf: 'flex-end', margin: '14px 16px 0 0' }}
        >
          Non ora ✕
        </div>
      )}
      <h3>Riscatta il tuo Pulse</h3>
      {state === 'idle' && (
        <>
          <p className="pl-hint">
            Attivalo quando sei al bancone: avrai 30 secondi per mostrarlo al bartender, che lo
            conferma con un tocco.
          </p>
          <button className="pl-seal" onClick={activate}>
            Tieni premuto per attivare
          </button>
        </>
      )}
      {state === 'live' && (
        <>
          <div
            className={`pl-seal pl-seal-live pl-confirm-wave-wrap ${flash ? 'pl-seal-flash' : ''}`}
            onClick={handleSealTap}
          >
            {flash && (
              <>
                <span className="pl-confirm-wave"></span>
                <span className="pl-confirm-wave"></span>
                <span className="pl-confirm-wave"></span>
              </>
            )}
            {secondsLeft}
          </div>
          <p className="pl-hint">
            Mostra il telefono al bartender: un suo tocco sul cerchio conferma ed eroga la
            consumazione.
          </p>
          {errorMessage && <p className="pl-error">{errorMessage}</p>}
        </>
      )}
      {state === 'expired' && (
        <>
          <p className="pl-error">Codice scaduto.</p>
          <button className="pl-send-btn" onClick={activate}>
            Riattiva
          </button>
        </>
      )}
      {state === 'confirmed' && <p>✓ Consumazione erogata.</p>}
    </div>
  );
}

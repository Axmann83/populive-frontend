import { useState, useEffect, useCallback } from 'react';
import { PartyPopper } from './PopuLiveIcons';
import ProfileFullScreen from './ProfileFullScreen';

import { apiFetch, getOptimizedPhotoUrl } from './apiClient';

const TIER_META = {
  standalone: { label: 'Solo Pulse', sub: 'Anonima al 100% — nessun contatto' },
  like: { label: 'Pulse + Like', sub: 'Mistero — si svela solo con reciprocità' },
  simple: { label: 'Pulse', sub: 'Il tuo profilo sarà subito visibile' },
  super: { label: 'Pulse + Superlike', sub: 'Il tuo profilo sarà subito visibile, con un Superlike incluso' },
};

/**
 * ============================================================
 * POPULIVE — CICLO PULSE COMPLETO (componenti reali)
 * ============================================================
 * Quattro pezzi, ognuno collegato a un endpoint vero:
 *   1) PulseSend       → POST /api/pulses/send
 *   2) PulseNotification → POST /api/pulses/:id/respond
 *   3) PulseGuessGame   → POST /api/pulses/:id/guess
 *   4) PulseRedeemSeal  → POST /api/pulses/:id/redeem
 * ============================================================
 */


// ------------------------------------------------------------
// 1) INVIO
// ------------------------------------------------------------
export function PulseSend({ senderId, receiverId, arenaSessionId, venueId, onSent, onCancel }) {
  const [drinks, setDrinks] = useState([]);
  const [selectedDrink, setSelectedDrink] = useState(null);
  // Quali modalità mostrare dipende dagli interruttori decisi dagli
  // Architetti in dashboard (scheda Funzionalità) — TUTTE e quattro
  // le varianti sono ora interruttori veri (25/8: prima "Pulse +
  // Superlike" era sempre acceso per definizione, scritto fisso nel
  // codice — ora è un interruttore come gli altri, spento di
  // default). "Pulse" (semplice, slegato dal Superlike) parte
  // acceso, pensato per la massima immediatezza delle prime serate.
  const [availableTiers, setAvailableTiers] = useState(['simple']);
  const [tier, setTier] = useState('simple');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/feature-flags')
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        const tiers = [];
        if (data.flags.pulse_standalone) tiers.push('standalone');
        if (data.flags.pulse_like) tiers.push('like');
        if (data.flags.pulse_simple) tiers.push('simple');
        if (data.flags.pulse_super) tiers.push('super');
        if (tiers.length === 0) tiers.push('simple'); // difesa: mai una lista vuota, anche se per errore tutti gli interruttori finissero spenti
        setAvailableTiers(tiers);
        setTier(tiers[0]); // segue davvero ciò che è disponibile, non resta bloccato sul valore di partenza
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch(`/api/venues/${venueId}/drinks`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setDrinks(data.drinks);
          // Se il locale offre UN SOLO drink per la Pulse (scelta
          // comune per chi preferisce una consumazione fissa,
          // invece di un catalogo), lo selezioniamo da soli —
          // niente da "scegliere" quando c'è una sola opzione,
          // un passaggio in meno per chi invia.
          if (data.drinks.length === 1) {
            setSelectedDrink(data.drinks[0]);
          }
        }
      });
  }, [venueId]);

  // Stesso identico meccanismo già usato per il Superlike puro
  // (ProfileFullScreen.jsx) — quando manca proprio il Superlike (non
  // il Pulse), offriamo di comprarne altri 5 invece di un errore
  // muto che non spiega cosa manca davvero.
  const offerSuperlikePurchase = useCallback(async () => {
    const confirmed = window.confirm('Superlike esauriti per questa settimana — il Pulse ha bisogno anche di quello. Vuoi acquistarne altri 5?');
    if (!confirmed) { setSending(false); return; }

    try {
      const catalogRes = await apiFetch('/api/products');
      const catalogData = await catalogRes.json();
      const product = catalogData.products?.find((p) => p.product_type === 'superlike_credits');
      if (!product) { setSending(false); return; }

      const purchaseRes = await apiFetch('/api/purchases/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, arenaSessionId }),
      });
      const purchaseData = await purchaseRes.json();

      if (purchaseData.requiresPayment) {
        window.location.href = purchaseData.checkoutUrl;
      } else {
        // Account di prova/gratis: il saldo è già ricaricato lato
        // server, la persona può semplicemente riprovare a inviare.
        setSending(false);
        setError('Fatto! Riprova a inviare il Pulse.');
      }
    } catch (err) {
      console.error('Errore nella proposta di acquisto Superlike:', err);
      setSending(false);
    }
  }, [arenaSessionId]);

  const handleSend = useCallback(async () => {
    if (!selectedDrink) return;
    setSending(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/pulses/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId, arenaSessionId, drinkProductId: selectedDrink.id, tier,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.reason === 'superlike_balance_exhausted') {
          offerSuperlikePurchase();
          return;
        }
        setError(reasonToMessage(data.reason));
        return;
      }

      // Due esiti possibili: il Pulse nasce SUBITO (Pulse gratis
      // settimanale, o account di prova) — oppure serve prima
      // pagare davvero, e Stripe ci dà un indirizzo a cui mandare
      // il cliente per completare il pagamento con la sua carta.
      if (data.requiresPayment) {
        window.location.href = data.checkoutUrl;
        return; // usciamo dall'app per andare su Stripe — non c'è altro da fare qui
      }

      onSent(data.pulseId);
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setSending(false);
    }
  }, [selectedDrink, tier, receiverId, arenaSessionId, onSent, offerSuperlikePurchase]);

  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onCancel}>Chiudi ✕</div>
      <h3>Invia un Pulse</h3>

      {drinks.length > 1 && (
        <>
          <div className="pl-section-label">Scegli il Pulse</div>
          {drinks.map((d) => (
            <div
              key={d.id}
              className={`pl-pulse-option ${selectedDrink?.id === d.id ? 'selected' : ''}`}
              onClick={() => setSelectedDrink(d)}
            >
              <div className="pl-pulse-title">
                {d.name}
                {d.sponsor_name && <span className="pl-sponsor-tag"> · {d.sponsor_name}</span>}
              </div>
              <div className="pl-pulse-price">
                {((d.base_price_cents - (d.sponsor_discount_cents || 0)) / 100).toFixed(2)}€
              </div>
            </div>
          ))}
        </>
      )}

      {/* Locale con un unico Pulse fisso — niente da scegliere, solo
          una conferma di cosa si sta per inviare. */}
      {drinks.length === 1 && (
        <div className="pl-pulse-option selected" style={{ cursor: 'default' }}>
          <div className="pl-pulse-title">
            {drinks[0].name}
            {drinks[0].sponsor_name && <span className="pl-sponsor-tag"> · {drinks[0].sponsor_name}</span>}
          </div>
          <div className="pl-pulse-price">
            {((drinks[0].base_price_cents - (drinks[0].sponsor_discount_cents || 0)) / 100).toFixed(2)}€
          </div>
        </div>
      )}

      {drinks.length === 0 && <p className="pl-hint">Nessun drink disponibile in questo locale al momento.</p>}

      {availableTiers.length === 1 ? (
        <p className="pl-hint" style={{ marginBottom: 14 }}>
          Se chi la riceve accetta, il tuo profilo diventa subito visibile e si apre la chat — se non accetta, semplicemente non succede nulla.
        </p>
      ) : (
        <>
          <div className="pl-section-label">Come vuoi inviarla</div>
          {availableTiers.map((tId) => {
            const meta = TIER_META[tId];
            return (
              <div
                key={tId}
                className={`pl-pulse-option ${tier === tId ? 'selected' : ''}`}
                onClick={() => setTier(tId)}
              >
                <div className="pl-pulse-title">{meta.label}</div>
                <div className="pl-pulse-price">{meta.sub}</div>
              </div>
            );
          })}
        </>
      )}

      {error && <p className="pl-error">{error}</p>}
      <button className="pl-send-btn" onClick={handleSend} disabled={!selectedDrink || sending}>
        {sending ? 'Invio…' : 'Invia Pulse'}
      </button>
    </div>
  );
}

function reasonToMessage(reason) {
  const messages = {
    blocked_by_receiver: 'Non puoi inviare nulla a questo profilo.',
    receiver_requires_verified: 'Questo profilo accetta contatti solo da utenti verificati.',
    receiver_requires_premium: 'Questo profilo accetta contatti solo da utenti premium.',
    cannot_interact_with_self: 'Non puoi inviare un Pulse a te stesso.',
  };
  return messages[reason] || 'Invio non riuscito — riprova.';
}


// ------------------------------------------------------------
// 2) NOTIFICA DI RICEZIONE — le tre varianti
// ------------------------------------------------------------
export function PulseNotification({ pulse, currentUserId, arenaSessionId, venueId, onResolved }) {
  const [loading, setLoading] = useState(false);
  const [showGuessGame, setShowGuessGame] = useState(false);
  const [guessCandidates, setGuessCandidates] = useState([]);
  const [redeemInfo, setRedeemInfo] = useState(null);
  const [pendingRedeemCode, setPendingRedeemCode] = useState(null);
  const [showFullProfile, setShowFullProfile] = useState(false);

  async function respond(action) {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/pulses/${pulse.pulseId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.success) return;

      if (action === 'accept') {
        if (pulse.tier === 'like' && data.canStillPlayGuessGame) {
          setPendingRedeemCode(data.redeemCode);
          const candRes = await apiFetch(`/api/arenas/${arenaSessionId}/guess-candidates`);
          const candData = await candRes.json();
          setGuessCandidates(candData.candidates || []);
          setShowGuessGame(true);
        } else if (pulse.tier === 'super' || pulse.tier === 'simple') {
          // Nessuna schermata intermedia apposta: la chat si sblocca
          // da sola (v. banner/lista match), e la Pulse resta in
          // lista pronta da riscattare quando si vuole — un
          // passaggio in meno rispetto a un primo tentativo con una
          // conferma di mezzo, semplificato su richiesta esplicita.
          onResolved({ action: 'accepted', chatUnlocked: true });
        } else {
          setRedeemInfo({ redeemCode: data.redeemCode });
        }
      } else {
        onResolved({ action });
      }
    } finally {
      setLoading(false);
    }
  }

  if (redeemInfo) {
    return <PulseRedeemSeal pulseId={pulse.pulseId} redeemCode={redeemInfo.redeemCode} venueId={venueId} onDone={() => onResolved({ action: 'redeemed' })} />;
  }

  if (showGuessGame) {
    return (
      <PulseGuessGame
        pulseId={pulse.pulseId}
        currentUserId={currentUserId}
        candidates={guessCandidates}
        onFinished={({ matched }) => {
          if (matched) {
            // Stesso principio del Pulse+Superlike: niente schermata
            // di mezzo, la chat si sblocca da sola e la Pulse resta
            // in lista pronta per il riscatto quando si vuole.
            onResolved({ action: 'accepted', chatUnlocked: true });
          } else {
            setRedeemInfo({ redeemCode: pendingRedeemCode });
          }
        }}
      />
    );
  }

  const copy = {
    standalone: {
      title: 'Un ammiratore misterioso ti ha inviato un Pulse',
      sub: `Vuoi accettarlo? Riscattabile al bancone.`,
    },
    like: {
      title: 'Un ammiratore misterioso ti ha inviato un Pulse + Like',
      sub: 'Se accetti, il Pulse è comunque tuo — poi potrai provare a indovinare chi è per sbloccare la chat.',
    },
    simple: {
      title: `${pulse.senderName || 'Qualcuno'} ti ha inviato un Pulse`,
      sub: `Vuoi accettarlo? Il tuo profilo è già visibile a chi l'ha inviato.`,
    },
    super: {
      title: `${pulse.senderName || 'Qualcuno'} ti ha inviato un Pulse`,
      sub: `Ha anche inviato un Superlike: se non accetti, non potrà più contattarti.`,
    },
  }[pulse.tier];

  return (
    <div className="pl-sheet">
      {/* Per Pulse+Superlike e Pulse semplice: anteprima vera del
          profilo, stessa esperienza già costruita per il Superlike
          puro — entrambe le varianti svelano subito l'identità. */}
      {(pulse.tier === 'super' || pulse.tier === 'simple') && (
        <div
          onClick={() => pulse.senderId && setShowFullProfile(true)}
          style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 14px', border: '2px solid var(--cyan)', cursor: pulse.senderId ? 'pointer' : 'default' }}
        >
          {pulse.senderPhotoUrl ? (
            <img src={pulse.senderPhotoUrl} alt={pulse.senderName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, background: 'var(--surface-2)' }}>
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
            onAccept: () => { setShowFullProfile(false); respond('accept'); },
            onReject: () => { setShowFullProfile(false); respond('reject'); },
            onIgnore: () => { setShowFullProfile(false); respond('ignore'); },
          }}
        />
      )}
      <h3 style={{ textAlign: (pulse.tier === 'super' || pulse.tier === 'simple') ? 'center' : 'left' }}>{copy.title}</h3>
      <p className="pl-hint" style={{ textAlign: (pulse.tier === 'super' || pulse.tier === 'simple') ? 'center' : 'left' }}>{copy.sub}</p>

      <div className="pl-redeem-actions">
        <button disabled={loading} onClick={() => respond('ignore')}>Lascia in sospeso</button>
        <button disabled={loading} onClick={() => respond('reject')} className="pl-btn-reject">Rifiuta</button>
      </div>
      <button className="pl-send-btn" disabled={loading} onClick={() => respond('accept')}>
        {(pulse.tier === 'super' || pulse.tier === 'simple') ? 'Apri la chat' : 'Accetta il Pulse'}
      </button>
    </div>
  );
}


// ------------------------------------------------------------
// 3) MINIGIOCO — indovina chi ti ha inviato il Pulse+Like
// ------------------------------------------------------------
export function PulseGuessGame({ pulseId, currentUserId, candidates, onFinished, redeemCode }) {
  const [message, setMessage] = useState('Hai tot tentativi per provare a scoprire chi è.');
  const [justMatched, setJustMatched] = useState(false);

  async function guess(guessedUserId) {
    const res = await apiFetch(`/api/pulses/${pulseId}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guessedUserId }),
    });
    const data = await res.json();

    if (!data.success) {
      setMessage('Non è stato possibile registrare il tentativo.');
      return;
    }
    if (data.matched) {
      setJustMatched(true);
      setMessage('Match! La chat si sblocca.');
      setTimeout(() => onFinished({ matched: true }), 1200);
    } else if (data.attemptsExhausted) {
      setMessage('Tentativi esauriti — il Pulse resta tuo, il mittente rimane un mistero.');
      setTimeout(() => onFinished({ matched: false }), 1500);
    } else {
      setMessage(`Non era lui/lei — ${data.attemptsRemaining} tentativi rimasti.`);
    }
  }

  return (
    <div className="pl-sheet">
      <h3>Indovina chi ti ha inviato il Pulse</h3>
      <p className="pl-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {justMatched && <PartyPopper size={15} color="var(--cyan)" />} {message}
      </p>
      <div className="pl-guess-grid">
        {candidates.map((c) => (
          <div key={c.userId} className="pl-guess-candidate" onClick={() => guess(c.userId)}>
            {c.photoUrl ? <img src={getOptimizedPhotoUrl(c.photoUrl, { width: 40, height: 40 })} alt={c.displayName} /> : (c.avatarEmoji || '🙂')}
            <span>{c.displayName}</span>
          </div>
        ))}
      </div>
      {/* Nessuno dei candidati mostrati interessa davvero? Nessun
          problema: un tentativo sbagliato manda comunque un Like
          vero a quella persona (v. attemptGuess lato server) — chi
          non vuole rischiare un match indesiderato può uscire senza
          giocare, il Pulse resta comunque suo. */}
      <button className="pl-abandon-btn" onClick={() => onFinished({ matched: false, abandoned: true })}>
        Nessuno mi interessa — abbandona e riscatta il Pulse
      </button>
    </div>
  );
}


// ------------------------------------------------------------
// 4) RISCATTO AL BANCONE — sigillo con timer, mostrato al bartender
// ------------------------------------------------------------
export function PulseRedeemSeal({ pulseId, redeemCode, venueId, onDone }) {
  const [state, setState] = useState('idle'); // idle | live | expired | confirmed
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [flash, setFlash] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (state !== 'live') return;
    if (secondsLeft <= 0) { setState('expired'); return; }
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
      setErrorMessage('Questo Pulse è valido solo nel locale in cui è stato ricevuto — qui non può essere riscattato.');
    } else if (data.reason === 'pulse_expired_changed_venue') {
      setErrorMessage('Questo Pulse è scaduto — hai fatto check-in in un altro locale nel frattempo.');
    } else if (data.reason === 'code_expired') {
      setErrorMessage('Il tempo per confermare è scaduto — tocca di nuovo "Tieni premuto" per riprovare.');
      setState('idle');
    } else {
      setErrorMessage('Qualcosa è andato storto — riprova.');
    }
  }

  return (
    <div className="pl-sheet pl-redeem-card">
      <h3>Riscatta il tuo Pulse</h3>
      {state === 'idle' && (
        <button className="pl-seal" onClick={activate}>Tieni premuto per attivare</button>
      )}
      {state === 'live' && (
        <>
          <div className={`pl-seal pl-seal-live pl-confirm-wave-wrap ${flash ? 'pl-seal-flash' : ''}`} onClick={handleSealTap}>
            {flash && (
              <>
                <span className="pl-confirm-wave"></span>
                <span className="pl-confirm-wave"></span>
                <span className="pl-confirm-wave"></span>
              </>
            )}
            {secondsLeft}
          </div>
          <p className="pl-hint">Mostra il telefono al bartender: un suo tocco sul cerchio conferma ed eroga la consumazione.</p>
          {errorMessage && <p className="pl-error">{errorMessage}</p>}
        </>
      )}
      {state === 'expired' && (
        <>
          <p className="pl-error">Codice scaduto.</p>
          <button className="pl-send-btn" onClick={activate}>Riattiva</button>
        </>
      )}
      {state === 'confirmed' && <p>✓ Consumazione erogata.</p>}
    </div>
  );
}

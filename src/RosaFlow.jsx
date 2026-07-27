import { useState, useEffect, useCallback } from 'react';

import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — CICLO ROSA COMPLETO (componenti reali)
 * ============================================================
 * Quattro pezzi, ognuno collegato a un endpoint vero:
 *   1) RosaSend       → POST /api/roses/send
 *   2) RosaNotification → POST /api/roses/:id/respond
 *   3) RosaGuessGame   → POST /api/roses/:id/guess
 *   4) RosaRedeemSeal  → POST /api/roses/:id/redeem
 * ============================================================
 */


export function RosaSend({ senderId, receiverId, arenaSessionId, venueId, onSent, onCancel }) {
  const [drinks, setDrinks] = useState([]);
  const [selectedDrink, setSelectedDrink] = useState(null);
  const [tier, setTier] = useState('standalone');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch(`/api/venues/${venueId}/drinks`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setDrinks(data.drinks); });
  }, [venueId]);

  const handleSend = useCallback(async () => {
    if (!selectedDrink) return;
    setSending(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/roses/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId, arenaSessionId, drinkProductId: selectedDrink.id, tier,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(reasonToMessage(data.reason));
        return;
      }
      onSent(data.rosaId);
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setSending(false);
    }
  }, [selectedDrink, tier, receiverId, arenaSessionId, onSent]);

  const tiers = [
    { id: 'standalone', label: 'Solo Rosa', sub: 'Anonima al 100% — nessun contatto' },
    { id: 'like', label: 'Rosa + Like', sub: 'Mistero — si svela solo con reciprocità' },
    { id: 'super', label: 'Rosa + Superlike', sub: 'Il tuo profilo sarà subito visibile' },
  ];

  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onCancel}>Chiudi ✕</div>
      <h3>Invia una Rosa</h3>

      <div className="pl-section-label">Scegli la Rosa</div>
      {drinks.map((d) => (
        <div
          key={d.id}
          className={`pl-rosa-option ${selectedDrink?.id === d.id ? 'selected' : ''}`}
          onClick={() => setSelectedDrink(d)}
        >
          <div className="pl-rosa-title">
            {d.name}
            {d.sponsor_name && <span className="pl-sponsor-tag"> · {d.sponsor_name}</span>}
          </div>
          <div className="pl-rosa-price">
            {((d.base_price_cents - (d.sponsor_discount_cents || 0)) / 100).toFixed(2)}€
          </div>
        </div>
      ))}
      {drinks.length === 0 && <p className="pl-hint">Nessun drink disponibile in questo locale al momento.</p>}

      <div className="pl-section-label">Come vuoi inviarla</div>
      {tiers.map((t) => (
        <div
          key={t.id}
          className={`pl-rosa-option ${tier === t.id ? 'selected' : ''}`}
          onClick={() => setTier(t.id)}
        >
          <div className="pl-rosa-title">{t.label}</div>
          <div className="pl-rosa-price">{t.sub}</div>
        </div>
      ))}

      {error && <p className="pl-error">{error}</p>}
      <button className="pl-send-btn" onClick={handleSend} disabled={!selectedDrink || sending}>
        {sending ? 'Invio…' : 'Invia Rosa'}
      </button>
    </div>
  );
}

function reasonToMessage(reason) {
  const messages = {
    blocked_by_receiver: 'Non puoi inviare nulla a questo profilo.',
    receiver_requires_verified: 'Questo profilo accetta contatti solo da utenti verificati.',
    receiver_requires_premium: 'Questo profilo accetta contatti solo da utenti premium.',
  };
  return messages[reason] || 'Invio non riuscito — riprova.';
}


export function RosaNotification({ rosa, currentUserId, arenaSessionId, onResolved }) {
  const [loading, setLoading] = useState(false);
  const [showGuessGame, setShowGuessGame] = useState(false);
  const [guessCandidates, setGuessCandidates] = useState([]);
  const [redeemInfo, setRedeemInfo] = useState(null);
  const [pendingRedeemCode, setPendingRedeemCode] = useState(null);

  async function respond(action) {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/roses/${rosa.rosaId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.success) return;

      if (action === 'accept') {
        if (rosa.tier === 'like' && data.canStillPlayGuessGame) {
          setPendingRedeemCode(data.redeemCode);
          const candRes = await apiFetch(`/api/arenas/${arenaSessionId}/guess-candidates`);
          const candData = await candRes.json();
          setGuessCandidates(candData.candidates || []);
          setShowGuessGame(true);
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
    return <RosaRedeemSeal rosaId={rosa.rosaId} redeemCode={redeemInfo.redeemCode} onDone={() => onResolved({ action: 'redeemed' })} />;
  }

  if (showGuessGame) {
    return (
      <RosaGuessGame
        rosaId={rosa.rosaId}
        currentUserId={currentUserId}
        candidates={guessCandidates}
        onFinished={() => setRedeemInfo({ redeemCode: pendingRedeemCode })}
      />
    );
  }

  const copy = {
    standalone: {
      title: 'Un ammiratore misterioso ti ha inviato una Rosa',
      sub: `Vuoi accettarla? Riscattabile al bancone.`,
    },
    like: {
      title: 'Un ammiratore misterioso ti ha inviato una Rosa + Like',
      sub: 'Se accetti, la Rosa è comunque tua — poi potrai provare a indovinare chi è per sbloccare la chat.',
    },
    super: {
      title: `${rosa.senderName || 'Qualcuno'} ti ha inviato una Rosa`,
      sub: `Ha anche inviato un Superlike: il suo profilo è visibile. Se non accetti, non potrà più contattarti.`,
    },
  }[rosa.tier];

  return (
    <div className="pl-sheet">
      <h3>{copy.title}</h3>
      <p className="pl-hint">{copy.sub}</p>

      <div className="pl-redeem-actions">
        <button disabled={loading} onClick={() => respond('ignore')}>Lascia in sospeso</button>
        <button disabled={loading} onClick={() => respond('reject')} className="pl-btn-reject">Rifiuta</button>
      </div>
      <button className="pl-send-btn" disabled={loading} onClick={() => respond('accept')}>
        {rosa.tier === 'super' ? 'Apri la chat' : 'Accetta la Rosa'}
      </button>
    </div>
  );
}


export function RosaGuessGame({ rosaId, currentUserId, candidates, onFinished, redeemCode }) {
  const [message, setMessage] = useState('Hai tot tentativi per provare a scoprire chi è.');

  async function guess(guessedUserId) {
    const res = await apiFetch(`/api/roses/${rosaId}/guess`, {
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
      setMessage('🎉 Match! La chat si sblocca.');
      setTimeout(() => onFinished({ matched: true }), 1200);
    } else if (data.attemptsExhausted) {
      setMessage('Tentativi esauriti — la Rosa resta tua, il mittente rimane un mistero.');
      setTimeout(() => onFinished({ matched: false }), 1500);
    } else {
      setMessage(`Non era lui/lei — ${data.attemptsRemaining} tentativi rimasti.`);
    }
  }

  return (
    <div className="pl-sheet">
      <h3>Indovina chi ti ha inviato la Rosa</h3>
      <p className="pl-hint">{message}</p>
      <div className="pl-guess-grid">
        {candidates.map((c) => (
          <div key={c.userId} className="pl-guess-candidate" onClick={() => guess(c.userId)}>
            {c.photoUrl ? <img src={c.photoUrl} alt={c.displayName} /> : (c.avatarEmoji || '🙂')}
            <span>{c.displayName}</span>
          </div>
        ))}
      </div>
      <button className="pl-abandon-btn" onClick={() => onFinished({ matched: false, abandoned: true })}>
        Nessuno mi interessa — abbandona e riscatta la Rosa
      </button>
    </div>
  );
}


export function RosaRedeemSeal({ rosaId, redeemCode, onDone }) {
  const [state, setState] = useState('idle');
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [flash, setFlash] = useState(false);

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

  async function handleSealTap() {
    if (state !== 'live') return;
    setFlash(true);
    setTimeout(() => setFlash(false), 350);

    const res = await apiFetch(`/api/roses/${rosaId}/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redeemCode }),
    });
    const data = await res.json();
    if (data.success) {
      setState('confirmed');
      setTimeout(onDone, 1000);
    }
  }

  return (
    <div className="pl-sheet pl-redeem-card">
      <h3>Riscatta la tua Rosa</h3>
      {state === 'idle' && (
        <button className="pl-seal" onClick={activate}>Tieni premuto per attivare</button>
      )}
      {state === 'live' && (
        <>
          <div className={`pl-seal pl-seal-live ${flash ? 'pl-seal-flash' : ''}`} onClick={handleSealTap}>
            {secondsLeft}
          </div>
          <p className="pl-hint">Mostra il telefono al bartender: un suo tocco sul cerchio conferma ed erogare la consumazione.</p>
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

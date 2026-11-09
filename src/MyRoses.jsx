import { useState, useEffect, useCallback } from 'react';
import { PulseWaveIcon } from './PopuLiveIcons';
import { PulseRedeemSeal } from './RosaFlow';
import SwipeableRow from './SwipeableRow';
import ProfileFullScreen from './ProfileFullScreen';

import { apiFetch, getOptimizedPhotoUrl } from './apiClient';
import { askConfirm } from './Dialogs';
import PulseBuySheet from './PulseBuy';
import { usePulseNight, formatEuro, formatNightTime, isEndingSoon } from './pulseNight';

/**
 * ============================================================
 * POPULIVE — I TUOI PULSE (componente reale)
 * ============================================================
 * Lista di tutti i Pulse ricevuti. Quelli ancora "pending" si
 * possono toccare per riaprire la stessa schermata di decisione
 * (PulseNotification) che si vede quando arrivano in tempo reale —
 * utile per chi non li ha gestiti subito e vuole tornarci sopra.
 *
 * In cima, le Pulse da usare STASERA (M11, novembre 2026): si
 * comprano con Stripe per la serata in cui si è dentro e scadono alla
 * chiusura del locale. Tolti i crediti validi ovunque e per sempre, i
 * pacchetti per locale e le Pulse gratis settimanali.
 * ============================================================
 */
export default function MyPulses({
  userId,
  venueId,
  arenaSessionId,
  onOpenPulse,
  onPulseListChanged,
  refreshKey,
}) {
  const [pulses, setPulses] = useState([]);
  const [sentPulses, setSentPulses] = useState([]); // visione complessiva richiesta dall'utente — anche le inviate, non solo ricevute
  const [loading, setLoading] = useState(true);
  const [showBuy, setShowBuy] = useState(false);
  const { info: night } = usePulseNight(arenaSessionId);
  const [redeemingPulse, setRedeemingPulse] = useState(null); // { pulseId, redeemCode } | null — riscatto rimandato, attivato da qui quando si è pronti
  const [viewingProfile, setViewingProfile] = useState(null); // { senderId, pulseId, isPending } | null — profilo aperto per decidere in modo ragionato, solo dove l'identità è già svelata

  // silent: ricarica senza la schermata "Caricamento…" (che farebbe
  // sparire l'elenco e perdere il punto in cui si era scorsi).
  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const [pulsesRes, sentRes] = await Promise.all([
          apiFetch(`/api/users/${userId}/pulses`),
          apiFetch(`/api/users/${userId}/sent-pulses`),
        ]);
        const pulsesData = await pulsesRes.json();
        const sentData = await sentRes.json();
        if (pulsesData.success) setPulses(pulsesData.pulses);
        if (sentData.success) setSentPulses(sentData.pulses);
      } catch (err) {
        console.error('Errore nel caricamento dei Pulse:', err);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Una Pulse decisa nella finestra di App.jsx (aperta da qui o
  // arrivata in tempo reale) cambia questo elenco: senza ricaricarlo
  // restava "Da decidere" e riaprirla non faceva più nulla (B9, 1/11).
  useEffect(() => {
    if (refreshKey) load({ silent: true });
  }, [refreshKey, load]);

  if (loading)
    return (
      <div className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>
        Caricamento…
      </div>
    );

  const available = night?.available || 0;
  const endingSoon = isEndingSoon(night?.deadline);

  // Nasconde solo QUESTA Pulse dalla lista di lavoro — mai la riga
  // vera sottostante (serve anche per punti/storico altrove). Sparisce
  // subito, senza aspettare la risposta del server. Una Pulse vive
  // SOLO in una delle due liste (mai inviata E ricevuta insieme, non
  // ci si può mandare qualcosa da soli) — filtrare entrambe è
  // innocuo, tocca solo quella giusta.
  function handleDismiss(pulseId) {
    setPulses((prev) => prev.filter((p) => p.pulseId !== pulseId));
    setSentPulses((prev) => prev.filter((p) => p.pulseId !== pulseId));
    apiFetch(`/api/users/${userId}/pulses/${pulseId}/dismiss`, { method: 'POST' }).catch(() => {});
  }

  async function handleClearAll() {
    if (
      !(await askConfirm({
        title: 'Eliminare tutte le notifiche Pulse?',
        confirmLabel: 'Elimina',
        danger: true,
      }))
    )
      return;
    setPulses([]);
    setSentPulses([]);
    apiFetch(`/api/users/${userId}/pulses/clear-all`, { method: 'POST' }).catch(() => {});
  }

  // Decisione presa direttamente dal profilo a tutto schermo (aperto
  // toccando la foto sulla riga "Da decidere") — solo per le Pulse
  // che svelano chi le manda (tutte, dal novembre 2026). Chiude il profilo e aggiorna
  // subito la lista, stesso comportamento della schermata di
  // decisione originale.
  async function respondFromProfile(action) {
    const pulseId = viewingProfile?.pulseId;
    setViewingProfile(null);
    if (!pulseId) return;
    try {
      await apiFetch(`/api/pulses/${pulseId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      console.error('Errore rispondendo alla Pulse dal profilo:', err);
    }
    load();
    onPulseListChanged?.();
  }

  // Tre gruppi separati, per capire al volo la situazione reale: cosa
  // aspetta ancora una decisione, cosa è pronto per il bancone, e cosa
  // è già stato riscattato. Le "in sospeso" hanno un gruppo loro (D9,
  // 2/10: "decido dopo", si possono ancora accettare o rifiutare); il
  // resto (rifiutate/scadute) in un gruppo più defilato.
  const pendingPulses = pulses.filter((p) => p.status === 'pending');
  const onHoldPulses = pulses.filter((p) => p.status === 'ignored');
  const toRedeemPulses = pulses.filter((p) => p.status === 'accepted');
  const redeemedPulses = pulses.filter((p) => p.status === 'redeemed');
  const otherPulses = pulses.filter(
    (p) => !['pending', 'ignored', 'accepted', 'redeemed'].includes(p.status)
  );

  // Stessa suddivisione lato INVIATE — ma qui "riscattare" non è
  // un'azione possibile (solo chi riceve può farlo al bancone), è
  // solo uno stato da osservare: "in attesa di una decisione",
  // "accettata ma non ancora ritirata", "ritirata", "altro".
  // Lato INVIATO semplificato (14/8, richiesta esplicita): tre
  // gruppi soli, non quattro come nei ricevuti — accettata e
  // ritirata contano come la stessa cosa qui, i dettagli restano
  // tra le due persone nella chat che si apre appena si accetta.
  const awaitingSentPulses = sentPulses.filter((p) => ['pending', 'ignored'].includes(p.status));
  const acceptedSentPulses = sentPulses.filter((p) => ['accepted', 'redeemed'].includes(p.status));
  const rejectedSentPulses = sentPulses.filter((p) => ['rejected', 'expired'].includes(p.status));
  const rejectedLabel = rejectedSentPulses.some((p) => p.status === 'expired')
    ? 'Rifiutate o scadute'
    : 'Rifiutate';

  function renderPulseRow(r) {
    // Il bottone "Riscatta" funziona solo nel locale dove il Pulse è
    // stato ricevuto — se si è altrove (o non si è fatto check-in da
    // nessuna parte), resta visibile ma spento, con scritto dove
    // andare per attivarlo davvero. Cambia solo l'aspetto, MAI lo
    // stato reale: appena si torna nel locale giusto si riattiva da
    // solo, senza bisogno di ricaricare nulla a mano.
    const canRedeemHere =
      r.status === 'accepted' && r.redeemCode && venueId && r.venueId === venueId;
    const readyButBlocked = r.status === 'accepted' && r.redeemCode && !canRedeemHere;

    return (
      <SwipeableRow key={r.pulseId} onDismiss={() => handleDismiss(r.pulseId)}>
        <div
          className="pl-pulse-option"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 0,
          }}
          onClick={() => {
            if (r.status === 'pending' || r.status === 'ignored') onOpenPulse(r);
          }}
        >
          {r.senderId && r.senderPhotoUrl ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setViewingProfile({
                  senderId: r.senderId,
                  pulseId: r.pulseId,
                  isPending: r.status === 'pending' || r.status === 'ignored',
                  onHold: r.status === 'ignored',
                });
              }}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
                border: '1.5px solid var(--cyan)',
              }}
            >
              <img
                src={getOptimizedPhotoUrl(r.senderPhotoUrl, { width: 32, height: 32 })}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ) : (
            <PulseWaveIcon size={22} color="var(--cyan)" />
          )}
          <div style={{ flex: 1 }}>
            <div className="pl-pulse-title">{r.drinkType || 'Una consumazione'}</div>
            <div className="pl-pulse-price">
              DA {r.senderName ? r.senderName : 'Ammiratore misterioso'} · {r.venueName}
            </div>
            {r.status === 'accepted' && r.deadline && (
              <div className="pl-pulse-price" style={{ color: 'var(--teak)' }}>
                Ritirala al bancone entro le {formatNightTime(r.deadline)}
              </div>
            )}
          </div>
          {canRedeemHere && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRedeemingPulse({ pulseId: r.pulseId, redeemCode: r.redeemCode });
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                background: 'var(--cyan)',
                color: '#fff',
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Riscatta
            </button>
          )}
          {readyButBlocked && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(228,212,200,0.16)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: 10.5,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                Riscatta
              </div>
              <div style={{ fontSize: 8.5, color: 'var(--text-muted)', marginTop: 3 }}>
                Solo a {r.venueName}
              </div>
            </div>
          )}
          {!canRedeemHere && !readyButBlocked && <StatusBadge status={r.status} />}
        </div>
      </SwipeableRow>
    );
  }

  // Riga per le INVIATE — niente da toccare (non c'è nessuna azione
  // possibile su qualcosa che si è già mandato), solo da vedere: chi
  // l'ha ricevuta (sempre visibile, l'hai scelto tu) e a che punto è.
  function renderSentPulseRow(r) {
    return (
      <SwipeableRow key={r.pulseId} onDismiss={() => handleDismiss(r.pulseId)}>
        <div
          className="pl-pulse-option"
          style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 0 }}
        >
          <PulseWaveIcon size={22} color="var(--cyan)" />
          <div style={{ flex: 1 }}>
            <div className="pl-pulse-title">{r.drinkType || 'Una consumazione'}</div>
            <div className="pl-pulse-price">
              A {r.receiverName} · {r.venueName}
            </div>
          </div>
          <StatusBadge status={r.status} context="sent" />
        </div>
      </SwipeableRow>
    );
  }

  return (
    <div className="pl-screen">
      {/* Momento editoriale — stesso linguaggio della striscia in
          cima al Radar: foto desaturata, icona+testo+freccina.
          Coppia al bancone, coerente col contenuto reale di questa
          pagina (è dove nasce la consumazione di una Pulse). */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '16/5',
          borderRadius: 16,
          overflow: 'hidden',
          marginBottom: 10,
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <img
          src="https://res.cloudinary.com/rjkegdrp/image/upload/v1786332632/pulse_populive_nv5g9y.webp"
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 35%',
            filter: 'grayscale(100%) contrast(1.08) brightness(0.95)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to right, rgba(20,16,15,0.92) 0%, rgba(20,16,15,0.55) 40%, rgba(20,16,15,0.05) 75%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #FF7A9C, var(--cyan))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px -2px rgba(255,61,110,0.5)',
            }}
          >
            <PulseWaveIcon size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Unbounded',sans-serif",
                fontWeight: 700,
                fontSize: 12.5,
                color: '#fff',
                textShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}
            >
              Offri un momento vero
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
              Un Pulse è un invito, non solo un drink
            </div>
          </div>
        </div>
      </div>

      {/* Saldo e acquisto (09/11, richiesta dell'utente: qui e non più
          nel radar, che mostra solo l'avviso dell'ultima ora). Sempre in
          cima, prima della lista. */}
      <div
        style={{
          background: 'var(--surface)',
          border: `1px solid ${endingSoon ? 'var(--red)' : 'rgba(255,61,110,0.3)'}`,
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
          boxShadow: 'var(--shadow-glow-cyan)',
        }}
      >
        <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
          Le tue Pulse di stasera
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PulseWaveIcon size={30} color="var(--cyan)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            {night?.isAvailable ? (
              <>
                <div
                  style={{
                    fontFamily: "'Unbounded',sans-serif",
                    fontWeight: 700,
                    fontSize: 20,
                    lineHeight: 1.1,
                  }}
                >
                  {available} <span style={{ fontSize: 12, fontWeight: 600 }}>Pulse da usare</span>
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    marginTop: 3,
                    color: endingSoon ? 'var(--red)' : 'var(--text-muted)',
                  }}
                >
                  {night.isOpen
                    ? `${night.venueName} · ${formatEuro(night.priceCents)} l'una · valide fino alle ${formatNightTime(night.deadline)}`
                    : `${night.venueName} · serata finita`}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Offri un drink a chi è qui</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {arenaSessionId
                    ? 'In questo locale le Pulse non sono disponibili.'
                    : 'Entra in un locale con il QR per comprare e inviare Pulse.'}
                </div>
              </>
            )}
          </div>
        </div>
        {night?.canBuy && (
          <button
            className="pl-send-btn"
            onClick={() => setShowBuy(true)}
            style={{ marginTop: 12 }}
          >
            Acquista Pulse
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

      {(pulses.length > 0 || sentPulses.length > 0) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={handleClearAll}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            Ripulisci tutto
          </button>
        </div>
      )}

      {pulses.length === 0 && sentPulses.length === 0 && (
        <div className="pl-hint" style={{ textAlign: 'center', marginTop: 20 }}>
          Ancora nessun Pulse stasera, né ricevuto né inviato.
        </div>
      )}

      {pulses.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "'Unbounded',sans-serif",
              fontWeight: 700,
              fontSize: 13.5,
              marginBottom: 4,
            }}
          >
            Ricevuti
          </div>

          {pendingPulses.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
                Da decidere
              </div>
              {pendingPulses.map(renderPulseRow)}
            </div>
          )}

          {onHoldPulses.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
                In sospeso
              </div>
              {onHoldPulses.map(renderPulseRow)}
            </div>
          )}

          {toRedeemPulses.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
                Da riscattare
              </div>
              {toRedeemPulses.map(renderPulseRow)}
            </div>
          )}

          {redeemedPulses.length > 0 && (
            <div style={{ marginBottom: 14 }}>{redeemedPulses.map(renderPulseRow)}</div>
          )}

          {otherPulses.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
                Altri
              </div>
              {otherPulses.map(renderPulseRow)}
            </div>
          )}
        </div>
      )}

      {/* Visione complessiva richiesta dall'utente — non solo cosa
          arriva, anche cosa si è mandato, sulla stessa pagina.
          Nessuna azione possibile qui (Riscatta è solo per chi
          riceve), solo lo stato a colpo d'occhio. */}
      {sentPulses.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "'Unbounded',sans-serif",
              fontWeight: 700,
              fontSize: 13.5,
              marginBottom: 4,
            }}
          >
            Inviati
          </div>

          {awaitingSentPulses.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
                In attesa di decisione
              </div>
              {awaitingSentPulses.map(renderSentPulseRow)}
            </div>
          )}

          {acceptedSentPulses.length > 0 && (
            <div style={{ marginBottom: 14 }}>{acceptedSentPulses.map(renderSentPulseRow)}</div>
          )}

          {rejectedSentPulses.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>
                {rejectedLabel}
              </div>
              {rejectedSentPulses.map(renderSentPulseRow)}
            </div>
          )}
        </div>
      )}

      {redeemingPulse && (
        <div
          className="pl-fullscreen-modal"
          style={{ position: 'fixed', inset: 0, background: 'var(--bg, #14100F)', zIndex: 70 }}
        >
          <PulseRedeemSeal
            pulseId={redeemingPulse.pulseId}
            redeemCode={redeemingPulse.redeemCode}
            venueId={venueId}
            onDone={() => {
              setRedeemingPulse(null);
              load();
              onPulseListChanged?.();
            }}
            onCancel={() => setRedeemingPulse(null)}
          />
        </div>
      )}

      {viewingProfile && (
        <ProfileFullScreen
          userId={viewingProfile.senderId}
          arenaSessionId={arenaSessionId}
          currentUserId={userId}
          venueId={venueId}
          onClose={() => setViewingProfile(null)}
          decisionActions={
            viewingProfile.isPending
              ? {
                  onAccept: () => respondFromProfile('accept'),
                  onReject: () => respondFromProfile('reject'),
                  onIgnore: viewingProfile.onHold ? undefined : () => respondFromProfile('ignore'),
                }
              : null
          }
          hideActionButtons={!viewingProfile.isPending}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, context = 'received' }) {
  const receivedLabels = {
    pending: { text: 'Da decidere', color: 'var(--cyan)' },
    accepted: { text: 'Accettato', color: 'var(--teak)' },
    redeemed: { text: 'Riscattato', color: 'var(--text-muted)' },
    rejected: { text: 'Rifiutato', color: 'var(--text-muted)' },
    ignored: { text: 'In sospeso', color: 'var(--text-muted)' },
    expired: { text: 'Scaduto', color: 'var(--text-muted)' },
  };

  // Lato INVIATO semplificato su richiesta esplicita (14/8): una
  // volta accettata, la chat si apre e le due persone si parlano
  // lì — sapere esattamente SE/QUANDO l'altra persona ha ritirato
  // il drink non aggiunge nulla, rischia solo di far sentire "in
  // debito" chi l'ha ricevuta. Tre stati soli, non sei: quello che
  // conta per chi ha inviato è solo "deve ancora decidere", "ha
  // detto sì" (poi i dettagli restano tra loro in chat) o "ha detto
  // no". Rifiutata: la Pulse è tornata nel saldo della serata (M11);
  // scaduta: la serata è finita senza una decisione o senza il ritiro.
  const sentLabels = {
    pending: { text: 'In attesa di decisione', color: 'var(--cyan)' },
    ignored: { text: 'In attesa di decisione', color: 'var(--cyan)' },
    accepted: { text: 'Accettato', color: 'var(--teak)' },
    redeemed: { text: 'Accettato', color: 'var(--teak)' },
    rejected: { text: 'Rifiutata · ti è tornata', color: 'var(--text-muted)' },
    expired: { text: 'Scaduta', color: 'var(--text-muted)' },
  };

  const labels = context === 'sent' ? sentLabels : receivedLabels;
  const label = labels[status] || { text: status, color: 'var(--text-muted)' };
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        textTransform: 'uppercase',
        color: label.color,
        whiteSpace: 'nowrap',
      }}
    >
      {label.text}
    </span>
  );
}

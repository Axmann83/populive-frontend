import { useState, useEffect, useCallback } from 'react';
import { PulseWaveIcon } from './PopuLiveIcons';
import { PulseRedeemSeal } from './RosaFlow';
import SwipeableRow from './SwipeableRow';

import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — I TUOI PULSE (componente reale)
 * ============================================================
 * Lista di tutti i Pulse ricevuti. Quelli ancora "pending" si
 * possono toccare per riaprire la stessa schermata di decisione
 * (PulseNotification) che si vede quando arrivano in tempo reale —
 * utile per chi non li ha gestiti subito e vuole tornarci sopra.
 *
 * In cima, il saldo di Pulse pronti da INVIARE — gratis settimanali
 * + pre-pagati comprati in pacchetto (mai a scadenza, utilizzabili
 * in qualunque locale partner). Prima l'unico modo di avere un
 * Pulse extra era pagarlo uno alla volta al momento dell'invio.
 * ============================================================
 */
export default function MyPulses({ userId, venueId, onOpenPulse, onPulseListChanged }) {
  const [pulses, setPulses] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null); // null | 1 | 5, quale quantità è in corso
  const [purchaseError, setPurchaseError] = useState(null);
  const [redeemingPulse, setRedeemingPulse] = useState(null); // { pulseId, redeemCode } | null — riscatto rimandato, attivato da qui quando si è pronti

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pulsesRes, balanceRes] = await Promise.all([
        apiFetch(`/api/users/${userId}/pulses`),
        apiFetch(`/api/users/${userId}/pulse-balance`),
      ]);
      const pulsesData = await pulsesRes.json();
      const balanceData = await balanceRes.json();
      if (pulsesData.success) setPulses(pulsesData.pulses);
      if (balanceData.success) setBalance(balanceData);
    } catch (err) {
      console.error('Errore nel caricamento dei Pulse:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Prezzi specifici DI QUESTO LOCALE — non più un catalogo globale.
  // Se il locale non ha ancora concordato un prezzo con gli
  // Architetti, il campo resta vuoto (null) e quel bottone
  // semplicemente non compare — mai un prezzo finto.
  const [venuePrices, setVenuePrices] = useState({ singlePriceCents: null, bundle5PriceCents: null });

  useEffect(() => {
    if (!venueId) return;
    apiFetch(`/api/venues/${venueId}/pulse-prices`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenuePrices(data); })
      .catch(() => {});
  }, [venueId]);

  const buyCredits = useCallback(async (quantity) => {
    setPurchasing(quantity);
    setPurchaseError(null);
    try {
      const purchaseRes = await apiFetch(`/api/venues/${venueId}/pulse-credits/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      const purchaseData = await purchaseRes.json();

      if (purchaseData.requiresPayment) {
        window.location.href = purchaseData.checkoutUrl;
        return;
      }

      if (purchaseData.success) {
        load(); // account di prova/gratis: il saldo è già aggiornato sul server
      } else {
        setPurchaseError('Qualcosa è andato storto — riprova.');
      }
    } catch {
      setPurchaseError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setPurchasing(null);
    }
  }, [load, venueId]);

  if (loading) return <div className="pl-hint" style={{ textAlign: 'center', marginTop: 30 }}>Caricamento…</div>;

  const totalAvailable = (balance?.freeBalance || 0) + (balance?.paidCredits || 0);
  const hasAnyPriceSet = venuePrices.singlePriceCents || venuePrices.bundle5PriceCents;

  // Nasconde solo QUESTA Pulse dalla lista di lavoro — mai la riga
  // vera sottostante (serve anche per punti/storico altrove). Sparisce
  // subito, senza aspettare la risposta del server.
  function handleDismiss(pulseId) {
    setPulses((prev) => prev.filter((p) => p.pulseId !== pulseId));
    apiFetch(`/api/users/${userId}/pulses/${pulseId}/dismiss`, { method: 'POST' }).catch(() => {});
  }

  function handleClearAll() {
    if (!window.confirm('Vuoi davvero eliminare tutte le notifiche Pulse?')) return;
    setPulses([]);
    apiFetch(`/api/users/${userId}/pulses/clear-all`, { method: 'POST' }).catch(() => {});
  }

  // Tre gruppi separati, per capire al volo la situazione reale: cosa
  // aspetta ancora una decisione, cosa è pronto per il bancone, e cosa
  // è già stato riscattato. Il resto (rifiutate/in sospeso/scadute) in
  // un quarto gruppo più defilato, meno urgente da vedere.
  const pendingPulses = pulses.filter((p) => p.status === 'pending');
  const toRedeemPulses = pulses.filter((p) => p.status === 'accepted');
  const redeemedPulses = pulses.filter((p) => p.status === 'redeemed');
  const otherPulses = pulses.filter((p) => !['pending', 'accepted', 'redeemed'].includes(p.status));

  function renderPulseRow(r) {
    return (
      <SwipeableRow key={r.pulseId} onDismiss={() => handleDismiss(r.pulseId)}>
        <div
          className="pl-pulse-option"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 0 }}
          onClick={() => {
            if (r.status === 'pending') onOpenPulse(r);
          }}
        >
          <PulseWaveIcon size={22} color="var(--cyan)" />
          <div style={{ flex: 1 }}>
            <div className="pl-pulse-title">{r.drinkType}</div>
            <div className="pl-pulse-price">
              {r.senderName ? r.senderName : 'Ammiratore misterioso'} · {r.venueName}
            </div>
          </div>
          {r.status === 'accepted' && r.redeemCode ? (
            <button
              onClick={(e) => { e.stopPropagation(); setRedeemingPulse({ pulseId: r.pulseId, redeemCode: r.redeemCode }); }}
              style={{ padding: '6px 12px', borderRadius: 999, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Riscatta
            </button>
          ) : (
            <StatusBadge status={r.status} />
          )}
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
      <div style={{ position: 'relative', aspectRatio: '16/5', borderRadius: 16, overflow: 'hidden', marginBottom: 10, boxShadow: 'var(--shadow-md)' }}>
        <img
          src="https://res.cloudinary.com/rjkegdrp/image/upload/v1786332632/pulse_populive_nv5g9y.webp"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%', filter: 'grayscale(100%) contrast(1.08) brightness(0.95)' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(20,16,15,0.92) 0%, rgba(20,16,15,0.55) 40%, rgba(20,16,15,0.05) 75%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #FF7A9C, var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -2px rgba(255,61,110,0.5)' }}>
            <PulseWaveIcon size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 12.5, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
              Offri un momento vero
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
              Un Pulse è un invito, non solo un drink
            </div>
          </div>
        </div>
      </div>

      {/* Saldo — sempre in cima, prima della lista */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid rgba(255,61,110,0.3)', borderRadius: 14, padding: 12, marginBottom: 10, boxShadow: 'var(--shadow-glow-cyan)' }}>
        <PulseWaveIcon size={26} color="var(--cyan)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{totalAvailable} Pulse pronti da inviare</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {balance?.freeBalance || 0} gratis · {balance?.paidCredits || 0} pre-pagati
          </div>
        </div>
      </div>

      {/* Opzioni di acquisto — prezzo specifico DI QUESTO LOCALE,
          compare solo se è stato davvero concordato (mai un prezzo
          finto). Se il locale non ne ha impostato nessuno, questa
          sezione sparisce del tutto. */}
      {hasAnyPriceSet && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {venuePrices.singlePriceCents && (
            <button
              onClick={() => buyCredits(1)}
              disabled={purchasing !== null}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'var(--surface-2)', border: '1px solid rgba(228,212,200,0.16)', borderRadius: 12,
                padding: '10px 8px', cursor: purchasing !== null ? 'default' : 'pointer',
                opacity: purchasing !== null && purchasing !== 1 ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cyan)' }}>
                {purchasing === 1 ? 'Un attimo…' : '+1 Pulse'}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(venuePrices.singlePriceCents / 100).toFixed(2)}€</span>
            </button>
          )}
          {venuePrices.bundle5PriceCents && (
            <button
              onClick={() => buyCredits(5)}
              disabled={purchasing !== null}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'var(--surface-2)', border: '1px solid rgba(228,212,200,0.16)', borderRadius: 12,
                padding: '10px 8px', cursor: purchasing !== null ? 'default' : 'pointer',
                opacity: purchasing !== null && purchasing !== 5 ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cyan)' }}>
                {purchasing === 5 ? 'Un attimo…' : '+5 Pulse'}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(venuePrices.bundle5PriceCents / 100).toFixed(2)}€</span>
            </button>
          )}
        </div>
      )}
      {purchaseError && <p className="pl-error" style={{ marginBottom: 10 }}>{purchaseError}</p>}

      {pulses.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={handleClearAll}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 4 }}
          >
            Ripulisci tutto
          </button>
        </div>
      )}

      {pulses.length === 0 && (
        <div className="pl-hint" style={{ textAlign: 'center', marginTop: 20 }}>Ancora nessun Pulse ricevuto stasera.</div>
      )}

      {pendingPulses.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>Da decidere</div>
          {pendingPulses.map(renderPulseRow)}
        </div>
      )}

      {toRedeemPulses.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>Da riscattare</div>
          {toRedeemPulses.map(renderPulseRow)}
        </div>
      )}

      {redeemedPulses.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>Riscattate</div>
          {redeemedPulses.map(renderPulseRow)}
        </div>
      )}

      {otherPulses.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="pl-section-label" style={{ marginTop: 0, marginBottom: 8 }}>Altre</div>
          {otherPulses.map(renderPulseRow)}
        </div>
      )}

      {redeemingPulse && (
        <div className="pl-fullscreen-modal" style={{ position: 'fixed', inset: 0, background: 'var(--bg, #14100F)', zIndex: 70 }}>
          <PulseRedeemSeal
            pulseId={redeemingPulse.pulseId}
            redeemCode={redeemingPulse.redeemCode}
            venueId={venueId}
            onDone={() => { setRedeemingPulse(null); load(); onPulseListChanged?.(); }}
          />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const labels = {
    pending: { text: 'Da decidere', color: 'var(--cyan)' },
    accepted: { text: 'Accettata', color: 'var(--teak)' },
    redeemed: { text: 'Riscattata', color: 'var(--text-muted)' },
    rejected: { text: 'Rifiutata', color: 'var(--text-muted)' },
    ignored: { text: 'In sospeso', color: 'var(--text-muted)' },
    expired: { text: 'Scaduta', color: 'var(--text-muted)' },
  };
  const label = labels[status] || { text: status, color: 'var(--text-muted)' };
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: label.color, whiteSpace: 'nowrap' }}>
      {label.text}
    </span>
  );
}

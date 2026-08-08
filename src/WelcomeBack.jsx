import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';
import { Heart, Star, PulseWaveIcon, Hand } from './PopuLiveIcons';

/**
 * ============================================================
 * POPULIVE — "BENTORNATO" (leva di ritenzione)
 * ============================================================
 * Mostrata una volta, appena l'app è pronta dopo il login — non
 * un'invenzione, ma un confronto vero tra "adesso" e l'ultima
 * volta che la persona ha aperto l'app (users.last_seen_at).
 * Se non c'è nulla di nuovo, il componente non mostra nulla e
 * avvisa subito il genitore (onDone), senza disturbare con una
 * schermata vuota.
 * ============================================================
 */
export default function WelcomeBack({ userId, onDone }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/users/${userId}/welcome-back`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.hasNews) {
          setSummary(data);
        } else {
          onDone?.();
        }
      })
      .catch(() => onDone?.());
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!summary) return null;

  const items = [];
  if (summary.newLikes > 0) items.push({ icon: Heart, label: `${summary.newLikes} nuovi Like` });
  if (summary.newSuperlikes > 0) items.push({ icon: Star, label: `${summary.newSuperlikes} nuovi Superlike` });
  if (summary.newPulses > 0) items.push({ icon: PulseWaveIcon, label: `${summary.newPulses} nuovi Pulse` });

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <Hand size={32} color="var(--cyan)" style={{ marginBottom: 6 }} />
        <h2 style={{ fontFamily: "'Unbounded',sans-serif", fontSize: 20, margin: '0 0 6px' }}>Bentornato</h2>
        <p className="pl-hint" style={{ marginBottom: 16 }}>Ecco cosa ti sei perso dall'ultima volta</p>

        {summary.pointsEarned > 0 && (
          <div style={pointsBadgeStyle}>
            +{summary.pointsEarned} punti guadagnati
          </div>
        )}

        {items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, textAlign: 'left' }}>
            {items.map((it) => (
              <div key={it.label} style={itemRowStyle}>
                <it.icon size={16} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{it.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Il Like resta anonimo — non sveliamo mai chi è stato — ma
            sapere che QUALCUNO l'ha fatto è di per sé un motivo
            concreto per aprire il Radar e iniziare a ricambiare in
            giro: se si becca la persona giusta, scatta il match e
            arrivano i punti bonus (v. sistema punti). */}
        {summary.newLikes > 0 && (
          <p style={{ fontSize: 11.5, color: 'var(--cyan)', marginTop: 12, marginBottom: 0, lineHeight: 1.4 }}>
            💜 Prova a mettere like in giro — se becchi la persona giusta, scatta il match e arrivano i punti bonus!
          </p>
        )}

        <button className="pl-send-btn" style={{ marginTop: 20 }} onClick={onDone}>
          Continua
        </button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.85)',
  zIndex: 90,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const cardStyle = {
  width: '100%',
  maxWidth: 340,
  background: 'var(--surface)',
  border: '1px solid rgba(228,212,200,0.14)',
  borderRadius: 20,
  padding: '28px 24px',
  textAlign: 'center',
  boxShadow: 'var(--shadow-lg)',
};

const pointsBadgeStyle = {
  display: 'inline-block',
  padding: '7px 16px',
  borderRadius: 999,
  background: 'rgba(255,61,110,0.14)',
  border: '1px solid rgba(255,61,110,0.4)',
  color: 'var(--cyan)',
  fontFamily: "'Unbounded',sans-serif",
  fontWeight: 700,
  fontSize: 14,
};

const itemRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--surface-2)',
  border: '1px solid rgba(228,212,200,0.1)',
  borderRadius: 12,
  padding: '10px 14px',
  boxShadow: 'var(--shadow-sm)',
};

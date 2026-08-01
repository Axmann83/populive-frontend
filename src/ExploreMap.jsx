import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — ESPLORA LOCALI (dati veri)
 * ============================================================
 * Prima mostrava dati di esempio fissi. Ora recupera i veri
 * numeri di check-in di stasera dal server — SOLO dati aggregati
 * per locale, mai profili individuali, stessa regola di sempre.
 *
 * Il rapporto uomini/donne è tornato, ma ora è VERO — calcolato
 * solo su chi ha scelto di condividere il proprio genere in fase
 * di registrazione (facoltativo). Se nessuno lo ha condiviso per
 * un locale, quella parte semplicemente non compare — mai un dato
 * inventato al suo posto.
 * ============================================================
 */
export default function ExploreMap({ onClose }) {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/venues/popular-now')
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenues(data.venues); })
      .finally(() => setLoading(false));
  }, []);

  const maxCheckins = Math.max(1, ...venues.map((v) => v.checkinCount));

  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onClose}>Chiudi ✕</div>
      <h3>Esplora i locali</h3>
      <p className="pl-hint" style={{ marginBottom: 12 }}>
        I locali più caldi di stasera, in tempo reale
      </p>
      {loading && <p className="pl-hint">Caricamento…</p>}
      {!loading && venues.length === 0 && (
        <p className="pl-hint">Nessun locale con check-in al momento — torna più tardi stasera.</p>
      )}
      {venues.map((v) => (
        <VenueCard key={v.venueId} venue={v} maxCheckins={maxCheckins} />
      ))}
    </div>
  );
}

function VenueCard({ venue, maxCheckins }) {
  const popularityPct = Math.round((venue.checkinCount / maxCheckins) * 100);
  const g = venue.genderStats;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 16, padding: 14, marginBottom: 12, boxShadow: 'var(--shadow-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13 }}>{venue.name}</div>
        {venue.arenaActive && <span className="pl-arena-pill" style={{ fontSize: 8 }}><span className="pl-live-dot"></span> Attiva</span>}
      </div>
      {venue.category && <div style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{venue.category}</div>}

      <div style={{ display: 'flex', gap: 14, margin: '9px 0' }}>
        <Stat num={venue.checkinCount} label="check-in stasera" />
        {g && <Stat num={`${g.femalePct}%`} label="donne" />}
        {g && <Stat num={`${g.malePct}%`} label="uomini" />}
      </div>

      {/* Barra uomini/donne — solo se almeno una persona ha
          condiviso il dato per questo locale stasera. */}
      {g && (
        <div style={{ display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ background: 'var(--teak)', width: `${g.femalePct}%` }} />
          <div style={{ background: 'var(--cyan)', width: `${g.malePct}%` }} />
          {g.otherPct > 0 && <div style={{ background: 'var(--gold-medal, #E8C77E)', width: `${g.otherPct}%` }} />}
        </div>
      )}

      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Popolarità della serata
      </div>
      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ height: '100%', width: `${popularityPct}%`, background: 'linear-gradient(90deg, var(--cyan), var(--teak))', borderRadius: 999 }} />
      </div>
    </div>
  );
}

function Stat({ num, label }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18 }}>{num}</div>
      <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

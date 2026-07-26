const DEMO_VENUES = [
  { id: 1, name: 'Piper Club', area: 'Roma · Parioli', people: 87, men: 52, women: 48, popularity: 78, ambassador: { name: 'Elena', hashtag: '#fitness' } },
  { id: 2, name: 'Shari Vari', area: 'Roma · Trastevere', people: 134, men: 44, women: 56, popularity: 91, ambassador: null },
  { id: 3, name: 'Just Cavalli', area: 'Roma · Ponte Milvio', people: 52, men: 60, women: 40, popularity: 54, ambassador: { name: 'Davide', hashtag: '#nightlife' } },
];

export default function ExploreMap({ onClose }) {
  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onClose}>Chiudi ✕</div>
      <h3>Esplora i locali</h3>
      <p className="pl-hint" style={{ marginBottom: 12 }}>
        Trastevere o Ponte Milvio stasera? Guarda dove conviene andare
        <span style={{ display: 'block', marginTop: 4, fontSize: 9.5, opacity: 0.7 }}>
          (dati dimostrativi — la query di aggregazione live è ancora da collegare)
        </span>
      </p>
      {DEMO_VENUES.map((v) => (
        <VenueCard key={v.id} venue={v} />
      ))}
    </div>
  );
}

function VenueCard({ venue }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 16, padding: 14, marginBottom: 12 }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13 }}>{venue.name}</div>
      <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{venue.area}</div>

      <div style={{ display: 'flex', gap: 12, margin: '9px 0' }}>
        <Stat num={venue.people} label="presenti" />
        <Stat num={`${venue.men}%`} label="uomini" />
        <Stat num={`${venue.women}%`} label="donne" />
      </div>

      <div style={{ display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ background: 'var(--cyan)', width: `${venue.men}%` }} />
        <div style={{ background: 'var(--teak)', width: `${venue.women}%` }} />
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Popolarità della serata
      </div>
      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ height: '100%', width: `${venue.popularity}%`, background: 'linear-gradient(90deg, var(--cyan), var(--teak))', borderRadius: 999 }} />
      </div>

      {venue.ambassador && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, background: 'var(--surface-2)', border: '1px solid rgba(228,212,200,0.14)', borderRadius: 10, padding: '7px 9px', fontSize: 9.5 }}>
          🌟 Stasera c'è <b>{venue.ambassador.name}</b> {venue.ambassador.hashtag}
        </div>
      )}
    </div>
  );
}

function Stat({ num, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14 }}>{num}</div>
      <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiFetch } from './apiClient';
import HistoricalBoard from './HistoricalBoard';

/**
 * ============================================================
 * POPULIVE — MAPPA DI TUTTI I LOCALI
 * ============================================================
 * A differenza di "I locali stanotte" (che mostra solo chi ha già
 * ricevuto un check-in), questa mostra TUTTI i locali conosciuti —
 * anche quelli importati ma mai ancora "attivati" da nessuno.
 *
 * Due tipi di puntino:
 *  - CIANO = locale del network ufficiale (accordo vero, badge
 *    Verificato, affluenza/popolarità reali visibili)
 *  - GRIGIO = locale non ancora nel network — solo il nome, e
 *    l'opzione di crearne una versione "non ufficiale" propria
 *
 * Usa OpenStreetMap (gratuito, nessuna chiave API) invece di
 * Google Maps — stessa scelta già fatta per i dati dei locali
 * stessi (Geoapify).
 * ============================================================
 */

const ROME_CENTER = [41.9028, 12.4964];

const VENUE_TYPE_LABELS = {
  nightclub: 'Nightclub',
  ristorante: 'Ristorante',
  palestra: 'Palestra',
  cocktail_bar: 'Cocktail Bar',
  retail: 'Retail',
};

function makeDotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #0D0D0D;box-shadow:0 2px 8px -1px rgba(0,0,0,0.6);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

const VERIFIED_ICON = makeDotIcon('#2FD3E8');
const UNVERIFIED_ICON = makeDotIcon('#B0AAA4');
const NEW_PIN_ICON = makeDotIcon('#E8C77E');

export default function VenuesMap({ currentUserId, onClose }) {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historicalVenueId, setHistoricalVenueId] = useState(null);
  const [placingPin, setPlacingPin] = useState(false);
  const [newPinCoords, setNewPinCoords] = useState(null);

  useEffect(() => {
    loadVenues();
  }, []);

  function loadVenues() {
    apiFetch('/api/venues/map')
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenues(data.venues); })
      .finally(() => setLoading(false));
  }

  async function createUnofficialCopy(venue) {
    const res = await apiFetch('/api/venues/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
        venueType: venue.venueType,
      }),
    });
    const data = await res.json();
    if (data.success) {
      window.alert(`Fatto — "${venue.name}" è ora attivabile su PopuLive. Puoi già farci check-in.`);
      loadVenues();
    } else {
      window.alert('Qualcosa è andato storto — riprova.');
    }
  }

  if (historicalVenueId) {
    return (
      <div className="pl-sheet">
        <div className="pl-sheet-close" onClick={() => setHistoricalVenueId(null)} style={{ marginBottom: 4 }}>‹ Torna alla mappa</div>
        <HistoricalBoard venueId={historicalVenueId} currentUserId={currentUserId} onClose={onClose} />
      </div>
    );
  }

  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onClose}>Chiudi ✕</div>
      <h3>Sfoglia i locali</h3>
      <p className="pl-hint" style={{ marginBottom: 10 }}>
        <span style={{ color: 'var(--cyan)' }}>●</span> Network ufficiale — affluenza reale e bacheca storica &nbsp;
        <span style={{ color: 'var(--teak)' }}>●</span> Non ancora ufficiale — puoi attivarlo tu
      </p>

      {loading && <p className="pl-hint">Caricamento…</p>}

      {!loading && (
        <div style={{ height: 380, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(228,212,200,0.14)', marginBottom: 10 }}>
          <MapContainer center={ROME_CENTER} zoom={12} style={{ height: '100%', width: '100%', background: '#171717' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap &copy; CARTO'
            />

            {venues.map((v) => (
              <Marker
                key={v.venueId}
                position={[v.latitude, v.longitude]}
                icon={v.isPartner ? VERIFIED_ICON : UNVERIFIED_ICON}
              >
                <Popup>
                  <VenuePopup
                    venue={v}
                    onSeeHistory={() => setHistoricalVenueId(v.venueId)}
                    onCreateUnofficial={() => createUnofficialCopy(v)}
                  />
                </Popup>
              </Marker>
            ))}

            {newPinCoords && (
              <Marker position={newPinCoords} icon={NEW_PIN_ICON} />
            )}

            {placingPin && <MapClickCatcher onPick={(coords) => setNewPinCoords(coords)} />}
          </MapContainer>
        </div>
      )}

      {!placingPin && !newPinCoords && (
        <button
          onClick={() => setPlacingPin(true)}
          style={{ width: '100%', padding: 12, borderRadius: 14, border: '1px dashed rgba(228,212,200,0.3)', background: 'transparent', color: 'var(--teak)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          + Aggiungi un locale non presente sulla mappa
        </button>
      )}
      {placingPin && !newPinCoords && (
        <p className="pl-hint" style={{ textAlign: 'center' }}>Tocca la mappa nel punto giusto…</p>
      )}
      {newPinCoords && (
        <NewVenueForm
          coords={newPinCoords}
          onCancel={() => { setNewPinCoords(null); setPlacingPin(false); }}
          onCreated={() => { setNewPinCoords(null); setPlacingPin(false); loadVenues(); }}
        />
      )}
    </div>
  );
}

function MapClickCatcher({ onPick }) {
  useMapEvents({
    click(e) { onPick([e.latlng.lat, e.latlng.lng]); },
  });
  return null;
}

function VenuePopup({ venue, onSeeHistory, onCreateUnofficial }) {
  return (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{venue.name}</div>
      <div style={{ fontSize: 10.5, color: '#888', marginBottom: 8 }}>{VENUE_TYPE_LABELS[venue.venueType] || venue.venueType}</div>

      {venue.isPartner ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0EA5C4', marginBottom: 4 }}>✓ Verificato</div>
          <div style={{ fontSize: 11, marginBottom: 8 }}>{venue.checkinCount} check-in stasera</div>
          <button onClick={onSeeHistory} style={popupBtnStyle}>Chi c'era negli ultimi giorni</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 10.5, color: '#999', marginBottom: 8 }}>Non ancora nel network ufficiale.</div>
          <button onClick={onCreateUnofficial} style={popupBtnStyle}>Crea versione PopuLive non ufficiale</button>
        </>
      )}
    </div>
  );
}

function NewVenueForm({ coords, onCancel, onCreated }) {
  const [name, setName] = useState('');
  const [venueType, setVenueType] = useState('cocktail_bar');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/venues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, latitude: coords[0], longitude: coords[1], venueType }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated();
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome del locale" />
      <select value={venueType} onChange={(e) => setVenueType(e.target.value)}>
        {Object.entries(VENUE_TYPE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="pl-send-btn" onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'Un attimo…' : 'Crea locale'}
        </button>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
          Annulla
        </button>
      </div>
    </div>
  );
}

const popupBtnStyle = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 8,
  border: 'none',
  background: '#2FD3E8',
  color: '#0D0D0D',
  fontSize: 10.5,
  fontWeight: 700,
  cursor: 'pointer',
};

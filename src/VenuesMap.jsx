import { useState, useEffect, useRef, useCallback } from 'react';
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
 * NOTA TECNICA: usa Leaflet DIRETTO (non il "ponte" react-leaflet
 * usato in un primo tentativo) — react-leaflet ha dato una
 * schermata completamente nera, sintomo tipico di un mancato
 * avvio della mappa per un problema di compatibilità con la
 * versione di React. Leaflet diretto è più diretto da controllare
 * e meno soggetto a questo tipo di intoppi.
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

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const newPinMarkerRef = useRef(null);
  const placingPinRef = useRef(false);

  const loadVenues = useCallback(() => {
    apiFetch('/api/venues/map')
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenues(data.venues); })
      .finally(() => setLoading(false));
  }, []);

  const createUnofficialCopy = useCallback(async (venue) => {
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
  }, [loadVenues]);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  // Teniamo un rif sempre aggiornato di "sto piazzando un puntino
  // nuovo" — l'ascoltatore del click sulla mappa viene creato UNA
  // volta sola (vedi sotto) e leggerebbe altrimenti sempre il
  // valore vecchio di placingPin per via delle closure di React.
  useEffect(() => { placingPinRef.current = placingPin; }, [placingPin]);

  // Inizializzazione della mappa — UNA SOLA VOLTA, in modo diretto
  // e imperativo (niente "ponte" React in mezzo che potrebbe
  // rompersi con qualche versione).
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: ROME_CENTER,
      zoom: 12,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      if (placingPinRef.current) {
        setNewPinCoords([e.latlng.lat, e.latlng.lng]);
      }
    });

    // Il contenitore potrebbe non avere ancora le sue dimensioni
    // finali nel momento esatto in cui la mappa si inizializza
    // (siamo dentro un foglio che si apre dal basso) — un piccolo
    // ritardo e un invalidateSize() risolvono senza che l'utente
    // debba fare nulla lui stesso.
    setTimeout(() => map.invalidateSize(), 250);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Disegniamo i puntini ogni volta che cambia l'elenco locali.
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();

    venues.forEach((v) => {
      const marker = L.marker([v.latitude, v.longitude], {
        icon: v.isPartner ? VERIFIED_ICON : UNVERIFIED_ICON,
      });

      const popupContent = document.createElement('div');
      popupContent.style.minWidth = '160px';

      const title = document.createElement('div');
      title.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:2px;';
      title.textContent = v.name;
      popupContent.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'font-size:10.5px;color:#888;margin-bottom:8px;';
      subtitle.textContent = VENUE_TYPE_LABELS[v.venueType] || v.venueType;
      popupContent.appendChild(subtitle);

      if (v.isPartner) {
        const badge = document.createElement('div');
        badge.style.cssText = 'font-size:11px;font-weight:700;color:#0EA5C4;margin-bottom:4px;';
        badge.textContent = '✓ Verificato';
        popupContent.appendChild(badge);

        const stat = document.createElement('div');
        stat.style.cssText = 'font-size:11px;margin-bottom:8px;';
        stat.textContent = `${v.checkinCount} check-in stasera`;
        popupContent.appendChild(stat);

        const btn = document.createElement('button');
        btn.textContent = "Chi c'era negli ultimi giorni";
        btn.style.cssText = 'width:100%;padding:7px 10px;border-radius:8px;border:none;background:#2FD3E8;color:#0D0D0D;font-size:10.5px;font-weight:700;cursor:pointer;';
        btn.onclick = () => setHistoricalVenueId(v.venueId);
        popupContent.appendChild(btn);
      } else {
        const notice = document.createElement('div');
        notice.style.cssText = 'font-size:10.5px;color:#999;margin-bottom:8px;';
        notice.textContent = 'Non ancora nel network ufficiale.';
        popupContent.appendChild(notice);

        const btn = document.createElement('button');
        btn.textContent = 'Crea versione PopuLive non ufficiale';
        btn.style.cssText = 'width:100%;padding:7px 10px;border-radius:8px;border:none;background:#2FD3E8;color:#0D0D0D;font-size:10.5px;font-weight:700;cursor:pointer;';
        btn.onclick = () => createUnofficialCopy(v);
        popupContent.appendChild(btn);
      }

      marker.bindPopup(popupContent);
      marker.addTo(markersLayerRef.current);
    });
  }, [venues, createUnofficialCopy]);

  // Il puntino provvisorio del nuovo locale che si sta creando.
  useEffect(() => {
    if (!mapRef.current) return;
    if (newPinMarkerRef.current) {
      mapRef.current.removeLayer(newPinMarkerRef.current);
      newPinMarkerRef.current = null;
    }
    if (newPinCoords) {
      newPinMarkerRef.current = L.marker(newPinCoords, { icon: NEW_PIN_ICON }).addTo(mapRef.current);
    }
  }, [newPinCoords]);

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

      <div
        className="pl-map-dark-wrap"
        ref={mapContainerRef}
        style={{ height: 380, width: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(228,212,200,0.14)', marginBottom: 10, background: '#3a3a3a' }}
      />

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

import { useState, useRef, useEffect } from 'react';

/**
 * ============================================================
 * TENDINA LOCALI CON RICERCA VERA (26/8, richiesta esplicita)
 * ============================================================
 * Sostituisce una <select> nativa del browser — su mobile, quella
 * apre la selezione di sistema del telefono, che si limita a
 * elencare le opzioni così come sono scritte nel codice, senza
 * nessun modo di digitare per cercare. Con 410 locali NON in ordine
 * alfabetico, trovarne uno specifico costringe a leggerli tutti con
 * attenzione, senza sapere quando può saltare fuori quello giusto.
 *
 * Questo componente:
 *   - Ordina SEMPRE i locali alfabeticamente (aiuta anche solo
 *     scorrendo, prima ancora di scrivere qualcosa).
 *   - Permette di scrivere per filtrare in tempo reale per nome.
 *   - Supporta opzioni extra in fondo alla lista (es. "+ Inserisci
 *     manualmente…"), per i casi che ne hanno bisogno.
 * ============================================================
 */
export default function VenueSearchSelect({ venues, value, onChange, placeholder = 'Scegli un locale…', extraOptions = [] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const sortedVenues = [...venues].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const filtered = query.trim()
    ? sortedVenues.filter((v) => v.name.toLowerCase().includes(query.trim().toLowerCase()))
    : sortedVenues;

  const selectedVenue = venues.find((v) => v.venueId === value);
  const selectedExtra = extraOptions.find((o) => o.value === value);
  const displayValue = selectedExtra
    ? selectedExtra.label
    : selectedVenue
      ? `${selectedVenue.name}${selectedVenue.isPartner ? ' · partner' : ''}`
      : '';

  // Chiude la tendina toccando/cliccando fuori — normale
  // comportamento atteso per un menu a comparsa come questo.
  useEffect(() => {
    function handleOutsideClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  function handlePick(venueId) {
    onChange(venueId);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginBottom: 14 }}>
      <input
        type="text"
        value={open ? query : displayValue}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            maxHeight: 260, overflowY: 'auto', background: 'var(--surface)',
            border: '1px solid rgba(228,212,200,0.16)', borderRadius: 12, marginTop: 4,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              Nessun locale trovato
            </div>
          )}
          {filtered.map((v) => (
            <div
              key={v.venueId}
              onClick={() => handlePick(v.venueId)}
              style={{
                padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                borderBottom: '1px solid rgba(228,212,200,0.08)',
              }}
            >
              {v.name}{v.isPartner ? ' · partner' : ''}
            </div>
          ))}
          {extraOptions.map((o) => (
            <div
              key={o.value}
              onClick={() => handlePick(o.value)}
              style={{ padding: '10px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--cyan)', fontWeight: 600 }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

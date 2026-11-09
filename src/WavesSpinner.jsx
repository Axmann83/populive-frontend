/**
 * ============================================================
 * POPULIVE — ONDE DEL LOGO COME CARICAMENTO (M2, novembre 2026)
 * ============================================================
 * Al posto delle scritte "Caricamento…" e "Un attimo…": il pallino
 * e le tre onde del logo (stessa geometria dello splash e di
 * ReloadLoader.jsx) che pulsano. Le onde partono dal pallino come
 * il segnale del radar, quindi parlano la lingua dell'app.
 *
 *   <WavesSpinner />                    caricamento di una schermata:
 *                                       al centro, con un po' d'aria
 *   <WavesSpinner label="Caricamento della foto…" size="sm" />
 *   <WavesSpinner size="sm" inline />   dentro un bottone, al posto
 *                                       del testo; prende il colore
 *                                       del testo del bottone
 *
 * size: 'sm' | 'md' | 'lg' (o un numero, la scala). Con le
 * animazioni ridotte del telefono le onde restano ferme.
 * ============================================================
 */
// sm = 0.65: a 0.5 dentro un bottone le onde quasi non si vedevano (provato il 09/11).
const SCALES = { sm: 0.65, md: 1, lg: 1.6 };

export default function WavesSpinner({ size = 'md', label, inline = false, style }) {
  const scale = typeof size === 'number' ? size : SCALES[size] || 1;
  // Disegno originale: 40 × 20 px di onde sopra un pallino di 7 px,
  // ancorati a un punto; qui un riquadro con un filo di margine.
  const width = Math.round(44 * scale);
  const height = Math.round(24 * scale);
  // Sotto la misura piena il bordo delle onde resta leggibile.
  const border = Math.max(1.6, 1.2 / scale);

  return (
    <span
      role="status"
      aria-label={label || 'Caricamento'}
      className={`pl-waves-spinner ${inline ? 'pl-waves-spinner-inline' : ''}`}
      style={style}
    >
      <span className="pl-waves-spinner-box" style={{ width, height }} aria-hidden="true">
        <span
          className="pl-waves-spinner-anchor"
          style={{
            top: 15 * scale,
            transform: `scale(${scale})`,
            '--pl-waves-border': `${border}px`,
          }}
        >
          <span className="pl-waves-spinner-node"></span>
          <span className="pl-waves-spinner-waves">
            <span className="pl-waves-spinner-arc"></span>
            <span className="pl-waves-spinner-arc"></span>
            <span className="pl-waves-spinner-arc"></span>
          </span>
        </span>
      </span>
      {label && <span className="pl-waves-spinner-label">{label}</span>}
    </span>
  );
}

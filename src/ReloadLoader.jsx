/**
 * ============================================================
 * POPULIVE — SOLO ONDE (ricaricamento, non apertura vera)
 * ============================================================
 * L'animazione completa del logo (SplashScreen.jsx) resta riservata
 * a quando l'app viene DAVVERO chiusa e riaperta — un semplice
 * ricaricamento della pagina non merita la stessa cerimonia, ma
 * nemmeno uno schermo vuoto e muto. Qui restano solo le onde che
 * pulsano, stessa identica geometria e classi CSS del logo intero,
 * senza però il testo "PopuLive" sopra.
 *
 * Sparisce non appena l'app è pronta — nessun tempo minimo finto,
 * a differenza dello splash completo (che invece resta a schermo
 * almeno 3 secondi per non "lampeggiare via" su connessioni veloci,
 * una cerimonia che qui non serve).
 * ============================================================
 */
export default function ReloadLoader({ fadingOut, onExited }) {
  return (
    <div
      className={`pl-splash pl-reload-loader ${fadingOut ? 'pl-splash-out' : ''}`}
      onTransitionEnd={() => { if (fadingOut) onExited?.(); }}
    >
      <div style={{ position: 'relative', width: 1, height: 1 }}>
        <span className="pl-splash-antenna-node"></span>
        <span className="pl-splash-waves">
          <span className="pl-splash-wave-arc"></span>
          <span className="pl-splash-wave-arc"></span>
          <span className="pl-splash-wave-arc"></span>
        </span>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * POPULIVE — SCHERMATA DI APERTURA (splash)
 * ============================================================
 * Traduzione ESATTA in React del file HTML che avevamo confermato
 * e salvato insieme (populive-splash-animation.html) — stessi
 * identici valori, nessuna variazione. Sfuma via quando l'app è
 * DAVVERO pronta, non dopo un timer finto: App.jsx passa
 * `fadingOut` quando il controllo della sessione è finito, e
 * questo componente avvisa (onExited) quando può essere rimosso.
 * ============================================================
 */
export default function SplashScreen({ fadingOut, onExited }) {
  return (
    <div
      className={`pl-splash ${fadingOut ? 'pl-splash-out' : ''}`}
      onTransitionEnd={() => { if (fadingOut) onExited?.(); }}
    >
      <div className="pl-splash-wordmark-wrap">
        <div className="pl-splash-wordmark">
          Popu<span className="pl-splash-live">L<span style={{ position: 'relative' }}>ı
            <span className="pl-splash-antenna-node"></span>
            <span className="pl-splash-waves">
              <span className="pl-splash-wave-arc"></span>
              <span className="pl-splash-wave-arc"></span>
              <span className="pl-splash-wave-arc"></span>
            </span>
          </span><span style={{ marginLeft: 1 }}>ve</span></span>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * POPULIVE — SCHERMATA DI APERTURA (splash)
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
          </span><span style={{ marginLeft: 3 }}>ve</span></span>
        </div>
      </div>
    </div>
  );
}

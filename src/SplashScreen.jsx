/**
 * ============================================================
 * POPULIVE — SCHERMATA DI APERTURA (splash)
 * ============================================================
 * Stessa identica animazione che avevamo perfezionato insieme
 * (antenna sulla "i" di Live, onde che si irradiano verso l'alto)
 * — qui diventa un vero componente React, con un solo compito in
 * più: sfumare via quando l'app è DAVVERO pronta, non dopo un
 * timer finto. App.jsx le passa `fadingOut` quando il controllo
 * della sessione è finito; questo componente gestisce solo la
 * transizione visiva e avvisa quando può essere rimosso del tutto.
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
          </span><span style={{ marginLeft: -10 }}>ve</span></span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { apiFetch } from './apiClient';
import { Target, Wallet, Settings as SettingsIcon } from './PopuLiveIcons';

/**
 * ============================================================
 * POPULIVE — DASHBOARD FOUNDER
 * ============================================================
 * Raggiungibile solo su /dashboard, dentro la STESSA app (stesso
 * login, stesso stile, stesso database) — nessun progetto separato
 * da costruire e mantenere. Il controllo VERO se la persona sia
 * davvero un founder avviene qui, chiamando il server (che a sua
 * volta verifica il braccialetto founder nel database) — mai un
 * controllo solo "nascosto" lato interfaccia.
 *
 * Tre sezioni, come deciso:
 *   1) Missioni — crea missioni sponsorizzate + genera il QR
 *   2) Commissioni — quanto deve ricevere ogni locale
 *   3) Funzionalità — interruttori on/off per l'app "lite"
 * ============================================================
 */
export default function Dashboard({ userId }) {
  const [accessState, setAccessState] = useState('checking'); // checking | denied | granted
  const [activeSection, setActiveSection] = useState('missioni');

  useEffect(() => {
    apiFetch('/api/auth/is-architect')
      .then((r) => r.json())
      .then((data) => setAccessState(data.success && data.isArchitect ? 'granted' : 'denied'))
      .catch(() => setAccessState('denied'));
  }, []);

  function goHome() {
    window.history.pushState(null, '', '/');
    window.location.reload();
  }

  if (accessState === 'checking') {
    return (
      <div className="pl-app-shell">
        <div className="pl-content" style={{ paddingTop: 40, textAlign: 'center' }}>
          <p className="pl-hint">Verifica in corso…</p>
        </div>
      </div>
    );
  }

  if (accessState === 'denied') {
    return (
      <div className="pl-app-shell">
        <div className="pl-content" style={{ paddingTop: 60, textAlign: 'center' }}>
          <h2>Accesso riservato</h2>
          <p className="pl-hint" style={{ marginBottom: 20 }}>
            Questa sezione è visibile solo agli Architetti di PopuLive.
          </p>
          <button className="pl-send-btn" onClick={goHome}>Torna all'app</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-app-shell">
      <div className="pl-top-bar">
        <div className="pl-brand">Popu<span className="pl-brand-live">Live</span> <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>· Dashboard</span></div>
        <button
          onClick={goHome}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11.5, cursor: 'pointer' }}
        >
          Esci
        </button>
      </div>

      <div className="pl-content">
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <SectionTab icon={Target} label="Missioni" active={activeSection === 'missioni'} onClick={() => setActiveSection('missioni')} />
          <SectionTab icon={Wallet} label="Commissioni" active={activeSection === 'commissioni'} onClick={() => setActiveSection('commissioni')} />
          <SectionTab icon={SettingsIcon} label="Funzionalità" active={activeSection === 'funzionalita'} onClick={() => setActiveSection('funzionalita')} />
        </div>

        {activeSection === 'missioni' && (
          <p className="pl-hint">Modulo creazione missioni — in arrivo.</p>
        )}
        {activeSection === 'commissioni' && (
          <p className="pl-hint">Report commissioni per locale — in arrivo.</p>
        )}
        {activeSection === 'funzionalita' && (
          <p className="pl-hint">Interruttori funzionalità — in arrivo.</p>
        )}
      </div>
    </div>
  );
}

function SectionTab({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '10px 6px', borderRadius: 12,
        border: active ? '1px solid var(--cyan)' : '1px solid rgba(228,212,200,0.14)',
        background: active ? 'rgba(47,211,232,0.12)' : 'var(--surface)',
        color: active ? 'var(--cyan)' : 'var(--text-muted)',
        cursor: 'pointer',
      }}
    >
      <Icon size={17} />
      <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

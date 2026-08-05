import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './apiClient';
import { Target, Wallet, Settings as SettingsIcon, TrendingUp, Coins } from './PopuLiveIcons';

/**
 * ============================================================
 * POPULIVE — DASHBOARD FOUNDER
 * ============================================================
 * Raggiungibile solo su /dashboard, dentro la STESSA app (stesso
 * login, stesso stile, stesso database) — nessun progetto separato
 * da costruire e mantenere. Il controllo VERO se la persona sia
 * davvero un Architetto avviene qui, chiamando il server (che a
 * sua volta verifica la tabella architects nel database) — mai un
 * controllo solo "nascosto" lato interfaccia.
 *
 * Quattro sezioni:
 *   1) Missioni — crea missioni sponsorizzate + genera il QR
 *   2) Commissioni — quanto deve ricevere ogni locale
 *   3) Locali — metriche da mostrare ai proprietari (orari di
 *      punta, permanenza media, rapporto uomini/donne, ecc.) per
 *      rendere più attraente l'offerta di diventare partner
 *   4) Funzionalità — interruttori on/off per l'app "lite"
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
        <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
          <SectionTab icon={Target} label="Missioni" active={activeSection === 'missioni'} onClick={() => setActiveSection('missioni')} />
          <SectionTab icon={Wallet} label="Commissioni" active={activeSection === 'commissioni'} onClick={() => setActiveSection('commissioni')} />
          <SectionTab icon={TrendingUp} label="Locali" active={activeSection === 'locali'} onClick={() => setActiveSection('locali')} />
          <SectionTab icon={Coins} label="Prezzi" active={activeSection === 'prezzi'} onClick={() => setActiveSection('prezzi')} />
          <SectionTab icon={SettingsIcon} label="Funzioni" active={activeSection === 'funzionalita'} onClick={() => setActiveSection('funzionalita')} />
        </div>

        {activeSection === 'missioni' && (
          <p className="pl-hint">Modulo creazione missioni — in arrivo.</p>
        )}
        {activeSection === 'commissioni' && (
          <p className="pl-hint">Report commissioni per locale — in arrivo.</p>
        )}
        {activeSection === 'locali' && <VenueMetricsSection />}
        {activeSection === 'prezzi' && <PricingSection />}
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
        padding: '10px 4px', borderRadius: 12,
        border: active ? '1px solid var(--cyan)' : '1px solid rgba(228,212,200,0.14)',
        background: active ? 'rgba(47,211,232,0.12)' : 'var(--surface)',
        color: active ? 'var(--cyan)' : 'var(--text-muted)',
        cursor: 'pointer',
      }}
    >
      <Icon size={16} />
      <span style={{ fontSize: 9.5, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

/**
 * ============================================================
 * SEZIONE "LOCALI" — metriche da mostrare ai proprietari per
 * rendere più attraente l'offerta di diventare partner. Ultimi
 * 30 giorni di default, un locale alla volta.
 * ============================================================
 */
function VenueMetricsSection() {
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/venues/map')
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenues(data.venues); });
  }, []);

  const loadReport = useCallback((venueId) => {
    if (!venueId) return;
    setLoading(true);
    apiFetch(`/api/dashboard/venue-report/${venueId}`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setReport(data.report); })
      .finally(() => setLoading(false));
  }, []);

  function handleSelect(e) {
    const id = e.target.value;
    setSelectedVenueId(id);
    setReport(null);
    loadReport(id);
  }

  return (
    <div>
      <p className="pl-hint" style={{ marginBottom: 12 }}>
        Dati aggregati degli ultimi 30 giorni — pensati per essere mostrati ai proprietari, mai singoli profili individuali.
      </p>

      <select value={selectedVenueId} onChange={handleSelect} style={{ marginBottom: 14 }}>
        <option value="">Scegli un locale…</option>
        {venues.map((v) => (
          <option key={v.venueId} value={v.venueId}>{v.name}{v.isPartner ? ' · partner' : ''}</option>
        ))}
      </select>

      {loading && <p className="pl-hint">Caricamento…</p>}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MetricCard title="Orari di arrivo">
            {report.arrivals.available ? (
              <BarList
                items={report.arrivals.distribution.map((d) => ({ label: `${d.hour}:00`, value: parseInt(d.arrivals) }))}
                suffix=" arrivi"
              />
            ) : (
              <NotEnoughData minRequired={report.arrivals.minRequired} />
            )}
          </MetricCard>

          <MetricCard title="Permanenza media">
            {report.dwellTime.available ? (
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", color: 'var(--cyan)' }}>
                {report.dwellTime.avgMinutes} min
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>
                  su {report.dwellTime.sampleSize} persone
                </span>
              </div>
            ) : (
              <NotEnoughData minRequired={report.dwellTime.minRequired} />
            )}
          </MetricCard>

          <MetricCard title="Uomini / donne per serata">
            {report.attendance.trend.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {report.attendance.trend.map((day) => {
                  const male = parseInt(day.male_attendees) || 0;
                  const female = parseInt(day.female_attendees) || 0;
                  const other = parseInt(day.other_attendees) || 0;
                  const shared = male + female + other;
                  return (
                    <div key={day.session_date} style={{ fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{new Date(day.session_date).toLocaleDateString('it-IT')}</span>
                        <span>{day.attendees} presenze</span>
                      </div>
                      {shared > 0 && (
                        <div style={{ display: 'flex', height: 4, borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ background: 'var(--teak)', width: `${Math.round((female / shared) * 100)}%` }} />
                          <div style={{ background: 'var(--cyan)', width: `${Math.round((male / shared) * 100)}%` }} />
                          {other > 0 && <div style={{ background: 'var(--gold-medal, #E8C77E)', width: `${Math.round((other / shared) * 100)}%` }} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="pl-hint">Ancora nessun dato in questo intervallo.</p>
            )}
          </MetricCard>

          <MetricCard title="Consumazioni più richieste">
            {report.drinks.available ? (
              <BarList
                items={report.drinks.drinks.map((d) => ({ label: d.drink_type, value: parseInt(d.redemptions) }))}
                suffix=" riscatti"
              />
            ) : (
              <NotEnoughData minRequired={report.drinks.minRequired} />
            )}
          </MetricCard>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 14, padding: 14, boxShadow: 'var(--shadow-sm)' }}>
      <div className="pl-section-label" style={{ margin: '0 0 8px' }}>{title}</div>
      {children}
    </div>
  );
}

function BarList({ items, suffix }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
            <span>{item.label}</span>
            <span style={{ color: 'var(--text-muted)' }}>{item.value}{suffix}</span>
          </div>
          <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(item.value / max) * 100}%`, background: 'var(--cyan)', borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotEnoughData({ minRequired }) {
  return (
    <p className="pl-hint">
      Non ancora abbastanza dati per questo grafico (servono almeno {minRequired} eventi) — normale per un locale appena partito.
    </p>
  );
}

/**
 * ============================================================
 * SEZIONE "PREZZI" — il prezzo di ogni prodotto resta UNICO per
 * tutta la piattaforma (un Pulse non è legato a un locale
 * specifico, altrimenti perderebbe il senso di "spendibile
 * ovunque") — ma gli Architetti possono cambiarlo qui quando
 * cambiano gli accordi coi locali partner, invece di un valore
 * fisso scritto nel codice che potrebbe non riflettere più la
 * realtà (es. se i locali attuali offrono solo consumazioni fino
 * a 10€, non avrebbe senso vendere un Pulse singolo a 6,99€ come
 * capitava con il valore di partenza).
 * ============================================================
 */
function PricingSection() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({}); // { [productId]: "12.50" } — valore in EURO mentre si scrive, convertito solo al salvataggio
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    apiFetch('/api/products')
      .then((r) => r.json())
      .then((data) => { if (data.success) setProducts(data.products); })
      .finally(() => setLoading(false));
  }, []);

  async function savePrice(product) {
    const raw = edits[product.id];
    const euros = parseFloat((raw ?? '').replace(',', '.'));
    if (!Number.isFinite(euros) || euros <= 0) {
      window.alert('Inserisci un prezzo valido, maggiore di zero.');
      return;
    }
    const priceCents = Math.round(euros * 100);

    setSavingId(product.id);
    try {
      const res = await apiFetch(`/api/dashboard/products/${product.id}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceCents }),
      });
      const data = await res.json();
      if (data.success) {
        setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, price_cents: priceCents } : p)));
        setSavedId(product.id);
        setTimeout(() => setSavedId(null), 2000);
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="pl-hint">Caricamento…</p>;

  return (
    <div>
      <p className="pl-hint" style={{ marginBottom: 12 }}>
        Il prezzo resta unico per tutta la piattaforma (un Pulse è spendibile in qualunque locale) — cambialo qui quando gli accordi coi locali partner cambiano.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {products.map((p) => {
          const currentEuros = (p.price_cents / 100).toFixed(2);
          const editValue = edits[p.id] ?? currentEuros;
          const changed = editValue !== currentEuros;

          return (
            <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 14, padding: 12, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{p.display_name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>{p.sku}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    value={editValue}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    inputMode="decimal"
                    style={{ marginBottom: 0, paddingRight: 26 }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>€</span>
                </div>
                <button
                  onClick={() => savePrice(p)}
                  disabled={!changed || savingId === p.id}
                  style={{
                    padding: '10px 14px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, flexShrink: 0,
                    background: savedId === p.id ? 'rgba(47,211,232,0.3)' : 'var(--cyan)',
                    color: '#0D0D0D',
                    cursor: !changed || savingId === p.id ? 'default' : 'pointer',
                    opacity: !changed ? 0.5 : 1,
                  }}
                >
                  {savingId === p.id ? 'Un attimo…' : savedId === p.id ? 'Salvato ✓' : 'Salva'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

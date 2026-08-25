import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import QrScannerModal from './QrScannerModal';
import { apiFetch } from './apiClient';
import { Target, Settings as SettingsIcon, TrendingUp, Coins, Search, Armchair, Crown } from './PopuLiveIcons';
import LiveRanking from './LiveRanking';

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
        <div style={{ display: 'flex', gap: 5, marginBottom: 18, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          <SectionTab icon={Target} label="Missioni" active={activeSection === 'missioni'} onClick={() => setActiveSection('missioni')} />
          <SectionTab icon={Armchair} label="Serata" active={activeSection === 'organizza'} onClick={() => setActiveSection('organizza')} />
          <SectionTab icon={Crown} label="Classifiche" active={activeSection === 'classifiche'} onClick={() => setActiveSection('classifiche')} />
          <SectionTab icon={TrendingUp} label="Locali" active={activeSection === 'locali'} onClick={() => setActiveSection('locali')} />
          <SectionTab icon={Coins} label="Prezzi" active={activeSection === 'prezzi'} onClick={() => setActiveSection('prezzi')} />
          <SectionTab icon={Search} label="Persone" active={activeSection === 'persone'} onClick={() => setActiveSection('persone')} />
          <SectionTab icon={SettingsIcon} label="Funzioni" active={activeSection === 'funzionalita'} onClick={() => setActiveSection('funzionalita')} />
        </div>

        {activeSection === 'missioni' && <MissionsSection />}
        {activeSection === 'organizza' && <OrganizeNightSection />}
        {activeSection === 'classifiche' && <RankingsSection currentUserId={userId} />}
        {activeSection === 'persone' && (
          <>
            <PeopleSearchSection />
            <div style={{ height: 1, background: 'rgba(228,212,200,0.12)', margin: '24px 0' }} />
            <InstantInfluencerSection />
          </>
        )}
        {activeSection === 'locali' && <VenueMetricsSection />}
        {activeSection === 'prezzi' && <PricingSection />}
        {activeSection === 'funzionalita' && <FeatureFlagsSection />}
      </div>
    </div>
  );
}

function SectionTab({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, minWidth: 68, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '9px 8px', borderRadius: 12,
        border: active ? '1px solid var(--cyan)' : '1px solid rgba(228,212,200,0.14)',
        background: active ? 'rgba(255,61,110,0.12)' : 'var(--surface)',
        color: active ? 'var(--cyan)' : 'var(--text-muted)',
        cursor: 'pointer',
      }}
    >
      <Icon size={15} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 8.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

/**
 * ============================================================
 * SEZIONE "CLASSIFICHE" — la stessa classifica vera che vedono gli
 * utenti (riusa LiveRanking.jsx così com'è, nessuna logica
 * duplicata), utile per seguire i profili più interessanti in
 * ottica Instant Influencer. Due modalità:
 *   - Generale: sempre disponibile, nessuna selezione richiesta.
 *   - Locale: richiede un locale ATTUALMENTE attivo (arenaActive
 *     vero) — senza una serata in corso lì, non esiste nessuna
 *     classifica locale da vedere in tempo reale.
 * ============================================================
 */
function RankingsSection({ currentUserId }) {
  const [view, setView] = useState('generale'); // 'generale' | 'locale'
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');

  useEffect(() => {
    apiFetch('/api/venues/map')
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenues(data.venues); });
  }, []);

  const activeVenues = venues.filter((v) => v.arenaActive && v.arenaSessionId);
  const selectedVenue = activeVenues.find((v) => v.venueId === selectedVenueId);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setView('generale')}
          style={{
            padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            border: view === 'generale' ? '1.5px solid var(--cyan)' : '1.5px solid rgba(228,212,200,0.16)',
            background: view === 'generale' ? 'rgba(255,61,110,0.1)' : 'transparent',
            color: view === 'generale' ? 'var(--cyan)' : 'var(--text-muted)',
          }}
        >
          Generale
        </button>
        <button
          onClick={() => setView('locale')}
          style={{
            padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            border: view === 'locale' ? '1.5px solid var(--cyan)' : '1.5px solid rgba(228,212,200,0.16)',
            background: view === 'locale' ? 'rgba(255,61,110,0.1)' : 'transparent',
            color: view === 'locale' ? 'var(--cyan)' : 'var(--text-muted)',
          }}
        >
          Locale
        </button>
      </div>

      {view === 'generale' && (
        <LiveRanking isGlobal currentUserId={currentUserId} />
      )}

      {view === 'locale' && (
        <>
          <select
            value={selectedVenueId}
            onChange={(e) => setSelectedVenueId(e.target.value)}
            style={{ marginBottom: 14 }}
          >
            <option value="">Scegli un locale con una serata attiva ora…</option>
            {activeVenues.map((v) => (
              <option key={v.venueId} value={v.venueId}>{v.name}</option>
            ))}
          </select>

          {activeVenues.length === 0 && (
            <p className="pl-hint">Nessun locale ha una serata attiva in questo momento.</p>
          )}

          {selectedVenue && (
            <LiveRanking
              arenaSessionId={selectedVenue.arenaSessionId}
              venueId={selectedVenue.venueId}
              currentUserId={currentUserId}
            />
          )}
        </>
      )}
    </div>
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
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Unbounded',sans-serif", color: 'var(--cyan)' }}>
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

          <MetricCard title="Interazioni sociali generate">
            {report.socialInteractions.available ? (
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Unbounded',sans-serif", color: 'var(--cyan)' }}>
                  {report.socialInteractions.total}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {report.socialInteractions.likes} Like · {report.socialInteractions.superlikes} Superlike scambiati qui
                </div>
              </div>
            ) : (
              <NotEnoughData minRequired={report.socialInteractions.minRequired} />
            )}
          </MetricCard>

          <MetricCard title="Tasso di ritorno">
            {report.returnRate.available ? (
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Unbounded',sans-serif", color: 'var(--cyan)' }}>
                  {report.returnRate.returnRatePct}%
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {report.returnRate.returningVisitors} su {report.returnRate.totalVisitors} sono tornati almeno una seconda volta
                </div>
              </div>
            ) : (
              <NotEnoughData minRequired={report.returnRate.minRequired} />
            )}
          </MetricCard>

          <MetricCard title="Picco di presenze simultanee">
            {report.peakAttendance.available ? (
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Unbounded',sans-serif", color: 'var(--cyan)' }}>
                  {report.peakAttendance.allTimeHigh} persone
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  Picco più alto registrato · media {report.peakAttendance.avgPeakPerNight} persone a serata
                </div>
              </div>
            ) : (
              <NotEnoughData minRequired={report.peakAttendance.minRequired} />
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
                    background: savedId === p.id ? 'rgba(255,61,110,0.3)' : 'var(--cyan)',
                    color: '#fff',
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

/**
 * ============================================================
 * SEZIONE "MISSIONI" — crea missioni sponsorizzate e genera il
 * loro QR direttamente qui, invece di passare da Supabase a mano
 * + lo strumento HTML separato usato finora.
 * ============================================================
 */
const MISSION_LINK_BASE = 'https://populive-frontend-production.up.railway.app/mission/';

function MissionsSection() {
  const [venues, setVenues] = useState([]);
  const [missions, setMissions] = useState([]);
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newMissionQr, setNewMissionQr] = useState(null); // { missionId, qrDataUrl } — appena creata

  const [form, setForm] = useState({
    sponsorName: '', venueId: '', claimText: '', bonusPoints: '',
    radiusMeters: '2000', hashtagFilter: '', dateFrom: '', dateTo: '',
  });

  const loadMissions = useCallback(() => {
    setLoadingMissions(true);
    apiFetch('/api/dashboard/missions')
      .then((r) => r.json())
      .then((data) => { if (data.success) setMissions(data.missions); })
      .finally(() => setLoadingMissions(false));
  }, []);

  useEffect(() => {
    apiFetch('/api/venues/map')
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenues(data.venues); });
    loadMissions();
  }, [loadMissions]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function generateQrFor(missionId) {
    return QRCode.toDataURL(MISSION_LINK_BASE + missionId, {
      width: 300,
      color: { dark: '#14100F', light: '#ffffff' },
    });
  }

  async function handleCreate() {
    if (!form.sponsorName || !form.venueId || !form.claimText || !form.bonusPoints || !form.dateFrom || !form.dateTo) {
      window.alert('Compila almeno sponsor, locale, claim, punti e le due date.');
      return;
    }

    setCreating(true);
    try {
      const res = await apiFetch('/api/dashboard/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorName: form.sponsorName,
          venueId: form.venueId,
          claimText: form.claimText,
          bonusPoints: parseInt(form.bonusPoints, 10),
          radiusMeters: parseInt(form.radiusMeters, 10) || 2000,
          hashtagFilter: form.hashtagFilter.trim()
            ? form.hashtagFilter.split(',').map((h) => h.trim().replace(/^#/, '')).filter(Boolean)
            : null,
          dateFrom: form.dateFrom,
          dateTo: form.dateTo,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const qrDataUrl = await generateQrFor(data.missionId);
        setNewMissionQr({ missionId: data.missionId, qrDataUrl });
        setForm({ sponsorName: '', venueId: '', claimText: '', bonusPoints: '', radiusMeters: '2000', hashtagFilter: '', dateFrom: '', dateTo: '' });
        loadMissions();
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <MetricCard title="Crea una nuova missione">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input placeholder="Nome sponsor (es. Profumeria Bianchi)" value={form.sponsorName} onChange={(e) => updateField('sponsorName', e.target.value)} style={{ marginBottom: 0 }} />

          <select value={form.venueId} onChange={(e) => updateField('venueId', e.target.value)} style={{ marginBottom: 0 }}>
            <option value="">Scegli il locale…</option>
            {venues.map((v) => (
              <option key={v.venueId} value={v.venueId}>{v.name}</option>
            ))}
          </select>

          <textarea
            placeholder='Claim (es. "Recati oggi da Profumeria Bianchi per 30 punti")'
            value={form.claimText}
            onChange={(e) => updateField('claimText', e.target.value)}
            rows={2}
            style={{ marginBottom: 0, width: '100%', padding: 12, borderRadius: 10, border: '1px solid rgba(228,212,200,0.2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Punti bonus" type="number" value={form.bonusPoints} onChange={(e) => updateField('bonusPoints', e.target.value)} style={{ marginBottom: 0, flex: 1 }} />
            <input placeholder="Raggio in metri" type="number" value={form.radiusMeters} onChange={(e) => updateField('radiusMeters', e.target.value)} style={{ marginBottom: 0, flex: 1 }} />
          </div>

          <input placeholder="Hashtag (facoltativo, separati da virgola — es. beauty, cosmetics)" value={form.hashtagFilter} onChange={(e) => updateField('hashtagFilter', e.target.value)} style={{ marginBottom: 0 }} />

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Da</label>
              <input type="date" value={form.dateFrom} onChange={(e) => updateField('dateFrom', e.target.value)} style={{ marginBottom: 0 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>A</label>
              <input type="date" value={form.dateTo} onChange={(e) => updateField('dateTo', e.target.value)} style={{ marginBottom: 0 }} />
            </div>
          </div>

          <button className="pl-send-btn" onClick={handleCreate} disabled={creating} style={{ marginTop: 4 }}>
            {creating ? 'Un attimo…' : 'Crea missione e genera QR'}
          </button>
        </div>
      </MetricCard>

      {newMissionQr && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, marginTop: 12, textAlign: 'center' }}>
          <img src={newMissionQr.qrDataUrl} alt="QR missione" style={{ width: 220, height: 220 }} />
          <p style={{ fontSize: 10.5, color: '#666', marginTop: 8, wordBreak: 'break-all' }}>{MISSION_LINK_BASE}{newMissionQr.missionId}</p>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div className="pl-section-label" style={{ marginBottom: 10 }}>Missioni esistenti</div>
        {loadingMissions && <p className="pl-hint">Caricamento…</p>}
        {!loadingMissions && missions.length === 0 && <p className="pl-hint">Ancora nessuna missione creata.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {missions.map((m) => (
            <ExistingMissionRow key={m.missionId} mission={m} onGenerateQr={generateQrFor} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ExistingMissionRow({ mission, onGenerateQr }) {
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);

  async function toggleQr() {
    if (qrDataUrl) { setQrDataUrl(null); return; }
    setLoadingQr(true);
    setQrDataUrl(await onGenerateQr(mission.missionId));
    setLoadingQr(false);
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{mission.sponsorName}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{mission.venueName} · +{mission.bonusPoints} punti</div>
        </div>
        <button
          onClick={toggleQr}
          style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
        >
          {loadingQr ? '…' : qrDataUrl ? 'Nascondi QR' : 'Mostra QR'}
        </button>
      </div>
      {qrDataUrl && (
        <div style={{ background: '#fff', borderRadius: 10, padding: 14, marginTop: 10, textAlign: 'center' }}>
          <img src={qrDataUrl} alt="QR missione" style={{ width: 160, height: 160 }} />
        </div>
      )}
    </div>
  );
}

/**
 * ============================================================
 * SEZIONE "COMMISSIONI" — per ciascun locale partner, due campi
 * che si completano a vicenda (Locale % + PopuLive % = sempre
 * 100, mai possono disallinearsi) più il conto già fatto di
 * quanto spetta davvero al locale, in base ai Pulse riscattati
 * lì e al prezzo di riferimento attuale.
 * ============================================================
 */
/**
 * ============================================================
 * SEZIONE "SERATA" — pannello unico per preparare un locale prima
 * di una serata test: si sceglie (o si crea) il locale, poi si
 * vedono e modificano tutte le sue impostazioni in un posto solo
 * — commissioni, prezzi Pulse specifici, soglia Big Spender,
 * conferma spesa tavolo, orari Arena.
 * ============================================================
 */
const VENUE_TYPE_OPTIONS = [
  { value: 'nightclub', label: 'Discoteca' },
  { value: 'ristorante', label: 'Ristorante' },
  { value: 'cocktail_bar', label: 'Cocktail bar' },
  { value: 'palestra', label: 'Palestra' },
  { value: 'retail', label: 'Retail' },
];

function OrganizeNightSection() {
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [addingManually, setAddingManually] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueType, setNewVenueType] = useState('nightclub');
  const [creatingVenue, setCreatingVenue] = useState(false);

  const [venue, setVenue] = useState(null);
  const [loadingVenue, setLoadingVenue] = useState(false);

  useEffect(() => {
    apiFetch('/api/venues/map')
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenues(data.venues); });
  }, []);

  const loadVenue = useCallback((venueId) => {
    if (!venueId) { setVenue(null); return; }
    setLoadingVenue(true);
    apiFetch(`/api/dashboard/venues/${venueId}/full-settings`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setVenue(data.venue); })
      .finally(() => setLoadingVenue(false));
  }, []);

  function handleSelect(e) {
    const id = e.target.value;
    setSelectedVenueId(id);
    setAddingManually(false);
    loadVenue(id);
  }

  async function createVenue() {
    if (!newVenueName.trim()) {
      window.alert('Inserisci un nome per il locale.');
      return;
    }
    setCreatingVenue(true);
    try {
      // Coordinate di default (centro di Roma) — un locale aggiunto
      // qui è pensato principalmente per organizzare la serata, non
      // per la precisione sulla mappa; correggibile in seguito se
      // serve davvero mostrarlo nel punto esatto.
      const res = await apiFetch('/api/venues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newVenueName.trim(), area: 'Roma',
          latitude: 41.9028, longitude: 12.4964,
          venueType: newVenueType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const created = { venueId: data.venueId, name: newVenueName.trim(), isPartner: false };
        setVenues((prev) => [...prev, created]);
        setSelectedVenueId(data.venueId);
        setAddingManually(false);
        setNewVenueName('');
        loadVenue(data.venueId);
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setCreatingVenue(false);
    }
  }

  return (
    <div>
      <p className="pl-hint" style={{ marginBottom: 12 }}>
        Scegli un locale già presente, o aggiungine uno nuovo — poi trovi qui sotto tutte le sue impostazioni in un posto solo.
      </p>

      <select value={addingManually ? '__manual__' : selectedVenueId} onChange={(e) => {
        if (e.target.value === '__manual__') { setAddingManually(true); setSelectedVenueId(''); setVenue(null); }
        else handleSelect(e);
      }} style={{ marginBottom: 12 }}>
        <option value="">Scegli un locale…</option>
        {venues.map((v) => (
          <option key={v.venueId} value={v.venueId}>{v.name}{v.isPartner ? ' · partner' : ''}</option>
        ))}
        <option value="__manual__">+ Inserisci manualmente…</option>
      </select>

      {addingManually && (
        <MetricCard title="Nuovo locale">
          <input
            value={newVenueName}
            onChange={(e) => setNewVenueName(e.target.value)}
            placeholder="Nome del locale"
            style={{ marginBottom: 8 }}
          />
          <select value={newVenueType} onChange={(e) => setNewVenueType(e.target.value)} style={{ marginBottom: 10 }}>
            {VENUE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="pl-send-btn" onClick={createVenue} disabled={creatingVenue}>
            {creatingVenue ? 'Un attimo…' : 'Crea locale'}
          </button>
        </MetricCard>
      )}

      {loadingVenue && <p className="pl-hint">Caricamento…</p>}

      {venue && <VenueOrganizePanel venue={venue} onVenueUpdate={setVenue} />}
    </div>
  );
}

/**
 * Il pannello vero e proprio — tutte le impostazioni di UN locale,
 * ciascuna con il proprio salvataggio indipendente.
 */
function VenueOrganizePanel({ venue, onVenueUpdate }) {
  const [pctEdit, setPctEdit] = useState(String(venue.commissionVenuePct ?? 70));
  const [savingPct, setSavingPct] = useState(false);
  const [savedPct, setSavedPct] = useState(false);

  const [pulsePriceEdit, setPulsePriceEdit] = useState(venue.pulsePriceCents ? (venue.pulsePriceCents / 100).toString() : '');
  const [bundlePriceEdit, setBundlePriceEdit] = useState(venue.pulseBundle5PriceCents ? (venue.pulseBundle5PriceCents / 100).toString() : '');
  const [savingPrices, setSavingPrices] = useState(false);
  const [savedPrices, setSavedPrices] = useState(false);

  const [thresholdEdit, setThresholdEdit] = useState(venue.spendingThresholdCents ? (venue.spendingThresholdCents / 100).toString() : '');
  const [bonusEdit, setBonusEdit] = useState(venue.spendingBonusPoints ? String(venue.spendingBonusPoints) : '');
  const [savingSpending, setSavingSpending] = useState(false);
  const [savedSpending, setSavedSpending] = useState(false);

  const [tableCode, setTableCode] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [spentAmount, setSpentAmount] = useState('');
  const [confirmingSpend, setConfirmingSpend] = useState(false);
  const [spendResult, setSpendResult] = useState(null);

  const [openTime, setOpenTime] = useState(venue.defaultOpenTime || '');
  const [closeTime, setCloseTime] = useState(venue.defaultCloseTime || '');
  const [savingHours, setSavingHours] = useState(false);
  const [savedHours, setSavedHours] = useState(false);

  const [minUsersEdit, setMinUsersEdit] = useState(venue.minUsersForLocalRanking ? String(venue.minUsersForLocalRanking) : '5');
  const [savingMinUsers, setSavingMinUsers] = useState(false);
  const [savedMinUsers, setSavedMinUsers] = useState(false);

  // QR d'ingresso del locale — un solo codice per locale.
  const [venueQrDataUrl, setVenueQrDataUrl] = useState(null);
  const [generatingVenueQr, setGeneratingVenueQr] = useState(false);

  // QR tavoli — quanti servono cambia serata per serata, da qui il
  // campo quantità invece di generarli uno alla volta.
  const [tableQrCount, setTableQrCount] = useState('10');
  const [tableQrLabel, setTableQrLabel] = useState('Tavolo');
  const [tableQrs, setTableQrs] = useState(null); // [{ label, code, dataUrl }]
  const [generatingTableQrs, setGeneratingTableQrs] = useState(false);

  async function savePct() {
    const pct = parseInt(pctEdit, 10);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      window.alert('Inserisci una percentuale valida, tra 0 e 100.');
      return;
    }
    setSavingPct(true);
    try {
      const res = await apiFetch(`/api/dashboard/venues/${venue.venueId}/commission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionVenuePct: pct }),
      });
      const data = await res.json();
      if (data.success) {
        onVenueUpdate({ ...venue, commissionVenuePct: pct });
        setSavedPct(true);
        setTimeout(() => setSavedPct(false), 2000);
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSavingPct(false);
    }
  }

  async function savePrices() {
    const single = pulsePriceEdit.trim() ? Math.round(parseFloat(pulsePriceEdit.replace(',', '.')) * 100) : null;
    const bundle = bundlePriceEdit.trim() ? Math.round(parseFloat(bundlePriceEdit.replace(',', '.')) * 100) : null;
    setSavingPrices(true);
    try {
      const res = await apiFetch(`/api/dashboard/venues/${venue.venueId}/pulse-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ singlePriceCents: single, bundle5PriceCents: bundle }),
      });
      const data = await res.json();
      if (data.success) {
        onVenueUpdate({ ...venue, pulsePriceCents: single, pulseBundle5PriceCents: bundle });
        setSavedPrices(true);
        setTimeout(() => setSavedPrices(false), 2000);
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSavingPrices(false);
    }
  }

  async function saveSpendingConfig() {
    const thresholdEuros = parseFloat(thresholdEdit.replace(',', '.'));
    const points = parseInt(bonusEdit, 10);
    if (!Number.isFinite(thresholdEuros) || thresholdEuros <= 0 || !Number.isInteger(points) || points <= 0) {
      window.alert('Inserisci una soglia e un numero di punti validi, entrambi maggiori di zero.');
      return;
    }
    setSavingSpending(true);
    try {
      const res = await apiFetch(`/api/dashboard/venues/${venue.venueId}/spending-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholdCents: Math.round(thresholdEuros * 100), bonusPoints: points }),
      });
      const data = await res.json();
      if (data.success) {
        onVenueUpdate({ ...venue, spendingThresholdCents: Math.round(thresholdEuros * 100), spendingBonusPoints: points });
        setSavedSpending(true);
        setTimeout(() => setSavedSpending(false), 2000);
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSavingSpending(false);
    }
  }

  async function confirmSpending() {
    const amountEuros = parseFloat(spentAmount.replace(',', '.'));
    if (!tableCode.trim() || !Number.isFinite(amountEuros) || amountEuros <= 0) {
      window.alert('Inserisci il codice del tavolo e un importo speso valido.');
      return;
    }
    setConfirmingSpend(true);
    setSpendResult(null);
    try {
      const res = await apiFetch('/api/dashboard/award-table-spending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId: venue.venueId, tableQrCode: tableCode.trim(), spentCents: Math.round(amountEuros * 100) }),
      });
      const data = await res.json();
      if (data.success) {
        setSpendResult(`✓ Bonus assegnato a ${data.membersRewarded} persone (+${data.perPersonPoints} punti ciascuno)`);
        setTableCode('');
        setSpentAmount('');
      } else {
        const messages = {
          venue_has_no_spending_threshold_configured: 'Imposta prima soglia e punti bonus qui sopra.',
          below_threshold: 'L\'importo è sotto la soglia impostata per questo locale.',
          already_awarded_tonight: 'Questo tavolo ha già ricevuto il bonus stasera.',
          no_squad_found_for_table: 'Nessuno risulta agganciato a questo codice tavolo stasera.',
          no_active_session_tonight: 'Questo locale non ha un\'Arena attiva in questo momento.',
          big_spender_disabled: 'Il Big Spender è spento dalla scheda Funzionalità — riaccendilo da lì per confermare spese.',
        };
        setSpendResult(messages[data.reason] || 'Qualcosa è andato storto — riprova.');
      }
    } finally {
      setConfirmingSpend(false);
    }
  }

  async function saveHours() {
    if (!openTime || !closeTime) {
      window.alert('Inserisci sia l\'orario di apertura sia quello di chiusura.');
      return;
    }
    setSavingHours(true);
    try {
      const res = await apiFetch(`/api/dashboard/venues/${venue.venueId}/arena-hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openTime, closeTime }),
      });
      const data = await res.json();
      if (data.success) {
        onVenueUpdate({ ...venue, defaultOpenTime: openTime, defaultCloseTime: closeTime });
        setSavedHours(true);
        setTimeout(() => setSavedHours(false), 2000);
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSavingHours(false);
    }
  }

  async function saveMinUsers() {
    const n = parseInt(minUsersEdit, 10);
    if (!Number.isInteger(n) || n < 1) {
      window.alert('Inserisci un numero valido, almeno 1.');
      return;
    }
    setSavingMinUsers(true);
    try {
      const res = await apiFetch(`/api/dashboard/venues/${venue.venueId}/ranking-threshold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minUsers: n }),
      });
      const data = await res.json();
      if (data.success) {
        onVenueUpdate({ ...venue, minUsersForLocalRanking: n });
        setSavedMinUsers(true);
        setTimeout(() => setSavedMinUsers(false), 2000);
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSavingMinUsers(false);
    }
  }

  async function generateVenueQr() {
    setGeneratingVenueQr(true);
    try {
      const url = `https://populive-frontend-production.up.railway.app/checkin/${venue.venueId}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 300, color: { dark: '#14100F', light: '#ffffff' } });
      setVenueQrDataUrl(dataUrl);
    } finally {
      setGeneratingVenueQr(false);
    }
  }

  async function generateTableQrs() {
    const count = parseInt(tableQrCount, 10);
    if (!Number.isInteger(count) || count <= 0 || count > 200) {
      window.alert('Inserisci un numero di tavoli valido, tra 1 e 200.');
      return;
    }
    setGeneratingTableQrs(true);
    try {
      // Ogni codice è un semplice testo univoco (nessun link, il QR
      // dei tavoli non porta a nessuna pagina web — lo legge solo lo
      // scanner della dashboard) — legato al locale, così due locali
      // diversi non rischiano mai di avere lo stesso codice tavolo.
      const results = [];
      for (let i = 1; i <= count; i++) {
        const code = `tavolo_${venue.venueId}_${i}`;
        const label = `${tableQrLabel.trim() || 'Tavolo'} ${i}`;
        const dataUrl = await QRCode.toDataURL(code, { width: 220, color: { dark: '#14100F', light: '#ffffff' } });
        results.push({ label, code, dataUrl });
      }
      setTableQrs(results);
    } finally {
      setGeneratingTableQrs(false);
    }
  }

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MetricCard title={`${venue.venueName} — commissione`}>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 10 }}>
          {venue.redeemedCount} Pulse riscattati finora · {(venue.venueOwedCents / 100).toFixed(2)}€ dovuti al locale
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Locale %</label>
            <input type="number" min="0" max="100" value={pctEdit} onChange={(e) => setPctEdit(e.target.value)} style={{ marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>PopuLive %</label>
            <input value={100 - (parseInt(pctEdit, 10) || 0)} disabled style={{ marginBottom: 0, opacity: 0.6 }} />
          </div>
        </div>
        <button onClick={savePct} disabled={savingPct} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: savedPct ? 'rgba(255,61,110,0.3)' : 'var(--cyan)', color: '#fff', cursor: savingPct ? 'default' : 'pointer' }}>
          {savingPct ? 'Un attimo…' : savedPct ? 'Salvato ✓' : 'Salva percentuale'}
        </button>
      </MetricCard>

      <MetricCard title="Soglia classifica locale">
        <p className="pl-hint" style={{ marginBottom: 10 }}>
          Se ci sono meno persone connesse di questo numero, la classifica locale resta nascosta per non mostrare qualcuno da solo in cima (demotivante) — Radar, interazioni e punti funzionano comunque normalmente, e i punti contano sempre per la classifica generale.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Minimo persone</label>
            <input type="number" min="1" value={minUsersEdit} onChange={(e) => setMinUsersEdit(e.target.value)} style={{ marginBottom: 0 }} />
          </div>
        </div>
        <button onClick={saveMinUsers} disabled={savingMinUsers} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: savedMinUsers ? 'rgba(255,61,110,0.3)' : 'var(--cyan)', color: '#fff', cursor: savingMinUsers ? 'default' : 'pointer' }}>
          {savingMinUsers ? 'Un attimo…' : savedMinUsers ? 'Salvato ✓' : 'Salva soglia'}
        </button>
      </MetricCard>

      <MetricCard title="Prezzi Pulse di questo locale">
        <p className="pl-hint" style={{ marginBottom: 10 }}>
          Vuoti finché non li imposti — finché resta vuoto, l'acquisto non compare in app per questo locale. Da concordare con il proprietario.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Pulse singolo (€)</label>
            <input value={pulsePriceEdit} onChange={(e) => setPulsePriceEdit(e.target.value)} placeholder="non impostato" style={{ marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Pacchetto da 5 (€)</label>
            <input value={bundlePriceEdit} onChange={(e) => setBundlePriceEdit(e.target.value)} placeholder="non impostato" style={{ marginBottom: 0 }} />
          </div>
        </div>
        <button onClick={savePrices} disabled={savingPrices} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: savedPrices ? 'rgba(255,61,110,0.3)' : 'var(--cyan)', color: '#fff', cursor: savingPrices ? 'default' : 'pointer' }}>
          {savingPrices ? 'Un attimo…' : savedPrices ? 'Salvato ✓' : 'Salva prezzi'}
        </button>
      </MetricCard>

      <VenueDrinksSection venueId={venue.venueId} />

      <MetricCard title="Soglia Big Spender">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Soglia (€)</label>
            <input type="number" min="0" value={thresholdEdit} onChange={(e) => setThresholdEdit(e.target.value)} placeholder="es. 50" style={{ marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Punti bonus</label>
            <input type="number" min="0" value={bonusEdit} onChange={(e) => setBonusEdit(e.target.value)} placeholder="es. 20" style={{ marginBottom: 0 }} />
          </div>
        </div>
        <button onClick={saveSpendingConfig} disabled={savingSpending} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: savedSpending ? 'rgba(255,61,110,0.3)' : 'var(--cyan)', color: '#fff', cursor: savingSpending ? 'default' : 'pointer' }}>
          {savingSpending ? 'Un attimo…' : savedSpending ? 'Salvato ✓' : 'Salva soglia'}
        </button>
      </MetricCard>

      <MetricCard title="Conferma spesa tavolo">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={tableCode} onChange={(e) => setTableCode(e.target.value)} placeholder="Codice tavolo" style={{ marginBottom: 0, flex: 1 }} />
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            title="Inquadra il QR del tavolo"
            style={{ flexShrink: 0, width: 42, borderRadius: 10, border: '1px solid rgba(228,212,200,0.2)', background: 'var(--surface-2)', color: 'var(--teak)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            📷
          </button>
          <input type="number" min="0" value={spentAmount} onChange={(e) => setSpentAmount(e.target.value)} placeholder="Speso (€)" style={{ marginBottom: 0, flex: 1 }} />
        </div>
        <button onClick={confirmSpending} disabled={confirmingSpend} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: 'var(--cyan)', color: '#fff', cursor: confirmingSpend ? 'default' : 'pointer' }}>
          {confirmingSpend ? 'Un attimo…' : 'Conferma spesa'}
        </button>
        {spendResult && (
          <p style={{ fontSize: 10, color: spendResult.startsWith('✓') ? 'var(--cyan)' : '#E85D5D', marginTop: 8, marginBottom: 0 }}>{spendResult}</p>
        )}
      </MetricCard>

      {showScanner && (
        <QrScannerModal
          onScan={(text, error) => {
            setShowScanner(false);
            if (text) setTableCode(text);
            else if (error === 'camera_error') window.alert('Non riesco ad accedere alla fotocamera — controlla i permessi del browser, oppure inserisci il codice a mano.');
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      <MetricCard title="Orari Arena">
        <p className="pl-hint" style={{ marginBottom: 10 }}>
          Lascia vuoto per usare gli orari automatici della categoria del locale, oppure imposta orari personalizzati qui.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Apertura</label>
            <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} style={{ marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Chiusura</label>
            <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} style={{ marginBottom: 0 }} />
          </div>
        </div>
        <button onClick={saveHours} disabled={savingHours} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: savedHours ? 'rgba(255,61,110,0.3)' : 'var(--cyan)', color: '#fff', cursor: savingHours ? 'default' : 'pointer' }}>
          {savingHours ? 'Un attimo…' : savedHours ? 'Salvato ✓' : 'Salva orari'}
        </button>
      </MetricCard>

      <MetricCard title="QR d'ingresso del locale">
        <p className="pl-hint" style={{ marginBottom: 10 }}>
          Un solo QR per locale — chi lo scansiona fa il check-in nell'Arena.
        </p>
        <button onClick={generateVenueQr} disabled={generatingVenueQr} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: 'var(--cyan)', color: '#fff', cursor: generatingVenueQr ? 'default' : 'pointer' }}>
          {generatingVenueQr ? 'Un attimo…' : venueQrDataUrl ? 'Rigenera QR' : 'Genera QR'}
        </button>
        {venueQrDataUrl && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginTop: 10, textAlign: 'center' }}>
            <img src={venueQrDataUrl} alt="QR ingresso locale" style={{ width: 200, height: 200 }} />
          </div>
        )}
      </MetricCard>

      <MetricCard title="QR tavoli">
        <p className="pl-hint" style={{ marginBottom: 10 }}>
          Genera tutti i QR dei tavoli in una volta — quanti ne servono per stasera.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Etichetta</label>
            <input value={tableQrLabel} onChange={(e) => setTableQrLabel(e.target.value)} placeholder="Tavolo" style={{ marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Quanti</label>
            <input type="number" min="1" max="200" value={tableQrCount} onChange={(e) => setTableQrCount(e.target.value)} style={{ marginBottom: 0 }} />
          </div>
        </div>
        <button onClick={generateTableQrs} disabled={generatingTableQrs} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: 'var(--cyan)', color: '#fff', cursor: generatingTableQrs ? 'default' : 'pointer' }}>
          {generatingTableQrs ? 'Genero…' : tableQrs ? 'Rigenera tutti' : 'Genera QR tavoli'}
        </button>

        {tableQrs && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            {tableQrs.map((t) => (
              <div key={t.code} style={{ background: '#fff', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <img src={t.dataUrl} alt={t.label} style={{ width: '100%', maxWidth: 140 }} />
                <div style={{ fontSize: 10, color: '#333', fontWeight: 700, marginTop: 4 }}>{t.label}</div>
              </div>
            ))}
          </div>
        )}
      </MetricCard>
    </div>
  );
}

/**
 * ============================================================
 * SEZIONE "FUNZIONALITÀ" — interruttori on/off per le funzionalità
 * "extra" (mai per il cuore dell'app: Like/Superlike/Pulse/
 * classifiche/check-in restano sempre accesi). Pensata per offrire
 * un'app "lite" nelle prime serate test.
 * ============================================================
 */
function FeatureFlagsSection() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingKey, setTogglingKey] = useState(null);

  useEffect(() => {
    apiFetch('/api/feature-flags')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setFlags(Object.entries(data.flags).map(([key, isEnabled]) => ({ key, isEnabled })));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggle(flag) {
    setTogglingKey(flag.key);
    try {
      const res = await apiFetch(`/api/dashboard/feature-flags/${flag.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !flag.isEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, isEnabled: !f.isEnabled } : f)));
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setTogglingKey(null);
    }
  }

  const labels = {
    sponsored_missions: 'Missioni sponsorizzate',
    historical_board: 'Bacheca storica',
    venues_map: 'Mappa di tutti i locali',
    instant_influencer: 'Instant Influencer',
    pulse_standalone: 'Pulse anonimo (nessun contatto)',
    pulse_like: 'Pulse + Like (minigioco)',
    pulse_simple: 'Pulse (svela subito, senza Superlike)',
    pulse_super: 'Pulse + Superlike (svela subito, richiede un Superlike)',
    big_spender: 'Big Spender (soglia di spesa)',
  };

  if (loading) return <p className="pl-hint">Caricamento…</p>;

  return (
    <div>
      <p className="pl-hint" style={{ marginBottom: 12 }}>
        Spegni una funzionalità per offrire un'app "lite" nelle prime serate test — Like, Superlike, classifiche e check-in restano sempre accesi, non sono qui. Le varianti di Pulse invece sono tutte qui sotto, comprese "Pulse" e "Pulse + Superlike" (prima quest'ultima era sempre accesa per definizione — ora è un interruttore come le altre). L'effetto è immediato per tutti, senza bisogno di ricaricare nulla lato codice.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {flags.map((f) => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 12, padding: '12px 14px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{labels[f.key] || f.key}</span>
            <button
              onClick={() => toggle(f)}
              disabled={togglingKey === f.key}
              style={{
                width: 46, height: 26, borderRadius: 999, border: 'none', position: 'relative', flexShrink: 0,
                background: f.isEnabled ? 'var(--cyan)' : 'rgba(228,212,200,0.2)',
                cursor: togglingKey === f.key ? 'default' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: f.isEnabled ? 23 : 3,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ============================================================
 * SEZIONE "PERSONE" — motore di ricerca per hashtag, per estrarre
 * dalla classifica generale tutte le persone con una certa
 * etichetta (es. "pr") e fornirle a locali/brand che le
 * richiedono. Include il numero di telefono — solo qui, solo per
 * gli Architetti — per poter davvero contattare chi ha scelto di
 * rendersi trovabile con quell'hashtag.
 * ============================================================
 */
function PeopleSearchSection() {
  const [hashtagInput, setHashtagInput] = useState('pr');
  const [people, setPeople] = useState(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    const clean = hashtagInput.trim().replace(/^#/, '');
    if (!clean) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/dashboard/search-by-hashtag?hashtag=${encodeURIComponent(clean)}`);
      const data = await res.json();
      setPeople(data.success ? data.people : []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="pl-hint" style={{ marginBottom: 12 }}>
        Cerca tutte le persone con un dato hashtag, ordinate per punti — utile per fornire nomi veri a locali o brand che li richiedono (es. "#pr" per trovare organizzatori).
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={hashtagInput}
          onChange={(e) => setHashtagInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="pr, fitness, beauty…"
          style={{ marginBottom: 0, flex: 1 }}
        />
        <button
          onClick={search}
          disabled={loading}
          style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Search size={14} /> {loading ? '…' : 'Cerca'}
        </button>
      </div>

      {people === null && <p className="pl-hint">Scrivi un hashtag e tocca Cerca.</p>}
      {people !== null && people.length === 0 && <p className="pl-hint">Nessuno trovato con questo hashtag.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {people?.map((p) => (
          <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 12, padding: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              {p.photoUrl ? <img src={p.photoUrl} alt={p.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.avatarEmoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                {p.displayName}
                {p.isVerified && <span style={{ fontSize: 9, color: 'var(--cyan)' }}>✓</span>}
                {p.isTopConnector && <span style={{ fontSize: 8.5, color: '#C7C9CC' }}>⛓</span>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.globalPoints} punti · {p.phoneNumber}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ============================================================
 * SEZIONE "INSTANT INFLUENCER" — assegna/rimuove lo status via
 * dashboard, sostituisce il vecchio metodo a mano su Supabase.
 * Sempre solo gli Architetti, sempre dietro un vero accordo brand
 * confermato — nessun modo per un utente di attivarselo da solo.
 * ============================================================
 */
const INFLUENCER_CATEGORY_OPTIONS = ['Moda', 'Fitness', 'Beauty', 'Nightlife'];

function InstantInfluencerSection() {
  const [phoneInput, setPhoneInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [category, setCategory] = useState('');
  const [products, setProducts] = useState([{ name: '', url: '' }]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function search() {
    if (!phoneInput.trim()) return;
    setSearching(true);
    setFoundUser(null);
    setNotFound(false);
    try {
      const res = await apiFetch(`/api/dashboard/find-user-by-phone?phone=${encodeURIComponent(phoneInput.trim())}`);
      const data = await res.json();
      if (data.success) {
        setFoundUser(data.user);
        setCategory(data.user.instantInfluencerCategory || '');
        setProducts(data.user.products.length > 0 ? data.user.products : [{ name: '', url: '' }]);
      } else {
        setNotFound(true);
      }
    } finally {
      setSearching(false);
    }
  }

  function updateProduct(index, field, value) {
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function addProductRow() {
    setProducts((prev) => [...prev, { name: '', url: '' }]);
  }

  function removeProductRow(index) {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/dashboard/users/${foundUser.userId}/instant-influencer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: category.trim() || null, products: products.filter((p) => p.name.trim()) }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="pl-section-label" style={{ marginBottom: 8 }}>Instant Influencer</div>
      <p className="pl-hint" style={{ marginBottom: 12 }}>
        Cerca la persona per numero di telefono, poi imposta categoria e prodotti sponsorizzati — solo dopo un vero accordo brand confermato.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Numero di telefono"
          style={{ marginBottom: 0, flex: 1 }}
        />
        <button
          onClick={search}
          disabled={searching}
          style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          {searching ? '…' : 'Cerca'}
        </button>
      </div>

      {notFound && <p className="pl-hint">Nessun utente registrato con questo numero.</p>}

      {foundUser && (
        <MetricCard title={foundUser.displayName}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ marginBottom: 10 }}>
            <option value="">Nessuno status (togli Instant Influencer)</option>
            {INFLUENCER_CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {category && (
            <>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 6 }}>Prodotti sponsorizzati</div>
              {products.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    value={p.name}
                    onChange={(e) => updateProduct(i, 'name', e.target.value)}
                    placeholder="Nome prodotto"
                    style={{ marginBottom: 0, flex: 1 }}
                  />
                  <input
                    value={p.url}
                    onChange={(e) => updateProduct(i, 'url', e.target.value)}
                    placeholder="Link (facoltativo)"
                    style={{ marginBottom: 0, flex: 1 }}
                  />
                  {products.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeProductRow(i)}
                      style={{ flexShrink: 0, width: 32, borderRadius: 8, border: '1px solid rgba(228,212,200,0.2)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addProductRow}
                style={{ width: '100%', padding: 8, borderRadius: 10, border: '1px dashed rgba(228,212,200,0.3)', background: 'transparent', color: 'var(--teak)', fontSize: 11, cursor: 'pointer', marginBottom: 10 }}
              >
                + Aggiungi prodotto
              </button>
            </>
          )}

          <button
            onClick={save}
            disabled={saving}
            style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: saved ? 'rgba(255,61,110,0.3)' : 'var(--cyan)', color: '#fff', cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? 'Un attimo…' : saved ? 'Salvato ✓' : 'Salva'}
          </button>
        </MetricCard>
      )}
    </div>
  );
}

/**
 * ============================================================
 * CATALOGO DRINK — gestione dei drink disponibili per la Pulse in
 * questo locale. Prima non esisteva NESSUNO strumento per questo,
 * scoperto vuoto per ogni locale durante un test dal vivo (il
 * bottone "Invia Pulse" restava bloccato, niente da selezionare).
 * ============================================================
 */
function VenueDrinksSection({ venueId }) {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadDrinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/dashboard/venues/${venueId}/drinks`);
      const data = await res.json();
      if (data.success) setDrinks(data.drinks);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { loadDrinks(); }, [loadDrinks]);

  async function addDrink() {
    const priceCents = Math.round(parseFloat(newPrice.replace(',', '.')) * 100);
    if (!newName.trim() || !Number.isInteger(priceCents) || priceCents <= 0) {
      window.alert('Inserisci un nome e un prezzo valido.');
      return;
    }
    setAdding(true);
    try {
      const res = await apiFetch(`/api/dashboard/venues/${venueId}/drinks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), basePriceCents: priceCents }),
      });
      const data = await res.json();
      if (data.success) {
        setNewName('');
        setNewPrice('');
        loadDrinks();
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setAdding(false);
    }
  }

  function startEdit(d) {
    setEditingId(d.id);
    setEditName(d.name);
    setEditPrice((d.basePriceCents / 100).toFixed(2));
  }

  async function saveEdit(drinkId) {
    const priceCents = Math.round(parseFloat(editPrice.replace(',', '.')) * 100);
    if (!editName.trim() || !Number.isInteger(priceCents) || priceCents <= 0) {
      window.alert('Inserisci un nome e un prezzo valido.');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await apiFetch(`/api/dashboard/drinks/${drinkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), basePriceCents: priceCents }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        loadDrinks();
      } else {
        window.alert('Qualcosa è andato storto — riprova.');
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeDrink(drinkId) {
    if (!window.confirm('Togliere questo drink dal catalogo del locale?')) return;
    const res = await apiFetch(`/api/dashboard/venues/${venueId}/drinks/${drinkId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadDrinks();
  }

  return (
    <MetricCard title="Catalogo drink Pulse">
      <p className="pl-hint" style={{ marginBottom: 10 }}>
        I drink che chi invia una Pulse può scegliere in questo locale. Senza almeno uno, l'invio resta bloccato — nessuna scelta possibile.
      </p>

      {loading ? (
        <p className="pl-hint">Caricamento…</p>
      ) : (
        <>
          {drinks.length === 0 && (
            <p className="pl-hint" style={{ marginBottom: 10, color: 'var(--red)' }}>
              Nessun drink ancora — aggiungine almeno uno qui sotto.
            </p>
          )}
          {drinks.map((d) => (
            <div key={d.id} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
              {editingId === d.id ? (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome" style={{ marginBottom: 0, flex: 2 }} />
                    <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Prezzo (€)" style={{ marginBottom: 0, flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => saveEdit(d.id)} disabled={savingEdit} style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {savingEdit ? 'Un attimo…' : 'Salva'}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid rgba(228,212,200,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                      Annulla
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(d.basePriceCents / 100).toFixed(2)}€</div>
                  </div>
                  <button onClick={() => startEdit(d)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(228,212,200,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                    Modifica
                  </button>
                  <button onClick={() => removeDrink(d.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(229,57,53,0.3)', background: 'transparent', color: 'var(--red)', fontSize: 11, cursor: 'pointer' }}>
                    Rimuovi
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="pl-section-label" style={{ marginTop: 14 }}>Aggiungi un nuovo drink</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome (es. Spritz)" style={{ marginBottom: 0, flex: 2 }} />
            <input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Prezzo (€)" style={{ marginBottom: 0, flex: 1 }} />
          </div>
          <button onClick={addDrink} disabled={adding} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, background: 'var(--cyan)', color: '#fff', cursor: adding ? 'default' : 'pointer' }}>
            {adding ? 'Un attimo…' : '+ Aggiungi drink'}
          </button>
        </>
      )}
    </MetricCard>
  );
}

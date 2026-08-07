import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

import Login from './Login';
import ProfileCreation from './ProfileCreation';
import CheckinRadar from './CheckinRadar';
import LiveRanking from './LiveRanking';
import { PulseNotification } from './RosaFlow';
import ChatWindow from './ChatWindow';
import Settings from './Settings';
import MyPulses from './MyRoses';
import MyProfile from './MyProfile';
import SplashScreen from './SplashScreen';
import ReloadLoader from './ReloadLoader';
import {
  Radar as RadarIcon, Trophy, Globe, User, PulseWaveIcon,
  Eye, Heart, Star, PartyPopper, Target, Link2, Sparkles,
  Map, History, Wallet,
} from './PopuLiveIcons';
import WelcomeBack from './WelcomeBack';
import MissionClaim from './MissionClaim';
import VenuesMap from './VenuesMap';
import Dashboard from './Dashboard';
import NearbyMissions from './NearbyMissions';
import SuperlikeNotification from './SuperlikeNotification';
import { API_BASE, apiFetch, getToken, getStoredUserId, clearSession } from './apiClient';

import './populive-styles.css';

/**
 * ============================================================
 * POPULIVE — SHELL DELL'APP
 * ============================================================
 * Tre stati possibili, in ordine:
 *   1) 'checking'    → sto verificando se c'è già una sessione valida
 *      salvata (token in localStorage) prima di decidere cosa mostrare
 *   2) 'login'       → nessuna sessione valida, serve il login
 *   3) 'onboarding'  → loggato ma non ha ancora completato il profilo
 *   4) 'app'         → dentro, tutto pronto
 * ============================================================
 */
export default function App() {
  const [authState, setAuthState] = useState('checking');
  const [userId, setUserId] = useState(null);

  // --------------------------------------------------------
  // SPLASH — resta visibile finché il controllo VERO della
  // sessione non è finito (mai un timer finto), ma con una durata
  // minima (altrimenti su una connessione velocissima lampeggerebbe
  // via in pochi millisecondi, un effetto brutto quanto un'attesa
  // finta). Quando entrambe le condizioni sono soddisfatte, sfuma
  // via — proprio come l'apertura di Hinge.
  // --------------------------------------------------------
  // sessionStorage sopravvive a un semplice ricaricamento della
  // pagina (F5, pull-to-refresh) ma viene cancellato quando l'app
  // viene DAVVERO chiusa — la firma perfetta per distinguere le due
  // situazioni senza bisogno di altro. Prima vera apertura di questa
  // sessione = logo completo con la cerimonia intera; ricaricamento
  // dentro la stessa sessione = solo le onde, via il prima possibile.
  const isColdStart = useRef(!sessionStorage.getItem('pl_session_started')).current;
  if (isColdStart) sessionStorage.setItem('pl_session_started', 'true');

  const MIN_SPLASH_MS = isColdStart ? 3000 : 0;
  const [showSplash, setShowSplash] = useState(true);
  const [splashFadingOut, setSplashFadingOut] = useState(false);
  const appMountedAt = useRef(Date.now());

  useEffect(() => {
    if (authState === 'checking' || !showSplash || splashFadingOut) return;
    const elapsed = Date.now() - appMountedAt.current;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
    const t = setTimeout(() => setSplashFadingOut(true), remaining);
    return () => clearTimeout(t);
  }, [authState, showSplash, splashFadingOut, MIN_SPLASH_MS]);

  // --------------------------------------------------------
  // QR code del locale = un semplice link web (es.
  // populive-frontend.../checkin/<venueId>) — NON serve una
  // fotocamera dentro l'app: qualunque fotocamera di sistema
  // (iPhone/Android) riconosce un link dentro un QR e apre il
  // browser da sola, esattamente come i QR dei menu al ristorante.
  // Qui leggiamo quel pezzo di indirizzo UNA volta all'avvio,
  // prima di ripulire l'URL (così un refresh non lo rifà da capo).
  // --------------------------------------------------------
  const [venueId, setVenueId] = useState('f923e9c8-c47f-40d6-a4b8-98afe38d43cc'); // "Locale di Prova" come default
  // /dashboard resta un indirizzo VERO e persistente (a differenza
  // di /checkin e /mission, che si "consumano" e spariscono subito
  // dall'indirizzo) — un founder deve poterselo salvare nei
  // preferiti e ritrovarlo lì ogni volta, non un link usa-e-getta.
  const [isDashboardRoute] = useState(() => window.location.pathname.startsWith('/dashboard'));
  const [arrivedViaQr, setArrivedViaQr] = useState(false);
  // QR di una missione sponsorizzata (populive-frontend.../mission/<missionId>)
  // — stesso identico principio del check-in, un link semplice
  // riconosciuto da qualunque fotocamera di sistema.
  const [pendingMissionId, setPendingMissionId] = useState(null);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/checkin\/([a-zA-Z0-9-]+)/);
    if (match) {
      setVenueId(match[1]);
      setArrivedViaQr(true);
      window.history.replaceState(null, '', '/');
    }

    const missionMatch = window.location.pathname.match(/^\/mission\/([a-zA-Z0-9-]+)/);
    if (missionMatch) {
      setPendingMissionId(missionMatch[1]);
      window.history.replaceState(null, '', '/');
    }

    // Ritorno da Stripe dopo il pagamento di una Pulse (riuscito o
    // annullato) — non c'è altro da fare qui: se il pagamento è
    // andato a buon fine, il popup punti universale scatterà da
    // solo appena il webhook avrà creato la Pulse. Ripuliamo solo
    // l'indirizzo, che altrimenti resterebbe sporco.
    if (window.location.search.includes('pulse_sent') || window.location.search.includes('pulse_cancelled')) {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  const [arenaSessionId, setArenaSessionId] = useState(null);

  const [activeTab, setActiveTab] = useState('radar');
  const [pendingPulseNotification, setPendingPulseNotification] = useState(null);
  const [pendingSuperlike, setPendingSuperlike] = useState(null);
  const [activeChatConversationId, setActiveChatConversationId] = useState(null);
  const [pulseBadgeCount, setPulseBadgeCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [venuesMapMode, setVenuesMapMode] = useState(null); // null | 'browse' | 'historical'
  const [showNearbyMissions, setShowNearbyMissions] = useState(false);
  // Interruttori decisi dagli Architetti in dashboard — letti una
  // volta all'apertura dell'app, pubblici (nessun login richiesto),
  // di default tutto acceso finché non arrivano davvero dal server.
  const [featureFlags, setFeatureFlags] = useState({
    sponsored_missions: true, historical_board: true, venues_map: true, instant_influencer: true,
  });

  useEffect(() => {
    apiFetch('/api/feature-flags')
      .then((r) => r.json())
      .then((data) => { if (data.success) setFeatureFlags(data.flags); })
      .catch(() => {});
  }, []);
  // "Bentornato" — mostrata una sola volta appena si entra in app,
  // vero solo finché non sappiamo ancora se c'è qualcosa di nuovo
  // da mostrare (il componente stesso decide, chiamando onDone
  // subito se non c'è nulla).
  const [showWelcomeBack, setShowWelcomeBack] = useState(true);
  // Coda di popup punti (Like/Superlike) — un array perché più
  // interazioni potrebbero arrivare vicine nel tempo, ognuna con
  // la sua sparizione automatica indipendente dalle altre.
  const [pointsToasts, setPointsToasts] = useState([]);

  const showPointsToast = useCallback((icon, points) => {
    const id = Date.now() + Math.random();
    setPointsToasts((prev) => [...prev, { id, icon, points }]);
    setTimeout(() => {
      setPointsToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  // Un solo evento del server ('points_update') copre GIÀ ogni
  // singolo punto assegnato a chiunque, per qualunque motivo — lo
  // usiamo qui come motore UNICO per tutti i popup, invece di
  // costruirne uno diverso per ogni funzionalità. Copre da solo:
  // visita profilo (ricevuta E inviata), like/superlike (ricevuti
  // E inviati), ogni variante di Pulse, il bonus del minigioco —
  // tutto, senza bisogno di nuovo codice lato server.
  const pointsIconFor = useCallback((source) => {
    const base = source.replace(/_sent$/, ''); // "like_received_sent" → "like_received"
    const icons = {
      profile_view: Eye,
      like_received: Heart,
      superlike_received: Star,
      pulse_standalone: PulseWaveIcon,
      pulse_like: PulseWaveIcon,
      pulse_super: PulseWaveIcon,
      pulse_guess_won: PartyPopper,
      mission_completed: Target,
      connector_discovery_bonus: Link2,
    };
    return icons[base] || Sparkles;
  }, []);

  // Proposta d'acquisto quando i Like smettono di generare punti —
  // stesso principio già usato per il Superlike esaurito: cerchiamo
  // il prodotto giusto per SKU nel catalogo (l'id vero lo assegna
  // il database), poi mandiamo su Stripe se serve pagare davvero.
  const offerLikeCreditsPurchase = useCallback(async () => {
    const confirmed = window.confirm('Da qui in poi i tuoi Like in questa Arena non ti fanno più guadagnare punti. Vuoi sbloccarne altri 10?');
    if (!confirmed) return;

    try {
      const catalogRes = await apiFetch('/api/products');
      const catalogData = await catalogRes.json();
      const product = catalogData.products?.find((p) => p.product_type === 'like_credits');
      if (!product) return;

      const purchaseRes = await apiFetch('/api/purchases/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, arenaSessionId }),
      });
      const purchaseData = await purchaseRes.json();

      if (purchaseData.requiresPayment) {
        window.location.href = purchaseData.checkoutUrl;
      }
    } catch (err) {
      console.error('Errore nella proposta di acquisto Like extra:', err);
    }
  }, [arenaSessionId]);

  // --------------------------------------------------------
  // All'avvio: c'è già un token salvato da una sessione precedente?
  // Se sì, verifichiamolo col server prima di decidere cosa mostrare
  // — un token scaduto/non valido ci rimanda al login, non fa
  // crashare l'app.
  // --------------------------------------------------------
  useEffect(() => {
    async function checkExistingSession() {
      const token = getToken();
      const storedUserId = getStoredUserId();
      if (!token || !storedUserId) {
        setAuthState('login');
        return;
      }
      try {
        const res = await apiFetch('/api/auth/me');
        const data = await res.json();
        if (data.success) {
          setUserId(data.userId);
          setAuthState(data.onboardingCompleted ? 'app' : 'onboarding');
        } else {
          clearSession();
          setAuthState('login');
        }
      } catch {
        clearSession();
        setAuthState('login');
      }
    }
    checkExistingSession();
  }, []);

  // Teniamo un riferimento persistente al socket "trasversale" —
  // serve al secondo effect qui sotto per poter entrare nella
  // stanza dell'Arena appena la conosciamo, senza dover ricreare
  // da zero la connessione (che resta la stessa per tutta la sessione).
  const socketRef = useRef(null);

  // --------------------------------------------------------
  // Connessione WebSocket "trasversale"
  // --------------------------------------------------------
  useEffect(() => {
    if (authState !== 'app' || !userId) return;
    const socket = io(API_BASE);
    socketRef.current = socket;
    socket.emit('join_private_room', { userId });

    socket.on('pulse_received', (payload) => {
      setPendingPulseNotification(payload);
      setPulseBadgeCount((n) => n + 1);
    });

    // Mancava del tutto — il backend gestiva già accetta/rifiuta/
    // ignora per un Superlike puro, ma senza questo ascoltatore chi
    // lo riceveva non lo scopriva mai (nessuna schermata compariva).
    socket.on('superlike_received', (payload) => {
      setPendingSuperlike(payload);
    });

    // Motore unico dei popup punti — v. pointsIconFor sopra. Il
    // filtro sull'userId è necessario perché questo evento è
    // pubblico a tutta l'Arena (serve alla classifica), non
    // privato: dobbiamo mostrare il popup SOLO per i punti nostri,
    // mai per quelli di un'altra persona che vediamo aggiornarsi.
    socket.on('points_update', (payload) => {
      if (payload.userId === userId) {
        showPointsToast(pointsIconFor(payload.source), payload.points);
      }
    });

    // Hai superato il tetto dei Like che generano punti in questa
    // Arena — un avviso una sola volta (il server lo manda solo al
    // momento esatto del superamento, non ripetutamente), con la
    // proposta di sbloccarne altri 10.
    socket.on('like_limit_reached', () => {
      offerLikeCreditsPurchase();
    });

    socket.on('chat_unlocked', (payload) => {
      setActiveChatConversationId((prev) => prev || payload.conversationId);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authState, userId, showPointsToast, pointsIconFor, offerLikeCreditsPurchase]);

  // Appena conosciamo l'Arena in cui siamo (dopo il check-in),
  // colleghiamo QUESTA STESSA connessione anche alla sua stanza —
  // altrimenti il popup universale qui sopra non riceverebbe mai
  // 'points_update', che è un evento inviato solo a chi è entrato
  // nella stanza dell'Arena specifica.
  useEffect(() => {
    if (arenaSessionId && socketRef.current && userId) {
      socketRef.current.emit('join_arena', { arenaSessionId, userId });
    }
  }, [arenaSessionId, userId]);

  const handleLoggedIn = useCallback((newUserId, isNewUser, onboardingCompleted) => {
    setUserId(newUserId);
    setAuthState(onboardingCompleted ? 'app' : 'onboarding');
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setAuthState('app');
  }, []);

  // --------------------------------------------------------
  // Contenuto principale, calcolato UNA SOLA VOLTA in base allo
  // stato — mai un "return" separato per ogni ramo: se lo facessimo,
  // la splash (renderizzata dentro ciascun ramo) verrebbe SMONTATA
  // e RICREATA da zero ogni volta che l'app cambia stato, facendo
  // ripartire la sua animazione di entrata da capo — esattamente
  // il "salto" notato. Qui invece la splash si trova in UN SOLO
  // punto, fuori da tutti questi rami, quindi resta la STESSA
  // istanza per tutta la sua vita, senza mai ricominciare.
  // --------------------------------------------------------
  let mainContent = null; // 'checking': nient'altro da mostrare, la splash copre tutto da sola

  if (authState === 'login') {
    mainContent = (
      <div className="pl-app-shell">
        <div className="pl-content" style={{ paddingTop: 20 }}>
          <div className="pl-brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
            Popu<span className="pl-brand-live">Live</span>
          </div>
          <Login onLoggedIn={handleLoggedIn} />
        </div>
      </div>
    );
  } else if (authState === 'onboarding') {
    mainContent = (
      <div className="pl-app-shell">
        <div className="pl-content" style={{ paddingTop: 20 }}>
          <div className="pl-brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
            Popu<span className="pl-brand-live">Live</span>
          </div>
          <ProfileCreation onComplete={handleOnboardingComplete} />
        </div>
      </div>
    );
  } else if (authState === 'app' && isDashboardRoute) {
    // La dashboard sostituisce del tutto l'app normale quando si è
    // su questo indirizzo — il controllo VERO se la persona sia
    // davvero un founder (non solo loggata) avviene dentro
    // Dashboard.jsx stesso, lato server, non qui.
    mainContent = <Dashboard userId={userId} />;
  } else if (authState === 'app') {
    mainContent = (
      <div className="pl-app-shell">
      <div className="pl-top-bar">
        <div className="pl-brand">Popu<span className="pl-brand-live">Live</span></div>
        {arenaSessionId && <div className="pl-arena-pill"><span className="pl-live-dot"></span> Arena attiva</div>}
      </div>

      <div className="pl-content">
        {activeTab === 'radar' && (
          <>
            <CheckinRadar
              userId={userId}
              venueId={venueId}
              onArenaSession={setArenaSessionId}
              autoCheckin={arrivedViaQr}
            />
            {featureFlags.historical_board && (
              <button
                onClick={() => setVenuesMapMode('historical')}
                style={{ marginTop: 12, width: '100%', padding: 12, borderRadius: 14, border: '1px solid rgba(228,212,200,0.2)', background: 'var(--surface)', color: 'var(--teak)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                <History size={14} /> Bacheca storica dei locali
              </button>
            )}
            {featureFlags.venues_map && (
              <button
                onClick={() => setVenuesMapMode('browse')}
                style={{ marginTop: 8, width: '100%', padding: 12, borderRadius: 14, border: '1px solid rgba(228,212,200,0.2)', background: 'var(--surface)', color: 'var(--teak)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                <Map size={14} /> Sfoglia tutti i locali sulla mappa
              </button>
            )}
            {featureFlags.sponsored_missions && (
              <button
                onClick={() => setShowNearbyMissions(true)}
                style={{ marginTop: 8, width: '100%', padding: 12, borderRadius: 14, border: '1px solid rgba(228,212,200,0.2)', background: 'var(--surface)', color: 'var(--teak)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                <Target size={14} /> Missioni vicino a te
              </button>
            )}
          </>
        )}

        {activeTab === 'locale' && arenaSessionId && (
          <LiveRanking arenaSessionId={arenaSessionId} currentUserId={userId} venueId={venueId} onSelectSelf={() => setActiveTab('profilo')} />
        )}
        {activeTab === 'locale' && !arenaSessionId && (
          <div className="pl-hint" style={{ textAlign: 'center', marginTop: 40 }}>
            Fai check-in in un'Arena per sbloccare la classifica di stanotte.
          </div>
        )}

        {activeTab === 'globale' && (
          <LiveRanking arenaSessionId={null} currentUserId={userId} isGlobal onSelectSelf={() => setActiveTab('profilo')} />
        )}

        {activeTab === 'pulse' && (
          <MyPulses userId={userId} venueId={venueId} onOpenPulse={(pulse) => setPendingPulseNotification(pulse)} />
        )}

        {activeTab === 'profilo' && (
          <>
            <MyProfile userId={userId} arenaSessionId={arenaSessionId} onOpenSettings={() => setShowSettings(true)} />
            <ComingSoonSection />
          </>
        )}

        {activeTab === 'chat' && activeChatConversationId && (
          <ChatWindow
            conversationId={activeChatConversationId}
            currentUserId={userId}
            otherUserName="Chat"
          />
        )}
      </div>

      <div className="pl-bottom-nav">
        <NavItem icon={RadarIcon} label="Radar" active={activeTab === 'radar'} onClick={() => setActiveTab('radar')} />
        <NavItem icon={Trophy} label="Stanotte" active={activeTab === 'locale'} onClick={() => setActiveTab('locale')} />
        <NavItem icon={Globe} label="Globale" active={activeTab === 'globale'} onClick={() => setActiveTab('globale')} />
        <NavItem icon={PulseWaveIcon} label="Pulse" active={activeTab === 'pulse'} onClick={() => setActiveTab('pulse')} badge={pulseBadgeCount} />
        <NavItem icon={User} label="Profilo" active={activeTab === 'profilo'} onClick={() => setActiveTab('profilo')} />
      </div>

      {/* "Bentornato" appare per prima, appena entrati in app — e
          quando sparisce (con o senza notizie), apre in automatico
          la mappa dei locali SOLO LA PRIMA VOLTA della giornata —
          dalla volta successiva resta una scelta volontaria, non ha
          senso riaprirla ad ogni singolo riavvio dell'app. Tenuta
          nel telefono stesso (non nel database): non serve
          sincronizzarla tra dispositivi, è solo una comodità
          locale. */}
      {showWelcomeBack && (
        <WelcomeBack
          userId={userId}
          onDone={() => {
            setShowWelcomeBack(false);
            const today = new Date().toISOString().slice(0, 10); // es. "2026-08-05"
            const lastAutoOpen = localStorage.getItem('pl_map_autoopen_date');
            if (lastAutoOpen !== today && featureFlags.venues_map) {
              localStorage.setItem('pl_map_autoopen_date', today);
              setVenuesMapMode('browse');
            }
          }}
        />
      )}

      {/* Missione sponsorizzata da QR — sopra a tutto il resto (anche
          sopra "Bentornato", se capitano insieme): chi ha appena
          scansionato un QR in negozio si aspetta di vedere subito
          la missione, non doverla aspettare dietro altri popup. */}
      {pendingMissionId && (
        <MissionClaim
          missionId={pendingMissionId}
          onClose={() => setPendingMissionId(null)}
        />
      )}

      {venuesMapMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: 20, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <VenuesMap currentUserId={userId} onClose={() => setVenuesMapMode(null)} mode={venuesMapMode} />
          </div>
        </div>
      )}

      {showNearbyMissions && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: 20, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <NearbyMissions onClose={() => setShowNearbyMissions(false)} />
          </div>
        </div>
      )}

      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: 20, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <Settings userId={userId} onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {pendingPulseNotification && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: 20, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <PulseNotification
              pulse={pendingPulseNotification}
              currentUserId={userId}
              arenaSessionId={arenaSessionId}
              venueId={venueId}
              onResolved={() => {
                setPendingPulseNotification(null);
                setPulseBadgeCount((n) => Math.max(0, n - 1));
              }}
            />
          </div>
        </div>
      )}

      {pendingSuperlike && (
        <SuperlikeNotification
          superlike={pendingSuperlike}
          onResolved={() => setPendingSuperlike(null)}
        />
      )}

      {/* Popup punti — impilati se ne arriva più di uno vicino nel
          tempo, ognuno sparisce da solo dopo un paio di secondi. */}
      <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 70, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
        {pointsToasts.map((t) => (
          <div
            key={t.id}
            className="pl-confirm-wave-wrap"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface-2)', border: '1px solid rgba(47,211,232,0.4)',
              borderRadius: 999, padding: '9px 16px',
              fontSize: 13, fontWeight: 700, color: 'var(--text)',
              boxShadow: 'var(--shadow-lg)',
              animation: 'pl-toast-in 0.25s ease-out',
            }}
          >
            <span className="pl-confirm-wave"></span>
            <span className="pl-confirm-wave"></span>
            <span className="pl-confirm-wave"></span>
            <t.icon size={16} />
            <span style={{ color: 'var(--cyan)' }}>+{t.points} punti</span>
          </div>
        ))}
      </div>
    </div>
    );
  }

  // --------------------------------------------------------
  // IMPORTANTE: la splash e il resto dell'app non montano MAI
  // insieme. Prima tenevamo entrambi sovrapposti (la splash sopra,
  // il resto già pronto sotto, per un effetto di "rivelazione"
  // più morbido) — ma il resto dell'app (radar, connessione
  // WebSocket, tutto insieme) è pesante da montare, e farlo
  // PROPRIO mentre la splash sta animando può far "singhiozzare"
  // la sua animazione. Ora è sequenziale: prima la splash da sola,
  // poi — solo a sfumatura VERAMENTE conclusa — il resto.
  // --------------------------------------------------------
  if (showSplash) {
    return isColdStart
      ? <SplashScreen fadingOut={splashFadingOut} onExited={() => setShowSplash(false)} />
      : <ReloadLoader fadingOut={splashFadingOut} onExited={() => setShowSplash(false)} />;
  }

  return mainContent;
}

function NavItem({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button className={`pl-nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={20} strokeWidth={2} className="pl-nav-ic" />
      <span className="pl-nav-label">{label}</span>
      {!!badge && <span className="pl-nav-badge">{badge}</span>}
    </button>
  );
}

function ComingSoonSection() {
  const items = [
    { icon: Target, title: 'Missioni Sponsorizzate', sub: 'I brand potranno invitarti, con una notifica geolocalizzata, a visitare un loro punto vendita per ottenere punti bonus — sempre con il tuo consenso esplicito.' },
    { icon: Wallet, title: 'Wallet PopuLive', sub: 'Mance libere P2P e PopuLive Card, in arrivo con la fintech.' },
  ];
  return (
    <div style={{ marginTop: 16 }}>
      <div className="pl-section-label">In arrivo</div>
      {items.map((item) => (
        <div key={item.title} style={{ background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 16, padding: 14, marginBottom: 12, boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--teak)', background: 'rgba(228,212,200,0.14)', padding: '2px 8px', borderRadius: 6 }}>
            Coming Soon
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, margin: '6px 0 3px' }}>
            <item.icon size={14} /> {item.title}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{item.sub}</div>
        </div>
      ))}
    </div>
  );
}

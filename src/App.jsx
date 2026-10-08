import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { openExternal, onAppUrlOpen, onAppForeground, closeInAppBrowser, vibrate } from './native';

import Login from './Login';
import ProfileCreation from './ProfileCreation';
import CheckinRadar from './CheckinRadar';
import LiveRanking from './LiveRanking';
import { PulseNotification } from './RosaFlow';
import ChatWindow from './ChatWindow';
import Settings from './Settings';
import MyPulses from './MyRoses';
import MyProfile from './MyProfile';
import ChatCenter from './ChatCenter';
import NotificationCenter from './NotificationCenter';
import LikeCenter from './LikeCenter';
import SplashScreen from './SplashScreen';
import ReloadLoader from './ReloadLoader';
import {
  Radar as RadarIcon,
  Trophy,
  Globe,
  User,
  PulseWaveIcon,
  MessageCircle,
  Bell,
  Eye,
  Heart,
  Star,
  PartyPopper,
  Target,
  Link2,
  Sparkles,
  Map,
  History,
  Wallet,
} from './PopuLiveIcons';
import WelcomeBack from './WelcomeBack';
import MissionClaim from './MissionClaim';
import VenuesMap from './VenuesMap';
import Dashboard from './Dashboard';
import NearbyMissions from './NearbyMissions';
import SuperlikeNotification from './SuperlikeNotification';
import {
  API_BASE,
  apiFetch,
  getToken,
  getStoredUserId,
  clearSession,
  getLastVenue,
  clearLastVenue,
  refreshLocationIfConsented,
  checkStillAtVenue,
  isRecentOwnDecision,
} from './apiClient';

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

  // MODALITÀ GIORNO/NOTTE — giornata divisa esattamente a metà:
  // dalle 6:00 alle 18:00 modalità giorno (crema calda, pensata
  // per palestre/bar/negozi diurni), il resto notte (nero caldo,
  // pensata per i locali). Basata sull'ora LOCALE del telefono di
  // chi usa l'app, non su un fuso fisso — corretto ovunque nel
  // mondo. Controllata subito all'apertura e poi ricontrollata
  // ogni 5 minuti, per il raro caso di qualcuno con l'app aperta
  // esattamente a cavallo delle 6:00 o delle 18:00.
  useEffect(() => {
    function applyTimeBasedMode() {
      const hour = new Date().getHours();
      const isDaytime = hour >= 6 && hour < 18;
      document.body.classList.toggle('pl-day-mode', isDaytime);
    }
    applyTimeBasedMode();
    const interval = setInterval(applyTimeBasedMode, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
  // Serata in cui eravamo entrati col QR, solo per la ripresa
  // automatica all'avvio (v. getLastVenue in apiClient.js, bug B8):
  // null per un QR vero.
  const [resumeSessionId, setResumeSessionId] = useState(null);
  // QR di una missione sponsorizzata (populive-frontend.../mission/<missionId>)
  // — stesso identico principio del check-in, un link semplice
  // riconosciuto da qualunque fotocamera di sistema.
  const [pendingMissionId, setPendingMissionId] = useState(null);

  // Interpreta un indirizzo "in ingresso" — all'avvio (web) oppure
  // quando l'app nativa viene aperta da un QR / Universal Link
  // (iOS e Android consegnano l'URL all'app già avviata, senza
  // nessun ricaricamento di pagina).
  const handleIncomingUrl = useCallback((pathname, search) => {
    let handled = false;

    const match = pathname.match(/^\/checkin\/([a-zA-Z0-9-]+)/);
    if (match) {
      setVenueId(match[1]);
      setResumeSessionId(null);
      setArrivedViaQr(true);
      handled = true;
    }

    const missionMatch = pathname.match(/^\/mission\/([a-zA-Z0-9-]+)/);
    if (missionMatch) {
      setPendingMissionId(missionMatch[1]);
      handled = true;
    }

    // Ritorno da Stripe dopo il pagamento di una Pulse (riuscito o
    // annullato) — non c'è altro da fare qui: se il pagamento è
    // andato a buon fine, il popup punti universale scatterà da
    // solo appena il webhook avrà creato la Pulse. Ripuliamo solo
    // l'indirizzo, che altrimenti resterebbe sporco.
    if (search.includes('pulse_sent') || search.includes('pulse_cancelled')) {
      handled = true;
    }

    if (handled) window.history.replaceState(null, '', '/');
    return handled;
  }, []);

  useEffect(() => {
    const handled = handleIncomingUrl(window.location.pathname, window.location.search);
    if (!handled) {
      // Nessuna scansione vera in questo caricamento — ma se
      // eravamo già dentro un locale prima dell'aggiornamento
      // della pagina, ritentiamo da soli invece di costringere a
      // riscansionare il QR (l'utente potrebbe essere ancora
      // fisicamente lì). Solo nella STESSA serata: il server rifiuta
      // la ripresa (session_expired) se nel frattempo è iniziata
      // un'altra serata, o se il geofence ci aveva messo fuori.
      const lastVenue = getLastVenue();
      if (lastVenue) {
        setVenueId(lastVenue.venueId);
        setResumeSessionId(lastVenue.arenaSessionId);
        setArrivedViaQr(true);
      }
    }

    // App nativa: QR scansionato con la fotocamera di sistema o
    // ritorno da Stripe → l'URL arriva qui. Chiudiamo il browser
    // in-app (se era aperto per il checkout) e gestiamo l'indirizzo.
    return onAppUrlOpen(({ pathname, search }) => {
      closeInAppBrowser();
      handleIncomingUrl(pathname, search);
    });
  }, [handleIncomingUrl]);

  const [arenaSessionId, setArenaSessionId] = useState(null);

  // --------------------------------------------------------
  // Geofence del radar (28/9): uscito dal locale → fuori dal radar
  // --------------------------------------------------------
  // Il server chiude il check-in se la posizione è oltre il raggio
  // (checkStillAtVenue) e rifiuta un nuovo join_arena dopo un'uscita
  // per distanza (evento arena_access_denied). In entrambi i casi il
  // radar torna alla schermata del QR: il locale memorizzato si
  // cancella, altrimenti al prossimo avvio l'app rifarebbe da sola il
  // check-in (v. getLastVenue sopra) e lo riaprirebbe. Il key sul
  // radar lo fa ripartire da zero, dato che il suo stato è interno.
  const [radarResetKey, setRadarResetKey] = useState(0);
  const [leftVenueNotice, setLeftVenueNotice] = useState(false);
  const arenaSessionIdRef = useRef(null);
  useEffect(() => {
    arenaSessionIdRef.current = arenaSessionId;
  }, [arenaSessionId]);

  const handleLeftVenue = useCallback(() => {
    clearLastVenue();
    setArrivedViaQr(false);
    setResumeSessionId(null);
    setArenaSessionId(null);
    setLeftVenueNotice(true);
    setRadarResetKey((k) => k + 1);
  }, []);

  // Dopo un check-in riuscito la serata diventa "da riprendere" (bug
  // B22, ottobre 2026): CheckinRadar sta dentro il contenitore con
  // key={activeTab}, quindi ogni cambio di scheda lo ricrea da zero.
  // Senza questo, dopo uno scan fatto dall'app (che non passa da
  // arrivedViaQr) tornare sul Radar mostrava di nuovo il QR, mentre
  // il resto dell'app risultava ancora dentro ("Arena attiva"). Con la
  // ripresa il server riconferma lo stesso check-in, come all'avvio,
  // e la rifiuta dopo un'uscita per distanza.
  const handleArenaSession = useCallback((id) => {
    setLeftVenueNotice(false);
    setResumeSessionId(id);
    setArrivedViaQr(true);
    setArenaSessionId(id);
  }, []);

  // Ripresa automatica rifiutata dal server (serata finita o uscita
  // per distanza): si resta sulla schermata del QR, in silenzio. Va
  // spento anche arrivedViaQr, altrimenti il radar ritenterebbe
  // subito un check-in normale, senza ripresa — proprio quello che
  // il rifiuto deve impedire.
  // Con B22 la ripresa può partire anche a app aperta (cambio
  // scheda): se viene rifiutata, anche l'Arena memorizzata qui va
  // azzerata, altrimenti in alto resterebbe "Arena attiva".
  const handleResumeExpired = useCallback(() => {
    clearLastVenue();
    setArrivedViaQr(false);
    setResumeSessionId(null);
    setArenaSessionId(null);
  }, []);

  // Controllo subito dopo ogni check-in (anche quello automatico
  // all'avvio: chi riapre l'app da casa viene rimesso fuori) e a ogni
  // ritorno in primo piano (v. onVisible più sotto). Solo con il
  // permesso di posizione già concesso (decisione D1).
  const verifyStillAtVenue = useCallback(async () => {
    const id = arenaSessionIdRef.current;
    if (!id) return;
    const result = await checkStillAtVenue(id);
    if (result?.checkedOut && arenaSessionIdRef.current === id) handleLeftVenue();
  }, [handleLeftVenue]);

  useEffect(() => {
    if (arenaSessionId) verifyStillAtVenue();
  }, [arenaSessionId, verifyStillAtVenue]);

  const [activeTab, setActiveTab] = useState('radar');

  // NAVIGAZIONE A SWIPE — scorrere tra le schermate principali con
  // un tocco trascinato da destra a sinistra (e viceversa), come
  // ormai fanno tutte le app curate, oltre al tocco diretto
  // sull'icona. Attaccato SOLO al contenitore delle schede
  // principali (.pl-content qui sotto) — le schermate a tutto
  // schermo (profilo, chat, impostazioni) sono elementi separati
  // sopra di esso, quindi non ne risentono.
  // Due gruppi di scorrimento SEPARATI (25/8, richiesta esplicita —
  // prima un unico elenco saltava del tutto Chat/Like, aggiunte
  // dopo e mai collegate qui): scorrere tra le icone della barra in
  // basso (Radar/Like/Chat/Pulse/Profilo) è un gruppo; scorrere tra
  // le due classifiche (Locale/Globale) è un gruppo a sé, mai
  // mescolato col primo. ANIMATION_ORDER serve SOLO a calcolare se
  // l'animazione deve andare avanti o indietro quando si passa da
  // un gruppo all'altro con un tocco diretto (mai usato per lo
  // scorrimento vero e proprio).
  const ANIMATION_ORDER = [
    'radar',
    'locale',
    'globale',
    'like_center',
    'chat_list',
    'pulse',
    'profilo',
  ];
  const MAIN_TAB_ORDER = ['radar', 'like_center', 'chat_list', 'pulse', 'profilo'];
  const RANKING_TAB_ORDER = ['locale', 'globale'];
  const swipeStart = useRef(null);
  const [tabSlideDirection, setTabSlideDirection] = useState('forward'); // 'forward' | 'back'

  // Un solo punto di verità per cambiare scheda, usato sia dallo
  // swipe sia dal tocco diretto delle icone — così la direzione
  // dell'animazione è sempre corretta ovunque, mai calcolata due
  // volte in due posti diversi.
  function navigateToTab(newTab) {
    const currentIndex = ANIMATION_ORDER.indexOf(activeTab);
    const newIndex = ANIMATION_ORDER.indexOf(newTab);
    setTabSlideDirection(newIndex > currentIndex ? 'forward' : 'back');
    setActiveTab(newTab);
    if (newTab === 'chat_list') refreshActiveChats();
  }

  function handleSwipeStart(e) {
    const touch = e.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleSwipeEnd(e) {
    if (!swipeStart.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeStart.current.x;
    const deltaY = touch.clientY - swipeStart.current.y;
    swipeStart.current = null;

    // Deve essere chiaramente orizzontale (non uno scorrimento
    // verticale della lista) e abbastanza ampio da essere
    // intenzionale, non un tocco tremolante per sbaglio.
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

    // Quale dei due gruppi scorrere dipende da dove ci si trova ORA
    // — sulle classifiche si scorre solo tra le due classifiche,
    // ovunque altro si scorre tra le cinque icone della barra.
    const order = RANKING_TAB_ORDER.includes(activeTab) ? RANKING_TAB_ORDER : MAIN_TAB_ORDER;
    const currentIndex = order.indexOf(activeTab);
    if (currentIndex === -1) return;

    if (deltaX < 0 && currentIndex < order.length - 1) {
      navigateToTab(order[currentIndex + 1]); // sinistra -> avanti
    } else if (deltaX > 0 && currentIndex > 0) {
      navigateToTab(order[currentIndex - 1]); // destra -> indietro
    }
  }
  const [pendingPulseNotification, setPendingPulseNotification] = useState(null);
  const [pendingSuperlike, setPendingSuperlike] = useState(null);
  const [activeChatConversationId, setActiveChatConversationId] = useState(null);
  // Il listener socket qui sotto è registrato una volta sola quando
  // ci si collega (mai ricollegato ad ogni chat aperta/chiusa) — un
  // ref tiene il valore sempre aggiornato senza quel problema,
  // invece di leggere lo stato "vecchio" catturato al momento della
  // connessione.
  //
  // Vale solo per la chat VISIBILE (bug B12, 2/10): l'id resta in
  // memoria anche dopo essere passati a un'altra scheda dalla barra in
  // basso, e prima bastava questo per considerare la chat "aperta" —
  // niente vibrazione per i suoi messaggi e, peggio, niente banner né
  // "Nuovo match" per ogni match successivo, dopo aver aperto una
  // chat anche una volta sola.
  const activeChatConversationIdRef = useRef(null);
  useEffect(() => {
    activeChatConversationIdRef.current = activeTab === 'chat' ? activeChatConversationId : null;
  }, [activeChatConversationId, activeTab]);
  // Notifica discreta stile Tinder — mai un salto diretto e forzato
  // alla chat. La LISTA resta finché non si tocca davvero un match
  // (mai cancellata dal solo passare del tempo) — solo il BANNER in
  // alto sparisce da solo dopo un po', il match resta comunque
  // nella sezione "Nuovo match" del Centro Chat, contato nel pallino
  // della scheda Chat (v. chatTabBadgeCount più sotto).
  const [pendingMatches, setPendingMatches] = useState([]); // [{ conversationId }]
  // Le chat già aperte (con o senza "Conserva") — a livello app,
  // non più dentro al Profilo, perché ora serve sia al numeretto
  // sulla scheda Chat sia alla nuova schermata dedicata "Centro
  // Chat". Letta SEMPRE fresca dal server, mai dalla sola memoria
  // del browser — sopravvive a un aggiornamento pagina.
  const [activeChats, setActiveChats] = useState([]); // [{ conversationId, withUserId }]
  const refreshActiveChats = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch(`/api/users/${userId}/active-chats`);
      const data = await res.json();
      if (data.success) setActiveChats(data.conversations);
    } catch {
      /* ignorato — la lista resta quella di prima */
    }
  }, [userId]);
  useEffect(() => {
    if (authState === 'app' && userId) refreshActiveChats();
  }, [authState, userId, refreshActiveChats]);

  // Nome vero di chi c'è dall'altra parte della chat aperta — prima
  // era un segnaposto scritto a mano ("Chat", mai collegato a
  // nessuno) — trovato dall'utente leggendo il messaggio "Anche
  // Chat ha scelto di conservarla". Cerchiamo l'ID dell'altra
  // persona in ciò che l'app sa già (activeChats, o pendingMatches
  // se il match è così recente che activeChats non ha ancora fatto
  // in tempo ad aggiornarsi), poi recuperiamo il nome vero.
  const [activeChatOtherUserName, setActiveChatOtherUserName] = useState('');
  useEffect(() => {
    if (!activeChatConversationId) {
      setActiveChatOtherUserName('');
      return;
    }
    const fromActive = activeChats.find((c) => c.conversationId === activeChatConversationId);
    const fromPending = pendingMatches.find((m) => m.conversationId === activeChatConversationId);
    const otherUserId = fromActive?.withUserId || fromPending?.withUserId;
    if (!otherUserId) return;

    let cancelled = false;
    apiFetch(`/api/users/${otherUserId}/public-profile?arenaSessionId=${arenaSessionId || ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success) setActiveChatOtherUserName(data.profile.displayName);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeChatConversationId, activeChats, pendingMatches, arenaSessionId]);

  // Pallino sulla scheda Chat — PRIMA contava semplicemente quante
  // conversazioni erano aperte in totale, restando acceso anche a
  // chat già lette e in corso (bug vero segnalato dal vivo). Ora
  // conta solo quelle con davvero qualcosa di nuovo mai visto.
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const refreshUnreadChatCount = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch(`/api/users/${userId}/unread-chat-count`);
      const data = await res.json();
      if (data.success) setUnreadChatCount(data.count);
    } catch {
      /* ignorato — il numero resta quello di prima */
    }
  }, [userId]);
  useEffect(() => {
    if (authState === 'app' && userId) refreshUnreadChatCount();
  }, [authState, userId, refreshUnreadChatCount]);
  // Il pallino della scheda Chat conta anche i nuovi match mai aperti
  // (bug B10, 2/10): prima stavano sul pallino del Profilo, dove però
  // non c'era più niente da trovare — la lista dei match è nel Centro
  // Chat. Un match che ha già un messaggio non letto è contato una
  // volta sola, dentro unreadChatCount.
  const chatTabBadgeCount =
    unreadChatCount +
    pendingMatches.filter(
      (m) => !(activeChats.find((c) => c.conversationId === m.conversationId)?.unreadCount > 0)
    ).length;

  // Chat segnata come letta: si spengono sia il pallino totale sia
  // quello della singola riga nel Centro Chat.
  const handleChatMarkedRead = useCallback(() => {
    refreshUnreadChatCount();
    refreshActiveChats();
  }, [refreshUnreadChatCount, refreshActiveChats]);

  // Pallino sulla scheda Notifiche — quante interazioni ricevute da
  // quando si è aperto DAVVERO il Centro Notifiche l'ultima volta.
  // Stesso principio degli altri numeretti stanotte: sempre letto
  // fresco dal server, mai un contatore locale a mano.
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);
  const refreshNotificationBadge = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch(`/api/users/${userId}/unseen-notification-count`);
      const data = await res.json();
      if (data.success) setNotificationBadgeCount(data.count);
    } catch {
      /* ignorato — il numero resta quello di prima */
    }
  }, [userId]);
  useEffect(() => {
    if (authState === 'app' && userId) refreshNotificationBadge();
  }, [authState, userId, refreshNotificationBadge]);

  // Pallino sulla nuova icona "Like" — separato dal pallino del
  // Centro Notifiche (23/8, nuova architettura): quante interazioni
  // ricevute ancora da decidere sono arrivate da quando si è aperta
  // davvero questa schermata l'ultima volta.
  const [likeCenterBadgeCount, setLikeCenterBadgeCount] = useState(0);
  const refreshLikeCenterBadge = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch(`/api/users/${userId}/unseen-like-center-count`);
      const data = await res.json();
      if (data.success) setLikeCenterBadgeCount(data.count);
    } catch {
      /* ignorato — il numero resta quello di prima */
    }
  }, [userId]);
  useEffect(() => {
    if (authState === 'app' && userId) refreshLikeCenterBadge();
  }, [authState, userId, refreshLikeCenterBadge]);
  const [showMatchBanner, setShowMatchBanner] = useState(false);
  // Notifica a schermo dedicata per un Like ricevuto — stile
  // Facebook, più ricca del semplice popup punti generico. Il Like
  // resta anonimo (nessun nome/foto da mostrare, coerente con tutto
  // il resto dell'app), ma merita comunque una notifica vera, dato
  // che Superlike e Pulse hanno già la propria schermata dedicata.
  const [showLikeReceivedBanner, setShowLikeReceivedBanner] = useState(false);

  function openMatch(conversationId) {
    setActiveChatConversationId(conversationId);
    setActiveTab('chat');
    setPendingMatches((prev) => prev.filter((m) => m.conversationId !== conversationId));
    setShowMatchBanner(false);
    refreshActiveChats();
  }
  const [pulseBadgeCount, setPulseBadgeCount] = useState(0);

  // Il numero sulla Pulse conta insieme due cose diverse — quante
  // sono ancora da decidere (accetta/rifiuta) E quante sono già
  // accettati ma non ancora riscattati al bancone — sempre letto
  // fresco dal server invece che tenuto a mano con incrementi e
  // decrementi locali, che con due stati diversi da tracciare
  // insieme rischiano facilmente di andare fuori sincrono.
  const refreshPulseBadge = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch(`/api/users/${userId}/pulses`);
      const data = await res.json();
      if (data.success) {
        const count = data.pulses.filter(
          // 'ignored' = in sospeso, ancora da decidere (D9, 2/10)
          (p) => p.status === 'pending' || p.status === 'ignored' || p.status === 'accepted'
        ).length;
        setPulseBadgeCount(count);
      }
    } catch {
      /* ignorato — il numero resta quello di prima, non blocca nulla */
    }
  }, [userId]);
  const [showSettings, setShowSettings] = useState(false);

  // --------------------------------------------------------
  // Vibrazione agli eventi ricevuti (decisione D2, 2/10): Like,
  // Superlike, Pulse, match e messaggi in chat. Solo con
  // l'interruttore "Notifiche aptiche" acceso (Impostazioni,
  // users.haptic_notifications_enabled): letto all'avvio e riletto
  // alla chiusura delle Impostazioni. Un ref, non uno stato: lo
  // leggono i gestori del socket, che vivono più a lungo di un render.
  // Solo con l'app aperta: ad app chiusa il socket è spento (servono
  // le notifiche push, decisione D3).
  // --------------------------------------------------------
  const hapticEnabledRef = useRef(true); // default del DB
  const refreshHapticSetting = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch(`/api/profile/${userId}/settings`);
      const data = await res.json();
      if (data.success)
        hapticEnabledRef.current = data.settings?.hapticNotificationsEnabled !== false;
    } catch {
      /* ignorato — resta il valore di prima */
    }
  }, [userId]);
  useEffect(() => {
    if (authState === 'app' && userId) refreshHapticSetting();
  }, [authState, userId, refreshHapticSetting]);
  const buzz = useCallback((intensity) => {
    if (hapticEnabledRef.current) vibrate(intensity);
  }, []);
  const [venuesMapMode, setVenuesMapMode] = useState(null); // null | 'browse' | 'historical'
  const [showNearbyMissions, setShowNearbyMissions] = useState(false);
  // Interruttori decisi dagli Architetti in dashboard — letti una
  // volta all'apertura dell'app, pubblici (nessun login richiesto),
  // di default tutto acceso finché non arrivano davvero dal server.
  const [featureFlags, setFeatureFlags] = useState({
    sponsored_missions: true,
    historical_board: true,
    venues_map: true,
    instant_influencer: true,
  });

  useEffect(() => {
    apiFetch('/api/feature-flags')
      .then((r) => r.json())
      .then((data) => {
        // Unione con i default, non sostituzione: il server manda solo
        // le righe presenti in feature_flags, e una riga mancante vuol
        // dire funzione ACCESA (v. migrazione 001 nel backend). Prima
        // l'oggetto veniva sostituito e venues_map, sponsored_missions e
        // historical_board — che nel DB non hanno una riga — diventavano
        // undefined appena arrivava la risposta: pulsanti spariti, e la
        // mappa si apriva da sola solo se "Bentornato" si chiudeva prima
        // di quella risposta (da qui il "a volte sì, a volte no").
        if (data.success) setFeatureFlags((prev) => ({ ...prev, ...data.flags }));
      })
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

  const showPointsToast = useCallback((icon, points, label) => {
    const id = Date.now() + Math.random();
    setPointsToasts((prev) => [...prev, { id, icon, points, label }]);
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

  // Stessa idea di pointsIconFor, ma per il testo — utile
  // soprattutto per il Like, che non ha una schermata dedicata
  // (a differenza di Superlike/Pulse, dove è già ovvio cosa hai
  // ricevuto): vedere scritto "Like" accanto ai punti invoglia ad
  // aprire il Radar e provare a ricambiare.
  const pointsLabelFor = useCallback((source) => {
    const base = source.replace(/_sent$/, '');
    const labels = {
      profile_view: 'Visita profilo',
      like_received: 'Like',
      superlike_received: 'Superlike',
      pulse_standalone: 'Pulse',
      pulse_like: 'Pulse',
      pulse_super: 'Pulse',
      pulse_like_match: 'Match',
      like_match: 'Match',
      pulse_guess_won: 'Match',
      mission_completed: 'Missione',
      connector_discovery_bonus: 'Scoperta',
    };
    return labels[base] || null;
  }, []);

  // Proposta d'acquisto quando i Like smettono di generare punti —
  // stesso principio già usato per il Superlike esaurito: cerchiamo
  // il prodotto giusto per SKU nel catalogo (l'id vero lo assegna
  // il database), poi mandiamo su Stripe se serve pagare davvero.
  const offerLikeCreditsPurchase = useCallback(async () => {
    const confirmed = window.confirm(
      'Da qui in poi i tuoi Like in questa Arena non ti fanno più guadagnare punti. Vuoi sbloccarne altri 10?'
    );
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
        openExternal(purchaseData.checkoutUrl);
      }
    } catch (err) {
      console.error('Errore nella proposta di acquisto Like extra:', err);
    }
  }, [arenaSessionId]);

  // --------------------------------------------------------
  // All'avvio: c'è già un token salvato da una sessione precedente?
  // Se sì, verifichiamolo col server prima di decidere cosa mostrare
  // — un token scaduto/non valido ci rimanda al login, non fa
  // crashare l'app. Estratta come useCallback (non più dentro
  // l'useEffect) apposta perché il bottone "Riprova" della
  // schermata di errore rete la possa richiamare di nuovo, senza
  // dover ricaricare l'intera app.
  // --------------------------------------------------------
  const checkExistingSession = useCallback(async () => {
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
        // Il server ha risposto DAVVERO e ha detto esplicitamente
        // che il token non è valido (es. scaduto per davvero,
        // o revocato) — qui sì che ha senso ripulire la sessione
        // e rimandare al login.
        clearSession();
        setAuthState('login');
      }
    } catch {
      // Qui invece la richiesta non è nemmeno arrivata a
      // destinazione (rete assente/instabile — capita spesso
      // riaprendo l'app dopo ore, proprio mentre il telefono
      // sta ristabilendo la connessione). NON è una prova che il
      // token sia scaduto — anzi, il token da 30 giorni salvato
      // è quasi certamente ancora valido. Cancellarlo qui
      // costringerebbe a rifare login+SMS per un semplice
      // problema di rete temporaneo, non per un vero logout.
      setAuthState('connection_error');
    }
  }, []);

  useEffect(() => {
    checkExistingSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Totale vero del numero sulla Pulse appena si sa chi è connesso —
  // senza questo, il numero partirebbe da zero e si vedrebbe solo
  // dopo il primo evento in diretta, non riflettendo Pulse già in
  // sospeso/da riscattare da PRIMA di aprire l'app in questa sessione.
  useEffect(() => {
    if (authState === 'app' && userId) refreshPulseBadge();
  }, [authState, userId, refreshPulseBadge]);

  // Teniamo un riferimento persistente al socket "trasversale" —
  // serve al secondo effect qui sotto per poter entrare nella
  // stanza dell'Arena appena la conosciamo, senza dover ricreare
  // da zero la connessione (che resta la stessa per tutta la sessione).
  const socketRef = useRef(null);
  // Consolidamento connessioni (31/8, richiesta esplicita per
  // alleggerire l'app su reti deboli): prima CheckinRadar.jsx e
  // ChatWindow.jsx aprivano CIASCUNO una propria connessione
  // separata, oltre a questa — tre "strette di mano" invece di
  // una sola, tre volte il traffico di mantenimento. Ora questa
  // stessa connessione viene condivisa con loro. Serve uno STATO
  // vero in più (non solo il ref sopra) perché un ref non fa
  // ripetere il render dei figli quando cambia — passare
  // socketRef.current direttamente come prop non li avrebbe mai
  // avvisati che la connessione era pronta.
  const [sharedSocket, setSharedSocket] = useState(null);

  // --------------------------------------------------------
  // Connessione WebSocket "trasversale"
  // --------------------------------------------------------
  useEffect(() => {
    if (authState !== 'app' || !userId) return;
    const socket = io(API_BASE);
    socketRef.current = socket;
    setSharedSocket(socket);

    // A OGNI connessione, non una volta sola (bug B1, 2/10): dopo un
    // blocco schermo, una rete persa o l'app in background, socket.io
    // si riconnette da solo ma il server vede un socket nuovo, in
    // nessuna stanza — niente più Pulse, Superlike, match e chat, e la
    // chiusura del vecchio socket aveva già tolto la persona dal radar
    // degli altri. Rientrare nella stanza dell'Arena la rimette nel
    // radar (o, se il geofence l'aveva messa fuori, fa arrivare
    // arena_access_denied qui sotto).
    socket.on('connect', () => {
      socket.emit('join_private_room', { userId });
      if (arenaSessionIdRef.current) {
        socket.emit('join_arena', { arenaSessionId: arenaSessionIdRef.current, userId });
      }
    });

    // Un nuovo messaggio in una chat che NON si sta guardando in
    // questo momento (ChatWindow ha il suo ascoltatore a sé per
    // quando è aperta) — qui serve solo per tenere aggiornato il
    // pallino in diretta, senza aspettare il prossimo avvio dell'app.
    // Anche la lista: il messaggio può arrivare da una conversazione
    // che la lista in memoria non conosce ancora (bug dal vivo: con
    // una chat aperta, la nuova persona compariva solo dopo refresh).
    socket.on('chat_message', (payload) => {
      refreshUnreadChatCount();
      refreshActiveChats();
      // Non per la chat che si sta già guardando
      if (payload?.conversationId !== activeChatConversationIdRef.current) buzz('normal');
    });

    socket.on('pulse_received', (payload) => {
      setPendingPulseNotification(payload);
      refreshPulseBadge();
      refreshNotificationBadge();
      refreshLikeCenterBadge();
      buzz('strong');
    });

    // Solo per vibrare: il banner del Like resta legato a points_update
    // qui sotto. like_received arriva sempre, anche oltre il tetto dei
    // Like che danno punti, quando points_update non parte.
    // Anche i pallini del campanello (bug B17) e dell'icona Like (bug
    // B18, 2/10): prima si leggevano solo all'avvio dell'app (quello
    // Like anche col banner, ma mai per Superlike e Pulse), e nessun
    // altro evento in arrivo li aggiornava.
    socket.on('like_received', () => {
      refreshNotificationBadge();
      refreshLikeCenterBadge();
      buzz('normal');
    });

    // Mancava del tutto — il backend gestiva già accetta/rifiuta/
    // ignora per un Superlike puro, ma senza questo ascoltatore chi
    // lo riceveva non lo scopriva mai (nessuna schermata compariva).
    socket.on('superlike_received', (payload) => {
      setPendingSuperlike(payload);
      refreshNotificationBadge();
      refreshLikeCenterBadge();
      buzz('strong');
    });

    // Motore unico dei popup punti — v. pointsIconFor sopra. Il
    // filtro sull'userId è necessario perché questo evento è
    // pubblico a tutta l'Arena (serve alla classifica), non
    // privato: dobbiamo mostrare il popup SOLO per i punti nostri,
    // mai per quelli di un'altra persona che vediamo aggiornarsi.
    socket.on('points_update', (payload) => {
      if (payload.userId === userId) {
        if (payload.source === 'like_received') {
          // Notifica più ricca al posto del popup punti generico
          // per questo caso specifico — stile Facebook, si azzera
          // da sola dopo qualche secondo. I punti restano comunque
          // conteggiati normalmente, semplicemente il modo in cui
          // vengono comunicati è diverso da un generico "+5 punti".
          setShowLikeReceivedBanner(true);
          setTimeout(() => setShowLikeReceivedBanner(false), 6000);
          refreshLikeCenterBadge();
        } else {
          showPointsToast(
            pointsIconFor(payload.source),
            payload.points,
            pointsLabelFor(payload.source)
          );
        }
      }
    });

    // Hai superato il tetto dei Like che generano punti in questa
    // Arena — un avviso una sola volta (il server lo manda solo al
    // momento esatto del superamento, non ripetutamente), con la
    // proposta di sbloccarne altri 10.
    socket.on('like_limit_reached', () => {
      offerLikeCreditsPurchase();
    });

    // Rientro nel radar rifiutato: il check-in era stato chiuso per
    // distanza (geofence) e serve una nuova scansione del QR.
    socket.on('arena_access_denied', () => {
      handleLeftVenue();
    });

    socket.on('chat_unlocked', (payload) => {
      // Sempre, anche con un'altra chat aperta: niente banner in quel
      // caso, ma la nuova conversazione deve comunque stare in lista.
      refreshActiveChats();
      refreshNotificationBadge();
      // Chi ha appena accettato lui stesso un Superlike o una Pulse (da
      // qualunque schermata) non ha bisogno di sentire vibrare la
      // propria scelta — v. isRecentOwnDecision in apiClient.js.
      if (!isRecentOwnDecision()) buzz('strong');
      if (!activeChatConversationIdRef.current) {
        setPendingMatches((prev) =>
          prev.some((m) => m.conversationId === payload.conversationId)
            ? prev
            : [...prev, { conversationId: payload.conversationId, withUserId: payload.withUserId }]
        );
        setShowMatchBanner(true);
        setTimeout(() => setShowMatchBanner(false), 10000);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSharedSocket(null);
    };
  }, [
    authState,
    userId,
    showPointsToast,
    pointsIconFor,
    pointsLabelFor,
    offerLikeCreditsPurchase,
    refreshPulseBadge,
    refreshLikeCenterBadge,
    refreshUnreadChatCount,
    refreshActiveChats,
    handleLeftVenue,
    buzz,
    refreshNotificationBadge,
  ]);

  // App riaperta dal background (o scheda tornata visibile): il
  // socket si riconnette da solo ma gli eventi persi nel frattempo
  // non tornano — rileggiamo dal server lista chat e pallino.
  // onAppForeground (native.js): nell'app l'evento nativo, perché su
  // iPhone visibilitychange non arriva in modo affidabile.
  useEffect(() => {
    if (authState !== 'app' || !userId) return;
    // Anche all'apertura, non solo al ritorno dal background: la
    // posizione per le missioni va tenuta aggiornata (v. apiClient.js).
    refreshLocationIfConsented(userId);
    return onAppForeground(() => {
      refreshActiveChats();
      refreshUnreadChatCount();
      refreshLocationIfConsented(userId);
      verifyStillAtVenue();
    });
  }, [authState, userId, refreshActiveChats, refreshUnreadChatCount, verifyStillAtVenue]);

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

  if (authState === 'connection_error') {
    // Problema di RETE, non di sessione — il token salvato resta
    // intatto (mai cancellato qui), si riprova semplicemente a
    // ricontattare il server.
    mainContent = (
      <div className="pl-app-shell">
        <div
          className="pl-content"
          style={{
            paddingTop: 20,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '100dvh',
            textAlign: 'center',
          }}
        >
          <div className="pl-brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
            Popu<span className="pl-brand-live">Live</span>
          </div>
          <p className="pl-hint" style={{ marginBottom: 16 }}>
            Non riesco a contattare il server — controlla la connessione e riprova. Il tuo accesso
            resta salvato, non serve rifare login.
          </p>
          <button
            className="pl-send-btn"
            onClick={checkExistingSession}
            style={{ maxWidth: 200, margin: '0 auto' }}
          >
            Riprova
          </button>
        </div>
      </div>
    );
  } else if (authState === 'login') {
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
          <div className="pl-top-bar-left">
            <div className="pl-brand">
              Popu<span className="pl-brand-live">Live</span>
            </div>
            <button
              className={`pl-top-icon pl-ranking-icon ${activeTab === 'locale' ? 'active' : ''}`}
              onClick={() => navigateToTab('locale')}
            >
              <Trophy size={22} />
              <span className="pl-top-icon-label">Locale</span>
            </button>
            <button
              className={`pl-top-icon pl-ranking-icon ${activeTab === 'globale' ? 'active' : ''}`}
              onClick={() => navigateToTab('globale')}
            >
              <Globe size={22} />
              <span className="pl-top-icon-label">Globale</span>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {arenaSessionId && (
              <div className="pl-arena-pill">
                <span className="pl-live-dot"></span> Arena attiva
              </div>
            )}
            <button
              onClick={() => navigateToTab('notification_center')}
              style={{
                position: 'relative',
                background: 'none',
                border: 'none',
                color: activeTab === 'notification_center' ? 'var(--cyan)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
              }}
            >
              <Bell size={20} />
              {notificationBadgeCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    background: 'var(--cyan)',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 700,
                    minWidth: 15,
                    height: 15,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 3px',
                  }}
                >
                  {notificationBadgeCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div
          className={`pl-content ${tabSlideDirection === 'forward' ? 'pl-tab-panel-forward' : 'pl-tab-panel-back'}`}
          key={activeTab}
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          {activeTab === 'radar' && (
            <>
              <CheckinRadar
                key={radarResetKey}
                userId={userId}
                venueId={venueId}
                onArenaSession={handleArenaSession}
                exitNotice={leftVenueNotice}
                autoCheckin={arrivedViaQr}
                resumeSessionId={resumeSessionId}
                onResumeExpired={handleResumeExpired}
                onVenueIdDetected={setVenueId}
                sharedSocket={sharedSocket}
              />
              {featureFlags.historical_board && (
                <button
                  onClick={() => setVenuesMapMode('historical')}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: 12,
                    borderRadius: 14,
                    border: '1px solid rgba(228,212,200,0.2)',
                    background: 'var(--surface)',
                    color: 'var(--teak)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                  }}
                >
                  <History size={14} /> Bacheca storica dei locali
                </button>
              )}
              {featureFlags.venues_map && (
                <button
                  onClick={() => setVenuesMapMode('browse')}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: 12,
                    borderRadius: 14,
                    border: '1px solid rgba(228,212,200,0.2)',
                    background: 'var(--surface)',
                    color: 'var(--teak)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                  }}
                >
                  <Map size={14} /> Sfoglia tutti i locali sulla mappa
                </button>
              )}
              {featureFlags.sponsored_missions && (
                <button
                  onClick={() => setShowNearbyMissions(true)}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: 12,
                    borderRadius: 14,
                    border: '1px solid rgba(228,212,200,0.2)',
                    background: 'var(--surface)',
                    color: 'var(--teak)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                  }}
                >
                  <Target size={14} /> Missioni vicino a te
                </button>
              )}
            </>
          )}

          {activeTab === 'locale' && arenaSessionId && (
            <LiveRanking
              arenaSessionId={arenaSessionId}
              currentUserId={userId}
              venueId={venueId}
              onSelectSelf={() => setActiveTab('profilo')}
            />
          )}
          {activeTab === 'locale' && !arenaSessionId && (
            <div className="pl-hint" style={{ textAlign: 'center', marginTop: 40 }}>
              Fai check-in in un'Arena per sbloccare la classifica locale.
            </div>
          )}

          {activeTab === 'globale' && (
            <LiveRanking
              arenaSessionId={null}
              currentUserId={userId}
              isGlobal
              onSelectSelf={() => setActiveTab('profilo')}
            />
          )}

          {activeTab === 'chat_list' && (
            <ChatCenter
              pendingMatches={pendingMatches}
              activeChats={activeChats}
              onOpenMatch={openMatch}
              arenaSessionId={arenaSessionId}
            />
          )}

          {activeTab === 'notification_center' && (
            <NotificationCenter
              userId={userId}
              onSeen={() => setNotificationBadgeCount(0)}
              arenaSessionId={arenaSessionId}
              venueId={venueId}
              onOpenChat={openMatch}
            />
          )}

          {activeTab === 'like_center' && (
            <LikeCenter
              userId={userId}
              arenaSessionId={arenaSessionId}
              venueId={venueId}
              onOpenChat={openMatch}
              onSeen={() => setLikeCenterBadgeCount(0)}
            />
          )}

          {activeTab === 'pulse' && (
            <MyPulses
              userId={userId}
              venueId={venueId}
              arenaSessionId={arenaSessionId}
              onOpenPulse={(pulse) => setPendingPulseNotification(pulse)}
              onPulseListChanged={refreshPulseBadge}
            />
          )}

          {activeTab === 'profilo' && (
            <>
              <MyProfile
                userId={userId}
                arenaSessionId={arenaSessionId}
                onOpenSettings={() => setShowSettings(true)}
              />
              <ComingSoonSection />
            </>
          )}

          {activeTab === 'chat' && activeChatConversationId && (
            <ChatWindow
              conversationId={activeChatConversationId}
              currentUserId={userId}
              otherUserName={activeChatOtherUserName || 'questa persona'}
              onMarkedRead={handleChatMarkedRead}
              sharedSocket={sharedSocket}
            />
          )}
        </div>

        {/* Niente più portale né position:fixed (24/8, terzo
          ripensamento) — dopo diversi tentativi di "inseguire" la
          barra dinamica di Safari con CSS/JS sempre più elaborati,
          la soluzione più robusta è evitare del tutto position:fixed
          per questo elemento: resta un normale elemento del flusso
          flessibile di .pl-app-shell (che già usa 100dvh, l'altezza
          vera dello schermo), ultimo figlio dopo .pl-content — non
          deve più "inseguire" nessun bordo, ci sta semplicemente
          perché il contenitore che lo ospita è già dimensionato
          bene. Elimina alla radice l'intera classe di bug di Safari
          con gli elementi fissi dentro contenitori che scorrono. */}
        <div className="pl-bottom-nav">
          <NavItem
            icon={RadarIcon}
            label="Radar"
            active={activeTab === 'radar'}
            onClick={() => navigateToTab('radar')}
          />
          <NavItem
            icon={Heart}
            label="Like"
            active={activeTab === 'like_center'}
            onClick={() => navigateToTab('like_center')}
            badge={likeCenterBadgeCount}
          />
          <NavItem
            icon={MessageCircle}
            label="Chat"
            active={activeTab === 'chat_list'}
            onClick={() => navigateToTab('chat_list')}
            badge={chatTabBadgeCount}
          />
          <NavItem
            icon={PulseWaveIcon}
            label="Pulse"
            active={activeTab === 'pulse'}
            onClick={() => navigateToTab('pulse')}
            badge={pulseBadgeCount}
          />
          <NavItem
            icon={User}
            label="Profilo"
            active={activeTab === 'profilo'}
            onClick={() => navigateToTab('profilo')}
          />
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
          <MissionClaim missionId={pendingMissionId} onClose={() => setPendingMissionId(null)} />
        )}

        {venuesMapMode && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                background: 'var(--surface)',
                borderRadius: '24px 24px 0 0',
                padding: 20,
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <VenuesMap
                currentUserId={userId}
                onClose={() => setVenuesMapMode(null)}
                mode={venuesMapMode}
              />
            </div>
          </div>
        )}

        {showNearbyMissions && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                background: 'var(--surface)',
                borderRadius: '24px 24px 0 0',
                padding: 20,
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <NearbyMissions onClose={() => setShowNearbyMissions(false)} />
            </div>
          </div>
        )}

        {showSettings && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                background: 'var(--surface)',
                borderRadius: '24px 24px 0 0',
                padding: 20,
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <Settings
                userId={userId}
                onClose={() => {
                  setShowSettings(false);
                  refreshHapticSetting();
                }}
                onAccountDeleted={() => {
                  clearSession();
                  setAuthState('login');
                }}
              />
            </div>
          </div>
        )}

        {pendingPulseNotification && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                background: 'var(--surface)',
                borderRadius: '24px 24px 0 0',
                padding: 20,
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <PulseNotification
                pulse={pendingPulseNotification}
                currentUserId={userId}
                arenaSessionId={arenaSessionId}
                venueId={venueId}
                onResolved={(result) => {
                  setPendingPulseNotification(null);
                  refreshPulseBadge();
                  if (result?.conversationId) openMatch(result.conversationId);
                }}
              />
            </div>
          </div>
        )}

        {pendingSuperlike && (
          <SuperlikeNotification
            superlike={pendingSuperlike}
            currentUserId={userId}
            arenaSessionId={arenaSessionId}
            venueId={venueId}
            onResolved={(result) => {
              setPendingSuperlike(null);
              // "Accetta — apri la chat": la apriamo davvero (bug B11,
              // 2/10). Prima si chiudeva solo la finestra e restava il
              // banner del match da toccare.
              if (result?.action === 'accept' && result.conversationId) {
                openMatch(result.conversationId);
              }
            }}
          />
        )}

        {/* Notifica di match — stile Tinder, discreta e toccabile, mai
          un salto forzato alla chat. Sparisce da sola se ignorata
          per un po', ma resta lì abbastanza a lungo da poterla
          notare e toccare con calma. */}
        {showLikeReceivedBanner && (
          <div
            onClick={() => {
              setActiveTab('like_center');
              setShowLikeReceivedBanner(false);
            }}
            style={{
              position: 'fixed',
              top: 70,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 71,
              width: 'calc(100% - 32px)',
              maxWidth: 380,
              background: 'var(--surface-2)',
              border: '1px solid rgba(255,61,110,0.4)',
              borderRadius: 16,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: 'var(--shadow-glow-cyan)',
              cursor: 'pointer',
            }}
          >
            <span className="pl-confirm-wave-wrap" style={{ position: 'relative', flexShrink: 0 }}>
              <span className="pl-confirm-wave"></span>
              <span className="pl-confirm-wave"></span>
              <Heart size={20} color="var(--cyan)" />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 13 }}>
                Hai ricevuto un nuovo Like!
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tocca per vedere chi è</div>
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setShowLikeReceivedBanner(false);
              }}
              style={{ color: 'var(--text-muted)', fontSize: 16, padding: 4, cursor: 'pointer' }}
            >
              ✕
            </span>
          </div>
        )}

        {showMatchBanner && pendingMatches.length > 0 && (
          <div
            onClick={() => openMatch(pendingMatches[pendingMatches.length - 1].conversationId)}
            style={{
              position: 'fixed',
              top: 70,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 71,
              width: 'calc(100% - 32px)',
              maxWidth: 380,
              background: 'var(--surface-2)',
              border: '1px solid rgba(255,61,110,0.4)',
              borderRadius: 16,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: 'var(--shadow-glow-cyan)',
              cursor: 'pointer',
            }}
          >
            <span className="pl-confirm-wave-wrap" style={{ position: 'relative', flexShrink: 0 }}>
              <span className="pl-confirm-wave"></span>
              <span className="pl-confirm-wave"></span>
              <PulseWaveIcon size={20} color="var(--cyan)" />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 13 }}>
                {pendingMatches.length > 1
                  ? `${pendingMatches.length} nuovi match!`
                  : 'È un match!'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Tocca per aprire la chat — resta anche sul tuo profilo
              </div>
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setShowMatchBanner(false);
              }}
              style={{ color: 'var(--text-muted)', fontSize: 16, padding: 4, cursor: 'pointer' }}
            >
              ✕
            </span>
          </div>
        )}

        {/* Popup punti — impilati se ne arriva più di uno vicino nel
          tempo, ognuno sparisce da solo dopo un paio di secondi. */}
        <div
          style={{
            position: 'fixed',
            top: 70,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 70,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          {pointsToasts.map((t) => (
            <div
              key={t.id}
              className="pl-confirm-wave-wrap"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--surface-2)',
                border: '1px solid rgba(255,61,110,0.4)',
                borderRadius: 999,
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
                boxShadow: 'var(--shadow-lg)',
                animation: 'pl-toast-in 0.25s ease-out',
              }}
            >
              <span className="pl-confirm-wave"></span>
              <span className="pl-confirm-wave"></span>
              <span className="pl-confirm-wave"></span>
              <t.icon size={16} />
              <span style={{ color: 'var(--cyan)' }}>
                +{t.points} {t.label || 'punti'}
              </span>
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
    return isColdStart ? (
      <SplashScreen fadingOut={splashFadingOut} onExited={() => setShowSplash(false)} />
    ) : (
      <ReloadLoader fadingOut={splashFadingOut} onExited={() => setShowSplash(false)} />
    );
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
    {
      icon: Target,
      title: 'Missioni Sponsorizzate',
      sub: 'I brand potranno invitarti, con una notifica geolocalizzata, a visitare un loro punto vendita per ottenere punti bonus — sempre con il tuo consenso esplicito.',
    },
    {
      icon: Wallet,
      title: 'Wallet PopuLive',
      sub: 'Mance libere P2P e PopuLive Card, in arrivo con la fintech.',
    },
  ];
  return (
    <div style={{ marginTop: 16 }}>
      <div className="pl-section-label">In arrivo</div>
      {items.map((item) => (
        <div
          key={item.title}
          style={{
            background: 'var(--surface)',
            border: '1px solid rgba(228,212,200,0.12)',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--teak)',
              background: 'rgba(228,212,200,0.14)',
              padding: '2px 8px',
              borderRadius: 6,
            }}
          >
            Coming Soon
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'Unbounded',sans-serif",
              fontWeight: 700,
              fontSize: 13,
              margin: '6px 0 3px',
            }}
          >
            <item.icon size={14} /> {item.title}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {item.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

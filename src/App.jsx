import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

import Login from './Login';
import ProfileCreation from './ProfileCreation';
import CheckinRadar from './CheckinRadar';
import LiveRanking from './LiveRanking';
import { RosaNotification } from './RosaFlow';
import ChatWindow from './ChatWindow';
import Settings from './Settings';
import MyRoses from './MyRoses';
import MyProfile from './MyProfile';
import ExploreMap from './ExploreMap';
import { API_BASE, apiFetch, getToken, getStoredUserId, clearSession } from './apiClient';

import './populive-styles.css';

export default function App() {
  const [authState, setAuthState] = useState('checking');
  const [userId, setUserId] = useState(null);

  const [venueId, setVenueId] = useState('f923e9c8-c47f-40d6-a4b8-98afe38d43cc');
  const [arrivedViaQr, setArrivedViaQr] = useState(false);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/checkin\/([a-zA-Z0-9-]+)/);
    if (match) {
      setVenueId(match[1]);
      setArrivedViaQr(true);
      window.history.replaceState(null, '', '/');
    }
  }, []);

  const [arenaSessionId, setArenaSessionId] = useState(null);

  const [activeTab, setActiveTab] = useState('radar');
  const [pendingRosaNotification, setPendingRosaNotification] = useState(null);
  const [activeChatConversationId, setActiveChatConversationId] = useState(null);
  const [roseBadgeCount, setRoseBadgeCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showExploreMap, setShowExploreMap] = useState(false);
  const [pointsToasts, setPointsToasts] = useState([]);

  const showPointsToast = useCallback((icon, points) => {
    const id = Date.now() + Math.random();
    setPointsToasts((prev) => [...prev, { id, icon, points }]);
    setTimeout(() => {
      setPointsToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const pointsIconFor = useCallback((source) => {
    const base = source.replace(/_sent$/, '');
    const icons = {
      profile_view: '👀',
      like_received: '❤️',
      superlike_received: '⭐',
      rosa_standalone: '🌹',
      rosa_like: '🌹',
      rosa_super: '🌹',
      rosa_guess_won: '🎉',
      mission_completed: '🎯',
      connector_discovery_bonus: '🔗',
    };
    return icons[base] || '✨';
  }, []);

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

  const socketRef = useRef(null);

  useEffect(() => {
    if (authState !== 'app' || !userId) return;
    const socket = io(API_BASE);
    socketRef.current = socket;
    socket.emit('join_private_room', { userId });

    socket.on('rosa_received', (payload) => {
      setPendingRosaNotification(payload);
      setRoseBadgeCount((n) => n + 1);
    });

    socket.on('points_update', (payload) => {
      if (payload.userId === userId) {
        showPointsToast(pointsIconFor(payload.source), payload.points);
      }
    });

    socket.on('chat_unlocked', (payload) => {
      setActiveChatConversationId((prev) => prev || payload.conversationId);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authState, userId, showPointsToast, pointsIconFor]);

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

  if (authState === 'checking') {
    return (
      <div className="pl-app-shell">
        <div className="pl-content" style={{ paddingTop: 40, textAlign: 'center' }}>
          <div className="pl-hint">Caricamento…</div>
        </div>
      </div>
    );
  }

  if (authState === 'login') {
    return (
      <div className="pl-app-shell">
        <div className="pl-content" style={{ paddingTop: 20 }}>
          <div className="pl-brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
            Popu<span className="pl-brand-live">Live</span>
          </div>
          <Login onLoggedIn={handleLoggedIn} />
        </div>
      </div>
    );
  }

  if (authState === 'onboarding') {
    return (
      <div className="pl-app-shell">
        <div className="pl-content" style={{ paddingTop: 20 }}>
          <div className="pl-brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
            Popu<span className="pl-brand-live">Live</span>
          </div>
          <ProfileCreation onComplete={handleOnboardingComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="pl-app-shell">
      <div className="pl-top-bar">
        <div className="pl-brand">Popu<span className="pl-brand-live">Live</span></div>
        {arenaSessionId && <div className="pl-arena-pill">🔴 Arena attiva</div>}
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
            <button
              onClick={() => setShowExploreMap(true)}
              style={{ marginTop: 12, width: '100%', padding: 12, borderRadius: 14, border: '1px solid rgba(228,212,200,0.2)', background: 'var(--surface)', color: 'var(--teak)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
            >
              🗺️ Esplora altri locali nella zona
            </button>
          </>
        )}

        {activeTab === 'locale' && arenaSessionId && (
          <LiveRanking arenaSessionId={arenaSessionId} currentUserId={userId} venueId={venueId} onSelectSelf={() => setActiveTab('profilo')} />
        )}
        {activeTab === 'locale' && !arenaSessionId && (
          <div className="pl-hint" style={{ textAlign: 'center', marginTop: 40 }}>
            Fai check-in in un'Arena per vedere la classifica di stanotte.
          </div>
        )}

        {activeTab === 'globale' && (
          <LiveRanking arenaSessionId={null} currentUserId={userId} isGlobal onSelectSelf={() => setActiveTab('profilo')} />
        )}

        {activeTab === 'rose' && (
          <MyRoses userId={userId} onOpenRosa={(rosa) => setPendingRosaNotification(rosa)} />
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
        <NavItem icon="📡" label="Radar" active={activeTab === 'radar'} onClick={() => setActiveTab('radar')} />
        <NavItem icon="🏆" label="Stanotte" active={activeTab === 'locale'} onClick={() => setActiveTab('locale')} />
        <NavItem icon="🌍" label="Globale" active={activeTab === 'globale'} onClick={() => setActiveTab('globale')} />
        <NavItem icon="🌹" label="Rose" active={activeTab === 'rose'} onClick={() => setActiveTab('rose')} badge={roseBadgeCount} />
        <NavItem icon="🙂" label="Profilo" active={activeTab === 'profilo'} onClick={() => setActiveTab('profilo')} />
      </div>

      {showExploreMap && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: 20, maxHeight: '85vh', overflowY: 'auto' }}>
            <ExploreMap onClose={() => setShowExploreMap(false)} />
          </div>
        </div>
      )}

      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: 20 }}>
            <Settings userId={userId} onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {pendingRosaNotification && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: '24px 24px 0 0', padding: 20 }}>
            <RosaNotification
              rosa={pendingRosaNotification}
              currentUserId={userId}
              arenaSessionId={arenaSessionId}
              onResolved={() => {
                setPendingRosaNotification(null);
                setRoseBadgeCount((n) => Math.max(0, n - 1));
              }}
            />
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 70, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
        {pointsToasts.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface-2)', border: '1px solid rgba(47,211,232,0.4)',
              borderRadius: 999, padding: '9px 16px',
              fontSize: 13, fontWeight: 700, color: 'var(--text)',
              boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)',
              animation: 'pl-toast-in 0.25s ease-out',
            }}
          >
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            <span style={{ color: 'var(--cyan)' }}>+{t.points} punti</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button className={`pl-nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="pl-nav-ic">{icon}</span>
      <span className="pl-nav-label">{label}</span>
      {!!badge && <span className="pl-nav-badge">{badge}</span>}
    </button>
  );
}

function ComingSoonSection() {
  const items = [
    { icon: '🎯', title: 'Missioni Sponsorizzate', sub: 'I brand potranno invitarti, con una notifica geolocalizzata, a visitare un loro punto vendita per ottenere punti bonus — sempre con il tuo consenso esplicito.' },
    { icon: '🕰️', title: 'Bacheca Storica', sub: 'Hai visto qualcuno in un locale ma non hai fatto in tempo a interagire? Potrai cercarlo tra chi ha fatto check-in lì nei giorni scorsi — il tuo profilo resta sempre visibile a chi cerchi.' },
    { icon: '💳', title: 'Wallet PopuLive', sub: 'Mance libere P2P e PopuLive Card, in arrivo con la fintech.' },
  ];
  return (
    <div style={{ marginTop: 16 }}>
      <div className="pl-section-label">In arrivo</div>
      {items.map((item) => (
        <div key={item.title} style={{ background: 'var(--surface)', border: '1px solid rgba(228,212,200,0.12)', borderRadius: 16, padding: 14, marginBottom: 10 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--teak)', background: 'rgba(228,212,200,0.14)', padding: '2px 8px', borderRadius: 6 }}>
            Coming Soon
          </span>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, margin: '6px 0 3px' }}>{item.icon} {item.title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{item.sub}</div>
        </div>
      ))}
    </div>
  );
}

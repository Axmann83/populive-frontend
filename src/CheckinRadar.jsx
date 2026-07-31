import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { apiFetch } from './apiClient';
import ProfileFullScreen from './ProfileFullScreen';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

export default function CheckinRadar({ userId, venueId, onArenaSession, autoCheckin }) {
  const [arenaActive, setArenaActive] = useState(false);
  const [checkinCount, setCheckinCount] = useState(0);
  const [threshold, setThreshold] = useState(20);
  const [radarPeople, setRadarPeople] = useState([]);
  const [arenaSessionId, setArenaSessionId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorReason, setErrorReason] = useState(null);
  const [socketInstance, setSocketRef] = useState(null);
  const [showTableJoin, setShowTableJoin] = useState(false);
  const [tableCode, setTableCode] = useState('');
  const [wantsConnector, setWantsConnector] = useState(false);
  const [tableJoined, setTableJoined] = useState(false);
  const [tableJoinLoading, setTableJoinLoading] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState(null);

  const handleJoinTable = useCallback(async () => {
    if (!tableCode.trim()) return;
    setTableJoinLoading(true);
    try {
      const res = await apiFetch('/api/table/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableQrCode: tableCode.trim(),
          arenaSessionId,
          wantsToBeConnector: wantsConnector,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTableJoined(true);
        setShowTableJoin(false);
      }
    } finally {
      setTableJoinLoading(false);
    }
  }, [tableCode, wantsConnector, arenaSessionId]);

  useEffect(() => {
    const socket = io(API_BASE);

    socket.on('radar_update', (payload) => {
      if (payload.type === 'new_checkin') {
        setCheckinCount(payload.checkinCount);
        setThreshold(payload.threshold);
      }
    });

    socket.on('arena_activated', () => {
      setArenaActive(true);
    });

    socket.on('presence_update', (payload) => {
      if (payload.userId === userId) return;

      setRadarPeople((prev) => {
        if (payload.type === 'joined') {
          if (prev.some((p) => p.userId === payload.userId)) return prev;
          return [...prev, { userId: payload.userId, joinedAt: Date.now() }];
        }
        if (payload.type === 'left') {
          return prev.filter((p) => p.userId !== payload.userId);
        }
        return prev;
      });
    });

    socket.on('radar_snapshot', ({ userIds }) => {
      setRadarPeople((prev) => {
        const existingIds = new Set(prev.map((p) => p.userId));
        const newEntries = userIds
          .filter((id) => id !== userId && !existingIds.has(id))
          .map((id) => ({ userId: id, joinedAt: Date.now() }));
        return [...prev, ...newEntries];
      });
    });

    setSocketRef(socket);
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScanQr = useCallback(async () => {
    setStatus('checking_in');
    setErrorReason(null);

    try {
      const res = await apiFetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      });
      const data = await res.json();

      if (!data.success) {
        setStatus('error');
        setErrorReason(data.reason);
        return;
      }

      setCheckinCount(data.checkinCount);
      setThreshold(data.threshold);
      setArenaActive(data.arenaActive);
      setStatus('checked_in');

      if (socketInstance && data.arenaSessionId) {
        socketInstance.emit('join_arena', { arenaSessionId: data.arenaSessionId, userId });
        setArenaSessionId(data.arenaSessionId);
        onArenaSession?.(data.arenaSessionId);
      }
    } catch (err) {
      setStatus('error');
      setErrorReason('network_error');
    }
  }, [userId, venueId, socketInstance, onArenaSession]);

  useEffect(() => {
    if (autoCheckin && status === 'idle' && socketInstance) {
      handleScanQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckin, socketInstance, status]);

  if (status === 'idle' || status === 'checking_in') {
    return (
      <div className="pl-screen">
        <div className="pl-venue-tag">Arena non ancora attiva</div>
        <button
          className="pl-qr-frame"
          onClick={handleScanQr}
          disabled={status === 'checking_in'}
        >
          {status === 'checking_in' ? '…' : '▦'}
        </button>
        <p className="pl-scan-cta">
          {status === 'checking_in'
            ? 'Verifica in corso…'
            : "Inquadra il QR code all'ingresso dell'Arena"}
        </p>
      </div>
    );
  }

  if (status === 'error') {
    const messages = {
      venue_closed: 'Questo locale non è ancora aperto secondo i suoi orari.',
      onboarding_incomplete: 'Devi completare la registrazione prima di fare check-in.',
      network_error: 'Non siamo riusciti a raggiungere il server — riprova.',
    };
    return (
      <div className="pl-screen">
        <p className="pl-error">{messages[errorReason] || 'Qualcosa è andato storto.'}</p>
        <button className="pl-retry-btn" onClick={handleScanQr}>Riprova</button>
      </div>
    );
  }

  return (
    <div className="pl-screen">
      {arenaActive ? (
        <>
          <h2>Il radar è live</h2>
          {(() => {
            const othersOnly = radarPeople.filter((p) => p.userId !== userId);
            return (
              <>
                <p>{othersOnly.length} persone connesse ora</p>
                <div className="pl-radar-list">
                  {othersOnly.map((p) => (
                    <RadarCard
                      key={p.userId}
                      personId={p.userId}
                      arenaSessionId={arenaSessionId}
                      viewerId={userId}
                      onClick={() => setSelectedProfileUserId(p.userId)}
                    />
                  ))}
                </div>
              </>
            );
          })()}
        </>
      ) : (
        <>
          <h2>Sei dentro l'Arena</h2>
          <div className="pl-counter">{checkinCount}/{threshold}</div>
          <p>I tuoi punti si stanno già accumulando — la classifica si sblocca al raggiungimento della soglia.</p>
        </>
      )}

      {tableJoined ? (
        <div className="pl-hint" style={{ textAlign: 'center', marginTop: 14 }}>
          ✓ Agganciato al tavolo — i bonus di spesa si divideranno con chi altro si unisce.
        </div>
      ) : !showTableJoin ? (
        <button
          onClick={() => setShowTableJoin(true)}
          style={{ marginTop: 14, width: '100%', padding: 12, borderRadius: 14, border: '1px dashed rgba(228,212,200,0.3)', background: 'transparent', color: 'var(--teak)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          🪑 Aggancia il tuo tavolo
        </button>
      ) : (
        <div className="pl-sheet" style={{ marginTop: 14 }}>
          <input
            value={tableCode}
            onChange={(e) => setTableCode(e.target.value)}
            placeholder="Codice QR del tavolo (demo: scrivilo qui)"
          />
          <div className="pl-consent-row">
            <div>
              <div className="pl-consent-label">Vuoi essere il Top Connector di questo gruppo?</div>
              <div className="pl-consent-sub">Chiesto solo se sei il primo ad agganciare questo tavolo</div>
            </div>
            <input type="checkbox" checked={wantsConnector} onChange={(e) => setWantsConnector(e.target.checked)} />
          </div>
          <button className="pl-send-btn" onClick={handleJoinTable} disabled={!tableCode.trim() || tableJoinLoading}>
            {tableJoinLoading ? 'Un attimo…' : 'Conferma'}
          </button>
        </div>
      )}

      {selectedProfileUserId && (
        <ProfileFullScreen
          userId={selectedProfileUserId}
          arenaSessionId={arenaSessionId}
          currentUserId={userId}
          venueId={venueId}
          onClose={() => setSelectedProfileUserId(null)}
        />
      )}
    </div>
  );
}

function RadarCard({ personId, arenaSessionId, viewerId, onClick }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/users/${personId}/public-profile?arenaSessionId=${arenaSessionId || ''}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data.success) setPreview(data.profile); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [personId, arenaSessionId]);

  const badgeColors = getBadgeRingColors(preview);

  return (
    <div className="pl-radar-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <span className="pl-radar-card-avatar" style={ringStyleFor(badgeColors)}>
        {preview?.photoUrl
          ? <img src={preview.photoUrl} alt={preview.displayName} />
          : (preview?.avatarEmoji || '🙂')}
      </span>
      <span className="pl-radar-card-id">{preview?.displayName || 'Caricamento…'}</span>
    </div>
  );
}

function getBadgeRingColors(preview) {
  if (!preview) return [];
  const colors = [];
  if (preview.isTopConnector) colors.push('#C7C9CC');
  if (preview.isTopSpender) colors.push('#E8C77E');
  if (preview.instantInfluencerCategory) colors.push('#E83E8C');
  return colors;
}

function ringStyleFor(colors) {
  if (colors.length === 0) return {};
  if (colors.length === 1) {
    return { border: `2.5px solid ${colors[0]}` };
  }
  const slice = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * slice}% ${(i + 1) * slice}%`).join(', ');
  return {
    border: '2.5px solid transparent',
    background: `linear-gradient(var(--surface-2), var(--surface-2)) padding-box, conic-gradient(${stops}) border-box`,
  };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

export default function LiveRanking({ arenaSessionId, currentUserId, isGlobal }) {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentDeltas, setRecentDeltas] = useState({});
  const prevPositions = useRef({});

  useEffect(() => {
    let cancelled = false;

    async function loadRanking() {
      setLoading(true);
      try {
        const url = isGlobal
          ? `${API_BASE}/api/ranking/global`
          : `${API_BASE}/api/arenas/${arenaSessionId}/ranking`;
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled && data.success) {
          setRanking(data.ranking);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRanking();
    return () => { cancelled = true; };
  }, [arenaSessionId, isGlobal]);

  useEffect(() => {
    if (isGlobal || !arenaSessionId) return;

    const socket = io(API_BASE);
    socket.emit('join_arena', { arenaSessionId, userId: currentUserId });

    socket.on('points_update', (payload) => {
      const { userId, points } = payload;

      setRanking((prev) => {
        const updated = prev.map((entry) =>
          entry.userId === userId
            ? { ...entry, points: entry.points + points }
            : entry
        );
        return updated.sort((a, b) => b.points - a.points).map((e, i) => ({ ...e, rank: i + 1 }));
      });

      const key = Date.now();
      setRecentDeltas((prev) => ({ ...prev, [userId]: { points, key } }));
      setTimeout(() => {
        setRecentDeltas((prev) => {
          if (prev[userId]?.key !== key) return prev;
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }, 1800);
    });

    return () => socket.disconnect();
  }, [arenaSessionId, currentUserId, isGlobal]);

  if (loading) {
    return <div className="pl-ranking-loading">Caricamento classifica…</div>;
  }

  return (
    <div className="pl-ranking-list">
      {ranking.map((entry) => (
        <RankRow
          key={entry.userId}
          entry={entry}
          isMe={entry.userId === currentUserId}
          delta={recentDeltas[entry.userId]}
        />
      ))}
    </div>
  );
}

function RankRow({ entry, isMe, delta }) {
  return (
    <div className={`pl-rank-row ${isMe ? 'pl-rank-row-me' : ''}`}>
      <span className="pl-rank-num">{entry.rank}</span>

      <span className="pl-rank-avatar-wrap">
        <span className="pl-rank-avatar">
          {entry.photoUrl
            ? <img src={entry.photoUrl} alt={entry.displayName} />
            : (entry.avatarEmoji || '🙂')}
        </span>
        <span className="pl-badge-stack">
          {entry.isTopConnector && <span className="pl-badge pl-badge-connector" title="Top Connector">🔗</span>}
          {entry.isTopSpender && <span className="pl-badge pl-badge-spender" title="Top Spender">💰</span>}
          {entry.isFounder && <span className="pl-badge pl-badge-founder" title="Founder">👑</span>}
        </span>
      </span>

      <span className="pl-rank-name">{entry.displayName}</span>

      <span className="pl-rank-points">
        {entry.points} pt
        {delta && (
          <span className="pl-rank-delta" key={delta.key}>+{delta.points}</span>
        )}
      </span>
    </div>
  );
}

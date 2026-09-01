import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { getOptimizedPhotoUrl } from './apiClient';
import ProfileFullScreen from './ProfileFullScreen';
import ProfileDetail from './ProfileDetail';
import AdminChatPanel from './AdminChatPanel';
import { Link2, Coins, Crown } from './PopuLiveIcons';

/**
 * ============================================================
 * POPULIVE — CLASSIFICA LIVE (componente reale)
 * ============================================================
 * Come per CheckinRadar, nessun dato finto: la classifica arriva
 * davvero da /api/arenas/:id/ranking, e si aggiorna in tempo reale
 * grazie all'evento 'points_update' che ogni azione del backend
 * (like, superlike, Pulse, Connector, spesa al tavolo) già manda
 * alla stanza dell'Arena — non serve nessun codice nuovo lato
 * server per questo, era già tutto pronto.
 * ============================================================
 */

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

export default function LiveRanking({ arenaSessionId, currentUserId, isGlobal, venueId, onSelectSelf, isDashboard }) {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [thresholdInfo, setThresholdInfo] = useState(null); // { currentCount, minRequired } — solo per la classifica locale
  const [recentDeltas, setRecentDeltas] = useState({}); // userId -> {points, key} per l'animazione "+N"
  // Chi hai toccato in classifica — apre la schermata giusta a
  // seconda di dove sei: locale → tutto schermo con interazioni,
  // globale → solo profilo di dettaglio (v. sotto il motivo).
  const [selectedProfileUserId, setSelectedProfileUserId] = useState(null);
  // Chi si vuole contattare direttamente dalla dashboard, senza
  // match — SOLO quando isDashboard è vero (26/8).
  const [adminChatTarget, setAdminChatTarget] = useState(null);
  // Filtri — solo per la classifica GLOBALE, non ha senso restringere
  // quella locale (già piccola, legata a un solo locale).
  const [hashtagFilter, setHashtagFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');

  // --------------------------------------------------------
  // Caricamento iniziale della classifica
  // --------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadRanking() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (hashtagFilter.trim()) params.set('hashtag', hashtagFilter.trim());
        if (genderFilter) params.set('gender', genderFilter);
        const qs = params.toString();

        const url = isGlobal
          ? `${API_BASE}/api/ranking/global${qs ? `?${qs}` : ''}`
          : `${API_BASE}/api/arenas/${arenaSessionId}/ranking${qs ? `?${qs}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled && data.success) {
          setRanking(data.ranking);
          setThresholdInfo(data.belowThreshold ? { currentCount: data.currentCount, minRequired: data.minRequired } : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRanking();
    return () => { cancelled = true; };
  }, [arenaSessionId, isGlobal, hashtagFilter, genderFilter]);

  // --------------------------------------------------------
  // Aggiornamenti in tempo reale — SOLO per la classifica locale.
  // La globale (potenzialmente su tutta la base utenti) non ha una
  // singola "stanza" a cui collegarsi: per ora si aggiorna solo al
  // caricamento della schermata, non istante per istante — meno
  // critico della locale, dove l'effetto "live" è il punto centrale
  // dell'esperienza di una serata.
  // --------------------------------------------------------
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

      // Mostra il "+N" fluttuante per un paio di secondi
      const key = Date.now();
      setRecentDeltas((prev) => ({ ...prev, [userId]: { points, key } }));
      setTimeout(() => {
        setRecentDeltas((prev) => {
          if (prev[userId]?.key !== key) return prev; // arrivato un delta più recente nel frattempo
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }, 1800);
    });

    return () => socket.disconnect();
  }, [arenaSessionId, currentUserId, isGlobal]);

  return (
    <div className="pl-ranking-list">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={hashtagFilter}
          onChange={(e) => setHashtagFilter(e.target.value)}
          placeholder="#nightlife…"
          style={{ flex: 1, marginBottom: 0 }}
        />
        <select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
          style={{ width: 110, marginBottom: 0 }}
        >
          <option value="">Tutti</option>
          <option value="female">Donne</option>
          <option value="male">Uomini</option>
          <option value="other">Altro</option>
        </select>
      </div>

      {loading && <div className="pl-ranking-loading">Caricamento classifica…</div>}

      {!loading && thresholdInfo && (
        <div style={{ padding: '0 4px' }}>
          {/* Stessa foto/stile della schermata di attesa check-in —
              qui però il concetto "in attesa" ha davvero senso: si
              aspetta che si raggiunga il numero minimo di persone,
              non solo che qualcuno scansioni. */}
          <div style={{ position: 'relative', aspectRatio: '4/5', borderRadius: 20, overflow: 'hidden', marginBottom: 16, boxShadow: 'var(--shadow-md)' }}>
            <img
              src="https://res.cloudinary.com/rjkegdrp/image/upload/v1786420149/populive_senza_classifica_syju7o.webp"
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%', filter: 'grayscale(100%) contrast(1.08) brightness(0.95)' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,16,15,0.88) 0%, rgba(20,16,15,0.15) 45%, rgba(20,16,15,0.05) 70%)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #FF7A9C, var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -2px rgba(255,61,110,0.5)' }}>
                <Crown size={18} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 16, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                  In attesa che l'Arena si accenda
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>
                  Servono più persone per la classifica
                </div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: '0 8px' }}>
            <p style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
              La classifica si sta ancora scaldando
            </p>
            <p className="pl-hint">
              Servono almeno {thresholdInfo.minRequired} persone connesse per sbloccarla — al momento siete in {thresholdInfo.currentCount}. Il Radar e i tuoi punti funzionano comunque normalmente, e contano già per la classifica generale.
            </p>
          </div>
        </div>
      )}

      {!loading && !thresholdInfo && ranking.length === 0 && (
        <p className="pl-hint" style={{ textAlign: 'center', marginTop: 20 }}>
          Nessuno da mostrare con questi filtri.
        </p>
      )}

      {!loading && !thresholdInfo && ranking.map((entry) => (
        <RankRow
          key={entry.userId}
          entry={entry}
          isMe={entry.userId === currentUserId}
          delta={recentDeltas[entry.userId]}
          onClick={() => {
            // In dashboard, mai i soliti Like/Superlike/Pulse — si
            // apre direttamente la possibilità di scrivere, senza
            // bisogno di nessun match (26/8, richiesta esplicita:
            // per contattare chi si nota emergere in classifica,
            // tipicamente per proporgli un accordo Instant
            // Influencer). Anche toccare la PROPRIA riga qui non fa
            // eccezione — non c'è motivo di escluderla, a differenza
            // dell'app normale dove avrebbe aperto interazioni verso
            // se stessi (qui non ce ne sono).
            if (isDashboard) {
              setAdminChatTarget({ userId: entry.userId, displayName: entry.displayName });
              return;
            }
            // Toccare la PROPRIA riga non apre i bottoni Like/Superlike/
            // Pulse puntati verso se stessi (non avrebbe senso) — ti
            // portiamo invece dritti alla tua tab Profilo, dove hai
            // già foto, punti e impostazioni. Un tocco a vuoto sarebbe
            // un'esperienza povera, anche se "corretta" a modo suo.
            if (entry.userId === currentUserId) {
              onSelectSelf?.();
            } else {
              setSelectedProfileUserId(entry.userId);
            }
          }}
        />
      ))}

      {/* Locale: schermata completa con Like/Superlike/Pulse —
          stesso identico strumento del radar, riusato senza
          duplicare nulla. Globale: solo il profilo di dettaglio,
          niente bottoni di interazione — non ha senso "mandare
          un Pulse" a chi potrebbe essere in un'altra città in
          questo momento, l'intera meccanica presuppone di essere
          nello stesso locale, nella stessa serata. */}
      {selectedProfileUserId && !isGlobal && (
        <ProfileFullScreen
          userId={selectedProfileUserId}
          arenaSessionId={arenaSessionId}
          currentUserId={currentUserId}
          venueId={venueId}
          onClose={() => setSelectedProfileUserId(null)}
        />
      )}
      {selectedProfileUserId && isGlobal && (
        <ProfileDetail
          userId={selectedProfileUserId}
          arenaSessionId={null}
          onBack={() => setSelectedProfileUserId(null)}
          onClose={() => setSelectedProfileUserId(null)}
        />
      )}

      {adminChatTarget && (
        <AdminChatPanel
          targetUserId={adminChatTarget.userId}
          targetDisplayName={adminChatTarget.displayName}
          currentUserId={currentUserId}
          onClose={() => setAdminChatTarget(null)}
        />
      )}
    </div>
  );
}

/**
 * Riga di una singola persona in classifica. Il riordino fluido
 * (tecnica FLIP: registra la posizione prima del cambiamento,
 * anima verso quella nuova) va applicato qui con una libreria
 * come framer-motion in produzione — per ora la riga si limita a
 * mostrare il dato corretto e il delta, l'animazione di movimento
 * è un miglioramento visivo da aggiungere sopra, non blocca la
 * funzionalità.
 */
function RankRow({ entry, isMe, delta, onClick }) {
  return (
    <div className={`pl-rank-row ${isMe ? 'pl-rank-row-me' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <span className="pl-rank-num">{entry.rank}</span>

      {/* La foto reale è sempre protagonista — è quella che serve
          per riconoscere chi hai visto dal vivo nel locale. I badge
          non coprono mai il viso: stanno impilati in un angolino
          dell'avatar (in basso a destra), non accanto al nome —
          stesso pattern sia qui che nel radar, per coerenza visiva. */}
      <span className="pl-rank-avatar-wrap">
        <span className="pl-rank-avatar">
          {entry.photoUrl
            ? <img src={getOptimizedPhotoUrl(entry.photoUrl, { width: 38, height: 38 })} alt={entry.displayName} />
            : (entry.avatarEmoji || '🙂')}
        </span>
        <span className="pl-badge-stack">
          {entry.isTopConnector && <Link2 size={11} color="#C7C9CC" title="Top Connector" />}
          {entry.isTopSpender && <Coins size={11} color="#E8C77E" title="Top Spender" />}
          {entry.isFounder && <Crown size={11} color="#E8C77E" title="Founder" />}
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

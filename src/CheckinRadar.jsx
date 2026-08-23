import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { apiFetch, setLastVenueId, clearLastVenueId } from './apiClient';
import ProfileFullScreen from './ProfileFullScreen';
import { Armchair, Radar as RadarIcon } from './PopuLiveIcons';

/**
 * ============================================================
 * POPULIVE — SCHERMATA CHECK-IN / RADAR (componente reale)
 * ============================================================
 * Differenza rispetto alle demo HTML che avevamo fatto finora:
 * qui non c'è NESSUN dato finto o setTimeout — ogni numero che
 * vedi viene davvero dal server, tramite l'API che abbiamo
 * appena scritto (populive-api-server.js) e gli aggiornamenti
 * in tempo reale via WebSocket (populive-websocket-rooms.js).
 * ============================================================
 */

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

export default function CheckinRadar({ userId, venueId, onArenaSession, autoCheckin }) {
  const [arenaActive, setArenaActive] = useState(false);
  const [checkinCount, setCheckinCount] = useState(0);
  const [threshold, setThreshold] = useState(20);
  const [radarPeople, setRadarPeople] = useState([]);
  const [boostedUserIds, setBoostedUserIds] = useState([]); // in ordine dal più recente boost
  const [arenaSessionId, setArenaSessionId] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'checking_in' | 'checked_in' | 'error'
  const [errorReason, setErrorReason] = useState(null);
  const [socketInstance, setSocketRef] = useState(null);
  // Invisibilità reciproca dopo un rifiuto (mai da un match — v.
  // discussione con l'utente) — ogni telefono filtra da sé la
  // propria lista del radar, più semplice e robusto che far
  // scegliere al server chi escludere da una trasmissione broadcast.
  const [blockedPairIds, setBlockedPairIds] = useState(new Set());
  // L'effetto socket qui sotto si connette una volta sola ([] come
  // dipendenze) — un riferimento tiene il valore sempre aggiornato
  // per i suoi gestori eventi, che altrimenti vedrebbero per sempre
  // l'insieme vuoto iniziale (stesso problema già risolto altrove
  // nel codice con lo stesso schema, es. activeChatConversationIdRef
  // in App.jsx).
  const blockedPairIdsRef = useRef(new Set());
  useEffect(() => {
    blockedPairIdsRef.current = blockedPairIds;
    // Se un rifiuto scatta MENTRE si sta già guardando il radar
    // (es. si rifiuta un Superlike arrivato in diretta), la persona
    // sparisce subito dalla vista, non solo dai prossimi arrivi.
    if (blockedPairIds.size > 0) {
      setRadarPeople((prev) => prev.filter((p) => !blockedPairIds.has(p.userId)));
    }
  }, [blockedPairIds]);
  // Stato per "Aggancia il tuo tavolo" — dichiarato qui in cima,
  // insieme a tutti gli altri, MAI dopo un return condizionale
  // (le regole di React sugli hook lo richiedono sempre).
  const [showTableJoin, setShowTableJoin] = useState(false);
  const [tableCode, setTableCode] = useState('');
  const [wantsConnector, setWantsConnector] = useState(false);
  const [tableJoined, setTableJoined] = useState(false);
  const [tableJoinLoading, setTableJoinLoading] = useState(false);
  // Chi hai toccato nel radar, se qualcuno — apre la schermata a
  // tutto schermo. null = nessuno, quindi il radar è mostrato normale.
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

  // Lista di chi ha un rifiuto permanente con questa persona (in
  // qualunque direzione) — letta una volta all'avvio del radar,
  // usata per filtrare in locale sia l'istantanea iniziale sia
  // ogni nuovo arrivo, senza appesantire il server con un controllo
  // per ogni singola connessione in una trasmissione broadcast.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/users/${userId}/blocked-pairs`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success) setBlockedPairIds(new Set(data.blockedUserIds));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  // --------------------------------------------------------
  // Connessione WebSocket — una sola volta, quando il
  // componente nasce, non a ogni render.
  // --------------------------------------------------------
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
      // Sicurezza in più, alla radice: non deve MAI finire nello
      // stato il proprio stesso userId, qualunque cosa succeda lato
      // server (seconda scheda, riconnessione, ecc.) — meglio
      // scartarlo qui che sperare che il filtro alla visualizzazione
      // (più sotto, nel render) sia sempre sufficiente da solo.
      if (payload.userId === userId) return;
      // Invisibilità reciproca dopo un rifiuto vero (mai da un
      // match) — v. blockedPairIdsRef sopra.
      if (blockedPairIdsRef.current.has(payload.userId)) return;

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

    // L'istantanea di chi era già presente, ricevuta subito dopo
    // essere entrati in una stanza — senza questo, chi entra dopo
    // il primo vedrebbe sempre "0 persone connesse" finché non
    // arriva qualcun altro di nuovo.
    socket.on('radar_snapshot', ({ userIds }) => {
      setRadarPeople((prev) => {
        const existingIds = new Set(prev.map((p) => p.userId));
        const seenInThisBatch = new Set(); // il server ora è già corretto, ma non ci fidiamo di un solo livello — se lo stesso id comparisse più volte nello stesso messaggio, lo prendiamo una volta sola
        const newEntries = userIds
          .filter((id) => {
            if (id === userId || existingIds.has(id) || seenInThisBatch.has(id) || blockedPairIdsRef.current.has(id)) return false;
            seenInThisBatch.add(id);
            return true;
          })
          .map((id) => ({ userId: id, joinedAt: Date.now() }));
        return [...prev, ...newEntries];
      });
    });

    // GHOST MODE — chi ha il Ghost Mode attivo non arriva mai via
    // radar_snapshot/presence_update (il server lo esclude apposta,
    // v. populive-websocket-rooms.js). Questo evento è la SOLA
    // eccezione: arriva SOLO a chi ha appena ricevuto una sua
    // interazione, e lo aggiunge al radar esattamente come un
    // arrivo normale — senza nessuna indicazione visibile che sia
    // un fantasma, resta un profilo come un altro.
    socket.on('ghost_revealed', ({ userId: ghostUserId }) => {
      if (ghostUserId === userId) return;
      setRadarPeople((prev) => {
        if (prev.some((p) => p.userId === ghostUserId)) return prev;
        return [...prev, { userId: ghostUserId, joinedAt: Date.now() }];
      });
    });

    // RIORDINO DOPO UN LIKE — chi ha ricevuto un Like vede il
    // mittente comparire tra i primi del proprio radar (v. sotto,
    // dove si applica davvero l'ordinamento), per rendere più
    // facile un eventuale ricambio. Il Like resta comunque anonimo
    // — non sappiamo QUI chi è stato, solo che qualcuno tra i
    // profili normalmente visibili merita una posizione più in
    // vista adesso.
    socket.on('like_boost', ({ userId: boostedId }) => {
      if (boostedId === userId) return;
      setBoostedUserIds((prev) => [boostedId, ...prev.filter((id) => id !== boostedId)]);
    });

    setSocketRef(socket);
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------------
  // Azione: scansiona il QR → chiama l'API reale di check-in
  // --------------------------------------------------------
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
        setErrorReason(data.reason); // es. 'venue_closed'
        clearLastVenueId(); // niente da riprovare da solo la prossima volta, era una tappa già chiusa
        return;
      }

      setCheckinCount(data.checkinCount);
      setThreshold(data.threshold);
      setArenaActive(data.arenaActive);
      setStatus('checked_in');
      setLastVenueId(venueId); // sopravvive a un aggiornamento pagina, v. apiClient.js

      // Ora che sappiamo in quale sessione siamo, entriamo
      // davvero nella stanza WebSocket giusta, e avvisiamo la shell
      // dell'app (serve alla tab "Stanotte" per sapere quale
      // classifica mostrare).
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

  // --------------------------------------------------------
  // Se sei arrivato qui da un vero QR (link letto dalla fotocamera
  // di sistema, v. App.jsx), il check-in parte da solo — non deve
  // servire ANCHE toccare un bottone dopo aver già inquadrato il
  // codice. Solo chi apre l'app direttamente (senza QR) vede il
  // bottone manuale qui sotto.
  //
  // IMPORTANTE: aspettiamo che socketInstance sia pronto prima di
  // scattare — altrimenti il check-in stesso riesce comunque, ma
  // il collegamento alla stanza WebSocket giusta (necessario per
  // vedere il radar/la classifica aggiornarsi) si perde per strada,
  // perché handleScanQr lo aggancia SOLO se il socket è già connesso
  // in quel preciso istante.
  // --------------------------------------------------------
  useEffect(() => {
    if (autoCheckin && status === 'idle' && socketInstance) {
      handleScanQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckin, socketInstance, status]);

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------
  if (status === 'idle' || status === 'checking_in') {
    return (
      <div className="pl-screen" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {status === 'checking_in' ? (
          <p className="pl-scan-cta" style={{ marginTop: 30, textAlign: 'center' }}>Verifica in corso…</p>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
            {/* Momento editoriale — stesso linguaggio delle strisce
                di Radar e Pulse, ma qui più grande: è l'unico
                contenuto della pagina, non un accento sopra una
                lista vera, quindi ha senso che occupi più spazio
                invece di restare una striscia sottile. */}
            <div style={{ position: 'relative', aspectRatio: '4/5', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
              <img
                src="https://res.cloudinary.com/rjkegdrp/image/upload/v1786334476/populive_entrata_locale_bqvrhj.webp"
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%', filter: 'grayscale(100%) contrast(1.08) brightness(0.95)' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,16,15,0.88) 0%, rgba(20,16,15,0.15) 45%, rgba(20,16,15,0.05) 70%)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #FF7A9C, var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -2px rgba(255,61,110,0.5)' }}>
                  <RadarIcon size={18} color="#fff" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 16, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                    La serata sta per iniziare
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>
                    Scansiona per entrare
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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

  // status === 'checked_in'
  return (
    <div className="pl-screen">
      {arenaActive ? (
        <>
          <h2>Il radar è live</h2>
          {/* Filtro di sicurezza in più (oltre a quello lato server):
              non deve mai comparire il proprio profilo nel proprio
              radar, qualunque cosa succeda con socket/riconnessioni. */}
          {(() => {
            const othersOnly = radarPeople.filter((p) => p.userId !== userId);

            // Chi ha mandato un Like di recente va tra i primi —
            // mai una rivelazione (restano profili normali, senza
            // nessuna indicazione del perché sono lì), solo un
            // aiuto concreto a incrociarli di nuovo per un
            // eventuale ricambio. L'ordine tra i "boostati" stessi
            // segue quello del boost più recente; tutti gli altri
            // restano nel loro ordine originale, semplicemente
            // spostati dopo.
            const sortedOthers = boostedUserIds.length === 0 ? othersOnly : [...othersOnly].sort((a, b) => {
              const aBoost = boostedUserIds.indexOf(a.userId);
              const bBoost = boostedUserIds.indexOf(b.userId);
              if (aBoost === -1 && bBoost === -1) return 0; // nessuno dei due è boostato — ordine invariato
              if (aBoost === -1) return 1;
              if (bBoost === -1) return -1;
              return aBoost - bBoost; // tra due boostati, il più recente prima
            });
            return (
              <>
                {/* Momento editoriale — stesso principio della
                    striscia di "My Hinge": foto DESATURATA, icona
                    tonda + testo su due righe + freccina, sul lato
                    più scuro della foto. Messa qui IN CIMA (non più
                    in fondo alla lista) apposta: il Radar cresce in
                    diretta durante la serata via socket, quindi
                    qualunque frase tipo "hai visto tutti" sarebbe
                    diventata falsa al primo nuovo arrivo — qui il
                    testo resta sempre vero, qualunque cosa succeda
                    dopo nella lista. */}
                <div style={{ position: 'relative', aspectRatio: '16/5', borderRadius: 16, overflow: 'hidden', marginBottom: 16, boxShadow: 'var(--shadow-md)' }}>
                  <img
                    src="https://res.cloudinary.com/rjkegdrp/image/upload/v1786253032/Radar_Populive_x4srpz.webp"
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', filter: 'grayscale(100%) contrast(1.08) brightness(0.95)' }}
                  />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(20,16,15,0.92) 0%, rgba(20,16,15,0.55) 40%, rgba(20,16,15,0.05) 75%)' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #FF7A9C, var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -2px rgba(255,61,110,0.5)' }}>
                      <RadarIcon size={16} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Unbounded',sans-serif", fontWeight: 700, fontSize: 12.5, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                        Chi troverai stasera qui
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
                        Scopri chi è già arrivato
                      </div>
                    </div>
                  </div>
                </div>

                <p>{othersOnly.length} persone connesse ora</p>
                <div className="pl-radar-list">
                  {sortedOthers.map((p) => (
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

      {/* "Aggancia il tuo tavolo" — bottone dentro l'app, non un
          secondo QR esterno: apre la fotocamera nativa (qui,
          nell'attesa della fotocamera vera, un campo testo che
          simula il codice letto) per collegarsi alla squadra del
          tavolo. Visibile SOLO dopo un vero check-in nel locale
          (arenaSessionId esiste solo a quel punto) — prima non ha
          senso mostrarlo, il collegamento al tavolo non avrebbe
          nessuna sessione a cui agganciarsi. */}
      {arenaSessionId && (tableJoined ? (
        <div className="pl-hint" style={{ textAlign: 'center', marginTop: 14 }}>
          ✓ Agganciato al tavolo — i bonus di spesa si divideranno con chi altro si unisce.
        </div>
      ) : !showTableJoin ? (
        <button
          onClick={() => setShowTableJoin(true)}
          style={{ marginTop: 14, width: '100%', padding: 12, borderRadius: 14, border: '1px dashed rgba(228,212,200,0.3)', background: 'transparent', color: 'var(--teak)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Armchair size={15} /> Aggancia il tuo tavolo
        </button>
      ) : (
        <div className="pl-sheet" style={{ marginTop: 14 }}>
          <input
            value={tableCode}
            onChange={(e) => setTableCode(e.target.value)}
            placeholder="Codice del tavolo"
          />
          <div className="pl-consent-row">
            <div>
              <div className="pl-consent-label">Vuoi essere il Connector di questo gruppo?</div>
              <div className="pl-consent-sub">Chiesto solo se sei il primo ad agganciare questo tavolo</div>
            </div>
            <input type="checkbox" checked={wantsConnector} onChange={(e) => setWantsConnector(e.target.checked)} />
          </div>
          <button className="pl-send-btn" onClick={handleJoinTable} disabled={!tableCode.trim() || tableJoinLoading}>
            {tableJoinLoading ? 'Un attimo…' : 'Conferma'}
          </button>
        </div>
      ))}

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

/**
 * Card di una singola persona nel radar — un tocco apre il
 * profilo a tutto schermo (v. ProfileFullScreen.jsx). Recupera
 * foto/nome veri con lo stesso endpoint pubblico usato altrove,
 * invece di mostrare l'id grezzo del database.
 */
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

  // Un colpo d'occhio, senza dover toccare la foto per scoprire chi
  // è chi: argento per Top Connector, oro per Big Spender, magenta
  // per Instant Influencer. Con più badge insieme, l'anello si
  // divide a spicchi invece di doverne scegliere uno solo.
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
  if (preview.isTopConnector) colors.push('#C7C9CC');            // argento
  if (preview.isTopSpender) colors.push('#E8C77E');              // oro (stesso di --gold-medal)
  if (preview.instantInfluencerCategory) colors.push('#E83E8C'); // magenta
  return colors;
}

function ringStyleFor(colors) {
  if (colors.length === 0) return {}; // nessun badge — bordo normale della classe CSS
  if (colors.length === 1) {
    return { border: `2.5px solid ${colors[0]}` };
  }
  // Più badge insieme — anello "a spicchi", un colore ciascuno,
  // invece di dover sceglierne uno solo e nascondere gli altri.
  const slice = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * slice}% ${(i + 1) * slice}%`).join(', ');
  return {
    border: '2.5px solid transparent',
    background: `linear-gradient(var(--surface-2), var(--surface-2)) padding-box, conic-gradient(${stops}) border-box`,
  };
}

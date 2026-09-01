import { useState, useEffect, useRef, useCallback } from 'react';
import { BookmarkCheck, Sparkles } from './PopuLiveIcons';

import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — CHAT 1-A-1 (componente reale)
 * ============================================================
 * Si apre quando arriva l'evento 'chat_unlocked' (v. i tre punti
 * di sblocco lato server: Pulse+Superlike, match nel minigioco,
 * Superlike semplice accettato). Chiusa a fine sessione: se
 * isClosed è true, il campo di scrittura si disabilita, ma la
 * cronologia resta leggibile finché la schermata è aperta.
 * ============================================================
 */
export default function ChatWindow({ conversationId, currentUserId, otherUserName, onMarkedRead, sharedSocket }) {
  const [messages, setMessages] = useState([]);
  const [isClosed, setIsClosed] = useState(false);
  const [myWantsKeep, setMyWantsKeep] = useState(false);
  const [theirWantsKeep, setTheirWantsKeep] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  // Interruttore "Chat: richiedi Conserva esplicito" (26/8) — a
  // interruttore spento, niente bottone Conserva da mostrare: le
  // chat si comportano come su Tinder/Hinge, si conservano di
  // default, meno un pulsante da capire per chi usa l'app per la
  // prima volta in un locale buio. Default true finché arriva la
  // risposta vera, per non far comparire/sparire il bottone con un
  // lampo appena la schermata si apre.
  const [keepButtonVisible, setKeepButtonVisible] = useState(true);
  useEffect(() => {
    apiFetch('/api/feature-flags')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setKeepButtonVisible(data.flags.chat_keep_required !== false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch(`/api/chat/${conversationId}/messages`);
      const data = await res.json();
      if (!cancelled && data.success) {
        setMessages(data.messages);
        setIsClosed(data.isClosed);
        setMyWantsKeep(data.myWantsKeep);
        setTheirWantsKeep(data.theirWantsKeep);
      }
      setLoading(false);
    }
    load();
    // Aprire davvero questa chat segna come letta — il pallino sulla
    // scheda Chat prima restava acceso anche a chat già in corso e
    // letta, contava semplicemente "quante conversazioni ho aperte",
    // non "quante hanno davvero qualcosa di nuovo".
    apiFetch(`/api/chat/${conversationId}/mark-read`, { method: 'POST' })
      .then(() => onMarkedRead?.())
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId]);

  // Connessione WebSocket CONDIVISA (31/8, prima ne apriva una
  // tutta sua, con una seconda iscrizione ridondante alla STESSA
  // stanza privata che App.jsx unisce già una volta sola per tutta
  // l'app) — qui ci limitiamo ad aggiungere/togliere i nostri
  // ascoltatori sopra la connessione già esistente.
  useEffect(() => {
    if (!sharedSocket) return;

    function handleChatMessage(payload) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) => [...prev, {
        id: payload.messageId,
        sender_id: payload.senderId,
        body: payload.body,
        created_at: payload.createdAt,
      }]);
      // Il messaggio arriva mentre la chat è già aperta e sotto gli
      // occhi — segnato come letto subito, senza aspettare che la
      // persona esca e rientri.
      apiFetch(`/api/chat/${conversationId}/mark-read`, { method: 'POST' }).catch(() => {});
    }

    function handleChatClosed(payload) {
      if (payload.conversationId !== conversationId) return;
      setIsClosed(true);
    }

    sharedSocket.on('chat_message', handleChatMessage);
    sharedSocket.on('chat_closed', handleChatClosed);

    return () => {
      sharedSocket.off('chat_message', handleChatMessage);
      sharedSocket.off('chat_closed', handleChatClosed);
    };
  }, [sharedSocket, conversationId, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!draft.trim() || isClosed) return;
    const body = draft.trim();
    const localId = `local-${Date.now()}`;
    setDraft('');

    setMessages((prev) => [...prev, {
      id: localId, sender_id: currentUserId, body, created_at: new Date().toISOString(),
    }]);

    // Controlliamo DAVVERO la risposta — prima non veniva mai letta,
    // quindi un rifiuto del server (bug vero capitato dal vivo, 22/8)
    // restava invisibile: il messaggio sembrava inviato sullo
    // schermo di chi scriveva, ma non arrivava mai all'altra parte
    // né sopravviveva a un refresh, senza nessun avviso del perché.
    try {
      const res = await apiFetch(`/api/chat/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!data.success) {
        setMessages((prev) => prev.filter((m) => m.id !== localId));
        setDraft(body);
        window.alert('Il messaggio non è stato inviato. Riprova.');
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== localId));
      setDraft(body);
      window.alert('Il messaggio non è stato inviato — controlla la connessione e riprova.');
    }
  }, [draft, isClosed, conversationId, currentUserId]);

  const toggleKeep = useCallback(async () => {
    const newValue = !myWantsKeep;
    // Solo la direzione rischiosa chiede conferma: tornare indietro
    // da "conserva" può chiudere la chat SUBITO e senza rimedio, se
    // la serata originale è già finita — un secondo tocco per
    // sbaglio sullo stesso interruttore (capitato davvero) non deve
    // poter cancellare una chat conservata senza nessun avviso.
    // Scegliere di conservare per la prima volta resta invece un
    // solo tocco, mai rischioso di suo.
    if (myWantsKeep && !newValue) {
      const confirmed = window.confirm('Se ritiri la scelta, questa chat potrebbe chiudersi subito per entrambi, senza possibilità di tornare indietro. Continuare davvero?');
      if (!confirmed) return;
    }
    setMyWantsKeep(newValue); // ottimistico
    const res = await apiFetch(`/api/chat/${conversationId}/keep-preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wantsKeep: newValue }),
    });
    const data = await res.json();
    if (data.chatNowClosed) setIsClosed(true);
  }, [myWantsKeep, conversationId]);

  // Bottone "Blocca utente" — richiesta esplicita dell'utente
  // (22/8), consolidata insieme all'idea di "cancellazione della
  // chat": bloccare qualcuno chiude per forza anche questa
  // conversazione, non avrebbe senso restasse aperta. A differenza
  // di un rifiuto (a senso unico), il blocco manuale è SEMPRE
  // bidirezionale — nessuna delle due parti potrà più contattare
  // l'altra né vederla nel radar, in nessun locale futuro.
  const handleBlock = useCallback(async () => {
    const confirmed = window.confirm(`Vuoi davvero bloccare ${otherUserName}? Non potrete più contattarvi né vedervi nel radar, in nessun locale — questa scelta non si può annullare.`);
    if (!confirmed) return;
    await apiFetch(`/api/chat/${conversationId}/block`, { method: 'POST' });
    setIsClosed(true);
  }, [conversationId, otherUserName]);

  if (loading) return <div className="pl-chat-loading">Caricamento…</div>;

  return (
    <div className="pl-chat-window">
      <div className="pl-chat-header">
        <span>{otherUserName}</span>
        {/* Il toggle "conserva" è sempre visibile e sempre cambiabile,
            non solo a fine serata — così l'utente può decidere fin
            da subito se vuole provare a "giocarsela" per i giorni
            successivi. Mostriamo anche se l'altra parte ha già scelto
            "conserva", per trasparenza (ma mai finché non lo sceglie
            anche lui/lei stesso/a: nessun modo di vedere la scelta
            altrui prima di aver fatto la propria).
            IMPORTANTE (bug vero capitato dal vivo): tornare indietro
            da "conserva" DOPO che la serata originale è finita chiude
            la chat SUBITO, senza rimedio — un secondo tocco per
            sbaglio sullo stesso interruttore l'aveva già cancellata
            una volta. Ora quella direzione specifica chiede sempre
            conferma esplicita (v. toggleKeep sopra), e l'etichetta
            del bottone da attivo dice chiaramente "Chat conservata ✓"
            (uno STATO confermato) invece di una domanda ambigua
            ("Vuoi conservarla?"), che si prestava a essere fraintesa
            come "tocca di nuovo per confermare ancora". */}
        <button
          className={`pl-keep-toggle ${myWantsKeep ? 'pl-keep-on' : ''}`}
          onClick={toggleKeep}
          disabled={isClosed}
          style={{ display: keepButtonVisible ? 'flex' : 'none', alignItems: 'center', gap: 5 }}
        >
          {myWantsKeep && <BookmarkCheck size={12} />} {myWantsKeep ? 'Chat conservata ✓' : 'Conserva la chat'}
        </button>
        {!isClosed && (
          <button
            onClick={handleBlock}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 10.5, cursor: 'pointer', padding: '4px 6px' }}
          >
            Blocca
          </button>
        )}
      </div>

      {/* Interruttore "Chat: richiedi Conserva esplicito" spento
          (26/8, richiesta esplicita per le prime serate test) —
          niente promemoria da mostrare, la chat si conserva già di
          default, non c'è nessuna scelta in sospeso da ricordare a
          nessuno. */}
      {keepButtonVisible && myWantsKeep && !theirWantsKeep && !isClosed && (
        <div className="pl-chat-hint">
          Hai scelto di conservarla — se lo sceglie anche {otherUserName}, resterà disponibile anche nei prossimi giorni.
        </div>
      )}
      {keepButtonVisible && myWantsKeep && theirWantsKeep && !isClosed && (
        <div className="pl-chat-hint pl-chat-hint-success" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          Anche {otherUserName} ha scelto di conservare questa chat — continuerà a restare attiva e visibile anche dopo stasera. <Sparkles size={12} />
        </div>
      )}

      <div className="pl-chat-messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`pl-chat-bubble ${m.sender_id === currentUserId ? 'pl-chat-mine' : 'pl-chat-theirs'}`}
          >
            {m.body}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {isClosed ? (
        <div className="pl-chat-closed-notice">
          Questa chat è chiusa{keepButtonVisible
            ? ` — ${myWantsKeep && !theirWantsKeep ? `${otherUserName} non ha scelto di conservarla.` : 'la serata è finita.'}`
            : '.'}
        </div>
      ) : (
        <div className="pl-chat-input-row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Scrivi un messaggio…"
            maxLength={1000}
          />
          <button onClick={handleSend} disabled={!draft.trim()}>Invia</button>
        </div>
      )}
    </div>
  );
}

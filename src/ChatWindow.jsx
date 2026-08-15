import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { BookmarkCheck, Sparkles } from './PopuLiveIcons';

import { API_BASE, apiFetch } from './apiClient';

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
export default function ChatWindow({ conversationId, currentUserId, otherUserName, onMarkedRead }) {
  const [messages, setMessages] = useState([]);
  const [isClosed, setIsClosed] = useState(false);
  const [myWantsKeep, setMyWantsKeep] = useState(false);
  const [theirWantsKeep, setTheirWantsKeep] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

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

  useEffect(() => {
    const socket = io(API_BASE);
    socket.emit('join_private_room', { userId: currentUserId });

    socket.on('chat_message', (payload) => {
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
    });

    socket.on('chat_closed', (payload) => {
      if (payload.conversationId !== conversationId) return;
      setIsClosed(true);
    });

    return () => socket.disconnect();
  }, [conversationId, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!draft.trim() || isClosed) return;
    const body = draft.trim();
    setDraft('');

    setMessages((prev) => [...prev, {
      id: `local-${Date.now()}`, sender_id: currentUserId, body, created_at: new Date().toISOString(),
    }]);

    await apiFetch(`/api/chat/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
  }, [draft, isClosed, conversationId, currentUserId]);

  const toggleKeep = useCallback(async () => {
    const newValue = !myWantsKeep;
    setMyWantsKeep(newValue); // ottimistico
    const res = await apiFetch(`/api/chat/${conversationId}/keep-preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wantsKeep: newValue }),
    });
    const data = await res.json();
    if (data.chatNowClosed) setIsClosed(true);
  }, [myWantsKeep, conversationId]);

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
            altrui prima di aver fatto la propria). */}
        <button
          className={`pl-keep-toggle ${myWantsKeep ? 'pl-keep-on' : ''}`}
          onClick={toggleKeep}
          disabled={isClosed}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          {myWantsKeep && <BookmarkCheck size={12} />} {myWantsKeep ? 'Vuoi conservarla' : 'Conserva la chat'}
        </button>
      </div>

      {myWantsKeep && !theirWantsKeep && !isClosed && (
        <div className="pl-chat-hint">
          Hai scelto di conservarla — se lo sceglie anche {otherUserName}, resterà disponibile anche nei prossimi giorni.
        </div>
      )}
      {myWantsKeep && theirWantsKeep && !isClosed && (
        <div className="pl-chat-hint pl-chat-hint-success" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          Anche {otherUserName} ha scelto di conservarla — questa chat resterà vostra anche dopo stasera. <Sparkles size={12} />
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
          Questa chat è chiusa — {myWantsKeep && !theirWantsKeep
            ? `${otherUserName} non ha scelto di conservarla.`
            : 'la serata è finita.'}
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

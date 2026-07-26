import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

export default function ChatWindow({ conversationId, currentUserId, otherUserName }) {
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
      const res = await fetch(`${API_BASE}/api/chat/${conversationId}/messages`, {
        headers: { 'x-user-id': currentUserId },
      });
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
    return () => { cancelled = true; };
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

    await fetch(`${API_BASE}/api/chat/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUserId },
      body: JSON.stringify({ body }),
    });
  }, [draft, isClosed, conversationId, currentUserId]);

  const toggleKeep = useCallback(async () => {
    const newValue = !myWantsKeep;
    setMyWantsKeep(newValue);
    const res = await fetch(`${API_BASE}/api/chat/${conversationId}/keep-preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUserId },
      body: JSON.stringify({ wantsKeep: newValue }),
    });
    const data = await res.json();
    if (data.chatNowClosed) setIsClosed(true);
  }, [myWantsKeep, conversationId, currentUserId]);

  if (loading) return <div className="pl-chat-loading">Caricamento…</div>;

  return (
    <div className="pl-chat-window">
      <div className="pl-chat-header">
        <span>{otherUserName}</span>
        <button
          className={`pl-keep-toggle ${myWantsKeep ? 'pl-keep-on' : ''}`}
          onClick={toggleKeep}
          disabled={isClosed}
        >
          {myWantsKeep ? '💾 Vuoi conservarla' : 'Conserva la chat'}
        </button>
      </div>

      {myWantsKeep && !theirWantsKeep && !isClosed && (
        <div className="pl-chat-hint">
          Hai scelto di conservarla — se lo sceglie anche {otherUserName}, resterà disponibile anche nei prossimi giorni.
        </div>
      )}
      {myWantsKeep && theirWantsKeep && !isClosed && (
        <div className="pl-chat-hint pl-chat-hint-success">
          Anche {otherUserName} ha scelto di conservarla — questa chat resterà vostra anche dopo stasera. 💫
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

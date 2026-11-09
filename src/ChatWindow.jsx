import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft } from './PopuLiveIcons';

import { apiFetch } from './apiClient';
import { onBackButton } from './native';
import { isConfirmOpen, showToast } from './Dialogs';
import { ReportSheet, blockUserWithConfirm } from './ReportBlock';
import { deleteChatWithConfirm } from './ChatCenter';

/**
 * ============================================================
 * POPULIVE — CHAT 1-A-1 (componente reale)
 * ============================================================
 * Si apre quando arriva l'evento 'chat_unlocked' (v. i tre punti
 * di sblocco lato server: Pulse+Superlike, match nel minigioco,
 * Superlike semplice accettato). Resta anche dopo la serata (M4,
 * 09/11: niente più "Conserva"); si chiude solo con un blocco: se
 * isClosed è true, il campo di scrittura si disabilita, ma la
 * cronologia resta leggibile finché la schermata è aperta.
 * ============================================================
 */
export default function ChatWindow({
  conversationId,
  currentUserId,
  otherUserName,
  onMarkedRead,
  sharedSocket,
  onBack,
}) {
  // Uscita dalla chat (B8, 1/11): prima si usciva solo cambiando
  // scheda. Freccia nell'intestazione e, su Android, il tasto
  // indietro del telefono — registrato solo finché la chat è aperta,
  // poi Android torna al comportamento normale.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(
    () =>
      onBackButton(() => {
        // Con una conferma aperta (es. "Blocca") o la segnalazione, il
        // tasto chiude solo quella
        if (!isConfirmOpen() && !reportingRef.current) onBackRef.current?.();
      }),
    []
  );

  const [messages, setMessages] = useState([]);
  const [isClosed, setIsClosed] = useState(false);
  // Finestra "Segnala" aperta (B2)
  const [reporting, setReporting] = useState(false);
  const reportingRef = useRef(false);
  reportingRef.current = reporting;
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch(`/api/chat/${conversationId}/messages`);
      const data = await res.json();
      if (!cancelled && data.success) {
        setMessages(data.messages);
        setIsClosed(data.isClosed);
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
    return () => {
      cancelled = true;
    };
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
      setMessages((prev) => [
        ...prev,
        {
          id: payload.messageId,
          sender_id: payload.senderId,
          body: payload.body,
          created_at: payload.createdAt,
        },
      ]);
      // Il messaggio arriva mentre la chat è già aperta e sotto gli
      // occhi — segnato come letto subito, senza aspettare che la
      // persona esca e rientri.
      apiFetch(`/api/chat/${conversationId}/mark-read`, { method: 'POST' })
        .then(() => onMarkedRead?.())
        .catch(() => {});
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
  }, [sharedSocket, conversationId, currentUserId, onMarkedRead]);

  // Si scorre SOLO la lista dei messaggi, mai con scrollIntoView (bug
  // B16, 2/10): quello scorre anche tutti i contenitori sopra. Se i
  // messaggi arrivano mentre la scheda sta ancora entrando di lato
  // (animazione translateX in populive-styles.css), spostava di lato
  // l'intera app, lasciandola tagliata a metà fuori dallo schermo.
  useEffect(() => {
    const list = messagesRef.current;
    list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!draft.trim() || isClosed) return;
    const body = draft.trim();
    const localId = `local-${Date.now()}`;
    setDraft('');

    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        sender_id: currentUserId,
        body,
        created_at: new Date().toISOString(),
      },
    ]);

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
        showToast('Il messaggio non è stato inviato. Riprova.', { tone: 'error' });
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== localId));
      setDraft(body);
      showToast('Il messaggio non è stato inviato — controlla la connessione e riprova.', {
        tone: 'error',
      });
    }
  }, [draft, isClosed, conversationId, currentUserId]);

  // Bottone "Blocca utente" (22/8): bloccare qualcuno chiude per
  // forza anche questa conversazione. Dal lotto 6 (B2) passa dallo
  // stesso flusso del profilo (ReportBlock.jsx): blocco nelle due
  // direzioni, che si può togliere dalle Impostazioni. La chat bloccata
  // sparisce dall'elenco: si torna lì.
  const handleBlock = useCallback(async () => {
    if (await blockUserWithConfirm({ conversationId, displayName: otherUserName })) {
      setIsClosed(true);
      onBackRef.current?.();
    }
  }, [conversationId, otherUserName]);

  // Rimuovere la chat solo per sé (M4): nell'elenco si scorre la riga,
  // qui un tocco (anche col mouse, sul sito). Poi si torna all'elenco.
  const handleDelete = useCallback(async () => {
    if (await deleteChatWithConfirm({ conversationId, displayName: otherUserName })) {
      onBackRef.current?.();
    }
  }, [conversationId, otherUserName]);

  if (loading) return <div className="pl-chat-loading">Caricamento…</div>;

  return (
    <div className="pl-chat-window">
      <div className="pl-chat-header">
        <button
          type="button"
          className="pl-chat-back"
          onClick={() => onBack?.()}
          aria-label="Torna alle chat"
        >
          <ChevronLeft size={20} />
          <span>{otherUserName}</span>
        </button>
        <button onClick={handleDelete} style={chatHeaderLinkStyle}>
          Rimuovi
        </button>
        <button onClick={() => setReporting(true)} style={chatHeaderLinkStyle}>
          Segnala
        </button>
        {!isClosed && (
          <button
            onClick={handleBlock}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 10.5,
              cursor: 'pointer',
              padding: '4px 6px',
            }}
          >
            Blocca
          </button>
        )}
      </div>

      <div className="pl-chat-messages" ref={messagesRef}>
        {messages.map((m) => (
          <div
            key={m.id}
            className={`pl-chat-bubble ${m.sender_id === currentUserId ? 'pl-chat-mine' : 'pl-chat-theirs'}`}
          >
            {m.body}
          </div>
        ))}
      </div>

      {isClosed ? (
        <div className="pl-chat-closed-notice">Questa chat è chiusa.</div>
      ) : (
        <div className="pl-chat-input-row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Scrivi un messaggio…"
            maxLength={1000}
          />
          <button onClick={handleSend} disabled={!draft.trim()}>
            Invia
          </button>
        </div>
      )}

      {reporting && (
        <ReportSheet
          conversationId={conversationId}
          context="chat"
          displayName={otherUserName}
          onClose={() => setReporting(false)}
          onBlocked={() => {
            setIsClosed(true);
            onBackRef.current?.();
          }}
        />
      )}
    </div>
  );
}

const chatHeaderLinkStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 10.5,
  cursor: 'pointer',
  padding: '4px 6px',
};

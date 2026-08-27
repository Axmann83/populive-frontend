import { useState, useEffect, useRef } from 'react';
import { apiFetch } from './apiClient';

const INFLUENCER_CATEGORY_OPTIONS = ['Moda', 'Fitness', 'Beauty', 'Nightlife'];

/**
 * ============================================================
 * MESSAGGIO DIRETTO DEGLI ARCHITETTI DALLA CLASSIFICA (26/8)
 * ============================================================
 * Aperto toccando qualcuno in classifica DENTRO LA DASHBOARD — mai
 * nell'app normale (LiveRanking.jsx passa isDashboard solo da qui).
 * Niente Like/Superlike/Pulse: qui si scrive e basta, senza bisogno
 * di nessun match, per contattare direttamente chi si nota emergere
 * (tipicamente per proporgli un accordo Instant Influencer).
 *
 * In più, per chiudere il cerchio in un unico posto: un modulo per
 * attivare subito lo status Instant Influencer una volta chiuso
 * l'accordo, senza dover tornare alla ricerca per numero di telefono
 * nella scheda Funzionalità.
 * ============================================================
 */
export default function AdminChatPanel({ targetUserId, targetDisplayName, currentUserId, onClose }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  const [showInfluencerForm, setShowInfluencerForm] = useState(false);
  const [category, setCategory] = useState('');
  const [products, setProducts] = useState([{ name: '', url: '' }]);
  const [savingInfluencer, setSavingInfluencer] = useState(false);
  const [influencerSaved, setInfluencerSaved] = useState(false);

  // Apre (o ritrova) la conversazione appena il pannello monta.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/dashboard/users/${targetUserId}/start-chat`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) setConversationId(data.conversationId);
        else setError('Non è stato possibile aprire la chat.');
      })
      .catch(() => { if (!cancelled) setError('Errore di rete.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [targetUserId]);

  // Carica i messaggi appena la conversazione è pronta, poi
  // controlla periodicamente — un pannello amministrativo non ha
  // bisogno di un socket dedicato, un giro ogni pochi secondi basta.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    function loadMessages() {
      apiFetch(`/api/chat/${conversationId}/messages`)
        .then((r) => r.json())
        .then((data) => { if (!cancelled && data.success) setMessages(data.messages); })
        .catch(() => {});
    }

    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!draft.trim() || !conversationId) return;
    const body = draft.trim();
    setDraft('');
    try {
      const res = await apiFetch(`/api/chat/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, { id: data.messageId, sender_id: currentUserId, body, created_at: data.createdAt }]);
      }
    } catch {
      setDraft(body); // rimesso nel campo se l'invio fallisce, non perso
    }
  }

  function updateProduct(index, field, value) {
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  async function handleSaveInfluencer() {
    setSavingInfluencer(true);
    setInfluencerSaved(false);
    try {
      const res = await apiFetch(`/api/dashboard/users/${targetUserId}/instant-influencer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          products: products.filter((p) => p.name.trim()),
        }),
      });
      const data = await res.json();
      if (data.success) setInfluencerSaved(true);
    } finally {
      setSavingInfluencer(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(228,212,200,0.12)' }}>
          <div style={{ fontWeight: 700 }}>Messaggio diretto — {targetDisplayName || 'Utente'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {loading && <p className="pl-hint" style={{ padding: 16 }}>Apertura della chat…</p>}
        {error && <p className="pl-error" style={{ padding: 16 }}>{error}</p>}

        {!loading && !error && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <p className="pl-hint">Nessun messaggio ancora — scrivi il primo qui sotto.</p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.sender_id === currentUserId ? 'flex-end' : 'flex-start',
                    background: m.sender_id === currentUserId ? 'var(--cyan)' : 'var(--surface-2)',
                    color: m.sender_id === currentUserId ? '#fff' : 'var(--text)',
                    padding: '8px 12px', borderRadius: 14, maxWidth: '80%', fontSize: 13,
                  }}
                >
                  {m.body}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(228,212,200,0.12)' }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="Scrivi un messaggio…"
                style={{ flex: 1, marginBottom: 0 }}
              />
              <button onClick={handleSend} className="pl-send-btn" style={{ width: 'auto', padding: '10px 16px' }}>Invia</button>
            </div>

            {/* Attiva Instant Influencer, senza dover tornare alla
                ricerca per numero di telefono — chiude il cerchio
                nello stesso posto in cui si è appena chiuso
                l'accordo (26/8, richiesta esplicita). */}
            <div style={{ borderTop: '1px solid rgba(228,212,200,0.12)', padding: 12 }}>
              <button
                onClick={() => setShowInfluencerForm((v) => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}
              >
                {showInfluencerForm ? '▾' : '▸'} Attiva Instant Influencer
              </button>

              {showInfluencerForm && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ marginBottom: 0 }}>
                    <option value="">Nessuno status</option>
                    {INFLUENCER_CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {category && products.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={p.name}
                        onChange={(e) => updateProduct(i, 'name', e.target.value)}
                        placeholder="Nome prodotto"
                        style={{ flex: 1, marginBottom: 0 }}
                      />
                      <input
                        value={p.url}
                        onChange={(e) => updateProduct(i, 'url', e.target.value)}
                        placeholder="Link (facoltativo)"
                        style={{ flex: 1, marginBottom: 0 }}
                      />
                    </div>
                  ))}
                  {category && (
                    <button
                      onClick={() => setProducts((prev) => [...prev, { name: '', url: '' }])}
                      style={{ background: 'none', border: '1px dashed rgba(228,212,200,0.3)', borderRadius: 8, padding: 6, fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      + Aggiungi prodotto
                    </button>
                  )}

                  <button onClick={handleSaveInfluencer} disabled={savingInfluencer} className="pl-send-btn">
                    {savingInfluencer ? 'Salvataggio…' : 'Salva'}
                  </button>
                  {influencerSaved && <p className="pl-hint" style={{ color: 'var(--cyan)' }}>Salvato.</p>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

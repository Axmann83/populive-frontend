import { useState, useRef } from 'react';

/**
 * ============================================================
 * SWIPE PER ELIMINARE — componente condiviso
 * ============================================================
 * Estratto da NotificationCenter.jsx per essere riusato ovunque
 * serva lo stesso gesto (Centro Notifiche, lista Pulse, ecc.) senza
 * duplicare il codice in più punti.
 *
 * Scorrere verso sinistra rivela uno sfondo rosso con "x" dietro —
 * stesso gesto familiare da Mail/Gmail/WhatsApp. Superata una certa
 * soglia al rilascio, l'elemento si elimina da solo con una piccola
 * animazione di uscita; sotto la soglia, torna semplicemente al suo
 * posto.
 * ============================================================
 */
export default function SwipeableRow({ onDismiss, children }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const startXRef = useRef(0);
  const DELETE_THRESHOLD = -70;
  const MAX_DRAG = -96;

  function handleTouchStart(e) {
    startXRef.current = e.touches[0].clientX;
    setDragging(true);
  }
  function handleTouchMove(e) {
    if (!dragging) return;
    const delta = e.touches[0].clientX - startXRef.current;
    setDragX(Math.max(MAX_DRAG, Math.min(0, delta))); // mai verso destra, mai oltre il limite
  }
  function handleTouchEnd() {
    setDragging(false);
    if (dragX <= DELETE_THRESHOLD) {
      setRemoving(true);
      setTimeout(onDismiss, 220); // lascia respirare l'animazione di uscita prima di sparire davvero dalla lista
    } else {
      setDragX(0);
    }
  }

  return (
    <div style={{ position: 'relative', marginBottom: 8, borderRadius: 14, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', inset: 0, background: '#C4302B',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 24,
          color: '#fff', fontSize: 16,
        }}
      >
        ✕
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${removing ? -420 : dragX}px)`,
          transition: dragging ? 'none' : 'transform 0.22s ease',
          opacity: removing ? 0 : 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

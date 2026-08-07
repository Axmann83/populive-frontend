import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * ============================================================
 * POPULIVE — SCANNER QR VIA FOTOCAMERA (dashboard)
 * ============================================================
 * Pensato per il tablet in locale: inquadrare il QR del tavolo
 * invece di leggere e digitare a mano un codice al buio, tra la
 * confusione di una serata — molto più affidabile e veloce.
 * Riutilizzabile ovunque nella dashboard serva leggere un QR.
 * ============================================================
 */
export default function QrScannerModal({ onScan, onClose }) {
  const containerRef = useRef(null);
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan; // sempre l'ultima versione, senza dover riavviare la fotocamera ad ogni render del pannello che lo contiene

  useEffect(() => {
    const elementId = 'pl-qr-scanner-region';
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' }, // fotocamera posteriore, quella vera per inquadrare
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        // Un tocco solo — appena legge qualcosa, fermiamo subito la
        // fotocamera e passiamo il risultato, nessuna doppia lettura.
        scanner.stop().catch(() => {});
        onScanRef.current(decodedText);
      },
      () => { /* nessun QR nel fotogramma corrente — normale, non è un errore da mostrare */ }
    ).catch(() => {
      onScanRef.current(null, 'camera_error');
    });

    return () => {
      // Se la persona chiude senza aver scansionato nulla, fermiamo
      // comunque la fotocamera — non deve restare accesa in background.
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).then(() => {
          scannerRef.current?.clear();
        });
      }
    };
  }, []); // SOLO al montaggio — mai riavviare la fotocamera per un cambio di onScan

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 95, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 22, right: 18, width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15, cursor: 'pointer' }}
        aria-label="Chiudi"
      >
        ✕
      </button>
      <p style={{ color: '#fff', fontSize: 12.5, marginBottom: 16, textAlign: 'center' }}>
        Inquadra il QR del tavolo
      </p>
      <div id="pl-qr-scanner-region" ref={containerRef} style={{ width: '100%', maxWidth: 320, borderRadius: 16, overflow: 'hidden' }} />
    </div>
  );
}

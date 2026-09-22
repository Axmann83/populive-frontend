import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getOptimizedPhotoUrl } from './apiClient';

/**
 * ============================================================
 * POPULIVE — ANTEPRIMA FOTO (lightbox condiviso)
 * ============================================================
 * Le foto sono il cuore dell'app: nel radar, in classifica, nelle
 * notifiche e nelle chat però compaiono sempre in un cerchietto da
 * 32-40px, dove un viso si riconosce a malapena. Da qui in poi il
 * tocco su QUALUNQUE miniatura di profilo apre la foto in grande,
 * senza passare dal profilo intero — un gesto solo, come su
 * Instagram o WhatsApp.
 *
 * Questo file è l'unico posto dove quell'anteprima esiste: prima il
 * pattern viveva solo dentro MyProfile.jsx (la propria foto), ora è
 * un pezzo unico riusato ovunque, così l'aspetto e il comportamento
 * restano identici in tutta l'app invece di divergere schermata per
 * schermata.
 *
 * Si usa con l'hook, non montando il componente a mano:
 *
 *   const { photoTapProps, photoPreview } = usePhotoPreview();
 *   ...
 *   <img src={...} {...photoTapProps(p.photoUrl, p.displayName)} />
 *   ...
 *   {photoPreview}
 * ============================================================
 */

function PhotoPreview({ url, alt, onClose }) {
  // Esc chiude — sul telefono non serve, ma l'app gira anche nel
  // browser su desktop, dove aspettarsi Esc è la norma.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Appeso a document.body, non dove viene scritto nel JSX: le
  // schede dell'app scorrono con un'animazione che lascia un
  // transform attaccato al pannello (v. .pl-tab-panel-* nel CSS), e
  // un antenato con transform diventa il riferimento di
  // "position: fixed" al posto dello schermo. Senza portale
  // l'anteprima si ancorava al pannello dentro l'area che scorre:
  // su una schermata lunga come il profilo personale, se si era
  // scesi un po', finiva semplicemente fuori dalla vista.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        // Stesse misure delle altre schermate a tutto schermo
        // (v. fullScreenStyle in ProfileFullScreen.jsx): dvh segue
        // la barra degli indirizzi del browser mobile, che con vh
        // lascerebbe una striscia scoperta in fondo.
        width: '100vw',
        height: '100dvh',
        background: 'rgba(0,0,0,0.92)',
        // Sopra ogni schermata a tutto schermo dell'app (profilo,
        // impostazioni, ecc. si fermano a 95) ma sotto splash e
        // grana fotografica, che restano gli unici due livelli
        // davvero "sopra tutto".
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {/* Il buio copre tutta la finestra, la FOTO no: sta dentro lo
          stesso telaio da 420px del resto dell'app (.pl-app-shell),
          altrimenti su uno schermo largo un'immagine grande si
          allargherebbe ben oltre i bordi dell'app, che resta pensata
          per il telefono. Nessuna misura fissa per la foto: è questo
          riquadro a darle il limite, e lei ci si adatta dentro. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // In alto lo spazio per la X (e per il notch), ai lati un
          // margine perché la foto non tocchi i bordi, in basso la
          // home indicator dell'iPhone.
          padding:
            'calc(66px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px))',
          boxSizing: 'border-box',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            // Sul telefono il notch mangerebbe il bottone: la safe area
            // lo spinge sotto la tacca senza spostarlo sul desktop.
            top: 'calc(18px + env(safe-area-inset-top, 0px))',
            right: 16,
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            fontSize: 16,
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
          aria-label="Chiudi"
        >
          ✕
        </button>
        <img
          // crop: false — qui la foto va vista com'è, intera: il
          // ritaglio quadrato sul viso serve al cerchietto piccolo,
          // non all'ingrandimento.
          src={getOptimizedPhotoUrl(url, { width: 1000, height: 1000, crop: false })}
          alt={alt || ''}
          style={{
            display: 'block',
            // Si arrende sempre al riquadro qui sopra, in entrambe le
            // direzioni: una foto verticale si limita in altezza, una
            // orizzontale in larghezza, e le proporzioni restano
            // quelle vere in tutti e due i casi.
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            borderRadius: 16,
            boxShadow: 'var(--shadow-lg)',
          }}
        />
      </div>
    </div>,
    document.body
  );
}

export function usePhotoPreview() {
  const [photo, setPhoto] = useState(null); // { url, alt } oppure null

  const openPhoto = useCallback((url, alt) => {
    if (!url) return; // chi ha ancora l'emoji come avatar non ha niente da ingrandire
    setPhoto({ url, alt });
  }, []);

  /**
   * Da spalmare direttamente sulla miniatura. Due dettagli che
   * altrimenti andrebbero riscritti (e dimenticati) a ogni uso:
   *  - stopPropagation, perché quasi tutte le miniature stanno
   *    dentro una riga che al tocco apre il profilo: senza questo
   *    partirebbero entrambe le azioni;
   *  - se non c'è una foto non aggiunge nulla, così la riga si
   *    comporta esattamente come prima.
   * extraStyle serve dove l'elemento ha già uno stile suo da tenere.
   */
  const photoTapProps = useCallback(
    (url, alt, extraStyle) =>
      url
        ? {
            onClick: (e) => {
              e.stopPropagation();
              openPhoto(url, alt);
            },
            style: { ...extraStyle, cursor: 'pointer' },
          }
        : extraStyle
          ? { style: extraStyle }
          : {},
    [openPhoto]
  );

  const photoPreview = photo ? (
    <PhotoPreview url={photo.url} alt={photo.alt} onClose={() => setPhoto(null)} />
  ) : null;

  return { openPhoto, photoTapProps, photoPreview };
}

export default PhotoPreview;

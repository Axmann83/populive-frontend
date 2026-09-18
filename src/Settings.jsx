import { useState, useEffect } from 'react';

import { apiFetch, requestAndSendLocation, uploadPhotoToStorage, getOptimizedPhotoUrl } from './apiClient';

const MAX_PHOTOS = 6; // stessa galleria di ProfileCreation.jsx

/**
 * ============================================================
 * POPULIVE — IMPOSTAZIONI (componente reale)
 * ============================================================
 * A differenza della schermata di consenso dell'onboarding (che si
 * vede UNA volta, obbligatoria prima di usare l'app), questa è
 * richiamabile in ogni momento dal profilo (icona rotella ⚙️) e
 * permette di cambiare idea liberamente, tutte le volte che si vuole.
 * Stessi campi dell'onboarding + il nuovo toggle di autopresentazione
 * (show_ranking_on_profile), che invece non fa parte del consenso
 * privacy — è una preferenza estetica, coerente col fatto che vive
 * qui insieme alle altre impostazioni modificabili in ogni momento.
 * ============================================================
 */
export default function Settings({ userId, onClose, onAccountDeleted }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch(`/api/profile/${userId}/settings`);
        const data = await res.json();
        if (!cancelled && data.success) setSettings(data.settings);
      } catch (err) {
        console.error('Errore nel caricamento delle impostazioni:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  // Cambiare la foto DOPO la registrazione iniziale — mancava del
  // tutto (29/8, scoperto durante un test dal vivo: chi la saltava
  // in fase di creazione profilo non aveva più nessun modo di
  // aggiungerla dopo). Riusa lo stesso caricamento verso Cloudinary
  // già collaudato in ProfileCreation.jsx (ora condiviso via
  // apiClient.js) + lo stesso endpoint server già pronto.
  // Cancellazione account (12/9) — richiesta obbligatoria di Apple/
  // Google. Conferma esplicita in due passaggi data l'irreversibilità
  // (stesso principio già usato per il bottone "Blocca" in chat) —
  // mai un singolo tocco per un'azione che non si può disfare.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await apiFetch('/api/profile/me', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onAccountDeleted?.();
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  // Galleria vera, fino a MAX_PHOTOS (18/9) — a differenza degli
  // altri campi qui sotto, ogni aggiunta/rimozione si salva SUBITO
  // (stesso principio già in vigore per la foto singola prima di
  // oggi), non aspetta il bottone "Salva impostazioni" in fondo.
  async function saveGallery(newPhotoUrls) {
    await apiFetch('/api/profile/me/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoUrls: newPhotoUrls }),
    });
    setSettings((prev) => ({ ...prev, photoUrls: newPhotoUrls, photoUrl: newPhotoUrls[0] || null }));
  }

  async function handlePhotosSelected(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const room = MAX_PHOTOS - (settings.photoUrls?.length || 0);
    const toUpload = files.slice(0, room);

    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const newUrls = [];
      for (const file of toUpload) {
        newUrls.push(await uploadPhotoToStorage(file));
      }
      await saveGallery([...(settings.photoUrls || []), ...newUrls]);
    } catch {
      setPhotoError('Caricamento non riuscito — riprova.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = ''; // permette di selezionare di nuovo lo stesso file, se serve riprovare
    }
  }

  async function handleRemovePhoto(index) {
    setPhotoError(null);
    try {
      await saveGallery((settings.photoUrls || []).filter((_, i) => i !== index));
    } catch {
      setPhotoError('Rimozione non riuscita — riprova.');
    }
  }

  async function save() {
    setSaving(true);
    await apiFetch(`/api/profile/${userId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    onClose();
  }

  if (loading || !settings) return <div className="pl-hint">Caricamento…</div>;

  return (
    <div className="pl-sheet">
      <div className="pl-sheet-close" onClick={onClose}>Chiudi ✕</div>
      <h3>Impostazioni</h3>

      {/* Galleria vera, fino a MAX_PHOTOS (18/9) — sostituisce il
          vecchio cerchietto singolo. La prima è sempre quella
          mostrata ovunque nell'app fuori dal profilo a tutto
          schermo (radar/chat/notifiche/classifiche); tutte insieme
          si scorrono in verticale lì, stile Hinge. Nessun attributo
          "capture" sull'input: su iOS/Android questo basta da solo a
          far comparire la scelta nativa tra "Scatta foto" e
          "Libreria foto" — capture l'avrebbe tolta, forzando solo
          la fotocamera. */}
      <div className="pl-section-label">La tua galleria</div>
      <div style={photoGridStyle}>
        {(settings.photoUrls || []).map((url, i) => (
          <div key={i} style={{ ...photoTileStyle, opacity: uploadingPhoto ? 0.5 : 1 }}>
            <img src={getOptimizedPhotoUrl(url, { width: 120, height: 120 })} alt="" style={photoTileImgStyle} />
            <button type="button" onClick={() => handleRemovePhoto(i)} disabled={uploadingPhoto} style={photoTileRemoveStyle} aria-label="Rimuovi">✕</button>
            {i === 0 && <span style={photoTilePrimaryBadgeStyle}>Principale</span>}
          </div>
        ))}
        {(settings.photoUrls?.length || 0) < MAX_PHOTOS && (
          <label style={{ ...photoTileStyle, ...photoTileAddStyle, opacity: uploadingPhoto ? 0.5 : 1 }}>
            <span style={{ fontSize: 26, color: 'var(--text-muted)' }}>+</span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploadingPhoto}
              onChange={handlePhotosSelected}
              style={{ display: 'none' }}
            />
          </label>
        )}
      </div>
      {uploadingPhoto && <p className="pl-hint" style={{ marginTop: -8, marginBottom: 16 }}>Caricamento…</p>}
      {photoError && <p className="pl-error" style={{ marginTop: -8, marginBottom: 16 }}>{photoError}</p>}

      <div className="pl-section-label">Autopresentazione</div>
      <ToggleRow
        label="Mostra la mia posizione in classifica"
        sub="Visibile sul tuo profilo a chi ti guarda — puoi nasconderla in ogni momento"
        checked={settings.showRankingOnProfile}
        onChange={(v) => setSettings({ ...settings, showRankingOnProfile: v })}
      />

      <div className="pl-section-label" style={{ marginTop: 16 }}>Visibilità nel Radar</div>
      <ToggleRow
        label="Ghost Mode"
        sub="Non comparirai nel Radar di nessuno — se invii tu un'interazione, quella persona vedrà comunque il tuo profilo tra i candidati, ma solo lei"
        checked={settings.ghostModeEnabled}
        onChange={(v) => setSettings({ ...settings, ghostModeEnabled: v })}
      />

      <div className="pl-section-label" style={{ marginTop: 16 }}>Notifiche</div>
      <ToggleRow
        label="Notifiche aptiche (vibrazione)"
        sub="Se disattivata, non sentirai il telefono vibrare per Like/Superlike/Pulse ricevuti — vedrai comunque il resoconto quando riapri l'app da solo"
        checked={settings.hapticNotificationsEnabled}
        onChange={(v) => setSettings({ ...settings, hapticNotificationsEnabled: v })}
      />

      <div className="pl-section-label" style={{ marginTop: 16 }}>Consenso e privacy</div>
      <p className="pl-hint">
        Queste opzioni restano tutte facoltative — ognuna attiva ti dà +5% sui punti che guadagni
        (fino a +15% con tutte e tre), mai una penalità per averle spente.
      </p>
      <ToggleRow
        label="Ricevi missioni sponsorizzate"
        sub="Notifiche geolocalizzate da brand partner"
        checked={settings.sponsoredMissionsEnabled}
        onChange={(v) => {
          setSettings({ ...settings, sponsoredMissionsEnabled: v });
          // Il permesso GPS si chiede PROPRIO in questo momento —
          // solo quando la persona attiva davvero il consenso, mai
          // prima. Se lo spegne, semplicemente non richiediamo nulla.
          if (v) requestAndSendLocation(userId);
        }}
      />
      <ToggleRow
        label="Comparire nella bacheca storica"
        sub="Altri potranno cercarti tra chi ha fatto check-in in un locale"
        checked={settings.appearsInHistoricalSearch}
        onChange={(v) => setSettings({ ...settings, appearsInHistoricalSearch: v })}
      />
      <ToggleRow
        label="Ricevi Pulse"
        sub="Consumazioni omaggio da altri utenti"
        checked={settings.receivePulsesEnabled}
        onChange={(v) => setSettings({ ...settings, receivePulsesEnabled: v })}
      />

      <label className="pl-select-row" style={{ marginTop: 8 }}>
        Chi può contattarti direttamente
        <select
          value={settings.contactFilter}
          onChange={(e) => setSettings({ ...settings, contactFilter: e.target.value })}
        >
          <option value="everyone">Chiunque</option>
          <option value="verified_only">Solo profili verificati</option>
          <option value="premium_only">Solo profili premium</option>
        </select>
      </label>

      <button className="pl-send-btn" onClick={save} disabled={saving}>
        {saving ? 'Salvataggio…' : 'Salva impostazioni'}
      </button>

      {/* Sezione legale — link ai testi veri (placeholder finché non
          arrivano dallo studio) + richiesta di cancellazione account,
          un diritto GDPR a sé che non passa dai toggle sopra. */}
      <div className="pl-section-label" style={{ marginTop: 20 }}>Legale</div>
      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="pl-hint" style={{ display: 'block', marginBottom: 4 }}>
        Privacy Policy →
      </a>
      <a href="/termini-di-servizio" target="_blank" rel="noopener noreferrer" className="pl-hint" style={{ display: 'block', marginBottom: 12 }}>
        Termini di Servizio →
      </a>
      {!showDeleteConfirm ? (
        <button
          className="pl-hint"
          style={{ background: 'none', border: '1px solid rgba(229,57,53,0.3)', color: 'var(--red)', borderRadius: 12, padding: 10, width: '100%', cursor: 'pointer' }}
          onClick={() => setShowDeleteConfirm(true)}
        >
          Richiedi la cancellazione del tuo account
        </button>
      ) : (
        <div style={{ border: '1px solid rgba(229,57,53,0.4)', borderRadius: 12, padding: 12 }}>
          <p className="pl-hint" style={{ marginBottom: 10, color: 'var(--red)' }}>
            Questa azione è definitiva: profilo, foto e bio verranno cancellati per sempre, e non potrai più accedere con questo account. Sei sicuro?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid rgba(228,212,200,0.3)', background: 'none', color: 'var(--text)', cursor: 'pointer' }}
            >
              Annulla
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              {deleting ? 'Cancellazione…' : 'Sì, cancella per sempre'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <div className="pl-consent-row">
      <div>
        <div className="pl-consent-label">{label}</div>
        <div className="pl-consent-sub">{sub}</div>
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

// Griglia di miniature per la galleria (18/9) — stessa griglia
// identica a quella di ProfileCreation.jsx, così chi la impara lì
// la ritrova invariata qui quando torna a modificarla.
const photoGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
  marginBottom: 14,
};

const photoTileStyle = {
  position: 'relative',
  aspectRatio: '1',
  borderRadius: 12,
  overflow: 'hidden',
  background: 'var(--surface-2)',
};

const photoTileImgStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const photoTileAddStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1.5px dashed rgba(228,212,200,0.3)',
  cursor: 'pointer',
};

const photoTileRemoveStyle = {
  position: 'absolute',
  top: 4,
  right: 4,
  width: 22,
  height: 22,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  fontSize: 11,
  cursor: 'pointer',
  lineHeight: 1,
};

const photoTilePrimaryBadgeStyle = {
  position: 'absolute',
  bottom: 4,
  left: 4,
  right: 4,
  fontSize: 8.5,
  fontWeight: 700,
  textAlign: 'center',
  color: '#fff',
  background: 'rgba(0,0,0,0.6)',
  borderRadius: 6,
  padding: '2px 0',
};

import { useState, useRef } from 'react';
import { apiFetch, requestAndSendLocation, uploadPhotoToStorage } from './apiClient';

/**
 * ============================================================
 * POPULIVE — CREAZIONE PROFILO (componente reale)
 * ============================================================
 * Tre passaggi, nell'ordine deciso insieme:
 *   1) Dati base: nome, bio, hashtag
 *   2) Foto (upload verso storage esterno, qui solo l'URL risultante)
 *   3) Schermata di consenso — MAI saltabile, mai un malus per chi
 *      sceglie il minimo, solo bonus per chi condivide di più
 * Solo dopo il passaggio 3 l'utente può usare il resto dell'app
 * (il "cancello" requireOnboarded lato server blocca tutto prima).
 * L'identità dell'utente arriva dal token (v. apiClient.js), non
 * più da un ID passato a mano — l'account esiste già dal momento
 * della verifica del codice SMS.
 * ============================================================
 */

const MAX_HASHTAGS = 5;
const MAX_PHOTOS = 6; // stessa galleria di Settings.jsx — scorrimento verticale stile Hinge nel profilo a tutto schermo

export default function ProfileCreation({ onComplete }) {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  // Facoltativo per davvero — resta null finché la persona non
  // sceglie attivamente un'opzione. Usato SOLO per mostrare quanti
  // uomini/donne sono in un locale in forma aggregata, mai su un
  // profilo individuale.
  const [genderForStats, setGenderForStats] = useState(null);
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags] = useState([]);
  // Galleria (18/9) — fino a MAX_PHOTOS file scelti, non ancora
  // caricati. L'upload vero verso Cloudinary avviene solo al
  // passaggio "Continua", una foto alla volta, riusando la stessa
  // uploadPhotoToStorage di sempre.
  const [photoFiles, setPhotoFiles] = useState([]);
  // Riordino via trascinamento (18/9) — stesso meccanismo a Pointer
  // Events di Settings.jsx (v. lì il commento esteso sul perché non
  // il drag-and-drop HTML5 nativo).
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const dragStartRef = useRef(null);
  const [consent, setConsent] = useState({
    sponsoredMissionsEnabled: false,
    appearsInHistoricalSearch: true,
    receivePulsesEnabled: true,
    contactFilter: 'everyone',
  });
  // Consenso legale OBBLIGATORIO (Privacy Policy + Termini) — separato
  // dai consensi opzionali sopra: qui non c'è bonus/malus, è la base
  // minima per legge per poter usare l'app. TESTI VERI da inserire
  // non appena arrivano dallo studio legale — per ora placeholder,
  // ma il meccanismo di blocco (non puoi continuare senza spuntarlo)
  // è già quello definitivo.
  const [legalAccepted, setLegalAccepted] = useState(false);
  const PRIVACY_POLICY_VERSION = 'v1.0-placeholder';
  const TERMS_VERSION = 'v1.0-placeholder';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --------------------------------------------------------
  // Step 1 → crea il profilo base sul server
  // --------------------------------------------------------
  async function submitBaseProfile(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio, hashtagNames: hashtags, genderForStats }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(
          data.reason === 'too_many_hashtags'
            ? `Massimo ${MAX_HASHTAGS} hashtag`
            : 'Controlla il nome inserito'
        );
        setLoading(false);
        return;
      }

      setStep(2);
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setLoading(false);
    }
  }

  function addHashtag() {
    const clean = hashtagInput.trim().replace(/^#/, '').toLowerCase();
    if (!clean || hashtags.length >= MAX_HASHTAGS || hashtags.includes(clean)) return;
    setHashtags([...hashtags, clean]);
    setHashtagInput('');
  }

  // --------------------------------------------------------
  // Step 2 → galleria (upload verso storage esterno, una foto alla
  // volta, poi si salva l'elenco completo degli indirizzi risultanti)
  // --------------------------------------------------------
  function addPhotoFiles(files) {
    const room = MAX_PHOTOS - photoFiles.length;
    if (room <= 0) return;
    setPhotoFiles([...photoFiles, ...Array.from(files).slice(0, room)]);
  }

  function removePhotoFile(index) {
    setPhotoFiles(photoFiles.filter((_, i) => i !== index));
  }

  const DRAG_THRESHOLD = 6;

  function handleTilePointerDown(e, index) {
    dragStartRef.current = { index, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleTilePointerMove(e) {
    const start = dragStartRef.current;
    if (!start) return;

    if (dragIndex === null) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      setDragIndex(start.index);
    }

    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-photo-index]');
    setOverIndex(el ? Number(el.dataset.photoIndex) : null);
  }

  function handleTilePointerUp(e) {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* già rilasciato */
    }

    if (start && dragIndex !== null && overIndex !== null && overIndex !== dragIndex) {
      const list = [...photoFiles];
      const [moved] = list.splice(dragIndex, 1);
      list.splice(overIndex, 0, moved);
      setPhotoFiles(list);
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  async function submitPhoto() {
    setLoading(true);
    setError(null);

    try {
      if (photoFiles.length > 0) {
        // Caricamento reale verso Cloudinary (v. uploadPhotoToStorage
        // in apiClient.js, condivisa anche con Settings.jsx), UNA
        // foto alla volta e IN ORDINE — l'ordine di arrivo diventa
        // l'ordine della galleria, la prima è quella mostrata ovunque
        // nell'app fuori dal profilo a tutto schermo.
        const photoUrls = [];
        for (const file of photoFiles) {
          photoUrls.push(await uploadPhotoToStorage(file));
        }
        await apiFetch('/api/profile/me/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrls }),
        });
      }
      setStep(3);
    } catch {
      setError('Caricamento foto non riuscito — puoi comunque continuare e aggiungerle dopo.');
      setStep(3);
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------------
  // Step 3 → consenso — l'unico passaggio davvero obbligatorio
  // per poter usare l'app
  // --------------------------------------------------------
  async function submitConsent() {
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/profile/me/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...consent,
          privacyPolicyVersionAccepted: PRIVACY_POLICY_VERSION,
          termsVersionAccepted: TERMS_VERSION,
        }),
      });
      const data = await res.json();

      if (data.success) {
        onComplete();
      } else {
        setError('Qualcosa è andato storto nel salvataggio delle preferenze.');
      }
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------
  return (
    <div className="pl-onboarding-screen">
      <div className="pl-step-indicator">Passo {step} di 3</div>

      {step === 1 && (
        <form onSubmit={submitBaseProfile}>
          <h2>Come vuoi farti chiamare?</h2>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nome"
            required
          />
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Una breve bio (facoltativa)"
            maxLength={280}
          />

          {/* Domanda facoltativa — mai obbligatoria, nessun vantaggio
              né svantaggio nel rispondere o meno. Usata SOLO per
              mostrare quante persone di ciascun genere sono in un
              locale in questo momento, in forma aggregata — mai sul
              tuo profilo, mai visibile a nessun altro utente. */}
          <div style={{ margin: '4px 0 10px' }}>
            <div className="pl-consent-label" style={{ marginBottom: 2 }}>
              Genere{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(facoltativo)</span>
            </div>
            <div className="pl-consent-sub" style={{ marginBottom: 8 }}>
              Serve solo per mostrare quante persone ci sono in un locale, in forma aggregata — mai
              sul tuo profilo
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { value: 'female', label: 'Donna' },
                { value: 'male', label: 'Uomo' },
                { value: 'other', label: 'Altro' },
                { value: null, label: 'Preferisco non dirlo' },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setGenderForStats(opt.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border:
                      genderForStats === opt.value
                        ? '1px solid var(--cyan)'
                        : '1px solid rgba(228,212,200,0.16)',
                    background:
                      genderForStats === opt.value ? 'rgba(255,61,110,0.14)' : 'var(--surface-2)',
                    color: genderForStats === opt.value ? 'var(--cyan)' : 'var(--text-muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pl-hashtag-input-row">
            <input
              value={hashtagInput}
              onChange={(e) => setHashtagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
              placeholder="#fitness, #nightlife..."
            />
            <button type="button" onClick={addHashtag}>
              Aggiungi
            </button>
          </div>
          <div className="pl-hashtag-list">
            {hashtags.map((h) => (
              <span key={h} className="pl-hashtag-pill">
                #{h}
                <button type="button" onClick={() => setHashtags(hashtags.filter((x) => x !== h))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
          <p className="pl-hint">
            Gli hashtag ti rendono trovabile dai brand della tua categoria — max {MAX_HASHTAGS}.
          </p>

          {/* Casella dedicata, non un hashtag scritto a mano come gli
              altri — ma sotto usa la STESSA infrastruttura hashtag
              già esistente (aggiunge/toglie "pr"), così il motore di
              ricerca per hashtag in dashboard funziona per questo
              come per qualunque altra categoria, senza duplicare nulla. */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={hashtags.includes('pr')}
              onChange={(e) => {
                if (e.target.checked) {
                  if (!hashtags.includes('pr') && hashtags.length < MAX_HASHTAGS) {
                    setHashtags([...hashtags, 'pr']);
                  }
                } else {
                  setHashtags(hashtags.filter((h) => h !== 'pr'));
                }
              }}
              style={{ width: 16, height: 16, marginBottom: 0 }}
            />
            <span style={{ fontSize: 12 }}>
              Sono un PR — rendimi trovabile dai locali che cercano organizzatori
            </span>
          </label>

          {error && <p className="pl-error">{error}</p>}
          <button type="submit" disabled={loading || !displayName.trim()}>
            {loading ? 'Un attimo…' : 'Continua'}
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          <h2>Aggiungi le tue foto</h2>
          <p className="pl-hint" style={{ marginBottom: 10 }}>
            Fino a {MAX_PHOTOS} — la prima è quella che gli altri vedono nel radar e nelle
            notifiche, tutte insieme si scorrono nel tuo profilo completo.
          </p>
          {photoFiles.length > 1 && (
            <p className="pl-hint" style={{ marginTop: -6, marginBottom: 10 }}>
              Tieni premuto e trascina per riordinare.
            </p>
          )}
          <div style={photoGridStyle}>
            {photoFiles.map((file, i) => (
              <div
                key={i}
                data-photo-index={i}
                onPointerDown={(e) => handleTilePointerDown(e, i)}
                onPointerMove={handleTilePointerMove}
                onPointerUp={handleTilePointerUp}
                onPointerCancel={handleTilePointerUp}
                style={{
                  ...photoTileStyle,
                  opacity: dragIndex === i ? 0.45 : 1,
                  transform: dragIndex === i ? 'scale(1.05)' : 'none',
                  boxShadow:
                    dragIndex !== null && overIndex === i && overIndex !== dragIndex
                      ? '0 0 0 2px var(--cyan) inset'
                      : 'none',
                  touchAction: 'none',
                  cursor: 'grab',
                  transition:
                    dragIndex === i ? 'none' : 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt=""
                  style={photoTileImgStyle}
                  draggable={false}
                />
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removePhotoFile(i)}
                  style={photoTileRemoveStyle}
                  aria-label="Rimuovi"
                >
                  ✕
                </button>
                {i === 0 && <span style={photoTilePrimaryBadgeStyle}>Principale</span>}
              </div>
            ))}
            {photoFiles.length < MAX_PHOTOS && (
              <label style={{ ...photoTileStyle, ...photoTileAddStyle }}>
                <span style={{ fontSize: 26, color: 'var(--text-muted)' }}>+</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    addPhotoFiles(e.target.files);
                    e.target.value = '';
                  }}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>
          {error && <p className="pl-error">{error}</p>}
          <button onClick={submitPhoto} disabled={loading}>
            {loading ? 'Un attimo…' : photoFiles.length > 0 ? 'Continua' : 'Salta per ora'}
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2>Le tue preferenze</h2>
          <p className="pl-hint">
            Queste opzioni sono tutte facoltative — l'app funziona comunque al 100% se le lasci
            disattivate. Ognuna attiva ti dà +5% sui punti che guadagni (fino a +15% con tutte e
            tre) — mai una penalità se non lo fai.
          </p>

          <ConsentToggle
            label="Ricevi missioni sponsorizzate"
            sub="Notifiche geolocalizzate da brand partner"
            checked={consent.sponsoredMissionsEnabled}
            onChange={(v) => {
              setConsent({ ...consent, sponsoredMissionsEnabled: v });
              if (v) requestAndSendLocation('me');
            }}
          />
          <ConsentToggle
            label="Comparire nella bacheca storica"
            sub="Altri potranno cercarti tra chi ha fatto check-in in un locale"
            checked={consent.appearsInHistoricalSearch}
            onChange={(v) => setConsent({ ...consent, appearsInHistoricalSearch: v })}
          />
          <ConsentToggle
            label="Ricevi Pulse"
            sub="Consumazioni omaggio da altri utenti"
            checked={consent.receivePulsesEnabled}
            onChange={(v) => setConsent({ ...consent, receivePulsesEnabled: v })}
          />

          <label className="pl-select-row">
            Chi può contattarti direttamente
            <select
              value={consent.contactFilter}
              onChange={(e) => setConsent({ ...consent, contactFilter: e.target.value })}
            >
              <option value="everyone">Chiunque</option>
              <option value="verified_only">Solo profili verificati</option>
              <option value="premium_only">Solo profili premium</option>
            </select>
          </label>

          {/* Consenso legale OBBLIGATORIO — separato dai toggle sopra
              (quelli sono bonus opzionali, questo no). Non saltabile:
              il bottone finale resta disabilitato finché non è spuntato.
              TODO: sostituire i link placeholder con quelli veri non
              appena lo studio legale consegna i testi definitivi. */}
          <div className="pl-consent-row" style={{ marginTop: 12 }}>
            <div>
              <div className="pl-consent-label">
                Ho letto e accetto la{' '}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>{' '}
                e i{' '}
                <a href="/termini-di-servizio" target="_blank" rel="noopener noreferrer">
                  Termini di Servizio
                </a>
              </div>
              <div className="pl-consent-sub">
                Obbligatorio per usare PopuLive — non è un consenso opzionale come quelli sopra
              </div>
            </div>
            <input
              type="checkbox"
              checked={legalAccepted}
              onChange={(e) => setLegalAccepted(e.target.checked)}
            />
          </div>

          {error && <p className="pl-error">{error}</p>}
          <button onClick={submitConsent} disabled={loading || !legalAccepted}>
            {loading ? 'Un attimo…' : 'Inizia a usare PopuLive'}
          </button>
        </div>
      )}
    </div>
  );
}

function ConsentToggle({ label, sub, checked, onChange }) {
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
// riusata identica in Settings.jsx per modificarla dopo la
// registrazione, così chi impara a usarla qui la ritrova identica.
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

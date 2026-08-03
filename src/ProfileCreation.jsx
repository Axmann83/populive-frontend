import { useState } from 'react';
import { apiFetch, requestAndSendLocation } from './apiClient';

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
  const [photoFile, setPhotoFile] = useState(null);
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
        setError(data.reason === 'too_many_hashtags'
          ? `Massimo ${MAX_HASHTAGS} hashtag`
          : 'Controlla il nome inserito');
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
  // Step 2 → foto (upload verso storage esterno + salvataggio URL)
  // --------------------------------------------------------
  async function submitPhoto() {
    setLoading(true);
    setError(null);

    try {
      let photoUrl = null;
      if (photoFile) {
        // In produzione: upload reale verso S3/Cloudinary che
        // restituisce l'URL. Qui il punto di innesto è pronto,
        // la funzione uploadToStorage va scritta quando scegliamo
        // il provider di storage definitivo.
        photoUrl = await uploadToStorage(photoFile);
        await apiFetch('/api/profile/me/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrl }),
        });
      }
      setStep(3);
    } catch {
      setError('Caricamento foto non riuscito — puoi comunque continuare e aggiungerla dopo.');
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
              Genere <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(facoltativo)</span>
            </div>
            <div className="pl-consent-sub" style={{ marginBottom: 8 }}>
              Serve solo per mostrare quante persone ci sono in un locale, in forma aggregata — mai sul tuo profilo
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
                    padding: '7px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    border: genderForStats === opt.value ? '1px solid var(--cyan)' : '1px solid rgba(228,212,200,0.16)',
                    background: genderForStats === opt.value ? 'rgba(47,211,232,0.14)' : 'var(--surface-2)',
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
            <button type="button" onClick={addHashtag}>Aggiungi</button>
          </div>
          <div className="pl-hashtag-list">
            {hashtags.map((h) => (
              <span key={h} className="pl-hashtag-pill">
                #{h}
                <button type="button" onClick={() => setHashtags(hashtags.filter((x) => x !== h))}>✕</button>
              </span>
            ))}
          </div>
          <p className="pl-hint">Gli hashtag ti rendono trovabile dai brand della tua categoria — max {MAX_HASHTAGS}.</p>

          {error && <p className="pl-error">{error}</p>}
          <button type="submit" disabled={loading || !displayName.trim()}>
            {loading ? 'Un attimo…' : 'Continua'}
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          <h2>Aggiungi una foto</h2>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files[0])}
          />
          {error && <p className="pl-error">{error}</p>}
          <button onClick={submitPhoto} disabled={loading}>
            {loading ? 'Un attimo…' : photoFile ? 'Continua' : 'Salta per ora'}
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2>Le tue preferenze</h2>
          <p className="pl-hint">
            Queste opzioni sono tutte facoltative — l'app funziona comunque al 100% se le lasci disattivate.
            Ognuna attiva ti dà +5% sui punti che guadagni (fino a +15% con tutte e tre) — mai una penalità se non lo fai.
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
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                {' '}e i{' '}
                <a href="/termini-di-servizio" target="_blank" rel="noopener noreferrer">Termini di Servizio</a>
              </div>
              <div className="pl-consent-sub">Obbligatorio per usare PopuLive — non è un consenso opzionale come quelli sopra</div>
            </div>
            <input type="checkbox" checked={legalAccepted} onChange={(e) => setLegalAccepted(e.target.checked)} />
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

// Upload reale verso Cloudinary tramite "unsigned upload preset" —
// non serve mai l'API Secret lato client, solo cloud name + preset
// (entrambi pubblici, sicuri da avere nel codice frontend).
const CLOUDINARY_CLOUD_NAME = 'rjkegdrp';
const CLOUDINARY_UPLOAD_PRESET = 'populive_profile_photos';

async function uploadToStorage(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    throw new Error('Upload verso Cloudinary non riuscito');
  }

  const data = await res.json();
  return data.secure_url; // questo è l'URL da salvare in photo_url
}

import { useState } from 'react';

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
 * ============================================================
 */

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';
const MAX_HASHTAGS = 5;

export default function ProfileCreation({ onComplete }) {
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [consent, setConsent] = useState({
    sponsoredMissionsEnabled: false,
    appearsInHistoricalSearch: true,
    receiveRosesEnabled: true,
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
      const res = await fetch(`${API_BASE}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio, hashtagNames: hashtags }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.reason === 'too_many_hashtags'
          ? `Massimo ${MAX_HASHTAGS} hashtag`
          : 'Controlla il nome inserito');
        setLoading(false);
        return;
      }

      setUserId(data.userId);
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
        photoUrl = await uploadToStorage(photoFile);
        await fetch(`${API_BASE}/api/profile/${userId}/photo`, {
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
      const res = await fetch(`${API_BASE}/api/profile/${userId}/onboarding`, {
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
        onComplete(userId);
      } else {
        setError('Qualcosa è andato storto nel salvataggio delle preferenze.');
      }
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setLoading(false);
    }
  }

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
            Attivarle ti dà un piccolo bonus di punti, mai una penalità se non lo fai.
          </p>

          <ConsentToggle
            label="Ricevi missioni sponsorizzate"
            sub="Notifiche geolocalizzate da brand partner"
            checked={consent.sponsoredMissionsEnabled}
            onChange={(v) => setConsent({ ...consent, sponsoredMissionsEnabled: v })}
          />
          <ConsentToggle
            label="Comparire nella bacheca storica"
            sub="Altri potranno cercarti tra chi ha fatto check-in in un locale"
            checked={consent.appearsInHistoricalSearch}
            onChange={(v) => setConsent({ ...consent, appearsInHistoricalSearch: v })}
          />
          <ConsentToggle
            label="Ricevi Rose"
            sub="Consumazioni omaggio da altri utenti"
            checked={consent.receiveRosesEnabled}
            onChange={(v) => setConsent({ ...consent, receiveRosesEnabled: v })}
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
  return data.secure_url;
}

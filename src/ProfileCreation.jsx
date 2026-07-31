import { useState } from 'react';
import { apiFetch } from './apiClient';

const MAX_HASHTAGS = 5;

export default function ProfileCreation({ onComplete }) {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [genderForStats, setGenderForStats] = useState(null);
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [consent, setConsent] = useState({
    sponsoredMissionsEnabled: false,
    appearsInHistoricalSearch: true,
    receiveRosesEnabled: true,
    contactFilter: 'everyone',
  });
  const [legalAccepted, setLegalAccepted] = useState(false);
  const PRIVACY_POLICY_VERSION = 'v1.0-placeholder';
  const TERMS_VERSION = 'v1.0-placeholder';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  async function submitPhoto() {
    setLoading(true);
    setError(null);

    try {
      let photoUrl = null;
      if (photoFile) {
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

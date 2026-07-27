import { useState } from 'react';
import { apiFetch, setSession } from './apiClient';

/**
 * ============================================================
 * POPULIVE — LOGIN (telefono + SMS)
 * ============================================================
 * Due passaggi:
 *   1) Numero di telefono → il server invia un codice via SMS
 *   2) Codice → se corretto, il server risponde con un token di
 *      sessione (JWT) che salviamo e useremo per tutte le
 *      richieste successive (v. apiClient.js)
 * ============================================================
 */
export default function Login({ onLoggedIn }) {
  const [step, setStep] = useState('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function submitPhone(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(reasonToMessage(data.reason));
        return;
      }
      setStep('code');
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, code }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(reasonToMessage(data.reason));
        return;
      }

      setSession(data.token, data.userId);
      onLoggedIn(data.userId, data.isNewUser, data.onboardingCompleted);
    } catch {
      setError('Non siamo riusciti a raggiungere il server — riprova.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pl-onboarding-screen">
      {step === 'phone' && (
        <form onSubmit={submitPhone}>
          <h2>Accedi a PopuLive</h2>
          <p className="pl-hint">Ti mandiamo un codice via SMS per verificare che sei tu.</p>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="Numero di telefono (es. 333 1234567)"
            required
          />
          {error && <p className="pl-error">{error}</p>}
          <button type="submit" disabled={loading || !phoneNumber.trim()}>
            {loading ? 'Invio in corso…' : 'Invia il codice'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={submitCode}>
          <h2>Inserisci il codice</h2>
          <p className="pl-hint">Ti abbiamo mandato un codice a 6 cifre via SMS al numero inserito.</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="Codice a 6 cifre"
            required
          />
          {error && <p className="pl-error">{error}</p>}
          <button type="submit" disabled={loading || code.length !== 6}>
            {loading ? 'Verifica…' : 'Verifica e accedi'}
          </button>
          <p
            className="pl-hint"
            style={{ textAlign: 'center', marginTop: 10, cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => { setStep('phone'); setCode(''); setError(null); }}
          >
            Numero sbagliato? Torna indietro
          </p>
        </form>
      )}
    </div>
  );
}

function reasonToMessage(reason) {
  const messages = {
    invalid_phone_number: 'Numero di telefono non valido.',
    sms_send_failed: 'Non siamo riusciti a inviare l\'SMS — riprova tra poco.',
    no_pending_code: 'Nessun codice in attesa per questo numero — richiedine uno nuovo.',
    code_expired: 'Il codice è scaduto — richiedine uno nuovo.',
    too_many_attempts: 'Troppi tentativi sbagliati — richiedi un nuovo codice.',
    wrong_code: 'Codice errato, riprova.',
  };
  return messages[reason] || 'Qualcosa è andato storto — riprova.';
}

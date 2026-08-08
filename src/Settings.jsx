import { useState, useEffect } from 'react';

import { apiFetch, requestAndSendLocation } from './apiClient';

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
export default function Settings({ userId, onClose }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      <button
        className="pl-hint"
        style={{ background: 'none', border: '1px solid rgba(229,57,53,0.3)', color: 'var(--red)', borderRadius: 12, padding: 10, width: '100%', cursor: 'pointer' }}
        onClick={() => alert('Richiesta di cancellazione account — da collegare al flusso reale quando pronto (diritto GDPR alla cancellazione).')}
      >
        Richiedi la cancellazione del tuo account
      </button>
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

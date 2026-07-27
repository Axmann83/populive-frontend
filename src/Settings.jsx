import { useState, useEffect } from 'react';

import { apiFetch } from './apiClient';

/**
 * ============================================================
 * POPULIVE — IMPOSTAZIONI (componente reale)
 * ============================================================
 * Richiamabile in ogni momento dal profilo (icona rotella ⚙️).
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

      <div className="pl-section-label" style={{ marginTop: 16 }}>Consenso e privacy</div>
      <p className="pl-hint">
        Queste opzioni restano tutte facoltative — l'app funziona al 100% anche se le lasci disattivate,
        mai una penalità per averle spente.
      </p>
      <ToggleRow
        label="Ricevi missioni sponsorizzate"
        sub="Notifiche geolocalizzate da brand partner"
        checked={settings.sponsoredMissionsEnabled}
        onChange={(v) => setSettings({ ...settings, sponsoredMissionsEnabled: v })}
      />
      <ToggleRow
        label="Comparire nella bacheca storica"
        sub="Altri potranno cercarti tra chi ha fatto check-in in un locale"
        checked={settings.appearsInHistoricalSearch}
        onChange={(v) => setSettings({ ...settings, appearsInHistoricalSearch: v })}
      />
      <ToggleRow
        label="Ricevi Rose"
        sub="Consumazioni omaggio da altri utenti"
        checked={settings.receiveRosesEnabled}
        onChange={(v) => setSettings({ ...settings, receiveRosesEnabled: v })}
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

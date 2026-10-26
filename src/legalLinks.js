import { isNative, openExternal } from './native';

/**
 * ============================================================
 * POPULIVE — LINK AI TESTI LEGALI
 * ============================================================
 * Privacy Policy e Termini di servizio sono due pagine statiche in
 * `public/` (fuori da React), così si aprono da qualunque link:
 * App Store Connect, una mail, il browser in-app. Indirizzo
 * assoluto sul dominio pubblico del frontend: è lo stesso che va
 * nella scheda dell'app su App Store Connect, e dentro l'app un
 * percorso relativo punterebbe alla copia impacchettata
 * nell'app, che la WebView aprirebbe al posto dell'app stessa,
 * senza un modo per tornare indietro.
 * ============================================================
 */
const PUBLIC_BASE = 'https://populive-frontend-production.up.railway.app';

export const PRIVACY_POLICY_URL = `${PUBLIC_BASE}/privacy-policy.html`;
export const TERMS_URL = `${PUBLIC_BASE}/termini-di-servizio.html`;

/**
 * onClick per i link legali: sul web lascia fare al link
 * (`target="_blank"`, nuova scheda); nell'app lo apre nel browser
 * in-app.
 */
export function openLegalLink(event) {
  if (!isNative()) return;
  event.preventDefault();
  openExternal(event.currentTarget.href);
}

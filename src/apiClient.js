const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

/**
 * ============================================================
 * POPULIVE — CLIENT API CENTRALIZZATO
 * ============================================================
 * Prima, ogni schermata mandava un header "x-user-id" scritto a
 * mano — un sistema che chiunque poteva falsificare (bastava
 * scrivere un ID a caso per "diventare" un altro utente). Ora
 * l'identità vera arriva da un token firmato dal server al login,
 * e questo file è l'UNICO posto che lo gestisce: lo salva, lo
 * legge, lo aggiunge automaticamente a ogni richiesta. Tutte le
 * altre schermate chiamano semplicemente apiFetch(...) invece di
 * fetch(...), senza doversi preoccupare del token.
 * ============================================================
 */

const TOKEN_KEY = 'pl_token';
const USER_ID_KEY = 'pl_user_id';

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function setSession(token, userId) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_ID_KEY, userId);
  } catch { /* ignorato */ }
}

function getStoredUserId() {
  try { return localStorage.getItem(USER_ID_KEY); } catch { return null; }
}

function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
  } catch { /* ignorato */ }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
  }

  return res;
}

export { API_BASE, getToken, getStoredUserId, setSession, clearSession, apiFetch };

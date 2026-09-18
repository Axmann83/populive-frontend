# PopuLive — Frontend

Web app React (Create React App), pensata per browser mobile. Non usa Capacitor.

## Stack

- React 18 + `react-scripts` 5 (Create React App)
- `leaflet` (mappe), `socket.io-client` (chat realtime), `html5-qrcode` / `qrcode`, `lucide-react` (icone)
- ESLint + Prettier per la qualità del codice, Husky + lint-staged per il pre-commit

## Requisiti

- Node.js ≥ 18 (testato con v21)
- npm ≥ 9

## Avvio rapido

```bash
npm install          # solo la prima volta
npm run start:dev    # sviluppo contro il backend locale
```

L'app è su http://localhost:3000 con hot reload. Il backend deve girare a parte su http://localhost:3001.

## Configurazione

| File       | Caricato da                    | Backend                                              |
| ---------- | ------------------------------ | ---------------------------------------------------- |
| `.env`     | `npm start`, `npm run build`   | `https://populive-backend-production.up.railway.app` |
| `.env.dev` | solo `npm run start:dev`       | `http://localhost:3001`                              |

- `.env` è la configurazione di produzione, usata da Railway (`npm start`) e dalla build.
- `.env.dev` viene caricato esplicitamente da `dotenv-cli` nello script `start:dev`. CRA non lo legge
  mai da solo (a differenza di `.env.development` / `.env.local`), quindi non può influenzare la produzione.
  Oltre all'URL del backend imposta:
  - `PORT=3000` — porta del frontend
  - `BROWSER=none` — non apre il browser automaticamente
  - `GENERATE_SOURCEMAP=false` — silenzia i warning sui source map di `html5-qrcode`
- I file `.env.*.local` sono ignorati da Git: usali per override personali che non vuoi committare.
- Dopo ogni modifica a un file `.env*` riavvia il dev server.

## Script npm

| Comando                | Descrizione                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run start:dev`    | Dev server su `:3000` contro il backend locale (`.env.dev`)          |
| `npm start`            | Dev server su `:3000` contro il backend Railway (`.env`)             |
| `npm run build`        | Build di produzione in `build/`                                      |
| `npm test`             | Test runner di CRA                                                   |
| `npm run lint`         | ESLint su `src/` (console.log, variabili non usate, ecc.)            |
| `npm run lint:fix`     | Corregge automaticamente ciò che ESLint può correggere               |
| `npm run format`       | Formatta `src/` con Prettier                                         |
| `npm run format:check` | Verifica la formattazione senza modificare i file                    |
| `npm run check`        | `lint` + `format:check` su tutto `src/`                              |
| `npm run prepare`      | Installa gli hook Git di Husky (eseguito in automatico da `npm install`) |

## Qualità del codice

Configurazione in `.eslintrc.json`, `.prettierrc` e `.editorconfig`.

Regole principali:
- `console.log` vietato (`console.warn` / `console.error` ammessi)
- niente variabili, import o parametri non usati (i parametri con prefisso `_` sono ignorati)
- `const` al posto di `let` quando possibile, `var` vietato
- `===` obbligatorio (`== null` ammesso)
- formattazione Prettier: single quote, punto e virgola, larghezza 100, fine riga LF

Le stesse regole ESLint vengono applicate da `npm start` (overlay nel browser) e da `npm run build`
(in CI i warning bloccano la build). Consiglio: installa le estensioni ESLint e Prettier nel tuo editor e attiva "format on save".

### Pre-commit (Husky + lint-staged)

A ogni `git commit` l'hook `.husky/pre-commit` esegue `lint-staged` **solo sui file in stage**:

- `src/**/*.{js,jsx}` → `eslint --max-warnings=0 --fix` poi `prettier --write`
- `src/**/*.css` → `prettier --write`

Le correzioni automatiche vengono aggiunte al commit; se restano errori (es. un `console.log`) il commit
viene bloccato. Gli hook si installano con `npm install` (script `prepare`). Per saltare l'hook in caso
di emergenza: `git commit --no-verify`.

## Struttura

```
public/index.html       pagina host
src/index.js            entry point
src/App.jsx             root dell'app e navigazione tra le schermate
src/apiClient.js        client HTTP centralizzato (token, sessione, apiFetch)
src/*.jsx               schermate e componenti (Login, Dashboard, ExploreMap, ChatCenter, ...)
src/populive-styles.css stili globali
```

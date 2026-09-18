# PopuLive — Frontend

Web app React (Create React App), pensata per browser mobile, impacchettata come app iOS/Android con Capacitor.

## Stack

- React 18 + `react-scripts` 5 (Create React App)
- `leaflet` (mappe), `socket.io-client` (chat realtime), `html5-qrcode` / `qrcode`, `lucide-react` (icone)
- Capacitor 8 (`@capacitor/app`, `@capacitor/browser`) per le app iOS/Android
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
| `npm run build:mobile` | `build` + `cap sync` (copia la build nei progetti nativi)             |
| `npm run cap:sync`     | Solo `cap sync` (dopo aver aggiunto/aggiornato plugin Capacitor)     |
| `npm run android`      | Apre il progetto Android in Android Studio                           |
| `npm run android:run`  | Compila e installa l'app sul telefono Android collegato via USB      |
| `npm run android:dev`  | Come sopra ma contro dev server e backend locali (hot reload via USB) |
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

## App mobile (Capacitor)

Identità: **PopuLive**, bundle/package id **`com.populive.app`**. Configurazione in `capacitor.config.ts`;
progetti nativi in `android/` e `ios/` (committati). La WebView carica la build di produzione (`build/`),
quindi l'app parla sempre al backend di `.env` (Railway).

Il codice web resta identico tra browser e app: l'unico punto che tocca Capacitor è `src/native.js`

### Android (in locale su Windows)

**Android Studio non è necessario**: bastano SDK, JDK e `adb` da terminale. Gradle scarica da solo i
componenti SDK che gli servono (build-tools, platform), quindi non c'è nulla da aggiornare a mano.

Prerequisiti:
- **Android SDK** in `%LOCALAPPDATA%\Android\Sdk` con la variabile `ANDROID_HOME` che punta lì
- **JDK 21 o superiore** (Capacitor 8 / Gradle 8.14). `JAVA_HOME` deve puntare alla **cartella del JDK**,
  es. `C:\Program Files\Java\jdk-22`. Dopo averla modificata riapri il terminale.
- `%ANDROID_HOME%\platform-tools` nel `PATH` (per `adb`); `%JAVA_HOME%\bin` nel `PATH` (per `keytool`)
- Sul telefono: Opzioni sviluppatore → **Debug USB** attivo; al primo collegamento accetta il prompt
  "Consentire il debug USB"


**Build e installazione (app: build di produzione + backend Railway):**

```bash
npm run build:mobile
npm run android:run
```

L'APK di debug finisce in `android/app/build/outputs/apk/debug/app-debug.apk` (si può anche copiare sul
telefono e installare a mano).

**Sviluppo contro il backend locale, con hot reload sul telefono:**

```bash
npm run start:dev     # terminale 1: frontend :3000 → backend :3001
npm run android:dev   # terminale 2: sync + adb reverse + installa
```

Attenzione: `localhost` sul telefono è il telefono stesso, e l'URL del backend viene fissato nel bundle al
momento della build. `android:dev` (`scripts/android-dev.js`) risolve entrambe le cose:
1. `cap sync android` con `CAP_SERVER_URL=http://localhost:3000` → la WebView carica il dev server del PC
   invece della build (le modifiche al codice si vedono sul telefono senza reinstallare)
2. `adb reverse` sulle porte 3000 e 3001 → sul telefono `localhost:3000/3001` vengono inoltrati al PC
   attraverso il cavo USB: nessun IP da configurare, e il bundle del dev server (che punta a `localhost:3001`)
3. `cap run android` → compila e installa

`adb reverse` va rifatto a ogni ricollegamento del cavo: lo script lo fa da solo. Il backend locale deve
accettare CORS da `http://localhost:3000` (lo stesso origin del dev server web).
Per tornare all'app "vera": `npm run build:mobile`.

**Debug della WebView:** Chrome sul PC → `chrome://inspect` con il telefono collegato → Inspect.
Log nativi: `adb logcat`.

**Firma di release** (per Play Store): keystore creato con `keytool -genkeypair`, poi `cd android && gradlew bundleRelease`;
lo SHA-256 del keystore di release va anche in `public/.well-known/assetlinks.json` (vedi sotto).

### iOS (senza Mac, via Codemagic → TestFlight)

La build la fa Codemagic (`codemagic.yaml`) e la pubblica su TestFlight, da cui si installa sull'iPhone.

Setup una tantum (le istruzioni dettagliate sono nei commenti di `codemagic.yaml`):
1. developer.apple.com → Identifiers → App ID `com.populive.app` con capability **Associated Domains**
2. App Store Connect → nuova app collegata a quell'App ID; TestFlight → aggiungi il tuo iPhone come tester nel gruppo "Interni"
3. App Store Connect → Users and Access → Integrations → crea una API key
4. Codemagic → Teams → Integrations → App Store Connect → aggiungi la key col nome `populive_asc`
5. Codemagic → aggiungi il repo GitHub; il workflow `ios-testflight` parte a ogni push su `main`


### Deep link (QR) e ritorno da Stripe

I QR contengono URL `https://populive-frontend-production.up.railway.app/checkin/<id>` e `/mission/<id>`.
Con App Links (Android) e Universal Links (iOS) quegli URL aprono direttamente l'app; lo stesso meccanismo
riporta nell'app al termine del checkout Stripe. Perché funzioni il sito deve servire i due file in
`public/.well-known/` — vanno completati:
- `assetlinks.json`: contiene già lo SHA-256 del keystore di debug di questa macchina; sostituire il placeholder con quello di release
  (debug: `keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android`;
  release: quello del keystore di release, oppure quello di Play App Signing se pubblichi sul Play Store)
- `apple-app-site-association`: sostituire `TEAMID` con il Team ID Apple (developer.apple.com → Membership)

`apple-app-site-association` deve essere servito con `Content-Type: application/json` e senza redirect.

### Permessi nativi

Già dichiarati: fotocamera (scanner QR) e posizione (mappa, invio posizione) in
`android/app/src/main/AndroidManifest.xml` e `ios/App/App/Info.plist`. Le API web (`getUserMedia`,
`navigator.geolocation`) funzionano nella WebView senza plugin aggiuntivi.

### Cosa serve lato backend

- CORS (HTTP e Socket.io): aggiungere le origini `capacitor://localhost` (iOS) e `https://localhost` (Android)
- Stripe: success/cancel URL devono restare sul dominio del frontend (`https://populive-frontend-production.up.railway.app/?pulse_sent=1` ecc.), così l'Universal/App Link riporta nell'app

## Struttura

```
public/index.html       pagina host
src/index.js            entry point
src/App.jsx             root dell'app e navigazione tra le schermate
src/apiClient.js        client HTTP centralizzato (token, sessione, apiFetch)
src/*.jsx               schermate e componenti (Login, Dashboard, ExploreMap, ChatCenter, ...)
src/native.js           ponte verso Capacitor (unico file che lo importa)
src/populive-styles.css stili globali
capacitor.config.ts     configurazione Capacitor
android/, ios/          progetti nativi generati da Capacitor
codemagic.yaml          build iOS (TestFlight) e APK Android in cloud
public/.well-known/     verifica dominio per App Links / Universal Links
```

# PopuLive frontend — contesto per Claude

Web app React (CRA 5) impacchettata con Capacitor 8 come app iOS/Android. Il README
spiega *come* fare le cose (avvio, build, Codemagic, Android): questo file tiene lo
*stato*, le decisioni e il lavoro rimasto. Aggiornalo quando cambia qualcosa di
strutturale.

## Stato al 2026-09-20

- **iOS funziona end-to-end**: push su `development` → build manuale su Codemagic
  (workflow `iOS → TestFlight`, branch `development`) → TestFlight → iPhone. Prima
  build testata con successo (build 8).
- **Android funziona in locale**: `npm run build:mobile` + `npm run android:run`
  (APK debug generato e verificato); `npm run android:dev` per backend locale con
  hot reload via `adb reverse`.
- Web: invariato. Railway serve `build/` come sito statico (non `npm start`).
- Apple: Team ID `JWW33N22VY`, App ID `com.populive.app` (capability Associated
  Domains), app in App Store Connect (id `6814231291`, SKU `populive-ios`),
  certificato Apple Distribution e profilo `PopuLive App Store` creati; gruppo
  TestFlight interno "Interni" con distribuzione automatica.
- Codemagic: integrazione App Store Connect con nome `populive_asc`; firma
  automatica via `ios_signing` nel `codemagic.yaml`; trigger automatico solo su
  `main`, per ora le build si lanciano a mano da `development`.

## Decisioni prese

- **Bundle/package id** `com.populive.app`, nome `PopuLive`. Non cambiare.
- **Capacitor 8 con SPM** (niente CocoaPods): su Codemagic si compila
  `ios/App/App.xcodeproj`, non un workspace.
- `android/` e `ios/` sono **committati** (Codemagic li richiede). Non aggiungerli
  al `.gitignore` anche se qualcuno lo ha fatto su `main` in passato.
- L'unico file che importa Capacitor è `src/native.js` (`openExternal`,
  `onAppUrlOpen`, `closeInAppBrowser`, `onBackButton`, `isNative`). Il resto del
  codice non deve sapere se gira nel browser o nell'app.
- Stripe nell'app si apre nel browser in-app (`openExternal`), il ritorno avviene
  via Universal/App Link sul dominio Railway.
- Deep link QR (`/checkin/:id`, `/mission/:id`) gestiti da `handleIncomingUrl` in
  `App.jsx`, sia al boot (web) sia da `appUrlOpen` (app).
- Tema chiaro/scuro: deciso dall'ora (6-18 chiaro), classe `body.pl-day-mode`.
  Non è un bug.
- Qualità: ESLint (no console.log, no unused vars) + Prettier, Husky pre-commit
  con lint-staged, LF forzato da `.gitattributes`. `npm run check` deve passare
  prima di ogni push.
- Config locale: `.env` = Railway (usato da `npm start`/build/Railway);
  `.env.dev` = backend locale `:3001`, frontend `:3000`, caricato SOLO da
  `npm run start:dev`. Mai usare `.env.development` (CRA lo caricherebbe anche in
  produzione).

## Branch e collaborazione

- Si lavora su `development`. Su `main` un'altra persona ha caricato file via
  GitHub ("Add files via upload"): **prima di ogni merge verso `main` fare
  `git fetch` e controllare la divergenza**; i conflitti tipici sono di sola
  formattazione (Prettier) e si risolvono prendendo `main` e riformattando.
- Repo GitHub: `Axmann83/populive-frontend`.

## Lavoro rimasto (in ordine di priorità)

1. **Backend CORS** (repo backend, non questo): aggiungere le origini
   `capacitor://localhost` (iOS) e `https://localhost` (Android) sia per HTTP sia
   per Socket.io. Senza questo l'app si apre ma le API falliscono.
2. **In-App Purchase**: Apple e Google impongono IAP/Play Billing per i beni
   digitali (Like extra, Superlike, Premium, probabilmente Verificato). Stripe può
   restare solo sul web e per beni fisici (Pulse = drink al locale, da confermare).
   Piano concordato: RevenueCat (`@revenuecat/purchases-capacitor`), funzione
   `purchase()` in `src/native.js` (web → Stripe, app → RevenueCat), webhook
   RevenueCat nel backend equivalente a quello Stripe, prodotti in App Store
   Connect e Play Console, Paid Apps Agreement firmato. Senza questo l'app viene
   rifiutata in review.
3. **Universal/App Links in produzione**: `public/.well-known/` è nel repo ma il
   server statico di Railway risponde `text/html` a
   `/.well-known/apple-app-site-association` (serve `application/json`). Da
   sistemare nella configurazione di deploy. In `assetlinks.json` manca ancora lo
   SHA-256 del certificato di release Android.
4. Verifiche sull'iPhone ancora da fare: safe area/notch, permessi camera e GPS,
   ritorno da Stripe, QR con la fotocamera di sistema.
5. Google Play: account developer, keystore di release, `bundleRelease`.
6. Codemagic: quando `development` sarà stabile, valutare trigger automatico su
   `development` oltre che su `main`.

## Gotchas di ambiente (Windows)

- L'antivirus (Avast) intercetta l'HTTPS: certificato importato nel JDK (fatto);
  per Git questo repo usa `http.sslBackend = schannel` (config locale). Se un tool
  Java/Git fallisce con errori SSL/PKIX è questo.
- `JAVA_HOME` deve essere la cartella del JDK, non `\bin`.
- Sessioni dell'app Claude avviate prima di una modifica alle variabili d'ambiente
  non la vedono: rileggerla con PowerShell
  `[Environment]::GetEnvironmentVariable("JAVA_HOME","User")`.
- `local.properties` di Android usa slash `/` (i backslash vengono mangiati).

/* eslint-disable no-console */
/**
 * Sviluppo Android contro il dev server e il backend LOCALI.
 *
 * Prerequisiti: `npm run start:dev` in un altro terminale (frontend :3000 →
 * backend :3001) e telefono collegato via USB con Debug USB attivo.
 *
 * Cosa fa:
 *  1. `cap sync android` con CAP_SERVER_URL=http://localhost:3000, così la
 *     WebView carica il dev server invece della build (hot reload).
 *  2. `adb reverse` per le porte 3000 e 3001: sul telefono "localhost"
 *     viene inoltrato al PC attraverso il cavo USB. Niente IP da configurare
 *     e il bundle di start:dev (che punta a localhost:3001) funziona così com'è.
 *  3. `cap run android` compila e installa l'app.
 *
 * Per tornare alla build normale: `npm run build:mobile`.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) {
  console.error('ANDROID_HOME non impostato.');
  process.exit(1);
}
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
if (!fs.existsSync(adb)) {
  console.error(`adb non trovato in ${adb}`);
  process.exit(1);
}

const run = (cmd, env = {}) =>
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

const devices = execSync(`"${adb}" devices`).toString().split('\n').slice(1);
if (!devices.some((l) => /\tdevice$/.test(l.trim() + ''))) {
  console.error('Nessun telefono collegato (adb devices). Attiva Debug USB e accetta il prompt sul telefono.');
  process.exit(1);
}

run('npx cap sync android', { CAP_SERVER_URL: 'http://localhost:3000' });
run(`"${adb}" reverse tcp:3000 tcp:3000`);
run(`"${adb}" reverse tcp:3001 tcp:3001`);
console.log('\nPorte 3000/3001 del telefono inoltrate al PC. Assicurati che `npm run start:dev` sia attivo.\n');
run('npx cap run android');

import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configurazione Capacitor (app iOS / Android).
 *
 * Per lo sviluppo con hot reload sul telefono si può far puntare la WebView
 * al dev server del PC invece che ai file in `build/`:
 *   CAP_SERVER_URL=http://192.168.1.10:3000 npx cap sync
 * (mai committare un capacitor.config con server.url fisso)
 */
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.populive.app',
  appName: 'PopuLive',
  webDir: 'build',
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
  },
  server: devServerUrl
    ? { url: devServerUrl, cleartext: true }
    : { androidScheme: 'https' },
};

export default config;

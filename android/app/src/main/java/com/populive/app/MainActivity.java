package com.populive.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin nostri, dentro l'app (quelli da npm li registra Capacitor da solo):
        // vanno registrati prima di super.onCreate.
        registerPlugin(BlePresencePlugin.class);
        super.onCreate(savedInstanceState);
    }

    // App a tutto schermo (B4, novembre 2026): barra di stato e tasti del telefono nascosti,
    // ricompaiono per qualche secondo scorrendo dal bordo. Si rinasconde ogni volta che l'app
    // torna in primo piano o si chiude una finestra di sistema (permessi, tastiera, ecc.),
    // perché Android in quei casi le rimette.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}

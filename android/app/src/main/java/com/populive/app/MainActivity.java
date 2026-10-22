package com.populive.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin nostri, dentro l'app (quelli da npm li registra Capacitor da solo):
        // vanno registrati prima di super.onCreate.
        registerPlugin(BlePresencePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

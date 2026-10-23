package com.populive.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.ParcelUuid;
import android.os.SystemClock;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Bluetooth del radar (D4 strada B, ottobre 2026): trasmette il codice anonimo della serata e
 * ascolta quelli degli altri telefoni PopuLive, per mettere in testa al radar chi è vicino.
 *
 * Trasmissione: il nostro UUID di servizio nel pacchetto principale e il codice (6 byte) nei
 * "service data" della risposta alla scansione, perché le due cose insieme non stanno nei 31 byte
 * di un pacchetto. Un iPhone non può trasmettere service data: mette il codice (8 caratteri) nel
 * nome locale. In ascolto si leggono entrambi i formati.
 *
 * Solo con l'app in primo piano: in pausa si spegne e alla ripresa si riaccende da solo, se il JS
 * non l'ha spento nel frattempo. Con il Bluetooth del telefono spento resta in attesa: quando
 * l'utente lo accende (anche dalla tendina) riparte da solo, e il JS riceve "stateChange" { state }.
 * L'app non può accenderlo da sola: requestEnable mostra l'avviso di sistema "PopuLive vuole
 * attivare il Bluetooth". Gli avvistamenti arrivano al JS come evento "proximity" { code,
 * rssi }, al massimo uno al secondo per codice. Al server non va niente.
 *
 * I controlli di permesso sono fatti a mano prima di ogni chiamata (Capacitor), da qui il
 * SuppressLint.
 */
@SuppressLint("MissingPermission")
@CapacitorPlugin(
    name = "BlePresence",
    permissions = {
        // Android 12 e successivi: permessi Bluetooth veri (BLUETOOTH_SCAN dichiarato
        // "neverForLocation" nel manifest). BLUETOOTH_CONNECT serve solo a chiedere di accendere il
        // Bluetooth; stesso gruppo "dispositivi nelle vicinanze", quindi un solo avviso.
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT
            }
        ),
        // Fino ad Android 11 la scansione Bluetooth richiede la posizione.
        @Permission(alias = "bluetoothLegacy", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class BlePresencePlugin extends Plugin {

    // Stesso UUID in BlePresencePlugin.swift.
    private static final ParcelUuid SERVICE_UUID = ParcelUuid.fromString("7a3f5c10-9b2e-4d6a-8c41-0f5e2b9d7c31");
    private static final int CODE_BYTES = 6;
    private static final int CODE_FLAGS = Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING;
    private static final long EMIT_INTERVAL_MS = 1000;

    private String activeCode;
    private boolean paused = false;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothLeScanner scanner;
    private AdvertiseCallback advertiseCallback;
    private ScanCallback scanCallback;
    private final Map<String, Long> lastEmit = new HashMap<>();

    // Bluetooth acceso o spento dall'utente: si riparte (o ci si ferma) da soli e si avvisa il JS.
    private final BroadcastReceiver stateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
            if (state == BluetoothAdapter.STATE_ON) {
                if (activeCode != null && hasPermission()) startRadio();
                notifyState("on");
            } else if (state == BluetoothAdapter.STATE_OFF) {
                stopRadio();
                notifyState("off");
            }
        }
    };

    @Override
    public void load() {
        // Broadcast di sistema protetto (lo può mandare solo il sistema): "exported" non apre niente.
        ContextCompat.registerReceiver(
            getContext(),
            stateReceiver,
            new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
            ContextCompat.RECEIVER_EXPORTED
        );
    }

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    /** "on" | "off" | "unsupported" (telefono senza Bluetooth LE). */
    private String bluetoothState() {
        BluetoothAdapter adapter = adapter();
        if (adapter == null) return "unsupported";
        return adapter.isEnabled() ? "on" : "off";
    }

    private void notifyState(String state) {
        JSObject event = new JSObject();
        event.put("state", state);
        notifyListeners("stateChange", event);
    }

    private void resolveState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", bluetoothState());
        call.resolve(result);
    }

    @PluginMethod
    public void getState(PluginCall call) {
        resolveState(call);
    }

    @PluginMethod
    public void requestEnable(PluginCall call) {
        if (!"off".equals(bluetoothState())) {
            resolveState(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !hasPermission()) {
            call.reject("permission_denied");
            return;
        }
        startActivityForResult(call, new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), "enableResult");
    }

    @ActivityCallback
    private void enableResult(PluginCall call, ActivityResult result) {
        // L'accensione può richiedere un attimo: se non è ancora "on", arriverà "stateChange".
        resolveState(call);
    }

    private String permissionAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "bluetooth" : "bluetoothLegacy";
    }

    private boolean hasPermission() {
        return getPermissionState(permissionAlias()) == PermissionState.GRANTED;
    }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("bluetooth", getPermissionState(permissionAlias()).toString());
        call.resolve(result);
    }

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        resolvePermission(call);
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (hasPermission()) {
            resolvePermission(call);
            return;
        }
        requestPermissionForAlias(permissionAlias(), call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        resolvePermission(call);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String code = call.getString("code");
        if (decodeCode(code) == null) {
            call.reject("invalid_code");
            return;
        }
        if (!hasPermission()) {
            call.reject("permission_denied");
            return;
        }
        activeCode = code;
        String error = startRadio();
        if (error != null) {
            call.reject(error);
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        activeCode = null;
        stopRadio();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        paused = true;
        stopRadio();
    }

    @Override
    protected void handleOnResume() {
        paused = false;
        if (activeCode != null && hasPermission()) startRadio();
    }

    @Override
    protected void handleOnDestroy() {
        activeCode = null;
        stopRadio();
        try {
            getContext().unregisterReceiver(stateReceiver);
        } catch (IllegalArgumentException e) {
            // mai registrato
        }
    }

    private static byte[] decodeCode(String code) {
        if (code == null) return null;
        try {
            byte[] bytes = Base64.decode(code, CODE_FLAGS);
            return bytes.length == CODE_BYTES ? bytes : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Accende trasmissione e ascolto con activeCode; restituisce un codice d'errore o null. */
    private synchronized String startRadio() {
        stopRadio();
        if (paused) return null; // si accende alla ripresa (handleOnResume)
        BluetoothAdapter adapter = adapter();
        if (adapter == null) return "unsupported";
        if (!adapter.isEnabled()) return "bluetooth_off"; // riparte da solo all'accensione (stateReceiver)

        // Trasmissione. Alcuni telefoni sanno solo ascoltare: in quel caso vedono gli altri ma non
        // si fanno vedere.
        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser != null) {
            AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                // Potenza alta (23/10, prova 3c): con la media (−7 dBm) un iPhone, che trasmette più forte
                // e non si può regolare, riceveva il Samsung molto più debole di quanto il Samsung ricevesse
                // lui, e i due telefoni non si vedevano vicini alla stessa distanza.
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(false)
                .build();
            AdvertiseData data = new AdvertiseData.Builder().setIncludeDeviceName(false).addServiceUuid(SERVICE_UUID).build();
            AdvertiseData scanResponse = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceData(SERVICE_UUID, decodeCode(activeCode))
                .build();
            advertiseCallback = new AdvertiseCallback() {
                @Override
                public void onStartFailure(int errorCode) {
                    Logger.warn("BlePresence", "Trasmissione non avviata, errore " + errorCode);
                }
            };
            advertiser.startAdvertising(settings, data, scanResponse, advertiseCallback);
        }

        // Ascolto, filtrato sul nostro UUID: con un filtro Android non sospende la scansione a
        // schermo spento e non la conta tra quelle "non filtrate" che limita.
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) return null;
        ScanFilter filter = new ScanFilter.Builder().setServiceUuid(SERVICE_UUID).build();
        ScanSettings settings = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                handleResult(result);
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                for (ScanResult result : results) handleResult(result);
            }

            @Override
            public void onScanFailed(int errorCode) {
                Logger.warn("BlePresence", "Scansione non avviata, errore " + errorCode);
            }
        };
        scanner.startScan(Collections.singletonList(filter), settings, scanCallback);
        return null;
    }

    private synchronized void stopRadio() {
        try {
            if (advertiser != null && advertiseCallback != null) advertiser.stopAdvertising(advertiseCallback);
        } catch (Exception e) {
            // Bluetooth già spento: niente da fermare
        }
        try {
            if (scanner != null && scanCallback != null) scanner.stopScan(scanCallback);
        } catch (Exception e) {
            // Bluetooth già spento: niente da fermare
        }
        advertiser = null;
        advertiseCallback = null;
        scanner = null;
        scanCallback = null;
        lastEmit.clear();
    }

    private synchronized void handleResult(ScanResult result) {
        ScanRecord record = result.getScanRecord();
        if (record == null) return;
        String code = null;
        byte[] serviceData = record.getServiceData(SERVICE_UUID);
        if (serviceData != null && serviceData.length == CODE_BYTES) {
            code = Base64.encodeToString(serviceData, CODE_FLAGS); // un altro Android
        } else {
            String name = record.getDeviceName(); // un iPhone
            if (decodeCode(name) != null) code = name;
        }
        if (code == null || code.equals(activeCode)) return;

        long now = SystemClock.elapsedRealtime();
        Long last = lastEmit.get(code);
        if (last != null && now - last < EMIT_INTERVAL_MS) return;
        lastEmit.put(code, now);

        JSObject event = new JSObject();
        event.put("code", code);
        event.put("rssi", result.getRssi());
        notifyListeners("proximity", event);
    }
}

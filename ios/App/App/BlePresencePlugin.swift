import Capacitor
import CoreBluetooth
import UIKit

/// View controller dell'app: quello di Capacitor più la registrazione dei plugin nostri, dentro
/// l'app (quelli da npm li registra Capacitor da solo). Lo crea SceneDelegate.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BlePresencePlugin())
    }
}

/// Bluetooth del radar (D4 strada B, ottobre 2026): trasmette il codice anonimo della serata e
/// ascolta quelli degli altri telefoni PopuLive, per mettere in testa al radar chi è vicino.
///
/// iOS lascia trasmettere solo UUID di servizio e nome locale: il codice (8 caratteri) va nel nome.
/// Android lo trasmette nei "service data" (6 byte): in ascolto si leggono entrambi i formati.
/// Solo con l'app in primo piano (in background iOS toglie il nome dalla trasmissione): si spegne
/// all'uscita e si riaccende al ritorno da solo, se il JS non l'ha spento nel frattempo. Con il
/// Bluetooth spento resta in attesa e riparte quando l'utente lo accende; il JS riceve "stateChange"
/// { state }. Nessuna app può accendere il Bluetooth su iOS: requestEnable fa comparire l'avviso di
/// sistema di Apple ("Attiva il Bluetooth…", con il pulsante Impostazioni). Gli
/// avvistamenti arrivano al JS come evento "proximity" { code, rssi }, al massimo uno al secondo
/// per codice. Al server non va niente.
@objc(BlePresencePlugin)
public class BlePresencePlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralManagerDelegate {
    public let identifier = "BlePresencePlugin"
    public let jsName = "BlePresence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestEnable", returnType: CAPPluginReturnPromise),
    ]

    // Stesso UUID in BlePresencePlugin.java.
    private static let serviceUUID = CBUUID(string: "7A3F5C10-9B2E-4D6A-8C41-0F5E2B9D7C31")
    private static let codeLength = 8
    private static let emitInterval: TimeInterval = 1

    // Tutto sul thread principale: i delegati di CoreBluetooth arrivano lì (queue nil).
    private var central: CBCentralManager?
    private var peripheral: CBPeripheralManager?
    private var activeCode: String?
    private var inForeground = true
    private var lastEmit: [String: Date] = [:]
    private var pendingPermissionCalls: [CAPPluginCall] = []
    private var pendingStateCalls: [CAPPluginCall] = []
    // Gestore usato solo per far comparire l'avviso "Attiva il Bluetooth": lo mostra iOS quando
    // nasce un gestore con l'opzione accesa e il Bluetooth spento.
    private var powerAlertManager: CBCentralManager?
    private var lastNotifiedState: String?

    @objc override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appDidEnterBackground),
                           name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(appWillEnterForeground),
                           name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    @objc private func appDidEnterBackground() {
        inForeground = false
        refresh()
    }

    @objc private func appWillEnterForeground() {
        inForeground = true
        refresh()
    }

    // MARK: - Permesso

    private func permissionState() -> String {
        switch CBManager.authorization {
        case .allowedAlways: return "granted"
        case .notDetermined: return "prompt"
        default: return "denied"
        }
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["bluetooth": permissionState()])
    }

    /// Su iOS l'avviso di sistema compare alla prima creazione di un gestore Bluetooth: si crea
    /// quello di ascolto e si risponde quando iOS comunica il nuovo stato.
    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if CBManager.authorization != .notDetermined {
                call.resolve(["bluetooth": self.permissionState()])
                return
            }
            self.pendingPermissionCalls.append(call)
            self.ensureCentral()
        }
    }

    // MARK: - Bluetooth acceso o spento

    /// "on" | "off" | "unsupported" | "unknown" (iOS non l'ha ancora comunicato).
    private func bluetoothState() -> String {
        switch central?.state {
        case .poweredOn?: return "on"
        case .poweredOff?: return "off"
        case .unsupported?: return "unsupported"
        default: return "unknown"
        }
    }

    /// Lo stato si conosce solo da un gestore Bluetooth, che a permesso non ancora chiesto farebbe
    /// comparire l'avviso del permesso: fino ad allora "unknown".
    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard CBManager.authorization == .allowedAlways else {
                call.resolve(["state": "unknown"])
                return
            }
            self.ensureCentral()
            if self.central?.state == .unknown || self.central?.state == .resetting {
                self.pendingStateCalls.append(call) // risponde centralManagerDidUpdateState
            } else {
                call.resolve(["state": self.bluetoothState()])
            }
        }
    }

    @objc func requestEnable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.central?.state == .poweredOff {
                self.powerAlertManager = CBCentralManager(delegate: nil, queue: nil,
                                                          options: [CBCentralManagerOptionShowPowerAlertKey: true])
            }
            // Si risponde subito: l'eventuale accensione arriva dopo, come "stateChange".
            call.resolve(["state": self.bluetoothState()])
        }
    }

    // MARK: - Avvio e arresto

    @objc func start(_ call: CAPPluginCall) {
        guard let code = call.getString("code"), code.count == Self.codeLength else {
            call.reject("invalid_code")
            return
        }
        DispatchQueue.main.async {
            guard CBManager.authorization == .allowedAlways else {
                call.reject("permission_denied")
                return
            }
            if self.activeCode != code { self.lastEmit.removeAll() }
            self.activeCode = code
            self.ensureCentral()
            self.ensurePeripheral()
            self.refresh(restartAdvertising: true)
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.activeCode = nil
            self.lastEmit.removeAll()
            self.refresh()
            call.resolve()
        }
    }

    private func ensureCentral() {
        guard central == nil else { return }
        // Niente avviso di sistema "attiva il Bluetooth": il radar funziona anche senza.
        central = CBCentralManager(delegate: self, queue: nil,
                                   options: [CBCentralManagerOptionShowPowerAlertKey: false])
    }

    private func ensurePeripheral() {
        guard peripheral == nil else { return }
        peripheral = CBPeripheralManager(delegate: self, queue: nil,
                                         options: [CBPeripheralManagerOptionShowPowerAlertKey: false])
    }

    /// Allinea ascolto e trasmissione allo stato attuale (codice, primo piano, Bluetooth acceso).
    private func refresh(restartAdvertising: Bool = false) {
        let shouldRun = activeCode != nil && inForeground

        if let central = central, central.state == .poweredOn {
            if shouldRun && !central.isScanning {
                // Duplicati ammessi: servono avvistamenti continui per seguire il segnale.
                central.scanForPeripherals(withServices: [Self.serviceUUID],
                                           options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
            } else if !shouldRun && central.isScanning {
                central.stopScan()
            }
        }

        if let peripheral = peripheral, peripheral.state == .poweredOn {
            if shouldRun, let code = activeCode {
                if restartAdvertising || !peripheral.isAdvertising {
                    peripheral.stopAdvertising()
                    peripheral.startAdvertising([
                        CBAdvertisementDataServiceUUIDsKey: [Self.serviceUUID],
                        CBAdvertisementDataLocalNameKey: code,
                    ])
                }
            } else if peripheral.isAdvertising {
                peripheral.stopAdvertising()
            }
        }
    }

    // MARK: - CoreBluetooth

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if CBManager.authorization != .notDetermined && !pendingPermissionCalls.isEmpty {
            let calls = pendingPermissionCalls
            pendingPermissionCalls = []
            calls.forEach { $0.resolve(["bluetooth": permissionState()]) }
        }
        let state = bluetoothState()
        if state != "unknown" {
            let calls = pendingStateCalls
            pendingStateCalls = []
            calls.forEach { $0.resolve(["state": state]) }
            if state != lastNotifiedState {
                lastNotifiedState = state
                notifyListeners("stateChange", data: ["state": state])
            }
        }
        if state == "on" { powerAlertManager = nil }
        refresh()
    }

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        refresh(restartAdvertising: true)
    }

    public func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error = error {
            CAPLog.print("BlePresence: trasmissione non avviata, \(error.localizedDescription)")
        }
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                               advertisementData: [String: Any], rssi RSSI: NSNumber) {
        var code: String?
        var source = "ios" // chi trasmette, dal formato: serve al JS per compensare la potenza
        if let serviceData = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data],
           let data = serviceData[Self.serviceUUID], data.count == 6 {
            code = Self.base64url(data) // un Android
            source = "android"
        } else if let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String,
                  name.count == Self.codeLength {
            code = name // un altro iPhone
        }
        let rssi = RSSI.intValue
        // 127 = segnale non disponibile
        guard let code = code, code != activeCode, rssi != 127 else { return }

        let now = Date()
        if let last = lastEmit[code], now.timeIntervalSince(last) < Self.emitInterval { return }
        lastEmit[code] = now
        notifyListeners("proximity", data: ["code": code, "rssi": rssi, "source": source])
    }

    private static func base64url(_ data: Data) -> String {
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

import AuthenticationServices
import Capacitor
import UIKit

/// Pagina di pagamento di Stripe su iPhone (B18, 11/11/2026).
///
/// Con il browser in-app (SFSafariViewController) dopo il pagamento si restava sulla pagina web di
/// PopuLive: iOS apre un Universal Link solo se lo tocca l'utente, e il rimando di Stripe è
/// automatico. ASWebAuthenticationSession invece si chiude da sola appena la pagina va su un
/// indirizzo con lo schema indicato (populive://…, ci rimanda /api/app-return del backend) e ci
/// passa quell'indirizzo. Lo schema non va registrato in Info.plist: lo intercetta la sessione.
///
/// Sessione "effimera" (niente cookie di Safari): così iOS non chiede "PopuLive vuole usare
/// stripe.com per accedere", che per un pagamento non avrebbe senso.
///
/// open({ url, callbackScheme }) → { url } con l'indirizzo di ritorno, oppure { cancelled: true }
/// se l'utente chiude la pagina con "Annulla".
@objc(CheckoutSessionPlugin)
public class CheckoutSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "CheckoutSessionPlugin"
    public let jsName = "CheckoutSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
    ]

    // Va tenuta in vita finché è aperta, altrimenti si chiude subito.
    private var session: ASWebAuthenticationSession?

    @objc func open(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString),
              let scheme = call.getString("callbackScheme"), !scheme.isEmpty else {
            call.reject("url e callbackScheme sono obbligatori")
            return
        }
        DispatchQueue.main.async {
            // Una sola pagina alla volta: un doppio tocco non ne apre due.
            self.session?.cancel()
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                self?.session = nil
                if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.resolve(["cancelled": true])
                } else {
                    call.reject(error?.localizedDescription ?? "Pagina di pagamento non aperta")
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Pagina di pagamento non aperta")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

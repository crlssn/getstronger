import Capacitor

/// Lets the web app switch WKWebView's interactive back gesture on and off.
///
/// The gesture is a WebView capability, so only native code can set it — but
/// it is one flag for the whole WebView and the app is a single page, so only
/// the web app knows which screen is on it. See web/src/native/swipeBack.ts.
@objc(SwipeBackPlugin)
public class SwipeBackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SwipeBackPlugin"
    public let jsName = "SwipeBack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async { [weak self] in
            self?.webView?.allowsBackForwardNavigationGestures = enabled
        }
        call.resolve()
    }
}

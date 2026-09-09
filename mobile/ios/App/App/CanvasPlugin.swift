import Capacitor
import UIKit

/// Paints the surfaces behind the page in the palette the web app resolved.
///
/// The back gesture peels a screen off the WebView, and what shows through is
/// the WebView's own background — which Capacitor leaves on the device's
/// palette, so a dark app on a light phone swipes onto white. Only the web app
/// knows which palette is on, since a reader can pick one the device does not
/// ask for. See web/src/native/canvas.ts.
@objc(CanvasPlugin)
public class CanvasPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CanvasPlugin"
    public let jsName = "Canvas"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTheme", returnType: CAPPluginReturnPromise)
    ]

    @objc func setTheme(_ call: CAPPluginCall) {
        let canvas: UIColor = call.getString("theme") == "dark" ? .appCanvasDark : .appCanvasLight
        DispatchQueue.main.async { [weak self] in
            self?.webView?.backgroundColor = canvas
            self?.webView?.scrollView.backgroundColor = canvas
            // What WebKit paints outside the page itself: the overscroll, and
            // the gap a peeled screen slides off.
            self?.webView?.underPageBackgroundColor = canvas
            // The strip the keyboard hands back to the window, which
            // SceneDelegate can only paint from the device's palette.
            self?.bridge?.viewController?.view.window?.backgroundColor = canvas
        }
        call.resolve()
    }
}

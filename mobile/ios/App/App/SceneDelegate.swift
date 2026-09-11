import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // The keyboard shrinks the WebView and hands the strip under it back to
        // the window, which is black until something gives it a colour.
        window?.backgroundColor = .appCanvas
        window?.rootViewController = AppBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// The bridge view controller, plus the plugins this app defines itself.
class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CanvasPlugin())
        bridge?.registerPluginInstance(SwipeBackPlugin())
        bridge?.registerPluginInstance(TimedCircuitPlugin())
    }
}

extension UIColor {
    /// The app's canvas in each palette, mirroring `--color-canvas` in
    /// web/src/assets/theme.css.
    static let appCanvasLight = UIColor(red: 242 / 255, green: 241 / 255, blue: 237 / 255, alpha: 1)
    static let appCanvasDark = UIColor(red: 22 / 255, green: 21 / 255, blue: 18 / 255, alpha: 1)

    /// The canvas the device asks for.
    ///
    /// A fallback: the Keyboard plugin repaints the window from the page's own
    /// background, but that read is asynchronous and sometimes misses a
    /// keyboard. This one follows the device, not the palette picked in
    /// Settings, so CanvasPlugin still owns the exact answer.
    static let appCanvas = UIColor { traits in
        traits.userInterfaceStyle == .dark ? .appCanvasDark : .appCanvasLight
    }
}

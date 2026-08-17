import type { CapacitorConfig } from '@capacitor/cli'

// The app id is provisional until the store accounts and bundle ids are set up
// in #1033; it must be final before the first store submission.
const config: CapacitorConfig = {
  appId: 'com.getstronger.app',
  appName: 'GetStronger',
  webDir: '../web/dist',
  plugins: {
    // Dark icons and clock over the app's light background.
    StatusBar: {
      style: 'LIGHT',
    },
    // The app hides the splash itself once Vue has mounted; see
    // web/src/native/platform.ts.
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#25282d',
    },
    // Without the plugin, WKWebView pans the whole page to reveal a focused
    // input, shoving the sticky workout header under the status bar while
    // weight and reps are typed. Resizing the WebView instead keeps the
    // layout anchored and lifts the fixed session dock above the keyboard.
    Keyboard: {
      resize: 'native',
    },
  },
}

export default config

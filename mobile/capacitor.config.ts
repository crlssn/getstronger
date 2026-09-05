import type { CapacitorConfig } from '@capacitor/cli'

// Reverse-DNS of getstronger.studio, the domain we own. Both stores register
// the id permanently, so it cannot change after the first submission.
const config: CapacitorConfig = {
  appId: 'studio.getstronger.app',
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
      // The splash reproduces the login header on its light surface.
      backgroundColor: '#ffffff',
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

import type { CapacitorConfig } from '@capacitor/cli'

// Reverse-DNS of getstronger.studio, the domain we own. Both stores register
// the id permanently, so it cannot change after the first submission.
const config: CapacitorConfig = {
  appId: 'studio.getstronger.app',
  appName: 'GetStronger',
  webDir: '../web/dist',
  plugins: {
    // The launch value only, matching the splash's light canvas below. The
    // page paints the band the clock sits on, so once the app is up the
    // palette owns the style instead; see web/src/native/statusBar.ts.
    StatusBar: {
      style: 'LIGHT',
    },
    // The app takes the launch screen down itself, the moment the boot splash
    // has faded in over it; see web/src/native/launchScreen.ts.
    SplashScreen: {
      launchAutoHide: false,
      // --color-canvas, the paper the launch image and the boot splash are
      // both drawn on. One value where the token has two: the palettes are in
      // the images themselves, and this only shows around them.
      backgroundColor: '#f2f1ed',
    },
    // Without the plugin, WKWebView pans the whole page to reveal a focused
    // input, shoving the sticky workout header under the status bar while
    // weight and reps are typed. Resizing the WebView instead keeps the
    // layout anchored and lifts the fixed session dock above the keyboard.
    Keyboard: {
      resize: 'native',
      // Resizing hands the strip under the WebView back to the window, which
      // is black without this. Reading the page's own body background on every
      // show keeps the strip on data-theme; a colour here would freeze one
      // palette. SceneDelegate.swift covers the shows this read misses.
      autoBackdropColor: 'dom',
    },
  },
}

export default config

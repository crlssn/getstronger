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
      // The splash reproduces the login header on its light surface.
      backgroundColor: '#ffffff',
    },
  },
}

export default config

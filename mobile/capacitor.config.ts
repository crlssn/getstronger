import type { CapacitorConfig } from '@capacitor/cli'

// The app id is provisional until the store accounts and bundle ids are set up
// in #1033; it must be final before the first store submission.
const config: CapacitorConfig = {
  appId: 'com.getstronger.app',
  appName: 'GetStronger',
  webDir: '../web/dist',
}

export default config

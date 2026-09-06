/** Whether this browser can run a WebGL map at all; jsdom and old WebViews cannot. */
export const mapSupported = () =>
  typeof window !== 'undefined' &&
  'WebGLRenderingContext' in window &&
  document.createElement('canvas').getContext('webgl') !== null

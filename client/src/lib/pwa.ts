/// <reference types="vite/client" />

export async function registerPwa(production = import.meta.env.PROD) {
  if (!production || !window.isSecureContext || !('serviceWorker' in navigator)) return

  try {
    return await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  } catch {
    // Installation is optional: network or browser restrictions must not block the app.
    return undefined
  }
}

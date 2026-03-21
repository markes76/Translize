'use strict'

// Notarization script for electron-builder's afterSign hook.
// Requires: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID env vars.
// Install: npm install -D @electron/notarize (when ready to distribute)

exports.default = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  // Skip if env vars not set (local dev builds)
  if (!process.env.APPLE_ID) {
    console.log('Skipping notarization: APPLE_ID not set')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`

  try {
    const { notarize } = await import('@electron/notarize')
    await notarize({
      tool: 'notarytool',
      appBundleId: 'com.translize.app',
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    })
    console.log(`Notarized ${appPath}`)
  } catch (err) {
    console.error('Notarization failed:', err)
    throw err
  }
}

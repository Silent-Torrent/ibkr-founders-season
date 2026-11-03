// Bundle the two OFL Latin faces with the app, including in an offline build.
// Binary FontFace sources need neither a font request nor a CSP data: exception.
import anton from './fonts/Anton.woff2?inline'
import space from './fonts/SpaceGrotesk.woff2?inline'

function register(family: string, asset: string, weight: string) {
  const bytes = Uint8Array.from(atob(asset.slice(asset.indexOf(',') + 1)), char => char.charCodeAt(0))
  document.fonts.add(new FontFace(family, bytes, { weight, display: 'swap' }))
}

register('Anton', anton, '400')
register('Space Grotesk', space, '300 700')

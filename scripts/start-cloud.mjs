import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

export function cloudConfiguration(mode, environment) {
  if (mode !== 'dev' && mode !== 'preview') {
    throw new Error('Expected dev or preview. Use npm run dev:cloud or npm run preview:cloud.')
  }
  if (environment.CODESPACES !== 'true') {
    throw new Error('This launcher is for GitHub Codespaces. On your computer use npm run dev or npm run preview.')
  }
  const name = environment.CODESPACE_NAME ?? ''
  const domain = environment.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'
  // A Codespace's one exact hostname is allowed, never all github.dev tenants.
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) || name.length > 58) {
    throw new Error('GitHub supplied an invalid Codespace name; no server was started.')
  }
  if (domain !== 'app.github.dev') {
    throw new Error('Unexpected Codespaces forwarding domain; review it before allowing a new host.')
  }
  const port = mode === 'dev' ? 5173 : 4173
  const hostname = `${name}-${port}.${domain}`
  return { port, hostname, url: `https://${hostname}` }
}

function start() {
  if (process.argv.length !== 3) throw new Error('Use npm run dev:cloud or npm run preview:cloud without extra arguments.')
  const mode = process.argv[2]
  const { port, hostname, url } = cloudConfiguration(mode, process.env)
  const viteCli = resolve(projectRoot, 'node_modules/vite/bin/vite.js')
  if (!existsSync(viteCli)) throw new Error('Dependencies are missing. Run npm ci first.')
  if (mode === 'preview' && !existsSync(resolve(projectRoot, 'dist/index.html'))) {
    throw new Error('Production files are missing. Run npm run build before npm run preview:cloud.')
  }
  console.log(`P&L Arena ${mode}: ${url}`)
  console.log('Keep this port Private in the Codespaces Ports panel. Press Ctrl+C to stop.')
  const child = spawn(process.execPath, [
    viteCli,
    ...(mode === 'preview' ? ['preview'] : []),
    '--host', '0.0.0.0',
    '--port', String(port),
    '--strictPort',
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: hostname },
  })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal))
  }
  child.once('error', (error) => {
    console.error(`Cloud server could not start: ${error.message}`)
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1)
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    start()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

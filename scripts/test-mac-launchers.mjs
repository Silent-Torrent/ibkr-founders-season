import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const startPath = resolve(projectRoot, 'START_MAC.command')
const verifyPath = resolve(projectRoot, 'VERIFY_MAC.command')
const start = readFileSync(startPath, 'utf8')
const verify = readFileSync(verifyPath, 'utf8')

for (const path of [startPath, verifyPath]) {
  execFileSync('/bin/zsh', ['-n', path], { stdio: 'pipe' })
}

for (const [label, source] of [['START_MAC.command', start], ['VERIFY_MAC.command', verify]]) {
  assert(source.includes('/opt/homebrew/opt/node@22/bin'), `${label} lost Apple Silicon Node 22 selection.`)
  assert(source.includes('/usr/local/opt/node@22/bin'), `${label} lost Intel Node 22 selection.`)
  assert(source.includes('major === 22 && minor >= 12'), `${label} accepts an unsupported Node runtime.`)
  assert(source.includes('>/dev/null 2>&1'), `${label} can leak a broken fallback Node loader error.`)
  assert(source.includes('setopt pipefail'), `${label} can hide a dependency-hash pipeline failure.`)
  assert(source.includes('node_modules/.pnl-arena-dependencies.sha256'), `${label} lost the dependency stamp.`)
  assert(source.includes('package.json package-lock.json'), `${label} no longer hashes both dependency manifests.`)
  assert(source.includes('if [[ ! -f package.json || ! -f package-lock.json ]]'), `${label} no longer fails closed on missing manifests.`)
  assert(source.includes('if [[ -z "$dependency_hash" ]]'), `${label} accepts an empty dependency hash.`)
}

assert(start.includes('if [[ "$needs_install" == true ]]'), 'Daily startup no longer installs conditionally.')
assert(start.includes('npm ci --no-fund'), 'Daily startup cannot repair missing or changed dependencies.')
assert(start.includes('npm ls --all --silent'), 'Daily startup cannot detect an incomplete dependency tree.')
assert(!start.includes('npm audit --audit-level=high'), 'Daily startup must not repeat the vulnerability audit.')
assert(!start.includes('npm run check'), 'Daily startup must not repeat the full test gate.')
assert(!start.includes('npm run build'), 'Daily startup must not repeat the production build.')
assert(
  start.includes('dev_args=(--host 127.0.0.1)') && start.includes('dev_args+=(--open)'),
  'Daily startup must remain bound to the local Mac only.',
)

for (const command of [
  'npm ci --no-fund',
  'npm audit --audit-level=high',
  'npm run check',
  'npm run build',
]) {
  assert(verify.includes(command), `Full verification lost required command: ${command}`)
}

console.log('macOS launcher roles and shell syntax passed.')

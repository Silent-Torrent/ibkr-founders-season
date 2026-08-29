import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const projectRoot = new URL('../', import.meta.url)
const viteConfig = await readFile(new URL('vite.config.ts', projectRoot), 'utf8')
const styles = await readFile(new URL('src/styles.css', projectRoot), 'utf8')

const requiredTargets = ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4']

for (const target of requiredTargets) {
  assert.match(
    viteConfig,
    new RegExp(`["']${target.replace('.', '\\.')}["']`),
    `Missing frozen production build target: ${target}`,
  )
}

const styleLines = styles.split(/\r?\n/)
let standardBackdropDeclarations = 0

for (let index = 0; index < styleLines.length; index += 1) {
  const match = styleLines[index].match(/^(\s*)backdrop-filter:\s*([^;]+);\s*$/)
  if (!match) continue

  standardBackdropDeclarations += 1
  const [, indentation, value] = match
  assert.equal(
    styleLines[index - 1],
    `${indentation}-webkit-backdrop-filter: ${value};`,
    `backdrop-filter on line ${index + 1} needs the matching Safari 16.4 prefix immediately before it`,
  )
}

assert.ok(standardBackdropDeclarations > 0, 'Expected at least one backdrop-filter compatibility check')

console.log('Browser compatibility contract checks passed.')
console.log({ requiredTargets, prefixedBackdropDeclarations: standardBackdropDeclarations })

import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const localeKey = 'pnl-arena.locale.v1'
const guideKey = 'pnl-arena.onboarding.v1'
const preferencesKey = 'pnl-arena.settings.v1'
const medalsKey = 'pnl-arena.medals.v1'

function validPreference([name, value]) {
  switch (name) {
    case 'roast':
    case 'amount':
    case 'hideTickers': return typeof value === 'boolean'
    case 'colors': return ['auto', 'red', 'green'].includes(value)
    case 'benchmark': return Number.isFinite(value)
    case 'firstMonth': return typeof value === 'string' && /^2026-(0[1-9]|1[0-2])$/.test(value)
    case 'prices': return isRecord(value) && Object.entries(value).every(([currency, price]) =>
      /^[A-Z]{3}$/.test(currency) && Number.isFinite(price) && price > 0)
    default: return false
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validLocalEntry(key, value) {
  if (key === localeKey) return ['en', 'zh-CN', 'zh-TW'].includes(value)
  if (key === guideKey) return value === 'seen'
  if (key !== preferencesKey && key !== medalsKey) return false
  let parsed
  try { parsed = JSON.parse(value) } catch { return false }
  if (key === preferencesKey) return isRecord(parsed) && Object.entries(parsed).every(validPreference)
  return Array.isArray(parsed) && parsed.length <= 3 && new Set(parsed).size === parsed.length &&
    parsed.every(id => Number.isInteger(id) && id >= 0 && id < 18)
}

export async function observeLocalStorage(evaluate, stage) {
  const storage = await evaluate(`(async () => ({
    local: Object.entries(localStorage),
    sessionKeys: Object.keys(sessionStorage),
    indexedDbNames: (await indexedDB.databases()).map(database => database.name),
    cacheKeys: await caches.keys(),
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
    cookieCount: document.cookie ? document.cookie.split(';').length : 0,
  }))()`)
  const assertEmpty = (values, description) => assert.equal(values.length, 0, stage + ': ' + description)
  assertEmpty(storage.sessionKeys, 'unexpected sessionStorage keys')
  assertEmpty(storage.indexedDbNames, 'unexpected IndexedDB databases')
  assertEmpty(storage.cacheKeys, 'unexpected Cache Storage entries')
  assert.equal(storage.serviceWorkers, 0, stage + ': unexpected service workers')
  assert.equal(storage.cookieCount, 0, stage + ': unexpected page-visible cookies')
  for (const [key, value] of storage.local) assert(validLocalEntry(key, value), stage + ': unexpected key or value shape in localStorage')
  return {
    stage,
    localPreferenceKeys: storage.local.map(([key]) => key).sort(),
    sessionKeyCount: storage.sessionKeys.length,
    indexedDbCount: storage.indexedDbNames.length,
    cacheCount: storage.cacheKeys.length,
    serviceWorkerCount: storage.serviceWorkers,
    pageVisibleCookieCount: storage.cookieCount,
  }
}

export function writeLocalPrivacyEvidence(directory, { browser, storage, requests, workerRequests, previewOrigin }) {
  // The browser suite validates page requests before this call. Repeat the
  // boundary for Worker subrequests, which use their own DevTools sessions.
  const resources = new Map()
  const staticPath = /^(?:\/|\/index\.html|\/favicon\.svg|\/sample-ibkr-ytd\.csv|\/assets\/(?:season-ui-[\w-]+\.woff|index-[\w-]+\.(?:js|css)|ibkrParser\.worker-[\w-]+\.js))$/
  for (const [scope, entries] of [['page', requests], ['worker', workerRequests]]) {
    for (const { method, url } of entries) {
      assert.equal(method, 'GET', scope + ': non-GET request')
      if (!url || /^(about|blob|data):/.test(url)) continue
      const parsed = new URL(url)
      assert(parsed.origin === previewOrigin && !parsed.search && !parsed.hash && !parsed.username && !parsed.password && staticPath.test(parsed.pathname), scope + ': unexpected network request')
      const key = scope + ' ' + parsed.pathname
      const resource = resources.get(key) ?? { scope, method, path: parsed.pathname, count: 0 }
      resource.count++
      resources.set(key, resource)
    }
  }
  const report = {
    scope: 'Production build, isolated Chromium, loopback HTTP, repository-owned fictional data',
    browser,
    commit: process.env.GITHUB_SHA ?? null,
    prHead: process.env.PRIVACY_EVIDENCE_PR_HEAD_SHA || null,
    run: process.env.GITHUB_RUN_ID ?? null,
    network: {
      pageRequestsObserved: requests.length,
      workerSubrequestsObserved: workerRequests.length,
      resources: [...resources.values()].sort((a, b) => a.scope.localeCompare(b.scope) || a.path.localeCompare(b.path)),
      externalRequests: 0,
      nonGetRequests: 0,
    },
    storage,
  }
  if (directory) {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'local-privacy-report.json'), JSON.stringify(report, null, 2) + '\n')
  }
  console.log('Local privacy evidence:', JSON.stringify(report))
}

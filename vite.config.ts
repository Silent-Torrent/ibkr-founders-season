import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'closed-beta-api-csp',
      apply: 'build',
      transformIndexHtml() {
        if (process.env.VITE_LEADERBOARD_BETA !== 'enabled') return []
        const origin = new URL(process.env.LEADERBOARD_ORIGIN ?? '')
        if (origin.protocol !== 'https:' || origin.origin !== process.env.LEADERBOARD_ORIGIN) {
          throw Error('A canonical HTTPS beta origin is required.')
        }
        // Browsers intersect this policy with the existing self-only header and meta.
        return [{tag: 'meta', attrs: {'http-equiv': 'Content-Security-Policy',
          content: 'connect-src ' + origin.origin + '/api/'}, injectTo: 'head-prepend' as const}]
      },
    },
    {
      name: 'dev-hmr-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        // Vite development HMR needs WebSocket access; the built page must
        // not grant this scheme-wide permission to arbitrary hosts.
        const exact = "connect-src 'self'; worker-src"
        if (html.split(exact).length !== 2) {
          throw new Error('Expected one production CSP connect-src directive')
        }
        return html.replace(exact, "connect-src 'self' ws:; worker-src")
      },
    },
  ],
  // Freeze the approved 1A browser floor instead of inheriting a future Vite default.
  build: {
    target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
  },
})

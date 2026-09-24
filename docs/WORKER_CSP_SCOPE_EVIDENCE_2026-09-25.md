# Production Worker-source policy — 2026-09-25

Status: **VERIFIED LOCAL** for checkpoint 0.32. This is a narrower browser policy, not deployed-host, iPhone 16.4 or full security acceptance.

## Why and what changed

The production HTML meta policy and configured Vercel response header both allowed `worker-src 'self' blob:`. The product's only Worker is the IBKR parser created from a Vite-built, same-origin `/assets/ibkrParser.worker-*.js` module; it does not need a Blob script URL. The page does need `img-src ... blob:` for local PNG previews, and that separate permission remains. Both Worker policies are now exactly `worker-src 'self'`. The development-only WebSocket allowance from checkpoint 0.30 remains confined to `connect-src`; it does not widen Worker sources.

[CSP Level 3](https://www.w3.org/TR/CSP/) specifies that `worker-src` governs Worker script URLs. [WebKit's Safari 15.5 feature note](https://webkit.org/blog/12669/new-webkit-features-in-safari-15-5/) documents support for that directive. Neither source is a substitute for this app's actual iOS/Safari 16.4 test, which remains open.

## Red/green evidence

- New policy assertions require `worker-src 'self'` in production HTML, Vite's development transform and the configured host header. The old production HTML failed the targeted policy test.
- A new production-Chrome probe attempts a tiny Blob-backed Worker that would post an `executed` message if allowed. Against the old bundle, it **did execute** (`messages: 1`), and the new browser assertion failed as intended. The probe's `finally` cleanup terminates a created Worker, revokes the object URL and removes its listener while the test page remains live.
- After tightening both policies, targeted policy and standalone production-browser suites passed. The browser probe requires a `worker-src` CSP violation, zero execution messages and no Blob Worker target. The same run imported the wholly fictional CSV through the real same-origin parser Worker and passed the existing cancellation, exact-capacity, PNG and preservation checks. It is a local Chrome result, not an iPhone result.
- Final Node 22.23.2 `npm run check` passed all groups. `npm run build` produced `index-X2MGWDPZ.js`, `ibkrParser.worker-Zpbk-44s.js` and `index-W6y1gsmE.css`; the inspected built HTML and configured header both contain `worker-src 'self'`, while `img-src ... blob:` remains. `npm audit --audit-level=high` found zero reported vulnerabilities and `git diff --check` passed before documentation.

The browser test uses a local preview, whose document has the meta policy but no Vercel response header. The Vercel JSON is configuration, **not** proof of the headers that a future protected host will actually deliver, particularly on the separate Worker asset. `worker-src 'self'` still permits same-origin Worker scripts and does not prevent every form of injected script, establish broker-statement authenticity or prove no upload by itself. R01 and D02 remain `OPEN`; the fixed release ledger remains **9 OPEN / 3 CLOSED**. The user's L deployment freeze was not changed and no private statement, phone setting or external host was touched.

# Private test hosting research — 2026-08-30

## Decision scope

The user selected **A + C** on 2026-08-30:

- **A:** keep the existing Vercel project empty, with zero deployments.
- **C:** research safer private-testing alternatives without registering another account, authorizing a provider, installing its tooling, uploading application files, connecting GitHub, or incurring a charge.

This document records research only. It does **not** approve Netlify, Cloudflare, Tailscale, or any other new external deployment. A separate explicit user decision is required before any account, authorization, installation, upload, or paid-plan action.

## Current confirmed state

- The Vercel project remains empty and Standard-Protected.
- It has zero deployments.
- Its default project URL returns `404 DEPLOYMENT_NOT_FOUND`.
- No alternate-host account, project, login token, deployment, Git integration, or billing relationship was created during this research.

## Answer-first recommendation

1. **Persistent owner-only cloud preview:** Netlify credit-based Free, using a Private project and a manual Draft Deploy, is the best current fit.
2. **Temporary private iPhone test from the user's own Mac:** Tailscale Serve is a useful intermediate bridge, but it is not persistent cloud hosting and it must never be changed to Funnel.
3. **Free multi-user identity-gated preview:** Cloudflare Pages + Access is technically viable, but its protection has more configuration branches and therefore more beginner error risk.
4. **Do not use for this gate:** ordinary GitHub Pages or Render Static Sites, because a private source repository does not produce a suitably private first website deployment.

The ranking above is a recommendation, not an implementation decision.

## Candidate comparison

| Route | What is confirmed | Main limitation | Current disposition |
|---|---|---|---|
| Netlify Free Private + Draft | Credit-based Free/Personal/Pro supports private projects. Teams created on or after 2026-07-28 default new projects to Private. Private applies to previews and is enforced with Netlify login. Free/Personal is single-seat, so only the Team Owner can view it. A normal CLI `deploy` creates a unique Draft URL; `--prod` is required for Production. Manual deployment can avoid GitHub authorization. | Owner-only on Free/Personal. Existing Vercel response-header configuration will not transfer automatically. Provider login, CLI authorization, private-state verification and a real iPhone login test are still required. | **Preferred persistent private cloud candidate.** |
| Tailscale Serve | Serve exposes a Mac-local service only inside the allowed tailnet; access rules still apply. It can proxy a localhost web server over HTTPS. Funnel, not Serve, is the public-internet feature. | The Mac, Tailscale and the local server must remain online. It does not test a cloud build, CDN, Vercel/Netlify routing, or persistent hosting. The Personal free plan is for personal/non-commercial use, so commercial beta use needs a fresh plan check. | **Useful optional owner-device test bridge, not cloud replacement.** |
| Cloudflare Pages + Access | Direct Upload can create a project without GitHub and deploy a non-production branch. Access can protect Preview URLs after it is enabled. The Free Access plan can cover a small tester group. | Preview URLs are public by default. The Pages Access switch protects Preview URLs but not the root `project.pages.dev` domain or custom domains; those need additional Access configuration. Direct Upload cannot later be converted in-place to Git integration. More settings mean more opportunities for accidental exposure. | **Technically viable second choice; not first recommendation for a beginner.** |
| GitHub Pages | Static Vite output is possible. | A private repository does not make an ordinary Pages site private. Private Pages access is an Enterprise Cloud organization feature, not the user's current personal-private-repository route. | **Rejected for this private gate.** |
| Render Static Site | Vite static sites are supported. | A successful static-site deploy receives a public `onrender.com` address, and static sites do not use Render's private network. | **Rejected for this private gate.** |

## Why Netlify currently fits better than Vercel

This comparison is about the current providers' deployment behavior, not a general claim that one company is always safer.

- Netlify's current project-visibility control can make both Production and Preview private behind Netlify login before application content is intentionally shared.
- A normal Netlify CLI deployment is a Draft by default; Production requires the explicit `--prod` flag.
- The project can be deployed manually from a locally built `dist` directory, so GitHub does not need to be connected.
- By contrast, the current empty Vercel project forced its first explicitly requested Preview upload into Production. That behavior conflicts with this project's frozen non-Production gate.

Important limits:

- Netlify Free/Personal private projects are owner-only. Inviting other testers requires a suitable paid/team arrangement.
- “Private” protects website access; it does not prove that application code has no uploads or telemetry. The code and browser Network/Storage behavior still need separate verification.
- A provider's private login will process account/authentication metadata. That is distinct from uploading an IBKR statement, but it still belongs in future privacy disclosures.
- Private projects cannot receive unauthenticated third-party webhooks. This does not affect the current static, browser-local MVP.

Official references:

- [Netlify project visibility](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/)
- [Netlify manual Draft and Production deploys](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/#manual-deploys)
- [Netlify Vite framework setup](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)
- [Netlify custom headers](https://docs.netlify.com/manage/routing/headers/)
- [Netlify plans](https://www.netlify.com/pricing/)

## Proposed Netlify release gate — not yet authorized

If the user later chooses Netlify, the safe order is:

1. The user creates or confirms the Netlify account and enables strong login protection/2FA.
2. Before creating the project, confirm the team is on a credit-based plan and set the team default to **Private for all projects** or, at minimum, **Private for new projects**.
3. Create an empty project without connecting GitHub and re-check that Production and Preview visibility are both Private.
4. Stop if the UI differs from the researched documentation, asks for a public first deployment, requires payment, or makes visibility ambiguous.
5. Adapt and locally test the current CSP/security headers for Netlify; `vercel.json` does not configure another provider.
6. Authorize the local CLI only after the private-state check. Disable CLI telemetry if desired.
7. Upload only the locally built application and fully fictional fixtures through a normal Draft Deploy. Do not use `--prod`, `--prod-if-unlocked`, or `--allow-anonymous`. Do not upload any real IBKR CSV or PDF.
8. In a signed-out private browser window, verify that the page, JavaScript bundles, Worker script, source maps and guessed asset URLs are all inaccessible.
9. On the owner's iPhone, confirm that the intended Netlify login works, then test only with fictional data.
10. Inspect Network, Storage, Worker MIME/headers, CSP/security headers and refresh behavior before calling the gate passed.

Failure of any check means delete the draft deployment and stop; it does not authorize a public or Production fallback.

## Optional Tailscale owner-device gate — not yet authorized

Tailscale Serve can expose a localhost-only static server to the user's own authorized iPhone without publishing the app to the open internet. It is useful for real Safari, touch, file-picker and browser-Worker tests while Vercel stays empty.

Required boundaries:

- Use **Serve only**. Never enable or switch the port to **Funnel**, which makes it public.
- Bind the local web server to localhost and proxy that port through Serve.
- Keep the Mac awake, online and connected while testing.
- Test once on the same Wi-Fi and once with the iPhone on cellular data.
- Before enabling HTTPS, give the Mac and tailnet neutral names. The certificate hostname can appear in public Certificate Transparency logs even though the webpage remains private.
- Reconfirm plan eligibility before any commercial or multi-user beta use.

Official references:

- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel)
- [Tailscale HTTPS certificate privacy note](https://tailscale.com/docs/how-to/set-up-https-certificates)
- [Tailscale plans](https://tailscale.com/pricing)

## Cloudflare fallback — not yet authorized

If free multi-user login is needed before a paid Netlify team is justified, Cloudflare Pages Direct Upload plus Access can be reconsidered. The safe route would require an empty project, Access configured before application content, a harmless placeholder Preview, signed-out and non-allowlisted identity tests, separate protection for both wildcard Preview URLs and the root `pages.dev` hostname, and only then a real fictional-data Preview upload.

This route must not rely on `noindex`: search-engine exclusion is not access control.

Official references:

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Preview deployments and Access boundary](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Cloudflare Pages known Access issues](https://developers.cloudflare.com/pages/platform/known-issues/)
- [Cloudflare Zero Trust plans](https://www.cloudflare.com/plans/zero-trust-services/)

## Stop conditions for every future route

Stop and ask for a new user decision if any route:

- would create a public, Production, anonymous, or searchable first deployment;
- asks to connect GitHub or grant broader repository access than explicitly approved;
- asks for a payment method, paid upgrade, auto-recharge, trial conversion, or recurring fee;
- cannot prove access protection before application content is uploaded;
- would upload a real IBKR statement, account identifier, private fixture, source map containing secrets, or local environment file;
- differs materially from the provider documentation recorded above.

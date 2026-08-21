# PR notes — Admin CMS (`feat/lego-catalog-wizard`)

Ready-to-paste summary for GitHub. Adjust branch / base as needed.

## Summary

- Local-first **Admin CMS** at `/admin`: draft → publish for Lego catalogue, project & architecture templates, ADD sections, flow patterns, cloud services, system copy, and content bundles.
- Runtime opt-in via **`CONTENT_FROM_ADMIN=1`** (published-only resolve); flag off keeps prior seed/code paths.
- Atelier chrome (same tokens as the editor); topbar owns the page title (no double H1).
- Regression pack **F-REG** (`npm run test:admin`) plus full `npm test` CI gate unchanged.
- ISAs **complete** (Q2 hydrate density deferred — see docs).

## Test plan

- [ ] `npm run typecheck`
- [ ] `npm run test:admin`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manual: `npm run dev` → `/admin` → Catalogue (create/save/delete custom) → Publish wizard → Locale
- [ ] Optional: `CONTENT_FROM_ADMIN=1` → create project from published template / check ADD title after publish
- [ ] Optional: `node scripts/admin-smoke.mjs` with server up

## Reviewer map

See [`README.md`](./README.md) in this folder.

## Out of scope (this PR)

- Auth on `/admin` (same as app — VPN/proxy)
- Hydrate B2 card density (ISC-Q2 deferred)
- Playwright / new test frameworks
- Founder-facing product UI changes beyond shared diagram surface extraction

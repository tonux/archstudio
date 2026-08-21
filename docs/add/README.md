# Admin CMS — documentation index (PR-ready)

**Status:** shipped · ISA parent + UX **complete** (2026-08-20)  
**Entry UI:** `/admin` · **Flag:** `CONTENT_FROM_ADMIN=1` for published resolve paths  
**Regression:** [`REGRESSION-admin.md`](./REGRESSION-admin.md) · `npm run test:admin`

This folder is the product + design record for the local-first content CMS. Use it as the
reviewer map for a PR that lands admin UI, APIs, and domain libs.

## Start here

| Doc | Role |
|-----|------|
| [`PR.md`](./PR.md) | PR summary, test plan, out of scope |
| [`ADMIN-CMS.md`](./ADMIN-CMS.md) | Product vision / migration narrative (SHIPPED) |
| [`ISA-archstudio-admin-cms.md`](./ISA-archstudio-admin-cms.md) | Content ISA — criteria + Verification |
| [`ISA-archstudio-admin-cms-ux.md`](./ISA-archstudio-admin-cms-ux.md) | UX ISA — Atelier chrome + Decision log |
| [`DESIGN-admin-shell.md`](./DESIGN-admin-shell.md) | Component map; **§2.3** topbar owns the page title |
| [`REGRESSION-admin.md`](./REGRESSION-admin.md) | F-REG R1–R4 how-to |
| [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md) | Publish quality bar (Acme) |
| [`RESEARCH.md`](./RESEARCH.md) / [`RESEARCH-admin-cms-ux.md`](./RESEARCH-admin-cms-ux.md) | Upstream research |

## Code map (short)

| Surface | Path |
|---------|------|
| Admin App Router | `src/app/admin/**` |
| Admin APIs | `src/app/api/admin/**` |
| UI components | `src/components/admin/**` |
| Domain + tests | `src/lib/admin/**`, `src/lib/lego/admin-catalog.ts` |
| Resolve (flag on) | `src/lib/templates/resolve.server.ts`, `src/lib/admin/*resolve*` |
| Smoke (local) | `scripts/admin-smoke.mjs` |

## Deferred (explicit, not PR blockers)

- **ISC-Q2** — hydrate gated cards still use « Composants concernés » dump (`hydrate.ts` `scopeCard`); engine follow-up.
- Security MEDIUM post-close — sanitise prose on bundle import; optional `ADMIN_TOKEN` / JSON body size if the instance is network-reachable.
- UX9 — dependency graph / drag / diff restore (v2).

## Related

- Lego gaps updated: [`../lego/GAPS.md`](../lego/GAPS.md)
- App README Admin section + `npm run test:admin`
- Security threat model mentions `/admin`: [`../../SECURITY.md`](../../SECURITY.md)

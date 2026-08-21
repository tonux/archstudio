# Admin regression suite (F-REG)

How to run and what R1–R4 mean. CI stays on a single gate: `npm test`.

## Commands

```bash
# Admin-focused slice (lib admin + lego admin-catalog)
ECC_GATEGUARD=off GATEGUARD_DISABLED=1 npm run test:admin

# Full suite (CI)
ECC_GATEGUARD=off GATEGUARD_DISABLED=1 npm test
```

Optional local smoke (not CI) — skips cleanly if the app is down:

```bash
node scripts/admin-smoke.mjs
# or: ADMIN_SMOKE_BASE=http://127.0.0.1:3000 node scripts/admin-smoke.mjs
```

## R1–R4 mapping

| Id | Risk | What we guard | Where |
|----|------|---------------|--------|
| **R1** | Catalog publish accepts broken refs | `orphan_variant` (and invalid publish → `ok: false` + issue codes) | `admin-catalog.test.ts`, `regression-backend.test.ts`, `regression-api.test.ts` |
| **R2** | Admin grows a projects CRUD / workspace surface | No `projects.data` / `/api/admin/projects` / UI-kit imports | `regression-api.test.ts`, `regression-ui.test.ts` |
| **R3** | Admin routes 500 / shell broken | Optional HTTP smoke GET `/admin`, `/admin/catalog`, `/admin/publish`, `/admin/templates`, `/admin/locale` | `scripts/admin-smoke.mjs` (local only; Interceptor optional for visual) |
| **R4** | Sections publish ships placeholders | `placeholder_section` blocks publish | `add-sections.test.ts`, `regression-backend.test.ts`, `regression-api.test.ts` |

## Design Anti (locked)

- No Playwright / Vitest / Jest / RTL / Cypress — stay on `tsx --test` / `node:test`.
- Routes are thin wrappers; regression-api prefers **domain functions** the routes call.
- UI checks are **static source scans** (emoji U+1F300–U+1FAFF, lucide/radix/shadcn/heroicons/`@/components/ui`).

## Interceptor (optional R3 visual)

When the dev server is up, Interceptor can screenshot `/admin*` for UX parity. Not part of `npm test`.

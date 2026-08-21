---
task: "Admin CMS — tout le contenu système éditable sans code"
slug: archstudio-admin-cms
project: ArchStudio
effort: E3
effort_source: explicit
phase: complete
status: complete
progress: 25/26
mode: interactive
started: 2026-08-18T02:30:00Z
updated: 2026-08-20T20:05:00Z
principal_stated_goal: "Fige ISA on a des subagent design et des skill design pour UI ne l'oublie pas"
principal_stated_goal_source: prompt
principal_stated_goal_signal: 2
principal_stated_goal_locked: 2026-08-18T02:30:00Z
context_sufficient: true
interview_invoked: false
children: archstudio-admin-cms-ux
---

## Problem

ArchStudio mélange **moteur** et **contenu système** dans le même repo TypeScript : catalogue (`seed-data.ts`), templates (`templates/*.ts`), sections ADD (`preset.ts`), flow patterns (`flows/catalog.ts`), seed Acme (`demo.json`). Chaque correction contenu = PR + redeploy. `concernTags` restent partiellement lus depuis le seed TS, pas SQLite. Le fondateur non-tech ne doit jamais voir l’admin ; l’opérateur solo ne peut pas shipper un template Acme-quality un mardi après-midi sans IDE.

## Vision

Un panneau **`/admin`** local-first : une vérité versionnée par entité (brouillon → publié), CRUD sur templates projet, catalogue Lego, bibliothèque ADD, flow patterns, technos. Le runtime lit **uniquement** `published`. Euphorie : publier « Template marketplace B2B » avec canvas + sections + flows + qualité PDF **sans ouvrir l’IDE** ; le fondateur le choisit dans le picker existant.

## Out of Scope

- CRUD sur `projects.data` (instances user) — reste l’éditeur normal
- Réécrire le moteur (gating, hydrate, `buildOutline`, placement) — consomme le contenu admin
- Élargir les enums moteur (`ConcernTag`, types section, flow id #9) sans ISA moteur séparée
- Billing, multi-tenant cloud, sync remote obligatoire — export/import bundle suffit v1
- Wizard besoins fondateur (ISA #4), éditeur ADR, FinOps €
- Inférence tech → tags comme chemin principal — templates admin + catalogue éditable d’abord ([`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md) D6)
- Shell UI / chrome admin — ISA jumeau [`ISA-archstudio-admin-cms-ux.md`](./ISA-archstudio-admin-cms-ux.md)

## Principles

1. **Content vs engine** — l’admin shippe des données ; la résolution reste typée en code.
2. **Stable ids** — `identity`, `auth-login`, `add-data` ne changent pas sans migration explicite.
3. **Absent > vide** — section sans corps publiable n’apparaît pas ([`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md) B1).
4. **i18n obligatoire** — tout texte user-facing : `en` + `fr`.
5. **Publish explicite** — runtime ne voit que `published`.
6. **Acme-first templates** — templates **projet** priment sur l’inférence pour le non-tech.
7. **Design integration** — chrome admin délégué à Designer + Skill Webdesign (DirectDesign / IntegrateIntoApp) ; pas de design system parallèle.

## Constraints

- Local-first SQLite ; schéma étendu depuis `src/lib/db.ts` existant
- Feature flag `CONTENT_FROM_ADMIN=1` pour bascule source par source (M0→M6)
- Validation publish bloquante : schéma JSON + refs + i18n + qualité Acme parity
- Flow patterns : 8 ids v1 locked ; contenu éditable, pas d’ajout id sans ISA
- Enums moteur restent code ; admin configure *dans* l’enum
- Package/run **bun** ; pas de commit sauf demande principal
- Product code → **delegate** (Forge / Engineer) ; shell UI → **Designer** + Webdesign skill

## Dependencies

- `requires: 20260815-archstudio-lego-implementation — runtime catalogue, placement, flow plates consomment le contenu admin publié`
- `requires: archstudio-admin-cms-ux — shell /admin, écrans typés, publish wizard UI, preview iframe (Bridge ISCs)`
- `requires: CONTRAT-qualite-acme — barre B1–B6 pour validation template Acme au publish`

## Goal

"Fige ISA on a des subagent design et des skill design pour UI ne l'oublie pas"

Livrer un **CMS admin local-first** où tout le contenu système (templates projet en tête — Acme, catalogue Lego, sections ADD, flow patterns, technos) est CRUD + publish **sans redeploy contenu** ; migration M0→M6 avec parité runtime flag-off ; qualité publish calquée sur [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md) ; chrome UI via ISA jumeau UX + agents/skills design.

## Criteria

### Publish & runtime

- [x] **ISC-A1** Publier brouillon brique `identity` avec nouveau `purpose.fr` → `/api/lego/catalog` renvoie la valeur sans redeploy (flag on).
- [x] **ISC-A2** Template projet créé/importé admin → picker affiche → `createProject` produit snapshot équivalent (Acme : 22 composants).
- [x] **ISC-A3** Section `add-iam` éditée admin → PDF gated Auth0 utilise le nouveau titre (flag on).
- [x] **ISC-A4** Hint step `auth` du flow `auth-login` édité admin → `countMappableSteps` mis à jour.
- [x] **ISC-A5** Publish **rejeté** si variant `maps_to` pointe vers brique absente.
- [x] **ISC-A6** Template Acme admin publié vs `seed/demo.json` : outline slim + 4 sections auteur équivalentes (falsifier CONTRAT § Preuve positive).

### Qualité publish (CONTRAT B1–B6 au gate)

- [x] **ISC-Q1** Aucune section publiée gated ou auteur ne contient `[…]`, « À estimer », « To be estimated » (B1).
- [ ] **ISC-Q2** Sections gated type cartes = une carte par composant concerné, densité operations Acme — pas dump « Composants concernés » (B2). *(DEFERRED — Decision 2026-08-20)*
- [x] **ISC-Q3** Publish template Acme : 22 composants, 4 sections auteur (`platforms`, `operations`, `roadmap`, `risks`) présentes (B6 partial — template layer).
- [x] **Anti: ISC-A7** Admin n’expose pas `projects.data` en CRUD.
- [x] **Anti: ISC-A8** Publish ne modifie pas rétroactivement tags snapshottés sur composants existants.
- [x] **Anti: ISC-A9** Les 8 recipes catalogue restent locked et se re-seedent si supprimées ; les ids custom sont des données admin (pas d’enum moteur).

### Migration

- [x] **ISC-M0** Schéma SQLite étendu + import one-shot TS/JSON → parité byte runtime avec `CONTENT_FROM_ADMIN=0`.
- [x] **ISC-M1** Catalogue CRUD admin + publish ; API catalogue ← admin ; fin authoring `seed-data.ts` ; `concernTags` en DB.
- [x] **ISC-M2** Templates **projet** admin ; Acme importé ; picker ← admin ; `ensureSeed` ← admin featured.
- [x] **ISC-M3** Sections ADD admin ; `preset.ts` ← admin published.
- [x] **ISC-M4** Flow patterns admin ; `catalog.ts` ← admin.
- [x] **ISC-M5** Templates architecture + `cloud_services` migrés.
- [x] **ISC-M6** `system_copy`, vocabulaires, export bundle — zéro contenu système dans `src/lib/**` sauf enums moteur (flag on full).

## Bridge Criteria

- [x] **Bridge: ISC-B1** Shell `/admin` navigable (UX ISA) avant CRUD catalogue branché — routes stub OK.
- [x] **Bridge: ISC-B2** Publish wizard UI (UX ISA) appelle les mêmes validateurs que ISC-A5, Q1, A6.
- [x] **Bridge: ISC-B3** Fiche brique admin utilise `Fields.tsx` + tokens `globals.css` (UX ISC-UX6).

### Regression (F-REG)

- [x] **ISC-R1** `npm test` (ou `test:admin`) green avec assert publish catalogue rejeté sur variant orphan (`orphan_variant` / A5).
- [x] **ISC-R2** Scan statique admin : aucune surface CRUD `projects` / `projects.data` sous `src/app/admin` + `src/components/admin` (A7).
- [x] **ISC-R3** Smoke `/admin` (+ piliers nav) → HTTP 200 — script optionnel / Interceptor ; **pas** gate CI obligatoire.
- [x] **ISC-R4** Publish section/ADD bloqué si placeholder (`placeholder_section` / Q1) — même code d’issue côté API.

## Test Strategy

| isc | type | check | threshold | tool | anchors_to |
|-----|------|-------|-----------|------|------------|
| ISC-A1 | integration | PATCH publish brick → GET catalog | `purpose.fr` match | bun test + API | derived: catalogue publish |
| ISC-A2 | integration | createProject(templateId) | components.length=22 Acme | bun test | derived: templates projet |
| ISC-A3 | integration | edit section → PDF IAM title | title match | bun test | derived: sections ADD |
| ISC-A4 | unit | flow hint edit | countMappableSteps delta | bun test | derived: flow patterns |
| ISC-A5 | unit | publish invalid variant ref | reject + message | bun test | derived: validation |
| ISC-A6 | snapshot | admin Acme vs demo.json outline | 4 author sections + slim | bun test / diff | literal: CONTRAT |
| ISC-Q1 | unit | publish validator | 0 placeholder tokens | bun test | derived: B1 |
| ISC-Q2 | review | gated cards structure | no dump section | bun test | derived: B2 |
| ISC-Q3 | file | Acme template fields | 22 comps, 4 sections | rg / test | derived: B6 template |
| ISC-A7 | static | admin routes | no project CRUD | rg / review | derived: Anti |
| ISC-A8 | unit | publish catalogue | existing project tags unchanged | bun test | derived: Anti |
| ISC-A9 | review | locked 8 re-seed ; custom ids = admin data | no engine enum change | rg / bun test | derived: Anti AD4 softened 2026-08-20 |
| ISC-M0…M6 | integration | flag off/on parity | tests green each phase | bun test | derived: migration |
| ISC-B1 | e2e | /admin routes | 200 all nav | Interceptor / bun | Bridge UX |
| ISC-B2 | integration | wizard → validator | same errors as API | bun test | Bridge UX |
| ISC-B3 | static | admin DOM classes | `.field`, `.btn`, no emoji | rg / Interceptor | Bridge UX |
| ISC-R1 | regression | publish invalid variant | reject + code | npm test / test:admin | derived: A5 |
| ISC-R2 | static | admin tree no projects CRUD | 0 matches | npm test (fs scan) | derived: A7 |
| ISC-R3 | smoke | GET /admin nav | 200 | script / Interceptor | Bridge B1 |
| ISC-R4 | regression | placeholder section publish | blocked | npm test / API | derived: Q1 |

## Features

| name | description | satisfies | depends_on | parallelizable | route |
|------|-------------|-----------|------------|----------------|-------|
| F0 UX shell | Layout `/admin`, nav, split-pane stub, lockup Content | Bridge B1, B3 | — | false | **Designer** + Skill **Webdesign** (DirectDesign / IntegrateIntoApp) — voir ISA UX |
| F1 M0 schema | SQLite extend + import script | ISC-M0 | — | false | Engineer |
| F2 M1 catalogue | CRUD briques/variants/deps + publish + API | ISC-A1, A5, M1 | F1 | false | Forge |
| F3 M2 templates projet | Acme import, picker, ensureSeed | ISC-A2, A6, Q3, M2 | F2, F0 | false | Forge + Designer (template editor tabs) |
| F4 M3 sections ADD | Bibliothèque + preset ← admin | ISC-A3, Q1, M3 | F3 | true | Engineer |
| F5 M4 flow patterns | 8 patterns editable | ISC-A4, M4 | F2 | true | Engineer |
| F6 M5 arch templates | 6 hyperscaler + cloud_services | M5 | F3 | true | Forge |
| F7 M6 bundle | export/import, system_copy, vocab | M6 | F4, F5, F6 | false | Engineer |
| F8 Publish wizard | Validation bloquante UI | Bridge B2, ISC-A5, Q1 | F0, F2 | false | Designer + Engineer |
| F-REG-1 Publish lib | Lib tests publish reject + placeholder gate | R1, R4 | — | true | test-engineer |
| F-REG-2 API contracts | `src/app/api/admin/**/*.test.ts` HTTP contracts | R1, R2, R4 | F-REG-1 | false | test-engineer |
| F-REG-3 UX static | Node scan UX11/12/A7 admin tree | R2 | — | true | test-engineer |
| F-REG-4 test:admin | Script subset ; CI reste `npm test` | infra | F-REG-1…3 | false | test-engineer |
| F-REG-5 Smoke /admin | Interceptor/script 200 ; hors CI gate | R3 | F-REG-4 | true | Interceptor |

**Séquence :** `F0 ∥ F1` → `F2` → `F3` → `(F4 ∥ F5)` → `F6` → `F7` ; `F8` après F2 ; **F-REG :** `(1 ∥ 3) → 2 → 4 → 5`.

**Design routing (HARD pour F0, F3 UI, F8) :**
- Agent **Designer** (`subagent_type="designer"`) — wireframes → composants dans chrome existant
- Skill **Webdesign** — path DirectDesign ; **IntegrateIntoApp** ; respecter `globals.css`, `Fields.tsx`, `Icon.tsx`
- Skill **emil-design-eng** — polish densité informationnelle si review Designer le demande
- **Anti :** nouveau design system, shadcn, emoji, palette non-Atelier

## Decisions

| When | Decision |
|------|----------|
| 2026-08-18 02:35 | ISA **LOCKED** at observe — inputs [`ADMIN-CMS.md`](./ADMIN-CMS.md), [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md). Child ISA UX jumeau. |
| 2026-08-18 | AD1–AD6 adopted : tout contenu système → admin M6 ; templates projet first ; concernTags DB ; 8 flow ids ; enums code ; bundle backup. |
| 2026-08-18 | UX chrome = ISA séparée ; Designer + Webdesign mandatory on F0/F3/F8 — pas de code admin UI sans route design. |
| 2026-08-18 | Qualité publish : Q1–Q3 from CONTRAT B1/B2/B6 at template gate ; engine B4/B5 reste ISA brick-metadata / future. |
| 2026-08-18 | `context_sufficient: true` — recherche Standard + docs amont ; pas d’interview. |
| 2026-08-20 | Principal requested flow pattern CRUD. Custom pattern ids allowed as admin catalogue data. Locked 8 still re-seed on next read (ADD preset parity). ISC-A9 softened: no engine enum change; new recipes are admin data, not a code enum. |
| 2026-08-20 | F6 M5: 6 architecture `TEMPLATES` + `SERVICES` persist as SQLite domains `architecture-templates` / `cloud-services`. Runtime `CONTENT_FROM_ADMIN=1` + published uses `resolve.server.ts` (never import db into `templates/index.ts`). Locked 6 re-seed like flow locked 8. |
| 2026-08-20 | F6 UI: Designer restored Atelier chrome; Diagram = shared `ArchitectureDiagramSurface` (same graph as app); architecture snapshot→spec preserves `cloud` by id. |
| 2026-08-20 | Start **F7 M6**: `system_copy` + layer vocab + content-bundle export/import; Import/Locale pages leave stub → Atelier UI. |
| 2026-08-20 | Enter **VERIFY**: F0–F7 shipped in code; close M6 wire (resolveFlowCopy/Layer), expand PublishWizard to all domains, brick preview stub, UX-A2 evidence. |
| 2026-08-20 | VERIFY pass: `resolveFlowCopy` wired via `flow-copy.server` → store + templates resolve; PublishWizard 7 domains; UX-A2 forced via empty `system_copy` FR; open gaps A3/Q2/A8. |
| 2026-08-20 | Forge: Lego catalogue POST/DELETE (scopes, intents, variants, technologies, bricks, deps) + locked re-seed on ensure; client helpers in `catalog-entities.ts`. |
| 2026-08-20 | Principal : regression pack admin UI+backend (F-REG) — gate drift on catalogue CRUD, publish validators, `/admin` smoke. |
| 2026-08-20 | F-REG shipped: `test:admin` + `regression-{backend,api,ui}.test.ts` + `scripts/admin-smoke.mjs` ; Anti Playwright/RTL (Architect). Doc [`REGRESSION-admin.md`](./REGRESSION-admin.md). |
| 2026-08-20 | Close-out: ISC-Q2 (B2 cards density / anti « Composants concernés » dump) **DEFERRED** to document/hydrate engine + brick-metadata follow-up — `hydrate.ts` `scopeCard` still emits that fallback; admin CMS gate remains Q1 placeholders + Q3 Acme template. |
| 2026-08-20 | VERIFY code-reviewer: **CODE_REVIEWER_OK: yes** — 0 critical/high blocking; MEDIUM notes (wizard `all`+placeholders, hydrate escape, non-atomic multi-publish, locale sync). Q2 DEFER confirmed. |
| 2026-08-20 | VERIFY security-reviewer: **SECURITY_OK: yes** — no critical/high unmitigated beyond accepted local-first (no-auth, Next/sharp CVEs per SECURITY.md); SQL parameterized; preview iframe sandboxed. |
| 2026-08-20 | Security MEDIUM deferred (post-close): sanitise prose at bundle import; optional `ADMIN_TOKEN` / body size limit on `/api/admin` — tracked under local-first accept-risk until network exposure. |
| 2026-08-20 | Close: ISC-A3 + A8 PASS (`isc-a3-a8.test.ts` 2/2); Q2 remains DEFERRED; VERIFY pack green → LEARN → COMPLETE. |
| 2026-08-20 | LEARN: PR docs pack — [`docs/add/README.md`](./README.md), [`PR.md`](./PR.md); root README Admin + `test:admin`; GAPS + SECURITY updated. |

## Changelog

| when | entry |
|------|-------|
| 2026-08-18T02:35:00Z | conjectured: split content ISA + UX ISA avec Bridge ISCs est le bon boundary — Designer route sans diluer critères publish. |
| 2026-08-18T02:35:00Z | learned: Acme-first M2 est le levier non-tech ; inférence reste fallback ([`CONTRAT`](./CONTRAT-qualite-acme.md) D6). |
| 2026-08-18T02:35:00Z | criterion-now: ISC-A1…A9, Q1–Q3, M0–M6, Bridge B1–B3 define done for this ISA. |
| 2026-08-20T04:37:00Z | learned: principal asked flow CRUD — custom ids are admin data; locked 8 re-seed; ISC-A9 no longer forbids #9+ as catalogue rows. |
| 2026-08-20T05:05:00Z | learned: F6 M5 architecture templates + cloud_services admin CRUD/publish; createProject(templateId) reads published JSON when CONTENT_FROM_ADMIN=1. |
| 2026-08-20T17:47:00Z | learned: F6 Diagram must match app graph (shared surface); architecture edit via snapshot→spec. Next: F7 M6 bundle + system_copy. |
| 2026-08-20T17:47:00Z | criterion-now: ISC-M5 treated shipped for domain CRUD; ISC-M6 is the remaining migration gate. |
| 2026-08-20T18:40:00Z | learned: Dashboard + F-UX7 done; F7 files exist but resolveFlowCopy unused — VERIFY must wire runtime + widen PublishWizard. |
| 2026-08-20T18:56:00Z | learned: PATCH brick rejects empty `roleFr` at write — UX-A2 seeded via `system_copy` empty FR instead; dashboard + publish API both surface the issue. |
| 2026-08-20T18:56:00Z | criterion-now: 19/22 parent ISCs PASS; remaining open: A3 (PDF title e2e), Q2 (cards density review), A8 (snapshot tags immutability). |
| 2026-08-20T19:49:00Z | learned: F-REG — stay on `tsx --test`; named R1–R4 anchors catch drift without Playwright. |
| 2026-08-20T19:49:00Z | criterion-now: ISC-R1…R4 PASS (`test:admin` 75/75). |
| 2026-08-20T20:00:00Z | conjectured: closing with Q2 deferred is honest — admin CMS done; hydrate B2 is engine follow-up. |
| 2026-08-20T20:00:00Z | refuted-by: treating « Composants concernés » dump as admin CMS fail would block ship without moving the defect. |
| 2026-08-20T20:00:00Z | learned: Designer+Forge+F-REG+VERIFY agents close content ISA; A3 probe = hydrate resolve (not PDF raster); A8 = snapshot immutability test-only. |
| 2026-08-20T20:00:00Z | criterion-now: 25/26 PASS; Q2 DEFERRED; status **complete**. |
| 2026-08-20T20:24:00Z | learned: LEARN doc-sync for PR — `docs/add/README.md` + `PR.md`, README Admin section, GAPS shipped, SECURITY `/admin` threat model. |
| 2026-08-20T20:24:00Z | criterion-now: docs PR-ready; commit/PR on principal ask. |

## Reflection

Admin CMS local-first is shippable: domains CRUD+publish, Atelier chrome, F-REG drift gates, security/code-reviewer OK under accept-risk local-first. Next hill: hydrate Q2 (B2 cards) + optional admin token/body limits if ever network-exposed.

## Verification

| isc | result | evidence |
|-----|--------|----------|
| ISC-A1 | **PASS** | `tsx --test src/lib/lego/admin-catalog.test.ts` — `ISC-A1: updateAdminBrick purposeFr is returned by legoCatalog(fr)` |
| ISC-A2 | **PASS** | `project-templates.test.ts` — `ISC-A2: createProject from published template has 22 components` |
| ISC-A3 | **PASS** | `isc-a3-a8.test.ts` — published `add-iam` title → `resolvePresetSection` + hydrate (PDF path shares resolve; PDF raster not asserted) |
| ISC-A4 | **PASS** | `flow-patterns.test.ts` — `hint edit updates demo match count (ISC-A4)` |
| ISC-A5 | **PASS** | `admin-catalog.test.ts` — `ISC-A5: orphan variant maps_to missing brick is rejected at publish` |
| ISC-A6 | **PASS** | `project-templates.test.ts` — `ISC-A6: Acme admin outline matches demo.json` |
| ISC-Q1 | **PASS** | `add-sections.test.ts` — `publish blocked when placeholders remain` (`placeholder_section`) |
| ISC-Q2 | **DEFER** | Decision 2026-08-20 — `hydrate.ts` `scopeCard` still dumps « Composants concernés »; follow-up hydrate/brick-metadata |
| ISC-Q3 | **PASS** | Covered by A2/A6 Acme 22 comps + 4 author sections |
| Anti A7 | **PASS** | `rg` admin tree: no `projects.data` CRUD surface |
| Anti A8 | **PASS** | `isc-a3-a8.test.ts` — `publishCatalog` leaves snapshotted component `concernTags` unchanged |
| Anti A9 | **PASS** | flow/architecture locked re-seed tests + custom ids as admin data |
| ISC-M0…M4 | **PASS** | Domain suites green (catalog, project-templates, add-sections, flow-patterns); flag-off fallback still in resolve paths |
| ISC-M5 | **PASS** | `architecture-templates.test.ts` + `cloud-services.test.ts` (47 admin-domain tests green with peers) |
| ISC-M6 | **PASS** | `system-copy.test.ts` 5/5; `resolveFlowCopy` wired in `store.ts` + `templates/resolve.server.ts`; bundle + Import/Locale; PublishWizard includes `system_copy` |
| Bridge B1 | **PASS** | UX ISA — HTTP 200 admin routes + Interceptor |
| Bridge B2 | **PASS** | PublishWizard domains `all|catalog|templates|architecture|sections|flows|cloud|system_copy`; publish APIs return same issue codes |
| Bridge B3 | **PASS** | UX ISA F-UX7 — `.field`/`.btn` + Fields on brick fiche |
| ISC-R1 | **PASS** | `npm run test:admin` — `F-REG R1 regression: orphan_variant` + publish `ok:false` contracts (`regression-backend` / `regression-api`) |
| ISC-R2 | **PASS** | `regression-ui.test.ts` + `regression-api.test.ts` — 0 projects CRUD / UI-kit / emoji in admin trees |
| ISC-R3 | **PASS** | `node scripts/admin-smoke.mjs` → 5×200 when server up (skip if down); **not** CI gate — see [`REGRESSION-admin.md`](./REGRESSION-admin.md) |
| ISC-R4 | **PASS** | `F-REG R4` / `placeholder_section` in add-sections + regression-backend/api |
| Notes | — | `npm test` / `tsx --test` (not `bun test` — `node:sqlite` absent in bun). UX-A2 evidence on child ISA. F-REG doc: [`REGRESSION-admin.md`](./REGRESSION-admin.md). |

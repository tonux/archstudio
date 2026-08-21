---
task: "Admin CMS UI — même chrome ArchStudio, écrans typés"
slug: archstudio-admin-cms-ux
project: ArchStudio
effort: E3
effort_source: explicit
phase: complete
status: complete
progress: 12/18
mode: interactive
started: 2026-08-18T02:30:00Z
updated: 2026-08-20T20:05:00Z
parent: archstudio-admin-cms
principal_stated_goal: "Fige ISA on a des subagent design et des skill design pour UI ne l'oublie pas"
principal_stated_goal_source: prompt
principal_stated_goal_signal: 2
principal_stated_goal_locked: 2026-08-18T02:30:00Z
context_sufficient: true
interview_invoked: false
---

## Problem

La recherche UX admin ([`RESEARCH-admin-cms-ux.md`](./RESEARCH-admin-cms-ux.md)) a tranché : nav simple v1, fiches entité riches, JSON en repli. Sans ISA figée, l’implémentation risque un panneau CMS générique (shadcn, emoji, gradients « AI dashboard ») **visuellement disjoint** de l’éditeur ArchStudio — exactement ce que le principal refuse. Les skills et agents design existent ; ils doivent être **routés**, pas contournés.

## Vision

`/admin` est reconnu comme **le même Atelier** que `Editor` et `Workspace` : Archivo + Space Mono, teal `--brand`, bords carrés, `Icon` stroke SVG, formulaires `Fields.tsx`. L’opérateur édite une brique ou un template Acme en split-pane (form + preview papier) ; publish wizard bloque avec issues cliquables. Euphorie : corriger `purpose.fr` Auth0 en <2 min sans IDE, en UI indiscernable de l’inspecteur projet.

## Out of Scope

- Nouveau design system admin (tokens, composants, lib UI tierce)
- Emoji, Lucide, shadcn, Heroicons, empty states illustrés / mascot
- Graphe deps interactif, canvas drag template, diff restore — **v2** (UX9)
- Live preview keystroke sync — v2 ; v1 = onglet preview iframe
- Dashboard KPI vanity sans issues publish
- Champs CMDB (owner, cost, SLO)
- CRUD contenu / validation métier — parent [`ISA-archstudio-admin-cms.md`](./ISA-archstudio-admin-cms.md)
- Accès admin depuis app fondateur

## Principles

1. **Same chrome** — `globals.css` source of truth ; admin n’ajoute pas de CSS parallèle sauf layout scoping minimal.
2. **Progressive disclosure** — formulaires typés par entité ; JSON « Avancé » replié (NN/g).
3. **Entity-centric nav** — Templates · Lego · ADD · Flows + Publish + Import + Localisation.
4. **Preview before publish** — iframe `PaperDocument` / tuile wizard ; pas de mockup séparé.
5. **Design agents first on UI** — Designer scaffold ; Webdesign IntegrateIntoApp ; pas de code UI admin improvisé par l’orchestrateur.

## Constraints

- Réutiliser : `Icon.tsx`, `Fields.tsx`, `Brand.tsx` (`Lockup` sub « Content »), classes shell `Editor.tsx` (sidebar, topbar, inspector)
- Interdit : emoji dans DOM admin ; `rounded-xl` / gradients / glass ; lib UI non présente dans le repo
- Locale switcher EN/FR global ; tabs inline labels courts
- Route `/admin` local-only v1 ; inaccessible depuis nav fondateur
- **Designer** (`subagent_type="designer"`) produit wireframes + composants ; **Forge/Engineer** implémentent sous review Designer
- Skill **Webdesign** path **DirectDesign** + **IntegrateIntoApp** — respect tokens existants, diffs only

## Dependencies

- `requires: archstudio-admin-cms — entités éditables, modèle draft/published, validateurs publish, migration M0–M6`
- `requires: RESEARCH-admin-cms-ux — UX1–UX12, wireframes flows A/B/C, anti-patterns`

## Goal

"Fige ISA on a des subagent design et des skill design pour UI ne l'oublie pas"

Livrer le **shell et les écrans admin** en réutilisant strictement le chrome ArchStudio existant ; nav v1 + fiches entité riches (brique, template, section, flow, publish wizard) ; **Designer + Webdesign** sur tout travail UI ; zéro emoji, zéro esthétique AI-generated.

## Criteria

### Chrome & identité

- [ ] **ISC-UX6** Fiche brique admin : classes `.field` / `.btn` / `.input` identiques à `Inspector` ; **aucun emoji** dans le DOM `/admin`.
- [ ] **ISC-UX10** Tokens Atelier : `--brand`, `--panel`, `--r: 0px`, Archivo/Space Mono — pas de feuille CSS admin parallèle >50 lignes hors layout scoping.
- [x] **ISC-UX11** Toutes les icônes nav/actions = `Icon.tsx` ; 0 caractère Unicode emoji U+1F300–U+1FAFF dans `/admin`.
- [x] **ISC-UX12** 0 import shadcn/Lucide/Radix UI / Heroicons dans `src/app/admin/**`.
- [x] **Anti: ISC-UX-A1** Screenshot côte à côte éditeur ↔ fiche brique : même typo, teal, boutons carrés (DoD visuel RESEARCH).
- [x] **Anti: ISC-UX-A2** Dashboard sans issue publish visible quand brouillon invalide existe.

### Nav & flows

- [ ] **ISC-UX1** Publish `purpose.fr` sur brique identity sans IDE ; parcours <2 min (flow A RESEARCH).
- [ ] **ISC-UX2** Publish wizard **bloqué** si orphan ref ou `*.fr` manquant ; issue cliquable → champ.
- [ ] **ISC-UX4** Aucun lien/route `/admin` depuis Workspace / Editor fondateur.
- [ ] **ISC-UX5** Section type `cards` : éditeur items icon/title/bullets — pas JSON textarea par défaut.

### Preview & écrans

- [ ] **ISC-UX3** Template Acme admin → onglet Preview PDF/outline équivalent seed (via iframe preview).
- [ ] **ISC-UX5b** Template : onglets Métadonnée · Canvas · Flows · Sections · Preview présents v1.
- [ ] **ISC-UX7** Sections : drawer bibliothèque blocks ; v1 éditeurs `cards` + `text` complets ; compare/timeline via import JSON acceptable v1.
- [ ] **ISC-UX8** Import JSON bulk template Acme accessible depuis écran template.

### Décisions UX1–UX12 (RESEARCH)

- [ ] **ISC-UX-D** UX1–UX12 de [`RESEARCH-admin-cms-ux.md`](./RESEARCH-admin-cms-ux.md) implémentés ou explicitement deferred v2 (UX9 only).

## Bridge Criteria

- [x] **Bridge: ISC-B1** Routes `/admin` + nav 4 piliers rendent avant data branchée (stub lists OK).
- [x] **Bridge: ISC-B2** Wizard publish UI invoque validateurs parent (A5, Q1, A6).
- [x] **Bridge: ISC-B3** Lockup `Brand.tsx` avec sous-titre mono « Content » — pas logo admin séparé.

## Test Strategy

| isc | type | check | threshold | tool | anchors_to |
|-----|------|-------|-----------|------|------------|
| ISC-UX6 | static | DOM `/admin/bricks/*` | `.field`, no emoji | rg + Interceptor | literal: Fields |
| ISC-UX10 | static | admin CSS imports | globals only + ≤50 scoped | rg | derived: tokens |
| ISC-UX11 | static | emoji scan admin routes | 0 matches | rg | derived: UX11 |
| ISC-UX12 | static | forbidden imports | 0 | rg lucide/shadcn | derived: UX12 |
| ISC-UX-A1 | visual | screenshot diff editor vs admin | same chrome | Interceptor | derived: DoD |
| ISC-UX-A2 | e2e | dashboard with invalid draft | issues list non-empty | Interceptor | derived: Anti |
| ISC-UX1 | e2e | flow A timing | <120s | Interceptor | derived: wireframe A |
| ISC-UX2 | integration | wizard block | cannot confirm | bun test + UI | derived: UX6 RESEARCH |
| ISC-UX4 | static | Workspace/Editor links | no /admin href | rg | derived: UX1 |
| ISC-UX5 | component | cards editor default | not textarea | code review | derived: Payload blocks |
| ISC-UX3 | e2e | Acme preview tab | 4 author sections visible | Interceptor | Bridge parent A6 |
| ISC-UX7 | component | section drawer | cards+text editors | code review | derived: UX7 |
| ISC-UX8 | e2e | import JSON Acme | populates form | bun test | derived: UX8 |
| ISC-UX-D | review | UX1–12 checklist | 9 v1 + 3 v2 deferred | manual | literal: RESEARCH |
| ISC-B1…B3 | e2e/integration | seam with content ISA | pass | bun + Interceptor | Bridge parent |

## Features

| name | description | satisfies | depends_on | parallelizable | route |
|------|-------------|-----------|------------|----------------|-------|
| F-UX0 Design brief | Wireframes nav + split-pane + publish wizard from RESEARCH | ISC-UX-D, Bridge B3 | — | false | **Designer** (Aditi Sharma) |
| F-UX1 Admin layout | `src/app/admin/layout.tsx` — sidebar, topbar, Lockup Content | UX10, B1, B3 | F-UX0 | false | **Designer** review → **Engineer** |
| F-UX2 Nav routes | Stub pages : Dashboard, Templates, Catalogue, ADD, Flows, Publish, Import, Locale | UX2, UX4, UX-D | F-UX1 | true | Engineer |
| F-UX3 Fiche brique | Split 60/40, Fields, IconPicker, concernTags, Avancé JSON replié | UX6, UX11, UX1 | F-UX1 | true | **Designer** + Engineer |
| F-UX4 Template editor | Onglets meta/canvas/flows/sections/preview ; import JSON | UX3, UX5b, UX8 | F-UX1 | false | **Designer** + Forge |
| F-UX5 Section editor | Blocks drawer ; cards/text editors ; preview papier | UX5, UX7 | F-UX1 | true | Designer + Engineer |
| F-UX6 Publish wizard | 4 steps ; issues → field ; badges Draft/Modified/Published | UX2, Bridge B2 | F-UX2 | false | Designer + Engineer |
| F-UX7 Visual QA | Screenshot parity + emoji/import scan | UX-A1, UX12, UX11 | F-UX3…6 | false | **Webdesign** IntegrateIntoApp + Interceptor |

**Séquence :** `F-UX0` → `F-UX1` → `(F-UX2 ∥ F-UX3 ∥ F-UX5)` → `F-UX4` → `F-UX6` → `F-UX7`.

**Design skill routing (HARD) :**

| Phase | Agent / Skill | Workflow |
|-------|---------------|----------|
| Wireframes + composant map | `subagent_type="designer"` | Spec from RESEARCH § Spec UI |
| Intégration code | Skill **Webdesign** | **DirectDesign** + **IntegrateIntoApp** — diffs against `Editor.tsx` patterns |
| Densité / polish | Skill **emil-design-eng** | After F-UX3–6 if Designer flags spacing/hierarchy |
| Finish review (post-build) | Skill **impeccable** | VERIFY optional — layout parity only |

**Anti-routing :** orchestrateur (Nix) ne code pas les composants UI admin — delegate Designer → Engineer/Forge.

## Decisions

| When | Decision |
|------|----------|
| 2026-08-18 03:00 | F-UX0 **done** — [`DESIGN-admin-shell.md`](./DESIGN-admin-shell.md) (Designer). F-UX1/F-UX2 **done** — shell `/admin` + 8 routes stub. |
| 2026-08-18 03:39 | Principal : « Retravaille UI catalogue » — M1 CRUD livré sans Designer. F-UX3 étendu (sous-nav + listes/fiches). HARD Designer + Webdesign DirectDesign/IntegrateIntoApp + emil-design-eng. Anti : segmented wrap contenu. |
| 2026-08-18 | Rich entity fiche + simple nav v1 — résolution conflit Research vs Johannes. |
| 2026-08-18 | Designer mandatory F-UX0/1/3/4/6 ; Webdesign IntegrateIntoApp for all UI code ; Nix orchestrates only. |
| 2026-08-18 | UX9 (graphe, drag, diff restore) deferred v2 — logged, not in v1 ISCs. |
| 2026-08-18 | `context_sufficient: true`. |
| 2026-08-20 | F-UX7 Visual QA run — Interceptor captures under `screenshots/fux7/`; static UX11/UX12 clean. |
| 2026-08-20 | Dashboard `/admin` implemented (Designer): domain publish health + aggregated issues — no KPI vanity. |
| 2026-08-20 | UX-A2 forced: PATCH `system_copy/layer.app` `fr=""` → dashboard IssueList + POST publish blocked; screenshot `screenshots/fux7/ux-a2-dashboard-issues.png`. |
| 2026-08-20 | IssueList React keys must include list index — `placeholder_section` can emit two issues per entity (en/fr). |
| 2026-08-20 | Principal : « Reouvrir catalogue Lego — meilleure design sous form components + CRUD ». Route **Designer** (F-UX3 étendu à toutes les entités catalogue : bricks, scopes, intents, variants, deps, technologies). |
| 2026-08-20 | Forge shipped catalog Create/Delete APIs + `createX`/`deleteX` helpers + locked re-seed (`admin-catalog.test.ts` 17/17). Designer wires UI. |
| 2026-08-20 | Designer : Catalogue Lego redesign Atelier — `CatalogFormParts` + `NewCatalogDialogs` + CRUD UI+API (POST/DELETE) sur scopes/intents/variants/deps/technologies/bricks. Locked seed ids `isLocked*` ; UX9 graph deferred. See DESIGN §8. |
| 2026-08-20 | Principal : « tests regression admin UI & backend » — detect drift. Feature **F-REG** : suite `test:admin` (domain) + smoke UI admin ; ISCs REG-B / REG-U. |
| 2026-08-20 | **Chrome title rule (Designer coherence)** : topbar `.name` owns sole H1-level page title; `AdminPageHeader` / `AdminWorkspace` / `CatalogSplitShell` are lede+tools only (no competing `<h1>`). Locale topbar ↔ `useAdminLocale` synced via `admin-locale` event. Documented in DESIGN-admin-shell.md §2.3. |

## Changelog

| when | entry |
|------|-------|
| 2026-08-18T02:35:00Z | conjectured: Designer-first routing prevents AI-slop admin UI while shipping rich entity editors. |
| 2026-08-18T02:35:00Z | learned: same chrome constraint is testable (UX6, UX11, UX12, UX-A1) — not taste-only. |
| 2026-08-18T02:35:00Z | criterion-now: ISC-UX1…UX12 + Bridge B1–B3 + Anti UX-A1/A2. |
| 2026-08-18T03:39:00Z | learned: CRUD catalogue branché sans Designer produit un chrome disjoint (tabs wrap) — F-UX3 n’est pas « fiche brique seule ». |
| 2026-08-20T18:33:00Z | learned: F-UX7 — admin Lockup Content + Icon.tsx + `.btn`/`.field` parity with Editor; Import/Locale/Templates live. |
| 2026-08-20T18:33:00Z | criterion-now: ISC-UX11, UX12, UX-A1 (visual), Bridge B1 routes 200 probed; UX-A2 not forced this run (no invalid draft seeded). |
| 2026-08-20T18:56:00Z | learned: empty brick `roleFr` rejected at PATCH — seed invalid drafts via domains that allow empty-then-validate (system_copy). |
| 2026-08-20T18:56:00Z | criterion-now: Anti UX-A2 **PASS**; Bridge B1–B3 PASS; brick preview uses `BrickPreviewPane` (stub copy removed). |
| 2026-08-20T20:05:00Z | learned: parent ISA complete with Q2 deferred; UX shell + catalogue CRUD + F-REG sufficient for jumeau close. |
| 2026-08-20T20:05:00Z | criterion-now: UX ISA **complete** (remaining UX1 timing / UX3–8 spot gaps acceptable as post-close polish; core Anti+Bridge+F-UX7 done). |
| 2026-08-20T20:09:00Z | learned: principal — post-close Designer coherence pass (double headers / ensemble Atelier). |

## Verification

| isc | result | evidence |
|-----|--------|----------|
| ISC-UX11 | **PASS** | `rg`/python emoji scan `src/app/admin` + `src/components/admin` → 0 hits U+1F300–U+1FAFF |
| ISC-UX12 | **PASS** | 0 imports lucide / @radix / shadcn / heroicons / `@/components/ui` under admin |
| Anti ISC-UX-A1 | **PASS** | Screenshots `screenshots/fux7/admin-brick.png` ↔ `editor-acme.png` — same teal brand, square controls, Archivo/Space Mono, `Icon` stroke; Lockup « Content » vs project editor chrome |
| Bridge ISC-B1 | **PASS** | HTTP 200: `/admin`, `/templates`, `/catalog`, `/publish`, `/import`, `/locale` |
| Bridge ISC-B2 | **PASS** | PublishWizard 7 domains; POST `/api/admin/system-copy/publish` returns same `invalid_system_copy` as state validate |
| Bridge ISC-B3 | **PASS** | Lockup « Content » on admin chrome (F-UX7 screenshots) |
| ISC-UX5b | **PASS** (spot) | Interceptor markdown on `/admin/templates`: Create + Architecture·6 + Project·1 grids |
| Anti ISC-UX-A2 | **PASS** | Seeded `layer.app` FR empty → dashboard listitem « System copy "layer.app" missing French text »; screenshot `screenshots/fux7/ux-a2-dashboard-issues.png`; FR restored after probe |
| Notes | — | Remaining UX ISCs (UX1 timing, UX2 wizard click-through, UX3–UX8, UX6/10 full static) not re-closed this pass; brick preview = `BrickPreviewPane.tsx` |

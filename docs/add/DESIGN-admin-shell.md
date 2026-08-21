# Design brief — Admin CMS shell (F-UX0)

- **ISA :** [`ISA-archstudio-admin-cms-ux.md`](./ISA-archstudio-admin-cms-ux.md) (LOCKED)
- **Recherche :** [`RESEARCH-admin-cms-ux.md`](./RESEARCH-admin-cms-ux.md)
- **Date :** 2026-08-18
- **Auteur :** Designer (Aditi Sharma)
- **Handoff :** Engineer / Forge — F-UX1 → F-UX7

---

## Aesthetic direction

**Tone :** Atelier opérateur — même identité que l’éditeur projet, surface orientée contenu système.

| Couche | Valeur |
|--------|--------|
| Fond calque | `--bg` `#EEF3F6` |
| Surfaces | `--panel`, `--panel-2`, `--panel-3` |
| Action / sélection | `--brand` `#0E7C8A` |
| Typo prose | Archivo (`--sans`) |
| Typo machine | Space Mono (`--mono`) — ids, counts, badges, timestamps |
| Rayon | `--r: 0px` partout |
| Marque | `Lockup` `sub="Content"` — mono, `--ink-3` |

**Différenciation mémorable :** l’opérateur ne quitte jamais l’Atelier — seule la nav latérale change (entités CMS vs dossiers projets). Split-pane fiche entité = inspecteur projet élargi + preview papier réelle.

**Framework :** Next.js App Router · React · CSS tokens `globals.css` uniquement.

---

## 1. Component map

Réutiliser tel quel — **aucun nouveau design system**, pas de feuille CSS admin >50 lignes hors scoping layout.

### Shell & layout

| Rôle | Classe CSS | Composant / pattern source |
|------|------------|----------------------------|
| Racine flex full-height | `.shell` | `Workspace.tsx`, `Editor.tsx` |
| Colonne nav gauche | `.sidebar`, `.sidebar-head`, `.sidebar-scroll`, `.sidebar-foot` | `Workspace.tsx` |
| Zone principale (colonne droite) | `.admin-main` *(nouveau wrapper minimal — flex column, flex:1, overflow:hidden)* | dérivé `.editor` |
| Barre d’actions | `.topbar`, `.topbar .name` | `Editor.tsx` |
| Corps scrollable liste | `.workspace`, `.ws-head`, `.ws-body` | `Workspace.tsx` |
| Corps split entité | `.editor-body` | `Editor.tsx` — panneau form + panneau preview |
| Panneau formulaire (60 %) | `.content-main` + `.cpanel` | `ContentEditor.tsx`, `Fields.tsx` `Panel` |
| Panneau preview (40 %) | `.inspector` + `.previewframe` | `Editor.tsx` `PreviewPane`, `Inspector.tsx` |
| Rail secondaire (onglets template) | `.content-rail`, `.railitem` | `ContentEditor.tsx` |
| Séparateur | `.insp-sep` | `Inspector.tsx` |

### Navigation sidebar

| Rôle | Classe CSS | Composant source |
|------|------------|------------------|
| Entrée nav | `.tree-row`, `.tree-row.active`, `.tree-row .ficon`, `.tree-row .label`, `.tree-row .count` | `Workspace.tsx` `ScopeRow` |
| Groupe nav | `.sect-label`, `.sect-label .spacer` | `Workspace.tsx`, `Editor.tsx` palette |
| Sous-nav catalogue | `.tree-row` indent `paddingLeft: 8 + depth * 14` | `Workspace.tsx` `FolderBranch` |
| Lockup | `.sidebar-head` + `Lockup` | `Brand.tsx`, `Workspace.tsx` |
| Pied sidebar | `.footbtn`, `.iconbtn` (thème) | `Workspace.tsx` |

### Topbar

| Rôle | Classe CSS | Pattern source |
|------|------------|----------------|
| Retour workspace | `.iconbtn` + `Icon name="back"` | `Editor.tsx` |
| Titre entité / breadcrumb | `.topbar .name` (readonly ou éditable) | `Editor.tsx` |
| État save | `.saveflag`, `.saveflag.dirty`, `.saveflag.error` | `Editor.tsx` `SaveFlag` |
| Switch locale EN/FR | `.segmented` + `button[aria-pressed]` | `Editor.tsx` mode switch ; `Workspace.tsx` `NewProjectDialog` |
| Actions primaires | `.btn`, `.btn.primary`, `.btn.sm`, `.btn.ghost` | partout |
| Spacer flex | `style={{ flex: 1 }}` | `Editor.tsx` |

### Formulaires & listes

| Rôle | Classe / composant | Source |
|------|-------------------|--------|
| Champs | `.field`, `.input`, `.textarea`, `.select`, `.hint` | `globals.css`, `Fields.tsx` |
| Primitives React | `Text`, `Area`, `Choice`, `StringList`, `CellGrid`, `CardList`, `IconPicker`, `Panel`, `Group` | `Fields.tsx` |
| Grille entités | `.pgrid`, `.pcard` | `Workspace.tsx` |
| Liste vide (texte seul) | `.empty` | `globals.css` — **pas d’illustration** |
| Liste expandable | `.elist`, `.elist-head`, `.elist-body`, `.cardlist` | `Fields.tsx` |
| Tags / concernTags | `.chiprow`, `.tagchip` | `globals.css` |
| Alerte validation | `.warnbox` | `globals.css` |
| Drawer blocks | `.modal-scrim`, `.modal.wide` | `Workspace.tsx` dialogs |
| Stepper wizard | `.flowmap`, `.flowmap-row`, `.flowmap-row > .n` | `globals.css` (vertical) |
| Diff résumé publish | `.hist`, `.histrow`, `.diffrow`, `.dkind` | `globals.css` |
| Recherche liste | `.ws-search`, `.ws-search input` | `Workspace.tsx` |

### Icônes & marque

| Rôle | Source |
|------|--------|
| Toutes les icônes nav / actions | `Icon.tsx` — stroke SVG 24×24 |
| Lockup admin | `Brand.tsx` → `<Lockup size={26} sub="Content" />` |

### Badges publish (Draft / Modified / Published)

**`.pill` n’existe pas dans `globals.css`** (présent seulement dans `viewer/style.css`). Deux options Engineer — choisir **B** par défaut :

| Option | Implémentation |
|--------|----------------|
| A | Porter `.pill` viewer → `globals.css` (~6 lignes, mêmes tokens) |
| **B (défaut)** | `<span className="btn sm">` non-cliquable (`role="status"`) avec modificateurs : |

```tsx
// Draft — neutre
<span className="btn sm" role="status">Draft</span>

// Modified — teal (aligné saveflag.dirty)
<span className="btn sm" role="status" style={{ borderColor: 'var(--brand)', color: 'var(--brand-ink)' }}>Modified</span>

// Published — ok
<span className="btn sm" role="status" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}>Published</span>
```

Alternative compacte listes : classe `.count` existante + couleur inline pour Published/Modified.

---

## 2. Wireframes ASCII

### 2.1 Layout shell

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ .shell (100vh, flex row)                                                    │
├──────────────┬──────────────────────────────────────────────────────────────┤
│ .sidebar     │ .admin-main (flex:1, flex-col, overflow:hidden)              │
│ 268px        │ ┌──────────────────────────────────────────────────────────┐ │
│ --panel-2    │ │ .topbar 56px — back · titre · saveflag · locale · actions│ │
│              │ ├──────────────────────────────────────────────────────────┤ │
│ [Lockup      │ │ .admin-body (flex:1, overflow)                           │ │
│  Content]    │ │   → liste (.workspace) OU split (.editor-body) OU wizard │ │
│              │ └──────────────────────────────────────────────────────────┘ │
│ nav scroll   │                                                              │
│              │                                                              │
│ .sidebar-foot│                                                              │
│ theme·note   │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

**Diff vs Workspace :** même sidebar ; la zone droite ajoute une `.topbar` permanente (Editor pattern) au lieu d’un seul `.ws-head`.

**Diff vs Editor :** admin **a** une sidebar CMS ; l’éditeur projet n’en a pas.

---

### 2.2 Nav sidebar — 4 piliers + Publish + Import + Locale

```
┌─ .sidebar-head ─────────────────┐
│ [Mark] ArchStudio               │
│        Content          (mono)  │
└─────────────────────────────────┘
┌─ .sidebar-scroll ───────────────┐
│                                 │
│  .tree-row*     Dashboard       │  → /admin
│                                 │
│  ── .sect-label: Content ──     │
│  .tree-row      Templates       │  → /admin/templates
│  .tree-row      Catalogue Lego  │  → /admin/catalog  (hub .pgrid .pcard)
│    └ .tree-row    Briques       │  → /admin/catalog/bricks
│    └ .tree-row    Scopes        │  → /admin/catalog/scopes
│    └ .tree-row    Intents       │  → /admin/catalog/intents
│    └ .tree-row    Variants      │  → /admin/catalog/variants
│    └ .tree-row    Dependencies  │  → /admin/catalog/dependencies
│    └ .tree-row    Technologies  │  → /admin/catalog/technologies
│  .tree-row      Bibliothèque ADD│  → /admin/sections
│  .tree-row      Flow patterns   │  → /admin/flows
│                                 │
│  ── .sect-label: Operations ──  │
│  .tree-row      Publish         │  → /admin/publish
│  .tree-row      Import / Export │  → /admin/import
│  .tree-row      Localisation    │  → /admin/locale
│                                 │
└─────────────────────────────────┘
┌─ .sidebar-foot ─────────────────┐
│ [moon]  Self-hosted · seed CMS  │
└─────────────────────────────────┘
```

**Icônes `Icon` suggérées :**

| Entrée | `Icon` name |
|--------|-------------|
| Dashboard | `grid` |
| Templates | `file` |
| Catalogue | `cube` |
| Briques | `box` |
| Scopes | `map` |
| Variants | `layers` |
| Intents | `route` |
| Dependencies | `link` |
| Technologies | `terminal` |
| ADD Sections | `folder` |
| Flows | `route` |
| Publish | `upload` |
| Import | `download` |
| Locale | `globe` ou `cog` si `globe` absent |

**Active state :** `.tree-row.active` sur route courante ; sous-items catalogue indentés comme `FolderBranch`.

---

### 2.3 Topbar

```
┌─ .topbar ────────────────────────────────────────────────────────────────────┐
│ [←]  identity-auth0          [● Editing…]     │ EN │ FR │   [Validate][Publish]│
│ iconbtn  .name / breadcrumb    .saveflag      .segmented      .btn .primary   │
└──────────────────────────────────────────────────────────────────────────────┘
        ↑ flex:1 spacer entre saveflag et locale sur pages liste
```

**Pages liste** (dashboard, templates index, catalog index) :

```
┌─ .topbar ────────────────────────────────────────────────────────────────────┐
│ [←]  Templates               │ EN │ FR │              [+ New] [Import JSON]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Règle chrome title (HARD — post-close coherence 2026-08-20) :**

| Couche | Rôle | Ne pas |
|--------|------|--------|
| `.topbar .name` | **Seul** titre H1-level de l’écran (nav section ou id entité) | Répéter la même chaîne en `<h1>` / `.ws-head-title` dans le body |
| `AdminPageHeader` / `AdminWorkspace` | Toolbar body : lede + search + actions (PublishBadge, Create) | Prop `title` / `<h1>` |
| Fiche split (`CatalogSplitShell`, `TemplateEditorShell` `.cpanel-head h2`) | Titre **entité** local au panneau form (id/label édité) — distinct du chrome section | Dupliquer le label section topbar |

**Choix :** Topbar owns the page title. Body never competes.

**Règles :**

- `[←]` → `/` (workspace fondateur) — **pas** de lien `/admin` depuis Workspace/Editor (ISC-UX4).
- Locale switcher **toujours** visible — voir §6. Layout topbar écrit `admin-locale` + event `admin-locale` ; `useAdminLocale` écoute storage + event (pas seulement `focus`).
- Pas de segmented Diagram/Content/Preview — réservé à l’éditeur projet.

---

### 2.4 Split-pane — fiche entité (stub brique)

```
┌─ .editor-body ───────────────────────────────────────────────────────────────┐
│ ┌─ .content-main (60%) ─────────────┐ ┌─ .inspector (40%) ────────────────┐ │
│ │ .cpanel-head                      │ │ .sub mono  identity-auth0         │ │
│ │  identity-auth0    [Modified]     │ │ h3 Preview                        │ │
│ │  [Validate][Draft][Publish]       │ │ ┌─────────────────────────────┐   │ │
│ ├───────────────────────────────────┤ │ │ .previewframe (iframe)      │   │ │
│ │ .cgroup: Metadata                 │ │ │  tuile wizard + glossaire   │   │ │
│ │  IconPicker · layer · scope       │ │ └─────────────────────────────┘   │ │
│ │  concernTags (.tagchip)           │ │                                   │ │
│ │ .cgroup: Content                  │ │ [EN|FR] segmented (preview only)  │ │
│ │  tabs EN | FR inline (.segmented) │ │                                   │ │
│ │  Area purpose · role · features   │ │                                   │ │
│ │ .insp-sep                         │ │                                   │ │
│ │ ▾ Avancé (.elist collapsed)       │ │                                   │ │
│ │  textarea JSON (.textarea mono)   │ │                                   │ │
│ └───────────────────────────────────┘ └───────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Stub v1 :** form champs placeholder + iframe preview vide ou seed statique ; data branchée F-UX3.

**Template editor :** remplacer split par `.content-body` — `.content-rail` onglets Métadonnée · Canvas · Flows · Sections · Preview (RESEARCH UX5b).

---

### 2.5 Publish wizard — 4 étapes

Page pleine `.admin-body` — pas modal. Stepper vertical `.flowmap` :

```
┌─ Publish ──────────────────────────────────────────────────────────────────────┐
│                                                                                │
│  .flowmap                                                                      │
│  ┌─ .flowmap-row ──────────────────────────────────────────────────────────┐  │
│  │ 1 │ Scope                          [x] Catalogue  [ ] Templates  [ ] All │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│  ┌─ .flowmap-row ──────────────────────────────────────────────────────────┐  │
│  │ 2 │ Validation                     .warnbox if blocked                   │  │
│  │   │  · purpose.fr missing → identity-auth0  (link → field)              │  │
│  │   │  · orphan ref → variant-xyz           (link → field)              │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│  ┌─ .flowmap-row ──────────────────────────────────────────────────────────┐  │
│  │ 3 │ Summary diff                   .hist (list + diff pane)             │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│  ┌─ .flowmap-row ──────────────────────────────────────────────────────────┐  │
│  │ 4 │ Confirm                        [Cancel]  [Publish] (disabled si 2)  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Comportement :** étape 2 **bloque** étape 4 si issues ; clic issue → navigate vers fiche entité + focus champ (query `?field=purpose.fr`).

---

## 3. Route table

| Route | Page | Rôle v1 | Layout |
|-------|------|---------|--------|
| `/admin` | Dashboard | Liste issues publish uniquement — `.empty` si OK | shell + ws-head « Issues » |
| `/admin/templates` | Templates index | Grille `.pgrid` templates seed | shell + liste |
| `/admin/templates/[id]` | Template editor | Onglets rail + preview iframe | shell + content-body |
| `/admin/catalog` | Catalogue hub | Hub cards `.pgrid` `.pcard` — counts + dirty badge once | shell + workspace |
| `/admin/catalog/bricks` | Briques index | Liste `.tree-row` (icon + id + layer/scope) + filter | shell + workspace |
| `/admin/catalog/bricks/[id]` | Fiche brique | Split 60/40 form + inspector | shell + editor-body |
| `/admin/catalog/scopes` | Scopes | Liste + inspector `Text` EN/FR | shell + editor-body |
| `/admin/catalog/intents` | Intents | Liste + inspector modes/shapes | shell + editor-body |
| `/admin/catalog/intents/[id]` | Fiche intent | Split 60/40 (deep link) | shell + editor-body |
| `/admin/catalog/variants` | Variants | Liste filtrée + inspector mapping | shell + editor-body |
| `/admin/catalog/dependencies` | Dependencies | Liste + inspector edge | shell + editor-body |
| `/admin/catalog/technologies` | Technologies | Liste + inspector copy EN/FR | shell + editor-body |
| `/admin/sections` | ADD library | Liste sections + link edit | shell + liste |
| `/admin/sections/[id]` | Section editor | Form + preview + JSON replié | shell + editor-body |
| `/admin/flows` | Flow patterns | Liste + link edit | shell + liste |
| `/admin/flows/[id]` | Flow editor | Stepper vertical stub | shell + content-main |
| `/admin/publish` | Publish wizard | 4 steps | shell + wizard |
| `/admin/import` | Import / Export | JSON bulk + export buttons | shell + cpanel |
| `/admin/locale` | Localisation | Filtre champs `*.fr` manquants | shell + liste issues |

**Next.js :** `src/app/admin/layout.tsx` wraps all ; pas de route `/admin` depuis `Workspace` / `Editor` (grep CI ISC-UX4).

---

## 4. File plan

### `src/app/admin/`

| File | Responsibility |
|------|----------------|
| `layout.tsx` | Client shell : `.shell` + `AdminSidebar` + `{children}` dans `.admin-main` ; charge locale context ; **pas** de data CMS v1 |
| `page.tsx` | Dashboard — issues publish stub |
| `templates/page.tsx` | Index templates — stub `.pgrid` |
| `templates/[id]/page.tsx` | Template editor shell — tabs rail stub |
| `catalog/page.tsx` | Hub cards `.pgrid` `.pcard` → listes entités |
| `catalog/bricks/page.tsx` | Liste briques + filter `.ws-search` |
| `catalog/bricks/[id]/page.tsx` | Fiche brique split |
| `catalog/variants/page.tsx` | Stub |
| `catalog/intents/page.tsx` | Stub |
| `catalog/deps/page.tsx` | Stub |
| `sections/page.tsx` | Bibliothèque ADD stub |
| `sections/[id]/page.tsx` | Section editor stub |
| `flows/page.tsx` | Flow patterns list stub |
| `flows/[id]/page.tsx` | Flow editor stub |
| `publish/page.tsx` | Wizard 4 steps UI |
| `import/page.tsx` | Import/export JSON stub |
| `locale/page.tsx` | Missing FR fields list stub |

### `src/components/admin/`

| File | Responsibility |
|------|----------------|
| `AdminShell.tsx` | Composant layout réutilisable : sidebar + topbar slot + body slot |
| `AdminSidebar.tsx` | Nav `.tree-row` — 4 piliers + ops ; `Lockup sub="Content"` ; active route via `usePathname` |
| `AdminTopbar.tsx` | Topbar : back, title, `SaveFlag`, `LocaleSwitcher`, actions slot |
| `LocaleSwitcher.tsx` | `.segmented` EN/FR — context React `AdminLocale` |
| `PublishBadge.tsx` | Draft / Modified / Published — `.btn.sm` pattern §1 |
| `EntitySplitPane.tsx` | Wrapper `.editor-body` : form slot + preview iframe slot |
| `PublishWizard.tsx` | 4-step wizard — `.flowmap` rows |
| `IssueList.tsx` | Dashboard + wizard step 2 — `.warnbox` + liens cliquables |
| `AdminEmpty.tsx` | Text-only empty — wraps `.empty`, **no illustration** |

**Optional later (F-UX3+) :** `BrickForm.tsx`, `TemplateEditor.tsx`, `SectionEditor.tsx`, `BlocksDrawer.tsx` — hors F-UX1 shell.

### CSS scoping

Un seul fichier autorisé si nécessaire :

| File | Max | Content |
|------|-----|---------|
| `src/app/admin/admin.css` | ≤50 lignes | `.admin-main`, split ratio `60/40`, wizard step spacing — **tokens only** |

Import dans `layout.tsx` uniquement. Pas d’autre CSS admin.

---

## 5. Do-not list

| Interdit | Raison |
|----------|--------|
| Emoji (U+1F300–U+1FAFF) dans DOM `/admin` | ISC-UX11 |
| shadcn / Radix UI / Lucide / Heroicons | ISC-UX12 |
| `rounded-xl`, glassmorphism, gradients violet/bleu | UX12, anti AI-slop |
| Empty states illustrés / mascot | RESEARCH anti-patterns |
| Dashboard KPI vanity sans issues | Anti ISC-UX-A2 |
| Nav icon-only colorée type Notion | RESEARCH |
| Palette primaire ≠ teal `--brand` | Atelier identity |
| Lien `/admin` depuis Workspace ou Editor | ISC-UX4 |
| JSON textarea comme éditeur principal | UX3 — replié sous « Avancé » |
| Champs CMDB (owner, cost, SLO) | Out of scope |
| Dark mode admin séparé | Même `html[data-theme]` toggle sidebar-foot |
| Nouveau logo / lockup admin | Bridge B3 — `Content` only |

---

## 6. Locale switcher — placement

**Position :** `.topbar`, **après** `.saveflag` (si présent) et **avant** le spacer/actions droite.

**Composant :** `LocaleSwitcher` — copie exacte du pattern `.segmented` :

```tsx
<div className="segmented" role="group" aria-label="Content locale">
  <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
  <button aria-pressed={locale === 'fr'} onClick={() => setLocale('fr')}>FR</button>
</div>
```

**Portée :**

| Niveau | Comportement |
|--------|--------------|
| Global (topbar) | Filtre labels longs EN/FR sur fiches ; sync avec seed i18n |
| Inline (fiche entité) | Second `.segmented` dans form pour champs bilingues courts — tabs EN \| FR |
| Preview pane | Segmented EN/FR **preview only** — n’affecte pas le switcher global |
| Page `/admin/locale` | Liste transversale champs FR manquants + action « Copier EN→FR » (btn `.sm`) |

**Persistance v1 :** `localStorage` key `admin-locale` ; default `en`.

**Sync (2026-08-20) :** layout topbar is source of write. After `setItem`, dispatch `window` event `admin-locale`. Consumers (`useAdminLocale`) re-read on that event, `storage`, and `focus` — avoids stale EN/FR labels when toggling without blur.

---

## 7. Badge states — Draft / Modified / Published

Voir §1 Component map. Récap :

| État | Visuel | Classe |
|------|--------|--------|
| Draft | Bord neutre, texte `--ink-2` | `.btn.sm` |
| Modified | Bord `--brand`, texte `--brand-ink` | `.btn.sm` + inline |
| Published | Bord `--ok`, texte `--ok` | `.btn.sm` + inline |

**Placement :** `.cpanel-head` (fiche entité), colonne liste (optionnel `.count`), wizard step 3 diff.

**Accessibilité :** `role="status"` + `aria-label="Publication state: Draft"` — pas de couleur seule (texte lisible).

---

## Verification checklist (Designer → Engineer)

| Check | Méthode |
|-------|---------|
| Même typo / teal / bords carrés vs Editor | Screenshot côte à côte ISC-UX-A1 |
| 0 emoji admin DOM | `rg` U+1F300 |
| 0 imports shadcn/lucide | `rg` `src/app/admin` |
| Lockup `Content` | visuel sidebar-head |
| Locale topbar visible toutes routes | Interceptor |
| Wizard bloqué si issues | integration test |
| CSS admin ≤50 lignes | `wc -l admin.css` |

---

## Engineer handoff — séquence

1. **F-UX1** — `layout.tsx` + `AdminShell` + `AdminSidebar` + `AdminTopbar` + `LocaleSwitcher` + stub `/admin`
2. **F-UX2** — routes stub parallèles (table §3)
3. **F-UX3** — `EntitySplitPane` + `BrickForm` sur `/admin/catalog/bricks/[id]`
4. **F-UX4** — template tabs rail
5. **F-UX6** — `PublishWizard` + `IssueList` + `PublishBadge`
6. **F-UX7** — Webdesign IntegrateIntoApp + Interceptor parity

**Référence code prioritaire :** `Workspace.tsx` (sidebar) + `Editor.tsx` (topbar, split, preview) + `Fields.tsx` (forms).

---

## 8. Catalogue Lego — form map (F-UX3 étendu + CRUD)

**Aesthetic :** Atelier opérateur (pas éditorial) — fond `--bg` `#EEF3F6`, accent `--brand` `#0E7C8A`, Archivo + Space Mono, `--r: 0`. Split liste / inspecteur `Panel`+`Group` ; Create via `.modal-scrim` / `.modal` (même chrome que `NewFlowDialog`).

| Surface | Composants | CRUD |
|---------|------------|------|
| Hub `/admin/catalog` | `.pgrid` `.pcard` + `PublishBadge` + hints | — |
| Briques liste | `AdminWorkspace` + `NewBrickDialog` | Create → fiche ; Delete sur fiche |
| Briques `[id]` | `BrickEditor` 60/40 + `BrickPreviewPane` + `PublishBadge` | Update + Delete (cascade variants/deps ; seed re-seed via `ensureLegoCatalog`) |
| Scopes / Intents / Variants / Dependencies / Technologies | `CatalogSplitShell` + `CatalogTreeRow` + `CatalogInspector` + `CatalogFormGroup` + `ModeChips` + `New*Dialog` | Create + Update + Delete end-to-end |
| Form primitives | `Fields.tsx` (`Text`, `Area`, `Choice`, `IconPicker`, `Panel`, `Group`) | — |
| Dialogs Create | `NewCatalogDialogs.tsx` | POST wired |
| Client API | `catalog-entities.ts` | `fetch*` / `create*` / `patch*` / `delete*` |
| Server | `admin-catalog.ts` + routes `POST`/`DELETE` | Locked seed ids: `isLocked*` ; delete allowed, re-seed on next `ensureLegoCatalog` |

**Deferred (UX9) :** dependency graph viz, drag reorder, diff restore — not in this form map.

**Smoke :** `http://127.0.0.1:3000/admin/catalog` → chaque entité → New → Save → Delete (custom) ; seed delete disparaît puis revient après reload/`ensure`.

# Research capture — Admin CMS UI & UX

- Date : 2026-08-18
- Mode : Standard Research (4 agents, URLs vérifiées HTTP 200)
- Session LifeOS : `082ba078-2ccd-4291-b2d2-a5cf77b7b769`
- Amont : [`ADMIN-CMS.md`](./ADMIN-CMS.md) · [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md)
- Question : bon UI/UX pour `/admin` — templates, catalogue, sections ADD, flows, technos
- Objectif : spec UX actionnable ; résoudre « tout éditable » vs « admin minimal v1 »

Agents : Ava Sterling (Claude) · Alex Rivera (Gemini) · Johannes (Grok) · Ava Chen (Perplexity)

Input ISA — **LOCKED** → [`ISA-archstudio-admin-cms-ux.md`](./ISA-archstudio-admin-cms-ux.md).

| Angle | Agent |
|-------|--------|
| Canon patterns (Backstage, Sanity, Payload, arc42, IcePanel) | Ava Sterling (Claude) |
| Personas, flows écran, nav wireframe | Alex Rivera (Gemini) |
| Anti-bloat, échecs CMDB, coupe v1 | Johannes (Grok) |
| Patterns live 2024–2026 (blocks, draft/publish, i18n, preview) | Ava Chen (Perplexity) |

---

## Pourquoi

| Pourquoi vrai | Pourquoi faux |
|---------------|---------------|
| Backstage / Sanity / Payload : admin généré depuis schéma | Plus d’écrans = meilleure adoption |
| NN/g progressive disclosure | Textarea JSON = flexibilité |
| CMDB meurt de champs optionnels jamais remplis | Owner + SLO + cost = qualité |
| Preview iframe = standard headless 2024–2026 | L’opérateur n’a pas besoin de voir le rendu |
| IcePanel/Backstage : auteur template ≠ consommateur | Même UI pour tous |
| arc42 B-1 : absent > vide s’applique à l’admin | 50 champs « au cas où » |

**Admin = auteur de seed typé, pas CMDB parallèle.**

| Principe | Détail |
|----------|--------|
| Deux surfaces | `/admin` opérateur · app = fondateur (picker, jamais admin) |
| Éditeurs typés | Schéma → formulaires ; JSON en « Avancé » replié |
| Nav entity-centric | Templates · Lego · ADD · Flows |
| Preview | Split-pane catalogue + document « comme le fondateur » |
| Publish gate | Validation bloquante ; issues cliquables → champ |
| i18n | Switcher EN/FR global ; tabs inline pour labels courts |

[CONFLICT] Rich admin (8 nav, preview, graphe) vs Johannes 3 écrans v1.

**Résolution :** UX **riche par fiche entité**, nav **simple v1**. Preview = onglet template/section. Import JSON bulk en parallèle des formulaires. Graphe deps v2.

---

## Personas

| Persona | Surface | Ne voit pas |
|---------|---------|-----------|
| Opérateur solo | `/admin` | Projets users |
| Fondateur | App | Admin, publish, schéma |

Modèle : Backstage **Template Editor** (admin) vs **Scaffolder** (fondateur). Bouton **« Simuler parcours fondateur »** sur template.

---

## Nav v1

```
/admin
├── Dashboard          (issues publish uniquement)
├── Templates projet
├── Catalogue Lego     → Briques · Variants · Intents · Deps
├── Bibliothèque ADD
├── Flow patterns
├── Publish
├── Localisation       (filtre FR manquant)
└── Import / Export
```

---

## Spec UI par domaine

### Fiche brique (60/40 split)

- Header : id · Draft/Published · modif
- Métadonnées : icon · layer · scope · capabilities · concernTags[]
- Contenu EN/FR : purpose · role · features · notes · whenUse/whenNot
- Relations : variants Used-by (Payload Join pattern)
- Avancé ▾ : JSON Zod-validated
- Preview : tuile wizard + snippet glossaire
- Footer : Valider · Brouillon · Publier

### Template projet

- Onglets : Métadonnée picker · Canvas (table composants v1) · Flows · Sections · Preview
- Preview iframe document + switch EN/FR
- Import JSON Acme v1 ; formulaire pour edits incrémentaux
- [Simuler fondateur] [Publier]

### Section ADD (Payload Blocks pattern)

| type | éditeur |
|------|---------|
| cards | items icon/title/bullets |
| compare | columns + table + cards |
| timeline | items + aside |
| table | grid rows |
| text | blocks |

Panes : Form | Preview papier | JSON

v1 : éditeurs cards/text complets ; compare/timeline via import JSON ou simplifié.

### Flow pattern

Stepper vertical · hints name/tech/layers · test mapping Acme · ids locked v1.

### Publish (wizard 4 étapes)

1. Scope · 2. Validation (issues → champ) · 3. Diff résumé · 4. Confirmer

Badge : Draft | Modified | Published (Strapi pattern).

### i18n

Switcher global · tabs EN|FR labels · « Copier EN→FR » · entrée Localisation transversale.

---

## Anti-patterns

JSON textarea principal · flat list · dashboard vanity · champs owner/cost/SLO · canvas drag v1 · publish sans preview · admin = workspace fondateur · **emoji ou pictos Unicode dans l'UI admin** · **lib UI externe (shadcn, Lucide, Heroicons)** · **palette / ombres / radius « SaaS générique »** · **empty states avec illustration ou mascot** · **admin visuellement distinct de l'éditeur** (autre typo, autre couleur primaire, dark mode séparé).

---

## Identité visuelle — même chrome que l'app

**Principe :** `/admin` n'est pas un produit à part. C'est le même Atelier qu'`Editor` et `Workspace`, avec une nav orientée contenu système. L'opérateur doit reconnaître ArchStudio immédiatement — pas un panneau CMS générique.

### Réutiliser tel quel

| Couche | Source app principale |
|--------|------------------------|
| Tokens & règles | `src/app/globals.css` (`--brand`, `--panel`, `--line`, `--r: 0px`, 5 règles Atelier) |
| Typo | Archivo (prose) + Space Mono (ids, counts, timestamps, labels machine) |
| Icônes | `src/components/Icon.tsx` — stroke SVG 24×24, jamais emoji |
| Formulaires | `src/components/editors/Fields.tsx` — `.field`, `.input`, `.textarea`, `.select`, `.btn`, `IconPicker` |
| Marque | `src/components/Brand.tsx` — `Lockup` avec sous-titre « Content » ou « Admin » |
| Layout | Même shell que l'éditeur : sidebar `--sidebar`, topbar `--topbar`, panneau droit `--inspector`, fond `--bg` calque |
| Preview | iframe document existant (`PaperDocument`) — pas de mockup séparé |

### Ce qu'on n'introduit pas

- Emoji (📦 ✅ ⚠️) ni caractères Unicode décoratifs à la place d'`Icon`
- Bibliothèques UI tierces non présentes dans le repo (shadcn/ui, Radix themes, Lucide, Tailwind UI blocks)
- Esthétique « AI dashboard » : dégradés violet/bleu, glassmorphism, `rounded-xl`, ombres douces partout, cartes flottantes
- Illustrations stock, mascots, ou empty states « friendly » avec emoji
- Palette primaire différente (violet indigo, etc.) — teal `--brand` reste l'action
- Nav icon-only colorée type Notion/Linear clone

### Signaux visuels admin (dans le chrome existant)

- Sous-titre lockup : `Content` (mono, `--ink-3`) — pas un logo admin séparé
- Badge état publish : `.pill` existant — `Draft` / `Modified` / `Published` (texte, pas emoji)
- Dashboard : liste d'issues publish uniquement — pas de KPI cards colorées
- Split-pane preview : même `.panel` / `.panel-2` que l'inspecteur projet

### DoD visuel v1

Un screenshot côte à côte éditeur projet ↔ fiche brique admin : même typo, même teal, mêmes bords carrés, mêmes boutons `.btn` — seule la nav latérale diffère (entités CMS vs scopes/layers).

---

## Staged v1 / v2

| v1 | v2 |
|----|-----|
| Fiche brique complète | Graph deps |
| Template import + table | Composer drag |
| Sections cards/text + import | compare/timeline builders |
| Preview onglet | Live keystroke sync |
| Publish atomique | Diff restore |

Test v1 : `purpose.fr` Auth0 → API <2 min sans redeploy.

---

## Flows clés (wireframe)

**A — Corriger brique :** Catalogue → Briques → identity → FR → purpose → Valider → Publish(scope catalogue)

**B — Publier Acme :** Templates → Acme → Preview PDF → Publish → validation 22 comps / 4 sections / 0 `[…]`

**C — Section sur template :** Template → Sections → [+ Bibliothèque] → drawer type=cards → attach → Preview

---

## Patterns validés [HIGH]

1. **Entity-centric tabs** — Backstage catalog entity page
2. **Structure Builder sidebar** — Sanity domain-driven nav
3. **Schema-driven forms** — Payload/Strapi ; Dynamic Zones ≈ sections typées
4. **Locale switcher persistant** — Strapi i18n ; une locale à la fois pour longs textes
5. **Draft → Validate → Publish** — Sanity document actions + Strapi bulk gate
6. **Split-pane preview iframe** — Payload Live Preview + Sanity Presentation
7. **Blocks drawer** — Payload Blocks pour bibliothèque sections
8. **Used-by panel** — Payload Join pour `variant maps_to brick`
9. **Template galerie → Review** — Backstage Software Templates

---

## ISCs candidats (spec UI)

| ISC | Check |
|-----|-------|
| ISC-UX1 | Publish `purpose.fr` sans IDE ; picker <2 min |
| ISC-UX2 | Publish bloqué si orphan ref ou FR manquant |
| ISC-UX3 | Template Acme admin → PDF équivalent seed |
| ISC-UX4 | Admin inaccessible depuis app fondateur |
| ISC-UX5 | Section cards sans JSON textarea par défaut |
| ISC-UX6 | Fiche admin brique : classes `.field`/`.btn`/`.input` identiques à `Inspector` ; aucun emoji dans le DOM |
| Anti | Dashboard sans issues publish |
| Anti | Champs owner/cost/SLO |
| Anti | Lib UI externe ou palette non-ArchStudio dans `/admin` |

---

## Décisions UX proposées

| ID | Décision |
|----|----------|
| UX1 | `/admin` séparé ; fondateur exclu |
| UX2 | Nav 4 piliers + Publish + Import |
| UX3 | Typé par entité ; JSON Avancé replié |
| UX4 | Locale switcher + tabs courts |
| UX5 | Preview onglet template/section ; tuile brique |
| UX6 | Publish wizard bloquant |
| UX7 | Blocks drawer sections ; v1 cards/text |
| UX8 | Import JSON bulk template Acme |
| UX9 | Graphe, drag, diff = v2 |
| UX10 | **Même chrome que l'app** — `globals.css`, `Icon`, `Fields`, layout sidebar/inspector ; zéro design system parallèle |
| UX11 | **Pas d'emoji** nav/boutons/états ; icônes = `Icon.tsx` stroke SVG uniquement |
| UX12 | **Pas de look AI-generated** — pas de shadcn/Lucide, gradients, glass, coins arrondis 12px+, empty states illustrés |

---

## URLs vérifiées (HTTP 200, 2026-08-18)

- https://backstage.io/docs/features/software-catalog/
- https://www.sanity.io/docs/studio/structure-tool
- https://docs.strapi.io/dev-docs/plugins/i18n
- https://docs.strapi.io/cms/features/draft-and-publish
- https://payloadcms.com/docs/fields/blocks
- https://payloadcms.com/docs/live-preview/overview
- https://www.nngroup.com/articles/progressive-disclosure/
- https://faq.arc42.org/questions/B-1/
- https://docs.icepanel.io/core-features/modelling
- https://www.servicenow.com/community/developer-blog/why-cmdb-fails-even-before-discovery-is-implemented/ba-p/3464984

---

## Suite

1. ~~Input ISA `archstudio-admin-cms-ux` jumeau [`ADMIN-CMS.md`](./ADMIN-CMS.md).~~ **Done**.
2. ~~Figer UX1–UX12.~~ **Done** in ISA UX.
3. ~~Shell `/admin` layout — **next** (F-UX0 Designer brief → F-UX1).~~ **Done** — visit `/admin` ; suite F-UX3 fiche brique.

Contenu = ADMIN-CMS.md · **Comment éditer = ce doc.**

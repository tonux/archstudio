# Admin CMS — tout le contenu système éditable sans code

- Date : 2026-08-18 · updated 2026-08-20
- Session LifeOS : `082ba078-2ccd-4291-b2d2-a5cf77b7b769`
- Statut : **SHIPPED** — ISA parent + UX **complete** ([`ISA-archstudio-admin-cms.md`](./ISA-archstudio-admin-cms.md), [`ISA-archstudio-admin-cms-ux.md`](./ISA-archstudio-admin-cms-ux.md)). Index PR : [`README.md`](./README.md).
- Amont :
  - [`RESEARCH.md`](./RESEARCH.md) — kit ADD slim, gating, zéro `[…]`
  - [`RESEARCH-brick-metadata.md`](./RESEARCH-brick-metadata.md) — métadonnées catalogue → slots ADD
  - [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md) — barre qualité ; templates Acme = levier principal
  - [`../lego/GAPS.md`](../lego/GAPS.md) — admin CMS marked shipped

**Décision produit (principal, 2026-08-18) :** *« Tout le contenu doit être éditable dans admin »* — plus de PR pour une brique, une section, un flow pattern ou un template Acme.

---

## Problem

Aujourd’hui ArchStudio mélange **moteur** (placement, gating, PDF, canvas) et **contenu** (briques, templates, sections ADD, flow patterns, technos) dans le même repo TypeScript.

| Contenu | Fichier(s) actuel(s) | Conséquence |
|---------|----------------------|-------------|
| Catalogue Lego (26 briques, 154 variants, deps…) | `seed-data.ts` → SQLite (seed one-shot) | `concernTags` encore relus depuis le seed TS, pas SQLite |
| Templates architecture (6 hyperscaler) | `templates/*.ts` + registry | Nouveau template = dev + deploy |
| Template démo Acme | `seed/demo.json` + `seed.ts` | Qualité cible, mais pas extensible sans commit |
| Sections ADD preset (13 CAF) | `document/preset.ts` | Chapitre = diff code |
| Flow patterns (8 ids) | `flows/catalog.ts` | Pattern = diff code |
| Descriptions technos | SQLite + seed | Partiellement en base, authoring code-first |
| Icônes, protocoles, layers packs | docs locked + constantes | Changement = ISA + code |

Le fondateur non-tech **ne doit jamais** passer par l’admin. L’admin sert **l’équipe produit / contenu** : shipper un template « Deux plateformes », ajouter Auth0, corriger une section operations, publier un flow checkout — **sans redeploy applicatif** pour le contenu seul.

---

## Vision

Un **panneau Admin** local-first (`/admin`) : CMS du produit ArchStudio.

- **Une vérité** par entité, versionnée, brouillon → publié.
- **Tout** ce qui alimente le picker, le wizard Lego, les flow patterns, le preset ADD et les seeds exemples y est CRUD.
- Le runtime **lit** la version publiée (SQLite ou export JSON signé) ; il n’importe plus de `.ts` pour le contenu.
- Un template Acme ne se « devine » plus : on le **crée une fois** dans l’admin, le fondateur le choisit.

Euphorie : ajouter « Template marketplace B2B » un mardi après-midi, avec canvas + 4 sections + 2 flows + qualité PDF, **sans ouvrir l’IDE**.

---

## Out of Scope (admin ≠ app user)

| Hors admin | Pourquoi |
|------------|----------|
| Éditer les projets users (`projects.data`) | C’est le canvas client ; reste l’éditeur normal |
| Réécrire le moteur (gating, hydrate, `buildOutline`, placement) | Code ; consomme le contenu admin |
| Changer les **ids verrouillés** du moteur (`ConcernTag`, `TAG_TO_PRESET`, types de section) | Contrat code ; l’admin choisit *dans* l’enum |
| Billing, multi-tenant cloud, sync remote | Local-first ; export/import fichier suffit en v1 |
| Wizard besoins fondateur (ISA #4) | Produit séparé ; consomme les gates, ne les définit pas |
| Mode audit Azure complet | Overlay futur |

---

## Principles

1. **Content vs engine** — l’admin ne shippe que des données ; la logique de résolution reste typée en code.
2. **Stable ids** — renommer l’affichage OK ; `identity`, `auth-login`, `add-data` ne changent pas sans migration explicite.
3. **Absent > vide** — une section sans corps publiable n’apparaît pas (aligné [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md)).
4. **i18n obligatoire** — tout texte user-facing : `en` + `fr` (même règle que `L10n` / catalogue).
5. **Publish explicite** — brouillon éditable ; runtime ne voit que `published`.
6. **Acme-first templates** — les templates **projet** (snapshot complet) priment sur l’inférence pour le non-tech.

---

## Boundary — trois couches

```
┌─────────────────────────────────────────────────────────┐
│  ADMIN CMS (brouillon / publié)                         │
│  templates · catalogue · sections · flows · technos · …  │
└───────────────────────────┬─────────────────────────────┘
                            │ read published
┌───────────────────────────▼─────────────────────────────┐
│  MOTEUR (code)                                          │
│  instantiate · placeVariant · insertPlate · deriveGates   │
│  hydratePresetSection · buildOutline · PaperDocument    │
└───────────────────────────┬─────────────────────────────┘
                            │ read/write
┌───────────────────────────▼─────────────────────────────┐
│  INSTANCE PROJET (Architecture JSON par user)           │
│  components · flows · sections auteur · meta · …        │
└─────────────────────────────────────────────────────────┘
```

L’admin **ne touche jamais** les instances projet sauf action explicite « Dupliquer comme exemple seed » (outil interne).

---

## Inventaire — tout ce qui devient éditable

### 1. Templates projet (priorité #1 — Acme)

Snapshot **complet** prêt à instancier : équivalent de `seed/demo.json`.

| Champ admin | Source actuelle | Notes |
|-------------|-----------------|-------|
| `id`, `name`, `tagline`, `description` | meta + seed | Picker « Nouveau projet » |
| `accent`, `theme`, `icon` | theme / UI | Carte projet |
| `meta` (intro, principle, facts, kicker, title…) | demo.json | Qualité non-tech |
| `groups`, `layers` | demo.json | |
| `components[]` | demo.json | role, features, notes, tech — **sans** obligation `brick` |
| `flows[]` | demo.json | Parcours déjà liés |
| `sections[]` | demo.json | compare, operations, roadmap, risks |
| `technologies[]` | demo.json | Stack annexe |
| `ui.tabs`, `ui.views` | demo.json | Onglets viewer |
| `supportedTargets` | optionnel | Si déploiement multi-cloud plus tard |
| `whenToUse` / `whenNotToUse` | picker | Bullets marketing |
| `sortOrder`, `published`, `featured` | — | Ordre picker ; Acme en tête |

**Instanciation user :** `createProject({ templateId })` → copie profonde du snapshot publié → projet éditable normal.

**Anti-régression :** le template publié « Acme — two platforms » doit produire un PDF indiscernable du seed actuel (cf. falsifiers [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md)).

---

### 2. Templates architecture (hyperscaler — priorité #2)

Les 6 templates actuels (`serverless-mvp`, `saas-multitenant`, `rag`, …) : structure abstraite + table `cloud` par cible.

| Entité | Éditable dans admin |
|--------|---------------------|
| Métadonnée picker | id, name, tagline, intro, icon, accent, whenToUse, whenNotToUse, supportedTargets |
| `groups`, `layers` | CRUD |
| `components[]` | id, role, features, notes, tech, deps, **cloud overrides** (aws/gcp/azure/selfhosted) |
| `flows[]`, `sections[]` | idem templates projet |
| `technologies[]` | optionnel |

**Résolution à l’instanciation :** le moteur `instantiate(template, target, lang)` reste en code ; il lit le JSON admin au lieu de `import './saas-multitenant'`.

---

### 3. Catalogue Lego (priorité #2 — déjà SQLite)

Étendre le schéma existant (`src/lib/db.ts`) pour **100 % authoring admin** — fin de `seed-data.ts` comme source de vérité.

#### Déjà en SQLite (à éditer via admin)

| Table | Contenu |
|-------|---------|
| `lego_catalog_versions` | Version + statut draft/published |
| `lego_scopes` | 18 scopes EN/FR |
| `lego_scope_aliases` | core → product, etc. |
| `lego_bricks` | id, icon, layer_id, default_scope, capabilities_json |
| `lego_brick_texts` | role, responsibilities, notes (EN/FR) |
| `lego_capability_phrases` | phrase EN/FR |
| `lego_brick_scope_affinities` | brick ↔ scope |
| `lego_intents` | 12 intents + label |
| `lego_intent_modes` / `lego_intent_shapes` | modes et shapes |
| `lego_variants` | 154 variants → maps_to brick |
| `lego_technology_descriptions` | clé → description EN/FR |
| `lego_dependencies` | from, to, strength, why, protocol, kind |

#### À ajouter en SQLite (aujourd’hui seulement dans TS)

| Champ / table | Usage |
|---------------|-------|
| `lego_brick_texts.purpose` | DISTINCT de `role` si besoin ; ADD contexte / glossaire |
| `lego_brick_concern_tags` | `(catalog_version, brick_id, tag)` — **sortir** de `CATALOG_SEED.concernTags` |
| `lego_brick_metadata.when_use` / `when_not` | JSON EN/FR, max 2 bullets |
| `lego_protocols` | id, label, kind (sync/async/batch) — aujourd’hui `protocols.ts` |
| `lego_layers` | id, label EN/FR, pack (default/rag/event) — packs éditables |
| `lego_icons` | clé validée contre `Icon.tsx` — picker admin |

#### Écrans admin catalogue

1. **Versions** — liste, dupliquer, publier, rollback
2. **Scopes & aliases**
3. **Briques** — fiche : icon, layer, scope, capabilities, purpose, role, features, notes, **concernTags**, whenUse/whenNot, affinités
4. **Intents** — modes, shapes
5. **Variants** — label, intent, mode, maps_to (autocomplete briques)
6. **Dependencies** — graphe + formulaire ; validation acyclic optional
7. **Technologies** — clé normalisée + description EN/FR

---

### 4. Sections ADD (priorité #3)

Bibliothèque de chapitres réutilisables — aujourd’hui `SECTIONS[]` dans `preset.ts`.

| Champ | Description |
|-------|-------------|
| `id` | ex. `add-data`, `add-iam`, ou custom `platforms-compare` |
| `type` | `cards` \| `timeline` \| `table` \| `compare` \| `text` |
| `doc.chapter` | ex. `2.2` — ordre papier |
| `doc.gated_default` | bool — ouvre-t-on via concernTags seulement ? |
| `concern_tags[]` | tags qui **ouvrent** ce chapitre (miroir `TAG_TO_PRESET` côté contenu) |
| `title`, `subtitle`, `note` | L10n EN/FR |
| Payload typé | `items`, `rows`, `columns`, `blocks`, … selon `type` |
| `hydrator_id` | optionnel — `add-iam`, `add-data`, ou `generic-cards` |

**Deux usages :**

- **Preset pack** — les 13 CAF + sections auteur type Acme, assignables à un template projet
- **À la carte** — bouton « Ajouter section depuis bibliothèque » (Sections editor) — comportement actuel `applyDesignDocumentPreset`, alimenté par admin

**Règle qualité :** une section publiée pour gating ne doit pas contenir de `[…]` dans le corps par défaut ; sinon marquée `template_only: true` et adoptée/hydratée au gate ON (cf. ISA brick-metadata).

---

### 5. Flow patterns (priorité #4)

Aujourd’hui 8 ids locked dans [`FLOWS.md`](../lego/FLOWS.md) — l’admin les **édite**, n’en ajoute pas en v1 sans décision (extension v2).

| Champ | Description |
|-------|-------------|
| `id` | `auth-login`, `checkout`, … |
| `icon`, `name`, `tagline` | L10n |
| `steps[]` | key, title, description, **hint** (name/tech/layers/icons/avoid[]) |
| `default_protocol_suggestions` | par step pair |
| `mappable_brick` | rôle Lego attendu pour create-missing |

**Écran :** éditeur de steps ordonnés ; preview « bind sur demo Acme » ; test `countMappableSteps`.

API existante : `/api/flow-templates` — lire depuis SQLite publié au lieu de `FLOW_CATALOG` import.

---

### 6. Technologies & stack (priorité #5)

| Source | Admin |
|--------|-------|
| `lego_technology_descriptions` | CRUD clé → prose EN/FR |
| Catégories stack (`ui.stack` defaults) | Texte section stack EN/FR |
| Synonymes matching | ex. `postgres` ↔ `PostgreSQL` pour inférence future |

Les `tech[]` sur les composants restent **instance** ; l’admin propose un **vocabulaire** autocomplete.

---

### 7. Vocabulaires système (priorité #5)

| Vocabulaire | Aujourd’hui | Admin v1 |
|-------------|-------------|----------|
| `ConcernTag` | `concerns.ts` enum | **Lecture seule** ; admin assigne tags existants aux briques |
| `TAG_TO_PRESET` | code | **Lecture seule** v1 ; mapping tag → section_id en v2 |
| Icônes | `ICONS.md` + `Icon.tsx` | Picker liste blanche |
| Protocoles | `PROTOCOLS.md` | CRUD si table `lego_protocols` |
| Capabilities | `CAPABILITIES.md` | Tags libres sur brique, suggérés depuis liste |
| Cloud services | `templates/services.ts` | CRUD table `cloud_services` (role → aws/gcp/azure/selfhosted label) |

**Règle :** élargir l’enum `ConcernTag` ou ajouter un flow pattern #9 reste une **ISA + release moteur** ; l’admin configure *dans* le contrat.

---

### 8. Copy & defaults système (priorité #6)

| Clé | Usage |
|-----|-------|
| `DEFAULT_FLOW_COPY` | Premier flow manuel EN/FR |
| `STARTER_LAYERS` / groupes vides | Nouveau projet blank |
| Labels layers (`displayLayerLabel`) | Traduction id → label |
| Meta document vides | tagline placeholder |

Objet clé/valeur L10n en table `system_copy`.

---

### 9. Seeds & exemples (outil admin)

- **Publier comme template** — exporter un projet user → brouillon template projet
- **Réinitialiser exemples** — dossier « Examples » recréé depuis templates `featured`
- Pas d’édition directe du JSON projet dans l’admin (hors export/import template)

---

## Modèle de publication

```
draft (catalog_version | content_version)
  ↓ validate
  ↓ publish (atomic transaction)
published ← seul lu par API runtime / seed au boot
  ↓ optional export
content-bundle.json (backup, PR, autre machine)
```

| Règle | Détail |
|-------|--------|
| Un seul `published` actif | Par domaine : catalogue, templates, sections, flows |
| Brouillon | Copie COW du publié ; edits isolés |
| Validation publish | Schéma JSON + refs integrity + i18n complete + pas d’id orphelin |
| Rollback | Réactiver version précédente publiée |
| Projets existants | **Non migrés** — snapshot au create ; catalogue ne retro-change pas les tags déjà posés |

---

## Admin UI — structure proposée

Route racine : **`/admin`** (local-only v1 ; auth basique ou flag dev).

| Nav | Écrans |
|-----|--------|
| **Dashboard** | versions, dernier publish, compteurs, liens « test picker » |
| **Templates projet** | liste, éditeur (meta / canvas / sections / flows), preview PDF, publish |
| **Templates architecture** | idem + onglet cloud overrides |
| **Catalogue** | version, scopes, briques, intents, variants, deps, technos |
| **Sections ADD** | bibliothèque, éditeur typé par `type`, preview papier |
| **Flow patterns** | liste 8, éditeur steps + hints, test mapping |
| **Vocabulaires** | icônes, protocoles, cloud services, system copy |
| **Import / Export** | bundle JSON, diff brouillon vs publié |

**Éditeurs structurés** — pas de textarea JSON nu pour l’usage courant :

- Compare / timeline / cards / table / text = formulaires par type
- Canvas template = grille composants (nom, layer, group, role, features, tech)
- Brique = fiche unique avec onglets EN/FR

### Chrome UI — réutilisation stricte

`/admin` **n'a pas son propre design system**. Il compose les mêmes briques visuelles que l'app principale :

| Réutiliser | Fichier |
|------------|---------|
| Tokens Atelier (teal, carré, Archivo/Space Mono) | `src/app/globals.css` |
| Icônes stroke SVG | `src/components/Icon.tsx` |
| Champs formulaire | `src/components/editors/Fields.tsx` |
| Lockup + sous-titre « Content » | `src/components/Brand.tsx` |
| Shell sidebar / topbar / inspector | mêmes classes que `Editor.tsx` |

**Interdit :** emoji dans l'UI admin, bibliothèques UI externes (shadcn, Lucide), esthétique « AI dashboard » (gradients, glass, coins arrondis génériques, empty states illustrés). Détail et DoD visuel : [`RESEARCH-admin-cms-ux.md`](./RESEARCH-admin-cms-ux.md) § Identité visuelle.

---

## API runtime (remplacement progressif)

| Endpoint actuel | Source future |
|-----------------|---------------|
| `/api/lego/catalog` | SQLite `published` |
| `/api/templates` | `project_templates` + `architecture_templates` |
| `/api/flow-templates` | `flow_patterns` published |
| (interne) `presetSectionForId` | `add_sections` published |
| `ensureSeed()` | template projet `featured` published |

Feature flag `CONTENT_FROM_ADMIN=1` pour basculer source par source lors de la migration.

---

## Validation (bloquante au publish)

| Check | Exemple d’échec |
|-------|------------------|
| i18n | `title.fr` manquant |
| Ref integrity | variant `maps_to` → brique inexistante |
| Section type | compare sans `columns` |
| Flow step | `key` dupliqué |
| Icon | clé absente de `Icon.tsx` |
| Concern tag | valeur hors enum |
| Template | `components[].group` ∉ `groups` |
| Qualité gated | section `gated_default` avec `[…]` sans hydrator |
| Acme parity | template acme-v1 : 22 composants, 4 sections auteur |

---

## Migration depuis le code (ordre d’exécution)

| Phase | Action | DoD |
|-------|--------|-----|
| **M0** | Schéma SQLite étendu + import one-shot depuis TS/JSON actuels | Parité byte runtime avec flag off |
| **M1** | Admin CRUD catalogue + publish ; API catalogue ← admin | Fin `seed-data.ts` authoring ; concernTags en DB |
| **M2** | Admin templates **projet** ; Acme importé ; picker ← admin ; `ensureSeed` ← admin | Nouveau template sans code |
| **M3** | Admin sections ADD ; `preset.ts` ← admin | Chapitre CAF éditable |
| **M4** | Admin flow patterns ; catalog.ts ← admin | Hint editable |
| **M5** | Admin templates architecture + cloud_services | 6 templates migrés |
| **M6** | system_copy, vocabulaires, export bundle | Zéro contenu système dans `src/lib/**` sauf enums moteur |

---

## Lien stratégie non-tech

| Besoin fondateur | Mécanisme admin |
|------------------|-----------------|
| « Je veux un doc comme Acme » | Template projet publié |
| « J’ajoute Auth0 » | Brique/variant admin déjà à jour → wizard |
| « Mon PDF a une section operations » | Section bibliothèque incluse dans template |
| Pas de formulaire CAF | Sections gated sans `[…]` ; absent si pas de signal |

L’inférence tech → tags devient **fallback** pour projets custom sans template — pas le chemin principal.

---

## Sécurité & déploiement

| Topic | v1 |
|-------|-----|
| Auth admin | Route cachée + token local / env `ADMIN_TOKEN` |
| Multi-user | Non — single operator |
| Audit trail | `admin_audit_log` : who, what, version, timestamp |
| Remote | Export bundle ; pas de sync cloud obligatoire |

---

## ISCs candidats (à formaliser en ISA dédiée)

| ID | Probe |
|----|-------|
| ISC-A1 | Publier brouillon brique `identity` avec nouveau `purpose.fr` → API catalogue renvoie la valeur sans redeploy |
| ISC-A2 | Créer template projet depuis admin → picker affiche → `createProject` produit 22 composants |
| ISC-A3 | Éditer section `add-iam` dans admin → PDF gated Auth0 utilise le nouveau titre |
| ISC-A4 | Éditer hint step `auth` du flow `auth-login` → `countMappableSteps` mis à jour |
| ISC-A5 | Publish invalidé si variant pointe vers brique absente |
| ISC-A6 | Template Acme admin vs seed : outline slim + 4 sections auteur équivalentes |
| Anti | Admin n’expose pas `projects.data` en CRUD |
| Anti | Publish ne modifie pas rétroactivement les tags snapshottés sur composants existants |

---

## Décisions proposées

| ID | Décision |
|----|----------|
| AD1 | **Tout contenu système** passe par admin publish — objectif M6 |
| AD2 | **Templates projet** avant templates architecture (Acme first) |
| AD3 | Catalogue Lego : étendre SQLite, ne plus relire `CATALOG_SEED.concernTags` depuis TS |
| AD4 | Flow patterns : 8 ids v1 locked ; contenu éditable, pas d’ajout id sans ISA |
| AD5 | Enums moteur (`ConcernTag`, section types) restent code ; admin configure dans l’enum |
| AD6 | Un bundle export/import = unité de backup et de transfert entre machines |

---

## Suite

1. ~~**Figer** ce doc en ISA `archstudio-admin-cms` (E3).~~ **Done** → [`ISA-archstudio-admin-cms.md`](./ISA-archstudio-admin-cms.md).
2. **UX/UI** — spec écrans, flows, anti-patterns : [`RESEARCH-admin-cms-ux.md`](./RESEARCH-admin-cms-ux.md) (Standard Research, 2026-08-18).
3. **M0** — schéma + import script — seulement après ISA LOCKED.
4. Premier contenu admin = **template Acme** ([`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md)).

Ce document est le contrat CMS. Le code admin vient après.

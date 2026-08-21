# Research capture — métadonnées briques → slots ADD

- Date : 2026-08-17
- Mode : Standard Research (4 agents, URLs vérifiées HTTP 200)
- Session LifeOS : `082ba078-2ccd-4291-b2d2-a5cf77b7b769`
- Prérequis : ISA `20260817-archstudio-add-toolkit` (projection ADD slim) **complete** ; voir aussi [`RESEARCH.md`](./RESEARCH.md)
- Question : quels champs sur le catalogue `LegoBrick` alimentent les slots ADD et les gates CAF — sans encyclopédie CMDB
- Objectif produit : poser une brique → le document non-tech se remplit ; chapitres transverses **justifiés**

**État actuel code (point de départ) :** `LegoBrick` dans `src/lib/lego/types.ts` — `id`, `icon`, `layer`, `defaultScope`, `capabilities[]`, `role`, `responsibilities[]`, `notes[]`, `affinities[]`, `capabilityPhrase`. Pas de métadonnées ADD/gating/coût.

Agents :

| Angle | Agent |
|-------|--------|
| Canon field→section (arc42, C4, ISO 42010, WAF/CAF, ADR) | Ava Sterling (Claude) |
| UX progressive disclosure (IcePanel, Structurizr, Backstage, arc42) | Alex Rivera (Gemini) |
| Anti-bloat / échecs CMDB-catalogue | Johannes (Grok) |
| Patterns live cloud + FinOps + Backstage | Ava Chen (Perplexity) |

Ce fichier est une **capture de recherche**, pas un contrat LOCKED. L’ISA `brick-metadata-add-slots` devra figer le schéma et les ISCs.

---

## Verdict croisé

**Enrichir le catalogue archetype, pas le fondateur.**

La collecte de métadonnées est un **workflow de données** sur le catalogue système (seed SQLite), pas un formulaire encyclopédique à chaque drop. Les standards convergent : noyau **responsabilité + technologie + signaux de concern**, avec chapitres transverses activés par **gating**, pas par présence brute d’une brique.

| Principe | Détail |
|----------|--------|
| Catalog-time | **≥70 %** — defaults stables (Auth, DB, CDN…) |
| Placement | **≤2 questions** — exposition, gate ambigu |
| Post-placement | **≤1 nudge** — ADR si irréversible |
| Gating CAF | `concernTags[]` briques **∧** wizard projet (ISA ultérieure) |
| Document | Section **absente** > section vide (arc42 B-1) |
| FinOps MVP | **Pas de € par brique** — token `cost` pour ouvrir le chapitre seulement |

[CONFLICT] Chen/Perplexity : ~12–14 champs incluant `costClass`. Johannes/Grok : **non** au MVP (données stale, faux débats).

**Résolution :** `concernTags[]` inclut le token `cost` pour *gate* le chapitre cost management ; montants et drivers = snapshot **projet** ou mode audit.

[CONFLICT] Sterling : champ explicite `docGates[]`. Grok : **8 champs max** orientés langage métier.

**Résolution :** `concernTags[]` (enum fermé ~8–12 valeurs) **remplace** `docGates[]` — un seul levier.

---

## Pourquoi

| Pourquoi vrai | Pourquoi faux |
|---------------|----------------|
| ISA #1 a la projection ADD (contexte, flux, glossaire, ADR index) — il manque la **source** auto depuis le catalogue | 50 champs par brique ≠ outillage fondateur |
| arc42 §5 blackbox minimal = Purpose + Interfaces ; le reste est optionnel ([Tip 5-7](https://docs.arc42.org/tips/5-7/)) | CMDB enterprise (owner, SLO, cost center) = shelf-ware solo |
| ISO 42010 : concerns → viewpoints, pas checklist par entité | « Brique Auth posée → chapitre IAM rempli de boilerplate » = théâtre |
| Structurizr/IcePanel : defaults sur **archetype**, instance légère | Dupliquer dependsOn/capabilities alors que le graphe canvas les porte |
| FinOps : metadata pour **allocation**, pas billing live sur catalogue ([Allocation](https://www.finops.org/framework/capabilities/allocation/)) | €/mo par entité → débats sans action, données périmées |

Sources : [arc42 FAQ B-1](https://faq.arc42.org/questions/B-1/), [Structurizr archetypes](https://docs.structurizr.com/dsl/archetypes), [ServiceNow CMDB failure](https://www.servicenow.com/community/developer-blog/why-cmdb-fails-even-before-discovery-is-implemented/ba-p/3464984), [Nygard ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

---

## Qui — qui remplit quoi

| Acteur | Rôle | Ne fait pas |
|--------|------|-------------|
| **Mainteneur catalogue** (ArchStudio) | Rédige `purpose`, `concernTags`, `whenUse/whenNot` pour ~100 briques seed | Demander au fondateur de maintenir 27 champs |
| **Fondateur non-tech** | Drag brique, 0–2 réponses contextuelles, nomme son produit | Remplir owner, SLO, OpenAPI, cost center |
| **Canvas** | Vérité des connexions, protocoles, dépendances | Dupliquer un second CMDB parallèle |
| **Wizard projet** (ISA #4) | Concerns globaux : multi-tenant, PII, budget band | Remplacer les tags catalogue |
| **ADR** | Décisions irréversibles *dans ce projet* | Copier la fiche catalogue |

---

## Quoi — schéma catalogue recommandé

### Champs sur `LegoBrick` (à figer en ISA)

| # | Champ | Type | Sert (slot ADD) |
|---|--------|------|-----------------|
| 1 | `id` | string | existant |
| 2 | `purpose` | string 1–2 phrases | Contexte, glossaire — fusionne `role` + `capabilityPhrase` |
| 3 | `displayDescription` | string ≤120 | Contexte stakeholder (plain language) |
| 4 | `c4Kind` | enum | person \| softwareSystem \| container \| external |
| 5 | `layer` | enum | existant — regroupement arc42 §5 |
| 6 | `technology` | string | Inventaire, stack annexe |
| 7 | `defaultScope` | internal \| external | Contexte C4 boundary |
| 8 | `exposureDefault` | internal \| partner \| public | Réseau slim (override instance) |
| 9 | `dataClassDefault` | none \| internal \| personal \| regulated | Gate chapitre Data |
| 10 | `identityPatternDefault` | none \| human \| service \| federated | Gate IAM |
| 11 | `concernTags[]` | enum[] | Gates CAF (voir tableau ci-dessous) |
| 12 | `whenUse` / `whenNot` | string[] max 2 | Anti-mauvaise brique ; hint ADR |

**Valeurs `concernTags[]` proposées :** `data`, `iam`, `tenancy`, `network`, `security`, `ops`, `dr`, `observability`, `governance`, `cost`, `decision:irreversible`.

### Field → section / gate

| Signal catalogue | ADD / gate |
|------------------|------------|
| `purpose` + `displayDescription` | §1 Contexte, glossaire |
| `defaultScope` + `c4Kind` | Contexte C4 (acteurs / systèmes voisins) |
| `technology` | Inventaire, stack |
| `exposureDefault` (ou override instance) | Chapitre networking (gated) |
| `dataClassDefault` | Chapitre Data (gated) |
| `identityPatternDefault` | Chapitre IAM (gated) |
| `concernTags` inclut `tenancy` | Chapitre Tenancy (gated) |
| `concernTags` inclut `cost` | Chapitre Cost management (gated, sans € par brique) |
| `concernTags` inclut `decision:irreversible` | Suggestion index ADR (pas auto-rédaction) |
| Union `concernTags` + wizard | **Seule** source d’ouverture chapitres preset CAF |

### Couches (catalogue vs instance vs projet vs ADR)

| Couche | Contient | Exemple Postgres |
|--------|----------|-------------------|
| **Catalog brick** | purpose, concernTags defaults, technology, whenUse/whenNot | « Datastore relationnel ; tags: data, ops, dr, cost » |
| **Instance placée** | nom, exposure override, acteurs locaux, connexions | « billing-db-prod » |
| **Projet (wizard)** | multi-tenant ?, PII ?, budget band, lean/audit | Gates finaux AND avec tags |
| **ADR** | pourquoi *ce* choix *ici* | « ADR-003 : Postgres vs Dynamo pour billing » |

### Inférer du graphe (ne pas stocker sur brique)

- `capabilities[]` → arêtes labellisées canvas
- `dependsOn[]` → topologie composants + links
- `affinities[]`, `notes[]` → instance ou éditeur

### Hard « do NOT collect » (MVP)

Owner/on-call, SLO/SLA, OpenAPI, lifecycle, repo URL, montant coût / cost center par brique, DR RPO-RTO par brique, IAM policy detail (ARN, rôles), classification enterprise 27 niveaux, compliance framework par brique, champs « Backstage parity » sans consommateur, risk laundry-list sans owner.

### Référence industrie (Backstage minimal — 8 champs effectifs)

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: artist-web
  description: The place to be, for great artists
  tags: [java]
spec:
  type: website
  lifecycle: production
  owner: artist-relations-team
  system: public-websites
```

Source : [Backstage descriptor format](https://backstage.io/docs/features/software-catalog/descriptor-format)

---

## Où — dans le code ArchStudio

```
Catalogue (seed SQLite / LegoCatalogSnapshot)
  LegoBrick + concernTags, purpose, …
       ↓ lookup à la pose (maps_to)
Composant canvas (Architecture.components[])
       ↓ aggregateConcerns()
Gates dérivés (deriveGates — wizard AND tags en ISA #4)
       ↓
buildOutline() — chapitres preset CAF si gate actif
       ↓
PaperDocument — slots contexte/glossaire enrichis depuis purpose catalog
```

**Hors scope document :** billing live, FOCUS export, CMDB sync.

**Alignement RESEARCH.md §147–162 :** les 8 accroches d’origine (job métier, acteurs, data, exposition, identité, coût, when/when-not, ADR) mappent 1:1 sur le schéma ci-dessus.

---

## Comment — UX progressive disclosure

### Parcours fondateur [HIGH]

```
Drag brique → nom auto → defaults silencieux (catalog)
           → (0–2) questions si ambigu (exposition, PII ?)
           → PDF slim mis à jour
           → (optionnel) nudge ADR si decision:irreversible
```

### Split catalog-time vs placement-time

| Accroche | Catalog | Placement | Post-placement |
|----------|---------|-----------|----------------|
| Job métier | default `purpose` | override optionnel | — |
| Acteurs / vendor | vendor + acteurs typiques | chips acteurs produit | — |
| Famille données | `dataClassDefault` | « Données perso ? » si ambigu | gate Data |
| Exposition | — | **obligatoire** public/interne/privé | — |
| Identité / secrets | `identityPatternDefault` | si non-Auth près user-facing | — |
| Coût | tag `cost` seulement | — | snapshot projet plus tard |
| When/when-not | `whenUse/whenNot` | réponses bool gates | — |
| Décision irréversible | tag `decision:irreversible` | — | nudge ADR 3 champs |

**Tolérance [MED] :** 0 question si defaults bons (CDN, cache) ; 1–2 au drop ; 3–5 max par session cadrage (8–12 briques).

### Cinq patterns produit

| Pattern | Source | ArchStudio |
|---------|--------|------------|
| Drop-first + panneau optionnel | IcePanel | Canvas d’abord ; PDF = vue |
| Archetype + instance légère | Structurizr | Catalogue = archetype |
| Overlays concern | IcePanel tags / Structurizr perspectives | concernTags → gates |
| Micro-nudge 1 question | Backstage dependencies + NN/g | 1 gate = 1 chip |
| Depth modes lean/audit | arc42 + Azure CAF | Wizard futur ; pas le chemin fondateur |

### Règle anti-fausse complétude [HIGH]

Un slot ADD ne s’ouvre que si **(a)** signal explicite (tag + composant posé) **et (b)** contenu généré cite une phrase catalogue ou réponse utilisateur — sinon **absent**, pas `[TODO]`.

Gate ON : `(wizard concern OR user YES) AND brick emits tag` (wizard = ISA #4 ; sans wizard : tags seuls en mode lean).

### Anti-patterns UX

Wizard 12 headings TODO ; formulaire 50 champs ; chapitres CAF ouverts par simple présence brique ; FinOps € par entité ; questions techniques au drop (RLS, schema-per-tenant) ; re-demander au catalog à chaque drop.

---

## Gating — exemples concern → chapitre CAF

| Question (langage fondateur) | Chapitre gated |
|------------------------------|----------------|
| Plusieurs clients / orgs isolées ? | Tenancy |
| Données perso / santé / paiement ? | Data |
| Exposé sur Internet ? | Networking |
| Login / comptes utilisateurs ? | IAM |
| Perte de données = catastrophe ? | DR (opt-in) |
| Usage variable / budget serré ? | Cost management (détail) |

Inspirations : [Azure WAF Security checklist](https://learn.microsoft.com/en-us/azure/well-architected/security/checklist) (SE:03 classification → SE:07 encryption), [Azure CAF enforce](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/govern/enforce-cloud-governance-policies).

---

## Failure modes + falsifiers

| Mode d’échec | Signal | Falsifier |
|--------------|--------|-----------|
| Shelf-ware encyclopédique | >50 % champs vides après 30 j | ≥80 % instances avec purpose + tags sans rappel |
| Fausses sections CAF | Chapitres ouverts sans concern matching | 100 % gates traçables tag + composant posé |
| Catalogue ≠ canvas | Deux vérités YAML vs diagramme | Une source : graphe projet |
| FinOps rabbit hole | Support « pourquoi €X sur cette brique » | Zéro champ coût instance MVP |
| ADR inflation | 1 ADR auto par brique | ADR si whenNot violé ou tag irreversible + nudge accepté |
| Glossaire générique | Termes REST/HTTPS | Termes = noms purpose + acteurs produit |

---

## Conséquence implémentation — scope ISA #2

### In scope

1. Étendre `LegoBrick` + migration seed pour **~20 briques pilotes** (auth, db, api gateway, cdn, workers, messaging, llm, ops…)
2. `aggregateConcerns(architecture)` — union concernTags des briques posées (via `maps_to` / variant)
3. `deriveGates(concerns, wizard?)` — sans wizard : tags seuls ; avec wizard : AND
4. `buildOutline` — injecter chapitres preset CAF seulement si gate actif
5. Enrichir projection contexte/glossaire depuis `purpose` catalog (pas seulement `component.role`)

### Out of scope (ISAs suivantes)

- Wizard besoins 4 questions (ISA #4)
- FinOps montants / FOCUS billing
- Éditeur ADR UI
- Templates produit website/mobile (ISA #3)
- ~100 flows gold (~20 seulement)
- Édition catalogue par l’utilisateur final

### ISCs candidats (à formaliser en ISA)

| ID | Check |
|----|-------|
| ISC-B1 | `LegoBrick` expose `purpose`, `concernTags[]` ; seed ≥1 brique auth avec `{iam, security}` |
| ISC-B2 | Placer Auth0 + Postgres → `aggregateConcerns` contient `iam`, `data` |
| ISC-B3 | Gate `iam` ON → chapitre preset IAM dans outline ; OFF → absent |
| ISC-B4 | Contexte ADD inclut phrase `purpose` catalog pour composant lié |
| ISC-B5 | Anti : pas de champ coût € sur `LegoBrick` |
| ISC-B6 | Chapitre CAF absent si tag seul sans composant posé |

---

## Notes par agent

### Sterling (Claude) — canon field→section

- Blackbox arc42 minimal = Purpose + Interfaces ; §8 « DO NOT cover all topics ».
- C4 : name, type, technology, description par élément.
- ISO 42010 : concerns → viewpoints, pas champs obligatoires par composant.
- Proposition 12 champs incluant `docGates[]` — **résolu** en `concernTags[]` unique.
- Interfaces = **edges** canvas, pas capabilities[] catalogue.
- ADR : technology choice, identity, regulated data, tenancy, public exposure — pas paramètres réversibles.

### Rivera (Gemini) — personas / UX

- IcePanel : drop → nom + description ; tags Risk/Cost/Security en overlay.
- Structurizr : archetypes portent defaults ; instance = placement.
- Backstage : champs conditionnels `dependencies` — 1 question = 1 concern.
- arc42 B-1 + canvas 1 page : ne pas remplir tout ; compartiment vide = absent.
- NN/g : progressive disclosure ≤2 niveaux ; staged disclosure seulement pour ADR court.
- Recommandation **B + A + D** : catalog defaults + drop-first + micro-nudge.

### Johannes (Grok) — anti-bloat

- CMDB / catalogue enterprise échoue : scope « tout modéliser », champs optionnels jamais remplis, pas de consommateur 60 s.
- Backstage adoption : mode « trop épais » (27 champs) → abandon ; cost per service **retiré** (stale).
- **8 champs max** ranked : jobMetier, displayDescription, actors, concernTags, whenUse/whenNot, dataClass, exposure, vendorOrSystem.
- FinOps sur briques MVP : **non** — snapshot projet.
- Gating : wizard + concernTags ; pas logique lourde par brique.
- Split catalogue / archétype / instance / wizard explicite.

### Chen (Perplexity) — patterns live 2024–2026

- Convergence [HIGH] : ownership, environment, classification, cost allocation — Backstage + Azure CAF tagging + AWS PG + FinOps.
- Azure CAF 5 catégories tags : functional, classification, accounting, purpose, ownership.
- AWS TagOptions : taxonomie contrôlée à la provision.
- WAF = checklists par service, pas schéma JSON — ArchStudio **projette** catalogue → checklists (Azure WAF service guides).
- FinOps : dedicated vs shared cost ; metadata allocation sans billing live.
- arc42 site = 12 sections ; pas de page « v9 » distincte vérifiée → **[MED]** sur numéro version.

---

## URLs vérifiées (HTTP 200, 2026-08-17)

### arc42 / C4 / ADR

- https://faq.arc42.org/questions/B-1/
- https://docs.arc42.org/section-3/
- https://docs.arc42.org/section-5/
- https://docs.arc42.org/section-8/
- https://docs.arc42.org/section-9/
- https://docs.arc42.org/tips/5-7/
- https://docs.arc42.org/tips/8-10/
- https://docs.arc42.org/home/
- https://c4model.com/diagrams/system-context
- https://c4model.com/diagrams/notation
- https://c4model.com/faq
- https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- https://martinfowler.com/bliki/ArchitectureDecisionRecord.html

### UX / catalogues

- https://docs.icepanel.io/core-features/modelling
- https://docs.icepanel.io/visual-storytelling/perspective-tags
- https://docs.icepanel.io/getting-started
- https://docs.structurizr.com/dsl/archetypes
- https://docs.structurizr.com/ui/diagrams/perspectives
- https://backstage.io/docs/features/software-catalog/descriptor-format
- https://backstage.io/docs/features/software-templates/input-examples/
- https://canvas.arc42.org/
- https://www.nngroup.com/articles/progressive-disclosure/

### Cloud / FinOps / anti-patterns

- https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-tagging
- https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas
- https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/govern/enforce-cloud-governance-policies
- https://learn.microsoft.com/en-us/azure/well-architected/security/checklist
- https://learn.microsoft.com/en-us/azure/well-architected/service-guides/
- https://docs.aws.amazon.com/prescriptive-guidance/latest/tagging-best-practices/introduction.html
- https://docs.aws.amazon.com/servicecatalog/latest/adminguide/tagoptions.html
- https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html
- https://docs.cloud.google.com/architecture/framework
- https://docs.cloud.google.com/architecture/framework/security
- https://www.finops.org/framework/capabilities/allocation/
- https://www.finops.org/framework/domains/
- https://focus.finops.org/
- https://www.servicenow.com/community/developer-blog/why-cmdb-fails-even-before-discovery-is-implemented/ba-p/3464984
- https://harmony.io/insights/what-is-a-cmdb
- https://www.devopsness.com/blog/backstage-adoption-from-demo-to-80-service-coverage-in-6-months-2026-04-23
- https://muhammadamal.my.id/blog/service-catalog-backstage-design/

---

## Suite produit

1. **Ce doc** = input Decision log pour ISA `brick-metadata-add-slots`.
2. Scaffolder ISA avec Goal « catalog metadata drives gated CAF slots + enriched context/glossary ».
3. Implémenter schéma + ~20 briques pilotes + `aggregateConcerns` / `deriveGates` / extension `buildOutline`. *(fait — ISA complete)*
4. **Qualité Acme** — [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md).
5. **Admin CMS** — authoring sans PR : [`ADMIN-CMS.md`](./ADMIN-CMS.md).
6. Ensuite : wizard besoins (ISA #4), éditeur ADR (dette ISA #1).

**Lien amont :** [`RESEARCH.md`](./RESEARCH.md) §147–162 avait esquissé les 8 accroches ; cette recherche les **fige** en schéma catalogue + UX + anti-patterns.

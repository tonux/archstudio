# Research capture — élargir l’ADD

- Date : 2026-08-17
- Mode : Standard Research (4 agents, URLs vérifiées HTTP 200)
- Session LifeOS : `082ba078-2ccd-4291-b2d2-a5cf77b7b769`
- Question : quoi / qui / comment / où / pourquoi élargir l’Architecture Design Document, avant de collecter les données de briques
- Objectif produit : donner aux users tous les outils nécessaires (non-tech friendly)

Agents :

| Angle | Agent |
|-------|--------|
| Canon sections (arc42, C4, 42010, CAF, ADR) | Ava Sterling (Claude) |
| Personas + UX progressive | Alex Rivera (Gemini) |
| Anti-bloat / ADR vs tome | Johannes (Grok) |
| Templates live 2024–2026 | Ava Chen (Perplexity) |

Ce fichier est une **capture de recherche**, pas un contrat LOCKED. Une Decision ISA devra figer le sommaire slim.

---

## Verdict croisé

**Élargir le kit d’outils, pas le PDF par défaut.**

Ajouter des chapitres `[…]` à l’ADD imprimable n’équipe pas l’utilisateur. Ça crée du théâtre de complétude. « Tous les outils » = un **modèle** (canvas / C4) + des **vues** par audience + un **journal de décisions (ADR)** à côté.

[CONFLICT] Sterling : ajouter des sections (glossaire, contraintes, stratégie, déploiement, risques, index ADR) **avant** les métadonnées de briques. Johannes : **ne pas gonfler** le document 13 chapitres.

**Résolution :** on ajoute des *mécanismes* (gating, C4 L1 dans le corps, index ADR, glossaire auto, zéro placeholder TODO). On n’affiche pas 12 tiroirs arc42 remplis de cases vides.

---

## Pourquoi

| Pourquoi vrai | Pourquoi faux |
|---------------|----------------|
| Un AD sans stakeholders / concerns n’est pas un AD (ISO 42010) | Plus de cases vides ≠ plus d’outils |
| Sans C4 Context le non-tech n’a rien à lire | Un 14ᵉ chapitre cloud n’aide pas à collecter des briques |
| Sans ADR les chapitres CAF n’ont pas de « pourquoi » | arc42 FAQ B-1 : ne remplissez pas tout |
| Nygard : les gros documents ne sont ni lus ni tenus à jour | L’instinct « le doc n’est pas ouvert → ajouter du détail » empire l’adoption gap |

Sources : [arc42 FAQ B-1](https://faq.arc42.org/questions/B-1/), [Nygard ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), [C4 system context](https://c4model.com/diagrams/system-context).

---

## Qui — sept audiences, sept vues

| Audience | Besoin réel | Ignore |
|----------|-------------|--------|
| Fondateur | 1 page : valeur, coût, risque, go/no-go | Conteneurs, IAM, séquences |
| PM / PO | 3–5 buts qualité, contraintes, trade-offs roadmap | Niveau composant / code |
| Stakeholder non-tech | C4 Context : qui utilise, systèmes voisins | Protocoles, stack |
| Ingénieur | C4 Container, ADR, transverses | Résumé exec |
| Ops / SRE | Déploiement, obs, failover | Logique métier interne |
| Sécurité / auditeur | Vue sécu, décisions + rationale, omissions **justifiées** | Glossaire « fun » |
| Finance | TCO / ordre de grandeur, impact $ des décisions | UML / C3 |

Une seule vérité modèle, plusieurs vues — pas un PDF unique. (Rivera / IcePanel / Structurizr)

---

## Quoi — keep / add / demote

### Garder

Les 13 chapitres preset actuels correspondent aux **8 design areas CAF** (transverses, pas le TOC principal) :

objectifs/scope, data, scale, tenancy, DR, observability, resource segmentation, IAM, networking, cost management, governance, CI/CD, monthly cost estimate.

Plus le généré : intro, schéma, inventaire, flows, stack.

### Ajouter comme outils (défaut slim)

| Quoi | Où | Comment |
|------|-----|---------|
| Stakeholders + comment lire | §0 | Chips d’audience |
| Contraintes (réglementaire, orga, budget) | près des objectifs | Wizard besoins |
| C4 Context (acteurs + systèmes autour) | **corps** parties 1–2 | Généré depuis groupes / vendors |
| Stratégie (3–7 idées) | après contexte | 1 page, template produit |
| 3–5 parcours clés | **corps**, pas seulement annexe 6 | Promouvoir les flows |
| Index ADR | journal, pas un pavé | Title, Context, Decision, Consequences, Status |
| Glossaire termes **du produit** | fin | Auto depuis briques posées |
| Risques (1 page, owner) | opt-in | Pas une laundry-list |

arc42 §5 Building Block View est la seule section que la doc officielle qualifie de mandatory pour *toute* doc d’architecture. C4 : Context + Container suffisent pour la plupart des équipes.

### Ne pas ajouter au défaut

- Placeholders `[TODO]` / « à remplir plus tard »
- C4 Component / Code (et Container sauf besoin d’implémentation)
- Corpus ADR embarqué dans le tome (1 décision ≠ encyclopédie)
- 44 patterns Azure, threat model complet, ERD
- Estimation € comme chapitre pair des 12 autres (snapshot daté sous cost management)
- Sustainability comme chapitre 14 par défaut
- Glossaire de termes internet communs (REST, HTTPS)

### Mode audit (Azure design specification) — pas le chemin non-tech

Quand l’état du document est « Approved », Azure attend en plus : technical spec, DR plans, security/compliance, métadonnées State / work item / key individuals. Gater derrière un mode audit, pas le wizard fondateur.

---

## Où — dans l’ADD vs à côté

```
ADD imprimé slim
  Buts · Contexte C4 · Schéma/inventaire · 1–3 parcours · Index ADR · Glossaire

Transverses gated (les 13 CAF)
  Data, tenancy, obs, CI/CD… seulement si brique / template / concern le justifie
  Lean : caché. Audit : « omis — raison »

Hors ADD (outils distincts)
  Log ADR append-only (près du projet / git)
  Fiche 3–5 buts qualité
  Collecte fiches briques (workflow données, pas un chapitre)
  Overlay sécu / coût (tags, pas wiki parallèle)
```

Industry 2024–2026 : **pas d’ADD unique obligatoire**. Trois familles :

1. **arc42** — 12 sections **toutes optionnelles** (v9.0, juillet 2025)
2. **Hyperscalers** — spec + ADR (contexte / décision / conséquences) + piliers WAF
3. **C4 + ThoughtWorks** — diagrammes L1–L2 + ADR légers, pas de document-monolithe

AWS minimum ADR : context, decision, consequences. MADR 4.0.0 (2024-09-17) : beaucoup de champs explicitement optional.

---

## Comment — UX

1. Canvas / C4 L1 **d’abord**, texte ensuite (IcePanel, arc42 canvas 1 page).
2. Gating par concern : « plusieurs clients » → tenancy ; « données perso » → privacy ; sinon caché.
3. Auto-remplir depuis le modèle ; l’humain complète 1–3 champs.
4. Zéro `[TODO]` affiché. Compartiment vide = absent.
5. Vues rôle, pas un PDF unique.
6. ADR : draft OK ; accept = humain + alternatives + conséquences +/− + statut Proposed/Accepted/Superseded. Append-only.
7. Maturité : MVP = overview + context + ADRs ; prod = + blocs + déploiement ; complexe = full.

Anti-pattern : wizard qui dump 12 headings TODO.

Parcours : **diagramme d’abord** (greenfield). Exception auditeur : skeleton formel avec N/A justifié, pas des pages blanches.

---

## Conséquence pour les données de briques (plus tard)

Ne pas collecter 50 champs encyclopédie. Accroches vers les slots ci-dessus :

| Champ brique | Sert |
|--------------|------|
| Job métier (1 phrase) | Buts / glossaire |
| Acteurs / vendor | Contexte C4 |
| Famille de données | Data gated |
| Exposition public/privé | Réseau slim |
| Identité / secrets | IAM gated |
| Classe de coût + drivers | Estimation / FinOps |
| Quand / quand pas | Gates |
| Décision irréversible | **ADR**, pas un paragraphe ADD |

La collecte de briques est un **workflow de données**. L’élargissement ADD ne la remplace pas.

---

## Notes par agent

### Sterling (Claude) — canon

- Complet-mais-utilisable ≠ tout remplir.
- Outline recommandé type arc42 0–12 + annexes ; CAF dans §8.
- Ajouter avant bricks : §0 stakeholders, §2 constraints, §4 strategy, §7 deployment, §9 ADR index, §11 risks, §12 glossary.
- Promouvoir diagramme L1 dans §3, L2 dans §5 ; 3–5 flows dans §6.
- Demote monthly cost en snapshot ; tech stack reste annexe.
- C4 L3/L4 hors ADD imprimable.

### Rivera (Gemini) — personas / UX

- Personne ne « lit l’ADD » : sept questions, sept vues.
- IcePanel / Structurizr : un modèle, overlays (Risk / Cost / Security), docs sur l’objet.
- arc42 : ordre de **création** libre ; souvent §3 contexte d’abord ; canvas avant le template.
- Start = canvas/C1 ; chapitres gated ; skeleton depuis le graphe ; filtre rôle ; mode audit vs lean.

### Johannes (Grok) — contra

- Expansion du tome = mauvais levier pour « outiller » la collecte de briques.
- ADR ≠ ADD. Les coller dans le tome les tue.
- Pour non-tech, seul C4 Context est un outil dans le document.
- Exclure TODO, C4 Component/Code, transverses IAM dans le défaut, laundry-list risques sans owner.
- ADD mince lu en une heure ; le reste en liens.

### Chen (Perplexity) — templates live

- arc42 v9.0 (juil. 2025) : 12 optional ; quality goals essential en pratique.
- Azure : architecture design specification (2024) **et** ADR (page 2026-04-10) distincts.
- AWS : pas d’ADD 12 chapitres ; ADR process.
- GCP : ADR outline 2024 + template solution WAF (skills) avec sustainability.
- ThoughtWorks Radar : lightweight ADR (Adopt 2018, plus sur l’édition courante) — toujours le pattern.
- Open-source : Nygard 5 champs ; MADR 4.0.0 ; Y-Statement ; ISO 42010 companion sur adr.zone.

---

## URLs vérifiées (HTTP 200, 2026-08-17)

- https://arc42.org/overview
- https://canvas.arc42.org/
- https://faq.arc42.org/questions/B-1/
- https://faq.arc42.org/questions/B-16/
- https://docs.arc42.org/section-1/
- https://docs.arc42.org/section-5/
- https://www.innoq.com/en/blog/2022/08/brief-introduction-to-arc42/
- https://c4model.com/diagrams
- https://c4model.com/diagrams/system-context
- https://c4model.com/faq
- https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- https://martinfowler.com/bliki/ArchitectureDecisionRecord.html
- https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas
- https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record
- https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-design-specification
- https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html
- https://cloud.google.com/architecture/architecture-decision-records
- https://docs.icepanel.io/getting-started

Exclues / déclassées par les agents : URLs 403, pages SEO commerciales « ADR 2026 », stats blogs non primaires.

---

## Suite produit

1. Figer en Decision le **sommaire slim + gated + ADR** (ce doc = input, pas LOCKED).
2. Ensuite seulement : contrat de données brique aligné sur les accroches.
3. Templates produit (site web, app mobile) remplissent le slim, pas le mode audit.
4. **Barre de qualité** — [`CONTRAT-qualite-acme.md`](./CONTRAT-qualite-acme.md).
5. **Admin CMS** — tout le contenu système éditable sans code : [`ADMIN-CMS.md`](./ADMIN-CMS.md).

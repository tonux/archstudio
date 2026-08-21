# Contrat qualité ADD — barre Acme

- Date : 2026-08-18
- Session LifeOS : `082ba078-2ccd-4291-b2d2-a5cf77b7b769`
- Statut : **LOCKED** — qualité publish référencée par [`ISA-archstudio-admin-cms.md`](./ISA-archstudio-admin-cms.md) ISC-Q1–Q3
- Amont : [`RESEARCH.md`](./RESEARCH.md) (kit slim, zéro théâtre `[…]`) · [`RESEARCH-brick-metadata.md`](./RESEARCH-brick-metadata.md) (gating par `concernTags`) · ISA `20260817-archstudio-brick-metadata` **complete**
- Objectif principal (verbatim) : *« Même si c'est écrit j'aimerai que l'objectif qu'on [ait] quelque chose de cette qualité tout soit remplit »*

Acme (`src/lib/seed/demo.json`, projet seed « Acme — two platforms ») n’est **pas** un cas à ignorer parce qu’il est déjà rédigé. C’est la **barre de qualité** : un ADD qu’on peut imprimer et lire. Tout chemin (catalogue Lego, import, architecture tapée à la main) doit viser cette densité, pas un classeur CAF troué.

---

## Ce que « qualité Acme » veut dire

Acme n’est pas « 13 chapitres CAF + une intro ». C’est un dossier **lu en une heure**, dont chaque page ouverte contient des faits du canvas.

### Anatomie du seed (vérité mesurée)

| Couche | Ce qu’Acme a vraiment | Qualité |
|--------|------------------------|---------|
| Méta | `intro`, `principle`, facts, kicker, title | Phrase de thèse, pas un titre vide |
| Canvas | 22 composants, chacun avec `role` + `features[]` (+ parfois `notes`) + `tech[]` | Carte produit, pas un cube anonyme |
| Slim généré | Contexte, inventaire, 2 flux, glossaire, stack | Déjà là via le toolkit |
| Éditorial auteur | 4 sections : compare plateformes, operations (cartes), roadmap 12 semaines, risques | Prose réelle, puces concrètes, noms de technos en gras |
| CAF gated | **0** — aucun `brick` / `concernTags` | Le seed n’emprunte pas le chemin Lego |

Exemple densité (operations) — c’est le plancher, pas le plafond :

- **Hosting & containers** — VMs dédiées, Docker sur chaque service applicatif, volumes persistants pour bases et cache.
- **Authentication & API** — OAuth2 / JWT, rotation des clés, MFA optionnel, rate limit, signatures webhook, CORS strict.
- **Data & compliance** — chiffrement repos/transit, masquage PII dans les logs, secrets via env, audit logs.
- **Observability & SRE** — logs centralisés, `traceId`, latence / error rate / profondeur de file, alerting SLA.

Une carte Acme = **titre métier + 2–4 puces qui citent le canvas**. Pas « Composants concernés » suivi d’une liste à plat. Pas `[…]`. Pas « À estimer ».

### Ce que « tout soit rempli » veut dire

**Rempli** = chaque chapitre **présent** dans le PDF a un corps utilisable, composé depuis des faits déjà sur le canvas (nom, rôle/purpose, features, notes, tech, liens, groupes).

**Rempli n’est pas** :

- ouvrir les 13 tiroirs CAF par défaut ;
- inventer une roadmap 12 semaines, une équipe N2, ou des risques RH que le diagramme ne porte pas ;
- coller le template CAF et laisser des trous « à compléter plus tard » ;
- écraser une section déjà écrite (les 4 chapitres Acme restent l’œuvre de l’auteur).

Aligné sur [`RESEARCH.md`](./RESEARCH.md) : *section absente > section vide* (arc42 FAQ B-1). Le théâtre de complétude est un échec, pas un objectif.

---

## Écart actuel (pourquoi Acme « écrit » ne prouve pas le produit)

Le chemin Lego (ISA brick-metadata) marche **seulement** si le composant a `brick` ou `concernTags`. Acme n’en a aucun : `role` est de la prose (« Transactional store of the consumer platform. »), `tech` est du produit (`PostgreSQL`, `Traefik`, `GitHub Actions`).

Conséquence :

| Chemin | PDF aujourd’hui |
|--------|-----------------|
| Acme seed, tel quel | Slim + 4 sections auteur. Qualité haute. **0** chapitre CAF, alors que le canvas *justifie* data, IAM/OAuth, réseau, obs, CI/CD. |
| Pose Lego (Auth0, Postgres) | Chapitres gated hydratés. Souvent une carte fourre-tout « Composants concernés », ou un tableau Data avec « À estimer ». En-dessous de la barre. |
| Projet tapé à la main (comme Acme) | Même aveuglement que le seed : pas de tags → pas de gates → CAF absent, même si PostgreSQL et OAuth2 sont écrits sur les cartes. |

Le produit vend « pose le diagramme → le document se remplit ». Tant qu’un Acme écrit ne déclenche pas des chapitres **justifiés et remplis**, l’objectif n’est pas tenu — *même si* le seed est déjà beau.

---

## Barre d’acceptation (à figer en ISC)

Un ADD atteint la barre Acme quand **toutes** les conditions suivantes sont vraies.

### B1 — Pas de trou affiché

Aucun chapitre persisté (gated ou auteur) ne contient `[…]`, « À estimer », « To be estimated », ni un paragraphe template dont le lecteur voit qu’il n’a pas été écrit.

### B2 — Densité carte = Acme operations

Un chapitre gated de type cartes n’est **pas** un dump unique « Composants concernés ». C’est **une carte par composant concerné** (ou par famille clairement nommée), avec :

1. le **nom** du composant comme titre ;
2. le `role` / `purpose` **auteur** en première puce (la prose Acme gagne sur la phrase catalogue générique) ;
3. les `features[]` et `notes[]` déjà sur la carte ;
4. une ligne technologies si `tech[]` n’est pas vide.

S’il n’y a rien de tout ça, le chapitre **n’existe pas** — on n’ouvre pas une coquille.

### B3 — Data = les stores du canvas, pas une famille fantôme

Le chapitre Data, s’il s’ouvre, a **une ligne par store réellement présent** (les deux PostgreSQL Acme restent deux lignes : consumer vs business). La colonne volume/croissance n’invente pas un chiffre : elle reprend une note, sinon les technos. Pas de « À estimer ».

### B4 — L’écrit compte autant que le Lego

Un composant **sans** `brick` ouvre quand même les gates **justifiées** par ce qui est déjà écrit (`tech[]`, nom, éventuellement couche). Exemples Acme attendus après inférence *conservatrice* :

| Composant | Signal | Brique / tags | Ne pas faire |
|-----------|--------|----------------|--------------|
| PostgreSQL — consumer/business | tech `PostgreSQL`, layer `data` | `sql` → `data`, `dr` | Fusionner les deux bases |
| Redis — cache & queues | tech `Redis`, layer `data` | `cache` → `data` | — |
| Object storage | tech `S3-compatible`, layer `data` | `objects` → `data` | — |
| Reverse proxy | tech `Traefik` | `apiGateway` → `network`, `security` | En faire un IdP |
| CI / CD | tech `GitHub Actions` | `cicd` → `ops` | — |
| Observability | tech `Loki`, `Prometheus` | `observability` | — |
| Consumer mobile | tech `React Native` | `mobileApp` → `network` | — |
| Business portal | tech `Next.js` | `webApp` → `network` | — |
| Headless CMS | tech `Directus` + `PostgreSQL`, layer **services** | **pas** `sql` | Voler la brique « base » à un back-office |
| Public API | tech `OAuth2` | tag `iam` **sans** changer la brique | Inventer un Auth0 absent du canvas |
| CRM, payments, maps, warehouse | pas de variant catalogue | aucun tag inventé | Forcer un chapitre |

### B5 — L’auteur reste l’auteur

`normalize` / sync gated :

- n’écrase **jamais** `role`, `features`, `notes` déjà remplis ;
- ne pose `purpose` catalogue que si `purpose` **et** `role` sont vides (sinon la phrase générique masquerait la prose Acme) ;
- n’adopte pas une section auteur (`platforms`, `operations`, `roadmap`, `risks`) comme chapitre gated ;
- au save, ne ré-hydrate pas un chapitre gated que l’humain a édité.

### B6 — Slim toujours là, CAF seulement justifié

Le défaut imprimable reste le kit slim (contexte, schéma, inventaire, parcours, glossaire, stack). Les chapitres CAF s’ajoutent **uniquement** si B4 a un signal **et** B2/B3 peuvent produire un corps. Acme après contrat : 4 sections auteur **plus** data / réseau / IAM (OAuth2 + bordure) / obs / CI-CD **remplis depuis les cartes existantes**, pas un second operations fantôme vide.

---

## Interdit (anti-vision)

| Interdit | Pourquoi |
|----------|----------|
| Dump des 13 CAF vides ou semi-vides | [`RESEARCH.md`](./RESEARCH.md) — théâtre de complétude |
| Inventer roadmap, staffing, risques RH, enveloppe € | Le canvas Acme le fait *parce que c’est un seed démo* ; un projet réel n’a pas ces faits |
| Inférer `sql` dès que `PostgreSQL` apparaît sur un CMS / API | Fausse brique, faux chapitre, prose catalogue à la place du métier |
| Inférer `identity` depuis `JWT` sur une API publique | L’API n’est pas l’IdP ; Acme n’a pas de composant Auth0 |
| Remplacer operations auteur par un `add-iam` template Human/Machine/Secrets | On empile, on n’écrase pas |
| Remplir un trou par « TBD » localisé | Même échec que `[…]` |
| Wizard besoins, templates produit, éditeur ADR, € / brique | ISA #3 / #4 / dette — hors de **ce** contrat |

---

## Décisions proposées (à LOCKED en ISA, pas encore code)

| ID | Décision | Défaut raisonné |
|----|----------|-----------------|
| D1 | Inférer `brick` + `concernTags` depuis `tech[]` et le nom, via les **labels de variants** du catalogue, seulement si `brick` est absent | Oui — c’est le seul levier pour les architectures « écrites » |
| D2 | Garde-fou couche : une brique dont le catalogue vit en `data` ne s’infère que si le composant est en layer `data` | Oui — protège le CMS Acme |
| D3 | Tags extra **sans** changer la brique : `OAuth2` / `OIDC` / `SAML` → `iam` | Oui — Public API Acme ouvre IAM avec *sa* prose |
| D4 | Corps gated = cartes (ou lignes) **par composant**, densité operations Acme | Oui — abandon du dump « Composants concernés » et des hydrators CAF troués comme chemin par défaut |
| D5 | Intro / principle : ne pas générer de fiction. Si vides, on peut *au plus* une phrase de constat (N composants, M scopes) — pas une thèse produit | Conservateur — Acme a déjà les siens |
| D6 | Roadmap / risques / compare plateformes : **jamais** auto-générés dans cette ISA | Hors faits canvas ; restent sections auteur ou templates produit (ISA #3) |

---

## Falsifiers (ce qui prouverait que le contrat a échoué)

1. Après `normalize` du `demo.json`, le PDF **perd** platforms / operations / roadmap / risks, ou leur titre/corps a changé.
2. Après `normalize` du `demo.json`, un chapitre gated contient `[…]` ou « À estimer ».
3. Le CMS Acme (`Directus` + `PostgreSQL`, layer services) a `brick === 'sql'`.
4. Un projet Auth0-only (déjà gated IAM) régresse : trou `[…]` ou carte fourre-tout à la place des faits Auth0.
5. Un projet sans aucun store / IdP / proxy **gagne** quand même 13 chapitres CAF.

Preuve positive minimale : `normalize(demo.json)` → tags sur Postgres/Redis/Traefik/CI/obs ; chapitres gated **remplis** citant les noms Acme (« PostgreSQL — consumer », « Traefik », « GitHub Actions ») ; les 4 sections auteur intactes.

---

## Hors ce contrat (inchangé)

- ISA #3 — templates produit (site, app) qui *écrivent* un compare / une roadmap quand le template le sait.
- ISA #4 — wizard besoins (multi-tenant, PII, budget).
- Éditeur ADR, FinOps montants, sanitization HTML globale de `rich()`.
- Réécrire le seed Acme pour y coller des `brick` à la main — ça tricherait la preuve B4.

---

## Suite

1. ~~**Figer** ce contrat en ISA (Goal + ISC calqués sur B1–B6 / D1–D6 / falsifiers). Pas de code avant.~~ **Done** — ISC-Q1–Q3 dans ISA admin CMS.
2. **Admin CMS** — templates Acme et catalogue éditables : [`ADMIN-CMS.md`](./ADMIN-CMS.md).
3. Ensuite : tests rouges + hydratation **ou** migration admin M2 (templates projet first).
4. Vérifier sur trois documents : Acme seed, Auth0-only, projet CAF manuel encore plein de `[…]`.

Ce fichier est le cahier des charges qualité. L’admin CMS est le levier de livraison. Le code vient après ISA LOCKED.

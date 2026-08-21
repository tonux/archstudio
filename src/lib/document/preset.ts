/* The Architecture Design Document preset.
 *
 * Not a seventh template: a template produces a *diagram*, this produces the
 * *chapters* around it. It appends the written sections an ADD is expected to
 * carry — data, scaling, tenancy, disaster recovery, observability, resource
 * segmentation, IAM, networking, cost management, governance, delivery, cost
 * estimate — pre-structured and empty, for someone to fill in.
 *
 * Two deliberate constraints:
 *
 * — **Vendor-neutral.** The reference document is written for one cloud; these
 *   chapters are not. Service names belong to the components, which already
 *   carry their per-target correspondence table. A chapter that named a product
 *   would be wrong on four targets out of five.
 *
 * — **Off the tab bar.** These are written for paper. They go into `sections`
 *   but not into `ui.tabs`, so the interactive viewer is unchanged and the
 *   printed document is complete. Anyone who wants one on screen can switch it
 *   on from the Tabs panel.
 *
 * Applying it twice adds nothing: sections already present are left alone,
 * edits and all.
 */

import { naturalTabs } from '../tabs';
import type { Architecture, DocSlot, Section } from '../types';
import { resolveDeep, type Lang, type TemplateSection } from '../templates/types';
import { aggregateConcerns, deriveGates } from './concerns';
import { hydratePresetSection } from './hydrate';

export type PresetSection = TemplateSection & { doc: DocSlot };

/** Marks a value the author still has to supply. */
const TODO = '[…]';

const SECTIONS: PresetSection[] = [
  /* ------------------------------------------------------------------- 1.1 */
  {
    id: 'add-scope',
    type: 'text',
    doc: { chapter: '1.1' },
    title: { en: 'Objectives, scope and constraints', fr: 'Objectifs, périmètre et contraintes' },
    subtitle: {
      en: 'What this architecture is for, and — as importantly — what it is not for.',
      fr: "Ce que cette architecture doit permettre et, tout aussi important, ce qu'elle ne couvre pas."
    },
    blocks: [
      {
        title: { en: 'Objectives', fr: 'Objectifs' },
        body: [
          { en: `Business outcome this architecture serves: ${TODO}`, fr: `Résultat métier visé par cette architecture : ${TODO}` },
          { en: `Success criteria, measurable: ${TODO}`, fr: `Critères de succès, mesurables : ${TODO}` }
        ]
      },
      {
        title: { en: 'Out of scope', fr: 'Hors périmètre' },
        body: [{
          en: `Explicitly not covered by this document: ${TODO}. Anything listed here is a decision, not an omission.`,
          fr: `Explicitement non couvert par ce document : ${TODO}. Ce qui est listé ici est une décision, pas un oubli.`
        }]
      },
      {
        title: { en: 'Constraints and assumptions', fr: 'Contraintes et hypothèses' },
        body: [
          { en: `Regulatory, contractual or data-residency constraints: ${TODO}`, fr: `Contraintes réglementaires, contractuelles ou de résidence des données : ${TODO}` },
          { en: `Team size and skills the design assumes: ${TODO}`, fr: `Taille et compétences de l'équipe supposées par la conception : ${TODO}` },
          { en: `Budget envelope: ${TODO}`, fr: `Enveloppe budgétaire : ${TODO}` }
        ]
      }
    ]
  },

  /* ------------------------------------------------------------------- 2.x */
  {
    id: 'add-data',
    type: 'table',
    doc: { chapter: '2.2' },
    title: { en: 'Data architecture & storage', fr: 'Architecture des données & stockage' },
    subtitle: {
      en: 'One row per family of data, chosen against its read/write pattern — not one row per table.',
      fr: "Une ligne par famille de données, choisie selon son motif de lecture/écriture — pas une ligne par table."
    },
    note: {
      en: 'The reason for a store belongs in this table. Six months from now it is the only column anyone re-reads.',
      fr: "Le motif du choix appartient à ce tableau. Dans six mois, c'est la seule colonne que quelqu'un relira."
    },
    columns: [
      { label: { en: 'Data', fr: 'Donnée' }, width: '24%' },
      { label: { en: 'Store', fr: 'Stockage' }, width: '22%' },
      { label: { en: 'Why this one', fr: 'Motif du choix' } },
      { label: { en: 'Volume · growth', fr: 'Volume · croissance' }, width: '18%' }
    ],
    rows: [
      [
        { en: 'Transactional data', fr: 'Données transactionnelles' },
        { en: '[Relational database]', fr: '[Base relationnelle]' },
        { en: 'Strong consistency, transactions, managed backups', fr: 'Cohérence forte, transactions, sauvegardes gérées' },
        TODO
      ],
      [
        { en: 'Sessions · cache', fr: 'Sessions · cache' },
        { en: '[Key-value cache]', fr: '[Cache clé-valeur]' },
        { en: 'Latency, and load taken off the database', fr: 'Latence, et charge retirée à la base' },
        TODO
      ],
      [
        { en: 'Files, media, attachments', fr: 'Fichiers, médias, pièces jointes' },
        { en: '[Object storage]', fr: '[Stockage objet]' },
        { en: 'Cost per GB, served through a CDN', fr: 'Coût au Go, servi via un CDN' },
        TODO
      ]
    ]
  },
  {
    id: 'add-scale',
    type: 'text',
    doc: { chapter: '2.3' },
    title: { en: 'Scalability', fr: 'Scalabilité' },
    subtitle: {
      en: 'The load the design is sized for, how it grows, and where it stops growing.',
      fr: "La charge pour laquelle la conception est dimensionnée, comment elle croît, et où elle cesse de croître."
    },
    blocks: [
      {
        title: { en: 'Expected load', fr: 'Charge attendue' },
        body: [{
          en: `Steady state: ${TODO}. Peak: ${TODO}. Growth over twelve months: ${TODO}.`,
          fr: `Régime nominal : ${TODO}. Pic : ${TODO}. Croissance à douze mois : ${TODO}.`
        }]
      },
      {
        title: { en: 'How it scales', fr: 'Mise à l’échelle' },
        body: [{
          en: `Horizontal scaling on ${TODO}, triggered by ${TODO}. Traffic is distributed by ${TODO}. Stateful components scale by ${TODO}.`,
          fr: `Mise à l’échelle horizontale sur ${TODO}, déclenchée par ${TODO}. Le trafic est réparti par ${TODO}. Les composants à état passent à l’échelle via ${TODO}.`
        }]
      },
      {
        title: { en: 'Known limits', fr: 'Limites connues' },
        body: [{
          en: `The first component to break under load is ${TODO}, at roughly ${TODO}. The plan when that happens: ${TODO}.`,
          fr: `Le premier composant à céder sous la charge est ${TODO}, aux environs de ${TODO}. Le plan à ce moment-là : ${TODO}.`
        }]
      }
    ]
  },
  {
    id: 'add-tenancy',
    type: 'compare',
    doc: { chapter: '2.4' },
    title: { en: 'Tenancy and isolation', fr: 'Tenancy et isolation' },
    subtitle: {
      en: 'Delete the pole you did not choose, and keep the table — it is the record of why.',
      fr: "Supprime le pôle non retenu et garde le tableau : c'est la trace du pourquoi."
    },
    columns: [
      {
        title: { en: 'Single-tenant', fr: 'Mono-tenant' },
        short: { en: 'Single', fr: 'Mono' },
        pitch: {
          en: 'One deployment per customer. Isolation is physical, and so is the bill.',
          fr: 'Un déploiement par client. L’isolation est physique, la facture aussi.'
        },
        bullets: [
          { en: 'Nothing shared, so nothing to leak between customers', fr: 'Rien de partagé, donc rien qui fuite entre clients' },
          { en: 'Per-customer versions, and the maintenance that implies', fr: 'Versions par client, et la maintenance que cela implique' }
        ]
      },
      {
        title: { en: 'Multi-tenant', fr: 'Multi-tenant' },
        short: { en: 'Multi', fr: 'Multi' },
        pitch: {
          en: 'One deployment for everyone. Isolation is a property of the code, and has to be proven.',
          fr: 'Un déploiement pour tous. L’isolation est une propriété du code, et doit être prouvée.'
        },
        bullets: [
          { en: 'One version to operate, one to patch', fr: 'Une seule version à exploiter, une seule à corriger' },
          { en: 'Every query needs its tenant filter — enforced, not remembered', fr: 'Chaque requête porte son filtre de tenant — imposé, pas mémorisé' }
        ]
      }
    ],
    table: {
      title: { en: 'Side by side', fr: 'Face à face' },
      firstColumn: { en: 'Dimension', fr: 'Dimension' },
      rows: [
        [{ en: 'Data isolation', fr: 'Isolation des données' }, TODO, TODO],
        [{ en: 'Cost per customer', fr: 'Coût par client' }, TODO, TODO],
        [{ en: 'Blast radius of an incident', fr: 'Rayon d’impact d’un incident' }, TODO, TODO],
        [{ en: 'Per-customer customisation', fr: 'Personnalisation par client' }, TODO, TODO],
        [{ en: 'Onboarding a new customer', fr: 'Arrivée d’un nouveau client' }, TODO, TODO]
      ]
    },
    cards: [{
      title: { en: 'Decision', fr: 'Décision' },
      subtitle: {
        en: `This architecture is [single / multi]-tenant. Isolation is enforced by ${TODO}.`,
        fr: `Cette architecture est [mono / multi]-tenant. L’isolation est assurée par ${TODO}.`
      },
      bullets: [
        { en: `What would make us revisit it: ${TODO}`, fr: `Ce qui nous ferait revenir dessus : ${TODO}` }
      ]
    }]
  },
  {
    id: 'add-dr',
    type: 'table',
    doc: { chapter: '2.5' },
    title: { en: 'Backup and disaster recovery', fr: 'Sauvegarde et reprise d’activité' },
    subtitle: {
      en: 'RPO — how much data you accept losing. RTO — how long you accept being down. Both per system, both agreed with the business.',
      fr: 'RPO — la quantité de données que l’on accepte de perdre. RTO — la durée d’indisponibilité que l’on accepte. Par système, et validés par le métier.'
    },
    note: {
      en: 'An RPO that has never been restored from is an intention, not a guarantee. Date the last drill in the final column.',
      fr: "Un RPO jamais restauré est une intention, pas une garantie. Date le dernier exercice dans la dernière colonne."
    },
    columns: [
      { label: { en: 'System', fr: 'Système' }, width: '22%' },
      { label: 'RPO', width: '10%' },
      { label: 'RTO', width: '10%' },
      { label: { en: 'Mechanism', fr: 'Mécanisme' } },
      { label: { en: 'Last restore drill', fr: 'Dernier test de restauration' }, width: '18%' }
    ],
    rows: [
      [
        { en: 'Primary database', fr: 'Base de données principale' }, TODO, TODO,
        { en: 'Automated snapshots + continuous transaction-log archiving', fr: 'Instantanés automatiques + archivage continu du journal de transactions' },
        TODO
      ],
      [
        { en: 'Object storage', fr: 'Stockage objet' }, TODO, TODO,
        { en: 'Versioning + cross-region replication', fr: 'Versionnage + réplication inter-région' },
        TODO
      ],
      [
        { en: 'Infrastructure', fr: 'Infrastructure' }, TODO, TODO,
        { en: 'Rebuilt from infrastructure-as-code in a secondary region', fr: 'Reconstruite depuis l’infrastructure-as-code dans une région secondaire' },
        TODO
      ]
    ]
  },
  {
    id: 'add-observability',
    type: 'cards',
    doc: { chapter: '2.6' },
    title: { en: 'Observability & telemetry', fr: 'Observabilité & télémétrie' },
    subtitle: {
      en: 'What you will be able to see at three in the morning, and who gets woken up.',
      fr: 'Ce que l’on pourra voir à trois heures du matin, et qui sera réveillé.'
    },
    items: [
      {
        icon: 'terminal',
        title: { en: 'Logs', fr: 'Journaux' },
        bullets: [
          { en: `Aggregated in ${TODO}, retained for ${TODO}`, fr: `Agrégés dans ${TODO}, conservés ${TODO}` },
          { en: 'Structured, and correlated by request id', fr: 'Structurés, et corrélés par identifiant de requête' },
          { en: `Personal data scrubbed at ${TODO}`, fr: `Données personnelles expurgées au niveau de ${TODO}` }
        ]
      },
      {
        icon: 'chart',
        title: { en: 'Metrics', fr: 'Métriques' },
        bullets: [
          { en: `Service level indicators tracked: ${TODO}`, fr: `Indicateurs de niveau de service suivis : ${TODO}` },
          { en: `Objectives (SLO): ${TODO}`, fr: `Objectifs (SLO) : ${TODO}` },
          { en: `Dashboards in ${TODO}`, fr: `Tableaux de bord dans ${TODO}` }
        ]
      },
      {
        icon: 'route',
        title: { en: 'Traces', fr: 'Traces' },
        bullets: [
          { en: `Distributed tracing through ${TODO}`, fr: `Traçage distribué via ${TODO}` },
          { en: `Sampling rate: ${TODO}`, fr: `Taux d’échantillonnage : ${TODO}` }
        ]
      },
      {
        icon: 'bell',
        title: { en: 'Alerting', fr: 'Alertes' },
        bullets: [
          { en: `Paging conditions: ${TODO}`, fr: `Conditions de réveil : ${TODO}` },
          { en: `On-call rotation: ${TODO}`, fr: `Astreinte : ${TODO}` },
          { en: 'Every alert points at a runbook, or it is deleted', fr: 'Chaque alerte pointe vers une procédure, sinon elle est supprimée' }
        ]
      }
    ]
  },

  /* ------------------------------------------------------------------- 3.x */
  {
    id: 'add-resources',
    type: 'table',
    doc: { chapter: '3.1' },
    title: { en: 'Resource segmentation', fr: 'Segmentation des ressources' },
    subtitle: {
      en: 'How environments and workloads are separated, and what that separation actually enforces.',
      fr: 'Comment les environnements et les charges sont séparés, et ce que cette séparation garantit réellement.'
    },
    columns: [
      { label: { en: 'Environment', fr: 'Environnement' }, width: '20%' },
      { label: { en: 'What lives there', fr: 'Ce qui y vit' } },
      { label: { en: 'Who has access', fr: 'Qui y accède' }, width: '24%' },
      { label: { en: 'Isolation boundary', fr: 'Frontière d’isolation' }, width: '22%' }
    ],
    rows: [
      [{ en: 'Production', fr: 'Production' }, TODO, TODO, TODO],
      [{ en: 'Staging', fr: 'Pré-production' }, TODO, TODO, TODO],
      [{ en: 'Development', fr: 'Développement' }, TODO, TODO, TODO],
      [{ en: 'Shared tooling', fr: 'Outillage partagé' }, TODO, TODO, TODO]
    ]
  },
  {
    id: 'add-iam',
    type: 'cards',
    doc: { chapter: '3.2' },
    title: { en: 'Identity, access and secrets', fr: 'Identités, accès et secrets' },
    subtitle: {
      en: 'Least privilege, stated concretely enough to be audited against.',
      fr: 'Moindre privilège, énoncé assez concrètement pour être audité.'
    },
    items: [
      {
        icon: 'users',
        title: { en: 'Human identities', fr: 'Identités humaines' },
        bullets: [
          { en: `Provisioned from ${TODO}, with multi-factor authentication enforced`, fr: `Provisionnées depuis ${TODO}, authentification multifacteur imposée` },
          { en: 'Permissions granted through groups, never to individuals', fr: 'Droits accordés via des groupes, jamais à des individus' },
          { en: `Production access requires ${TODO}`, fr: `L’accès à la production requiert ${TODO}` }
        ]
      },
      {
        icon: 'key',
        title: { en: 'Machine identities', fr: 'Identités machine' },
        bullets: [
          { en: 'One identity per workload, scoped to what it actually calls', fr: 'Une identité par charge de travail, limitée à ce qu’elle appelle réellement' },
          { en: 'Short-lived credentials — no long-lived keys', fr: 'Jetons à durée de vie courte — pas de clés permanentes' }
        ]
      },
      {
        icon: 'lock',
        title: { en: 'Secrets', fr: 'Secrets' },
        bullets: [
          { en: `Stored in ${TODO}, never in the repository or an environment file`, fr: `Stockés dans ${TODO}, jamais dans le dépôt ni un fichier d’environnement` },
          { en: `Rotation: ${TODO}`, fr: `Rotation : ${TODO}` }
        ]
      },
      {
        icon: 'eye',
        title: { en: 'Review', fr: 'Revue' },
        bullets: [
          { en: `Access reviewed every ${TODO} by ${TODO}`, fr: `Accès revus tous les ${TODO} par ${TODO}` },
          { en: `Departures revoked within ${TODO}`, fr: `Départs révoqués sous ${TODO}` }
        ]
      }
    ]
  },
  {
    id: 'add-network',
    type: 'text',
    doc: { chapter: '3.3' },
    title: { en: 'Networking', fr: 'Réseau' },
    subtitle: {
      en: 'The shape of the network, what is reachable from outside it, and what filters the traffic.',
      fr: 'La forme du réseau, ce qui est joignable depuis l’extérieur, et ce qui filtre le trafic.'
    },
    note: {
      en: 'If a component holds data, it should not be listed under public exposure. If it is, say why here rather than in a review meeting.',
      fr: "Si un composant détient des données, il ne devrait pas figurer dans l'exposition publique. S'il y figure, dis pourquoi ici plutôt qu'en comité."
    },
    blocks: [
      {
        title: { en: 'Topology', fr: 'Topologie' },
        body: [{
          en: `Private network model: ${TODO}. Subnets: ${TODO}. Outbound access from private resources goes through ${TODO}.`,
          fr: `Modèle de réseau privé : ${TODO}. Sous-réseaux : ${TODO}. La sortie internet des ressources privées passe par ${TODO}.`
        }]
      },
      {
        title: { en: 'Public exposure', fr: 'Exposition publique' },
        body: [{
          en: `The only entry points from the internet are ${TODO}. Everything else has no public address.`,
          fr: `Les seuls points d’entrée depuis internet sont ${TODO}. Tout le reste n’a pas d’adresse publique.`
        }]
      },
      {
        title: { en: 'Filtering and protection', fr: 'Filtrage et protection' },
        body: [{
          en: `Web application firewall: ${TODO}. Rate limiting: ${TODO}. TLS terminated at ${TODO}; traffic between services is ${TODO}.`,
          fr: `Pare-feu applicatif : ${TODO}. Limitation de débit : ${TODO}. TLS terminé au niveau de ${TODO} ; le trafic entre services est ${TODO}.`
        }]
      }
    ]
  },
  {
    id: 'add-cost-mgmt',
    type: 'table',
    doc: { chapter: '3.4' },
    title: { en: 'Cost management', fr: 'Maîtrise des coûts' },
    subtitle: {
      en: 'How spend is watched — as opposed to how much it is, which is the last chapter.',
      fr: 'Comment la dépense est surveillée — et non combien elle coûte, qui est le dernier chapitre.'
    },
    columns: [
      { label: { en: 'Mechanism', fr: 'Mécanisme' }, width: '26%' },
      { label: { en: 'How it is set up', fr: 'Mise en œuvre' } },
      { label: { en: 'Owner', fr: 'Responsable' }, width: '20%' }
    ],
    rows: [
      [{ en: 'Budgets and alert thresholds', fr: 'Budgets et seuils d’alerte' }, TODO, TODO],
      [{ en: 'Resource labelling', fr: 'Étiquetage des ressources' }, { en: 'By environment, team and application', fr: 'Par environnement, équipe et application' }, TODO],
      [{ en: 'Spend review', fr: 'Revue de la dépense' }, TODO, TODO],
      [{ en: 'Commitments / reservations', fr: 'Engagements / réservations' }, TODO, TODO]
    ]
  },
  {
    id: 'add-governance',
    type: 'table',
    doc: { chapter: '3.5' },
    title: { en: 'Governance', fr: 'Gouvernance' },
    subtitle: {
      en: 'The constraints enforced by the platform itself, so they do not depend on anyone remembering them.',
      fr: 'Les contraintes appliquées par la plateforme elle-même, pour ne dépendre de la mémoire de personne.'
    },
    columns: [
      { label: { en: 'Constraint', fr: 'Contrainte' }, width: '28%' },
      { label: { en: 'Rule in force', fr: 'Règle appliquée' } },
      { label: { en: 'Scope', fr: 'Portée' }, width: '22%' }
    ],
    rows: [
      [{ en: 'Data residency', fr: 'Résidence des données' }, TODO, TODO],
      [{ en: 'Public addresses', fr: 'Adresses publiques' }, TODO, TODO],
      [{ en: 'Long-lived credentials', fr: 'Identifiants permanents' }, TODO, TODO],
      [{ en: 'Encryption at rest and in transit', fr: 'Chiffrement au repos et en transit' }, TODO, TODO],
      [{ en: 'Audit logging', fr: 'Journalisation d’audit' }, TODO, TODO]
    ]
  },

  /* ------------------------------------------------------------------- 4.x */
  {
    id: 'add-cicd',
    type: 'timeline',
    doc: { chapter: '4.1' },
    title: { en: 'CI/CD & deployment strategy', fr: 'CI/CD & stratégie de déploiement' },
    subtitle: {
      en: 'The path a commit takes to production, and the way back.',
      fr: 'Le chemin d’un commit jusqu’à la production, et le chemin du retour.'
    },
    lineTitle: { en: 'Delivery pipeline', fr: 'Chaîne de livraison' },
    items: [
      {
        period: { en: 'Step 1', fr: 'Étape 1' },
        title: { en: 'Commit', fr: 'Commit' },
        bullets: [{ en: `Branch model: ${TODO}. Review required: ${TODO}.`, fr: `Modèle de branches : ${TODO}. Revue exigée : ${TODO}.` }]
      },
      {
        period: { en: 'Step 2', fr: 'Étape 2' },
        title: { en: 'Build & test', fr: 'Build & tests' },
        bullets: [{ en: `Runs on ${TODO}. Gate: ${TODO}.`, fr: `Exécuté sur ${TODO}. Condition de passage : ${TODO}.` }]
      },
      {
        period: { en: 'Step 3', fr: 'Étape 3' },
        title: { en: 'Scan', fr: 'Analyse' },
        bullets: [{ en: `Dependency, container and secret scanning: ${TODO}.`, fr: `Analyse des dépendances, des images et des secrets : ${TODO}.` }]
      },
      {
        period: { en: 'Step 4', fr: 'Étape 4' },
        title: { en: 'Publish', fr: 'Publication' },
        bullets: [{ en: `Artifacts pushed to ${TODO}, immutable and versioned.`, fr: `Artefacts publiés dans ${TODO}, immuables et versionnés.` }]
      },
      {
        period: { en: 'Step 5', fr: 'Étape 5' },
        title: { en: 'Deploy', fr: 'Déploiement' },
        bullets: [{ en: `[Rolling / blue-green / canary] to ${TODO}. Approval: ${TODO}.`, fr: `[Progressif / bleu-vert / canari] vers ${TODO}. Validation : ${TODO}.` }]
      },
      {
        period: { en: 'Step 6', fr: 'Étape 6' },
        title: { en: 'Verify', fr: 'Vérification' },
        bullets: [{ en: `Smoke tests and the metrics watched after a release: ${TODO}.`, fr: `Tests de fumée et métriques surveillées après une livraison : ${TODO}.` }]
      }
    ],
    aside: [
      {
        icon: 'clock',
        title: { en: 'Release cadence', fr: 'Cadence de livraison' },
        bullets: [
          { en: `Deployments per week: ${TODO}`, fr: `Déploiements par semaine : ${TODO}` },
          { en: `Change freeze windows: ${TODO}`, fr: `Périodes de gel : ${TODO}` }
        ]
      },
      {
        icon: 'save',
        title: { en: 'Rollback', fr: 'Retour arrière' },
        bullets: [
          { en: `Triggered by ${TODO}, takes ${TODO}`, fr: `Déclenché par ${TODO}, prend ${TODO}` },
          { en: `Database migrations are ${TODO} — the part rollback usually forgets`, fr: `Les migrations de base sont ${TODO} — la part que le retour arrière oublie d’ordinaire` }
        ]
      }
    ]
  },

  /* ------------------------------------------------------------------- 5.x */
  {
    id: 'add-cost-estimate',
    type: 'table',
    doc: { chapter: '5.1' },
    title: { en: 'Monthly cost estimate', fr: 'Estimation du coût mensuel' },
    subtitle: {
      en: 'Modelled from the sizing assumptions above. An estimate is only readable next to the assumption that produced it — keep both columns.',
      fr: "Modélisée à partir des hypothèses de dimensionnement ci-dessus. Une estimation ne se lit qu'à côté de l'hypothèse qui la produit — garde les deux colonnes."
    },
    note: {
      en: 'Cloud consumption only: licences, support plans and people are not in this table. State the pricing calculator and the date of the quote.',
      fr: "Consommation cloud uniquement : licences, plans de support et coûts humains n'y figurent pas. Précise le calculateur tarifaire utilisé et la date du chiffrage."
    },
    columns: [
      { label: { en: 'Line item', fr: 'Poste' }, width: '26%' },
      { label: { en: 'Sizing assumption', fr: 'Hypothèse de dimensionnement' } },
      { label: { en: 'Est. monthly', fr: 'Coût mensuel est.' }, width: '20%' }
    ],
    rows: [
      [{ en: 'Compute', fr: 'Calcul' }, TODO, TODO],
      [{ en: 'Databases', fr: 'Bases de données' }, TODO, TODO],
      [{ en: 'Storage & egress', fr: 'Stockage & sortie réseau' }, TODO, TODO],
      [{ en: 'Managed services', fr: 'Services managés' }, TODO, TODO],
      [{ en: 'Observability', fr: 'Observabilité' }, TODO, TODO],
      [{ en: '<b>Total</b>', fr: '<b>Total</b>' }, { en: '<b>Main cost drivers</b>', fr: '<b>Principaux postes</b>' }, `<b>${TODO}</b>`]
    ]
  }
];

/* ------------------------------------------------------------------- apply */

export interface PresetResult {
  /** Section ids appended by this call. */
  added: string[];
  /** Ids that were already there — left untouched, edits and all. */
  kept: string[];
  /** Auto-gated sections re-hydrated from the current component set. */
  updated?: string[];
  /** Auto-gated section ids removed because no component opens the gate anymore. */
  removed?: string[];
}

/** Ids the preset owns, in plan order. */
export const PRESET_SECTION_IDS = SECTIONS.map(s => s.id);

/** Bilingual preset chapter specs for admin seed (M3). */
export function allPresetSectionSpecs(): readonly PresetSection[] {
  return SECTIONS;
}

/** How many preset chapters `doc` is still missing. */
export function missingPresetSections(doc: Architecture): number {
  const have = new Set(doc.sections.map(s => s.id));
  return PRESET_SECTION_IDS.filter(id => !have.has(id)).length;
}

/** Chapters the placed bricks open that are not yet persisted (or still template `[…]`). */
export function missingGatedPresetSections(doc: Architecture): number {
  const gates = deriveGates(aggregateConcerns(doc));
  let n = 0;
  for (const id of gates) {
    const existing = doc.sections.find(s => s.id === id);
    if (!existing) { n++; continue; }
    if (!existing.doc?.gated && JSON.stringify(existing).includes(TODO)) n++;
  }
  return n;
}

/**
 * Append the missing design-document chapters to `doc`, in place.
 *
 * `ui.tabs` is materialised first when it is empty: an empty list means "show
 * everything" to the viewer, so adding thirteen paper chapters to a document
 * that never pinned its tabs would grow the tab bar by thirteen. Writing the
 * current tabs down explicitly keeps the viewer exactly as it was.
 */

/** Read-only projection of one preset chapter — does not mutate `doc`. */
export function presetSectionForId(id: string, lang?: Lang): Section | undefined {
  const spec = SECTIONS.find(section => section.id === id);
  if (!spec) return undefined;
  const l: Lang = lang ?? 'en';
  return resolveDeep<Section>(spec, l);
}

/**
 * Add, refresh, or remove preset chapters driven by placed components' concern tags.
 * Gated sections are hydrated from catalog metadata on every sync — adding Cognito
 * updates the IAM chapter; removing it drops Cognito from the text.
 * Manual preset chapters (no `gated` flag) are never touched.
 */
export function syncGatedPresetSections(
  doc: Architecture,
  lang?: Lang,
  opts?: { refresh?: boolean }
): PresetResult {
  const l: Lang = lang ?? (doc.meta?.lang === 'fr' ? 'fr' : 'en');
  const refresh = opts?.refresh !== false;
  const gates = deriveGates(aggregateConcerns(doc));
  const removed: string[] = [];

  doc.sections = doc.sections.filter(section => {
    if (!section.doc?.gated) return true;
    if (gates.has(section.id)) return true;
    removed.push(section.id);
    return false;
  });

  const added: string[] = [];
  const kept: string[] = [];
  const updated: string[] = [];

  PRESET_SECTION_IDS.forEach(id => {
    if (!gates.has(id)) return;
    const existingIdx = doc.sections.findIndex(s => s.id === id);

    if (existingIdx >= 0) {
      const existing = doc.sections[existingIdx];
      const templateLike = JSON.stringify(existing).includes(TODO);
      if (!existing.doc?.gated) {
        if (!templateLike) {
          kept.push(id);
          return;
        }
        /* Manual CAF pack still full of placeholders — adopt as gated and fill. */
      } else if (!refresh && !templateLike) {
        kept.push(id);
        return;
      }
      const raw = presetSectionForId(id, l);
      if (!raw) return;
      const hydrated = hydratePresetSection(raw, doc, l);
      doc.sections[existingIdx] = {
        ...hydrated,
        id,
        doc: { chapter: hydrated.doc?.chapter, gated: true }
      };
      updated.push(id);
      return;
    }

    const raw = presetSectionForId(id, l);
    if (!raw) return;
    const hydrated = hydratePresetSection(raw, doc, l);
    doc.sections.push({
      ...hydrated,
      doc: { chapter: hydrated.doc?.chapter, gated: true }
    });
    added.push(id);
  });

  return {
    added,
    kept,
    updated: updated.length ? updated : undefined,
    removed: removed.length ? removed : undefined
  };
}

export function applyDesignDocumentPreset(doc: Architecture, lang?: Lang): PresetResult {
  const l: Lang = lang ?? (doc.meta?.lang === 'fr' ? 'fr' : 'en');

  if (!doc.ui.tabs?.length) doc.ui.tabs = naturalTabs(doc).map(t => t.id);

  const have = new Set(doc.sections.map(s => s.id));
  const added: string[] = [];
  const kept: string[] = [];

  SECTIONS.forEach(spec => {
    if (have.has(spec.id)) { kept.push(spec.id); return; }
    doc.sections.push(resolveDeep<Section>(spec, l));
    added.push(spec.id);
  });

  /* The generated deployment table is the document's service-selection chapter.
   * It is the one existing section that has an obvious slot, so give it one —
   * without overwriting a slot someone already chose. */
  const deployment = doc.sections.find(s => s.id === 'deployment');
  if (deployment && !deployment.doc?.chapter) deployment.doc = { chapter: '2.1' };

  return { added, kept };
}

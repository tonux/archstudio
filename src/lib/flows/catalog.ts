/* The shipped flow patterns.
 *
 * **Server-only.** Nothing under `src/components` may import this file: the
 * bodies are bilingual, and the browser needs exactly one half of them. The
 * resolved, single-language payload reaches the client through
 * `/api/flow-templates`, the same arrangement `TemplateSummary` has with the
 * architecture templates.
 *
 * On writing a hint. The temptation is to describe the *ideal* component and
 * let the scorer stretch; the useful move is the opposite — enumerate the words
 * real documents actually use, in both languages, and let the review modal
 * handle the rest. Every hint here was checked against the demo project and the
 * six architecture templates by `catalog.test.ts`, which is the only reason to
 * trust any of them. `layers` is always a tiebreak and never the whole hint,
 * because layer vocabularies differ from one template to the next (`services`
 * in one, `compute` in another, `processing` in a third).
 */

import { resolveDeep, type Lang } from '../templates/types';
import type { FlowPattern, FlowTemplate } from './types';

/* Reused across patterns: the surfaces every architecture has under a different
 * name, written once so a fix reaches all eight. */
const CLIENT = {
  name: ['app', 'web', 'client', 'portal', 'front', 'frontend', 'mobile', 'interface', 'ui', 'chat'],
  layers: ['clients'],
  icons: ['mobile', 'web', 'globe', 'chat'],
  avoid: ['admin', 'marketing']
};
const API = {
  name: ['api', 'gateway', 'endpoint', 'passerelle', 'service', 'backend', 'app'],
  tech: ['rest', 'graphql', 'http'],
  layers: ['services', 'edge', 'compute', 'app'],
  icons: ['plug', 'server', 'hub'],
  avoid: ['public']
};
const QUEUE = {
  name: ['queue', 'bus', 'stream', 'file', 'kafka', 'rabbit', 'sqs', 'pubsub', 'broker', 'cache'],
  tech: ['queue', 'queues', 'events', 'kafka', 'redis', 'dlq'],
  icons: ['route', 'box', 'bolt', 'hub']
};
/* `consumer` is deliberately absent from `name`: in half the documents that
 * word means "the consumer-facing app", not "the thing that drains the queue",
 * and a hint cannot tell those apart. It stays in `tech`, where "Queue
 * consumer" still reaches it, and the client surfaces are ruled out outright. */
const WORKER = {
  name: ['worker', 'workers', 'job', 'jobs', 'processing', 'traitement', 'function', 'functions'],
  tech: ['worker', 'queue consumer', 'functions', 'scheduler'],
  icons: ['cog', 'clock', 'bolt'],
  avoid: ['app', 'mobile', 'web', 'portal', 'client']
};
const STORE = {
  name: ['database', 'db', 'postgres', 'postgresql', 'store', 'storage', 'mysql', 'base'],
  tech: ['postgresql', 'oltp', 'mysql', 'relational'],
  layers: ['data'],
  icons: ['db'],
  avoid: ['cache', 'warehouse', 'vector', 'replica', 'search']
};
const NOTIFY = {
  name: ['notification', 'notifications', 'notify', 'email', 'mail', 'push', 'sms'],
  tech: ['smtp', 'email', 'fcm', 'apns', 'webhook'],
  icons: ['bell', 'mail', 'sms']
};
const OBSERVABILITY = {
  name: ['observability', 'obs', 'monitoring', 'metrics', 'logs', 'tracing', 'trace', 'supervision'],
  tech: ['prometheus', 'loki', 'metrics', 'opentelemetry', 'traces', 'alerts'],
  icons: ['eye', 'chart']
};

export const FLOW_CATALOG: FlowTemplate[] = [
  {
    id: 'auth-login',
    icon: 'lock',
    name: { en: 'Authentication', fr: 'Authentification' },
    tagline: {
      en: 'Signing in, from the client surface to the issued token.',
      fr: "La connexion, de la surface cliente au jeton émis."
    },
    steps: [
      {
        key: 'client',
        title: { en: 'Credentials submitted', fr: 'Identifiants soumis' },
        description: {
          en: 'The user signs in from the client surface.',
          fr: "L'utilisateur se connecte depuis la surface cliente."
        },
        hint: CLIENT
      },
      {
        key: 'edge',
        title: { en: 'Routed at the edge', fr: 'Routage en périphérie' },
        hint: {
          name: ['gateway', 'edge', 'proxy', 'ingress', 'passerelle', 'balancer', 'router', 'api'],
          tech: ['tls', 'waf', 'jwt'],
          layers: ['edge'],
          icons: ['route', 'plug']
        }
      },
      {
        key: 'auth',
        title: { en: 'Credentials verified', fr: 'Identifiants vérifiés' },
        description: {
          en: 'Password, one-time code or identity provider — whichever the account uses.',
          fr: "Mot de passe, code à usage unique ou fournisseur d'identité, selon le compte."
        },
        hint: {
          name: ['auth', 'authentication', 'authentification', 'identity', 'identité', 'iam', 'sso', 'oidc', 'keycloak'],
          tech: ['oauth', 'oidc', 'jwt', 'saml', 'scim'],
          icons: ['lock', 'shield', 'key']
        }
      },
      {
        key: 'store',
        title: { en: 'Account read', fr: 'Compte lu' },
        hint: {
          ...STORE,
          name: ['user', 'users', 'account', 'utilisateur', 'compte', ...STORE.name]
        }
      },
      {
        key: 'session',
        title: { en: 'Session opened', fr: 'Session ouverte' },
        description: {
          en: 'The token is issued and the session recorded — this is where expiry and revocation are decided.',
          fr: "Le jeton est émis et la session enregistrée : c'est là que se décident expiration et révocation."
        },
        hint: {
          name: ['session', 'sessions', 'cache', 'redis', 'token', 'jeton'],
          tech: ['redis', 'key value', 'sessions', 'ttl'],
          icons: ['bolt', 'key']
        }
      },
      {
        key: 'back',
        title: { en: 'Client signed in', fr: 'Client connecté' },
        hint: CLIENT
      }
    ]
  },

  {
    id: 'checkout',
    icon: 'card',
    name: { en: 'Checkout and payment', fr: 'Commande et paiement' },
    tagline: {
      en: 'From the confirmed basket to the recorded order.',
      fr: 'Du panier validé à la commande enregistrée.'
    },
    steps: [
      {
        key: 'client',
        title: { en: 'Basket confirmed', fr: 'Panier validé' },
        hint: CLIENT
      },
      {
        key: 'api',
        title: { en: 'Order received', fr: 'Commande reçue' },
        description: {
          en: 'Stock and eligibility are checked before anything is charged.',
          fr: 'Stock et éligibilité sont vérifiés avant tout débit.'
        },
        hint: API
      },
      {
        key: 'price',
        title: { en: 'Total computed', fr: 'Total calculé' },
        description: {
          en: 'Prices, discounts and tax. Say here which side owns the truth.',
          fr: 'Prix, remises et taxes. Dire ici quel côté détient la vérité.'
        },
        hint: {
          name: ['pricing', 'price', 'prix', 'tarification', 'billing', 'facturation', 'catalog', 'catalogue', 'core', 'domain'],
          tech: ['billing', 'stripe billing'],
          icons: ['card', 'chart', 'cube']
        }
      },
      {
        key: 'psp',
        title: { en: 'Card charged', fr: 'Carte débitée' },
        description: {
          en: 'The payment provider is the one authority on whether the money moved.',
          fr: "Le prestataire de paiement est la seule autorité sur le fait que l'argent a bougé."
        },
        hint: {
          name: ['payment', 'payments', 'paiement', 'pay', 'stripe', 'psp', 'adyen', 'checkout'],
          tech: ['stripe', 'payments', 'paiements'],
          icons: ['card']
        }
      },
      {
        key: 'store',
        title: { en: 'Order recorded', fr: 'Commande enregistrée' },
        hint: {
          ...STORE,
          name: ['order', 'orders', 'commande', 'commandes', ...STORE.name]
        }
      },
      {
        key: 'notify',
        title: { en: 'Confirmation sent', fr: 'Confirmation envoyée' },
        hint: NOTIFY
      }
    ]
  },

  {
    id: 'webhook-inbound',
    icon: 'plug',
    name: { en: 'Inbound webhook', fr: 'Webhook entrant' },
    tagline: {
      en: 'A third party calls you — accept fast, process later.',
      fr: 'Un tiers vous appelle : accuser vite, traiter ensuite.'
    },
    note: {
      en: '<b>Watch out.</b> Answer 2xx as soon as the payload is stored. Anything done before that answer is time the sender counts against its own timeout, and it will retry.',
      fr: "<b>Attention.</b> Répondre 2xx dès que la charge est stockée. Tout ce qui est fait avant cette réponse est du temps que l'émetteur décompte de son propre délai — et il réessaiera."
    },
    steps: [
      {
        key: 'source',
        title: { en: 'Third party emits', fr: 'Le tiers émet' },
        hint: {
          name: ['webhook', 'webhooks', 'provider', 'fournisseur', 'partner', 'partenaire', 'external', 'externe', 'producers', 'stripe'],
          tech: ['webhooks', 'signed webhooks', 'webhook'],
          layers: ['vendors', 'producers'],
          icons: ['cloud', 'plug', 'globe']
        }
      },
      {
        key: 'endpoint',
        title: { en: 'Endpoint reached', fr: 'Point de terminaison atteint' },
        hint: {
          name: ['public', 'webhook', 'endpoint', 'api', 'gateway', 'ingest', 'entry', 'passerelle'],
          tech: ['oauth2', 'signed webhooks', 'http api'],
          layers: ['edge', 'services', 'ingestion'],
          icons: ['key', 'plug', 'route']
        }
      },
      {
        key: 'verify',
        title: { en: 'Signature verified', fr: 'Signature vérifiée' },
        description: {
          en: 'An unsigned or replayed payload is dropped here, before it can cost anything.',
          fr: 'Une charge non signée ou rejouée est écartée ici, avant de coûter quoi que ce soit.'
        },
        hint: {
          name: ['auth', 'signature', 'guard', 'security', 'sécurité', 'schema', 'idempotency', 'validation', 'shield'],
          tech: ['hmac', 'signature', 'jwt', 'idempotency'],
          icons: ['shield', 'lock', 'key']
        }
      },
      {
        key: 'queue',
        title: { en: 'Queued for processing', fr: 'Mis en file' },
        hint: QUEUE
      },
      {
        key: 'worker',
        title: { en: 'Payload processed', fr: 'Charge traitée' },
        hint: WORKER
      },
      {
        key: 'store',
        title: { en: 'Result persisted', fr: 'Résultat persisté' },
        hint: STORE
      }
    ]
  },

  {
    id: 'async-job',
    icon: 'clock',
    name: { en: 'Asynchronous processing', fr: 'Traitement asynchrone' },
    tagline: {
      en: 'Accept now, do the work out of band, tell the user when it lands.',
      fr: "Accuser tout de suite, faire le travail à part, prévenir à l'arrivée."
    },
    steps: [
      {
        key: 'api',
        title: { en: 'Request accepted', fr: 'Demande acceptée' },
        description: {
          en: 'The caller gets an identifier, not a result.',
          fr: "L'appelant reçoit un identifiant, pas un résultat."
        },
        hint: API
      },
      {
        key: 'queue',
        title: { en: 'Work enqueued', fr: 'Travail mis en file' },
        hint: QUEUE
      },
      {
        key: 'worker',
        title: { en: 'Worker picks it up', fr: 'Le worker le prend' },
        description: {
          en: 'Retries and the dead-letter path belong here — say how many, and where a give-up lands.',
          fr: "Les reprises et la file de rebut se décident ici : combien de tentatives, et où atterrit un abandon."
        },
        hint: WORKER
      },
      {
        key: 'store',
        title: { en: 'Result written', fr: 'Résultat écrit' },
        hint: STORE
      },
      {
        key: 'notify',
        title: { en: 'Requester told', fr: 'Demandeur prévenu' },
        hint: NOTIFY
      }
    ]
  },

  {
    id: 'file-upload',
    icon: 'cloudup',
    name: { en: 'File upload', fr: 'Import de fichier' },
    tagline: {
      en: 'From the picked file to something the rest of the system can use.',
      fr: 'Du fichier choisi à quelque chose que le reste du système sait utiliser.'
    },
    steps: [
      {
        key: 'client',
        title: { en: 'File picked', fr: 'Fichier choisi' },
        hint: CLIENT
      },
      {
        key: 'api',
        title: { en: 'Upload authorised', fr: 'Import autorisé' },
        description: {
          en: 'Size, type and quota are decided before a byte is accepted.',
          fr: "Taille, type et quota se décident avant d'accepter le moindre octet."
        },
        hint: API
      },
      {
        key: 'objects',
        title: { en: 'Stored as an object', fr: 'Stocké comme objet' },
        hint: {
          name: ['object', 'objects', 'storage', 'stockage', 'files', 'fichiers', 'bucket', 's3', 'docstore', 'blob'],
          tech: ['s3', 'object storage', 'blob'],
          layers: ['data', 'index'],
          icons: ['box', 'save'],
          avoid: ['database', 'cache']
        }
      },
      {
        key: 'scan',
        title: { en: 'Inspected', fr: 'Inspecté' },
        description: {
          en: 'Antivirus, format check, text extraction — whatever must happen before it is trusted.',
          fr: 'Antivirus, contrôle de format, extraction de texte : ce qui doit arriver avant de lui faire confiance.'
        },
        hint: {
          name: ['scan', 'extract', 'extraction', 'ocr', 'guard', 'worker', 'processing', 'antivirus'],
          tech: ['ocr', 'antivirus', 'layout'],
          icons: ['scan', 'shield', 'cog']
        }
      },
      {
        key: 'index',
        title: { en: 'Indexed', fr: 'Indexé' },
        hint: {
          name: ['index', 'search', 'recherche', 'meta', 'metadata', 'métadonnées', 'catalog', 'vector', 'database', 'db'],
          tech: ['full text', 'ann', 'elasticsearch'],
          icons: ['db', 'layers', 'folder']
        }
      },
      {
        key: 'notify',
        title: { en: 'Ready, and said so', fr: 'Prêt, et annoncé' },
        hint: NOTIFY
      }
    ]
  },

  {
    id: 'rag-query',
    icon: 'ai',
    name: { en: 'RAG query', fr: 'Requête RAG' },
    tagline: {
      en: 'A question, the passages that answer it, and a grounded reply.',
      fr: 'Une question, les passages qui y répondent, et une réponse sourcée.'
    },
    steps: [
      {
        key: 'client',
        title: { en: 'Question asked', fr: 'Question posée' },
        hint: CLIENT
      },
      {
        key: 'api',
        title: { en: 'Query received', fr: 'Requête reçue' },
        hint: API
      },
      {
        key: 'embed',
        title: { en: 'Question embedded', fr: 'Question vectorisée' },
        hint: {
          name: ['embed', 'embedding', 'vectorisation', 'encoder', 'llm', 'model', 'modèle'],
          tech: ['embedding', 'embeddings', 'encoder'],
          icons: ['ai']
        }
      },
      {
        key: 'retrieve',
        title: { en: 'Passages retrieved', fr: 'Passages récupérés' },
        description: {
          en: 'Filtering by access rights happens here, not after generation — a leaked passage is already leaked.',
          fr: "Le filtrage par droits d'accès a lieu ici, pas après génération : un passage fuité est déjà fuité."
        },
        hint: {
          name: ['vector', 'vecteur', 'retriever', 'retrieval', 'récupération', 'index', 'search', 'recherche', 'pinecone', 'qdrant'],
          tech: ['ann', 'hybrid search', 'bm25', 'vectors'],
          icons: ['db', 'cube']
        }
      },
      {
        key: 'rerank',
        title: { en: 'Passages reranked', fr: 'Passages reclassés' },
        hint: {
          name: ['rerank', 'reranking', 'reclassement', 'rank', 'guard', 'filter'],
          tech: ['cross encoder', 'reranker'],
          icons: ['chart', 'layers']
        }
      },
      {
        key: 'llm',
        title: { en: 'Answer generated', fr: 'Réponse générée' },
        description: {
          en: 'With the passages in the prompt and their sources kept, so the reply can be checked.',
          fr: 'Avec les passages dans le prompt et leurs sources conservées, pour que la réponse soit vérifiable.'
        },
        hint: {
          name: ['llm', 'generation', 'génération', 'model', 'modèle', 'gpt', 'claude', 'inference'],
          tech: ['llm', 'openai', 'anthropic'],
          layers: ['inference'],
          icons: ['ai']
        }
      },
      {
        key: 'back',
        title: { en: 'Answer returned', fr: 'Réponse renvoyée' },
        hint: CLIENT
      }
    ]
  },

  {
    id: 'ci-cd',
    icon: 'git',
    name: { en: 'CI/CD pipeline', fr: 'Pipeline CI/CD' },
    tagline: {
      en: 'From the merged commit to the running version.',
      fr: 'Du commit fusionné à la version en service.'
    },
    steps: [
      {
        key: 'ci',
        title: { en: 'Pipeline triggered', fr: 'Pipeline déclenché' },
        description: {
          en: 'Merge to the main branch. Say what gates it — review, green tests, or both.',
          fr: 'Fusion sur la branche principale. Dire ce qui la garde : revue, tests verts, ou les deux.'
        },
        hint: {
          name: ['cicd', 'ci', 'cd', 'pipeline', 'build', 'actions', 'jenkins', 'gitlab', 'repo'],
          tech: ['github actions', 'ci', 'iac', 'gitlab ci'],
          icons: ['git', 'terminal']
        }
      },
      {
        key: 'artifact',
        title: { en: 'Artifact built', fr: 'Artefact construit' },
        hint: {
          name: ['container', 'containers', 'conteneurs', 'registry', 'image', 'docker', 'build', 'artifact', 'package'],
          tech: ['docker', 'compose', 'kubernetes', 'oci'],
          icons: ['docker', 'box', 'cube']
        }
      },
      {
        key: 'deploy',
        title: { en: 'Rolled out', fr: 'Déployé' },
        description: {
          en: 'Progressive or all at once — and how a rollback is triggered.',
          fr: 'Progressif ou en une fois, et comment un retour arrière se déclenche.'
        },
        hint: {
          /* `application`, never `app`: the short form is how half the client
           * surfaces in these documents are named, and a mobile app is not a
           * deployment target. */
          name: ['deploy', 'déploiement', 'orchestration', 'kubernetes', 'k8s', 'containers', 'conteneurs', 'platform', 'infra', 'application'],
          tech: ['kubernetes', 'docker', 'iac', 'terraform'],
          layers: ['infra', 'platform'],
          icons: ['docker', 'server', 'cloudup'],
          avoid: ['mobile', 'portal', 'front', 'marketing']
        }
      },
      {
        key: 'edge',
        title: { en: 'Traffic switched', fr: 'Trafic basculé' },
        hint: {
          name: ['proxy', 'gateway', 'balancer', 'lb', 'edge', 'cdn', 'ingress', 'traefik', 'passerelle'],
          tech: ['traefik', 'tls', 'acme', 'nginx'],
          layers: ['edge'],
          icons: ['route', 'globe']
        }
      },
      {
        key: 'verify',
        title: { en: 'Release watched', fr: 'Mise en service surveillée' },
        description: {
          en: 'Error rate and latency against the previous version. This is the step that decides a rollback.',
          fr: "Taux d'erreur et latence face à la version précédente. C'est l'étape qui décide d'un retour arrière."
        },
        hint: OBSERVABILITY
      }
    ]
  },

  {
    id: 'incident',
    icon: 'alert',
    name: { en: 'Alert and on-call', fr: 'Alerte et astreinte' },
    tagline: {
      en: 'From the first bad metric to the fix and its write-up.',
      fr: 'De la première métrique anormale au correctif et à son compte rendu.'
    },
    steps: [
      {
        key: 'service',
        title: { en: 'A service degrades', fr: 'Un service se dégrade' },
        hint: {
          ...API,
          avoid: []
        }
      },
      {
        key: 'signal',
        title: { en: 'The signal is seen', fr: 'Le signal est vu' },
        description: {
          en: 'Name the metric that fires, not just the dashboard it lives on.',
          fr: 'Nommer la métrique qui déclenche, pas seulement le tableau de bord où elle vit.'
        },
        hint: OBSERVABILITY
      },
      {
        key: 'notify',
        title: { en: 'On-call is paged', fr: "L'astreinte est alertée" },
        hint: {
          ...NOTIFY,
          name: ['alert', 'alerting', 'alerte', 'pager', 'astreinte', 'oncall', ...NOTIFY.name],
          icons: ['alert', 'bell', 'sms']
        }
      },
      {
        key: 'data',
        title: { en: 'The blast radius is measured', fr: "Le périmètre d'impact est mesuré" },
        description: {
          en: 'What is lost, what is only late, what is merely slow — three very different incidents.',
          fr: 'Ce qui est perdu, ce qui est seulement en retard, ce qui est juste lent : trois incidents très différents.'
        },
        hint: {
          name: ['queue', 'dlq', 'dead', 'rebut', 'database', 'db', 'store', 'warehouse', 'audit', 'log'],
          tech: ['dlq', 'append only', 'oltp'],
          layers: ['data', 'destinations'],
          icons: ['db', 'alert', 'chart']
        }
      },
      {
        key: 'fix',
        title: { en: 'The fix ships', fr: 'Le correctif part' },
        hint: {
          name: ['cicd', 'ci', 'cd', 'pipeline', 'deploy', 'containers', 'conteneurs', 'orchestration', 'infra', 'platform'],
          tech: ['github actions', 'ci', 'iac'],
          layers: ['infra', 'platform'],
          icons: ['git', 'docker']
        }
      }
    ]
  }
];

/**
 * The catalogue in one language, ready for the wire. `resolveDeep` walks the
 * whole structure, so hints — which are plain string arrays — pass through
 * untouched while every `{ en, fr }` pair collapses to its variant.
 */
export function resolveCatalogFromCode(lang: Lang): FlowPattern[] {
  return FLOW_CATALOG.map(tpl => ({
    ...resolveDeep<Omit<FlowPattern, 'source'>>(tpl, lang),
    source: 'catalog' as const
  }));
}

/** @deprecated import resolve-catalog.server for runtime; tests use code catalog */
export const resolveCatalog = resolveCatalogFromCode;

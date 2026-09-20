/* The enterprise referential's vocabulary.
 *
 * The rule that decides what belongs here has not changed: a kind earns its
 * place by being something a real question is asked about, *across projects*.
 * A metamodel with sixty element types is one nobody fills in, and a
 * referential nobody fills in answers no questions.
 *
 * What changed is that six kinds could not answer the questions TOGAF asks.
 * The list below is grouped by the layer each kind belongs to, and every one
 * of them carries the question it exists to answer —
 *
 *   business
 *     "which applications carry Billing?"           capability
 *     "what do we actually do, step by step?"       business-process
 *     "what do we offer, and to whom?"              business-service
 *     "what data does it hold?"                     business-object
 *     "who owns it?"                                actor
 *     "whose budget?"                               domain
 *   application
 *     "if I decommission this, who breaks?"         application
 *   technology
 *     "who still runs Java 8?"                      technology-standard
 *   motivation
 *     "what is pushing on us?"                      driver
 *     "which projects serve this objective?"        goal
 *     "what did we commit to holding to?"           principle
 *     "what must be true, and who checks?"          requirement
 *
 * The motivation kinds are the ones worth arguing about, because a document
 * already has a `motivation` block of its own. The difference is reach: an item
 * in that block is one document's reasoning, retyped in the next document and
 * countable in neither. A goal in the referential is one row that every project
 * can cite, which is what makes "which projects serve this objective" a query
 * instead of a reading exercise. `constraint` and `assessment` stay document-
 * local on purpose — both are judgements about one piece of work at one moment,
 * and promoting them would be filing paperwork rather than building a model.
 *
 * No dependency on the database or on React: this module is the shared
 * vocabulary and both the server and the browser import it.
 */

export type EntityKind =
  // business
  | 'capability'
  | 'business-process'
  | 'business-service'
  | 'business-object'
  | 'actor'
  | 'domain'
  // application
  | 'application'
  // technology
  | 'technology-standard'
  // motivation
  | 'driver'
  | 'goal'
  | 'principle'
  | 'requirement';

/** Declaration order, and the order the referential's filters are drawn in:
 *  business first, then the systems that serve it, then the reasoning. The
 *  motivation four follow the order an argument is made in, which is the same
 *  order `MOTIVATION_KINDS` uses. */
export const ENTITY_KINDS: EntityKind[] = [
  'capability', 'business-process', 'business-service', 'business-object', 'actor', 'domain',
  'application',
  'technology-standard',
  'driver', 'goal', 'principle', 'requirement'
];

/** Which layer each kind sits in. Used to group the filters, and to decide what
 *  an ArchiMate export calls it. */
export type EntityLayer = 'business' | 'application' | 'technology' | 'motivation';

export const ENTITY_LAYER: Record<EntityKind, EntityLayer> = {
  capability: 'business',
  'business-process': 'business',
  'business-service': 'business',
  'business-object': 'business',
  actor: 'business',
  domain: 'business',
  application: 'application',
  'technology-standard': 'technology',
  driver: 'motivation',
  goal: 'motivation',
  principle: 'motivation',
  requirement: 'motivation'
};

export const LAYER_LABELS: Record<EntityLayer, string> = {
  business: 'Business',
  application: 'Application',
  technology: 'Technology',
  motivation: 'Motivation'
};

export const ENTITY_LABELS: Record<EntityKind, string> = {
  capability: 'Capability',
  'business-process': 'Business process',
  'business-service': 'Business service',
  'business-object': 'Business object',
  actor: 'Actor',
  domain: 'Domain',
  application: 'Application',
  'technology-standard': 'Technology standard',
  driver: 'Driver',
  goal: 'Goal',
  principle: 'Principle',
  requirement: 'Requirement'
};

export const ENTITY_PLURALS: Record<EntityKind, string> = {
  capability: 'Capabilities',
  'business-process': 'Processes',
  'business-service': 'Business services',
  'business-object': 'Business objects',
  actor: 'Actors',
  domain: 'Domains',
  application: 'Applications',
  'technology-standard': 'Technology standards',
  driver: 'Drivers',
  goal: 'Goals',
  principle: 'Principles',
  requirement: 'Requirements'
};

export const ENTITY_BLURBS: Record<EntityKind, string> = {
  capability: 'What the business does, independent of who does it. Nests: L0 → L1 → L2.',
  'business-process': 'How it actually gets done, step by step. Nests, and can trigger another process.',
  'business-service': 'What the business offers, named from the outside — by whoever consumes it.',
  'business-object': 'Information the business cares about: a contract, a claim, a customer.',
  actor: 'A team, a role, or a person — whoever owns or operates something.',
  domain: 'A slice of the organisation. Nests.',
  application: 'A system that exists once, however many diagrams draw it.',
  'technology-standard': 'A technology with a decision attached to it.',
  driver: 'Something outside the architecture pushing on it — a regulation, a cost, a market.',
  goal: 'A state the enterprise intends to reach. Should be checkable. Nests into sub-goals.',
  principle: 'A rule the enterprise has chosen to hold to, and would have to argue to break.',
  requirement: 'Something an architecture must do, stated once and cited by every project it binds.'
};

/** Which kinds nest. Enforced on write, so a cycle cannot be stored.
 *
 *  Processes decompose the same way capabilities do, and a goal decomposes into
 *  the sub-goals that add up to it. Nothing else has a tree that readers walk. */
export const NESTING_KINDS: EntityKind[] = ['capability', 'domain', 'business-process', 'goal'];

/** The kinds that came from a document's own motivation block. Kept as a set of
 *  its own because several rules ask "is this reasoning or is this landscape?" */
export const MOTIVATION_ENTITY_KINDS: EntityKind[] =
  ['driver', 'goal', 'principle', 'requirement'];

export const isEntityKind = (v: unknown): v is EntityKind =>
  typeof v === 'string' && (ENTITY_KINDS as string[]).includes(v);

export const isMotivationEntityKind = (v: unknown): v is EntityKind =>
  isEntityKind(v) && MOTIVATION_ENTITY_KINDS.includes(v);

/* ---------------------------------------------------------------- status */

/** The vocabulary a technology radar already uses, so nobody has to learn a
 *  second one. `retire` is the one that earns the field: it is what makes
 *  "who still runs this" a question with an answer. */
export type StandardStatus = 'adopt' | 'trial' | 'hold' | 'retire';

export const STANDARD_STATUSES: StandardStatus[] = ['adopt', 'trial', 'hold', 'retire'];

export const STATUS_LABELS: Record<StandardStatus, string> = {
  adopt: 'Adopt', trial: 'Trial', hold: 'Hold', retire: 'Retire'
};

export const STATUS_BLURBS: Record<StandardStatus, string> = {
  adopt: 'The default choice for new work.',
  trial: 'Being evaluated on something real.',
  hold: 'No new use. What exists can stay.',
  retire: 'On its way out. Anything still on it is a migration waiting to be planned.'
};

export const isStandardStatus = (v: unknown): v is StandardStatus =>
  typeof v === 'string' && (STANDARD_STATUSES as string[]).includes(v);

/** Only a technology standard carries a radar decision. A capability is not
 *  "adopt". */
export const STATUS_KINDS: EntityKind[] = ['technology-standard'];

/* ------------------------------------------------------------- lifecycle */

/** Where something stands in its own life, which is a different question from
 *  whether the enterprise recommends it.
 *
 *  `status` above is a *decision* about a technology; this is a *fact* about an
 *  instance. Java 8 can be `retire` while the application running on it is very
 *  much `live`, and a portfolio review needs both words to say that sentence.
 *  Keeping them in one column would have made the cheaper question — "what is
 *  still running?" — unanswerable. */
export type EntityLifecycle = 'planned' | 'live' | 'sunset' | 'retired';

export const LIFECYCLES: EntityLifecycle[] = ['planned', 'live', 'sunset', 'retired'];

export const LIFECYCLE_LABELS: Record<EntityLifecycle, string> = {
  planned: 'Planned', live: 'Live', sunset: 'Sunset', retired: 'Retired'
};

export const LIFECYCLE_BLURBS: Record<EntityLifecycle, string> = {
  planned: 'Decided, not yet in service.',
  live: 'In service. The normal state.',
  sunset: 'Still in service, with an end already agreed.',
  retired: 'Out of service. Kept in the referential because history cites it.'
};

export const isLifecycle = (v: unknown): v is EntityLifecycle =>
  typeof v === 'string' && (LIFECYCLES as string[]).includes(v);

/** What has a life of its own. A capability does not retire — the things that
 *  carry it do. */
export const LIFECYCLE_KINDS: EntityKind[] =
  ['application', 'business-process', 'business-service'];

/* ----------------------------------------------------------- criticality */

/** How much it matters that this keeps working. The other half of a
 *  rationalisation: lifecycle says what is on its way out, criticality says
 *  what you cannot afford to get wrong on the way. */
export type Criticality = 'vital' | 'high' | 'medium' | 'low';

export const CRITICALITIES: Criticality[] = ['vital', 'high', 'medium', 'low'];

export const CRITICALITY_LABELS: Record<Criticality, string> = {
  vital: 'Vital', high: 'High', medium: 'Medium', low: 'Low'
};

export const CRITICALITY_BLURBS: Record<Criticality, string> = {
  vital: 'The business stops without it.',
  high: 'Material damage within a day.',
  medium: 'Painful, absorbable.',
  low: 'Nobody outside the team notices.'
};

export const isCriticality = (v: unknown): v is Criticality =>
  typeof v === 'string' && (CRITICALITIES as string[]).includes(v);

export const CRITICALITY_KINDS: EntityKind[] =
  ['application', 'business-process', 'business-service', 'business-object'];

/* ------------------------------------------------------------- relations */

export type RelationKind =
  | 'realizes'       // application | process | service → capability | service
  | 'serves'         // application | service | process → application | process | actor | domain
  | 'assigned-to'    // application | process | service → actor | domain
  | 'accesses'       // application | process → business-object
  | 'composed-of'    // parent → child, for anything that is not the parent_id tree
  | 'uses-standard'  // application | process | service → technology-standard
  | 'triggers'       // process → process
  | 'motivated-by';  // anything → driver | goal | principle | requirement

export const RELATION_KINDS: RelationKind[] = [
  'realizes', 'serves', 'assigned-to', 'accesses', 'composed-of', 'uses-standard',
  'triggers', 'motivated-by'
];

export const RELATION_LABELS: Record<RelationKind, string> = {
  realizes: 'realizes',
  serves: 'serves',
  'assigned-to': 'is owned by',
  accesses: 'accesses',
  'composed-of': 'is composed of',
  'uses-standard': 'uses',
  triggers: 'triggers',
  'motivated-by': 'is motivated by'
};

export const RELATION_BLURBS: Record<RelationKind, string> = {
  realizes: 'This is one of the things that makes that happen.',
  serves: 'That one depends on this one being there.',
  'assigned-to': 'Somebody is accountable for this.',
  accesses: 'It reads or writes that information.',
  'composed-of': 'That is a part of this.',
  'uses-standard': 'It runs on that technology.',
  triggers: 'Finishing this one starts that one.',
  'motivated-by': 'This exists because of that.'
};

export const isRelationKind = (v: unknown): v is RelationKind =>
  typeof v === 'string' && (RELATION_KINDS as string[]).includes(v);

/** What each relationship is allowed to join.
 *
 *  Until this existed nothing checked the ends: `createRelation` asked only that
 *  both rows be present, so "a capability is owned by a business object" stored
 *  cleanly and then quietly widened every query that read it. A metamodel whose
 *  rules live only in a comment is a metamodel that drifts on its first import.
 *
 *  `composed-of` is deliberately the open one — it is the escape hatch for the
 *  compositions the `parent_id` tree cannot express, and constraining it would
 *  mean predicting them. */
export const RELATION_ENDS: Record<RelationKind, { from: EntityKind[]; to: EntityKind[] }> = {
  realizes: {
    from: ['application', 'business-process', 'business-service'],
    to: ['capability', 'business-service']
  },
  serves: {
    from: ['application', 'business-service', 'business-process'],
    to: ['application', 'business-process', 'actor', 'domain']
  },
  'assigned-to': {
    from: ['application', 'business-process', 'business-service', 'business-object'],
    to: ['actor', 'domain']
  },
  accesses: {
    from: ['application', 'business-process'],
    to: ['business-object']
  },
  'composed-of': { from: ENTITY_KINDS, to: ENTITY_KINDS },
  'uses-standard': {
    from: ['application', 'business-process', 'business-service'],
    to: ['technology-standard']
  },
  triggers: {
    from: ['business-process'],
    to: ['business-process']
  },
  'motivated-by': {
    from: ENTITY_KINDS.filter(k => !MOTIVATION_ENTITY_KINDS.includes(k)),
    to: MOTIVATION_ENTITY_KINDS
  }
};

/** The relationships whose `from` end this kind can be. What the editor offers
 *  once you have picked a row, so the list is never a catalogue of what would
 *  be refused. */
export const relationsFrom = (kind: EntityKind): RelationKind[] =>
  RELATION_KINDS.filter(r => RELATION_ENDS[r].from.includes(kind));

/* -------------------------------------------------------------- records */

export interface Entity {
  id: string;
  kind: EntityKind;
  code?: string;
  name: string;
  parent?: string;
  /** technology-standard only: the radar decision. */
  status?: StandardStatus;
  /** `LIFECYCLE_KINDS` only: where this instance stands in its own life. */
  lifecycle?: EntityLifecycle;
  /** `CRITICALITY_KINDS` only. */
  criticality?: Criticality;
  description?: string;
  /** Where the row came from, when it did not come from this app: "cmdb",
   *  "servicenow", the name of a spreadsheet. Free text on purpose — the point
   *  is to be able to say "everything from the CMDB", not to enumerate the
   *  world's inventories. */
  source?: string;
  /** Its key *in that source*, which is what makes a re-import an update rather
   *  than a duplicate. Unique per source. */
  externalId?: string;
  /** ISO dates. What `lifecycle` means in numbers, for the roadmap. */
  startsOn?: string;
  endsOn?: string;
  /** Whatever this organisation tracks that this model does not: a cost centre,
   *  a hosting country, a DPIA reference.
   *
   *  Loaded on a single read, not on a listing — see `repository.ts`. An
   *  extension point rather than a modelling hole: anything that turns out to be
   *  asked about across projects should become a kind or a column, and this is
   *  where the evidence for that accumulates. */
  props?: Record<string, string>;
}

export interface Relation {
  id: string;
  kind: RelationKind;
  from: string;
  to: string;
  note?: string;
}

/** An entity plus what a listing wants to show beside it. */
export interface EntitySummary extends Entity {
  /** How many projects cite it, from the index. */
  usedBy: number;
}

/** A relation with both ends resolved, which is what any view of a neighbourhood
 *  needs and what the API returns rather than making the browser join. */
export interface ResolvedRelation extends Relation {
  fromName: string;
  fromKind: EntityKind;
  toName: string;
  toKind: EntityKind;
}

/* ------------------------------------------------- what a document cites */

/** One entry of a document's imprint: enough to render the citation offline,
 *  and not one field more.
 *
 *  The reason this exists at all is the whole architecture of the referential.
 *  A component could carry a bare entity id — that is what `brick` does — but a
 *  bare id only works for a field the viewer never renders. "This component
 *  carries the Billing capability" has to appear in the HTML someone emails to a
 *  committee, offline, six months later, with no referential in reach. An id
 *  would render as `cap_7f3a`.
 *
 *  So the document carries a frozen, denormalised copy of the names it cites.
 *  Renaming an entity updates every citing document on its next save; exports
 *  already sent keep the name of the day, which is the correct reading for a
 *  dated deliverable. */
export interface ImprintEntity {
  id: string;
  kind: EntityKind;
  code?: string;
  name: string;
  /** The parent's id, when the entity has one *and* the parent is also in the
   *  imprint — so a capability can be shown as "Sales › Billing" offline. */
  parent?: string;
}

export interface Imprint {
  /** When the copy was taken. Informational: it lets a reader see the document
   *  is quoting an older referential without needing one to compare against. */
  takenAt?: string;
  entities: ImprintEntity[];
}

/** What a component says about the referential. Every field optional, and the
 *  whole object absent when it says nothing — a document that uses none of this
 *  exports byte-for-byte as it did before the field existed.
 *
 *  Deliberately still four fields. Everything the referential gained — motivation
 *  kinds, processes, services — is cited at *document* level or through a
 *  relation, because widening this object is the one change that would reach
 *  `viewer/engine.js` and cost the mirror a rewrite. */
export interface ComponentEa {
  /** The application this box *is*, in the referential. */
  app?: string;
  /** Capabilities it carries. */
  capabilities?: string[];
  /** The actor who owns it. */
  owner?: string;
  /** Business objects it holds or touches. */
  objects?: string[];
}

/** The ways a citation can reach an entity. Stored on the index row so "used by"
 *  can say *how*, and so a reindex is a delete-and-rewrite rather than a diff.
 *
 *  The last two do not come from a component. They are the document's own
 *  reasoning citing something the whole enterprise shares — `motivation` for the
 *  goal or requirement an item restates, `realizes` for what the item names as
 *  serving it. Both are indexed exactly like the other four, which is what makes
 *  "which projects serve this objective" the same query as "which projects use
 *  this application", and what stops the imprint pruning an entry the components
 *  happen not to mention. */
export type LinkRole =
  'app' | 'capability' | 'owner' | 'object' | 'motivation' | 'realizes';

export const LINK_ROLES: LinkRole[] =
  ['app', 'capability', 'owner', 'object', 'motivation', 'realizes'];

/** Which entity kind each citation must point at. A reference to the wrong kind
 *  is dropped like a reference to nothing: pointing `owner` at a capability is
 *  not a smaller mistake than pointing it at a deleted row.
 *
 *  `motivation` is the one role that accepts more than one kind, because the
 *  four motivation kinds are interchangeable at the point of citation — a
 *  document says "this is why", and whether the why is a driver or a goal is the
 *  referential's business, not the citation's. */
export const ROLE_KINDS: Record<LinkRole, EntityKind[]> = {
  app: ['application'],
  capability: ['capability'],
  owner: ['actor'],
  object: ['business-object'],
  motivation: MOTIVATION_ENTITY_KINDS,
  /* The other direction of the same sentence: a motivation item naming what
   * realises it. Anything concrete can, which is every kind that is not itself
   * reasoning. */
  realizes: ENTITY_KINDS.filter(k => !MOTIVATION_ENTITY_KINDS.includes(k))
};

/** The single-kind view of `ROLE_KINDS`, kept for the four component roles that
 *  have exactly one. */
export const ROLE_KIND: Record<Exclude<LinkRole, 'motivation' | 'realizes'>, EntityKind> = {
  app: 'application',
  capability: 'capability',
  owner: 'actor',
  object: 'business-object'
};

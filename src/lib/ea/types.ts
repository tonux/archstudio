/* The enterprise referential's vocabulary.
 *
 * Six kinds and six relationships. That number is the design, not a starting
 * point: a metamodel with sixty element types is one nobody fills in, and a
 * referential nobody fills in answers no questions. Everything here has to earn
 * its place by being something a real question is asked about —
 *
 *   "which applications carry Billing?"            capability
 *   "if I decommission this, who breaks?"          application
 *   "who owns it?"                                 actor
 *   "what data does it hold?"                      business-object
 *   "who still runs Java 8?"                       technology-standard
 *   "whose budget?"                                domain
 *
 * No dependency on the database or on React: this module is the shared
 * vocabulary and both the server and the browser import it.
 */

export type EntityKind =
  | 'capability'
  | 'application'
  | 'actor'
  | 'business-object'
  | 'technology-standard'
  | 'domain';

export const ENTITY_KINDS: EntityKind[] = [
  'capability', 'application', 'actor', 'business-object', 'technology-standard', 'domain'
];

export const ENTITY_LABELS: Record<EntityKind, string> = {
  capability: 'Capability',
  application: 'Application',
  actor: 'Actor',
  'business-object': 'Business object',
  'technology-standard': 'Technology standard',
  domain: 'Domain'
};

export const ENTITY_PLURALS: Record<EntityKind, string> = {
  capability: 'Capabilities',
  application: 'Applications',
  actor: 'Actors',
  'business-object': 'Business objects',
  'technology-standard': 'Technology standards',
  domain: 'Domains'
};

export const ENTITY_BLURBS: Record<EntityKind, string> = {
  capability: 'What the business does, independent of who does it. Nests: L0 → L1 → L2.',
  application: 'A system that exists once, however many diagrams draw it.',
  actor: 'A team, a role, or a person — whoever owns or operates something.',
  'business-object': 'Information the business cares about: a contract, a claim, a customer.',
  'technology-standard': 'A technology with a decision attached to it.',
  domain: 'A slice of the organisation. Nests.'
};

/** Which kinds nest. Enforced on write, so a cycle cannot be stored. */
export const NESTING_KINDS: EntityKind[] = ['capability', 'domain'];

export const isEntityKind = (v: unknown): v is EntityKind =>
  typeof v === 'string' && (ENTITY_KINDS as string[]).includes(v);

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

/* ------------------------------------------------------------- relations */

export type RelationKind =
  | 'realizes'      // application → capability
  | 'serves'        // application → application
  | 'assigned-to'   // application → actor (or domain)
  | 'accesses'      // application → business-object
  | 'composed-of'   // parent → child, for anything that is not the parent_id tree
  | 'uses-standard';// application → technology-standard

export const RELATION_KINDS: RelationKind[] = [
  'realizes', 'serves', 'assigned-to', 'accesses', 'composed-of', 'uses-standard'
];

export const RELATION_LABELS: Record<RelationKind, string> = {
  realizes: 'realizes',
  serves: 'serves',
  'assigned-to': 'is owned by',
  accesses: 'accesses',
  'composed-of': 'is composed of',
  'uses-standard': 'uses'
};

export const isRelationKind = (v: unknown): v is RelationKind =>
  typeof v === 'string' && (RELATION_KINDS as string[]).includes(v);

/* -------------------------------------------------------------- records */

export interface Entity {
  id: string;
  kind: EntityKind;
  code?: string;
  name: string;
  parent?: string;
  status?: StandardStatus;
  description?: string;
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
 *  exports byte-for-byte as it did before the field existed. */
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

/** The four ways a component can cite an entity. Stored on the index row so
 *  "used by" can say *how*, and so a reindex is a delete-and-rewrite rather
 *  than a diff. */
export type LinkRole = 'app' | 'capability' | 'owner' | 'object';

export const LINK_ROLES: LinkRole[] = ['app', 'capability', 'owner', 'object'];

/** Which entity kind each citation must point at. A reference to the wrong kind
 *  is dropped like a reference to nothing: pointing `owner` at a capability is
 *  not a smaller mistake than pointing it at a deleted row. */
export const ROLE_KIND: Record<LinkRole, EntityKind> = {
  app: 'application',
  capability: 'capability',
  owner: 'actor',
  object: 'business-object'
};

/* The correspondence between this document and the ArchiMate metamodel.
 *
 * Declarative on purpose, and pointed the *outward* way only. ArchiMate has
 * around sixty element types and eleven relationship types with derivation rules
 * on top; adopting that internally would push it through three renderers, diff,
 * the Lego catalog, the AI schema, the sixty tested template snapshots, and
 * `viewer/engine.js` — which is written by hand because it ships inside the
 * export. The cost would be the product, and the author of a diagram would get
 * nothing for it.
 *
 * What an enterprise actually asks for is not internal fidelity, it is proof the
 * model can leave: "I can open this in Archi" ends the proprietary-tool
 * objection in thirty seconds. So the model stays as it is — it already *is* a
 * constrained ArchiMate profile — and this file is the thin layer that says so
 * out loud. It is also the specification the referential builds on later, which
 * is why it exists before the referential does.
 *
 * The deliberate subset is the same discipline as `src/lib/ai/schema.ts`: a
 * smaller vocabulary that is right, rather than a complete one that is guessed.
 */
import type { Component } from '../types';
import type { ZoneKind } from '../zones';

/** The element types this profile can emit.
 *
 *  Fifteen, chosen so every box on a sheet has an honest home and no more: an
 *  author picking from a list of sixty picks wrong. Business and motivation
 *  elements beyond these arrive with the business layer, not here. */
export type ArchimateElementType =
  // Business
  | 'BusinessActor'
  | 'BusinessRole'
  | 'BusinessProcess'
  | 'BusinessService'
  | 'BusinessObject'
  // Application
  | 'ApplicationComponent'
  | 'ApplicationService'
  | 'ApplicationInterface'
  | 'DataObject'
  // Technology
  | 'Node'
  | 'Device'
  | 'SystemSoftware'
  | 'TechnologyService'
  | 'Artifact'
  | 'CommunicationNetwork'
  // Other
  | 'Grouping';

/** Grouped the way ArchiMate groups them, because that is how the picker reads
 *  and how anyone who knows the notation expects to find a type. */
export const ARCHIMATE_GROUPS: { label: string; types: ArchimateElementType[] }[] = [
  {
    label: 'Application',
    types: ['ApplicationComponent', 'ApplicationService', 'ApplicationInterface', 'DataObject']
  },
  {
    label: 'Technology',
    types: ['Node', 'Device', 'SystemSoftware', 'TechnologyService', 'Artifact', 'CommunicationNetwork']
  },
  {
    label: 'Business',
    types: ['BusinessActor', 'BusinessRole', 'BusinessProcess', 'BusinessService', 'BusinessObject']
  },
  { label: 'Other', types: ['Grouping'] }
];

export const ARCHIMATE_TYPES: ArchimateElementType[] =
  ARCHIMATE_GROUPS.flatMap(g => g.types);

/** Spaced for a human — "Application Component" — since the XML wants the
 *  camel-case name and a picker does not. */
export const ARCHIMATE_LABELS: Record<ArchimateElementType, string> = Object.fromEntries(
  ARCHIMATE_TYPES.map(t => [t, t.replace(/([a-z])([A-Z])/g, '$1 $2')])
) as Record<ArchimateElementType, string>;

export const isArchimateType = (v: unknown): v is ArchimateElementType =>
  typeof v === 'string' && (ARCHIMATE_TYPES as string[]).includes(v);

/** What a box is unless the author says otherwise. */
export const DEFAULT_ELEMENT: ArchimateElementType = 'ApplicationComponent';

/* A hint keyed on the layer ids this app itself ships (`LAYER_DISPLAY` in
 * layers.ts). A layer someone named themselves falls through to the default,
 * which is the right answer: guessing from free text would be worse than being
 * predictable. */
const LAYER_DEFAULTS: Record<string, ArchimateElementType> = {
  platform: 'Node',
  infra: 'Node',
  compute: 'Node',
  data: 'SystemSoftware',
  index: 'SystemSoftware',
  /* A third party is consumed, not operated: what the model knows about it is
   * the service it offers, never what it is built from. */
  vendors: 'ApplicationService'
};

/** The type to emit for a component: the author's choice, else the layer's
 *  default, else an application component. */
export const elementTypeOf = (c: Component): ArchimateElementType =>
  c.archimate ?? LAYER_DEFAULTS[c.layer] ?? DEFAULT_ELEMENT;

/** A zone is a boundary, and ArchiMate has a different word for each kind of
 *  boundary. `Grouping` is the honest fallback — it is what ArchiMate offers for
 *  "these belong together" with no further claim. */
export const ZONE_ELEMENT: Record<ZoneKind, ArchimateElementType> = {
  platform: 'Node',
  network: 'CommunicationNetwork',
  gateway: 'Node',
  perimeter: 'Grouping',
  vendor: 'Grouping'
};

export const UNTYPED_ZONE: ArchimateElementType = 'Grouping';

export const zoneElementType = (kind: ZoneKind | undefined): ArchimateElementType =>
  (kind && ZONE_ELEMENT[kind]) || UNTYPED_ZONE;

/** The technology table's rows. `SystemSoftware` rather than `Artifact`: the
 *  table names things that run — Postgres, Kafka, Keycloak — not files. */
export const TECHNOLOGY_ELEMENT: ArchimateElementType = 'SystemSoftware';

/* ----------------------------------------------------------- relationships */

export type ArchimateRelationshipType =
  | 'Serving'
  | 'Composition'
  | 'Aggregation'
  | 'Realization'
  | 'Association';

/** Element types the exporter *synthesises*, and that an author never picks.
 *
 *  Kept out of `ArchimateElementType` on purpose: that set is what the inspector
 *  offers and what `Component.archimate` is validated against, and letting
 *  someone label a box "Plateau" would be labelling a component as a state of
 *  the world. These come from `Architecture.plateaus` instead. */
export type ArchimateSyntheticType =
  | 'Plateau' | 'Gap'
  /* Strategy: what the referential calls a capability is what ArchiMate calls
   * one, which is the rare case where the two vocabularies simply agree. */
  | 'Capability'
  /* Motivation, one for one with `MotivationKind`. This is the other place the
   * two vocabularies agree, and it is not a coincidence — the six words were
   * chosen from ArchiMate in the first place. */
  | 'Driver' | 'Goal' | 'Principle' | 'Requirement' | 'Constraint' | 'Assessment'
  /* Business: a flow is a path across components, told in the business's words. */
  | 'BusinessProcess' | 'ValueStream';

/** `MotivationKind` → the element ArchiMate already has for it. */
export const MOTIVATION_ELEMENT: Record<string, ArchimateSyntheticType> = {
  driver: 'Driver', goal: 'Goal', principle: 'Principle',
  requirement: 'Requirement', constraint: 'Constraint', assessment: 'Assessment'
};

/** A dependency becomes `Serving`, **and the direction inverts.**
 *
 *  This is the one thing in the whole mapping that is easy to get wrong and
 *  impossible to notice: `A.deps ∋ B` means A calls B, and ArchiMate's Serving
 *  points from the provider to the consumer — so it is `B --serving--> A`. A
 *  model exported the other way round opens perfectly and says the opposite of
 *  what the diagram says, which is worse than not exporting at all.
 *
 *  Every dependency gets `Serving` regardless of `kind`. Reading `async` as a
 *  `Flow` and `sync` as `Serving` would be inventing intent the document does
 *  not carry: `kind` says how a call travels, not whether the callee provides
 *  something. The kind rides on the relationship's documentation instead, where
 *  it is a fact rather than a reinterpretation. */
export const DEPENDENCY_RELATIONSHIP: ArchimateRelationshipType = 'Serving';

/** A zone contains its members, and a parent zone contains its children.
 *  Composition points whole → part. */
export const ZONE_RELATIONSHIP: ArchimateRelationshipType = 'Composition';

/** A component and a technology it names. `Association` rather than `Realization`
 *  or `Serving`: the document records that the two are related and nothing more
 *  precise, and a stronger relationship would be a claim it cannot support. */
export const TECHNOLOGY_RELATIONSHIP: ArchimateRelationshipType = 'Association';

/** A plateau *aggregates* what stands at it — Aggregation rather than
 *  Composition, because an application is not owned by a moment in time. It
 *  exists across several plateaus and belongs to none of them. */
export const PLATEAU_RELATIONSHIP: ArchimateRelationshipType = 'Aggregation';

/** A component realises a goal, not the other way round. `Realization` runs
 *  from the concrete to the abstract — the same direction `realizedBy` reads
 *  in, which is why the field is named that way rather than `realizes`. */
export const MOTIVATION_RELATIONSHIP: ArchimateRelationshipType = 'Realization';

/** An application component *serves* a business process. Not `Realization`: the
 *  component supports the process, it is not what the process is made of. */
export const PROCESS_RELATIONSHIP: ArchimateRelationshipType = 'Serving';

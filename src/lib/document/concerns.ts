import type { Architecture, Component } from '../types';

/** Closed concern vocabulary — single gating lever for CAF preset chapters. */
export type ConcernTag =
  | 'data'
  | 'iam'
  | 'tenancy'
  | 'network'
  | 'security'
  | 'ops'
  | 'dr'
  | 'observability'
  | 'governance'
  | 'cost'
  | 'decision:irreversible';

/** Maps each concern tag to zero or more preset section ids (1:n allowed). */
export const TAG_TO_PRESET: Record<ConcernTag, readonly string[]> = {
  data: ['add-data'],
  iam: ['add-iam'],
  security: ['add-iam'],
  tenancy: ['add-tenancy'],
  network: ['add-network'],
  ops: ['add-scale', 'add-cicd'],
  dr: ['add-dr'],
  observability: ['add-observability'],
  governance: ['add-governance'],
  cost: ['add-cost-mgmt'],
  'decision:irreversible': []
};

export function isConcernTag(value: unknown): value is ConcernTag {
  return typeof value === 'string' && Object.hasOwn(TAG_TO_PRESET, value);
}

/** Union of snapshotted concern tags from every placed component. */
export function aggregateConcerns(doc: Pick<Architecture, 'components'>): Set<ConcernTag> {
  const tags = new Set<ConcernTag>();
  for (const component of doc.components) {
    for (const tag of component.concernTags ?? []) {
      if (isConcernTag(tag)) tags.add(tag);
    }
  }
  return tags;
}

/** Derive gated preset section ids from an aggregated concern set. */
export function deriveGates(concerns: Iterable<ConcernTag | string>): Set<string> {
  const gates = new Set<string>();
  for (const tag of concerns) {
    if (!isConcernTag(tag)) continue;
    for (const id of TAG_TO_PRESET[tag]) {
      gates.add(id);
    }
  }
  return gates;
}

/** Printable description: catalog purpose wins over legacy role prose. */
export function componentDescription(component: Pick<Component, 'purpose' | 'role'>): string | undefined {
  return component.purpose || component.role;
}

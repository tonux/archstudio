/* The reasoning behind an architecture, kept honest.
 *
 * Small and separate because it is a closed vocabulary with one rule — a
 * pointer to something that is gone is dropped — and that rule is the same one
 * `normalizeLinks`, `normalizeEnvs` and `normalizeImprint` each apply to their
 * own field. Putting it in defaults.ts would have made a long file longer for
 * no gain.
 */
import type { Motivation, MotivationItem, MotivationKind } from './types';

export const MOTIVATION_KINDS: MotivationKind[] = [
  'driver', 'goal', 'principle', 'requirement', 'constraint', 'assessment'
];

export const MOTIVATION_LABELS: Record<MotivationKind, string> = {
  driver: 'Driver',
  goal: 'Goal',
  principle: 'Principle',
  requirement: 'Requirement',
  constraint: 'Constraint',
  assessment: 'Assessment'
};

/** What each word commits you to. Shown in the editor rather than in a tooltip,
 *  because the difference between a principle and a constraint is exactly the
 *  thing people get wrong and exactly the thing that makes the list useful. */
export const MOTIVATION_BLURBS: Record<MotivationKind, string> = {
  driver: 'Something outside the architecture that is pushing on it — a regulation, a cost, a market.',
  goal: 'A state you intend to reach. Should be checkable.',
  principle: 'A rule you have chosen to hold to, and would have to argue to break.',
  requirement: 'Something the architecture must do.',
  constraint: 'Something it must do it *within* — a budget, a deadline, an existing contract.',
  assessment: 'A judgement about where you stand today. What a driver looks like once someone has looked.'
};

export const isMotivationKind = (v: unknown): v is MotivationKind =>
  typeof v === 'string' && (MOTIVATION_KINDS as string[]).includes(v);

/** Well-formed items, once each, pointing only at things that exist.
 *
 *  Returns `undefined` rather than an empty object when nothing survives, so a
 *  document that says nothing about its reasoning exports exactly as it did
 *  before the field existed. */
export function normalizeMotivation(
  input: unknown, componentIds: Set<string>, entityIds: Set<string>
): Motivation | undefined {
  const list = (input as Motivation | undefined)?.items;
  if (!Array.isArray(list)) return undefined;

  const seen = new Set<string>();
  const items: MotivationItem[] = [];

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as MotivationItem;
    if (typeof item.id !== 'string' || !item.id || seen.has(item.id)) continue;
    if (!isMotivationKind(item.kind)) continue;
    seen.add(item.id);

    const clean: MotivationItem = {
      id: item.id, kind: item.kind, name: item.name?.trim() || item.id
    };
    if (item.text?.trim()) clean.text = item.text.trim();

    /* A component or an imprint entity, and nothing else. The two share one
     * list because a reader does not care which side of the model realises a
     * goal — only that something does. */
    const refs = (item.realizedBy || []).filter(
      (id, i, all) => typeof id === 'string'
        && (componentIds.has(id) || entityIds.has(id))
        && all.indexOf(id) === i
    );
    if (refs.length) clean.realizedBy = refs;

    items.push(clean);
  }

  return items.length ? { items } : undefined;
}

/** Items grouped in the declared vocabulary's order, skipping empty kinds.
 *  Drivers before goals before principles is the order an argument is made in. */
export function byKind(motivation: Motivation | undefined): { kind: MotivationKind; items: MotivationItem[] }[] {
  if (!motivation?.items.length) return [];
  return MOTIVATION_KINDS
    .map(kind => ({ kind, items: motivation.items.filter(i => i.kind === kind) }))
    .filter(g => g.items.length > 0);
}

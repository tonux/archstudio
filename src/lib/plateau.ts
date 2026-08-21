/* One document, several states of the world.
 *
 * The obvious way to draw a trajectory is two projects — an AS-IS and a TO-BE —
 * and a delta maintained by hand between two files that start diverging the day
 * after they are created. This is the other way: **one** document, in which each
 * component says when it arrives and when it leaves, and a pure function that
 * projects it at any plateau.
 *
 * What that buys is almost the whole feature for free, and the list is worth
 * reading because it is the argument for the design:
 *
 *   - `projectAt` returns an **ordinary document**. Every renderer already knows
 *     how to draw one.
 *   - The output is expressed in `state` — new / changed / removed — which the
 *     diagram, the SVG, the draw.io export, the printable document and
 *     `viewer/engine.js` have all understood since the transition toggle
 *     existed. **The manual mirror is not touched by this phase.**
 *   - `diff.ts` compares two projections without one line of new code, so "what
 *     changes between the 2026 plateau and the 2027 one" is a question the
 *     app could already answer and did not know it.
 *   - The export gains `?plateau=` in the same place, and with the same
 *     fall-back, as `?revisionId=`.
 *
 * The rule to keep: `plan` is input, `state` is output. Nothing downstream of
 * this file needs to know that plateaus exist.
 */
import type { Architecture, Component, Link, Plan, Plateau } from './types';
import type { Lifecycle } from './lifecycle';

/** Declaration order is time order. Never re-sorted — see `Plateau`. */
export const plateauIndex = (doc: Architecture): Map<string, number> =>
  new Map((doc.plateaus || []).map((p, i) => [p.id, i]));

export const plateauOf = (doc: Architecture, id: string): Plateau | undefined =>
  (doc.plateaus || []).find(p => p.id === id);

/** Where a planned thing stands at position `at`, or `null` when it is not
 *  there at all.
 *
 *  Two edges deserve their reasoning written down.
 *
 *  A plan referring to a plateau the document does not declare is ignored
 *  rather than obeyed: the alternative is a component that silently vanishes
 *  from every plateau because of a typo in an id nobody can see.
 *
 *  When `from` and `to` are the same plateau, the thing appears and is retired
 *  in the same breath. That is an authoring mistake, not a state — and
 *  `removed` wins, because marking something for removal is the most
 *  consequential thing this format can say and it must never be the mark that
 *  gets swallowed. */
export function stateAt(plan: Plan | undefined, at: number, order: Map<string, number>): Lifecycle | null | undefined {
  if (!plan) return undefined;

  const from = plan.from !== undefined ? order.get(plan.from) : undefined;
  const to = plan.to !== undefined ? order.get(plan.to) : undefined;
  const changed = plan.changed !== undefined ? order.get(plan.changed) : undefined;

  if (from !== undefined && at < from) return null;
  if (to !== undefined && at > to) return null;

  if (to !== undefined && at === to) return 'removed';
  /* `from` at position 0 is not an arrival, it is the baseline. */
  if (from !== undefined && at === from && from > 0) return 'new';
  if (changed !== undefined && at === changed) return 'changed';
  return undefined;
}

/** The document as it stands at one plateau.
 *
 *  Pure, and total. Returns the same object — not a copy — when there is
 *  nothing to project, so the ordinary path costs a lookup and an export of a
 *  document with no trajectory does not change by one byte. */
export function projectAt(doc: Architecture, plateauId: string): Architecture {
  const order = plateauIndex(doc);
  const at = order.get(plateauId);
  if (at === undefined) return doc;

  const components: Component[] = [];
  for (const c of doc.components || []) {
    const state = stateAt(c.plan, at, order);
    if (state === null) continue;
    components.push({ ...c, ...(state ? { state } : { state: undefined }) });
  }

  /* A dependency on something that is not in this plateau is not a dependency
   * in this plateau. Left in, it would draw an edge to a card that is not on
   * the sheet — and `deps` is the single source of truth for edges, so this is
   * the one place the filtering can happen. */
  const live = new Set(components.map(c => c.id));

  const projected = components.map(c => {
    const deps = (c.deps || []).filter(id => live.has(id));
    const links = (c.links || [])
      .filter(l => deps.includes(l.to))
      .map(l => projectLink(l, at, order))
      .filter((l): l is Link => l !== null);
    return { ...c, deps, ...(links.length ? { links } : { links: undefined }) };
  });

  /* A flow step pointing at a component this plateau does not have would crash
   * the viewer. A flow left with no steps is kept: an empty flow is what an
   * author sees while writing one, and dropping it here would make a plateau
   * silently lose their work when they exported it. */
  const flows = (doc.flows || []).map(f => ({
    ...f, steps: (f.steps || []).filter(s => live.has(s.component))
  }));

  return { ...doc, components: projected, flows };
}

function projectLink(link: Link, at: number, order: Map<string, number>): Link | null {
  const state = stateAt(link.plan, at, order);
  if (state === null) return null;
  return { ...link, ...(state ? { state } : { state: undefined }) };
}

/* -------------------------------------------------------------- roadmap */

export interface PlateauSummary {
  plateau: Plateau;
  /** Position, so a caller can say "the third step" without re-deriving it. */
  index: number;
  arriving: string[];
  leaving: string[];
  reworked: string[];
  /** How many components stand at this plateau in total. */
  total: number;
}

/** Every plateau, with what happens at it. The input to the roadmap section and
 *  to the selector in the toolbar.
 *
 *  Derived from the same projection the drawing uses, rather than from a second
 *  reading of `plan` — two implementations of "what is new at t1" would be two
 *  chances to disagree. */
export function summarise(doc: Architecture): PlateauSummary[] {
  const order = plateauIndex(doc);
  return (doc.plateaus || []).map((plateau, index) => {
    const arriving: string[] = [];
    const leaving: string[] = [];
    const reworked: string[] = [];
    let total = 0;

    for (const c of doc.components || []) {
      const state = stateAt(c.plan, index, order);
      if (state === null) continue;
      total++;
      if (state === 'new') arriving.push(c.name);
      else if (state === 'removed') leaving.push(c.name);
      else if (state === 'changed') reworked.push(c.name);
    }

    const sort = (xs: string[]) => xs.sort((a, b) => a.localeCompare(b));
    return {
      plateau, index,
      arriving: sort(arriving), leaving: sort(leaving), reworked: sort(reworked),
      total
    };
  });
}

/** Whether this document describes a trajectory at all. */
export const hasTrajectory = (doc: Architecture): boolean =>
  (doc.plateaus || []).length > 0;

/* --------------------------------------------------------- normalisation */

const KINDS = ['baseline', 'transition', 'target'] as const;
const isKind = (v: unknown): v is Plateau['kind'] =>
  typeof v === 'string' && (KINDS as readonly string[]).includes(v);

/** The declared plateaus: an id and a name, once each, in the order they were
 *  written. Never re-sorted — that order is the roadmap. */
export function normalizePlateaus(input: unknown): Plateau[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Plateau[] = [];
  for (const p of input as Plateau[]) {
    if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const clean: Plateau = { id: p.id, name: p.name?.trim() || p.id };
    if (p.date?.trim()) clean.date = p.date.trim();
    if (isKind(p.kind)) clean.kind = p.kind;
    out.push(clean);
  }
  return out;
}

/** A plan, keeping only references to plateaus this document declares.
 *
 *  The same rule as an unknown environment id or a link with no matching dep:
 *  a reference to something that is not there is dropped, so what is stored can
 *  always be read. Empty becomes `undefined` so a component with no trajectory
 *  exports exactly as it did before this field existed. */
export function normalizePlan(plan: Plan | undefined, ids: Set<string>): Plan | undefined {
  if (!plan || typeof plan !== 'object') return undefined;
  const out: Plan = {};
  if (typeof plan.from === 'string' && ids.has(plan.from)) out.from = plan.from;
  if (typeof plan.to === 'string' && ids.has(plan.to)) out.to = plan.to;
  if (typeof plan.changed === 'string' && ids.has(plan.changed)) out.changed = plan.changed;
  return Object.keys(out).length ? out : undefined;
}

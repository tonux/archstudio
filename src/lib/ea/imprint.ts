/* The document half of the referential: pure functions over an `Architecture`,
 * with no database in reach.
 *
 * This file is what `normalizeArchitecture` calls, so it runs on every read and
 * every write, in the browser as well as on the server. The three rules below
 * are the ones that make the imprint safe to trust:
 *
 *   1. A citation whose id is not in the imprint is dropped. Exactly the rule
 *      `normalizeLinks` applies to a link with no matching dep, and the one
 *      `normalizeEnvs` applies to an unknown environment id.
 *   2. An imprint entry nobody cites is pruned. Exactly
 *      `pruneUnusedLayersAndScopes`.
 *   3. Empty means absent. A document that uses none of this keeps exporting
 *      byte-for-byte as it did before the field existed — the invariant every
 *      optional field in this format already holds to.
 *
 * Rule 1 with rule 2 has a consequence worth stating: the imprint and the
 * citations can only ever be consistent with each other. They cannot be
 * consistent with the *referential* — that is the server's job, once per save,
 * in `hydrate.ts`.
 */
import type { Architecture, Component } from '../types';
import { isEntityKind, ROLE_KINDS, type ComponentEa, type Imprint, type ImprintEntity, type LinkRole } from './types';

/** Every entity id a component cites, with the role it cites it in. */
export function citations(c: Component): { id: string; role: LinkRole }[] {
  const ea = c.ea;
  if (!ea) return [];
  const out: { id: string; role: LinkRole }[] = [];
  if (ea.app) out.push({ id: ea.app, role: 'app' });
  if (ea.owner) out.push({ id: ea.owner, role: 'owner' });
  (ea.capabilities || []).forEach(id => out.push({ id, role: 'capability' }));
  (ea.objects || []).forEach(id => out.push({ id, role: 'object' }));
  return out;
}

/** Every entity id the document's *own reasoning* cites.
 *
 *  Two roles, from opposite ends of one sentence: `motivation` is the shared
 *  driver or goal an item restates, `realizes` is whatever the item names as
 *  serving it. `realizedBy` mixes component ids and entity ids in one list on
 *  purpose — a reader does not care which side of the model realises a goal —
 *  so anything that is not a component here is taken to be an entity.
 *
 *  `owner` carries the motivation item's id rather than a component's, which is
 *  what lets the index key these rows without inventing a fake component. */
export function motivationCitations(
  doc: Architecture
): { id: string; role: LinkRole; owner: string }[] {
  const items = doc.motivation?.items || [];
  if (!items.length) return [];
  const componentIds = new Set((doc.components || []).map(c => c.id));
  const out: { id: string; role: LinkRole; owner: string }[] = [];
  for (const item of items) {
    if (item.entity) out.push({ id: item.entity, role: 'motivation', owner: item.id });
    for (const ref of item.realizedBy || []) {
      if (!componentIds.has(ref)) out.push({ id: ref, role: 'realizes', owner: item.id });
    }
  }
  return out;
}

/** Every entity id cited anywhere in the document.
 *
 *  Components *and* the motivation block. Leaving the second one out was a quiet
 *  bug: rule 2 below prunes any imprint entry nobody cites, so an entity only a
 *  goal referred to was dropped from the imprint on one save and then dropped
 *  from the goal on the next, because `normalizeMotivation` keeps only what the
 *  imprint backs. Two saves and the citation was gone with nothing logged. */
export function citedIds(doc: Architecture): Set<string> {
  const out = new Set<string>();
  (doc.components || []).forEach(c => citations(c).forEach(x => out.add(x.id)));
  motivationCitations(doc).forEach(x => out.add(x.id));
  return out;
}

const cleanEntry = (raw: unknown): ImprintEntity | null => {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) return null;
  if (!isEntityKind(e.kind)) return null;
  const entry: ImprintEntity = {
    id: e.id,
    kind: e.kind,
    name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : e.id
  };
  if (typeof e.code === 'string' && e.code.trim()) entry.code = e.code.trim();
  if (typeof e.parent === 'string' && e.parent) entry.parent = e.parent;
  return entry;
};

/** The stored imprint, cleaned: well-formed entries, one per id, in a stable
 *  order so a document that did not change does not produce a different blob. */
function readImprint(raw: unknown): ImprintEntity[] {
  const list = (raw as Imprint | undefined)?.entities;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: ImprintEntity[] = [];
  for (const item of list) {
    const entry = cleanEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

const cleanRefs = (ids: unknown, known: Set<string>): string[] => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  return ids.filter((id): id is string =>
    typeof id === 'string' && known.has(id) && !seen.has(id) && !!seen.add(id));
};

/** Rules 1 and 3, for one component. Returns `undefined` when nothing survives,
 *  so the key disappears from the JSON rather than sitting there as `{}`. */
function normalizeComponentEa(
  ea: ComponentEa | undefined,
  byId: Map<string, ImprintEntity>
): ComponentEa | undefined {
  if (!ea || typeof ea !== 'object') return undefined;

  /* A reference is kept only if the imprint has that id *and* the entry is of
   * the kind the role requires. Pointing `owner` at a capability is not a
   * smaller mistake than pointing it at nothing. */
  const ofKind = (role: LinkRole) => {
    const want = ROLE_KINDS[role];
    return new Set([...byId.values()].filter(e => want.includes(e.kind)).map(e => e.id));
  };

  const out: ComponentEa = {};
  const apps = ofKind('app');
  if (typeof ea.app === 'string' && apps.has(ea.app)) out.app = ea.app;
  const owners = ofKind('owner');
  if (typeof ea.owner === 'string' && owners.has(ea.owner)) out.owner = ea.owner;

  const caps = cleanRefs(ea.capabilities, ofKind('capability'));
  if (caps.length) out.capabilities = caps;
  const objects = cleanRefs(ea.objects, ofKind('object'));
  if (objects.length) out.objects = objects;

  return Object.keys(out).length ? out : undefined;
}

/** The three rules, over a whole document. Called from `normalizeArchitecture`.
 *
 *  Mutates `doc` in place, matching the style of the pass it belongs to. */
export function normalizeImprint(doc: Architecture): void {
  const entries = readImprint((doc as { imprint?: unknown }).imprint);
  const byId = new Map(entries.map(e => [e.id, e]));

  /* Rule 1, on every component. */
  doc.components = (doc.components || []).map(c => {
    const ea = normalizeComponentEa(c.ea, byId);
    if (!ea) {
      const { ea: _drop, ...rest } = c;
      return rest as Component;
    }
    return { ...c, ea };
  });

  /* Rule 2 — prune what nobody cites, then keep the ancestors of what survives
   * so a capability can still be shown in its tree. A parent is worth carrying
   * precisely because it is *not* cited directly. */
  const keep = citedIds(doc);
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...keep]) {
      const parent = byId.get(id)?.parent;
      if (parent && byId.has(parent) && !keep.has(parent)) { keep.add(parent); grew = true; }
    }
  }

  const kept = entries
    .filter(e => keep.has(e.id))
    /* A parent reference that did not survive the prune would render as a
     * dangling breadcrumb, so it goes rather than the entry. */
    .map(e => (e.parent && keep.has(e.parent) ? e : stripParent(e)))
    .sort((a, b) => a.id.localeCompare(b.id));

  /* Rule 3. */
  const stored = (doc as { imprint?: Imprint }).imprint;
  if (!kept.length) {
    delete (doc as { imprint?: Imprint }).imprint;
    return;
  }
  const next: Imprint = { entities: kept };
  if (stored?.takenAt) next.takenAt = stored.takenAt;
  (doc as { imprint?: Imprint }).imprint = next;
}

const stripParent = (e: ImprintEntity): ImprintEntity => {
  const { parent: _drop, ...rest } = e;
  return rest;
};

/* ------------------------------------------------------------ for readers */

/** The imprint as a lookup. What the viewer, the inspector and the document
 *  renderer all need, and the only way any of them should resolve an id. */
export const imprintIndex = (doc: Architecture): Map<string, ImprintEntity> =>
  new Map(((doc as { imprint?: Imprint }).imprint?.entities || []).map(e => [e.id, e]));

/** Put an entity into the document's imprint if it is not there yet.
 *
 *  Optimistic only. The server rewrites the whole imprint from the referential
 *  on every save, so anything wrong here is corrected within one autosave — but
 *  without it a newly picked entity would render as its id until then, which
 *  looks broken.
 *
 *  Lives here rather than beside one picker because there are now two — a
 *  component citing an application, and a motivation item citing a shared
 *  objective — and a second copy would be a second place for the sort order to
 *  drift, which shows up as a document that reports an edit nobody made. */
export function rememberInImprint(doc: Architecture, entry: ImprintEntity): void {
  const imprint = (doc as { imprint?: Imprint }).imprint || { entities: [] };
  if (imprint.entities.some(e => e.id === entry.id)) return;
  (doc as { imprint?: Imprint }).imprint = {
    ...imprint,
    entities: [...imprint.entities, entry].sort((a, b) => a.id.localeCompare(b.id))
  };
}

/** "Sales › Billing" — an entity in its tree, using only what the document
 *  carries. Stops on a cycle, which normalisation should already have made
 *  impossible but which a hand-edited JSON import can still contain. */
export function entityPath(
  index: Map<string, ImprintEntity>, id: string, separator = ' › '
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let at: string | undefined = id;
  while (at && !seen.has(at)) {
    seen.add(at);
    const entry: ImprintEntity | undefined = index.get(at);
    if (!entry) break;
    parts.unshift(entry.name);
    at = entry.parent;
  }
  return parts.join(separator) || id;
}

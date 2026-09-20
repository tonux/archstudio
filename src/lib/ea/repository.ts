/* Every query the referential makes.
 *
 * Modelled on `src/lib/lego/repository.ts`, with one difference that is the
 * whole difference: the Lego catalog is *seeded* — written once from a file,
 * read for ever after. This one is written by people, at any time, and that is
 * where the work is. Entities can be renamed and deleted while documents cite
 * them, and every one of those cases has to have a defined answer.
 *
 * As with store.ts and auth/store.ts: all the SQL for this concern lives here.
 */
import { db, now, plain, plainAll, uid } from '../db';
import {
  CRITICALITY_KINDS, isCriticality, isEntityKind, isLifecycle, isRelationKind,
  isStandardStatus, LIFECYCLE_KINDS, NESTING_KINDS, RELATION_ENDS, STATUS_KINDS,
  type Entity, type EntityKind, type EntitySummary, type Relation, type RelationKind,
  type ResolvedRelation
} from './types';

const text = (o: Record<string, unknown>, key: string): string | undefined => {
  const v = o[key];
  return typeof v === 'string' && v ? v : undefined;
};

const toEntity = (o: Record<string, unknown>): Entity => {
  const e: Entity = {
    id: o.id as string,
    kind: o.kind as EntityKind,
    name: o.name as string
  };
  if (o.code) e.code = o.code as string;
  if (o.parent_id) e.parent = o.parent_id as string;
  if (o.status) e.status = o.status as Entity['status'];
  if (o.lifecycle) e.lifecycle = o.lifecycle as Entity['lifecycle'];
  if (o.criticality) e.criticality = o.criticality as Entity['criticality'];
  if (o.description) e.description = o.description as string;
  const source = text(o, 'source');
  if (source) e.source = source;
  const externalId = text(o, 'external_id');
  if (externalId) e.externalId = externalId;
  const startsOn = text(o, 'starts_on');
  if (startsOn) e.startsOn = startsOn;
  const endsOn = text(o, 'ends_on');
  if (endsOn) e.endsOn = endsOn;
  return e;
};

/* The description rides along on every read. One join rather than a second
 * query per row, and English for now — the bilingual column exists because the
 * rest of the catalog is bilingual and adding it later would be a migration. */
const COLUMNS = `e.id, e.kind, e.code, e.name, e.parent_id, e.status, e.lifecycle,
  e.criticality, e.source, e.external_id, e.starts_on, e.ends_on, t.description`;

const SELECT = `
  SELECT ${COLUMNS}
  FROM ea_entities e
  LEFT JOIN ea_entity_texts t ON t.entity_id = e.id AND t.lang = 'en'`;

/* ------------------------------------------------------------- reading */

/** One entity, with its free attributes.
 *
 *  Props are loaded here and nowhere else. A listing that joined them would
 *  return one row per key and force the caller to regroup, for a value no
 *  listing shows — so the second query is paid once, by the only screen that
 *  displays them. */
export function entity(id: string): Entity | null {
  const row = db.prepare(`${SELECT} WHERE e.id = ?`).get(id);
  if (!row) return null;
  const e = toEntity(plain(row));
  const props = readProps(id);
  if (props) e.props = props;
  return e;
}

export function entitiesByIds(ids: string[]): Entity[] {
  if (!ids.length) return [];
  const holes = ids.map(() => '?').join(', ');
  const rows = db.prepare(`${SELECT} WHERE e.id IN (${holes})`).all(...ids);
  return plainAll<Record<string, unknown>>(rows).map(toEntity);
}

export function entityByCode(kind: EntityKind, code: string): Entity | null {
  const row = db.prepare(`${SELECT} WHERE e.kind = ? AND lower(e.code) = lower(?)`)
    .get(kind, code.trim());
  return row ? toEntity(plain(row)) : null;
}

/** The row a system of record already knows about, whatever it is called here.
 *
 *  The key an import matches on before it considers code or name: a source's own
 *  id is the only identifier that survives somebody renaming the thing. */
export function entityBySource(source: string, externalId: string): Entity | null {
  const row = db.prepare(
    `${SELECT} WHERE lower(e.source) = lower(?) AND lower(e.external_id) = lower(?)`
  ).get(source.trim(), externalId.trim());
  return row ? toEntity(plain(row)) : null;
}

/** All entities of a kind, or all of them, each with how many projects cite it.
 *
 *  The count comes from the index rather than from the documents, which is what
 *  the index is for — the alternative is parsing every blob to render a list. */
export function listEntities(kind?: EntityKind): EntitySummary[] {
  const where = kind ? 'WHERE e.kind = ?' : '';
  const rows = db.prepare(`
    SELECT ${COLUMNS},
           (SELECT count(DISTINCT l.project_id) FROM project_entity_links l
             WHERE l.entity_id = e.id) AS used_by
    FROM ea_entities e
    LEFT JOIN ea_entity_texts t ON t.entity_id = e.id AND t.lang = 'en'
    ${where}
    ORDER BY e.kind, e.name COLLATE NOCASE
  `).all(...(kind ? [kind] : []));

  return plainAll<Record<string, unknown>>(rows)
    .map(o => ({ ...toEntity(o), usedBy: Number(o.used_by ?? 0) }));
}

export const countEntities = (): number =>
  plain<{ n: number }>(db.prepare('SELECT count(*) AS n FROM ea_entities').get()).n;

/** Which projects cite this entity, and through which components.
 *
 *  The literal answer to "where is this application used", and the reason the
 *  index exists at all. */
export interface Usage {
  projectId: string;
  projectName: string;
  componentId: string;
  role: string;
}

export function usage(entityId: string): Usage[] {
  const rows = db.prepare(`
    SELECT l.project_id, p.name AS project_name, l.component_id, l.role
    FROM project_entity_links l
    JOIN projects p ON p.id = l.project_id
    WHERE l.entity_id = ?
    ORDER BY p.name COLLATE NOCASE, l.component_id
  `).all(entityId);
  return plainAll<Record<string, unknown>>(rows).map(o => ({
    projectId: o.project_id as string,
    projectName: o.project_name as string,
    componentId: o.component_id as string,
    role: o.role as string
  }));
}

/* ------------------------------------------------------- free attributes */

function readProps(id: string): Record<string, string> | undefined {
  const rows = plainAll<{ key: string; value: string }>(
    db.prepare('SELECT key, value FROM ea_entity_props WHERE entity_id = ? ORDER BY key').all(id)
  );
  if (!rows.length) return undefined;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/** Replace the whole set, because a patch of a bag of keys has no meaning that
 *  every caller would read the same way: "the props are now these" does. */
function writeProps(id: string, props: Record<string, string> | null | undefined): void {
  if (props === undefined) return;
  db.prepare('DELETE FROM ea_entity_props WHERE entity_id = ?').run(id);
  if (!props) return;
  const insert = db.prepare(
    'INSERT OR REPLACE INTO ea_entity_props (entity_id, key, value) VALUES (?, ?, ?)'
  );
  for (const [rawKey, rawValue] of Object.entries(props)) {
    const key = rawKey.trim();
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    /* An empty value is how a key is removed, so it is never stored. */
    if (key && value) insert.run(id, key, value);
  }
}

/* ------------------------------------------------------------- writing */

export interface EntityPatch {
  kind?: EntityKind;
  code?: string | null;
  name?: string;
  parent?: string | null;
  status?: string | null;
  lifecycle?: string | null;
  criticality?: string | null;
  description?: string | null;
  source?: string | null;
  externalId?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  props?: Record<string, string> | null;
}

/** Whether making `parent` the parent of `id` would close a loop.
 *
 *  Capabilities, domains, processes and goals nest, and every reader walks that
 *  chain: a cycle is not a wrong tree, it is an infinite loop in whatever
 *  renders it. The same guard `normalizeZones` applies to zones, for the same
 *  reason. */
export function wouldCycle(id: string, parent: string | null | undefined): boolean {
  if (!parent) return false;
  if (parent === id) return true;
  const seen = new Set<string>([id]);
  let at: string | null = parent;
  while (at) {
    if (seen.has(at)) return true;
    seen.add(at);
    const row = db.prepare('SELECT parent_id FROM ea_entities WHERE id = ?').get(at) as
      { parent_id?: string | null } | undefined;
    at = row?.parent_id ?? null;
  }
  return false;
}

/* Each of the three closed vocabularies is legal only on the kinds it describes.
 * Written as one helper rather than three branches so a new vocabulary is one
 * line here and not a fourth shape to remember. */
const gated = <T>(
  kind: EntityKind, kinds: EntityKind[], value: unknown, ok: (v: unknown) => v is T
): T | null => (kinds.includes(kind) && ok(value) ? value : null);

const trimmed = (v: string | null | undefined): string | null => v?.trim() || null;

export function createEntity(input: EntityPatch & { kind: EntityKind; name: string }): Entity {
  if (!isEntityKind(input.kind)) throw new Error('Unknown kind.');
  const name = input.name.trim();
  if (!name) throw new Error('A name is required.');

  const id = uid('e_');
  const parent = NESTING_KINDS.includes(input.kind) && input.parent && !wouldCycle(id, input.parent)
    ? input.parent : null;

  db.prepare(
    `INSERT INTO ea_entities
       (id, kind, code, name, parent_id, status, lifecycle, criticality,
        source, external_id, starts_on, ends_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, input.kind, trimmed(input.code), name, parent,
    gated(input.kind, STATUS_KINDS, input.status, isStandardStatus),
    gated(input.kind, LIFECYCLE_KINDS, input.lifecycle, isLifecycle),
    gated(input.kind, CRITICALITY_KINDS, input.criticality, isCriticality),
    trimmed(input.source), trimmed(input.externalId),
    trimmed(input.startsOn), trimmed(input.endsOn)
  );

  writeDescription(id, input.description);
  writeProps(id, input.props);
  return entity(id)!;
}

export function updateEntity(id: string, patch: EntityPatch): Entity | null {
  const current = entity(id);
  if (!current) return null;

  const sets: string[] = [];
  const vals: (string | null)[] = [];
  const set = (column: string, value: string | null) => { sets.push(`${column} = ?`); vals.push(value); };

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('A name is required.');
    set('name', name);
  }
  if (patch.code !== undefined) set('code', trimmed(patch.code));
  if (patch.parent !== undefined) {
    /* Silently refusing a cycle would leave the caller thinking the move
     * happened. Refusing loudly is the only honest option. */
    if (patch.parent && wouldCycle(id, patch.parent)) {
      throw new Error('That would put this inside one of its own descendants.');
    }
    const allowed = NESTING_KINDS.includes(current.kind);
    set('parent_id', allowed ? patch.parent || null : null);
  }
  if (patch.status !== undefined) {
    set('status', gated(current.kind, STATUS_KINDS, patch.status, isStandardStatus));
  }
  if (patch.lifecycle !== undefined) {
    set('lifecycle', gated(current.kind, LIFECYCLE_KINDS, patch.lifecycle, isLifecycle));
  }
  if (patch.criticality !== undefined) {
    set('criticality', gated(current.kind, CRITICALITY_KINDS, patch.criticality, isCriticality));
  }
  if (patch.source !== undefined) set('source', trimmed(patch.source));
  if (patch.externalId !== undefined) set('external_id', trimmed(patch.externalId));
  if (patch.startsOn !== undefined) set('starts_on', trimmed(patch.startsOn));
  if (patch.endsOn !== undefined) set('ends_on', trimmed(patch.endsOn));

  if (sets.length) {
    set('updated_at', now());
    db.prepare(`UPDATE ea_entities SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  }
  if (patch.description !== undefined) writeDescription(id, patch.description);
  if (patch.props !== undefined) writeProps(id, patch.props);

  return entity(id);
}

/** Create or update, matched on the source's own key.
 *
 *  The one entry point an ingestion uses, and the reason `source` and
 *  `externalId` exist: running the same feed twice has to leave the referential
 *  where the first run left it. Matching on name would make a rename a
 *  duplicate; matching on code only works for the organisations that have one. */
export function upsertBySource(
  source: string, externalId: string, input: EntityPatch & { kind: EntityKind; name: string }
): { entity: Entity; created: boolean } {
  const existing = entityBySource(source, externalId);
  if (existing) {
    /* The kind is not patched from a feed. A row that changed kind is a
     * different thing wearing the same key, and silently rewriting it would
     * take every citation of it along. */
    const { kind: _ignored, ...rest } = input;
    return { entity: updateEntity(existing.id, rest)!, created: false };
  }
  return { entity: createEntity({ ...input, source, externalId }), created: true };
}

function writeDescription(id: string, description: string | null | undefined): void {
  if (description === undefined) return;
  const text = description?.trim();
  if (!text) {
    db.prepare("DELETE FROM ea_entity_texts WHERE entity_id = ? AND lang = 'en'").run(id);
    return;
  }
  db.prepare(
    `INSERT INTO ea_entity_texts (entity_id, lang, description) VALUES (?, 'en', ?)
     ON CONFLICT(entity_id, lang) DO UPDATE SET description = excluded.description`
  ).run(id, text);
}

/** Remove an entity.
 *
 *  Its relations and its index rows go with it, by cascade. What does *not* go
 *  is any document citing it: the blob is the truth and this function does not
 *  touch blobs. Those citations disappear on each document's next save, when
 *  the normaliser finds an imprint entry the referential no longer hydrates —
 *  which is the self-healing direction. The other direction, rewriting every
 *  document from here, would be a write amplification with no upper bound. */
export function deleteEntity(id: string): void {
  db.prepare('DELETE FROM ea_entities WHERE id = ?').run(id);
}

/* ----------------------------------------------------------- relations */

const toRelation = (o: Record<string, unknown>): Relation => {
  const r: Relation = {
    id: o.id as string,
    kind: o.kind as RelationKind,
    from: o.from_id as string,
    to: o.to_id as string
  };
  if (o.note) r.note = o.note as string;
  return r;
};

export function listRelations(entityId?: string): Relation[] {
  const rows = entityId
    ? db.prepare('SELECT * FROM ea_relations WHERE from_id = ? OR to_id = ? ORDER BY kind')
      .all(entityId, entityId)
    : db.prepare('SELECT * FROM ea_relations ORDER BY kind').all();
  return plainAll<Record<string, unknown>>(rows).map(toRelation);
}

/** The same rows with both ends named.
 *
 *  Joined here rather than in the browser: the neighbourhood of one entity is
 *  the screen that shows relations, and it would otherwise have to fetch the
 *  whole entity list to render four rows. */
export function listResolvedRelations(entityId?: string): ResolvedRelation[] {
  const where = entityId ? 'WHERE r.from_id = ? OR r.to_id = ?' : '';
  const rows = db.prepare(`
    SELECT r.*, f.name AS from_name, f.kind AS from_kind, t.name AS to_name, t.kind AS to_kind
    FROM ea_relations r
    JOIN ea_entities f ON f.id = r.from_id
    JOIN ea_entities t ON t.id = r.to_id
    ${where}
    ORDER BY r.kind, f.name COLLATE NOCASE, t.name COLLATE NOCASE
  `).all(...(entityId ? [entityId, entityId] : []));

  return plainAll<Record<string, unknown>>(rows).map(o => ({
    ...toRelation(o),
    fromName: o.from_name as string,
    fromKind: o.from_kind as EntityKind,
    toName: o.to_name as string,
    toKind: o.to_kind as EntityKind
  }));
}

/** Why a relationship was refused, or null when it would be accepted.
 *
 *  Separate from `createRelation` so the editor can grey out what would fail
 *  instead of letting somebody find out by pressing the button. */
export function relationProblem(
  kind: RelationKind, from: string, to: string
): string | null {
  if (!isRelationKind(kind)) return 'Unknown relationship.';
  if (from === to) return 'Something cannot relate to itself.';
  const a = entity(from);
  const b = entity(to);
  if (!a || !b) return 'Both ends have to exist.';

  const ends = RELATION_ENDS[kind];
  if (!ends.from.includes(a.kind)) return `A ${a.kind} cannot be the start of "${kind}".`;
  if (!ends.to.includes(b.kind)) return `"${kind}" cannot point at a ${b.kind}.`;
  return null;
}

export function createRelation(kind: RelationKind, from: string, to: string, note?: string): Relation {
  const problem = relationProblem(kind, from, to);
  if (problem) throw new Error(problem);

  const existing = db.prepare('SELECT * FROM ea_relations WHERE kind = ? AND from_id = ? AND to_id = ?')
    .get(kind, from, to);
  if (existing) return toRelation(plain(existing));

  const id = uid('rel_');
  db.prepare('INSERT INTO ea_relations (id, kind, from_id, to_id, note) VALUES (?, ?, ?, ?, ?)')
    .run(id, kind, from, to, note?.trim() || null);
  return toRelation(plain(db.prepare('SELECT * FROM ea_relations WHERE id = ?').get(id)));
}

export function deleteRelation(id: string): void {
  db.prepare('DELETE FROM ea_relations WHERE id = ?').run(id);
}

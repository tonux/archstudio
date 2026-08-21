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
  isEntityKind, isRelationKind, isStandardStatus, NESTING_KINDS,
  type Entity, type EntityKind, type EntitySummary, type Relation, type RelationKind
} from './types';

const toEntity = (o: Record<string, unknown>): Entity => {
  const e: Entity = {
    id: o.id as string,
    kind: o.kind as EntityKind,
    name: o.name as string
  };
  if (o.code) e.code = o.code as string;
  if (o.parent_id) e.parent = o.parent_id as string;
  if (o.status) e.status = o.status as Entity['status'];
  if (o.description) e.description = o.description as string;
  return e;
};

/* The description rides along on every read. One join rather than a second
 * query per row, and English for now — the bilingual column exists because the
 * rest of the catalog is bilingual and adding it later would be a migration. */
const SELECT = `
  SELECT e.id, e.kind, e.code, e.name, e.parent_id, e.status, t.description
  FROM ea_entities e
  LEFT JOIN ea_entity_texts t ON t.entity_id = e.id AND t.lang = 'en'`;

/* ------------------------------------------------------------- reading */

export function entity(id: string): Entity | null {
  const row = db.prepare(`${SELECT} WHERE e.id = ?`).get(id);
  return row ? toEntity(plain(row)) : null;
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

/** All entities of a kind, or all of them, each with how many projects cite it.
 *
 *  The count comes from the index rather than from the documents, which is what
 *  the index is for — the alternative is parsing every blob to render a list. */
export function listEntities(kind?: EntityKind): EntitySummary[] {
  const where = kind ? 'WHERE e.kind = ?' : '';
  const rows = db.prepare(`
    SELECT e.id, e.kind, e.code, e.name, e.parent_id, e.status, t.description,
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

/* ------------------------------------------------------------- writing */

export interface EntityPatch {
  kind?: EntityKind;
  code?: string | null;
  name?: string;
  parent?: string | null;
  status?: string | null;
  description?: string | null;
}

/** Whether making `parent` the parent of `id` would close a loop.
 *
 *  Capabilities and domains nest, and every reader walks that chain: a cycle is
 *  not a wrong tree, it is an infinite loop in whatever renders it. The same
 *  guard `normalizeZones` applies to zones, for the same reason. */
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

export function createEntity(input: EntityPatch & { kind: EntityKind; name: string }): Entity {
  if (!isEntityKind(input.kind)) throw new Error('Unknown kind.');
  const name = input.name.trim();
  if (!name) throw new Error('A name is required.');

  const id = uid('e_');
  const parent = NESTING_KINDS.includes(input.kind) && input.parent && !wouldCycle(id, input.parent)
    ? input.parent : null;
  const status = input.kind === 'technology-standard' && isStandardStatus(input.status)
    ? input.status : null;

  db.prepare(
    'INSERT INTO ea_entities (id, kind, code, name, parent_id, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, input.kind, input.code?.trim() || null, name, parent, status);

  writeDescription(id, input.description);
  return entity(id)!;
}

export function updateEntity(id: string, patch: EntityPatch): Entity | null {
  const current = entity(id);
  if (!current) return null;

  const sets: string[] = [];
  const vals: (string | null)[] = [];

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('A name is required.');
    sets.push('name = ?'); vals.push(name);
  }
  if (patch.code !== undefined) { sets.push('code = ?'); vals.push(patch.code?.trim() || null); }
  if (patch.parent !== undefined) {
    /* Silently refusing a cycle would leave the caller thinking the move
     * happened. Refusing loudly is the only honest option. */
    if (patch.parent && wouldCycle(id, patch.parent)) {
      throw new Error('That would put this inside one of its own descendants.');
    }
    const allowed = NESTING_KINDS.includes(current.kind);
    sets.push('parent_id = ?'); vals.push(allowed ? patch.parent || null : null);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    vals.push(current.kind === 'technology-standard' && isStandardStatus(patch.status)
      ? patch.status : null);
  }

  if (sets.length) {
    sets.push('updated_at = ?'); vals.push(now());
    db.prepare(`UPDATE ea_entities SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  }
  if (patch.description !== undefined) writeDescription(id, patch.description);

  return entity(id);
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

export function createRelation(kind: RelationKind, from: string, to: string, note?: string): Relation {
  if (!isRelationKind(kind)) throw new Error('Unknown relationship.');
  if (from === to) throw new Error('Something cannot relate to itself.');
  if (!entity(from) || !entity(to)) throw new Error('Both ends have to exist.');

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

/* The server half: the two things that need both a document and a database.
 *
 * `hydrateImprint` refreshes the copy a document carries. `reindex` rewrites
 * the rows that let a question be asked across documents. Both are called from
 * `updateProject`, in the same transaction as the write, and both are pure
 * consequences of the blob — which is the rule that makes the double write
 * safe to reason about:
 *
 *     the blob is the truth; the tables are an index that can be
 *     thrown away and rebuilt from it.
 *
 * When in doubt, `reindexAll()`.
 */
import { db } from '../db';
import type { Architecture } from '../types';
import { citations, citedIds, normalizeImprint } from './imprint';
import { entitiesByIds } from './repository';
import type { Imprint, ImprintEntity } from './types';

/** Refresh a document's imprint against the referential.
 *
 *  Three things happen, and the order matters:
 *
 *    - every cited id that the referential still knows gets its current name,
 *      code and parent copied in — this is what makes a rename propagate;
 *    - the ancestors of anything cited are copied in too, so a capability can
 *      be drawn in its tree offline;
 *    - a cited id the referential no longer knows is simply not written, and
 *      `normalizeImprint` then drops the citation. An entity deleted in the
 *      referential leaves each document on that document's next save, which is
 *      the only direction that does not mean rewriting every blob at once.
 *
 *  Returns a new document. Never mutates the one it is given: this runs inside
 *  `updateProject`, which still holds the caller's object. */
export function hydrateImprint(doc: Architecture): Architecture {
  const wanted = citedIds(doc);
  if (!wanted.size) {
    /* Nothing cited: the imprint has nothing to say, and rule 3 in
     * `normalizeImprint` will take the key out entirely. */
    return doc;
  }

  const entries = new Map<string, ImprintEntity>();
  let frontier = [...wanted];

  /* Ancestors are pulled in a generation at a time rather than one query per
   * entity: a capability tree is three deep, so this is three queries however
   * many capabilities a document cites. */
  while (frontier.length) {
    const found = entitiesByIds(frontier.filter(id => !entries.has(id)));
    const next: string[] = [];
    for (const e of found) {
      const entry: ImprintEntity = { id: e.id, kind: e.kind, name: e.name };
      if (e.code) entry.code = e.code;
      if (e.parent) { entry.parent = e.parent; next.push(e.parent); }
      entries.set(e.id, entry);
    }
    frontier = next.filter(id => !entries.has(id));
  }

  const imprint: Imprint = {
    takenAt: new Date().toISOString().slice(0, 10),
    entities: [...entries.values()].sort((a, b) => a.id.localeCompare(b.id))
  };

  return { ...doc, imprint } as Architecture;
}

/** Rewrite one project's index rows from its document.
 *
 *  Delete-then-insert rather than a diff. The row count per project is small,
 *  the operation is inside the caller's transaction, and a diff would be a
 *  second place for the index to drift from the blob — which is the one thing
 *  this design must not allow. */
export function reindexProject(projectId: string, doc: Architecture): void {
  db.prepare('DELETE FROM project_entity_links WHERE project_id = ?').run(projectId);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO project_entity_links (project_id, entity_id, component_id, role)
     VALUES (?, ?, ?, ?)`
  );
  /* `INSERT OR IGNORE` covers the one case the primary key rejects: a component
   * citing the same entity twice in the same role, which normalisation already
   * prevents but which an imported document can still contain.
   *
   * The foreign key on `entity_id` is doing real work here too — an id that
   * survived normalisation because the imprint knew it, but that the
   * referential does not have, is refused rather than indexed. */
  for (const c of doc.components || []) {
    for (const { id, role } of citations(c)) {
      try {
        insert.run(projectId, id, c.id, role);
      } catch {
        /* A citation to an entity that is not in the referential. The document
         * keeps it — the imprint can render it offline — but it is not a fact
         * the index may assert. */
      }
    }
  }

  writeStats(projectId, doc);
}

/** The derived counts the workspace listing reads, so listing projects stops
 *  meaning parsing every document. */
export function writeStats(projectId: string, doc: Architecture): void {
  db.prepare(
    `INSERT INTO project_stats (project_id, component_count, group_count, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(project_id) DO UPDATE SET
       component_count = excluded.component_count,
       group_count = excluded.group_count,
       updated_at = excluded.updated_at`
  ).run(projectId, (doc.components || []).length, (doc.groups || []).length);
}

/** Rebuild the whole index from the documents.
 *
 *  The escape hatch that makes the double write defensible: if the tables and
 *  the blobs ever disagree, this settles it in favour of the blobs. Called
 *  after a bulk import, and available to a maintainer who wants to be sure. */
export function reindexAll(): number {
  const rows = db.prepare('SELECT id, data FROM projects').all() as
    { id: string; data: string }[];
  let done = 0;
  for (const row of rows) {
    try {
      reindexProject(row.id, JSON.parse(row.data) as Architecture);
      done++;
    } catch {
      /* A corrupt document should not stop the rebuild of every other one. */
    }
  }
  return done;
}

/** Fill in the derived tables for documents written before they existed.
 *
 *  Runs once, on the first page load after an upgrade: a project with no stats
 *  row is a project from before this feature. Cheap to check — one COUNT
 *  against an indexed table — and it is what stops `listProjects` reporting
 *  zero components for every pre-existing project. */
export function backfillIndex(): void {
  const projects = (db.prepare('SELECT count(*) AS n FROM projects').get() as { n: number }).n;
  if (!projects) return;
  const stats = (db.prepare('SELECT count(*) AS n FROM project_stats').get() as { n: number }).n;
  if (stats >= projects) return;
  reindexAll();
}

/** Both halves, in the order they have to happen: hydrate first so the imprint
 *  carries what the referential knows, then let the caller normalise — which is
 *  what drops any citation the hydration could not back up. */
export const prepareForWrite = (doc: Architecture): Architecture => hydrateImprint(doc);

/** Convenience for tests and for the reindex endpoint. */
export function normalizedWithImprint(doc: Architecture): Architecture {
  const next = hydrateImprint(doc);
  normalizeImprint(next);
  return next;
}

import { db, uid, now, plain, plainAll } from './db';
import { applyResolvedFlowCopy } from './admin/flow-copy.server';
import { blankArchitecture, normalizeArchitecture } from './defaults';
import { RESTORE_LABEL, revisionKind } from './versions';
import type {
  Architecture, FolderRecord, ProjectRecord, ProjectSummary, ProjectWithData, RevisionRecord
} from './types';

/** Automatic snapshots kept per project. Oldest are pruned past this. */
const REVISION_CAP = 30;
/** Minimum gap between two automatic snapshots of the same project. */
const REVISION_INTERVAL_MS = 5 * 60_000;
/* `created_at` is `datetime('now')` — one-second granularity, so naming a
 * checkpoint during an autosave puts two rows in the same second and their
 * order becomes arbitrary. `rowid` is monotonic per insert and breaks the tie
 * the way a reader expects: last written, first shown. */
const NEWEST_FIRST = 'created_at DESC, rowid DESC';

/* `RESTORE_LABEL` is imported rather than declared: it is one of the two strings
 * that decide what kind of row a revision is, and both live in versions.ts so
 * the panel and the prune SQL can never drift apart on it. */
/** How many of those to keep. They are machine-written, so they get a ceiling
 *  of their own rather than the exemption a hand-named checkpoint gets. */
const RESTORE_CAP = 5;

/* ------------------------------------------------------------------ folders */

const folderRow = (r: unknown): FolderRecord => {
  const o = plain<Record<string, unknown>>(r);
  return {
    id: o.id as string, name: o.name as string, color: (o.color ?? null) as string | null,
    position: o.position as number, parentId: (o.parent_id ?? null) as string | null,
    createdAt: o.created_at as string, updatedAt: o.updated_at as string
  };
};

export function listFolders(): FolderRecord[] {
  return db.prepare('SELECT * FROM folders ORDER BY position, name').all().map(folderRow);
}

export function createFolder(name: string, parentId: string | null = null, color?: string): FolderRecord {
  const id = uid('f_');
  const max = plain<{ m: number | null }>(
    db.prepare('SELECT MAX(position) AS m FROM folders WHERE parent_id IS ?').get(parentId)
  ).m ?? -1;
  db.prepare(
    'INSERT INTO folders (id, name, color, position, parent_id) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, color ?? null, max + 1, parentId);
  return folderRow(db.prepare('SELECT * FROM folders WHERE id = ?').get(id));
}

export function updateFolder(
  id: string,
  patch: Partial<Pick<FolderRecord, 'name' | 'color' | 'position' | 'parentId'>>
): FolderRecord | null {
  if (patch.parentId !== undefined && wouldCycle(id, patch.parentId)) {
    throw new Error('A folder cannot be moved inside one of its own descendants.');
  }
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name); }
  if (patch.color !== undefined) { sets.push('color = ?'); vals.push(patch.color); }
  if (patch.position !== undefined) { sets.push('position = ?'); vals.push(patch.position); }
  if (patch.parentId !== undefined) { sets.push('parent_id = ?'); vals.push(patch.parentId); }
  if (!sets.length) return getFolder(id);
  sets.push('updated_at = ?'); vals.push(now());
  db.prepare(`UPDATE folders SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return getFolder(id);
}

export function getFolder(id: string): FolderRecord | null {
  const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
  return row ? folderRow(row) : null;
}

/** Deleting a folder cascades to sub-folders; its projects fall back to the root. */
export function deleteFolder(id: string): void {
  const ids = descendants(id);
  const marks = ids.map(() => '?').join(',');
  db.prepare(`UPDATE projects SET folder_id = NULL WHERE folder_id IN (${marks})`).run(...ids);
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
}

function descendants(id: string): string[] {
  const all = listFolders();
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    all.filter(f => f.parentId === out[i]).forEach(f => out.push(f.id));
  }
  return out;
}

function wouldCycle(id: string, nextParent: string | null): boolean {
  if (!nextParent) return false;
  if (nextParent === id) return true;
  return descendants(id).includes(nextParent);
}

/* ----------------------------------------------------------------- projects */

const projectRow = (r: unknown): ProjectRecord & { data?: string } => {
  const o = plain<Record<string, unknown>>(r);
  return {
    id: o.id as string, name: o.name as string,
    description: (o.description ?? null) as string | null,
    accent: (o.accent ?? null) as string | null,
    position: o.position as number,
    folderId: (o.folder_id ?? null) as string | null,
    createdAt: o.created_at as string, updatedAt: o.updated_at as string,
    data: o.data as string | undefined
  };
};

export function listProjects(): ProjectSummary[] {
  const rows = db.prepare(
    'SELECT id, name, description, accent, position, folder_id, data, created_at, updated_at FROM projects ORDER BY position, name'
  ).all();
  return rows.map(r => {
    const p = projectRow(r);
    let componentCount = 0, groupCount = 0;
    try {
      const doc = JSON.parse(p.data as string) as Architecture;
      componentCount = doc.components?.length ?? 0;
      groupCount = doc.groups?.length ?? 0;
    } catch { /* a corrupt document should not break the list */ }
    const { data: _drop, ...rest } = p;
    return { ...rest, componentCount, groupCount };
  });
}

export function getProject(id: string): ProjectWithData | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) return null;
  const p = projectRow(row);
  const { data, ...rest } = p;
  return { ...rest, data: normalizeArchitecture(JSON.parse(data as string)) };
}

export function createProject(input: {
  name: string; folderId?: string | null; description?: string; accent?: string;
  data?: Partial<Architecture>;
}): ProjectWithData {
  const id = uid('p_');
  let doc = input.data
    ? normalizeArchitecture(input.data)
    : blankArchitecture(input.name);
  doc = applyResolvedFlowCopy(doc);
  doc.meta.name = doc.meta.name || input.name;

  const max = plain<{ m: number | null }>(
    db.prepare('SELECT MAX(position) AS m FROM projects WHERE folder_id IS ?').get(input.folderId ?? null)
  ).m ?? -1;

  db.prepare(
    'INSERT INTO projects (id, name, description, accent, position, folder_id, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, input.name, input.description ?? null, input.accent ?? null,
        max + 1, input.folderId ?? null, JSON.stringify(doc));

  return getProject(id)!;
}

export function updateProject(
  id: string,
  patch: {
    name?: string; description?: string | null; accent?: string | null;
    folderId?: string | null; position?: number; data?: Architecture;
  }
): ProjectWithData | null {
  const current = getProject(id);
  if (!current) return null;

  if (patch.data) maybeSnapshot(id, current.data);

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name); }
  if (patch.description !== undefined) { sets.push('description = ?'); vals.push(patch.description); }
  if (patch.accent !== undefined) { sets.push('accent = ?'); vals.push(patch.accent); }
  if (patch.folderId !== undefined) { sets.push('folder_id = ?'); vals.push(patch.folderId); }
  if (patch.position !== undefined) { sets.push('position = ?'); vals.push(patch.position); }
  if (patch.data !== undefined) {
    sets.push('data = ?');
    vals.push(JSON.stringify(normalizeArchitecture(patch.data)));
  }
  if (!sets.length) return current;
  sets.push('updated_at = ?'); vals.push(now());
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return getProject(id);
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function duplicateProject(id: string): ProjectWithData | null {
  const src = getProject(id);
  if (!src) return null;
  return createProject({
    name: `${src.name} (copy)`,
    folderId: src.folderId,
    description: src.description ?? undefined,
    accent: src.accent ?? undefined,
    data: src.data
  });
}

/* ---------------------------------------------------------------- revisions */

/** Write a snapshot of `document` and prune the project back to the cap. */
function writeSnapshot(projectId: string, document: Architecture, label: string | null): string {
  const id = uid('r_');
  db.prepare('INSERT INTO revisions (id, project_id, data, label) VALUES (?, ?, ?, ?)')
    .run(id, projectId, JSON.stringify(document), label);

  /* Only unlabelled snapshots are pruned. A checkpoint someone named — "sent to
   * the client", "before the Azure rewrite" — is the one thing in this table
   * worth keeping, and an afternoon of autosaves would otherwise push it out. */
  db.prepare(
    `DELETE FROM revisions WHERE project_id = ? AND label IS NULL AND id NOT IN
     (SELECT id FROM revisions WHERE project_id = ? AND label IS NULL
      ORDER BY ${NEWEST_FIRST} LIMIT ?)`
  ).run(projectId, projectId, REVISION_CAP);

  return id;
}

function maybeSnapshot(projectId: string, previous: Architecture): void {
  const last = db.prepare(
    `SELECT created_at FROM revisions WHERE project_id = ? ORDER BY ${NEWEST_FIRST} LIMIT 1`
  ).get(projectId) as { created_at?: string } | undefined;

  if (last?.created_at) {
    const age = Date.now() - new Date(last.created_at.replace(' ', 'T') + 'Z').getTime();
    if (age < REVISION_INTERVAL_MS) return;
  }

  writeSnapshot(projectId, previous, null);
}

/** Snapshot the project as it stands now, on demand and whatever the interval. */
export function createRevision(projectId: string, label?: string): RevisionRecord | null {
  const current = getProject(projectId);
  if (!current) return null;
  const id = writeSnapshot(projectId, current.data, label?.trim() || null);
  return listRevisions(projectId).find(r => r.id === id) ?? null;
}

/** Freeze the current document as a numbered version.
 *
 *  The number goes *into the document* before the snapshot is taken, not beside
 *  it. That is the whole design: a frozen version is a document that knows what
 *  it is called, so exporting it prints the right number on the cover and in the
 *  viewer's subtitle without anything downstream having to be told which
 *  revision it came from. It also means freezing is a real edit — undoable, and
 *  reported in the history as a "Version" change like any other field.
 *
 *  Order matters. `updateProject` may write its own five-minute snapshot of the
 *  *previous* document on the way through, which is the state just before the
 *  freeze and worth keeping; the version's own snapshot is written after it, so
 *  it is the newest row and the one the panel opens on. */
export function freezeVersion(
  projectId: string, version: string, label?: string
): RevisionRecord | null {
  const current = getProject(projectId);
  if (!current) return null;

  const number = version.trim();
  const data: Architecture = number
    ? { ...current.data, meta: { ...current.data.meta, version: number } }
    : current.data;

  const saved = updateProject(projectId, { data });
  if (!saved) return null;

  const id = writeSnapshot(projectId, saved.data, label?.trim() || null);
  return listRevisions(projectId).find(r => r.id === id) ?? null;
}

export function listRevisions(projectId: string): RevisionRecord[] {
  const rows = db.prepare(
    `SELECT id, project_id, label, created_at, data FROM revisions WHERE project_id = ? ORDER BY ${NEWEST_FIRST}`
  ).all(projectId);
  return plainAll<Record<string, unknown>>(rows)
    .map(o => {
      let componentCount = 0;
      let version: string | null = null;
      try {
        /* One parse, two answers. The number a version carries is the document's
         * own `meta.version` — there is no column for it and there does not need
         * to be, because this row was already being read to count components. */
        const doc = JSON.parse(o.data as string) as Architecture;
        componentCount = doc.components?.length ?? 0;
        version = doc.meta?.version?.trim() || null;
      } catch { /* a corrupt snapshot should still be listed, and restorable */ }
      const label = (o.label ?? null) as string | null;
      return {
        id: o.id as string, projectId: o.project_id as string,
        label, createdAt: o.created_at as string,
        componentCount, version, kind: revisionKind(label)
      };
    });
}

/** The document a snapshot holds — what the history panel diffs against. */
export function getRevisionData(projectId: string, revisionId: string): Architecture | null {
  const row = db.prepare('SELECT data FROM revisions WHERE id = ? AND project_id = ?')
    .get(revisionId, projectId) as { data?: string } | undefined;
  if (!row?.data) return null;
  return normalizeArchitecture(JSON.parse(row.data));
}

/** Name a snapshot, or clear its name with an empty string. */
export function labelRevision(projectId: string, revisionId: string, label: string): RevisionRecord | null {
  db.prepare('UPDATE revisions SET label = ? WHERE id = ? AND project_id = ?')
    .run(label.trim() || null, revisionId, projectId);
  return listRevisions(projectId).find(r => r.id === revisionId) ?? null;
}

export function deleteRevision(projectId: string, revisionId: string): void {
  db.prepare('DELETE FROM revisions WHERE id = ? AND project_id = ?').run(revisionId, projectId);
}

export function restoreRevision(projectId: string, revisionId: string): ProjectWithData | null {
  const data = getRevisionData(projectId, revisionId);
  if (!data) return null;

  /* Restoring is itself an edit, and the most destructive one the app offers.
   * The current document is snapshotted unconditionally first — going through
   * `maybeSnapshot` would skip it inside the five-minute window, which is
   * exactly when a restore is most likely to be a misclick. */
  const current = getProject(projectId);
  if (current) {
    writeSnapshot(projectId, current.data, RESTORE_LABEL);
    db.prepare(
      `DELETE FROM revisions WHERE project_id = ? AND label = ? AND id NOT IN
       (SELECT id FROM revisions WHERE project_id = ? AND label = ?
        ORDER BY ${NEWEST_FIRST} LIMIT ?)`
    ).run(projectId, RESTORE_LABEL, projectId, RESTORE_LABEL, RESTORE_CAP);
  }

  return updateProject(projectId, { data });
}

/* -------------------------------------------------------------------- seed */

export function isEmpty(): boolean {
  const n = plain<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).n;
  return n === 0;
}

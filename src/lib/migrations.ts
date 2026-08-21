/* Ordered, one-shot schema changes.
 *
 * db.ts re-runs a block of CREATE TABLE IF NOT EXISTS on every connection. That
 * is enough for an additive table and nothing else: an index, a constraint, or a
 * column on an existing table would only ever land on a *fresh* file, and the
 * difference would not show up until someone else cloned the repo. It was a fair
 * trade for three tables and one user, and it stops being one the moment two
 * people share an install.
 *
 * So the order of preference stays:
 *
 *   1. A side table. `CREATE TABLE IF NOT EXISTS side (owner_id TEXT PRIMARY KEY
 *      REFERENCES owner(id) ON DELETE CASCADE, …)` plus a LEFT JOIN needs no
 *      migration at all, works on a live file today, and covers most of what a
 *      new feature actually wants — because most of it is a new entity, not a
 *      new attribute on an old one.
 *   2. JSON, for anything nobody queries: `settings` for operator configuration,
 *      `projects.data` for anything scoped to one document.
 *   3. This file, for the rest.
 */
import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  /** Stable and ordered. Never rewritten once shipped. */
  id: string;
  /** One or more statements. Runs inside the same transaction as the ledger row,
   *  so a failure halfway through leaves the database as it was. */
  sql: string;
}

/** Append only.
 *
 *  Editing a shipped entry does nothing to a database that already ran it, which
 *  makes the edit invisible until someone clones fresh — the worst kind of bug to
 *  find, because it reproduces on exactly one machine. Add a new entry instead. */
export const MIGRATIONS: Migration[] = [];

const LEDGER = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);`;

/** Whether a table exists. */
export function hasTable(db: DatabaseSync, table: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return row !== undefined;
}

/** Whether a column exists on a table.
 *
 *  `pragma_table_info` is the table-valued form, so the table name binds as a
 *  parameter instead of being pasted into the SQL. It returns no rows for a table
 *  that does not exist, which makes this answer `false` rather than throw — the
 *  useful reading when a migration has to cope with a file that predates it. */
export function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare('SELECT name FROM pragma_table_info(?)').all(table) as {
    name: string;
  }[];
  return rows.some(r => r.name === column);
}

/** Runs whatever has not run yet, in order. Returns the ids applied by this call.
 *
 *  Idempotent, and safe to call from more than one process against the same file.
 *  `list` exists for tests: production always passes the module's own array. */
export function applyMigrations(db: DatabaseSync, list: Migration[] = MIGRATIONS): string[] {
  db.exec(LEDGER);

  /* Cheap path first, outside any lock: on a database that is up to date — which
   * is every call after the first — this is one indexed read and no transaction. */
  if (!list.length || pending(db, list).length === 0) return [];

  /* BEGIN IMMEDIATE takes the write lock up front rather than on the first write.
   * Next runs more than one process against this file — the dev server and a
   * build, or several `next build` collection workers racing on a fresh one — and
   * a deferred transaction would let two of them both read an empty ledger before
   * either wrote to it, so both would try the same ALTER and the loser would die
   * on a duplicate column. With IMMEDIATE the second waits out the busy_timeout
   * db.ts sets, then re-reads the ledger below and finds the work already done. */
  db.exec('BEGIN IMMEDIATE');
  try {
    const todo = pending(db, list);
    const record = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)');
    for (const m of todo) {
      db.exec(m.sql);
      record.run(m.id);
    }
    db.exec('COMMIT');
    return todo.map(m => m.id);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function pending(db: DatabaseSync, list: Migration[]): Migration[] {
  const done = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map(r => r.id)
  );
  return list.filter(m => !done.has(m.id));
}

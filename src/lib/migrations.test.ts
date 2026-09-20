/* The claim under test is narrow and it is the whole point: a migration runs
 * exactly once against a file that already exists.
 *
 * "Exactly once" needs no bookkeeping assertion to check, because SQLite checks
 * it for us — a second `ALTER TABLE … ADD COLUMN label` fails outright. So the
 * test that matters is simply calling applyMigrations twice and not throwing.
 */

import { strict as assert } from 'node:assert';
import { after, describe, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { applyMigrations, hasColumn, hasTable, MIGRATIONS, type Migration } from './migrations';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-migrations-'));
after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

let n = 0;
/** A database standing in for one that predates this file: a table with a row
 *  in it, and no ledger. */
function legacyDb(): DatabaseSync {
  const db = new DatabaseSync(path.join(DIR, `m${n++}.db`));
  db.exec(`CREATE TABLE things (id TEXT PRIMARY KEY);
           INSERT INTO things (id) VALUES ('kept');`);
  return db;
}

const addLabel: Migration = {
  id: '001-things-label',
  sql: 'ALTER TABLE things ADD COLUMN label TEXT'
};

describe('applyMigrations', () => {
  test('applies to a database that predates the ledger, keeping its rows', () => {
    const db = legacyDb();
    assert.equal(hasTable(db, 'schema_migrations'), false);

    assert.deepEqual(applyMigrations(db, [addLabel]), ['001-things-label']);

    assert.equal(hasTable(db, 'schema_migrations'), true);
    assert.equal(hasColumn(db, 'things', 'label'), true);
    assert.equal(
      (db.prepare('SELECT id FROM things').all() as { id: string }[]).length, 1,
      'the migration must not cost the file its data'
    );
    db.close();
  });

  test('runs each migration exactly once', () => {
    const db = legacyDb();
    applyMigrations(db, [addLabel]);

    /* A second ALTER would throw "duplicate column name". Getting an empty list
     * back is the proof. */
    assert.deepEqual(applyMigrations(db, [addLabel]), []);
    assert.deepEqual(applyMigrations(db, [addLabel]), []);
    db.close();
  });

  test('applies only what is new when the list grows', () => {
    const db = legacyDb();
    applyMigrations(db, [addLabel]);

    const addNote: Migration = {
      id: '002-things-note',
      sql: 'ALTER TABLE things ADD COLUMN note TEXT'
    };
    assert.deepEqual(applyMigrations(db, [addLabel, addNote]), ['002-things-note']);
    assert.equal(hasColumn(db, 'things', 'note'), true);
    db.close();
  });

  test('leaves the database untouched when one statement fails', () => {
    const db = legacyDb();
    const bad: Migration = { id: '002-bad', sql: 'ALTER TABLE nope ADD COLUMN x TEXT' };

    assert.throws(() => applyMigrations(db, [addLabel, bad]));

    /* Both were in one transaction, so the good one rolled back with the bad
     * one — and neither is recorded, so a fixed list can run cleanly later. */
    assert.equal(hasColumn(db, 'things', 'label'), false);
    assert.deepEqual(db.prepare('SELECT id FROM schema_migrations').all(), []);
    db.close();
  });

  test('an empty list creates the ledger and nothing else', () => {
    const db = legacyDb();
    assert.deepEqual(applyMigrations(db, []), []);
    assert.equal(hasTable(db, 'schema_migrations'), true);
    db.close();
  });
});

describe('hasTable / hasColumn', () => {
  test('answer false rather than throw for what is not there', () => {
    const db = legacyDb();
    assert.equal(hasTable(db, 'things'), true);
    assert.equal(hasTable(db, 'absent'), false);
    assert.equal(hasColumn(db, 'things', 'id'), true);
    assert.equal(hasColumn(db, 'things', 'absent'), false);
    assert.equal(hasColumn(db, 'absent', 'id'), false);
    db.close();
  });
});

describe('MIGRATIONS', () => {
  test('ids are unique', () => {
    const ids = MIGRATIONS.map(m => m.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('the shipped list applies cleanly to a fresh database, twice', () => {
    const db = new DatabaseSync(path.join(DIR, 'shipped.db'));
    applyMigrations(db);
    assert.deepEqual(applyMigrations(db), []);
    db.close();
  });
});

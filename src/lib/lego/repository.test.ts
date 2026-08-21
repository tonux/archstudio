import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* `node --test` gives each file its own process, so pointing DATABASE_PATH at a
 * scratch file here cannot reach another test or the developer's own data. The
 * imports are deferred because db.ts reads that variable when it loads. */

const dbFile = path.join(os.tmpdir(), `archstudio-lego-repo-${process.pid}.db`);
process.env.DATABASE_PATH = dbFile;

let R: typeof import('./repository');
let DB: typeof import('../db');

before(async () => {
  R = await import('./repository');
  DB = await import('../db');
});
after(() => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
});

/** Exact counts from `legoCatalogCounts()` after a fresh seed. */
const EXPECTED_COUNTS = {
  lego_scopes: 18,
  lego_bricks: 40,
  lego_intents: 12,
  lego_variants: 154,
  lego_technology_descriptions: 38,
  lego_dependencies: 36,
} as const;

test('ensureLegoCatalog seeds an empty database', () => {
  const before = DB.plain<{ count: number }>(
    DB.db.prepare('SELECT count(*) AS count FROM lego_catalog_versions').get()
  ).count;
  assert.equal(before, 0, 'tmp DB starts with no catalog version');

  R.ensureLegoCatalog();

  const after = DB.plain<{ count: number }>(
    DB.db.prepare('SELECT count(*) AS count FROM lego_catalog_versions').get()
  ).count;
  assert.equal(after, 1);
  assert.deepEqual(R.legoCatalogCounts(), EXPECTED_COUNTS);
});

test('legoCatalogCounts match the locked seed sizes', () => {
  assert.deepEqual(R.legoCatalogCounts(), EXPECTED_COUNTS);
});

test('a second ensureLegoCatalog is idempotent', () => {
  const first = R.legoCatalogCounts();
  assert.doesNotThrow(() => R.ensureLegoCatalog());
  assert.deepEqual(R.legoCatalogCounts(), first);
  assert.deepEqual(R.legoCatalogCounts(), EXPECTED_COUNTS);
});

test('EN snapshot exposes Product scope and English identity.role', () => {
  const snap = R.legoCatalog('en');
  assert.equal(snap.lang, 'en');
  assert.equal(snap.scopes.find(s => s.id === 'product')?.label, 'Product');
  assert.equal(
    snap.bricks.identity?.role,
    'Proves who callers are and issues tokens other services trust.'
  );
});

test('FR snapshot exposes Produit scope and a French identity.role distinct from EN', () => {
  const en = R.legoCatalog('en');
  const fr = R.legoCatalog('fr');
  assert.equal(fr.lang, 'fr');
  assert.equal(fr.scopes.find(s => s.id === 'product')?.label, 'Produit');
  assert.ok(fr.bricks.identity?.role, 'identity.role is present in FR');
  assert.notEqual(fr.bricks.identity.role, en.bricks.identity.role);
  assert.equal(
    fr.bricks.identity.role,
    'Prouve qui sont les appelants et émet des jetons que d’autres services font confiance.'
  );
});

test('concernTags for identity brick are loaded from SQLite after seed', () => {
  R.ensureLegoCatalog();
  const tagCount = DB.plain<{ count: number }>(
    DB.db.prepare('SELECT count(*) AS count FROM lego_brick_concern_tags WHERE catalog_version=? AND brick_id=?')
      .get(R.LEGO_CATALOG_VERSION, 'identity')
  ).count;
  assert.ok(tagCount >= 2, 'identity concern tags are persisted in lego_brick_concern_tags');

  const snap = R.legoCatalog('en');
  assert.deepEqual(snap.bricks.identity?.concernTags, ['iam', 'security']);
});

test('legoCatalog retains locked intent and variant counts from DB', () => {
  const snap = R.legoCatalog('en');
  assert.equal(snap.intents.length, 12);
  assert.equal(snap.variants.length, 154);
});

test('purpose is exposed on bricks and falls back to role when unset', () => {
  const snap = R.legoCatalog('en');
  const identity = snap.bricks.identity;
  assert.ok(identity?.purpose);
  assert.equal(identity?.purpose, identity?.role);
});

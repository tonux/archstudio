/* The referential, against a real database.
 *
 * The claims that carry it, in order of what breaks worst if they are wrong:
 *
 *   1. An exported document names what it cites, offline. That is the imprint,
 *      and it is the reason the whole design is a copy rather than a foreign
 *      key.
 *   2. A citation the imprint cannot back up is dropped — otherwise a viewer
 *      renders `e_7f3a` to a committee.
 *   3. The index is derivable from the blobs. If it is not, the double write is
 *      indefensible and "who cites this" is a lie.
 *   4. A document that uses none of this exports byte-for-byte as before.
 */

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-ea-'));
process.env.DATABASE_PATH = path.join(DIR, 'test.db');
delete process.env.AUTH_MODE;

type Repo = typeof import('./repository');
type Hydrate = typeof import('./hydrate');
type Store = typeof import('../store');
type Defaults = typeof import('../defaults');

let repo: Repo;
let hydrate: Hydrate;
let store: Store;
let defaults: Defaults;
let db: typeof import('../db').db;

before(async () => {
  repo = await import('./repository');
  hydrate = await import('./hydrate');
  store = await import('../store');
  defaults = await import('../defaults');
  db = (await import('../db')).db;
});
after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

beforeEach(() => {
  db.exec(`DELETE FROM project_entity_links; DELETE FROM project_stats;
           DELETE FROM ea_relations; DELETE FROM ea_entity_texts;
           DELETE FROM ea_entity_props; DELETE FROM ea_entities;
           DELETE FROM revisions; DELETE FROM projects;`);
});

/** A document with one component, ready to cite things. */
const docOf = (ea?: Record<string, unknown>) => {
  const doc = defaults.blankArchitecture('P');
  doc.layers = [{ id: 'services', name: 'Services' }];
  doc.groups = [{ id: 'core', name: 'Core' }];
  doc.components = [{
    id: 'billing', name: 'Billing', group: 'core', layer: 'services',
    tech: [], features: [], notes: [], deps: [],
    ...(ea ? { ea } : {})
  } as never];
  return doc;
};

/* -------------------------------------------------------------- entities */

describe('entities', () => {
  test('a capability tree nests, and cannot close a loop', () => {
    const sales = repo.createEntity({ kind: 'capability', name: 'Sales' });
    const billing = repo.createEntity({ kind: 'capability', name: 'Billing', parent: sales.id });

    assert.equal(repo.entity(billing.id)?.parent, sales.id);
    assert.equal(repo.wouldCycle(sales.id, billing.id), true);
    assert.throws(() => repo.updateEntity(sales.id, { parent: billing.id }), /descendants/);
  });

  test('a kind that does not nest never gets a parent', () => {
    const team = repo.createEntity({ kind: 'actor', name: 'Payments team' });
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing', parent: team.id });
    assert.equal(app.parent, undefined, 'an application does not nest');
  });

  test('a status belongs to a technology standard and nowhere else', () => {
    const java = repo.createEntity({ kind: 'technology-standard', name: 'Java 8', status: 'retire' });
    assert.equal(java.status, 'retire');

    const app = repo.createEntity({ kind: 'application', name: 'Invoicing', status: 'retire' });
    assert.equal(app.status, undefined);
  });

  test('a code is unique within its kind', () => {
    repo.createEntity({ kind: 'application', name: 'Invoicing', code: 'APP-0142' });
    assert.throws(() => repo.createEntity({ kind: 'application', name: 'Other', code: 'app-0142' }),
      /UNIQUE|constraint/i);
    /* A different kind may reuse it: the codes come from different registries. */
    assert.ok(repo.createEntity({ kind: 'domain', name: 'Finance', code: 'APP-0142' }));
  });
});

/* -------------------------------------------------------------- imprint */

describe('the imprint', () => {
  test('a document carries the names of what it cites', () => {
    const sales = repo.createEntity({ kind: 'capability', name: 'Sales' });
    const billing = repo.createEntity({ kind: 'capability', name: 'Billing', parent: sales.id });
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing', code: 'APP-0142' });

    const p = store.createProject({
      name: 'P', data: docOf({ app: app.id, capabilities: [billing.id] })
    });

    const names = (p.data.imprint?.entities || []).map(e => e.name).sort();
    assert.deepEqual(names, ['Billing', 'Invoicing', 'Sales'],
      'the ancestor comes along so the tree can be shown offline');
    assert.equal(p.data.imprint?.entities.find(e => e.id === app.id)?.code, 'APP-0142');
  });

  test('renaming an entity reaches every citing document on its next save', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    const a = store.createProject({ name: 'A', data: docOf({ app: app.id }) });
    const b = store.createProject({ name: 'B', data: docOf({ app: app.id }) });

    repo.updateEntity(app.id, { name: 'Billing service' });

    /* Untouched documents still quote the old name — which is correct for a
     * deliverable already sent. */
    assert.equal(store.getProject(a.id)!.data.imprint!.entities[0].name, 'Invoicing');

    const saved = store.updateProject(a.id, { data: store.getProject(a.id)!.data })!;
    assert.equal(saved.data.imprint!.entities[0].name, 'Billing service');
    assert.equal(store.getProject(b.id)!.data.imprint!.entities[0].name, 'Invoicing',
      'and the other document is untouched until it, too, is saved');
  });

  test('a citation the imprint cannot back up is dropped', () => {
    /* No such entity anywhere: hydration finds nothing, normalisation removes
     * the citation rather than leaving an id nothing can render. */
    const p = store.createProject({ name: 'P', data: docOf({ app: 'e_nonexistent' }) });
    assert.equal(p.data.components[0].ea, undefined);
    assert.equal(p.data.imprint, undefined);
  });

  test('a reference of the wrong kind is dropped like a reference to nothing', () => {
    const cap = repo.createEntity({ kind: 'capability', name: 'Sales' });
    const p = store.createProject({ name: 'P', data: docOf({ app: cap.id }) });
    assert.equal(p.data.components[0].ea, undefined,
      'app must point at an application, not at a capability');
  });

  test('deleting an entity leaves the citing document alone until it is saved', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    const p = store.createProject({ name: 'P', data: docOf({ app: app.id }) });
    assert.equal(p.data.components[0].ea?.app, app.id);

    repo.deleteEntity(app.id);

    assert.equal(store.getProject(p.id)!.data.components[0].ea?.app, app.id,
      'the blob is untouched — nothing rewrites every document at once');

    const saved = store.updateProject(p.id, { data: store.getProject(p.id)!.data })!;
    assert.equal(saved.data.components[0].ea, undefined, 'and it heals on the next save');
    assert.equal(saved.data.imprint, undefined);
  });

  test('a document that cites nothing exports exactly as it did before', () => {
    const p = store.createProject({ name: 'P', data: docOf() });
    assert.equal('imprint' in p.data, false, 'not an empty object — absent');
    assert.equal('ea' in p.data.components[0], false);
  });

  test('normalisation is idempotent', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    const p = store.createProject({ name: 'P', data: docOf({ app: app.id }) });

    const once = JSON.stringify(defaults.normalizeArchitecture(p.data));
    const twice = JSON.stringify(defaults.normalizeArchitecture(JSON.parse(once)));
    assert.equal(once, twice);
  });
});

/* ---------------------------------------------------------------- index */

describe('the index', () => {
  test('answers which projects cite an entity, and through what', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    store.createProject({ name: 'Consumer', data: docOf({ app: app.id }) });
    store.createProject({ name: 'Business', data: docOf({ app: app.id }) });

    const rows = repo.usage(app.id);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(r => r.projectName).sort(), ['Business', 'Consumer']);
    assert.equal(rows[0].componentId, 'billing');
    assert.equal(rows[0].role, 'app');

    assert.equal(repo.listEntities('application')[0].usedBy, 2);
  });

  test('is derivable from the blobs — throw it away and rebuild', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    store.createProject({ name: 'A', data: docOf({ app: app.id }) });
    store.createProject({ name: 'B', data: docOf({ app: app.id }) });

    const before = repo.usage(app.id);
    db.exec('DELETE FROM project_entity_links');
    assert.deepEqual(repo.usage(app.id), [], 'gone');

    hydrate.reindexAll();
    assert.deepEqual(repo.usage(app.id), before, 'and rebuilt identically');
  });

  test('a citation leaving a document leaves the index with it', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    const p = store.createProject({ name: 'P', data: docOf({ app: app.id }) });
    assert.equal(repo.usage(app.id).length, 1);

    const doc = store.getProject(p.id)!.data;
    delete doc.components[0].ea;
    store.updateProject(p.id, { data: doc });

    assert.equal(repo.usage(app.id).length, 0);
  });

  test('deleting an entity takes its index rows immediately', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    store.createProject({ name: 'P', data: docOf({ app: app.id }) });
    repo.deleteEntity(app.id);
    assert.equal(repo.usage(app.id).length, 0);
  });

  test('project counts come from the index, not from parsing every blob', () => {
    store.createProject({ name: 'P', data: docOf() });
    const listed = store.listProjects();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].componentCount, 1);
    assert.equal(listed[0].groupCount, 1);
  });

  test('a project written before the stats table reads as zero, then heals', () => {
    const p = store.createProject({ name: 'P', data: docOf() });
    db.exec('DELETE FROM project_stats');
    assert.equal(store.listProjects()[0].componentCount, 0, 'no row means no statistic');

    hydrate.backfillIndex();
    assert.equal(store.listProjects()[0].componentCount, 1);
    assert.ok(p.id);
  });
});

/* ------------------------------------------------------------------ csv */

describe('csv import', () => {
  const importText = async (text: string) => {
    const { importRows, readRows } = await import('./csv');
    const { rows, ignoredColumns } = readRows(text);
    return importRows(rows, ignoredColumns);
  };

  test('creates a tree, in any row order', async () => {
    const report = await importText(
      'kind,name,parent\n' +
      'capability,Billing,Sales\n' +   // the child comes first, on purpose
      'capability,Sales,\n'
    );
    assert.equal(report.created, 2);
    const billing = repo.listEntities('capability').find(e => e.name === 'Billing')!;
    const sales = repo.listEntities('capability').find(e => e.name === 'Sales')!;
    assert.equal(billing.parent, sales.id);
  });

  test('re-importing the same file updates rather than duplicates', async () => {
    const file = 'kind,code,name\napplication,APP-0142,Invoicing\n';
    assert.equal((await importText(file)).created, 1);

    const again = await importText('kind,code,name\napplication,APP-0142,Billing service\n');
    assert.equal(again.updated, 1);
    assert.equal(again.created, 0);
    assert.equal(repo.listEntities('application').length, 1, 'still one row');
    assert.equal(repo.listEntities('application')[0].name, 'Billing service');
  });

  test('refuses a row rather than guessing, and says why', async () => {
    const report = await importText(
      'kind,name,status\n' +
      'nonsense,Thing,\n' +
      'application,,\n' +
      'application,Invoicing,retire\n' +
      'technology-standard,Java 8,retire\n'
    );
    assert.equal(report.created, 1, 'only the standard is written');
    assert.equal(report.skipped, 3);
    assert.match(report.rows.find(r => r.line === 2)!.reason!, /is not a kind/);
    assert.match(report.rows.find(r => r.line === 3)!.reason!, /No name/);
    assert.match(report.rows.find(r => r.line === 4)!.reason!, /technology standard/);
  });

  test('names the columns it does not read', async () => {
    const report = await importText('kind,name,owner_email\napplication,Invoicing,ada@example.com\n');
    assert.deepEqual(report.ignoredColumns, ['owner_email']);
    assert.equal(report.created, 1);
  });

  test('handles quoted fields with commas in them', async () => {
    const { parseCsv } = await import('./csv');
    assert.deepEqual(
      parseCsv('a,b\n"one, two","he said ""hi"""\n'),
      [['a', 'b'], ['one, two', 'he said "hi"']]
    );
  });
});

/* ------------------------------------------------------------ relations */

describe('relations', () => {
  test('an edge exists once however many times it is asserted', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    const cap = repo.createEntity({ kind: 'capability', name: 'Billing' });

    const a = repo.createRelation('realizes', app.id, cap.id);
    const b = repo.createRelation('realizes', app.id, cap.id);
    assert.equal(a.id, b.id);
    assert.equal(repo.listRelations().length, 1);
  });

  test('both ends have to exist, and cannot be the same thing', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    assert.throws(() => repo.createRelation('serves', app.id, app.id), /itself/);
    assert.throws(() => repo.createRelation('serves', app.id, 'e_nope'), /exist/);
  });

  test('deleting an entity takes its relations with it', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    const cap = repo.createEntity({ kind: 'capability', name: 'Billing' });
    repo.createRelation('realizes', app.id, cap.id);

    repo.deleteEntity(cap.id);
    assert.equal(repo.listRelations().length, 0);
  });
});

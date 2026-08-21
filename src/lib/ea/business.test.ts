/* The business layer: motivation, the capability map, the generated landscape.
 *
 * Three claims, in order of what breaks worst:
 *
 *   1. The capability map draws **offline**, with counts. The tree is frozen
 *      into the section at export; a map that needed the referential would be
 *      half a deliverable.
 *   2. A count means applications, not mentions. "Seven applications carry
 *      Sales" has to survive one application appearing under three sub-boxes,
 *      or the number is worse than no number.
 *   3. Motivation costs the viewer nothing — it resolves to ordinary cards —
 *      and a pointer to something that is gone goes with it.
 */

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-business-'));
process.env.DATABASE_PATH = path.join(DIR, 'test.db');
delete process.env.AUTH_MODE;

type Repo = typeof import('./repository');
type Map_ = typeof import('../views/capability-map');
type Tree = typeof import('./capability-tree');
type Computed = typeof import('./computed');
type Landscape = typeof import('./landscape');
type Store = typeof import('../store');

let repo: Repo, map: Map_, tree: Tree, computed: Computed, landscape: Landscape, store: Store;
let db: typeof import('../db').db;
let blank: typeof import('../defaults').blankArchitecture;
let normalize: typeof import('../defaults').normalizeArchitecture;

before(async () => {
  repo = await import('./repository');
  map = await import('../views/capability-map');
  tree = await import('./capability-tree');
  computed = await import('./computed');
  landscape = await import('./landscape');
  store = await import('../store');
  db = (await import('../db')).db;
  ({ blankArchitecture: blank, normalizeArchitecture: normalize } = await import('../defaults'));
});
after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

beforeEach(() => {
  db.exec(`DELETE FROM project_entity_links; DELETE FROM project_stats;
           DELETE FROM ea_relations; DELETE FROM ea_entity_texts;
           DELETE FROM ea_entity_props; DELETE FROM ea_entities;
           DELETE FROM revisions; DELETE FROM projects;`);
});

const cap = (name: string, parent?: string) =>
  repo.createEntity({ kind: 'capability', name, parent });
const app = (name: string, code?: string) =>
  repo.createEntity({ kind: 'application', name, code });

/** A project whose components cite an application and some capabilities. */
function project(name: string, spec: [string, string, string[]][]) {
  const doc = blank(name);
  doc.layers = [{ id: 'svc', name: 'Services' }];
  doc.groups = [{ id: 'core', name: 'Core' }];
  doc.components = spec.map(([id, appId, caps]) => ({
    id, name: id, group: 'core', layer: 'svc',
    tech: [], features: [], notes: [], deps: [],
    ea: { app: appId, ...(caps.length ? { capabilities: caps } : {}) }
  })) as never;
  return store.createProject({ name, data: doc });
}

/* --------------------------------------------------------- capability map */

describe('the capability map', () => {
  test('is a tree, deepest first, with a count on every box', () => {
    const sales = cap('Sales');
    const billing = cap('Billing', sales.id);
    cap('Collections', sales.id);
    const invoicing = app('Invoicing');
    project('P', [['c', invoicing.id, [billing.id]]]);

    const roots = tree.capabilityTree();
    assert.equal(roots.length, 1);
    assert.equal(roots[0].name, 'Sales');
    assert.deepEqual(roots[0].children.map(c => c.name), ['Billing', 'Collections']);
    assert.equal(map.depthOf(roots), 2);
    assert.equal(map.flatten(roots).length, 3);
  });

  test('a count rolls up, and counts applications rather than mentions', () => {
    const sales = cap('Sales');
    const billing = cap('Billing', sales.id);
    const collections = cap('Collections', sales.id);
    /* One application under two different sub-boxes. The parent must say 1. */
    const one = app('Invoicing');
    project('P', [['a', one.id, [billing.id, collections.id]]]);

    const [root] = tree.capabilityTree();
    assert.equal(root.count, 1, 'one application, however many boxes name it');
    assert.equal(root.children.find(c => c.name === 'Billing')!.count, 1);
  });

  test('a capability nobody carries counts zero rather than going missing', () => {
    cap('Fraud');
    const [root] = tree.capabilityTree();
    assert.equal(root.count, 0, 'a gap has to be visible to be a finding');
  });

  test('a declared realization counts as much as a drawn one', () => {
    const billing = cap('Billing');
    const invoicing = app('Invoicing');
    repo.createRelation('realizes', invoicing.id, billing.id);
    assert.equal(tree.capabilityTree()[0].count, 1);
  });

  test('narrowing to one subtree leaves the rest out', () => {
    const sales = cap('Sales');
    cap('Billing', sales.id);
    cap('Unrelated');

    const roots = tree.capabilityTree(sales.id);
    assert.deepEqual(roots.map(r => r.name), ['Sales']);
    assert.equal(tree.capabilityTree().length, 2, 'both roots without a subject');
  });

  test('the column rule is one rule, so every surface draws the same map', () => {
    const node = (name: string, kids = 0) => ({
      name, children: Array.from({ length: kids }, (_, i) => ({ name: `${name}.${i}`, children: [] }))
    });
    assert.equal(map.columnsFor([]), 1);
    assert.equal(map.columnsFor([node('a')]), 1);
    assert.equal(map.columnsFor([node('a'), node('b')]), 2);
    assert.equal(map.columnsFor([node('a'), node('b'), node('c')]), 3);
    /* A root with more than three children needs room. */
    assert.equal(map.columnsFor([node('a', 4), node('b'), node('c')]), 2);
    assert.equal(map.columnsFor(Array.from({ length: 8 }, (_, i) => node(`n${i}`))), 4);
  });
});

/* -------------------------------------------------------------- computed */

describe('a map that leaves', () => {
  const withSection = (spec: Record<string, unknown>) => {
    const doc = blank('P');
    doc.sections = [{ id: 's', type: 'text', title: '', blocks: [], computed: spec }] as never;
    return doc;
  };

  test('freezes the tree into the section, with no trace of the question', () => {
    const sales = cap('Sales');
    cap('Billing', sales.id);
    const invoicing = app('Invoicing');
    project('P', [['c', invoicing.id, [sales.id]]]);

    const out = computed.resolveComputed(withSection({ query: 'capability-map' }));
    const s = out.sections[0] as unknown as Record<string, unknown>;

    assert.equal(s.type, 'capability-map');
    assert.equal('computed' in s, false);
    assert.equal(s.title, 'Capability map');
    const roots = s.roots as { name: string; count: number }[];
    assert.deepEqual(roots.map(r => r.name), ['Sales']);
    assert.equal(roots[0].count, 1, 'the number travels with the names');
    assert.match(String(s.note), /Computed on \d{4}-\d{2}-\d{2}\./);
  });

  test('an empty referential says so rather than printing an empty box', () => {
    const out = computed.resolveComputed(withSection({ query: 'capability-map' }));
    const s = out.sections[0] as unknown as { type: string; rows: string[][] };
    assert.equal(s.type, 'table');
    assert.match(s.rows[0][0], /No capabilities/);
  });
});

/* ------------------------------------------------------------ motivation */

describe('motivation', () => {
  const docWith = (items: unknown[], components: string[] = []) => {
    const d = blank('P');
    d.layers = [{ id: 'l', name: 'L' }];
    d.groups = [{ id: 'g', name: 'G' }];
    d.components = components.map(id => ({
      id, name: id.toUpperCase(), group: 'g', layer: 'l',
      tech: [], features: [], notes: [], deps: []
    })) as never;
    (d as { motivation?: unknown }).motivation = { items };
    return normalize(d);
  };

  test('keeps well-formed items and drops the rest', () => {
    const d = docWith([
      { id: 'g1', kind: 'goal', name: 'Cut settlement to a day' },
      { id: 'g1', kind: 'goal', name: 'Duplicate' },
      { id: 'x', kind: 'nonsense', name: 'Wrong kind' },
      { id: '', kind: 'goal', name: 'No id' },
      null
    ]);
    assert.deepEqual(d.motivation!.items.map(i => i.id), ['g1']);
  });

  test('a pointer to a component that is gone goes with it', () => {
    const d = docWith(
      [{ id: 'g', kind: 'goal', name: 'G', realizedBy: ['api', 'ghost'] }],
      ['api']
    );
    assert.deepEqual(d.motivation!.items[0].realizedBy, ['api']);

    const gone = docWith([{ id: 'g', kind: 'goal', name: 'G', realizedBy: ['ghost'] }], ['api']);
    assert.equal(gone.motivation!.items[0].realizedBy, undefined, 'empty means absent');
  });

  test('a document that says nothing keeps its exact shape', () => {
    const plain = normalize(blank('X'));
    assert.equal('motivation' in plain, false, 'absent, not an empty object');
  });

  test('resolves to ordinary cards — the viewer learns nothing new', () => {
    const d = docWith(
      [
        { id: 'd1', kind: 'driver', name: 'PSD2' },
        { id: 'g1', kind: 'goal', name: 'Settle in a day', realizedBy: ['api'] }
      ],
      ['api']
    );
    d.sections = [{ id: 's', type: 'text', title: '', blocks: [], computed: { query: 'motivation' } }] as never;

    const s = computed.resolveComputed(d).sections[0] as unknown as
      { type: string; title: string; items: { title: string; bullets: string[] }[] };

    assert.equal(s.type, 'cards');
    /* Drivers before goals: the order an argument is made in. */
    assert.deepEqual(s.items.map(i => i.title), ['Driver · PSD2', 'Goal · Settle in a day']);
    assert.match(s.items[1].bullets[0], /Realised by: API/);
    assert.match(s.items[0].bullets[0], /Nothing in this document realises it/);
  });
});

/* ------------------------------------------------------------- landscape */

describe('the generated landscape', () => {
  test('bands applications by the domain that owns them', () => {
    const finance = repo.createEntity({ kind: 'domain', name: 'Finance' });
    const billing = app('Billing', 'APP-1');
    const orphan = app('Orphan');
    repo.createRelation('assigned-to', billing.id, finance.id);

    const doc = landscape.buildLandscape();
    assert.deepEqual(doc.layers.map(l => l.name), ['Finance', 'Unassigned']);
    assert.equal(doc.components.find(c => c.name === 'Billing')!.layer, finance.id);
    assert.equal(doc.components.find(c => c.name === 'Orphan')!.layer, 'unassigned');
  });

  test('colour says whether anyone has drawn it', () => {
    const drawn = app('Drawn');
    app('Never drawn');
    project('P', [['c', drawn.id, []]]);

    const doc = landscape.buildLandscape();
    assert.equal(doc.components.find(c => c.name === 'Drawn')!.group, 'drawn');
    const missing = doc.components.find(c => c.name === 'Never drawn')!;
    assert.equal(missing.group, 'undrawn');
    assert.match(missing.notes![0], /No project diagram draws/);
  });

  test('edges come from dependencies somebody already drew', () => {
    const web = app('Web'), api = app('API');
    const doc = blank('Source');
    doc.layers = [{ id: 'l', name: 'L' }];
    doc.groups = [{ id: 'g', name: 'G' }];
    doc.components = [
      { id: 'w', name: 'w', group: 'g', layer: 'l', tech: [], features: [], notes: [], deps: ['a'], ea: { app: web.id } },
      { id: 'a', name: 'a', group: 'g', layer: 'l', tech: [], features: [], notes: [], deps: [], ea: { app: api.id } }
    ] as never;
    store.createProject({ name: 'Source', data: doc });

    const out = landscape.buildLandscape();
    const from = out.components.find(c => c.name === 'Web')!;
    const to = out.components.find(c => c.name === 'API')!;
    assert.deepEqual(from.deps, [to.id], 'nothing new was authored for this');
  });

  test('every card cites its application, so the analysis screen can read it', () => {
    const a = app('Invoicing', 'APP-9');
    const doc = landscape.buildLandscape();
    const card = doc.components[0];
    assert.equal(card.ea!.app, a.id);
    assert.equal(card.badge, 'APP-9');
    assert.deepEqual(doc.imprint!.entities.map(e => e.name), ['Invoicing'],
      'and the imprint carries the name, so the export reads offline');
  });

  test('an empty referential produces an empty document rather than throwing', () => {
    const doc = landscape.buildLandscape();
    assert.equal(doc.components.length, 0);
    assert.equal(doc.layers.length, 0);
  });

  test('survives the normaliser, which is what createProject will run', () => {
    const finance = repo.createEntity({ kind: 'domain', name: 'Finance' });
    const billing = app('Billing');
    repo.createRelation('assigned-to', billing.id, finance.id);

    const out = normalize(landscape.buildLandscape());
    assert.equal(out.components.length, 1);
    assert.equal(out.components[0].ea?.app, billing.id, 'the citation survives normalisation');
    assert.equal(out.sections.length, 2, 'the map and the coverage table come with it');
  });
});

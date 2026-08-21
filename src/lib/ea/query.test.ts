/* The five questions, and the one claim that carries them all: an answer can
 * leave.
 *
 * The cross-project graph is derived from drawings that already exist — nobody
 * authors it — so the tests build real projects with real `deps` and check that
 * the application-level edges fall out. The performance test is not decoration
 * either: `buildGraph` parses every document, and the plan committed to a
 * number, so the number is measured rather than hoped for.
 */

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-query-'));
process.env.DATABASE_PATH = path.join(DIR, 'test.db');
delete process.env.AUTH_MODE;

type Repo = typeof import('./repository');
type Query = typeof import('./query');
type Graph = typeof import('./graph');
type Computed = typeof import('./computed');
type Store = typeof import('../store');

let repo: Repo, query: Query, graph: Graph, computed: Computed, store: Store;
let db: typeof import('../db').db;
let blank: typeof import('../defaults').blankArchitecture;

before(async () => {
  repo = await import('./repository');
  query = await import('./query');
  graph = await import('./graph');
  computed = await import('./computed');
  store = await import('../store');
  db = (await import('../db')).db;
  blank = (await import('../defaults')).blankArchitecture;
});
after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

beforeEach(() => {
  db.exec(`DELETE FROM project_entity_links; DELETE FROM project_stats;
           DELETE FROM ea_relations; DELETE FROM ea_entity_texts;
           DELETE FROM ea_entity_props; DELETE FROM ea_entities;
           DELETE FROM revisions; DELETE FROM projects;`);
});

/** A project whose components cite entities and depend on each other.
 *  `spec` is `[componentId, appEntityId | null, capabilityIds, deps]`. */
function project(name: string, spec: [string, string | null, string[], string[]][]) {
  const doc = blank(name);
  doc.layers = [{ id: 'services', name: 'Services' }];
  doc.groups = [{ id: 'core', name: 'Core' }];
  doc.components = spec.map(([id, app, caps, deps]) => ({
    id, name: id, group: 'core', layer: 'services',
    tech: [], features: [], notes: [], deps,
    ...(app || caps.length
      ? { ea: { ...(app ? { app } : {}), ...(caps.length ? { capabilities: caps } : {}) } }
      : {})
  })) as never;
  return store.createProject({ name, data: doc });
}

const app = (name: string, code?: string) =>
  repo.createEntity({ kind: 'application', name, code });
const cap = (name: string, parent?: string) =>
  repo.createEntity({ kind: 'capability', name, parent });

/* ---------------------------------------------------------------- graph */

describe('the cross-project graph', () => {
  test('two diagrams of the same application are one node', () => {
    const invoicing = app('Invoicing');
    project('Consumer', [['a', invoicing.id, [], []]]);
    project('Business', [['b', invoicing.id, [], []]]);

    const g = graph.buildGraph();
    assert.equal(g.nodes.size, 1);
    assert.equal(g.nodes.get(invoicing.id)!.drawnIn.size, 2, 'drawn in both projects');
  });

  test('an application edge falls out of a component dependency', () => {
    const front = app('Storefront');
    const billing = app('Billing');
    project('P', [['web', front.id, [], ['api']], ['api', billing.id, [], []]]);

    const g = graph.buildGraph();
    const edges = g.out.get(front.id) || [];
    assert.equal(edges.length, 1);
    assert.equal(edges[0].to, billing.id);
    assert.equal(edges[0].source, 'drawn');
    assert.equal(edges[0].via![0].projectName, 'P');
  });

  test('a dependency inside one application is not an edge', () => {
    const one = app('Monolith');
    project('P', [['web', one.id, [], ['api']], ['api', one.id, [], []]]);
    assert.equal((graph.buildGraph().out.get(one.id) || []).length, 0,
      'that is an internal detail, not an application dependency');
  });

  test('a declared relationship counts when no diagram shows it', () => {
    const a = app('A'), b = app('B');
    repo.createRelation('serves', a.id, b.id);

    const edges = graph.buildGraph().out.get(a.id) || [];
    assert.equal(edges.length, 1);
    assert.equal(edges[0].source, 'declared');
  });

  test('a drawn edge wins over the same edge declared', () => {
    const a = app('A'), b = app('B');
    project('P', [['x', a.id, [], ['y']], ['y', b.id, [], []]]);
    repo.createRelation('serves', a.id, b.id);

    const edges = graph.buildGraph().out.get(a.id) || [];
    assert.equal(edges.length, 1, 'one edge, not two');
    assert.equal(edges[0].source, 'drawn', 'the one that can say where');
  });
});

/* --------------------------------------------------------- 1. dependents */

describe('impact', () => {
  test('follows the chain, shortest path first', () => {
    const web = app('Web'), api = app('API'), db2 = app('Database');
    project('P', [
      ['w', web.id, [], ['a']],
      ['a', api.id, [], ['d']],
      ['d', db2.id, [], []]
    ]);

    const r = query.runQuery('dependents', db2.id);
    assert.equal(r.rows.length, 2);
    assert.deepEqual(r.rows.map(x => [x[0], x[2]]), [['API', '1'], ['Web', '2']]);
    assert.equal(r.rows[1][3], 'Web → API → Database', 'the path reads the way impact travels');
  });

  test('a cycle terminates', () => {
    const a = app('A'), b = app('B');
    project('P', [['x', a.id, [], ['y']], ['y', b.id, [], ['x']]]);

    const r = query.runQuery('dependents', a.id);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0][0], 'B');
  });

  test('a leaf says so rather than returning an empty table with no explanation', () => {
    const a = app('A');
    project('P', [['x', a.id, [], []]]);
    const r = query.runQuery('dependents', a.id);
    assert.equal(r.rows.length, 0);
    assert.match(r.empty, /Nothing depends on it/);
  });
});

/* -------------------------------------------------------- 2. capability */

describe('capability', () => {
  test('a citation is a claim: this application carries this capability', () => {
    const invoicing = app('Invoicing', 'APP-1');
    const billing = cap('Billing');
    project('P', [['c', invoicing.id, [billing.id], []]]);

    const r = query.runQuery('capability', billing.id);
    assert.equal(r.rows.length, 1);
    assert.deepEqual(r.rows[0].slice(0, 3), ['Invoicing', 'APP-1', 'Billing']);
  });

  test('asking about a parent includes everything under it', () => {
    const sales = cap('Sales');
    const billing = cap('Billing', sales.id);
    const collections = cap('Collections', sales.id);
    const a = app('Invoicing'), b = app('Dunning');
    project('P', [
      ['x', a.id, [billing.id], []],
      ['y', b.id, [collections.id], []]
    ]);

    const r = query.runQuery('capability', sales.id);
    assert.equal(r.rows.length, 2);
    assert.match(r.note!, /2 capabilities under it/);
  });

  test('a declared realization counts as much as a drawn one', () => {
    const a = app('Invoicing');
    const billing = cap('Billing');
    repo.createRelation('realizes', a.id, billing.id);

    assert.equal(query.runQuery('capability', billing.id).rows.length, 1);
  });
});

/* ---------------------------------------------------------- 3. coverage */

describe('coverage', () => {
  test('flags a capability nobody carries, and one three applications carry', () => {
    const orphan = cap('Fraud');
    const crowded = cap('Billing');
    const apps = ['A', 'B', 'C'].map(n => app(n));
    project('P', apps.map((a, i) =>
      [`c${i}`, a.id, [crowded.id], []] as [string, string, string[], string[]]));

    const r = query.runQuery('coverage');
    const row = (n: string) => r.rows.find(x => x[0] === n)!;

    assert.deepEqual(row('Fraud').slice(1, 3), ['0', 'Nobody']);
    assert.deepEqual(row('Billing').slice(1, 3), ['3', 'Overlap']);
    assert.equal(row('Billing')[3], 'A, B, C');
    assert.ok(orphan.id);
  });

  test('two applications on one capability is not flagged', () => {
    const billing = cap('Billing');
    const apps = ['Front', 'Back'].map(n => app(n));
    project('P', apps.map((a, i) =>
      [`c${i}`, a.id, [billing.id], []] as [string, string, string[], string[]]));

    assert.equal(query.runQuery('coverage').rows.find(x => x[0] === 'Billing')![2], '',
      'a front and a back is the normal shape, not a finding');
  });
});

/* ---------------------------------------------------------- 4. standard */

describe('technology', () => {
  const withTech = (name: string, appId: string, tech: string[]) => {
    const doc = blank(name);
    doc.layers = [{ id: 'services', name: 'Services' }];
    doc.groups = [{ id: 'core', name: 'Core' }];
    doc.components = [{
      id: 'svc', name: 'Service', group: 'core', layer: 'services',
      tech, features: [], notes: [], deps: [], ea: { app: appId }
    }] as never;
    return store.createProject({ name, data: doc });
  };

  test('finds what the diagrams already say, with no relationship declared', () => {
    const java = repo.createEntity({
      kind: 'technology-standard', name: 'Java 8', status: 'retire'
    });
    const legacy = app('Legacy biller');
    withTech('P', legacy.id, ['Java 8', 'Postgres']);

    const r = query.runQuery('standard', java.id);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0][0], 'Legacy biller');
    assert.match(r.rows[0][2], /^drawn/);
    assert.match(r.title, /\(retire\)/, 'the decision is part of the headline');
  });

  test('matches exactly — a near miss is not reported as a fact', () => {
    const java = repo.createEntity({ kind: 'technology-standard', name: 'Java 8' });
    withTech('P', app('X').id, ['Java 8.1']);
    assert.equal(query.runQuery('standard', java.id).rows.length, 0);

    /* Case and surrounding space are not a near miss, they are the same thing. */
    withTech('Q', app('Y').id, ['  java 8 ']);
    assert.equal(query.runQuery('standard', java.id).rows.length, 1);
  });

  test('a component on a standard but in no application still shows up', () => {
    const java = repo.createEntity({ kind: 'technology-standard', name: 'Java 8' });
    const doc = blank('P');
    doc.layers = [{ id: 'l', name: 'L' }];
    doc.groups = [{ id: 'g', name: 'G' }];
    doc.components = [{
      id: 'x', name: 'Orphan', group: 'g', layer: 'l',
      tech: ['Java 8'], features: [], notes: [], deps: []
    }] as never;
    store.createProject({ name: 'P', data: doc });

    const r = query.runQuery('standard', java.id);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0][0], '(no application)', 'unmapped is still a finding');
  });
});

/* ----------------------------------------------------------- 5. orphans */

describe('gaps', () => {
  test('names what nobody filled in', () => {
    const lonely = app('Never drawn');
    const drawn = app('Drawn');
    project('P', [['x', drawn.id, [], []], ['y', null, [], []]]);

    const r = query.runQuery('orphans');
    const gaps = r.rows.map(x => `${x[1]}: ${x[2]}`);

    assert.ok(gaps.includes('Never drawn: Cited by no project'));
    assert.ok(gaps.includes('Drawn: Carries no capability'));
    assert.ok(gaps.includes('Drawn: Has no owner'));
    assert.ok(gaps.some(g => /1 of 2 components map to no application/.test(g)));
    assert.ok(lonely.id);
  });
});

/* -------------------------------------------------------- computed docs */

describe('a question that leaves', () => {
  const docWithQuestion = (spec: Record<string, unknown>) => {
    const doc = blank('P');
    doc.sections = [{
      id: 's1', type: 'text', title: 'Coverage', blocks: [], computed: spec
    }] as never;
    return doc;
  };

  test('becomes an ordinary table, dated, with no trace of the question', () => {
    cap('Billing');
    const out = computed.resolveComputed(docWithQuestion({ query: 'coverage' }));
    const s = out.sections[0] as unknown as Record<string, unknown>;

    assert.equal(s.type, 'table');
    assert.equal('computed' in s, false,
      'a frozen answer must not look like something that refreshes');
    assert.ok(Array.isArray(s.columns) && Array.isArray(s.rows));
    assert.match(String(s.note), /Computed on \d{4}-\d{2}-\d{2}\./);
  });

  test('an empty answer still says something', () => {
    const a = app('A');
    project('P', [['x', a.id, [], []]]);
    const out = computed.resolveComputed(docWithQuestion({ query: 'dependents', subject: a.id }));
    const s = out.sections[0] as unknown as { rows: string[][] };
    assert.match(s.rows[0][0], /Nothing depends on it/);
  });

  test('an unknown question says so rather than vanishing', () => {
    const out = computed.resolveComputed(docWithQuestion({ query: 'nonsense' }));
    const s = out.sections[0] as unknown as { rows: string[][] };
    assert.match(s.rows[0][0], /not a question this version knows/);
  });

  test('a document with no questions is returned untouched, same object', () => {
    const doc = blank('P');
    assert.equal(computed.resolveComputed(doc), doc,
      'the common path must not even copy');
  });
});

/* ------------------------------------------------------------ the number */

describe('at scale', () => {
  test('200 applications across 40 projects, under 100 ms', () => {
    /* A chain per project so the graph has real depth to walk, and every
     * application drawn somewhere so the node set is the full 200. */
    const apps = Array.from({ length: 200 }, (_, i) => app(`App ${i}`, `APP-${i}`));
    for (let p = 0; p < 40; p++) {
      const slice = apps.slice(p * 5, p * 5 + 5);
      project(`Project ${p}`, slice.map((a, i) => [
        `c${i}`, a.id, [], i < slice.length - 1 ? [`c${i + 1}`] : []
      ] as [string, string, string[], string[]]));
    }

    /* Both halves are measured, because a request pays both. Building the
     * graph parses every document and is by far the larger of the two — quoting
     * only the walk would be quoting the cheap half. */
    const t0 = Date.now();
    const g = graph.buildGraph();
    const build = Date.now() - t0;

    const t1 = Date.now();
    const r = query.dependents(g, apps[4].id);
    const walk = Date.now() - t1;

    assert.equal(g.nodes.size, 200);
    assert.equal(r.rows.length, 4, 'the four upstream of the last link in its chain');

    console.log(`      buildGraph ${build} ms · dependents ${walk} ms · total ${build + walk} ms`);
    assert.ok(build + walk < 100,
      `a whole question took ${build + walk} ms (build ${build}, walk ${walk})`);
  });
});

/* The referential's second wave, against a real database.
 *
 * Everything here is a claim the earlier model could not make, and each one is
 * tested at the seam where it would fail quietly rather than loudly:
 *
 *   1. A vocabulary is legal only on the kinds it describes. Storing a
 *      criticality on a capability would not throw — it would just be there,
 *      and a report would count it.
 *   2. A relationship's ends are checked. Until they were, "a capability is
 *      owned by an invoice" stored cleanly and widened every query that read it.
 *   3. A feed run twice converges. This is the difference between a referential
 *      and a pile, and it only shows up on the second run.
 *   4. A preview writes nothing. It is read by people deciding whether to trust
 *      a file, so a preview that half-applied would be worse than none.
 *   5. A goal cited only by a document's reasoning survives a save. It did not:
 *      the imprint pruned it and the citation went with it on the next pass.
 */

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-ea-model-'));
process.env.DATABASE_PATH = path.join(DIR, 'test.db');
delete process.env.AUTH_MODE;

type Repo = typeof import('./repository');
type Csv = typeof import('./csv');
type Hydrate = typeof import('./hydrate');
type Store = typeof import('../store');
type Defaults = typeof import('../defaults');
type Query = typeof import('./query');
type Compliance = typeof import('./compliance');
type Imprint = typeof import('./imprint');
type Landscape = typeof import('./landscape');

let repo: Repo;
let csv: Csv;
let hydrate: Hydrate;
let store: Store;
let defaults: Defaults;
let query: Query;
let compliance: Compliance;
let imprint: Imprint;
let landscape: Landscape;
let db: typeof import('../db').db;

before(async () => {
  repo = await import('./repository');
  csv = await import('./csv');
  hydrate = await import('./hydrate');
  store = await import('../store');
  defaults = await import('../defaults');
  query = await import('./query');
  compliance = await import('./compliance');
  imprint = await import('./imprint');
  landscape = await import('./landscape');
  db = (await import('../db')).db;
});
after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

beforeEach(() => {
  db.exec(`DELETE FROM project_entity_links; DELETE FROM project_stats;
           DELETE FROM ea_relations; DELETE FROM ea_entity_texts;
           DELETE FROM ea_entity_props; DELETE FROM ea_entities;
           DELETE FROM revisions; DELETE FROM projects;`);
});

const docOf = (extra?: Partial<Record<string, unknown>>) => {
  const doc = defaults.blankArchitecture('P');
  doc.layers = [{ id: 'services', name: 'Services' }];
  doc.groups = [{ id: 'core', name: 'Core' }];
  doc.components = [{
    id: 'billing', name: 'Billing', group: 'core', layer: 'services',
    tech: [], features: [], notes: [], deps: []
  } as never];
  return { ...doc, ...(extra || {}) };
};

/* ------------------------------------------------------------ 1. fields */

describe('the fields a portfolio needs', () => {
  test('a lifecycle belongs to things that have a life, and nothing else', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing', lifecycle: 'sunset' });
    assert.equal(app.lifecycle, 'sunset');

    /* A capability does not retire — the things carrying it do. Refused
     * silently on write rather than stored and ignored on read, so nothing
     * downstream ever has to ask whether it meant anything. */
    const cap = repo.createEntity({ kind: 'capability', name: 'Billing', lifecycle: 'retired' });
    assert.equal(cap.lifecycle, undefined);
  });

  test('a radar decision and a lifecycle are different columns', () => {
    /* The sentence the two words exist to make: the technology is on its way
     * out, the application running on it is very much alive. One column could
     * not hold both, and a portfolio review needs to say it. */
    const java = repo.createEntity({
      kind: 'technology-standard', name: 'Java 8', status: 'retire'
    });
    const app = repo.createEntity({ kind: 'application', name: 'Payroll', lifecycle: 'live' });

    assert.equal(java.status, 'retire');
    assert.equal(java.lifecycle, undefined, 'a standard has no lifecycle of its own');
    assert.equal(app.status, undefined, 'an application carries no radar decision');
    assert.equal(app.lifecycle, 'live');
  });

  test('criticality is gated the same way', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Core', criticality: 'vital' });
    assert.equal(app.criticality, 'vital');
    const actor = repo.createEntity({ kind: 'actor', name: 'Ops', criticality: 'vital' });
    assert.equal(actor.criticality, undefined);
  });

  test('free attributes round-trip, and an empty value removes the key', () => {
    const app = repo.createEntity({
      kind: 'application', name: 'Ledger',
      props: { costCentre: 'CC-12', hosting: 'eu-west-1' }
    });
    assert.deepEqual(app.props, { costCentre: 'CC-12', hosting: 'eu-west-1' });

    const after = repo.updateEntity(app.id, { props: { costCentre: 'CC-12', hosting: '' } });
    assert.deepEqual(after!.props, { costCentre: 'CC-12' });

    /* Props are a single read, not a listing join — a listing must not start
     * carrying them by accident. */
    const listed = repo.listEntities('application').find(e => e.id === app.id)!;
    assert.equal(listed.props, undefined);
  });
});

/* --------------------------------------------------------- 2. relations */

describe('a relationship has ends', () => {
  test('the metamodel refuses what it cannot mean', () => {
    const cap = repo.createEntity({ kind: 'capability', name: 'Billing' });
    const obj = repo.createEntity({ kind: 'business-object', name: 'Invoice' });
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });

    /* A capability is not something that can own, and an invoice is not
     * something that can be an owner. Both ends are checked, and the message
     * says which one was wrong. */
    assert.throws(() => repo.createRelation('assigned-to', cap.id, obj.id), /capability/);
    assert.throws(() => repo.createRelation('assigned-to', app.id, obj.id), /business-object/);

    const actor = repo.createEntity({ kind: 'actor', name: 'Payments team' });
    assert.ok(repo.createRelation('assigned-to', app.id, actor.id));
  });

  test('a process triggers a process and realizes a service', () => {
    const a = repo.createEntity({ kind: 'business-process', name: 'Receive order' });
    const b = repo.createEntity({ kind: 'business-process', name: 'Invoice' });
    const svc = repo.createEntity({ kind: 'business-service', name: 'Customer billing' });

    assert.ok(repo.createRelation('triggers', a.id, b.id));
    assert.ok(repo.createRelation('realizes', b.id, svc.id));
    assert.throws(() => repo.createRelation('triggers', a.id, svc.id), /service/);
  });

  test('anything concrete can be motivated by reasoning, and reasoning cannot', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    const goal = repo.createEntity({ kind: 'goal', name: 'Cut cost' });
    const driver = repo.createEntity({ kind: 'driver', name: 'Regulation' });

    assert.ok(repo.createRelation('motivated-by', app.id, goal.id));
    /* A goal being motivated by a driver is a real ArchiMate sentence, but it is
     * not this relationship: `motivated-by` runs from the landscape to the
     * reasoning, and letting it run inside the reasoning would make the query
     * that reads it ambiguous. */
    assert.throws(() => repo.createRelation('motivated-by', goal.id, driver.id), /goal/);
  });

  test('both ends come back named, so a neighbourhood needs one request', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing', code: 'APP-1' });
    const cap = repo.createEntity({ kind: 'capability', name: 'Billing' });
    repo.createRelation('realizes', app.id, cap.id);

    const [r] = repo.listResolvedRelations(app.id);
    assert.equal(r.fromName, 'Invoicing');
    assert.equal(r.toName, 'Billing');
    assert.equal(r.toKind, 'capability');
  });
});

/* ------------------------------------------------------------ 3. feeding */

describe('feeding it from a system that already knows', () => {
  test('the same feed run twice converges instead of duplicating', () => {
    const first = repo.upsertBySource('cmdb', 'ci-1', {
      kind: 'application', name: 'Invoicing', lifecycle: 'live'
    });
    assert.equal(first.created, true);

    /* Renamed over there. Matching on name would have made this a second row,
     * which is the failure that turns a referential into a list nobody trusts. */
    const second = repo.upsertBySource('cmdb', 'ci-1', {
      kind: 'application', name: 'Invoicing service', lifecycle: 'sunset'
    });
    assert.equal(second.created, false);
    assert.equal(second.entity.id, first.entity.id);
    assert.equal(second.entity.name, 'Invoicing service');
    assert.equal(second.entity.lifecycle, 'sunset');
    assert.equal(repo.listEntities('application').length, 1);
  });

  test('the same id in two sources is two things', () => {
    repo.upsertBySource('cmdb', 'ci-1', { kind: 'application', name: 'A' });
    repo.upsertBySource('spreadsheet', 'ci-1', { kind: 'application', name: 'B' });
    assert.equal(repo.listEntities('application').length, 2);
  });

  test('a feed never changes what a row *is*', () => {
    const made = repo.upsertBySource('cmdb', 'ci-1', { kind: 'application', name: 'A' });
    /* A row that changed kind is a different thing wearing the same key, and
     * rewriting it would take every citation of it along. */
    const again = repo.upsertBySource('cmdb', 'ci-1', { kind: 'capability', name: 'A' });
    assert.equal(again.entity.kind, 'application');
    assert.equal(again.entity.id, made.entity.id);
  });
});

/* ---------------------------------------------------------------- 4. csv */

describe('csv', () => {
  const run = (text: string, preview = false) => csv.importCsv(text, { preview });

  test('a relations file is told apart by its header', () => {
    assert.equal(csv.readRows('kind,name\napplication,A\n').shape, 'entities');
    assert.equal(csv.readRows('relation,from,to\nrealizes,A,B\n').shape, 'relations');
  });

  test('relations are imported, by code or by kind:name', () => {
    run('kind,code,name\napplication,APP-1,Invoicing\ncapability,,Billing\nactor,,Payments\n');

    const report = run(
      'relation,from,to,note\n'
      + 'realizes,APP-1,capability:Billing,\n'
      + 'assigned-to,APP-1,actor:Payments,on call\n'
    );
    assert.equal(report.shape, 'relations');
    assert.equal(report.created, 2);
    assert.equal(repo.listRelations().length, 2);

    /* Re-running the same file is the normal case, not an error: it reports the
     * rows as already-there rather than filling the screen with refusals. */
    const again = run('relation,from,to,note\nrealizes,APP-1,capability:Billing,\n');
    assert.equal(again.created, 0);
    assert.equal(again.updated, 1);
    assert.equal(repo.listRelations().length, 2);
  });

  test('an ambiguous end is reported, never guessed', () => {
    run('kind,name\napplication,Billing\ncapability,Billing\n');
    const report = run('relation,from,to\nrealizes,Billing,Billing\n');
    assert.equal(report.created, 0);
    assert.match(report.rows[0].reason!, /matches 2 rows/);
  });

  test('a relations file cannot invent an entity', () => {
    run('kind,name\napplication,Invoicing\n');
    const report = run('relation,from,to\nrealizes,Invoicing,capability:Nope\n');
    assert.equal(report.created, 0);
    assert.match(report.rows[0].reason!, /No capability called "Nope"/);
    assert.equal(repo.listEntities('capability').length, 0);
  });

  test('a preview writes nothing at all', () => {
    const report = run('kind,name,lifecycle\napplication,Invoicing,live\n', true);
    assert.equal(report.preview, true);
    assert.equal(report.created, 1, 'it still reports what would happen');
    assert.equal(repo.countEntities(), 0, 'and it happened to nothing');

    /* The same file applied gives the same numbers, which is the only property
     * that makes a preview worth reading. */
    const applied = run('kind,name,lifecycle\napplication,Invoicing,live\n');
    assert.equal(applied.created, report.created);
    assert.equal(repo.countEntities(), 1);
  });

  test('a value outside a vocabulary refuses the row rather than dropping it', () => {
    const report = run('kind,name,lifecycle\napplication,A,alive\n');
    assert.equal(report.created, 0);
    assert.match(report.rows[0].reason!, /not a lifecycle/);
    /* Silently storing nothing would hide the typo until someone ran a report
     * on it and found an empty column. */
    assert.equal(repo.countEntities(), 0);
  });

  test('provenance columns are read, and an external id needs a source', () => {
    const ok = run('kind,name,source,external_id\napplication,A,cmdb,ci-9\n');
    assert.equal(ok.created, 1);
    assert.ok(repo.entityBySource('cmdb', 'ci-9'));

    const bad = run('kind,name,external_id\napplication,B,ci-9\n');
    assert.match(bad.rows[0].reason!, /needs a source/);
  });

  test('a second import matches on the source id before anything else', () => {
    run('kind,name,source,external_id\napplication,Invoicing,cmdb,ci-1\n');
    run('kind,name,source,external_id\napplication,Invoicing service,cmdb,ci-1\n');
    assert.equal(repo.listEntities('application').length, 1);
    assert.equal(repo.listEntities('application')[0].name, 'Invoicing service');
  });
});

/* --------------------------------------------------- 5. shared motivation */

describe('reasoning that is the enterprise\'s rather than one document\'s', () => {
  const withGoal = (goalId: string) => docOf({
    motivation: {
      items: [{ id: 'm1', kind: 'goal', name: 'Cut invoicing cost', entity: goalId }]
    }
  });

  test('a goal cited only by the reasoning survives hydration and normalisation', () => {
    const goal = repo.createEntity({ kind: 'goal', name: 'Cut cost 30%' });
    const project = store.createProject({ name: 'P', data: withGoal(goal.id) as never });

    const saved = store.getProject(project.id)!.data;
    /* The bug this replaces: `citedIds` only walked components, so the imprint
     * pruned an entry no component mentioned — and `normalizeMotivation` then
     * dropped the citation on the next pass, because the imprint no longer
     * backed it. Two saves and it was gone, with nothing logged. */
    assert.ok(saved.imprint?.entities.some(e => e.id === goal.id),
      'the imprint carries it');
    assert.equal(saved.motivation?.items[0].entity, goal.id, 'and the citation is kept');

    /* The second save is the one that used to lose it. */
    store.updateProject(project.id, { data: saved });
    const twice = store.getProject(project.id)!.data;
    assert.equal(twice.motivation?.items[0].entity, goal.id);
  });

  test('a citation pointing at the wrong half of the model is dropped', () => {
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });
    const project = store.createProject({ name: 'P', data: withGoal(app.id) as never });
    const saved = store.getProject(project.id)!.data;
    /* An application is not reasoning. Not a smaller mistake than pointing at
     * nothing, so it gets the same treatment. */
    assert.equal(saved.motivation?.items[0].entity, undefined);
  });

  test('the citation is indexed, so it is countable across projects', () => {
    const goal = repo.createEntity({ kind: 'goal', name: 'Cut cost 30%' });
    store.createProject({ name: 'Alpha', data: withGoal(goal.id) as never });
    store.createProject({ name: 'Beta', data: withGoal(goal.id) as never });

    const rows = db.prepare(
      "SELECT project_id FROM project_entity_links WHERE entity_id = ? AND role = 'motivation'"
    ).all(goal.id);
    assert.equal(rows.length, 2);
    assert.equal(repo.listEntities('goal')[0].usedBy, 2);
  });

  test('"which projects serve this objective" answers, sub-goals included', () => {
    const parent = repo.createEntity({ kind: 'goal', name: 'Cut cost' });
    const child = repo.createEntity({ kind: 'goal', name: 'Cut invoicing cost', parent: parent.id });
    store.createProject({ name: 'Alpha', data: withGoal(child.id) as never });

    const result = query.runQuery('traceability', parent.id);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0][0], 'Alpha');
    assert.equal(result.rows[0][1], 'Cut invoicing cost');
    assert.match(result.note!, /1 objective/);
  });

  test('an imprint entry nobody cites at all is still pruned', () => {
    /* The fix widened what counts as a citation; it must not have turned the
     * prune off. */
    const goal = repo.createEntity({ kind: 'goal', name: 'Unused' });
    const project = store.createProject({ name: 'P', data: docOf() as never });
    store.updateProject(project.id, {
      data: { ...store.getProject(project.id)!.data, imprint: { entities: [{ id: goal.id, kind: 'goal', name: 'Unused' }] } } as never
    });
    assert.equal(store.getProject(project.id)!.data.imprint, undefined);
  });
});

/* --------------------------------------------------------- 6. compliance */

describe('what the new fields make checkable', () => {
  test('retired, and still on a diagram', () => {
    const app = repo.createEntity({
      kind: 'application', name: 'Old billing', lifecycle: 'retired'
    });
    store.createProject({ name: 'P', data: docOf() as never });
    /* Cite it from the drawing, which is what makes it "still drawn". */
    const p = store.listProjects()[0];
    const doc = store.getProject(p.id)!.data;
    doc.components[0].ea = { app: app.id };
    store.updateProject(p.id, { data: doc });

    const findings = compliance.check();
    const hit = findings.filter(f => f.rule === 'retired-live');
    assert.equal(hit.length, 1);
    assert.match(hit[0].detail, /still drawn in 1 project/);
  });

  test('an objective with nothing behind it, rolled up like a capability', () => {
    const parent = repo.createEntity({ kind: 'goal', name: 'Cut cost' });
    const child = repo.createEntity({ kind: 'goal', name: 'Cut invoicing cost', parent: parent.id });

    let findings = compliance.check().filter(f => f.rule === 'unserved-goal');
    assert.equal(findings.length, 2, 'neither is served yet');

    store.createProject({
      name: 'Alpha',
      data: docOf({
        motivation: { items: [{ id: 'm1', kind: 'goal', name: 'Local', entity: child.id }] }
      }) as never
    });

    findings = compliance.check().filter(f => f.rule === 'unserved-goal');
    /* Serving the child serves the parent. Reporting the parent anyway is the
     * noise that makes a compliance report get filed unread. */
    assert.equal(findings.length, 0);
  });
});

/* ----------------------------------------------------- 7. the closed loop */

describe('what declaring a relationship is worth', () => {
  test('the generated landscape reads the domains nobody could declare before', () => {
    const payments = repo.createEntity({ kind: 'domain', name: 'Payments' });
    const app = repo.createEntity({ kind: 'application', name: 'Invoicing' });

    /* Before the relationship exists, the application has no band of its own:
     * `buildLandscape` groups by `assigned-to` pointing at a domain, and until
     * there was a way to create one that table was always empty — so every
     * landscape ever generated had exactly one band called "Unassigned". */
    let doc = landscape.buildLandscape();
    assert.deepEqual(doc.layers.map(l => l.name), ['Unassigned']);

    repo.createRelation('assigned-to', app.id, payments.id);

    doc = landscape.buildLandscape();
    assert.deepEqual(doc.layers.map(l => l.name), ['Payments']);
    assert.equal(doc.components.find(c => c.name === 'Invoicing')?.layer, payments.id);
  });
});

/* ------------------------------------------------------------- 8. imprint */

describe('the imprint still holds its invariant', () => {
  test('a document using none of this is untouched by all of it', () => {
    const project = store.createProject({ name: 'P', data: docOf() as never });
    const saved = store.getProject(project.id)!.data;
    assert.equal(saved.imprint, undefined);
    assert.equal(saved.motivation, undefined);
    assert.equal(
      JSON.stringify(saved),
      JSON.stringify(store.getProject(project.id)!.data),
      'and re-reading it produces the same bytes'
    );
  });

  test('motivationCitations reads both directions of one sentence', () => {
    const doc = docOf({
      motivation: {
        items: [{
          id: 'm1', kind: 'goal', name: 'G',
          entity: 'e_goal',
          realizedBy: ['billing', 'e_app']
        }]
      }
    });
    const found = imprint.motivationCitations(doc as never);
    assert.deepEqual(
      found.map(f => [f.id, f.role]),
      [['e_goal', 'motivation'], ['e_app', 'realizes']],
      'the component id is not an entity citation'
    );
  });
});

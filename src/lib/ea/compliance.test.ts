/* Compliance, and the TOGAF outline.
 *
 * Two things are worth testing hard here and the rest follows from them.
 *
 * Every finding must name **who can act on it** — a report listing two hundred
 * violations and no owners is a report that gets filed. And the outline must be
 * **cumulative**: a project in phase B still carries the vision it came from,
 * or the document has no reason in it.
 */

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-compliance-'));
process.env.DATABASE_PATH = path.join(DIR, 'test.db');
delete process.env.AUTH_MODE;

type Repo = typeof import('./repository');
type Compliance = typeof import('./compliance');
type Togaf = typeof import('../document/preset-togaf');
type Store = typeof import('../store');
type AdmStore = typeof import('../adm-store');
type Roles = typeof import('../auth/roles');

let repo: Repo, compliance: Compliance, togaf: Togaf, store: Store, adm: AdmStore, roles: Roles;
let db: typeof import('../db').db;
let blank: typeof import('../defaults').blankArchitecture;
let buildOutline: typeof import('../document/plan').buildOutline;
let partOf: typeof import('../document/plan').partOf;

before(async () => {
  repo = await import('./repository');
  compliance = await import('./compliance');
  togaf = await import('../document/preset-togaf');
  store = await import('../store');
  adm = await import('../adm-store');
  roles = await import('../auth/roles');
  db = (await import('../db')).db;
  blank = (await import('../defaults')).blankArchitecture;
  ({ buildOutline, partOf } = await import('../document/plan'));
});
after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

beforeEach(() => {
  db.exec(`DELETE FROM project_adm; DELETE FROM folder_kinds;
           DELETE FROM project_entity_links; DELETE FROM project_stats;
           DELETE FROM project_domains; DELETE FROM ea_relations;
           DELETE FROM ea_entity_texts; DELETE FROM ea_entity_props;
           DELETE FROM ea_entities; DELETE FROM revisions; DELETE FROM projects;`);
});

const app = (name: string) => repo.createEntity({ kind: 'application', name });
const cap = (name: string) => repo.createEntity({ kind: 'capability', name });
const actor = (name: string) => repo.createEntity({ kind: 'actor', name });
const domain = (name: string) => repo.createEntity({ kind: 'domain', name });

/** A project whose components cite entities. `spec` is `[id, app?, caps, owner?]`. */
function project(name: string, spec: [string, string | null, string[], string?][], tech: string[] = []) {
  const doc = blank(name);
  doc.layers = [{ id: 'l', name: 'L' }];
  doc.groups = [{ id: 'g', name: 'G' }];
  doc.components = spec.map(([id, appId, caps, owner]) => ({
    id, name: id, group: 'g', layer: 'l',
    tech, features: [], notes: [], deps: [],
    ...(appId || caps.length || owner
      ? {
        ea: {
          ...(appId ? { app: appId } : {}),
          ...(caps.length ? { capabilities: caps } : {}),
          ...(owner ? { owner } : {})
        }
      }
      : {})
  })) as never;
  return store.createProject({ name, data: doc });
}

const findingsFor = (rule: string) => compliance.check().filter(f => f.rule === rule);

/* ------------------------------------------------------------------ rules */

describe('every application has an owner', () => {
  test('a declared assignment satisfies it, and names the owner', () => {
    const invoicing = app('Invoicing');
    const finance = domain('Finance');
    repo.createRelation('assigned-to', invoicing.id, finance.id);
    /* Carrying nothing is a different rule; give it one so this test is about
     * ownership alone. */
    repo.createRelation('realizes', invoicing.id, cap('Billing').id);

    assert.deepEqual(findingsFor('owner'), []);
  });

  test('a drawn owner satisfies it too — most installs have only those', () => {
    const invoicing = app('Invoicing');
    const team = actor('Payments team');
    project('P', [['c', invoicing.id, [cap('Billing').id], team.id]]);

    assert.deepEqual(findingsFor('owner'), []);
  });

  test('an unowned application is reported, and says nobody can act', () => {
    app('Orphan');
    const [finding] = findingsFor('owner');
    assert.equal(finding.subject, 'Orphan');
    assert.equal(finding.owner, 'nobody yet');
    assert.equal(finding.severity, 'risk');
  });
});

describe('the other rules', () => {
  test('an application carrying nothing is reported, to whoever owns it', () => {
    const invoicing = app('Invoicing');
    const finance = domain('Finance');
    repo.createRelation('assigned-to', invoicing.id, finance.id);

    const [finding] = findingsFor('capability');
    assert.equal(finding.subject, 'Invoicing');
    assert.equal(finding.owner, 'Finance', 'the owner is who can act, and it is named');
  });

  test('a component on a retiring standard is reported against its application', () => {
    const java = repo.createEntity({
      kind: 'technology-standard', name: 'Java 8', status: 'retire'
    });
    const legacy = app('Legacy biller');
    const team = actor('Payments team');
    project('P', [['c', legacy.id, [], team.id]], ['Java 8']);

    const [finding] = findingsFor('retired-tech');
    assert.equal(finding.subject, 'Legacy biller');
    assert.match(finding.detail, /Still on Java 8/);
    assert.equal(finding.owner, 'Payments team');
    assert.ok(java.id);
  });

  test('a standard that is merely on hold is not a finding', () => {
    repo.createEntity({ kind: 'technology-standard', name: 'Java 8', status: 'hold' });
    project('P', [['c', app('X').id, [], undefined]], ['Java 8']);
    assert.deepEqual(findingsFor('retired-tech'), []);
  });

  test('the technology match is exact, so no migration is invented', () => {
    repo.createEntity({ kind: 'technology-standard', name: 'Java 8', status: 'retire' });
    project('P', [['c', app('X').id, [], undefined]], ['Java 8.1']);
    assert.deepEqual(findingsFor('retired-tech'), []);
  });

  test('a capability nobody carries is a finding', () => {
    cap('Fraud detection');
    const [finding] = findingsFor('coverage');
    assert.equal(finding.subject, 'Fraud detection');
    assert.equal(finding.severity, 'gap');
  });

  test('a parent whose children are carried is not reported', () => {
    /* Reporting "Order to cash" because only its sub-capabilities have
     * applications is noise, and noise is what makes a report get filed. The
     * capability map rolls up the same way — the two must agree. */
    const sales = cap('Order to cash');
    const billing = repo.createEntity({ kind: 'capability', name: 'Billing', parent: sales.id });
    const fraud = repo.createEntity({ kind: 'capability', name: 'Fraud', parent: sales.id });
    repo.createRelation('realizes', app('Invoicing').id, billing.id);

    assert.deepEqual(findingsFor('coverage').map(f => f.subject), ['Fraud'],
      'only the leaf nobody carries');
    assert.ok(fraud.id);
  });

  test('unmapped components are counted per project, not per component', () => {
    const invoicing = app('Invoicing');
    const p = project('Landscape', [
      ['a', invoicing.id, [], undefined],
      ['b', null, [], undefined],
      ['c', null, [], undefined]
    ]);
    const found = findingsFor('mapped');
    assert.equal(found.length, 1, 'one row per project — a hundred would bury the five that matter');
    assert.match(found[0].detail, /2 of 3 components/);
    assert.ok(p.id);
  });

  test('a project with a domain is not reported, and one without is', () => {
    const finance = domain('Finance');
    const owned = project('Owned', [['a', app('X').id, [], undefined]]);
    project('Unowned', [['a', app('Y').id, [], undefined]]);

    roles.setProjectDomain(owned.id, finance.id);

    assert.deepEqual(findingsFor('domain').map(f => f.subject), ['Unowned']);
  });
});

describe('the report', () => {
  test('is a table with an owner column, and says so when it is empty', () => {
    const table = compliance.complianceTable();
    assert.deepEqual(table.columns, ['Rule', 'Subject', 'Finding', 'Who can act']);
    assert.deepEqual(table.rows, []);
    assert.match(table.empty, /Nothing to report/);
    assert.match(table.note, /not automatically a mistake/);
  });

  test('counts per rule agree with the findings', () => {
    app('Orphan');
    cap('Unclaimed');
    const counts = compliance.summary();
    const findings = compliance.check();
    for (const { rule, count } of counts) {
      assert.equal(count, findings.filter(f => f.rule === rule.id).length, rule.id);
    }
  });
});

/* ---------------------------------------------------------------- outline */

describe('the TOGAF outline', () => {
  test('is cumulative — phase B carries the vision it came from', () => {
    const doc = blank('P');
    const { added } = togaf.applyTogafOutline(doc, 'B');

    assert.ok(added.includes('togaf-vision'), 'phase A comes along');
    assert.ok(added.includes('togaf-capabilities'), 'and phase B');
    assert.ok(!added.includes('togaf-technology'), 'but nothing from D');
  });

  test('every chapter belongs to a phase, and none is orphaned', () => {
    for (const id of togaf.TOGAF_SECTION_IDS) {
      assert.ok(togaf.phaseOfSection(id), `${id} has no phase`);
    }
  });

  test('applying it twice adds nothing and keeps the edits', () => {
    const doc = blank('P');
    togaf.applyTogafOutline(doc, 'C');
    doc.sections[0].title = 'Edited by hand';

    const second = togaf.applyTogafOutline(doc, 'C');
    assert.deepEqual(second.added, []);
    assert.equal(doc.sections[0].title, 'Edited by hand');
  });

  test('three chapters carry a question rather than an empty box', () => {
    const doc = blank('P');
    togaf.applyTogafOutline(doc, 'H');
    const asked = doc.sections
      .filter(s => (s as { computed?: { query: string } }).computed)
      .map(s => (s as unknown as { computed: { query: string } }).computed.query);
    assert.deepEqual(asked.sort(), ['capability-map', 'compliance', 'motivation', 'roadmap'].sort());
  });

  test('it switches the printable document onto the TOGAF spine', () => {
    const doc = blank('P');
    togaf.applyTogafOutline(doc, 'H');
    assert.equal(doc.meta.outline, 'togaf');

    /* Empty parts are pruned — a part with no chapter is a heading over
     * nothing — so what comes back is exactly the eight the outline filled. */
    assert.deepEqual(buildOutline(doc).parts.map(p => p.title), [
      'Architecture vision', 'Business architecture', 'Information systems',
      'Technology architecture', 'Opportunities & solutions', 'Migration planning',
      'Implementation governance', 'Change management'
    ]);
  });

  test('the same chapter number means a different part on each spine', () => {
    /* "7.1" is Implementation Governance under TOGAF and an appendix under the
     * ADD plan. That is the whole reason the spine is a property of the
     * document rather than a constant. */
    const section = { id: 'x', type: 'text', title: 'X', doc: { chapter: '7.1' } } as never;
    const add = blank('P');
    const tog = blank('P');
    tog.meta.outline = 'togaf';

    assert.equal(partOf(section, add), '6', 'appendices');
    assert.equal(partOf(section, tog), '7', 'implementation governance');
  });

  test('a document that never asked for it stays on the ADD plan', () => {
    const doc = blank('P');
    doc.meta.intro = 'Why this exists.';
    doc.sections = [{ id: 's', type: 'text', title: 'Scaling', blocks: [], doc: { chapter: '2.3' } }] as never;

    const parts = buildOutline(doc).parts.map(p => p.title);
    assert.deepEqual(parts, ['Introduction', 'Application architecture']);
  });

  test('the tab bar is left exactly as it was', () => {
    const doc = blank('P');
    doc.layers = [{ id: 'l', name: 'L' }];
    doc.groups = [{ id: 'g', name: 'G' }];
    doc.components = [{
      id: 'c', name: 'C', group: 'g', layer: 'l',
      tech: [], features: [], notes: [], deps: []
    }] as never;

    togaf.applyTogafOutline(doc, 'H');
    const paper = new Set(togaf.TOGAF_SECTION_IDS);
    assert.equal((doc.ui.tabs ?? []).some(t => paper.has(t)), false,
      'these are written for paper — the viewer is unchanged');
  });
});

/* -------------------------------------------------------------- ADM store */

describe('where a project sits', () => {
  test('remembers its phase, and can forget', () => {
    const p = project('P', [['a', null, [], undefined]]);
    assert.equal(adm.projectPhase(p.id), null);

    adm.setProjectPhase(p.id, 'B', 'first pass');
    assert.deepEqual(adm.projectPhase(p.id), { phase: 'B', iteration: 'first pass' });

    adm.setProjectPhase(p.id, null);
    assert.equal(adm.projectPhase(p.id), null);
  });
});

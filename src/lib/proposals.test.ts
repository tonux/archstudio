/* Proposals, against a real database.
 *
 * The claim that matters most is the one about honesty: a reviewer is shown the
 * difference between the proposal and **what it was opened against**, not
 * against the project as it stands now. Comparing to now would quietly
 * attribute to the author every change anyone else made in the meantime, and it
 * would do so invisibly.
 *
 * The second is that approving is not a third way of writing a document — it is
 * `updateProject` followed by `freezeVersion`, both of which already existed and
 * are already tested. What governance adds is who may call them.
 */

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-proposals-'));
process.env.DATABASE_PATH = path.join(DIR, 'test.db');
delete process.env.AUTH_MODE;

type Proposals = typeof import('./proposals');
type Store = typeof import('./store');
type AuthStore = typeof import('./auth/store');
type Roles = typeof import('./auth/roles');

let proposals: Proposals, store: Store, auth: AuthStore, roles: Roles;
let db: typeof import('./db').db;
let blank: typeof import('./defaults').blankArchitecture;
let diffArchitecture: typeof import('./diff').diffArchitecture;

before(async () => {
  proposals = await import('./proposals');
  store = await import('./store');
  auth = await import('./auth/store');
  roles = await import('./auth/roles');
  db = (await import('./db')).db;
  blank = (await import('./defaults')).blankArchitecture;
  diffArchitecture = (await import('./diff')).diffArchitecture;
});
after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

beforeEach(() => {
  db.exec(`DELETE FROM proposal_reviews; DELETE FROM proposals; DELETE FROM roles;
           DELETE FROM project_domains; DELETE FROM revision_authors;
           DELETE FROM revisions; DELETE FROM project_entity_links;
           DELETE FROM project_stats; DELETE FROM projects;
           DELETE FROM sessions; DELETE FROM auth_credentials; DELETE FROM principals;`);
});

/** A project with `names` as its components. */
function projectOf(names: string[]) {
  const doc = blank('P');
  doc.layers = [{ id: 'l', name: 'L' }];
  doc.groups = [{ id: 'g', name: 'G' }];
  doc.components = names.map(n => ({
    id: n, name: n.toUpperCase(), group: 'g', layer: 'l',
    tech: [], features: [], notes: [], deps: []
  })) as never;
  return store.createProject({ name: 'P', data: doc });
}

const withComponents = (names: string[]) => {
  const doc = blank('P');
  doc.layers = [{ id: 'l', name: 'L' }];
  doc.groups = [{ id: 'g', name: 'G' }];
  doc.components = names.map(n => ({
    id: n, name: n.toUpperCase(), group: 'g', layer: 'l',
    tech: [], features: [], notes: [], deps: []
  })) as never;
  return doc;
};

/* ------------------------------------------------------------- lifecycle */

describe('opening one', () => {
  test('seeds it with the project as it stands, and records the base', () => {
    const p = projectOf(['a', 'b']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');

    const proposal = proposals.openProposal(p.id, ada.id, 'Split the biller')!;
    assert.equal(proposal.status, 'open');
    assert.equal(proposal.authorName, 'Ada');
    assert.ok(proposal.baseRevisionId, 'the base is a real snapshot, not a promise');

    const data = proposals.proposalData(proposal.id)!;
    assert.deepEqual(data.components.map(c => c.id), ['a', 'b']);
  });

  test('a second one for the same person on the same project is the same one', () => {
    const p = projectOf(['a']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');

    const first = proposals.openProposal(p.id, ada.id)!;
    const second = proposals.openProposal(p.id, ada.id)!;
    assert.equal(first.id, second.id, 'nobody wants two half-finished drafts');
    assert.equal(proposals.listProposals('open').length, 1);
  });

  test('two people get their own', () => {
    const p = projectOf(['a']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    const grace = auth.upsertPrincipal('grace@example.com', 'Grace');

    const one = proposals.openProposal(p.id, ada.id)!;
    const two = proposals.openProposal(p.id, grace.id)!;
    assert.notEqual(one.id, two.id);
    assert.equal(proposals.openProposalFor(p.id, ada.id)!.id, one.id);
  });
});

describe('saving into one', () => {
  test('writes to the proposal and leaves the project alone', () => {
    const p = projectOf(['a']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    const proposal = proposals.openProposal(p.id, ada.id)!;

    proposals.saveProposal(proposal.id, withComponents(['a', 'b']));

    assert.deepEqual(proposals.proposalData(proposal.id)!.components.map(c => c.id), ['a', 'b']);
    assert.deepEqual(store.getProject(p.id)!.data.components.map(c => c.id), ['a'],
      'the published document has not moved');
  });

  test('a closed proposal refuses further writes', () => {
    const p = projectOf(['a']);
    const proposal = proposals.openProposal(p.id, null)!;
    proposals.rejectProposal(proposal.id, null);

    assert.equal(proposals.saveProposal(proposal.id, withComponents(['a', 'b'])), null);
  });
});

/* ---------------------------------------------------------------- honesty */

describe('what the reviewer is shown', () => {
  test('is the difference from the base, not from wherever the project drifted to', () => {
    const p = projectOf(['a']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    const proposal = proposals.openProposal(p.id, ada.id)!;

    /* Ada adds one component. */
    proposals.saveProposal(proposal.id, withComponents(['a', 'b']));
    /* Meanwhile somebody else adds a different one to the project. */
    store.updateProject(p.id, { data: withComponents(['a', 'c']) });

    const base = store.getRevisionData(p.id, proposal.baseRevisionId!)!;
    const candidate = proposals.proposalData(proposal.id)!;

    const honest = diffArchitecture(base, candidate);
    assert.deepEqual(honest.changes.map(c => `${c.kind}:${c.label}`), ['added:B'],
      'exactly what Ada did');

    const misleading = diffArchitecture(store.getProject(p.id)!.data, candidate);
    assert.ok(misleading.changes.some(c => c.label === 'C'),
      'comparing to today would blame Ada for C, which is why the base is stored');
  });
});

/* ---------------------------------------------------------------- verdicts */

describe('approving', () => {
  test('publishes the document and leaves a version signed by the reviewer', () => {
    const p = projectOf(['a']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    const grace = auth.upsertPrincipal('grace@example.com', 'Grace');

    const proposal = proposals.openProposal(p.id, ada.id, 'Add the biller')!;
    proposals.saveProposal(proposal.id, withComponents(['a', 'b']));

    const merged = proposals.mergeProposal(proposal.id, grace.id, 'Looks right');
    assert.ok(merged);

    assert.deepEqual(store.getProject(p.id)!.data.components.map(c => c.id), ['a', 'b'],
      'the proposal is now the project');

    const version = store.listRevisions(p.id).find(r => r.label === 'Add the biller');
    assert.ok(version, 'a frozen version marks the publication');
    assert.equal(version!.author, 'Grace', 'signed by whoever approved it');

    assert.equal(proposals.getProposal(proposal.id)!.status, 'merged');
    assert.deepEqual(proposals.reviewsOf(proposal.id).map(r => r.verdict), ['approved']);
    assert.equal(proposals.reviewsOf(proposal.id)[0].note, 'Looks right');
  });

  test('an untitled proposal still gets a version anyone can find', () => {
    const p = projectOf(['a']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    const proposal = proposals.openProposal(p.id, ada.id)!;
    proposals.mergeProposal(proposal.id, null);

    assert.ok(store.listRevisions(p.id).some(r => r.label === 'Proposal by Ada'));
  });

  test('approving twice is refused rather than published twice', () => {
    const p = projectOf(['a']);
    const proposal = proposals.openProposal(p.id, null)!;
    assert.ok(proposals.mergeProposal(proposal.id, null));
    assert.equal(proposals.mergeProposal(proposal.id, null), null);
  });
});

describe('the other two verdicts', () => {
  test('rejecting closes it and leaves the project untouched', () => {
    const p = projectOf(['a']);
    const proposal = proposals.openProposal(p.id, null)!;
    proposals.saveProposal(proposal.id, withComponents(['a', 'b']));

    assert.equal(proposals.rejectProposal(proposal.id, null, 'Not yet'), true);
    assert.deepEqual(store.getProject(p.id)!.data.components.map(c => c.id), ['a']);
    assert.equal(proposals.getProposal(proposal.id)!.status, 'rejected');
  });

  test('withdrawing is a different fact from being rejected', () => {
    /* A list that conflated the two would misrepresent both people. */
    const p = projectOf(['a']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    const proposal = proposals.openProposal(p.id, ada.id)!;

    assert.equal(proposals.withdrawProposal(proposal.id, ada.id), true);
    assert.equal(proposals.getProposal(proposal.id)!.status, 'withdrawn');
    assert.deepEqual(proposals.reviewsOf(proposal.id).map(r => r.verdict), ['withdrawn']);
  });

  test('a closed proposal accepts no further verdict', () => {
    const p = projectOf(['a']);
    const proposal = proposals.openProposal(p.id, null)!;
    proposals.rejectProposal(proposal.id, null);
    assert.equal(proposals.rejectProposal(proposal.id, null), false);
    assert.equal(proposals.withdrawProposal(proposal.id, null), false);
  });

  test('an open list shows only what is waiting', () => {
    const p = projectOf(['a']);
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    const grace = auth.upsertPrincipal('grace@example.com', 'Grace');
    const one = proposals.openProposal(p.id, ada.id)!;
    proposals.openProposal(p.id, grace.id);
    proposals.rejectProposal(one.id, null);

    assert.equal(proposals.listProposals('open').length, 1);
    assert.equal(proposals.listProposals('all').length, 2);
  });
});

/* ---------------------------------------------------------------- domains */

describe('project ownership', () => {
  test('a project remembers which domain owns it, and can forget', () => {
    const p = projectOf(['a']);
    assert.equal(roles.projectDomain(p.id), null);

    roles.setProjectDomain(p.id, 'd_finance');
    assert.equal(roles.projectDomain(p.id), 'd_finance');
    assert.deepEqual([...roles.projectDomains()], [[p.id, 'd_finance']]);

    roles.setProjectDomain(p.id, null);
    assert.equal(roles.projectDomain(p.id), null);
  });

  test('the subject a decision is taken on carries the domain', () => {
    const p = projectOf(['a']);
    roles.setProjectDomain(p.id, 'd_finance');
    assert.deepEqual(roles.projectSubject(p.id),
      { kind: 'project', id: p.id, domain: 'd_finance' });
  });
});

describe('grants', () => {
  test('survive a round trip, and the same role in two domains does not collide', () => {
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    roles.grant(ada.id, 'architect', 'domain', 'd1');
    roles.grant(ada.id, 'architect', 'domain', 'd2');

    const held = roles.grantsOf(ada.id);
    assert.equal(held.length, 2);
    assert.deepEqual(held.map(g => g.scopeId).sort(), ['d1', 'd2']);
  });

  test('granting the same thing twice is not an error', () => {
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    roles.grant(ada.id, 'viewer', 'global');
    roles.grant(ada.id, 'viewer', 'global');
    assert.equal(roles.grantsOf(ada.id).length, 1);
  });

  test('a scoped grant with nothing to scope to is refused', () => {
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    assert.throws(() => roles.grant(ada.id, 'architect', 'domain'), /scope it to/);
  });

  test('revoking removes exactly one grant', () => {
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    roles.grant(ada.id, 'architect', 'domain', 'd1');
    roles.grant(ada.id, 'viewer', 'global');

    roles.revoke(ada.id, 'architect', 'domain', 'd1');
    assert.deepEqual(roles.grantsOf(ada.id).map(g => g.role), ['viewer']);
  });

  test('anyAdmin is a property of the install, not of an account', () => {
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    assert.equal(roles.anyAdmin(), false, 'the valve is open on a fresh install');

    roles.grant(ada.id, 'admin', 'global');
    assert.equal(roles.anyAdmin(), true);

    /* And it is right again after the only admin is deleted, which a
     * "first account is admin" rule would have got wrong. */
    auth.deletePrincipal(ada.id);
    assert.equal(roles.anyAdmin(), false);
  });

  test('removing a person takes their grants with them', () => {
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    roles.grant(ada.id, 'architect', 'global');
    auth.deletePrincipal(ada.id);
    assert.deepEqual(roles.grantsOf(ada.id), []);
  });
});

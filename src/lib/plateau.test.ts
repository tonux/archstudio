/* The trajectory.
 *
 * The claim being tested is not really "projection works" — it is that
 * projecting rather than extending made four other things free. So alongside the
 * projection rules there are tests that assert the *absence* of work:
 * `diffArchitecture` compares two plateaus with no code written for it, and a
 * document with no plateaus comes out of the normaliser byte-for-byte as before.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { blankArchitecture, normalizeArchitecture } from './defaults';
import { diffArchitecture } from './diff';
import {
  hasTrajectory, normalizePlan, normalizePlateaus, plateauIndex,
  projectAt, stateAt, summarise
} from './plateau';
import type { Architecture, Component, Plan } from './types';

/** Three plateaus and a cast of components with plans. */
function doc(): Architecture {
  const d = blankArchitecture('P');
  d.layers = [{ id: 'svc', name: 'Services' }];
  d.groups = [{ id: 'core', name: 'Core' }];
  d.plateaus = [
    { id: 't0', name: 'Today', kind: 'baseline' },
    { id: 't1', name: '2026', kind: 'transition', date: 'Q3 2026' },
    { id: 't2', name: 'Target', kind: 'target' }
  ];
  const c = (id: string, plan?: Plan, deps: string[] = []): Component => ({
    id, name: id.toUpperCase(), group: 'core', layer: 'svc',
    tech: [], features: [], notes: [], deps, ...(plan ? { plan } : {})
  });
  d.components = [
    c('legacy', { to: 't1' }, []),          // there today, retired at 2026
    c('core', undefined, ['legacy']),        // always there
    c('new', { from: 't1' }, ['core']),      // arrives at 2026
    c('future', { from: 't2' }, []),         // arrives at the target only
    c('reworked', { changed: 't1' }, [])     // stays, but is reworked at 2026
  ];
  return normalizeArchitecture(d);
}

const ids = (d: Architecture) => d.components.map(c => c.id).sort();
const stateOf = (d: Architecture, id: string) =>
  d.components.find(c => c.id === id)?.state ?? null;

/* ------------------------------------------------------------ projection */

describe('projectAt', () => {
  test('the baseline holds what exists today, unmarked', () => {
    const at = projectAt(doc(), 't0');
    assert.deepEqual(ids(at), ['core', 'legacy', 'reworked']);
    assert.equal(stateOf(at, 'legacy'), null, 'being retired later is not a mark today');
    assert.equal(stateOf(at, 'core'), null);
  });

  test('a transition marks what arrives, what is reworked, and what leaves', () => {
    const at = projectAt(doc(), 't1');
    assert.deepEqual(ids(at), ['core', 'legacy', 'new', 'reworked']);
    assert.equal(stateOf(at, 'new'), 'new');
    assert.equal(stateOf(at, 'reworked'), 'changed');
    assert.equal(stateOf(at, 'legacy'), 'removed', 'still drawn, marked for removal');
  });

  test('what was retired is gone from every plateau after', () => {
    const at = projectAt(doc(), 't2');
    assert.deepEqual(ids(at), ['core', 'future', 'new', 'reworked']);
    assert.equal(stateOf(at, 'new'), null, 'new at t1 is ordinary at t2');
    assert.equal(stateOf(at, 'future'), 'new');
  });

  test('a dependency on something absent from this plateau is not drawn', () => {
    /* `core` depends on `legacy`, which is gone at the target. Left in, the
     * sheet would draw an edge to a card that is not on it. */
    const at = projectAt(doc(), 't2');
    assert.deepEqual(at.components.find(c => c.id === 'core')!.deps, []);

    const before = projectAt(doc(), 't0');
    assert.deepEqual(before.components.find(c => c.id === 'core')!.deps, ['legacy']);
  });

  test('a flow step pointing at an absent component is dropped', () => {
    const d = doc();
    d.flows = [{ id: 'f', name: 'F', steps: [
      { component: 'core', title: 'one' }, { component: 'legacy', title: 'two' }
    ] }];
    const at = projectAt(d, 't2');
    assert.deepEqual(at.flows[0].steps.map(s => s.component), ['core'],
      'a step pointing at nothing would crash the viewer');
  });

  test('an unknown plateau returns the same object, not a copy', () => {
    const d = doc();
    assert.equal(projectAt(d, 'nope'), d,
      'the ordinary path must not even copy');
  });

  test('a document with no plateaus projects to itself', () => {
    const d = blankArchitecture('X');
    assert.equal(projectAt(d, 't0'), d);
    assert.equal(hasTrajectory(d), false);
  });
});

/* ----------------------------------------------------------------- edges */

describe('the awkward cases', () => {
  const order = plateauIndex(doc());

  test('arriving at the first plateau is the baseline, not an arrival', () => {
    assert.equal(stateAt({ from: 't0' }, 0, order), undefined);
  });

  test('appearing and being retired at the same plateau reads as removed', () => {
    /* An authoring mistake either way. `removed` wins because marking something
     * for removal is the most consequential thing this format can say, and it
     * must never be the mark that gets swallowed. */
    assert.equal(stateAt({ from: 't1', to: 't1' }, 1, order), 'removed');
  });

  test('a plan naming a plateau the document does not declare is ignored', () => {
    /* Not "the component vanishes": a typo in an invisible id must not delete
     * something from every plateau. */
    assert.equal(stateAt({ from: 'ghost' }, 0, order), undefined);
    assert.equal(stateAt({ to: 'ghost' }, 2, order), undefined);
  });

  test('a link is dropped with its endpoint and marked with its own plan', () => {
    const d = doc();
    d.components = d.components.map(c => c.id === 'core'
      ? { ...c, deps: ['legacy'], links: [{ to: 'legacy', protocol: 'REST', plan: { to: 't1' } }] }
      : c);

    const t0 = projectAt(d, 't0').components.find(c => c.id === 'core')!;
    assert.equal(t0.links?.[0].state, undefined);

    const t1 = projectAt(d, 't1').components.find(c => c.id === 'core')!;
    assert.equal(t1.links?.[0].state, 'removed');

    const t2 = projectAt(d, 't2').components.find(c => c.id === 'core')!;
    assert.equal(t2.links, undefined, 'the callee is gone, so the annotation goes');
  });
});

/* -------------------------------------------------------------- for free */

describe('what projecting made free', () => {
  test('diff compares two plateaus with no code written for it', () => {
    const d = doc();
    const delta = diffArchitecture(projectAt(d, 't0'), projectAt(d, 't2'));

    const said = delta.changes.map(c => `${c.kind}:${c.label}`);
    assert.ok(said.includes('removed:LEGACY'), 'the retired one reads as removed');
    assert.ok(said.includes('added:NEW'));
    assert.ok(said.includes('added:FUTURE'));
    assert.ok(delta.total > 0);
  });

  test('a document that describes no trajectory keeps its exact shape', () => {
    const plain = normalizeArchitecture(blankArchitecture('X'));
    assert.equal('plateaus' in plain, false, 'absent, not an empty array');
    assert.equal(plain.components.some(c => 'plan' in c), false);
  });

  test('the marks a projection produces are the ones the viewer already knows', () => {
    const at = projectAt(doc(), 't1');
    const states = new Set(at.components.map(c => c.state).filter(Boolean));
    assert.deepEqual([...states].sort(), ['changed', 'new', 'removed'],
      'exactly the three values lifecycle.ts has always had');
  });
});

/* ------------------------------------------------------------- normalise */

describe('normalisation', () => {
  test('plateaus keep their declared order — that order is the roadmap', () => {
    const out = normalizePlateaus([
      { id: 'z', name: 'Target' }, { id: 'a', name: 'Today' }
    ]);
    assert.deepEqual(out.map(p => p.id), ['z', 'a'], 'never re-sorted');
  });

  test('malformed entries and duplicates are dropped', () => {
    const out = normalizePlateaus([
      { id: 't0', name: 'Today' }, { id: 't0', name: 'Again' },
      { id: '', name: 'Nameless' }, null, { name: 'No id' }
    ]);
    assert.deepEqual(out.map(p => p.id), ['t0']);
  });

  test('an unknown kind is dropped rather than stored', () => {
    const [p] = normalizePlateaus([{ id: 't', name: 'T', kind: 'someday' }]);
    assert.equal(p.kind, undefined);
  });

  test('a plan referring to a plateau that is gone loses that reference', () => {
    const ids = new Set(['t0', 't1']);
    assert.deepEqual(normalizePlan({ from: 't0', to: 'gone' }, ids), { from: 't0' });
    assert.equal(normalizePlan({ from: 'gone' }, ids), undefined, 'empty means absent');
    assert.equal(normalizePlan(undefined, ids), undefined);
  });

  test('deleting a plateau clears the plans that named it, through the normaliser', () => {
    const d = doc();
    d.plateaus = d.plateaus!.filter(p => p.id !== 't1');
    const out = normalizeArchitecture(d);
    assert.equal(out.components.find(c => c.id === 'new')!.plan, undefined);
    assert.equal(out.components.find(c => c.id === 'legacy')!.plan, undefined);
  });
});

/* --------------------------------------------------------------- roadmap */

describe('summarise', () => {
  test('says what happens at each step, and how many stand there', () => {
    const steps = summarise(doc());
    assert.equal(steps.length, 3);

    assert.deepEqual(steps[0].arriving, []);
    assert.equal(steps[0].total, 3);

    assert.deepEqual(steps[1].arriving, ['NEW']);
    assert.deepEqual(steps[1].leaving, ['LEGACY']);
    assert.deepEqual(steps[1].reworked, ['REWORKED']);
    assert.equal(steps[1].total, 4);

    assert.deepEqual(steps[2].arriving, ['FUTURE']);
    assert.equal(steps[2].total, 4);
  });

  test('an empty document has no roadmap rather than an empty one', () => {
    assert.deepEqual(summarise(blankArchitecture('X')), []);
  });
});

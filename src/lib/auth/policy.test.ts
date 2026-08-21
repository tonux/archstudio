/* The policy, exhaustively.
 *
 * `can()` is pure, so it can be — and a permission system that is only tested
 * on the cases someone thought of is a permission system with a hole in it.
 * The first block below walks **every** (role × action) pair against the table
 * rather than sampling it.
 *
 * The two rules that carry the most risk are not about roles at all:
 *
 *   - authentication `off` allows everything, or an upgrade locks an operator
 *     out of their own data;
 *   - with **no admin anywhere**, everyone signed in is treated as one, or
 *     turning roles on is a locked door with the key inside.
 *
 * Both are tested from both sides: that they open, and that they stop opening.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import {
  ROLES, allowedActions, can, effectiveRole, roleAllows,
  type Action, type PolicyContext, type Role, type RoleGrant, type Subject
} from './policy';

const ACTIONS: Action[] = [
  'read', 'write', 'propose', 'review', 'manage-referential', 'manage-people'
];

const ada = { id: 'u_ada', email: 'ada@example.com', name: 'Ada' };

const ctx = (grants: RoleGrant[], over: Partial<PolicyContext> = {}): PolicyContext => ({
  authOff: false,
  principal: ada,
  grants,
  /* Someone is an admin somewhere, so the bootstrap valve is shut. Every test
   * below is about roles rather than about the valve, unless it says so. */
  anyAdmin: true,
  ...over
});

const PROJECT: Subject = { kind: 'project', id: 'p1', domain: 'd1' };
const REFERENTIAL: Subject = { kind: 'referential' };
const PEOPLE: Subject = { kind: 'people' };

/* ------------------------------------------------------------ every pair */

/** The table, restated here on purpose. If it is edited in `policy.ts` this
 *  test fails, which is the point: widening a role should never be a one-line
 *  change nobody reviewed. */
const EXPECTED: Record<Role, Action[]> = {
  viewer: ['read'],
  contributor: ['read', 'propose'],
  architect: ['read', 'write', 'propose', 'review', 'manage-referential'],
  admin: ['read', 'write', 'propose', 'review', 'manage-referential', 'manage-people']
};

describe('the table', () => {
  for (const role of ROLES) {
    test(`${role} may do exactly what it says`, () => {
      for (const action of ACTIONS) {
        assert.equal(
          roleAllows(role, action), EXPECTED[role].includes(action),
          `${role} × ${action}`
        );
      }
    });

    test(`${role}, globally, decides the same way through can()`, () => {
      const c = ctx([{ role, scope: 'global' }]);
      for (const action of ACTIONS) {
        assert.equal(can(c, action, PROJECT), EXPECTED[role].includes(action));
      }
    });
  }

  test('nobody is only a viewer by accident — a reader cannot write', () => {
    const c = ctx([{ role: 'viewer', scope: 'global' }]);
    assert.equal(can(c, 'read', PROJECT), true);
    assert.equal(can(c, 'write', PROJECT), false);
    assert.equal(can(c, 'propose', PROJECT), false);
  });
});

/* ----------------------------------------------------------------- scope */

describe('scope', () => {
  test('a domain grant reaches the projects that domain owns, and no others', () => {
    const c = ctx([{ role: 'architect', scope: 'domain', scopeId: 'd1' }]);
    assert.equal(can(c, 'write', PROJECT), true);
    assert.equal(can(c, 'write', { kind: 'project', id: 'p2', domain: 'd2' }), false);
    assert.equal(can(c, 'write', { kind: 'project', id: 'p3', domain: null }), false);
  });

  test('a project grant reaches exactly one project', () => {
    const c = ctx([{ role: 'architect', scope: 'project', scopeId: 'p1' }]);
    assert.equal(can(c, 'write', PROJECT), true);
    assert.equal(can(c, 'write', { kind: 'project', id: 'p2', domain: 'd1' }), false);
  });

  test('a scoped grant says nothing about the referential or about people', () => {
    /* An architect of Finance is not an architect of the enterprise's shared
     * vocabulary. Only a global grant reaches something with no domain. */
    const c = ctx([{ role: 'admin', scope: 'domain', scopeId: 'd1' }]);
    assert.equal(can(c, 'manage-referential', REFERENTIAL), false);
    assert.equal(can(c, 'manage-people', PEOPLE), false);
    assert.equal(can(c, 'write', PROJECT), true);
  });

  test('grants add up rather than overriding each other', () => {
    const c = ctx([
      { role: 'viewer', scope: 'global' },
      { role: 'architect', scope: 'domain', scopeId: 'd1' }
    ]);
    assert.equal(can(c, 'read', { kind: 'project', id: 'p2', domain: 'd2' }), true, 'the viewer grant');
    assert.equal(can(c, 'write', PROJECT), true, 'the architect grant');
    assert.equal(can(c, 'write', { kind: 'project', id: 'p2', domain: 'd2' }), false);
  });

  test('a global grant reaches everything, including what has no domain', () => {
    const c = ctx([{ role: 'admin', scope: 'global' }]);
    for (const subject of [PROJECT, REFERENTIAL, PEOPLE, { kind: 'workspace' } as Subject]) {
      assert.equal(can(c, 'read', subject), true);
    }
  });
});

/* ------------------------------------------------------------ the valves */

describe('authentication off', () => {
  test('allows everything, to nobody in particular', () => {
    const c = ctx([], { authOff: true, principal: null, anyAdmin: true });
    for (const action of ACTIONS) {
      assert.equal(can(c, action, PROJECT), true, action);
    }
  });
});

describe('the bootstrap valve', () => {
  test('with no admin anywhere, anyone signed in may do anything', () => {
    const c = ctx([], { anyAdmin: false });
    for (const action of ACTIONS) {
      assert.equal(can(c, action, PROJECT), true, action);
    }
  });

  test('and it shuts the moment one admin exists', () => {
    const c = ctx([], { anyAdmin: true });
    for (const action of ACTIONS) {
      assert.equal(can(c, action, PROJECT), false, action);
    }
  });

  test('it never opens for somebody who is not signed in', () => {
    /* The valve is about a fresh install having no roles, not about the door
     * being unlocked. Someone with no session is still nobody. */
    const c = ctx([], { principal: null, anyAdmin: false });
    for (const action of ACTIONS) {
      assert.equal(can(c, action, PROJECT), false, action);
    }
  });
});

/* -------------------------------------------------------------- for the UI */

describe('what the browser is told', () => {
  test('the strongest role wins, not the first one found', () => {
    const c = ctx([
      { role: 'viewer', scope: 'global' },
      { role: 'architect', scope: 'global' },
      { role: 'contributor', scope: 'global' }
    ]);
    assert.equal(effectiveRole(c, PROJECT), 'architect');
  });

  test('someone with nothing holds no role at all', () => {
    assert.equal(effectiveRole(ctx([]), PROJECT), null);
  });

  test('both valves report admin, so the UI matches what the server will do', () => {
    assert.equal(effectiveRole(ctx([], { authOff: true }), PROJECT), 'admin');
    assert.equal(effectiveRole(ctx([], { anyAdmin: false }), PROJECT), 'admin');
  });

  test('the action list agrees with can(), every time', () => {
    for (const role of ROLES) {
      const c = ctx([{ role, scope: 'global' }]);
      const listed = allowedActions(c, PROJECT);
      for (const action of ACTIONS) {
        assert.equal(
          listed.includes(action), can(c, action, PROJECT),
          `${role} × ${action} — a button that lies is worse than a missing one`
        );
      }
    }
  });
});

/* Who may do what. One function, and deliberately one.
 *
 * An authorisation model scattered across seventeen route handlers is one
 * nobody can audit: the question "who can delete a project" has seventeen
 * possible answers and no way to be sure you found them all. So every decision
 * this application makes goes through `can()`, it is pure, and it is tested
 * exhaustively — `grep -rn "can(" src/app` lists every place a decision is
 * taken, which is the question an audit actually asks.
 *
 * Pure means: no database, no request, no session. The caller looks up the
 * principal's roles and hands them in. That is what makes the table below
 * readable as a table rather than as a program.
 *
 * ---
 *
 * Two escape valves, both of which exist so that turning governance on cannot
 * lock an operator out of their own data:
 *
 *   - authentication `off` allows everything, exactly as it did before roles
 *     existed;
 *   - **when nobody is an admin, every authenticated person is treated as
 *     one.** A fresh install that has just switched authentication on has no
 *     roles at all, and refusing everyone would be a locked door with the key
 *     inside. The rule stops applying the moment one admin is named, which is
 *     the only moment it is safe for it to stop.
 */
import type { Principal } from './types';

export type Role = 'viewer' | 'contributor' | 'architect' | 'admin';

export const ROLES: Role[] = ['viewer', 'contributor', 'architect', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Viewer',
  contributor: 'Contributor',
  architect: 'Architect',
  admin: 'Administrator'
};

export const ROLE_BLURBS: Record<Role, string> = {
  viewer: 'Can read and export. Cannot change anything.',
  contributor: 'Can read, and can propose changes for an architect to review.',
  architect: 'Can edit directly, review proposals, and maintain the referential.',
  admin: 'Everything, including who else has a role.'
};

/** Where a role applies. A role with no scope applies everywhere. */
export type ScopeKind = 'global' | 'domain' | 'project';

export interface RoleGrant {
  role: Role;
  scope: ScopeKind;
  /** The domain or project id. Absent for a global grant. */
  scopeId?: string;
}

/* ---------------------------------------------------------------- actions */

/** What can be asked for. Small and closed on purpose: an action per route
 *  handler would be a permission system with no shape. */
export type Action =
  | 'read'
  | 'write'
  | 'propose'
  | 'review'
  | 'manage-referential'
  | 'manage-people';

/** What each role may do. The whole policy, as data.
 *
 *  Cumulative by construction rather than by an inheritance chain: "an
 *  architect is a contributor plus…" reads well and is one refactor away from
 *  being wrong, and this table can be checked by eye. */
const ALLOWED: Record<Role, Action[]> = {
  viewer: ['read'],
  contributor: ['read', 'propose'],
  architect: ['read', 'write', 'propose', 'review', 'manage-referential'],
  admin: ['read', 'write', 'propose', 'review', 'manage-referential', 'manage-people']
};

export const roleAllows = (role: Role, action: Action): boolean =>
  ALLOWED[role].includes(action);

/* --------------------------------------------------------------- subjects */

/** What is being acted on.
 *
 *  `domain` is the project's owning domain, when it has one — that is what
 *  makes a domain-scoped grant reach the projects inside it without anyone
 *  having to name each project. */
export type Subject =
  | { kind: 'project'; id: string; domain?: string | null }
  | { kind: 'referential' }
  | { kind: 'people' }
  /** Something with no owner — the workspace itself, creating a project. */
  | { kind: 'workspace' };

/** Whether a grant's scope covers this subject. */
function covers(grant: RoleGrant, subject: Subject): boolean {
  if (grant.scope === 'global') return true;
  if (subject.kind !== 'project') {
    /* A scoped grant says nothing about the referential or about people: those
     * are not inside a domain. Only a global grant reaches them. */
    return false;
  }
  if (grant.scope === 'project') return grant.scopeId === subject.id;
  return !!subject.domain && grant.scopeId === subject.domain;
}

/* ---------------------------------------------------------------- context */

export interface PolicyContext {
  /** `off` means the install has no authentication, and everything is allowed —
   *  which is exactly what it did before any of this existed. */
  authOff: boolean;
  /** Who is asking. Null with `authOff: false` means nobody, and nobody may do
   *  anything. */
  principal: Principal | null;
  /** Every grant this principal holds. */
  grants: RoleGrant[];
  /** Whether *anyone at all* is an admin on this install. See the header. */
  anyAdmin: boolean;
}

/** The one decision. */
export function can(ctx: PolicyContext, action: Action, subject: Subject): boolean {
  if (ctx.authOff) return true;
  if (!ctx.principal) return false;

  /* The bootstrap valve. Deliberately not "the first account is admin": that
   * would be state nobody can see, and it would be wrong the moment the first
   * account is deleted. This is a property of the install — no admins — and it
   * is visible in the People dialog. */
  if (!ctx.anyAdmin) return true;

  return ctx.grants.some(g => roleAllows(g.role, action) && covers(g, subject));
}

/** The most powerful role this principal holds over a subject, or null.
 *
 *  For the UI only. A screen that shows an Approve button nobody can use is a
 *  screen that teaches people the tool is broken. */
export function effectiveRole(ctx: PolicyContext, subject: Subject): Role | null {
  if (ctx.authOff || (ctx.principal && !ctx.anyAdmin)) return 'admin';
  if (!ctx.principal) return null;

  const held = ctx.grants.filter(g => covers(g, subject)).map(g => g.role);
  for (const role of [...ROLES].reverse()) if (held.includes(role)) return role;
  return null;
}

/** Every action this principal may take on a subject. What the browser is told,
 *  so a button is absent rather than present-and-refused. */
export const allowedActions = (ctx: PolicyContext, subject: Subject): Action[] =>
  (['read', 'write', 'propose', 'review', 'manage-referential', 'manage-people'] as Action[])
    .filter(a => can(ctx, a, subject));

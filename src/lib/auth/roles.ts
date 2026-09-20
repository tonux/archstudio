/* Reading and writing grants, and assembling the context `can()` decides with.
 *
 * Kept apart from `policy.ts` on purpose: that file is pure and readable as a
 * table, and it stays that way only if nothing in it touches a database.
 */
import { db, plainAll } from '../db';
import { ROLES, type Role, type RoleGrant, type ScopeKind, type PolicyContext, type Subject }
  from './policy';
import type { Principal } from './types';

const isRole = (v: unknown): v is Role =>
  typeof v === 'string' && (ROLES as string[]).includes(v);

const isScope = (v: unknown): v is ScopeKind =>
  v === 'global' || v === 'domain' || v === 'project';

/** Every grant one person holds. */
export function grantsOf(principalId: string): RoleGrant[] {
  const rows = db.prepare(
    'SELECT role, scope_kind, scope_id FROM roles WHERE principal_id = ?'
  ).all(principalId);
  return plainAll<Record<string, unknown>>(rows)
    .filter(r => isRole(r.role) && isScope(r.scope_kind))
    .map(r => ({
      role: r.role as Role,
      scope: r.scope_kind as ScopeKind,
      ...(r.scope_id ? { scopeId: r.scope_id as string } : {})
    }));
}

export interface GrantRow extends RoleGrant { principalId: string; principalName: string }

export function listGrants(): GrantRow[] {
  const rows = db.prepare(`
    SELECT r.principal_id, r.role, r.scope_kind, r.scope_id, p.name
    FROM roles r JOIN principals p ON p.id = r.principal_id
    ORDER BY p.name COLLATE NOCASE, r.role
  `).all();
  return plainAll<Record<string, unknown>>(rows).map(r => ({
    principalId: r.principal_id as string,
    principalName: r.name as string,
    role: r.role as Role,
    scope: r.scope_kind as ScopeKind,
    ...(r.scope_id ? { scopeId: r.scope_id as string } : {})
  }));
}

export function grant(principalId: string, role: Role, scope: ScopeKind, scopeId?: string): void {
  if (!isRole(role) || !isScope(scope)) throw new Error('Unknown role or scope.');
  if (scope !== 'global' && !scopeId) throw new Error('A scoped role needs something to scope it to.');
  db.prepare(
    `INSERT OR IGNORE INTO roles (principal_id, role, scope_kind, scope_id)
     VALUES (?, ?, ?, ?)`
  ).run(principalId, role, scope, scope === 'global' ? '' : scopeId!);
}

export function revoke(principalId: string, role: Role, scope: ScopeKind, scopeId?: string): void {
  db.prepare(
    `DELETE FROM roles WHERE principal_id = ? AND role = ? AND scope_kind = ? AND scope_id = ?`
  ).run(principalId, role, scope, scope === 'global' ? '' : (scopeId ?? ''));
}

/** Whether anyone at all is an admin.
 *
 *  The property the bootstrap valve in `policy.ts` turns on. A property of the
 *  install rather than of any one account, which is what makes it visible in
 *  the People dialog and correct after the first account is deleted. */
export const anyAdmin = (): boolean =>
  db.prepare("SELECT 1 FROM roles WHERE role = 'admin' LIMIT 1").get() !== undefined;

/* --------------------------------------------------------- project domain */

export function projectDomain(projectId: string): string | null {
  const row = db.prepare('SELECT domain_id FROM project_domains WHERE project_id = ?')
    .get(projectId) as { domain_id?: string | null } | undefined;
  return row?.domain_id ?? null;
}

export function setProjectDomain(projectId: string, domainId: string | null): void {
  if (!domainId) {
    db.prepare('DELETE FROM project_domains WHERE project_id = ?').run(projectId);
    return;
  }
  db.prepare(
    `INSERT INTO project_domains (project_id, domain_id) VALUES (?, ?)
     ON CONFLICT(project_id) DO UPDATE SET domain_id = excluded.domain_id`
  ).run(projectId, domainId);
}

/** Every project's domain, in one query — for a listing that would otherwise
 *  ask once per row. */
export function projectDomains(): Map<string, string> {
  const rows = db.prepare('SELECT project_id, domain_id FROM project_domains WHERE domain_id IS NOT NULL').all();
  return new Map(plainAll<Record<string, unknown>>(rows)
    .map(r => [r.project_id as string, r.domain_id as string]));
}

/* ------------------------------------------------------------- the subject */

/** A project as `can()` needs to see it: its id and the domain that owns it. */
export const projectSubject = (projectId: string): Subject =>
  ({ kind: 'project', id: projectId, domain: projectDomain(projectId) });

/** Assemble the context. One place, so no caller can forget `anyAdmin` and
 *  quietly turn the bootstrap valve off for everyone. */
export function policyContext(principal: Principal | null, authOff: boolean): PolicyContext {
  return {
    authOff,
    principal,
    grants: principal ? grantsOf(principal.id) : [],
    anyAdmin: anyAdmin()
  };
}

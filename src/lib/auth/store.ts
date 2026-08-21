/* Every query identity makes. The same arrangement as `src/lib/store.ts`: all
 * the SQL for this concern in one file, so the day SQLite is outgrown there are
 * two files to rewrite and not twenty.
 */
import { randomBytes } from 'node:crypto';

import { db, now, plain, plainAll, uid } from '../db';
import { hashPassword, verifyPassword } from './password';
import type { Principal } from './types';

/* How long a session lives without being renewed. Long enough that a working
 * day never interrupts itself, short enough that a forgotten browser on a
 * shared machine is not indefinite. */
const SESSION_DAYS = 14;

const rowToPrincipal = (o: Record<string, unknown>): Principal => ({
  id: o.id as string,
  email: o.email as string,
  name: o.name as string
});

const stamp = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * 86_400_000)
    .toISOString().replace('T', ' ').slice(0, 19);

/* ------------------------------------------------------------- principals */

export function principalById(id: string): Principal | null {
  const row = db.prepare('SELECT id, email, name FROM principals WHERE id = ?').get(id);
  return row ? rowToPrincipal(plain(row)) : null;
}

export function principalByEmail(email: string): Principal | null {
  const row = db.prepare('SELECT id, email, name FROM principals WHERE lower(email) = lower(?)')
    .get(email.trim());
  return row ? rowToPrincipal(plain(row)) : null;
}

export function listPrincipals(): Principal[] {
  const rows = db.prepare('SELECT id, email, name FROM principals ORDER BY lower(email)').all();
  return plainAll<Record<string, unknown>>(rows).map(rowToPrincipal);
}

export const countPrincipals = (): number =>
  (plain<{ n: number }>(db.prepare('SELECT count(*) AS n FROM principals').get())).n;

export const countCredentials = (): number =>
  (plain<{ n: number }>(db.prepare('SELECT count(*) AS n FROM auth_credentials').get())).n;

/** Find this person, or create them.
 *
 *  Proxy modes need this: the proxy has already decided who someone is, and the
 *  first time they arrive there is no row yet. Refusing them would mean an
 *  administrator hand-registering every colleague before they can open the app,
 *  which is a worse system than the proxy they already trust.
 *
 *  A name that arrives later fills in a blank but never overwrites one that is
 *  already there — the display name is something a person may have set here. */
export function upsertPrincipal(email: string, name?: string): Principal {
  const clean = email.trim();
  const existing = principalByEmail(clean);
  if (existing) {
    if (name?.trim() && existing.name === existing.email) {
      db.prepare('UPDATE principals SET name = ? WHERE id = ?').run(name.trim(), existing.id);
      return { ...existing, name: name.trim() };
    }
    return existing;
  }

  const id = uid('u_');
  db.prepare('INSERT INTO principals (id, email, name) VALUES (?, ?, ?)')
    .run(id, clean, name?.trim() || clean);
  return { id, email: clean, name: name?.trim() || clean };
}

export function renamePrincipal(id: string, name: string): Principal | null {
  db.prepare('UPDATE principals SET name = ? WHERE id = ?').run(name.trim(), id);
  return principalById(id);
}

/** Remove a person. Their sessions and password go with them; what they *did*
 *  does not — `revision_authors` sets the reference to null rather than losing
 *  the row, and the audit log keeps the id it recorded at the time. */
export function deletePrincipal(id: string): void {
  db.prepare('DELETE FROM principals WHERE id = ?').run(id);
}

export function touchPrincipal(id: string): void {
  db.prepare('UPDATE principals SET last_seen_at = ? WHERE id = ?').run(now(), id);
}

/* ------------------------------------------------------------ credentials */

export function setPassword(principalId: string, password: string): void {
  db.prepare(
    `INSERT INTO auth_credentials (principal_id, hash, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(principal_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`
  ).run(principalId, hashPassword(password), now());
}

export const hasPassword = (principalId: string): boolean =>
  db.prepare('SELECT 1 FROM auth_credentials WHERE principal_id = ?').get(principalId) !== undefined;

/** The principal, or null. One answer for "no such person" and for "wrong
 *  password", because telling them apart is telling an attacker which emails
 *  are registered. */
export function authenticate(email: string, password: string): Principal | null {
  const principal = principalByEmail(email);
  if (!principal) {
    /* Still spend the time. Returning immediately makes "no such account"
     * measurably faster than "wrong password", which is the same disclosure by
     * a slower channel. */
    hashPassword(password);
    return null;
  }
  const row = db.prepare('SELECT hash FROM auth_credentials WHERE principal_id = ?')
    .get(principal.id) as { hash?: string } | undefined;
  if (!row?.hash) return null;
  return verifyPassword(password, row.hash) ? principal : null;
}

/* --------------------------------------------------------------- sessions */

/** 256 bits from the CSPRNG, base64url. The session id *is* the credential
 *  once it is issued, so it has to be unguessable — `uid()` is fine for a row
 *  in a table nobody can reach and is not fine here. */
const newToken = () => randomBytes(32).toString('base64url');

export function createSession(principalId: string): string {
  const id = newToken();
  db.prepare('INSERT INTO sessions (id, principal_id, expires_at) VALUES (?, ?, ?)')
    .run(id, principalId, stamp(SESSION_DAYS));
  return id;
}

/** Whose session this is, or null when it is unknown or expired.
 *
 *  Expiry is compared in SQL against the same `datetime('now')` the rows were
 *  written with, so nothing depends on the two clocks agreeing about format. */
export function sessionPrincipal(token: string): Principal | null {
  if (!token) return null;
  const row = db.prepare(
    `SELECT p.id, p.email, p.name FROM sessions s
     JOIN principals p ON p.id = s.principal_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).get(token);
  if (!row) return null;
  const principal = rowToPrincipal(plain(row));
  touchPrincipal(principal.id);
  return principal;
}

export function destroySession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
}

/** Every session this person has, everywhere. What "remove their access" means. */
export function destroySessionsOf(principalId: string): void {
  db.prepare('DELETE FROM sessions WHERE principal_id = ?').run(principalId);
}

/** Expired rows. Called on sign-in rather than on a timer: it is the moment a
 *  session is already being written, and a table nobody is cleaning is a table
 *  that grows without limit. */
export function pruneSessions(): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

/* ------------------------------------------------------------------ audit */

export type AuditAction =
  | 'sign-in' | 'sign-out' | 'sign-in-failed'
  | 'account-created' | 'account-deleted' | 'password-changed'
  | 'auth-mode-changed';

export function audit(action: AuditAction, principalId: string | null, subject?: string): void {
  db.prepare('INSERT INTO audit_log (principal_id, action, subject) VALUES (?, ?, ?)')
    .run(principalId, action, subject ?? null);
}

export interface AuditEntry {
  at: string;
  action: string;
  subject: string | null;
  principalId: string | null;
  /** The name at read time, or null when the person is gone. */
  who: string | null;
}

export function recentAudit(limit = 50): AuditEntry[] {
  const rows = db.prepare(
    `SELECT a.at, a.action, a.subject, a.principal_id, p.name AS who
     FROM audit_log a LEFT JOIN principals p ON p.id = a.principal_id
     ORDER BY a.id DESC LIMIT ?`
  ).all(limit);
  return plainAll<Record<string, unknown>>(rows).map(o => ({
    at: o.at as string,
    action: o.action as string,
    subject: (o.subject ?? null) as string | null,
    principalId: (o.principal_id ?? null) as string | null,
    who: (o.who ?? null) as string | null
  }));
}

/* ------------------------------------------------------- revision authors */

export function setRevisionAuthor(revisionId: string, principalId: string | null): void {
  if (!principalId) return;
  db.prepare(
    `INSERT INTO revision_authors (revision_id, principal_id) VALUES (?, ?)
     ON CONFLICT(revision_id) DO UPDATE SET principal_id = excluded.principal_id`
  ).run(revisionId, principalId);
}

/** Revision id → author's display name, for one project. One query for the
 *  whole panel rather than one per row. */
export function revisionAuthors(projectId: string): Map<string, string> {
  const rows = db.prepare(
    `SELECT ra.revision_id, p.name FROM revision_authors ra
     JOIN revisions r ON r.id = ra.revision_id
     LEFT JOIN principals p ON p.id = ra.principal_id
     WHERE r.project_id = ?`
  ).all(projectId);
  const out = new Map<string, string>();
  plainAll<Record<string, unknown>>(rows).forEach(o => {
    if (o.name) out.set(o.revision_id as string, o.name as string);
  });
  return out;
}

/* The one place a request is turned into a person, and the two ways of refusing
 * one that is not.
 *
 * There is no `src/middleware.ts`, and the omission is deliberate rather than
 * unfinished. Next's middleware runs on the edge runtime in this version, and
 * this application's session store is `node:sqlite` — a middleware could not
 * read it. It could only check that *some* cookie is present, which is not a
 * check, and it could not see the configured mode at all, so an install running
 * with `off` would be redirected to a login page it does not have. The README
 * says "one middleware and a session check in the API routes"; the middleware
 * half of that sentence is not available, so the check is the whole story and it
 * is an explicit call at the top of each handler.
 *
 * Explicit has a second virtue: `grep requireApi src/app` lists every guarded
 * entry point, which is the question an audit actually asks.
 */
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

import { authConfig } from './config';
import { SESSION_COOKIE } from './session';
import { countPrincipals, sessionPrincipal, upsertPrincipal } from './store';
import { policyContext, projectSubject } from './roles';
import { allowedActions, can, effectiveRole, type Action, type Subject } from './policy';
import type { Principal, PublicAuth } from './types';

/** Who is asking, or null.
 *
 *  Null is not the same as "refused": with `mode: 'off'` every request is
 *  allowed and nobody is anybody. `requireApi` is what turns null into a 401,
 *  and only when the mode says it should. */
export async function currentPrincipal(): Promise<Principal | null> {
  const config = authConfig();
  if (config.mode === 'off') return null;

  if (config.mode === 'header') {
    /* The proxy has already decided. Trusting a header is only sound because
     * the deployment guarantees nothing reaches this process without passing
     * through the proxy — which is stated in the README next to the mode, since
     * a header is trivially forged by anything that can reach the port. */
    const h = await headers();
    const email = h.get(config.emailHeader)?.trim();
    if (!email) return null;
    return upsertPrincipal(email, h.get(config.nameHeader)?.trim() || undefined);
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sessionPrincipal(token) : null;
}

/** Null when the request may proceed, a 401 when it may not.
 *
 *      const denied = await requireApi();
 *      if (denied) return denied;
 */
export async function requireApi(): Promise<NextResponse | null> {
  if (authConfig().mode === 'off') return null;
  if (await currentPrincipal()) return null;
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

/** Null when this person may take this action on this subject, a 403 when they
 *  may not — and a 401 first when they are not signed in at all.
 *
 *      const denied = await authorize('write', projectSubject(id));
 *      if (denied) return denied;
 *
 *  Every decision goes through `can()`, which is pure and tested exhaustively.
 *  `grep -rn authorize src/app` lists every guarded entry point, which is the
 *  question an audit actually asks. */
export async function authorize(action: Action, subject: Subject): Promise<NextResponse | null> {
  const config = authConfig();
  if (config.mode === 'off') return null;

  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  if (can(policyContext(principal, false), action, subject)) return null;
  /* The message names the action rather than saying "forbidden". Someone who
   * cannot approve a proposal should learn that from the answer, not from a
   * support ticket. */
  return NextResponse.json(
    { error: `You do not have permission to ${action.replace('-', ' ')} this.` },
    { status: 403 }
  );
}

/** The same decision, as a boolean, for a route that has to branch rather than
 *  refuse — the autosave that becomes a proposal, for instance. */
export async function allowed(action: Action, subject: Subject): Promise<boolean> {
  const config = authConfig();
  if (config.mode === 'off') return true;
  const principal = await currentPrincipal();
  return can(policyContext(principal, false), action, subject);
}

/** What this person may do with a project. Sent to the browser so a button is
 *  absent rather than present-and-refused. */
export async function projectPermissions(projectId: string): Promise<Action[]> {
  const config = authConfig();
  const principal = config.mode === 'off' ? null : await currentPrincipal();
  return allowedActions(
    policyContext(principal, config.mode === 'off'),
    projectSubject(projectId)
  );
}

/** For server components: returns, or redirects to the login page and never
 *  returns. */
export async function requirePage(): Promise<Principal | null> {
  const config = authConfig();
  if (config.mode === 'off') return null;
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  return principal;
}

/** What the browser may know about the current state. */
export async function publicAuth(): Promise<PublicAuth> {
  const config = authConfig();
  const principal = config.mode === 'off' ? null : await currentPrincipal();
  const ctx = policyContext(principal, config.mode === 'off');
  return {
    mode: config.mode,
    signedIn: principal !== null,
    principal,
    emailHeader: config.emailHeader,
    nameHeader: config.nameHeader,
    hasAccounts: countPrincipals() > 0,
    /* What this person may do at workspace level, and the role it comes from.
     * The dialog uses it to explain itself rather than to decide anything —
     * every decision is taken on the server. */
    role: effectiveRole(ctx, { kind: 'workspace' }),
    can: allowedActions(ctx, { kind: 'workspace' }),
    anyAdmin: ctx.anyAdmin
  };
}

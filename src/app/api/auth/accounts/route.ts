import { NextResponse } from 'next/server';

import { authConfig, saveAuthConfig, switchProblem, authModeIsForced } from '@/lib/auth/config';
import { authorize, publicAuth, requireApi } from '@/lib/auth/guard';
import {
  audit, deletePrincipal, destroySessionsOf, hasPassword, listPrincipals,
  principalById, setPassword, upsertPrincipal
} from '@/lib/auth/store';
import { passwordProblem, type AuthMode } from '@/lib/auth/types';
import { grant, listGrants, revoke } from '@/lib/auth/roles';
import { ROLE_BLURBS, ROLE_LABELS, ROLES, type Role, type ScopeKind } from '@/lib/auth/policy';
import { listEntities } from '@/lib/ea/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Accounts and the mode.
 *
 * Guarded like everything else, with one consequence worth naming: on an install
 * running with `off`, `requireApi()` allows the request. That is correct — the
 * operator is alone behind their VPN and has to be able to create the first
 * account before there is anything to sign in to. Once a mode is on, only
 * someone signed in can reach this.
 *
 * There are no roles yet, so anyone signed in can add or remove anyone. That is
 * the phase's stated limit, not an oversight; scoped roles arrive with the
 * referential. It is why the audit log exists in the meantime.
 */

export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return NextResponse.json({
    auth: await publicAuth(),
    forced: authModeIsForced(),
    accounts: listPrincipals().map(p => ({ ...p, hasPassword: hasPassword(p.id) })),
    grants: listGrants(),
    roles: ROLES.map(r => ({ role: r, label: ROLE_LABELS[r], blurb: ROLE_BLURBS[r] })),
    /* Domains are the scope worth offering: a role scoped to one project is
     * usually a sign the domain is missing rather than a real intent. */
    domains: listEntities('domain').map(d => ({ id: d.id, name: d.name }))
  });
}

export async function POST(req: Request) {
  const denied = await authorize('manage-people', { kind: 'people' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  if (!email) return NextResponse.json({ error: 'An email is required.' }, { status: 400 });

  /* A password is optional: in `header` mode a person never types one, and a
   * row that exists only so the app knows their name is a legitimate account. */
  if (password) {
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const principal = upsertPrincipal(email, String(body.name ?? '').trim() || undefined);
  if (password) {
    setPassword(principal.id, password);
    audit('password-changed', principal.id, principal.email);
  }
  audit('account-created', principal.id, principal.email);

  return NextResponse.json({ ...principal, hasPassword: hasPassword(principal.id) });
}

export async function PATCH(req: Request) {
  const denied = await authorize('manage-people', { kind: 'people' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const mode = body.mode as AuthMode | undefined;

  if (mode) {
    const problem = switchProblem(mode);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  const next = saveAuthConfig({
    mode,
    emailHeader: typeof body.emailHeader === 'string' ? body.emailHeader : undefined,
    nameHeader: typeof body.nameHeader === 'string' ? body.nameHeader : undefined
  });
  if (mode) {
    const { principal } = await publicAuth();
    audit('auth-mode-changed', principal?.id ?? null, mode);
  }

  return NextResponse.json({ auth: await publicAuth(), config: next });
}

/** Grant or revoke a role. `PUT` rather than another verb on PATCH: changing
 *  who may do what is a different operation from changing how people sign in,
 *  and conflating them would make the audit log ambiguous. */
export async function PUT(req: Request) {
  const denied = await authorize('manage-people', { kind: 'people' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const principalId = String(body.principalId ?? '');
  const role = body.role as Role;
  const scope = (body.scope ?? 'global') as ScopeKind;
  const scopeId = body.scopeId ? String(body.scopeId) : undefined;

  if (!principalById(principalId)) {
    return NextResponse.json({ error: 'No such account.' }, { status: 404 });
  }

  try {
    if (body.revoke) revoke(principalId, role, scope, scopeId);
    else grant(principalId, role, scope, scopeId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const who = await publicAuth();
  audit('auth-mode-changed', who.principal?.id ?? null,
    `${body.revoke ? 'revoked' : 'granted'} ${role} to ${principalId}`);

  return NextResponse.json({ grants: listGrants() });
}

export async function DELETE(req: Request) {
  const denied = await authorize('manage-people', { kind: 'people' });
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get('id') ?? '';
  const target = principalById(id);
  if (!target) return NextResponse.json({ error: 'No such account.' }, { status: 404 });

  /* Removing the last person who can sign in, while local accounts are the way
   * in, locks everyone out of their own data. */
  if (authConfig().mode === 'local') {
    const others = listPrincipals().filter(p => p.id !== id && hasPassword(p.id));
    if (!others.length) {
      return NextResponse.json(
        { error: 'This is the only account that can sign in. Add another one first.' },
        { status: 400 }
      );
    }
  }

  /* Sessions go first: the row is about to vanish and a live session pointing
   * at it should not outlive the decision by even one request. */
  destroySessionsOf(id);
  deletePrincipal(id);
  audit('account-deleted', null, target.email);

  return NextResponse.json({ ok: true });
}

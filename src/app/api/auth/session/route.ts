import { NextResponse } from 'next/server';

import { authConfig } from '@/lib/auth/config';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from '@/lib/auth/session';
import {
  audit, authenticate, countCredentials, createSession, destroySession,
  pruneSessions, setPassword, upsertPrincipal
} from '@/lib/auth/store';
import { passwordProblem } from '@/lib/auth/types';
import { publicAuth, requireApi } from '@/lib/auth/guard';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Sign in, sign out, and — once, on a fresh install — create the first account.
 *
 * Deliberately not guarded: this is the door. Everything else in `src/app/api`
 * calls `requireApi()` first.
 */

/** A failure that says as little as possible. "No such account" and "wrong
 *  password" are the same sentence, because telling them apart tells an
 *  attacker which addresses are registered. */
const REFUSED = 'Email or password is wrong.';

export async function POST(req: Request) {
  const config = authConfig();
  if (config.mode !== 'local') {
    return NextResponse.json(
      { error: `This install signs people in with "${config.mode}". There is nothing to post here.` },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are both required.' }, { status: 400 });
  }

  /* The bootstrap. A fresh install has nobody, so the first credentials posted
   * create the account that owns it — there is no other way in, and an
   * out-of-band CLI step would be a worse one. The window closes the moment it
   * is used: `countCredentials()` is non-zero from then on, for everyone. */
  const bootstrapping = countCredentials() === 0;
  if (bootstrapping) {
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const principal = upsertPrincipal(email, String(body.name ?? '').trim() || undefined);
    setPassword(principal.id, password);
    audit('account-created', principal.id, principal.email);
    return sign(principal.id);
  }

  const principal = authenticate(email, password);
  if (!principal) {
    audit('sign-in-failed', null, email);
    return NextResponse.json({ error: REFUSED }, { status: 401 });
  }
  return sign(principal.id);
}

async function sign(principalId: string) {
  /* The one moment a session row is already being written, so it is also the
   * moment to drop the expired ones. A table nobody cleans grows forever. */
  pruneSessions();
  const token = createSession(principalId);
  audit('sign-in', principalId);
  return setSessionCookie(NextResponse.json(await publicAuth()), token);
}

export async function DELETE() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const { principal } = await publicAuth();
    destroySession(token);
    audit('sign-out', principal?.id ?? null);
  }
  /* The cookie is cleared whether or not the row was there: a stale cookie that
   * survives signing out is the bug people actually report. */
  return clearSessionCookie(NextResponse.json({ ok: true }));
}

/** What the browser needs to render the right thing: the mode, and whoever is
 *  signed in. Safe to call unauthenticated — that is the point of it. */
export async function GET() {
  return NextResponse.json(await publicAuth());
}

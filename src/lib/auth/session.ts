/* The session cookie.
 *
 * Its own file because both the route that sets it and the guard that reads it
 * need the name and the flags, and a cookie whose attributes differ between the
 * two ends is a bug that only shows up in production.
 */
import type { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'studio_session';

const MAX_AGE = 14 * 24 * 60 * 60;

/* `secure` is conditional, and this is the one place a deployment detail leaks
 * into the code. A self-hosted install is very often reached over plain HTTP on
 * an internal network — that is what "put it behind your VPN" means — and a
 * cookie marked `secure` is silently dropped there, which presents as "signing
 * in does nothing". So it is on when the operator says the site is served over
 * HTTPS, and stated in the README rather than guessed from a request header a
 * proxy may or may not set. */
const secure = () =>
  process.env.SECURE_COOKIES === '1' ||
  (process.env.PUBLIC_ORIGIN ?? '').startsWith('https://');

export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    path: '/',
    maxAge: MAX_AGE
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    path: '/',
    maxAge: 0
  });
  return res;
}

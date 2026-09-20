/* One account handed to the process instead of stored in the database.
 *
 * The reason is the one already given in `config.ts`: a deployment should
 * reproduce itself. `docker compose up` on a fresh volume has nobody in
 * `auth_credentials`, and the way in is the bootstrap window on the login page
 * — which is fine for a laptop and wrong for anything reachable, because the
 * first person to find the URL becomes the owner. Credentials in the
 * environment close that window and make the install come up already knowing
 * who its operator is.
 *
 * Nothing here is written to the database. The password is compared against
 * the environment on every sign-in, so rotating it is editing `.env` and
 * restarting — there is no stored hash to go stale, and no way for the value
 * in the file to disagree with the value that works. What *is* written, on
 * first successful sign-in, is an ordinary `principals` row: sessions point at
 * a principal, and history has to be able to name an author.
 *
 * This module deliberately touches no database. `config.ts` is read on every
 * request and importing the store from here would make the cycle
 * config → store → db for a question that is answered by two strings.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { MIN_PASSWORD } from './types';

export interface EnvAccount {
  /** What is typed into the first field. An email or a bare name — the column
   *  it lands in is called `email`, but nothing in this application parses it,
   *  so `admin` is as valid as `admin@example.com`. */
  username: string;
  password: string;
  /** How they appear in history. Falls back to the username. */
  name: string;
}

/* The username is trimmed — a stray space around it is always a typo. The
 * password is not: trimming a secret silently changes it, and an operator who
 * chose a trailing space gets the password they chose rather than a login that
 * refuses them for a reason nothing on screen can explain. */
export function envAccount(): EnvAccount | null {
  const username = process.env.AUTH_USERNAME?.trim() ?? '';
  const password = process.env.AUTH_PASSWORD ?? '';
  if (!username || !password) return null;
  return { username, password, name: process.env.AUTH_NAME?.trim() || username };
}

export const envAccountConfigured = (): boolean => envAccount() !== null;

/** Constant-time, and length-blind: hashing both sides first means the
 *  comparison takes the same time whatever was typed, including when it is a
 *  different length from the real value. `timingSafeEqual` throws on a length
 *  mismatch, so it could not be handed the raw strings anyway. */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** The environment account when both halves match, null otherwise.
 *
 *  The username is matched case-insensitively, because `principalByEmail`
 *  looks up with `lower(email)` and a sign-in that succeeds but resolves to a
 *  second principal row would split one person's history in two.
 *
 *  Both comparisons are evaluated before they are combined. `&&` would skip
 *  the password check whenever the username was wrong, which is the same
 *  disclosure this function exists to avoid, delivered by a stopwatch. */
export function matchesEnvAccount(username: string, password: string): EnvAccount | null {
  const account = envAccount();
  if (!account) return null;

  const userOk = sameSecret(username.trim().toLowerCase(), account.username.toLowerCase());
  /* NFKC on both sides, the same normalisation `password.ts` applies before
   * hashing, so a password typed on one keyboard verifies on another. */
  const passOk = sameSecret(password.normalize('NFKC'), account.password.normalize('NFKC'));

  return userOk && passOk ? account : null;
}

/** What is wrong with the configured account, in words, or null.
 *
 *  Advisory only — a short password still works. Refusing to start on it would
 *  turn a weak password into an outage, and refusing to *authenticate* on it
 *  would be an install that shows a login page no credentials can open. It is
 *  surfaced to the operator (server log, and the People panel) and never to the
 *  login page, where it would tell an anonymous visitor how short to guess. */
export function envAccountProblem(): string | null {
  const account = envAccount();
  if (!account) return null;
  if (account.password.length < MIN_PASSWORD) {
    return `AUTH_PASSWORD is shorter than ${MIN_PASSWORD} characters. It still works, but it is the only thing between the internet and this install.`;
  }
  if (account.password !== account.password.trim()) {
    return 'AUTH_PASSWORD starts or ends with a space. That space is part of the password — quote the value in .env if it was meant.';
  }
  return null;
}

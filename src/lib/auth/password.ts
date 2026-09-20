/* Password hashing, for the `local` mode.
 *
 * `scrypt` from node:crypto rather than bcrypt or argon2: both of those are
 * native modules, and this project's whole deployment story is that `npm
 * install` needs no compiler. scrypt is memory-hard, it is in the standard
 * library, and it is what the platform gives you when you refuse a dependency.
 *
 * The parameters below are the Node defaults except for `N`, raised to 2^15 —
 * around 100 ms per verification on a laptop, which is the right order for a
 * login form and nowhere near enough to matter for anything else. `maxmem` has
 * to be raised alongside it or scrypt refuses to run.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 32768;
const r = 8;
const p = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
/* scrypt needs roughly 128 · N · r bytes; the default cap of 32 MB is under
 * what N = 2^15 asks for, so it is stated rather than left to fail at runtime. */
const MAX_MEM = 64 * 1024 * 1024;

/** `scrypt$N$r$p$salt$hash`, everything after the scheme in hex. Self-describing
 *  so a future change of parameters can still verify what is already stored. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(password.normalize('NFKC'), salt, KEY_LEN, { N, r, p, maxmem: MAX_MEM });
  return ['scrypt', N, r, p, salt.toString('hex'), hash.toString('hex')].join('$');
}

/** Constant-time, and false rather than throwing for anything malformed — a
 *  corrupt row must read as "wrong password", not as a crash that tells the
 *  caller something about the stored value. */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, rr, pp, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    if (!salt.length || !expected.length) return false;

    const actual = scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n), r: Number(rr), p: Number(pp), maxmem: MAX_MEM
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

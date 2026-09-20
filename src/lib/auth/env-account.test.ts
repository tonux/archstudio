/* The environment account.
 *
 * `env-account.ts` touches no database, so most of this is a pure unit test.
 * The mode it implies is not: `config.ts` reads the `settings` table, so that
 * half needs a real file and the same dynamic-import arrangement as
 * auth.test.ts — `DATABASE_PATH` is read when db.ts is first imported.
 */

import { strict as assert } from 'node:assert';
import { afterEach, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-envacct-'));
process.env.DATABASE_PATH = path.join(DIR, 'test.db');
delete process.env.AUTH_MODE;
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;
delete process.env.AUTH_NAME;

let env: typeof import('./env-account');
let config: typeof import('./config');

before(async () => {
  env = await import('./env-account');
  config = await import('./config');
});

/* Every test sets what it needs and nothing leaks into the next: these are
 * read from `process.env` on each call, by design, so a stale value here would
 * silently change what a later test is asserting about. */
const set = (v: Partial<Record<'AUTH_USERNAME' | 'AUTH_PASSWORD' | 'AUTH_NAME' | 'AUTH_MODE', string>>) => {
  for (const [k, val] of Object.entries(v)) process.env[k] = val;
};
afterEach(() => {
  delete process.env.AUTH_USERNAME;
  delete process.env.AUTH_PASSWORD;
  delete process.env.AUTH_NAME;
  delete process.env.AUTH_MODE;
});

describe('reading the account', () => {
  test('absent when neither half is set', () => {
    assert.equal(env.envAccount(), null);
    assert.equal(env.envAccountConfigured(), false);
  });

  test('absent when only one half is set — half a credential is not one', () => {
    set({ AUTH_USERNAME: 'admin' });
    assert.equal(env.envAccount(), null);

    delete process.env.AUTH_USERNAME;
    set({ AUTH_PASSWORD: 'correct-horse-battery' });
    assert.equal(env.envAccount(), null);
  });

  test('an empty or whitespace-only value does not count as set', () => {
    set({ AUTH_USERNAME: '   ', AUTH_PASSWORD: 'correct-horse-battery' });
    assert.equal(env.envAccount(), null);

    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: '' });
    assert.equal(env.envAccount(), null);
  });

  test('the display name falls back to the username', () => {
    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct-horse-battery' });
    assert.equal(env.envAccount()?.name, 'admin');

    set({ AUTH_NAME: 'Ops' });
    assert.equal(env.envAccount()?.name, 'Ops');
  });
});

describe('matching', () => {
  const ok = { AUTH_USERNAME: 'admin@example.com', AUTH_PASSWORD: 'correct-horse-battery' };

  test('both halves right', () => {
    set(ok);
    assert.equal(env.matchesEnvAccount('admin@example.com', 'correct-horse-battery')?.username,
      'admin@example.com');
  });

  test('wrong password, wrong user, and neither', () => {
    set(ok);
    assert.equal(env.matchesEnvAccount('admin@example.com', 'nope'), null);
    assert.equal(env.matchesEnvAccount('someone@example.com', 'correct-horse-battery'), null);
    assert.equal(env.matchesEnvAccount('someone@example.com', 'nope'), null);
  });

  test('nothing matches when no account is configured — not even empty strings', () => {
    assert.equal(env.matchesEnvAccount('', ''), null);
  });

  /* The username is folded to lower case because `principalByEmail` looks up
   * with `lower(email)`. If matching were case-sensitive here, signing in as
   * `Admin` would succeed and then resolve to a second principals row. */
  test('the username is case-insensitive and tolerates surrounding space', () => {
    set(ok);
    assert.ok(env.matchesEnvAccount('ADMIN@example.com', 'correct-horse-battery'));
    assert.ok(env.matchesEnvAccount('  admin@example.com  ', 'correct-horse-battery'));
  });

  test('the password is case-sensitive and space-significant', () => {
    set(ok);
    assert.equal(env.matchesEnvAccount('admin@example.com', 'Correct-Horse-Battery'), null);
    assert.equal(env.matchesEnvAccount('admin@example.com', ' correct-horse-battery'), null);
  });

  test('a password differing only in Unicode form still verifies', () => {
    /* "é" composed, against the same character decomposed. `password.ts`
     * normalises NFKC before hashing; this has to agree or an operator whose
     * keyboard emits the other form is locked out by something invisible. */
    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'café-au-lait-please' });
    assert.ok(env.matchesEnvAccount('admin', 'café-au-lait-please'));
  });
});

describe('the problem report', () => {
  test('silent when there is no account, and when the password is sound', () => {
    assert.equal(env.envAccountProblem(), null);
    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct-horse-battery' });
    assert.equal(env.envAccountProblem(), null);
  });

  test('names a short password, but the password still works', () => {
    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'short' });
    assert.match(env.envAccountProblem() ?? '', /shorter than/);
    assert.ok(env.matchesEnvAccount('admin', 'short'),
      'an advisory warning must not turn into a refusal');
  });

  test('names a stray space, which is the typo that has no visible symptom', () => {
    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct-horse-battery ' });
    assert.match(env.envAccountProblem() ?? '', /space/);
  });
});

describe('the mode it implies', () => {
  test('still off when nothing is set', () => {
    assert.equal(config.authConfig().mode, 'off');
    assert.equal(config.authModeIsForced(), false);
  });

  /* The point of the feature: credentials in the environment mean the install
   * comes up asking for them, with nobody having clicked anything. */
  test('credentials turn local accounts on by themselves', () => {
    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct-horse-battery' });
    assert.equal(config.authConfig().mode, 'local');
  });

  test('and pin the mode, so a browser cannot switch authentication off', () => {
    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct-horse-battery' });
    assert.equal(config.authModeIsForced(), true);
    assert.match(config.switchProblem('off') ?? '', /AUTH_USERNAME/);

    config.saveAuthConfig({ mode: 'off' });
    assert.equal(config.authConfig().mode, 'local', 'the stored row must not win');
  });

  test('an explicit AUTH_MODE still wins — the proxy was meant', () => {
    set({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct-horse-battery', AUTH_MODE: 'header' });
    assert.equal(config.authConfig().mode, 'header');
  });
});

/* Identity, against a real database file.
 *
 * `DATABASE_PATH` is read at import time in db.ts, so the environment has to be
 * set before the module graph is pulled in — hence the dynamic imports below,
 * the same arrangement as store.test.ts.
 *
 * The guard itself is not tested here: it reaches for `next/headers`, which only
 * resolves inside a request. What *is* tested is everything the guard decides
 * with — the mode, the session, the credentials — so the untested part is one
 * `if` over values this file covers.
 */

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'archstudio-auth-'));
process.env.DATABASE_PATH = path.join(DIR, 'test.db');
delete process.env.AUTH_MODE;

type AuthStore = typeof import('./store');
type AuthConfigMod = typeof import('./config');
type Store = typeof import('../store');

let auth: AuthStore;
let config: AuthConfigMod;
let store: Store;
let db: typeof import('../db').db;
let plain: typeof import('../db').plain;

before(async () => {
  auth = await import('./store');
  config = await import('./config');
  store = await import('../store');
  ({ db, plain } = await import('../db'));
});
after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

beforeEach(() => {
  /* Order matters: sessions and credentials reference principals. */
  db.exec(`DELETE FROM sessions; DELETE FROM auth_credentials; DELETE FROM audit_log;
           DELETE FROM revision_authors; DELETE FROM principals;
           DELETE FROM revisions; DELETE FROM projects; DELETE FROM settings;`);
});

/* ------------------------------------------------------------- passwords */

describe('passwords', () => {
  test('a hash verifies against its own password and nothing else', async () => {
    const { hashPassword, verifyPassword } = await import('./password');
    const hash = hashPassword('correct horse battery');

    assert.equal(verifyPassword('correct horse battery', hash), true);
    assert.equal(verifyPassword('correct horse batteru', hash), false);
    assert.equal(verifyPassword('', hash), false);
  });

  test('two hashes of the same password differ', async () => {
    const { hashPassword } = await import('./password');
    assert.notEqual(hashPassword('same password here'), hashPassword('same password here'));
  });

  test('a malformed stored value reads as a wrong password, not a crash', async () => {
    const { verifyPassword } = await import('./password');
    for (const junk of ['', 'nonsense', 'scrypt$', 'bcrypt$1$2$3$4$5', 'scrypt$a$b$c$d$e']) {
      assert.equal(verifyPassword('anything', junk), false, `on ${JSON.stringify(junk)}`);
    }
  });

  test('the length rule is the only rule', async () => {
    const { passwordProblem, MIN_PASSWORD } = await import('./types');
    assert.equal(passwordProblem('x'.repeat(MIN_PASSWORD)), null);
    assert.match(passwordProblem('x'.repeat(MIN_PASSWORD - 1))!, /at least/);
    /* No complexity requirement: a long passphrase of one character class is
     * fine, which is the point. */
    assert.equal(passwordProblem('aaaaaaaaaaaaaaaaaaaa'), null);
  });
});

/* ------------------------------------------------------------ principals */

describe('principals', () => {
  test('email is one identity whatever its case', () => {
    const a = auth.upsertPrincipal('Ada@Example.com');
    const b = auth.upsertPrincipal('ada@example.com');
    assert.equal(a.id, b.id);
    assert.equal(auth.countPrincipals(), 1);
    assert.equal(auth.principalByEmail('ADA@EXAMPLE.COM')?.id, a.id);
  });

  test('a name arriving later fills a blank but never overwrites one', () => {
    const bare = auth.upsertPrincipal('ada@example.com');
    assert.equal(bare.name, 'ada@example.com', 'the email stands in until a name is known');

    assert.equal(auth.upsertPrincipal('ada@example.com', 'Ada Lovelace').name, 'Ada Lovelace');
    assert.equal(auth.upsertPrincipal('ada@example.com', 'A. L.').name, 'Ada Lovelace',
      'a display name someone set here is not overwritten by the proxy');
  });
});

/* --------------------------------------------------------------- signing */

describe('authenticate', () => {
  test('the right password, and only the right password', () => {
    const p = auth.upsertPrincipal('ada@example.com', 'Ada');
    auth.setPassword(p.id, 'a good long password');

    assert.equal(auth.authenticate('ada@example.com', 'a good long password')?.id, p.id);
    assert.equal(auth.authenticate('ada@example.com', 'wrong'), null);
    assert.equal(auth.authenticate('ADA@EXAMPLE.COM', 'a good long password')?.id, p.id);
  });

  test('an account with no password cannot sign in', () => {
    auth.upsertPrincipal('proxy-only@example.com');
    assert.equal(auth.authenticate('proxy-only@example.com', 'anything at all'), null);
  });

  test('an unknown address is refused the same way a wrong password is', () => {
    assert.equal(auth.authenticate('nobody@example.com', 'whatever goes here'), null);
  });
});

/* -------------------------------------------------------------- sessions */

describe('sessions', () => {
  test('a token resolves to its person and is unguessable', () => {
    const p = auth.upsertPrincipal('ada@example.com', 'Ada');
    const token = auth.createSession(p.id);

    assert.ok(token.length >= 40, 'a session id is a credential, not a row key');
    assert.equal(auth.sessionPrincipal(token)?.id, p.id);
    assert.equal(auth.sessionPrincipal('not-a-token'), null);
    assert.equal(auth.sessionPrincipal(''), null);
  });

  test('signing out ends that session only', () => {
    const p = auth.upsertPrincipal('ada@example.com');
    const laptop = auth.createSession(p.id);
    const phone = auth.createSession(p.id);

    auth.destroySession(laptop);
    assert.equal(auth.sessionPrincipal(laptop), null);
    assert.equal(auth.sessionPrincipal(phone)?.id, p.id);
  });

  test('revoking a person ends every session they have', () => {
    const p = auth.upsertPrincipal('ada@example.com');
    const one = auth.createSession(p.id);
    const two = auth.createSession(p.id);

    auth.destroySessionsOf(p.id);
    assert.equal(auth.sessionPrincipal(one), null);
    assert.equal(auth.sessionPrincipal(two), null);
  });

  test('an expired session is refused, and pruned', () => {
    const p = auth.upsertPrincipal('ada@example.com');
    const token = auth.createSession(p.id);
    db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(token);

    assert.equal(auth.sessionPrincipal(token), null, 'expiry is enforced on read');
    auth.pruneSessions();
    assert.equal(plain<{ n: number }>(db.prepare('SELECT count(*) AS n FROM sessions').get()).n, 0);
  });

  test('deleting a person takes their sessions with them', () => {
    const p = auth.upsertPrincipal('ada@example.com');
    const token = auth.createSession(p.id);
    auth.deletePrincipal(p.id);
    assert.equal(auth.sessionPrincipal(token), null);
  });
});

/* ----------------------------------------------------------------- modes */

describe('configuration', () => {
  test('the default is off — an upgrade cannot lock anyone out', () => {
    assert.equal(config.authConfig().mode, 'off');
  });

  test('a mode survives a round trip', () => {
    config.saveAuthConfig({ mode: 'header', emailHeader: 'X-Auth-Email' });
    const c = config.authConfig();
    assert.equal(c.mode, 'header');
    assert.equal(c.emailHeader, 'x-auth-email', 'headers are matched case-insensitively');
  });

  test('a corrupt row reads as the default rather than throwing', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('auth', 'not json')").run();
    assert.equal(config.authConfig().mode, 'off');
  });

  test('local accounts cannot be switched on with nobody able to sign in', () => {
    assert.match(config.switchProblem('local')!, /Create an account/);

    const p = auth.upsertPrincipal('ada@example.com');
    auth.setPassword(p.id, 'a good long password');
    assert.equal(config.switchProblem('local'), null);
  });

  test('AUTH_MODE in the environment wins and pins the choice', () => {
    config.saveAuthConfig({ mode: 'off' });
    process.env.AUTH_MODE = 'header';
    try {
      assert.equal(config.authConfig().mode, 'header');
      assert.equal(config.authModeIsForced(), true);
      assert.match(config.switchProblem('off')!, /pinned/);
    } finally {
      delete process.env.AUTH_MODE;
    }
    assert.equal(config.authConfig().mode, 'off');
  });
});

/* ------------------------------------------------------- revision authors */

describe('who did it', () => {
  const projectOf = async () => {
    const { blankArchitecture } = await import('../defaults');
    return store.createProject({ name: 'P', data: blankArchitecture('P') });
  };

  test('a frozen version carries its author into the panel', async () => {
    const p = await projectOf();
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada Lovelace');

    store.freezeVersion(p.id, 'v1.2', 'Sent to the board', ada.id);

    const row = store.listRevisions(p.id).find(r => r.label === 'Sent to the board');
    assert.ok(row, 'the version is there');
    assert.equal(row!.author, 'Ada Lovelace');
  });

  test('a snapshot nobody signed reports no author rather than a guess', async () => {
    const p = await projectOf();
    store.createRevision(p.id, 'Unsigned');

    const row = store.listRevisions(p.id).find(r => r.label === 'Unsigned');
    assert.equal(row!.author ?? null, null);
  });

  test('removing a person keeps what they did', async () => {
    const p = await projectOf();
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada Lovelace');
    store.freezeVersion(p.id, 'v1.0', 'Frozen', ada.id);

    auth.deletePrincipal(ada.id);

    const row = store.listRevisions(p.id).find(r => r.label === 'Frozen');
    assert.ok(row, 'the revision outlives the account');
    assert.equal(row!.author ?? null, null, 'and honestly reports that the name is gone');
  });

  test('versions still sort newest-first once the join is in the query', async () => {
    const p = await projectOf();
    store.createRevision(p.id, 'first');
    store.createRevision(p.id, 'second');
    store.createRevision(p.id, 'third');

    assert.deepEqual(
      store.listRevisions(p.id).map(r => r.label).slice(0, 3),
      ['third', 'second', 'first']
    );
  });
});

/* ----------------------------------------------------------------- audit */

describe('audit log', () => {
  test('entries come back newest first, with the name resolved at read time', () => {
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    auth.audit('sign-in', ada.id);
    auth.audit('sign-in-failed', null, 'someone@example.com');

    const entries = auth.recentAudit();
    assert.equal(entries[0].action, 'sign-in-failed');
    assert.equal(entries[0].subject, 'someone@example.com');
    assert.equal(entries[1].who, 'Ada');
  });

  test('a deleted account leaves its trail behind', () => {
    const ada = auth.upsertPrincipal('ada@example.com', 'Ada');
    auth.audit('sign-in', ada.id);
    auth.deletePrincipal(ada.id);

    const entries = auth.recentAudit();
    assert.equal(entries.length, 1, 'the entry survives');
    assert.equal(entries[0].who, null, 'the name does not');
  });
});

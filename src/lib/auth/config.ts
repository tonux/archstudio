/* How this install authenticates, kept in the `settings` table.
 *
 * The same arrangement as the AI configuration, and for the same reason given
 * there: this is operator configuration, not domain data. It grows by whatever
 * the next mode needs to remember, and a migration per field would be ceremony.
 *
 * The environment can force a mode, and wins. An operator who runs this in a
 * container behind oauth2-proxy should not have to open a dialog to make the
 * deployment reproducible — and, more sharply, should not be able to *lose*
 * authentication by clicking something in a browser.
 */
import { db, now, plain } from '../db';
import { countCredentials } from './store';
import { AUTH_MODES, DEFAULT_AUTH, type AuthConfig, type AuthMode } from './types';

const KEY = 'auth';

const isMode = (v: unknown): v is AuthMode =>
  typeof v === 'string' && (AUTH_MODES as string[]).includes(v);

/** `AUTH_MODE=header` in the environment pins the mode and takes the choice out
 *  of the UI. Anything unrecognised is ignored rather than obeyed. */
const envMode = (): AuthMode | null => {
  const v = process.env.AUTH_MODE?.trim().toLowerCase();
  return isMode(v) ? v : null;
};

function readRow(): Partial<AuthConfig> {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY);
  if (!row) return {};
  try {
    return JSON.parse(plain<{ value: string }>(row).value) as Partial<AuthConfig>;
  } catch {
    return {};
  }
}

/** The configuration in force. Never throws: a corrupt row reads as the
 *  default, which is `off` — the same behaviour as before identity existed. */
export function authConfig(): AuthConfig {
  const stored = readRow();
  const forced = envMode();
  return {
    mode: forced ?? (isMode(stored.mode) ? stored.mode : DEFAULT_AUTH.mode),
    emailHeader: (stored.emailHeader || process.env.AUTH_EMAIL_HEADER || DEFAULT_AUTH.emailHeader)
      .trim().toLowerCase(),
    nameHeader: (stored.nameHeader || process.env.AUTH_NAME_HEADER || DEFAULT_AUTH.nameHeader)
      .trim().toLowerCase()
  };
}

export const authModeIsForced = (): boolean => envMode() !== null;

/** The problem with switching to `mode`, in words, or null when it is safe.
 *
 *  Turning on local accounts with nobody able to sign in is a locked door with
 *  the key inside. The check belongs here rather than in the dialog, because the
 *  API is reachable without it. */
export function switchProblem(mode: AuthMode): string | null {
  if (authModeIsForced()) return 'The mode is pinned by AUTH_MODE in the environment.';
  if (mode === 'local' && countCredentials() === 0) {
    return 'Create an account with a password first — otherwise nobody can sign in.';
  }
  return null;
}

export function saveAuthConfig(patch: Partial<AuthConfig>): AuthConfig {
  const current = authConfig();
  const next: AuthConfig = {
    mode: isMode(patch.mode) ? patch.mode : current.mode,
    emailHeader: patch.emailHeader?.trim().toLowerCase() || current.emailHeader,
    nameHeader: patch.nameHeader?.trim().toLowerCase() || current.nameHeader
  };

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(KEY, JSON.stringify(next), now());

  return authConfig();
}

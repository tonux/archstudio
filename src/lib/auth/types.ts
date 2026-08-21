/* Who is asking.
 *
 * The shape is deliberately thin: an id, an email, a name. No roles, no scopes,
 * no ownership — at this stage **anyone who is signed in can do anything**, and
 * that is worth saying out loud rather than leaving to be discovered. Adding
 * identity and adding authorisation are two different pieces of work, and doing
 * them together would mean designing permissions against a repository that does
 * not exist yet. Roles arrive with the enterprise referential, when there is
 * something to scope them to.
 *
 * What this phase buys, and it is not small: a shared install stops being a
 * shared file. "Who froze v1.2" has an answer, and the answer survives.
 */

export interface Principal {
  id: string;
  email: string;
  /** Display name. Falls back to the email when nothing better is known. */
  name: string;
}

/** How this install decides who someone is.
 *
 *  `off` is the default and is exactly today's behaviour: no login, no session,
 *  every request allowed. An upgrade must never lock an operator out of their
 *  own data, so the feature stays dark until it is switched on. */
export type AuthMode = 'off' | 'header' | 'local';

export const AUTH_MODES: AuthMode[] = ['off', 'header', 'local'];

export const AUTH_MODE_LABELS: Record<AuthMode, string> = {
  off: 'No authentication',
  header: 'Trusted proxy header',
  local: 'Local accounts'
};

export const AUTH_MODE_BLURBS: Record<AuthMode, string> = {
  off: 'Anyone who can reach this server can edit. Put it behind a VPN.',
  header: 'A reverse proxy — oauth2-proxy, Authelia, your load balancer — signs people in and passes the result in a header. This is what most companies already run.',
  local: 'Email and password, stored here. Good for a demo or a single team; no password reset, no lockout.'
};

export interface AuthConfig {
  mode: AuthMode;
  /** `header` mode: the header the proxy sets. Case-insensitive on read. */
  emailHeader: string;
  /** `header` mode: an optional display name. Falls back to the email. */
  nameHeader: string;
}

export const DEFAULT_AUTH: AuthConfig = {
  mode: 'off',
  emailHeader: 'x-forwarded-email',
  nameHeader: 'x-forwarded-user'
};

/** What the browser is allowed to know. Never a hash, never a session id. */
export interface PublicAuth {
  mode: AuthMode;
  signedIn: boolean;
  principal: Principal | null;
  emailHeader: string;
  nameHeader: string;
  /** `local` mode: whether anyone has an account yet. False means the login
   *  page offers to create the first one — a fresh install has to have some way
   *  in, and this is it. */
  hasAccounts: boolean;
  /** The strongest role this person holds at workspace level, or null. */
  role: import('./policy').Role | null;
  /** What they may do there. For rendering, never for deciding. */
  can: import('./policy').Action[];
  /** Whether anyone at all is an admin. False means the bootstrap valve is
   *  open and every signed-in person is treated as one — see `policy.ts`. */
  anyAdmin: boolean;
}

/* ------------------------------------------------------------- passwords */

/** The one rule, and it is a length rule only.
 *
 *  Composition rules — a digit, a symbol, a capital — push people towards
 *  `Password1!` and are worse than nothing. Length is the property that actually
 *  costs an attacker something.
 *
 *  Here rather than beside the hashing, because the login form has to state the
 *  rule and the form runs in the browser: `password.ts` reaches for
 *  `node:crypto`, and importing it from a client component would pull that into
 *  the bundle. This module is the shared vocabulary and depends on nothing. */
export const MIN_PASSWORD = 10;

export const passwordProblem = (password: string): string | null =>
  password.length < MIN_PASSWORD
    ? `Use at least ${MIN_PASSWORD} characters.`
    : null;

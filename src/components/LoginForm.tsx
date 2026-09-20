'use client';

import { useState } from 'react';
import { Mark } from './Brand';
import { MIN_PASSWORD, type AuthMode } from '@/lib/auth/types';

export default function LoginForm({ mode, emailHeader, bootstrap }: {
  mode: AuthMode;
  emailHeader: string;
  bootstrap: boolean;
}) {
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* `header` mode has no form. Arriving here means the proxy did not send the
   * header — which is a deployment problem, and the page has to say which
   * header it was looking for or the operator is left guessing. */
  if (mode === 'header') {
    return (
      <Shell>
        <h1>Not signed in</h1>
        <p className="login-lede">
          This install expects a reverse proxy to authenticate people and pass the
          result in the <code>{emailHeader}</code> header. The request that reached
          this page did not carry one.
        </p>
        <p className="login-lede" style={{ marginBottom: 0 }}>
          Check that the proxy is in front of this server and that nothing can reach
          the port directly — a header is only trustworthy when nothing else can set it.
        </p>
      </Shell>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, password, name })
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || 'Could not sign in.');
        return;
      }
      /* A full navigation rather than a router push: every server component on
       * the way in reads the session, and they were rendered without one. */
      window.location.href = '/';
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1>{bootstrap ? 'Create the first account' : 'Sign in'}</h1>
      {bootstrap && (
        <p className="login-lede">
          Nobody has an account yet, so this one becomes the way in. Anyone signed in
          can add the rest from People, in the workspace footer.
        </p>
      )}

      <form onSubmit={submit} noValidate>
        {/* `text`, not `email`. An operator who set AUTH_USERNAME=admin has a
            username that is not an address, and the browser would refuse to
            submit it with no message this page could explain. */}
        <label className="field"><span>{bootstrap ? 'Email' : 'Email or username'}</span>
          <input className="input" type="text" name="username" autoComplete="username"
            required spellCheck={false} autoCapitalize="none"
            value={identifier} onChange={e => setIdentifier(e.target.value)} autoFocus />
        </label>

        {bootstrap && (
          <label className="field"><span>Name</span>
            <input className="input" placeholder="How you appear in the history"
              value={name} onChange={e => setName(e.target.value)} />
          </label>
        )}

        <label className="field" style={{ marginBottom: 0 }}><span>Password</span>
          <input className="input" type="password" name="password" required
            autoComplete={bootstrap ? 'new-password' : 'current-password'}
            value={password} onChange={e => setPassword(e.target.value)} />
          {bootstrap && <div className="hint">At least {MIN_PASSWORD} characters.</div>}
        </label>

        {/* `alert` so it is announced: the field keeps its value on a refusal,
            and without this the page looks to a screen reader as if nothing
            happened. */}
        {error && <p className="login-error" role="alert">{error}</p>}

        <button className="btn primary login-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : bootstrap ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </Shell>
  );
}

/* Nothing here names how the install is configured. An unauthenticated
 * visitor learning that it reads credentials from the environment, or how
 * long the password has to be, is told something only an attacker has a use
 * for — the operator reads it in the README, and the People panel says it to
 * people who have already signed in. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="login">
      <div className="login-card">
        <div className="login-brand">
          <Mark size={24} />
          <strong>ArchStudio</strong>
        </div>
        {children}
      </div>
    </main>
  );
}

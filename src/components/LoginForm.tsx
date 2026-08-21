'use client';

import { useState } from 'react';
import { Mark } from './Brand';
import { MIN_PASSWORD, type AuthMode } from '@/lib/auth/types';

export default function LoginForm({ mode, emailHeader, bootstrap }: {
  mode: AuthMode;
  emailHeader: string;
  bootstrap: boolean;
}) {
  const [email, setEmail] = useState('');
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
        <p className="hint">
          This install expects a reverse proxy to authenticate people and pass the
          result in the <code>{emailHeader}</code> header. The request that reached
          this page did not carry one.
        </p>
        <p className="hint">
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
        body: JSON.stringify({ email, password, name })
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
        <p className="hint">
          Nobody has an account yet, so this one becomes the way in. Anyone signed in
          can add the rest from People, in the workspace footer.
        </p>
      )}

      <form onSubmit={submit}>
        <label className="field"><span>Email</span>
          <input className="input" type="email" autoComplete="username" required
            value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </label>

        {bootstrap && (
          <label className="field"><span>Name</span>
            <input className="input" placeholder="How you appear in the history"
              value={name} onChange={e => setName(e.target.value)} />
          </label>
        )}

        <label className="field"><span>Password</span>
          <input className="input" type="password" required
            autoComplete={bootstrap ? 'new-password' : 'current-password'}
            value={password} onChange={e => setPassword(e.target.value)} />
          {bootstrap && <div className="hint">At least {MIN_PASSWORD} characters.</div>}
        </label>

        {error && <div className="hint" role="alert" style={{ color: 'var(--bad, #B00020)' }}>{error}</div>}

        <button className="btn primary" type="submit" disabled={busy}
          style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>
          {busy ? 'Working…' : bootstrap ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <Mark size={26} />
          <strong>ArchStudio</strong>
        </div>
        {children}
      </div>
    </div>
  );
}

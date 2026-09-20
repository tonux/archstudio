'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { api } from '@/lib/api';
import {
  AUTH_MODES, AUTH_MODE_BLURBS, AUTH_MODE_LABELS, MIN_PASSWORD,
  type AuthMode, type PublicAuth
} from '@/lib/auth/types';

/* Who can open this install, and who they are.
 *
 * Its own dialog rather than a section inside Settings: that one is about which
 * model reads your documents, this one is about who reads them. Two questions,
 * two dialogs.
 *
 * There are no roles here, and the dialog says so. Anyone signed in can do
 * anything, including adding and removing people — which is honest for a tool a
 * team runs behind their own VPN, and is what the audit log is for until scoped
 * roles arrive with the referential.
 */

interface Account { id: string; email: string; name: string; hasPassword: boolean }
interface Grant { principalId: string; principalName: string; role: string; scope: string; scopeId?: string }
interface RoleInfo { role: string; label: string; blurb: string }
interface Payload {
  auth: PublicAuth; forced: boolean; accounts: Account[];
  grants: Grant[]; roles: RoleInfo[]; domains: { id: string; name: string }[];
}

export function AccountsDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const load = () =>
    api.json<Payload>('/api/auth/accounts').then(setData).catch(e => setError(e.message));

  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const setMode = (mode: AuthMode) =>
    run(() => api.json('/api/auth/accounts', { method: 'PATCH', body: JSON.stringify({ mode }) }));

  const add = () => run(async () => {
    await api.json('/api/auth/accounts', {
      method: 'POST', body: JSON.stringify({ email, name, password })
    });
    setEmail(''); setName(''); setPassword('');
  });

  const remove = (a: Account) =>
    run(() => api.json(`/api/auth/accounts?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' }));

  const setRole = (principalId: string, role: string, scope: string, scopeId?: string, off?: boolean) =>
    run(() => api.json('/api/auth/accounts', {
      method: 'PUT',
      body: JSON.stringify({ principalId, role, scope, scopeId, revoke: !!off })
    }));

  const signOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    window.location.href = '/login';
  };

  const mode = data?.auth.mode ?? 'off';

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-head">
          <h3>People</h3>
          <button className="iconbtn" onClick={onClose} title="Close">
            <Icon name="chevron" size={15} />
          </button>
        </div>

        {!data ? <div className="empty" style={{ padding: 24 }}>Loading…</div> : (
          <div>
            <div className="field">
              <span>How people sign in</span>
              <div className="radio-row">
                {AUTH_MODES.map(m => (
                  <button key={m} className={`radio${mode === m ? ' on' : ''}`}
                    disabled={busy || data.forced} title={AUTH_MODE_BLURBS[m]}
                    onClick={() => setMode(m)}>
                    <i /> {AUTH_MODE_LABELS[m]}
                  </button>
                ))}
              </div>
              <div className="hint">
                {data.forced
                  ? 'Pinned by AUTH_MODE in the environment — a deployment cannot lose its authentication by a click in a browser.'
                  : AUTH_MODE_BLURBS[mode]}
              </div>
            </div>

            {mode === 'header' && (
              <div className="hint" style={{ marginTop: 4 }}>
                Reading <code>{data.auth.emailHeader}</code> for the address and{' '}
                <code>{data.auth.nameHeader}</code> for the display name. A header is
                only trustworthy if nothing can reach this server except through the
                proxy — check that before switching this on.
              </div>
            )}

            {/* The bootstrap valve, said out loud. An install with no admin
                treats everyone signed in as one — otherwise turning roles on
                would be a locked door with the key inside. */}
            {mode !== 'off' && !data.auth.anyAdmin && (
              <div className="hint" style={{ marginTop: 8 }}>
                Nobody is an administrator yet, so <b>everyone signed in can do
                everything</b>. Naming one administrator below switches roles on
                for real.
              </div>
            )}

            {mode !== 'off' && data.auth.principal && (
              <div className="hint" style={{ marginTop: 10 }}>
                Signed in as <b>{data.auth.principal.name}</b>
                {data.auth.role ? ` · ${data.auth.role}` : ''}
                {mode === 'local' && (
                  <> — <button className="linkbtn" onClick={signOut}>sign out</button></>
                )}
              </div>
            )}

            <div className="insp-sep" />

            <div className="sect-label">Accounts ({data.accounts.length})</div>
            <div className="cardlist">
              {data.accounts.length === 0 && (
                <div className="cardlist-empty">
                  Nobody yet. Adding one here does not switch authentication on by itself.
                </div>
              )}
              {data.accounts.map(a => (
                <div className="ccard" key={a.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1 }}>
                      <b>{a.name}</b>
                      <div className="sub">{a.email}{a.hasPassword ? '' : ' · no password'}</div>
                    </span>
                    <button className="iconbtn" disabled={busy} title="Remove"
                      onClick={() => remove(a)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>

                  {/* Roles, global. A role scoped to one project is usually a
                      sign the domain is missing rather than a real intent, so
                      the domain picker below is the second step, not the first. */}
                  <div className="chiprow" style={{ marginTop: 6 }}>
                    {data.roles.map(r => {
                      const on = data.grants.some(g =>
                        g.principalId === a.id && g.role === r.role && g.scope === 'global');
                      return (
                        <button key={r.role} className="chip" aria-pressed={on}
                          disabled={busy} title={r.blurb}
                          onClick={() => setRole(a.id, r.role, 'global', undefined, on)}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>

                  {data.domains.length > 0 && (
                    <div className="chiprow" style={{ marginTop: 4 }}>
                      {data.domains.map(d => {
                        const on = data.grants.some(g =>
                          g.principalId === a.id && g.role === 'architect'
                          && g.scope === 'domain' && g.scopeId === d.id);
                        return (
                          <button key={d.id} className="chip mono" aria-pressed={on}
                            disabled={busy}
                            title={`Architect of ${d.name} — every project that domain owns`}
                            onClick={() => setRole(a.id, 'architect', 'domain', d.id, on)}>
                            architect · {d.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="insp-sep" />

            <div className="sect-label">Add someone</div>
            <label className="field"><span>Email</span>
              <input className="input" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="ada@example.com" />
            </label>
            <label className="field"><span>Name</span>
              <input className="input" value={name}
                onChange={e => setName(e.target.value)} placeholder="Ada Lovelace" />
            </label>
            {/* Optional, and the hint says why: in proxy mode nobody ever types
                one, and a row that exists only so the app knows a name is a
                perfectly good account. */}
            <label className="field"><span>Password</span>
              <input className="input" type="password" autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)} />
              <div className="hint">
                Only needed for local accounts. At least {MIN_PASSWORD} characters.
              </div>
            </label>

            <button className="btn primary" disabled={busy || !email.trim()} onClick={add}
              style={{ width: '100%', justifyContent: 'center' }}>
              Add
            </button>

            {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

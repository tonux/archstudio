'use client';

import { useState } from 'react';
import { createCloudService } from '@/lib/admin/cloud';

export function NewCloudServiceDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (roleKey: string) => void;
}) {
  const [roleKey, setRoleKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const key = roleKey.trim();
    if (!key) { setError('Role key is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const created = await createCloudService({
        roleKey: key,
        payload: {
          aws: { name: key },
          gcp: { name: key },
          azure: { name: key },
          selfhosted: { name: key },
        },
      });
      onCreated(created.roleKey);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>New cloud service role</h2>
        <p className="lede">Adds a correspondence row — one cell per hyperscaler plus self-hosted.</p>
        <label className="field">
          <span>Role key</span>
          <input
            className="input mono"
            autoFocus
            value={roleKey}
            onChange={e => setRoleKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
            placeholder="messageQueue"
          />
          <span className="hint">camelCase. Seeded keys reappear on next ensure if deleted.</span>
        </label>
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create role'}
          </button>
        </div>
      </div>
    </div>
  );
}

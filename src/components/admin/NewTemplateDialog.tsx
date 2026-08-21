'use client';

import { useState } from 'react';
import { createArchitectureTemplate } from '@/lib/admin/architecture';
import { createTemplate } from '@/lib/admin/templates';

type TemplateKind = 'project' | 'architecture';

export function NewTemplateDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [kind, setKind] = useState<TemplateKind>('project');
  const [id, setId] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!nameEn.trim()) { setError('English name is required.'); return; }
    setBusy(true); setError('');
    try {
      const body = {
        id: id.trim() || nameEn.trim(),
        nameEn: nameEn.trim(),
        nameFr: nameFr.trim() || undefined,
      };
      const res = kind === 'architecture'
        ? await createArchitectureTemplate(body)
        : await createTemplate(body);
      onCreated(res.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Create template</h2>
            <p className="lede">
              {kind === 'project'
                ? 'Editable project snapshot for the atelier.'
                : 'Hyperscaler pattern — agnostic preview, per-cloud JSON under Advanced.'}
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Template kind">
            <button type="button" aria-pressed={kind === 'project'} onClick={() => setKind('project')}>
              Project
            </button>
            <button type="button" aria-pressed={kind === 'architecture'} onClick={() => setKind('architecture')}>
              Architecture
            </button>
          </div>
        </div>
        <label className="field"><span>English name</span>
          <input className="input" autoFocus value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder="Payments platform" />
        </label>
        <label className="field"><span>French name (optional)</span>
          <input className="input" value={nameFr} onChange={e => setNameFr(e.target.value)} placeholder="Plateforme paiements" />
        </label>
        <label className="field"><span>Template id (optional)</span>
          <input className="input mono" value={id} onChange={e => setId(e.target.value)} placeholder="payments-v1" />
          <span className="hint">Lowercase, hyphens. Defaults from the English name.</span>
        </label>
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { SECTION_TYPES } from '@/lib/defaults';
import { createSection } from '@/lib/admin/sections';
import type { SectionType } from '@/lib/types';

export function NewSectionDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [type, setType] = useState<SectionType>('cards');
  const [id, setId] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [titleFr, setTitleFr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!titleEn.trim()) { setError('English title is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await createSection({
        id: id.trim() || undefined,
        type,
        titleEn: titleEn.trim(),
        titleFr: titleFr.trim() || undefined,
      });
      onCreated(res.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>New ADD section</h2>
        <p className="lede">Creates a reusable chapter for templates and the preset pack.</p>
        <label className="field"><span>Type</span>
          <select className="select" value={type} onChange={e => setType(e.target.value as SectionType)}>
            {SECTION_TYPES.map(t => (
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="field"><span>Title (EN)</span>
          <input className="input" autoFocus value={titleEn} onChange={e => setTitleEn(e.target.value)} placeholder="Operations runbook" />
        </label>
        <label className="field"><span>Title (FR, optional)</span>
          <input className="input" value={titleFr} onChange={e => setTitleFr(e.target.value)} placeholder="Runbook opérations" />
        </label>
        <label className="field"><span>Section id (optional)</span>
          <input className="input mono" value={id} onChange={e => setId(e.target.value)} placeholder="operations-runbook" />
          <span className="hint">Lowercase, hyphens. Defaults from the English title.</span>
        </label>
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create section'}
          </button>
        </div>
      </div>
    </div>
  );
}

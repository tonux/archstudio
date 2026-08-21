'use client';

import { useState } from 'react';
import { IconPicker } from '@/components/editors/Fields';
import { createFlowPattern } from '@/lib/admin/flows';

export function NewFlowDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [nameEn, setNameEn] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [taglineEn, setTaglineEn] = useState('');
  const [taglineFr, setTaglineFr] = useState('');
  const [icon, setIcon] = useState('route');
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!nameEn.trim()) { setError('English name is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await createFlowPattern({
        id: id.trim() || undefined,
        icon: icon || 'route',
        nameEn: nameEn.trim(),
        nameFr: nameFr.trim() || undefined,
        taglineEn: taglineEn.trim() || undefined,
        taglineFr: taglineFr.trim() || undefined,
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
        <h2>New flow pattern</h2>
        <p className="lede">Creates a custom recipe with a start and end step. Catalogue recipes stay locked and re-seed if deleted.</p>
        <IconPicker value={icon} onChange={setIcon} />
        <label className="field"><span>Name (EN)</span>
          <input className="input" autoFocus value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder="Incident response" />
        </label>
        <label className="field"><span>Name (FR, optional)</span>
          <input className="input" value={nameFr} onChange={e => setNameFr(e.target.value)} placeholder="Réponse incident" />
        </label>
        <label className="field"><span>Tagline (EN, optional)</span>
          <input className="input" value={taglineEn} onChange={e => setTaglineEn(e.target.value)} placeholder="Detect, contain, recover" />
        </label>
        <label className="field"><span>Tagline (FR, optional)</span>
          <input className="input" value={taglineFr} onChange={e => setTaglineFr(e.target.value)} placeholder="Détecter, contenir, rétablir" />
        </label>
        <label className="field"><span>Pattern id (optional)</span>
          <input className="input mono" value={id} onChange={e => setId(e.target.value)} placeholder="incident-response" />
          <span className="hint">Lowercase, hyphens. Defaults from the English name.</span>
        </label>
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create pattern'}
          </button>
        </div>
      </div>
    </div>
  );
}

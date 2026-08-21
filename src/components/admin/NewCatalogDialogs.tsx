'use client';

import { useState, type ReactNode } from 'react';
import { Choice, IconPicker, Text } from '@/components/editors/Fields';
import {
  createBrick,
  createDependency,
  createIntent,
  createScope,
  createTechnology,
  createVariant,
} from '@/lib/admin/catalog-entities';
import {
  DEPENDENCY_KINDS,
  DEPENDENCY_STRENGTHS,
  HOSTING_MODE_OPTIONS,
  ModeChips,
} from '@/components/admin/CatalogFormParts';

function CatalogCreateDialog({
  title,
  lede,
  busy,
  error,
  onClose,
  onSubmit,
  submitLabel,
  children,
}: {
  title: string;
  lede: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="lede">{lede}</p>
        {children}
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={onSubmit}>
            {busy ? 'Creating…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewScopeDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [id, setId] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [labelFr, setLabelFr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!labelEn.trim() || !labelFr.trim()) {
      setError('English and French labels are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await createScope({
        id: id.trim() || undefined,
        labelEn: labelEn.trim(),
        labelFr: labelFr.trim(),
      });
      onCreated(res.scopeId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <CatalogCreateDialog
      title="New scope"
      lede="Adds a placement scope with bilingual labels. Id defaults from the English label."
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Create scope"
    >
      <Text label="Label (EN)" value={labelEn} onChange={setLabelEn} placeholder="Product" />
      <Text label="Label (FR)" value={labelFr} onChange={setLabelFr} placeholder="Produit" />
      <Text label="Scope id (optional)" value={id} onChange={setId} mono placeholder="product" hint="Lowercase, hyphens." />
    </CatalogCreateDialog>
  );
}

export function NewIntentDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [modes, setModes] = useState<string[]>(['cloud']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!label.trim()) { setError('Label is required.'); return; }
    if (modes.length === 0) { setError('Pick at least one hosting mode.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await createIntent({
        id: id.trim() || undefined,
        label: label.trim(),
        modes,
      });
      onCreated(res.intentId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <CatalogCreateDialog
      title="New intent"
      lede="Placement intent with hosting modes. Shapes can be edited after create."
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Create intent"
    >
      <Text label="Label" value={label} onChange={setLabel} placeholder="Identity provider" />
      <ModeChips
        modes={modes}
        onToggle={mode => setModes(list => list.includes(mode) ? list.filter(m => m !== mode) : [...list, mode])}
      />
      <Text label="Intent id (optional)" value={id} onChange={setId} mono placeholder="identity" hint="Lowercase, hyphens." />
    </CatalogCreateDialog>
  );
}

export function NewVariantDialog({
  intents,
  bricks,
  onClose,
  onCreated,
}: {
  intents: string[];
  bricks: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [intent, setIntent] = useState(intents[0] ?? '');
  const [mode, setMode] = useState('cloud');
  const [mapsTo, setMapsTo] = useState(bricks[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!label.trim()) { setError('Label is required.'); return; }
    if (!intent) { setError('Intent is required.'); return; }
    if (!mapsTo) { setError('Maps-to brick is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await createVariant({
        id: id.trim() || undefined,
        label: label.trim(),
        intent,
        mode: mode as 'client' | 'baas' | 'cloud' | 'selfhosted',
        maps_to: mapsTo,
      });
      onCreated(res.variantId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <CatalogCreateDialog
      title="New variant"
      lede="Maps an intent + hosting mode to a concrete brick."
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Create variant"
    >
      <Text label="Label" value={label} onChange={setLabel} placeholder="Auth0 (cloud)" />
      <Choice
        label="Intent"
        value={intent}
        onChange={setIntent}
        options={intents.map(i => ({ value: i, label: i }))}
      />
      <Choice
        label="Mode"
        value={mode}
        onChange={setMode}
        options={HOSTING_MODE_OPTIONS.map(m => ({ value: m.value, label: m.label }))}
      />
      <Choice
        label="Maps to brick"
        value={mapsTo}
        onChange={setMapsTo}
        options={bricks.map(b => ({ value: b, label: b }))}
      />
      <Text label="Variant id (optional)" value={id} onChange={setId} mono placeholder="identity-auth0" />
    </CatalogCreateDialog>
  );
}

export function NewDependencyDialog({
  bricks,
  onClose,
  onCreated,
}: {
  bricks: string[];
  onClose: () => void;
  onCreated: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState(bricks[0] ?? '');
  const [to, setTo] = useState(bricks[1] ?? bricks[0] ?? '');
  const [strength, setStrength] = useState('recommended');
  const [kind, setKind] = useState('sync');
  const [protocolId, setProtocolId] = useState('http');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!from || !to) { setError('From and to bricks are required.'); return; }
    if (from === to) { setError('Endpoints must differ.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await createDependency({
        from,
        to,
        strength: strength as 'required' | 'recommended' | 'optional',
        kind: kind as 'sync' | 'async' | 'batch',
        protocol_id: protocolId.trim() || 'http',
      });
      onCreated(res.from, res.to);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <CatalogCreateDialog
      title="New dependency"
      lede="Suggestion edge between two bricks. Why copy can be refined in the inspector."
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Create dependency"
    >
      <Choice label="From brick" value={from} onChange={setFrom} options={bricks.map(b => ({ value: b, label: b }))} />
      <Choice label="To brick" value={to} onChange={setTo} options={bricks.map(b => ({ value: b, label: b }))} />
      <Choice label="Strength" value={strength} onChange={setStrength} options={DEPENDENCY_STRENGTHS} />
      <Choice label="Kind" value={kind} onChange={setKind} options={DEPENDENCY_KINDS} />
      <Text label="Protocol id" value={protocolId} onChange={setProtocolId} mono placeholder="http" />
    </CatalogCreateDialog>
  );
}

export function NewTechnologyDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const [key, setKey] = useState('');
  const [en, setEn] = useState('');
  const [fr, setFr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!en.trim() || !fr.trim()) {
      setError('English and French descriptions are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await createTechnology({
        key: key.trim() || undefined,
        en: en.trim(),
        fr: fr.trim(),
      });
      onCreated(res.key);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <CatalogCreateDialog
      title="New technology"
      lede="Stack description key used by brick glossaries and ADD copy."
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Create technology"
    >
      <Text label="Key (optional)" value={key} onChange={setKey} mono placeholder="auth0" hint="Lowercase, hyphens. Defaults from EN copy." />
      <label className="field">
        <span>Description (EN)</span>
        <textarea className="textarea" value={en} onChange={e => setEn(e.target.value)} style={{ minHeight: 72 }} />
      </label>
      <label className="field">
        <span>Description (FR)</span>
        <textarea className="textarea" value={fr} onChange={e => setFr(e.target.value)} style={{ minHeight: 72 }} />
      </label>
    </CatalogCreateDialog>
  );
}

export function NewBrickDialog({
  scopes,
  layers,
  onClose,
  onCreated,
}: {
  scopes: { value: string; label: string }[];
  layers: { value: string; label: string }[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [id, setId] = useState('');
  const [icon, setIcon] = useState('box');
  const [layer, setLayer] = useState(layers[0]?.value ?? 'services');
  const [defaultScope, setDefaultScope] = useState(scopes[0]?.value ?? '');
  const [roleEn, setRoleEn] = useState('');
  const [roleFr, setRoleFr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!roleEn.trim() || !roleFr.trim()) {
      setError('English and French roles are required.');
      return;
    }
    if (!defaultScope) {
      setError('Default scope is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await createBrick({
        id: id.trim() || undefined,
        icon,
        layer,
        defaultScope,
        roleEn: roleEn.trim(),
        roleFr: roleFr.trim(),
        purposeEn: roleEn.trim(),
        purposeFr: roleFr.trim(),
      });
      onCreated(res.brickId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <CatalogCreateDialog
      title="New brick"
      lede="Creates a Lego brick with EN/FR role. Refine purpose and tags on the fiche."
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Create brick"
    >
      <IconPicker value={icon} onChange={setIcon} />
      <Text label="Role (EN)" value={roleEn} onChange={setRoleEn} placeholder="Provides identity for this architecture." />
      <Text label="Role (FR)" value={roleFr} onChange={setRoleFr} placeholder="Fournit l’identité dans cette architecture." />
      <Choice label="Layer" value={layer} onChange={setLayer} options={layers} />
      <Choice label="Default scope" value={defaultScope} onChange={setDefaultScope} options={scopes} />
      <Text label="Brick id (optional)" value={id} onChange={setId} mono placeholder="identity-custom" />
    </CatalogCreateDialog>
  );
}

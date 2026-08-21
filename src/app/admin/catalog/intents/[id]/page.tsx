'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Area, Group } from '@/components/editors/Fields';
import { fetchIntent, patchIntent } from '@/lib/admin/catalog-entities';
import type { LegoIntent } from '@/lib/lego/types';

const MODES = ['client', 'baas', 'cloud', 'selfhosted'] as const;

export default function AdminIntentPage() {
  const { id } = useParams<{ id: string }>();
  const [intent, setIntent] = useState<LegoIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      setIntent(await fetchIntent(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load intent');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const toggleMode = (mode: string) => {
    if (!intent) return;
    const has = intent.modes.includes(mode as LegoIntent['modes'][number]);
    setIntent({
      ...intent,
      modes: has ? intent.modes.filter(m => m !== mode) : [...intent.modes, mode as LegoIntent['modes'][number]],
    });
    setSaved(false);
  };

  const save = async () => {
    if (!intent) return;
    try {
      await patchIntent(id, {
        label: intent.label,
        modes: [...intent.modes],
        shapes: intent.shapes?.length ? [...intent.shapes] : [],
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  if (error && !intent) return <div className="warnbox" style={{ margin: 22 }}>{error}</div>;
  if (!intent) return <div className="empty">Loading intent…</div>;

  return (
    <div className="editor-body">
      <div className="content-main">
        <div className="cpanel">
          <Link href="/admin/catalog/intents" className="btn sm" style={{ marginBottom: 12, display: 'inline-flex' }}>
            Back to intents
          </Link>
          <Group title={intent.id}>
            <Area label="Label" value={intent.label} onChange={label => { setIntent({ ...intent, label }); setSaved(false); }} minHeight={40} />
            <div className="field">
              <span>Hosting modes</span>
              <div className="chiprow">
                {MODES.map(mode => (
                  <button
                    key={mode}
                    type="button"
                    className="tagchip"
                    aria-pressed={intent.modes.includes(mode)}
                    style={intent.modes.includes(mode) ? { borderColor: 'var(--brand)', color: 'var(--brand-ink)' } : undefined}
                    onClick={() => toggleMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <Area
              label="Shapes (comma-separated)"
              value={(intent.shapes ?? []).join(', ')}
              onChange={v => { setIntent({ ...intent, shapes: v.split(',').map(s => s.trim()).filter(Boolean) }); setSaved(false); }}
              minHeight={40}
              hint="Optional shape filters for this intent (e.g. gateway, compute)."
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <button type="button" className="btn primary" onClick={() => void save()}>Save intent</button>
              {saved && <span className="saveflag"><i />Saved</span>}
            </div>
          </Group>
        </div>
      </div>
      <aside className="inspector">
        <div className="mono sub">{intent.id}</div>
        <h3>Modes</h3>
        <p className="hint">{intent.modes.join(' · ') || 'No hosting modes selected.'}</p>
      </aside>
    </div>
  );
}

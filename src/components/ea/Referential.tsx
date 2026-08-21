'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icon';
import { Lockup } from '../Brand';
import { api } from '@/lib/api';
import {
  ENTITY_BLURBS, ENTITY_KINDS, ENTITY_PLURALS, NESTING_KINDS,
  STANDARD_STATUSES, STATUS_BLURBS, STATUS_LABELS,
  type EntityKind, type EntitySummary, type StandardStatus
} from '@/lib/ea/types';
import type { Usage } from '@/lib/ea/repository';

/* The referential, edited.
 *
 * One screen, one kind at a time, because the six kinds answer six different
 * questions and mixing them into one list makes none of them readable.
 *
 * The column that justifies the whole feature is "used by": the number of
 * projects citing an entity. Until this existed the answer was "open every
 * diagram and look", which is the reason nobody ever knew.
 */

interface Props { initial: EntitySummary[] }

export default function Referential({ initial }: Props) {
  const [entities, setEntities] = useState(initial);
  const [kind, setKind] = useState<EntityKind>('application');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ entity: EntitySummary; rows: Usage[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const reload = async () => {
    const { entities: next } = await api.json<{ entities: EntitySummary[] }>('/api/ea/entities');
    setEntities(next);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entities
      .filter(e => e.kind === kind)
      .filter(e => !q || e.name.toLowerCase().includes(q) || (e.code || '').toLowerCase().includes(q));
  }, [entities, kind, query]);

  const byId = useMemo(() => new Map(entities.map(e => [e.id, e])), [entities]);
  const path = (e: EntitySummary): string => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let at: string | undefined = e.id;
    while (at && !seen.has(at)) {
      seen.add(at);
      const node: EntitySummary | undefined = byId.get(at);
      if (!node) break;
      parts.unshift(node.name);
      at = node.parent;
    }
    return parts.join(' › ');
  };

  const add = (name: string) => run(() =>
    api.json('/api/ea/entities', { method: 'POST', body: JSON.stringify({ kind, name }) }));

  const patch = (id: string, body: Record<string, unknown>) => run(() =>
    api.json('/api/ea/entities', { method: 'PATCH', body: JSON.stringify({ id, ...body }) }));

  /* Deleting says how many projects will be affected *before* it happens, and
     the citations leave those documents on their own next save. Surprising
     someone with that is how a referential loses its authority. */
  const remove = (e: EntitySummary) => run(async () => {
    if (e.usedBy > 0 && !window.confirm(
      `${e.name} is cited by ${e.usedBy} project${e.usedBy > 1 ? 's' : ''}. ` +
      `Those citations disappear the next time each document is saved. Delete it?`
    )) return;
    await api.json(`/api/ea/entities?id=${encodeURIComponent(e.id)}`, { method: 'DELETE' });
  });

  const showUsage = async (e: EntitySummary) => {
    const { usage: rows } = await api.json<{ usage: Usage[] }>(
      `/api/ea/entities?usage=${encodeURIComponent(e.id)}`);
    setUsage({ entity: e, rows });
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Lockup />
        <span className="spacer" style={{ flex: 1 }} />
        <Link href="/" className="footbtn" style={{ textDecoration: 'none' }}>
          <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} />Workspace
        </Link>
      </header>

      <div>
        <h1 style={{ marginBottom: 4 }}>Referential</h1>
        <p className="hint" style={{ marginBottom: 18 }}>
          An application exists once, however many diagrams draw it. What is here can
          be attached to a component from the inspector, and travels inside every
          export as a name rather than an id.
        </p>

        <div className="chiprow" style={{ marginBottom: 12 }}>
          {ENTITY_KINDS.map(k => (
            <button key={k} className="chip" aria-pressed={kind === k}
              title={ENTITY_BLURBS[k]} onClick={() => setKind(k)}>
              {ENTITY_PLURALS[k]}
              <span className="count">{entities.filter(e => e.kind === k).length}</span>
            </button>
          ))}
        </div>
        <div className="hint" style={{ marginBottom: 12 }}>{ENTITY_BLURBS[kind]}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="input" placeholder="Search" value={query}
            onChange={e => setQuery(e.target.value)} style={{ flex: 1 }} />
          <button className="btn" onClick={() => setImporting(true)}>
            <Icon name="save" size={14} />Import CSV
          </button>
          <a className="btn" href="/api/ea/import"><Icon name="download" size={14} />Template</a>
        </div>

        {/* The best reuse in the whole feature: an application landscape is the
            banded diagram this app has always drawn, with the domains as bands
            and the edges taken from dependencies somebody drew months ago. */}
        <button className="btn" disabled={busy} style={{ marginBottom: 12 }}
          onClick={() => run(async () => {
            const r = await api.json<{ id: string; components: number }>(
              '/api/ea/landscape', { method: 'POST', body: JSON.stringify({}) });
            window.location.href = `/projects/${r.id}`;
          })}>
          <Icon name="layers" size={14} />Generate application landscape
        </button>

        <AddRow kind={kind} busy={busy} onAdd={add} />

        {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}

        <div className="cardlist" style={{ marginTop: 12 }}>
          {shown.length === 0 && (
            <div className="cardlist-empty">
              Nothing here yet. Add one above, or import a spreadsheet.
            </div>
          )}
          {shown.map(e => (
            <Row key={e.id} entity={e} path={path(e)} busy={busy}
              siblings={entities.filter(x => x.kind === kind && x.id !== e.id)}
              onPatch={patch} onRemove={remove} onUsage={showUsage} />
          ))}
        </div>
      </div>

      {usage && <UsageDialog data={usage} onClose={() => setUsage(null)} />}
      {importing && (
        <ImportDialog onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- rows */

function AddRow({ kind, busy, onAdd }: {
  kind: EntityKind; busy: boolean; onAdd: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const submit = () => { if (name.trim()) { onAdd(name.trim()); setName(''); } };
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input className="input" style={{ flex: 1 }} value={name}
        placeholder={`New ${kind.replace('-', ' ')}`}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
      <button className="btn primary" disabled={busy || !name.trim()} onClick={submit}>Add</button>
    </div>
  );
}

function Row({ entity, path, siblings, busy, onPatch, onRemove, onUsage }: {
  entity: EntitySummary;
  path: string;
  siblings: EntitySummary[];
  busy: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onRemove: (e: EntitySummary) => void;
  onUsage: (e: EntitySummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const nests = NESTING_KINDS.includes(entity.kind);

  return (
    <div className="ccard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>
          <b>{path || entity.name}</b>
          <div className="sub">
            {entity.code ? <span className="mono">{entity.code}</span> : null}
            {entity.code && entity.status ? ' · ' : null}
            {entity.status ? STATUS_LABELS[entity.status] : null}
          </div>
        </span>

        {/* The number the whole feature exists to produce. A zero is a finding
            too: an entity nobody cites is either new or dead weight. */}
        <button className="chip" disabled={!entity.usedBy} onClick={() => onUsage(entity)}
          title={entity.usedBy ? 'Which projects cite it' : 'No project cites it yet'}>
          used by <span className="count">{entity.usedBy}</span>
        </button>

        <button className="iconbtn" onClick={() => setOpen(o => !o)} title="Edit">
          <Icon name="cog" size={14} />
        </button>
        <button className="iconbtn" disabled={busy} onClick={() => onRemove(entity)} title="Delete">
          <Icon name="trash" size={14} />
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <label className="field"><span>Name</span>
            <input className="input" defaultValue={entity.name}
              onBlur={e => e.target.value.trim() !== entity.name
                && onPatch(entity.id, { name: e.target.value })} />
          </label>
          <label className="field"><span>Code</span>
            <input className="input" defaultValue={entity.code || ''} placeholder="APP-0142"
              onBlur={e => e.target.value.trim() !== (entity.code || '')
                && onPatch(entity.id, { code: e.target.value })} />
            <div className="hint">The reference your organisation already uses. An import matches on it.</div>
          </label>

          {nests && (
            <label className="field"><span>Inside</span>
              <select className="select" value={entity.parent || ''}
                onChange={e => onPatch(entity.id, { parent: e.target.value || null })}>
                <option value="">top level</option>
                {siblings.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}

          {entity.kind === 'technology-standard' && (
            <div className="field">
              <span>Decision</span>
              <div className="radio-row">
                {STANDARD_STATUSES.map(s => (
                  <button key={s} className={`radio${entity.status === s ? ' on' : ''}`}
                    title={STATUS_BLURBS[s]}
                    onClick={() => onPatch(entity.id, {
                      status: entity.status === s ? null : (s as StandardStatus)
                    })}>
                    <i /> {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              <div className="hint">
                {entity.status ? STATUS_BLURBS[entity.status] : 'No decision recorded.'}
              </div>
            </div>
          )}

          <label className="field"><span>Description</span>
            <textarea className="textarea" defaultValue={entity.description || ''}
              onBlur={e => e.target.value.trim() !== (entity.description || '')
                && onPatch(entity.id, { description: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- dialogs */

function UsageDialog({ data, onClose }: {
  data: { entity: EntitySummary; rows: Usage[] }; onClose: () => void;
}) {
  const byProject = new Map<string, Usage[]>();
  data.rows.forEach(r => {
    byProject.set(r.projectId, [...(byProject.get(r.projectId) || []), r]);
  });

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{data.entity.name}</h3>
          <button className="iconbtn" onClick={onClose}><Icon name="chevron" size={15} /></button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          Cited by {byProject.size} project{byProject.size > 1 ? 's' : ''}.
        </div>
        <div className="cardlist">
          {[...byProject.entries()].map(([id, rows]) => (
            <a key={id} className="ccard" href={`/projects/${id}`} style={{ textDecoration: 'none' }}>
              <b>{rows[0].projectName}</b>
              <div className="sub">
                {rows.map(r => `${r.componentId} (${r.role})`).join(' · ')}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Report {
  created: number; updated: number; skipped: number;
  rows: { line: number; outcome: string; reason?: string; name?: string }[];
  ignoredColumns: string[];
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true); setError(null);
    try {
      setReport(await api.json<Report>('/api/ea/import', {
        method: 'POST', body: JSON.stringify({ text })
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import.');
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-head">
          <h3>Import a spreadsheet</h3>
          <button className="iconbtn" onClick={onClose}><Icon name="chevron" size={15} /></button>
        </div>

        {!report ? (
          <>
            <div className="hint" style={{ marginBottom: 8 }}>
              Header: <span className="mono">kind,code,name,parent,status,description</span>.
              A row that already exists — matched on its code, or on its exact name
              within the same kind — is updated rather than duplicated, so
              re-importing the same file is safe.
            </div>
            <textarea className="textarea" rows={10} value={text}
              placeholder="Paste the file, or drop it in"
              onChange={e => setText(e.target.value)} />
            <input type="file" accept=".csv,text/csv" style={{ marginTop: 8 }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (file) setText(await file.text());
              }} />
            {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
            <button className="btn primary" disabled={busy || !text.trim()} onClick={send}
              style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>
              {busy ? 'Reading…' : 'Import'}
            </button>
          </>
        ) : (
          <>
            <div className="hint">
              {report.created} created · {report.updated} updated · {report.skipped} skipped
            </div>
            {report.ignoredColumns.length > 0 && (
              <div className="hint" style={{ marginTop: 6 }}>
                Columns this importer does not read: {report.ignoredColumns.join(', ')}.
              </div>
            )}
            {/* Only the refusals are listed. Someone reviewing an import wants
                to know what did *not* happen; a wall of successes buries it. */}
            {report.rows.filter(r => r.reason).length > 0 && (
              <div className="cardlist" style={{ marginTop: 10 }}>
                {report.rows.filter(r => r.reason).map(r => (
                  <div className="ccard" key={r.line}>
                    <b>Line {r.line}{r.name ? ` — ${r.name}` : ''}</b>
                    <div className="sub">{r.reason}</div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn primary" onClick={onDone}
              style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

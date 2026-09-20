'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icon';
import { Lockup } from '../Brand';
import { api } from '@/lib/api';
import {
  CRITICALITIES, CRITICALITY_BLURBS, CRITICALITY_KINDS, CRITICALITY_LABELS,
  ENTITY_BLURBS, ENTITY_KINDS, ENTITY_LABELS, ENTITY_LAYER, ENTITY_PLURALS,
  LAYER_LABELS, LIFECYCLES, LIFECYCLE_BLURBS, LIFECYCLE_KINDS, LIFECYCLE_LABELS,
  NESTING_KINDS, RELATION_BLURBS, RELATION_ENDS, RELATION_LABELS,
  STANDARD_STATUSES, STATUS_BLURBS, STATUS_KINDS, STATUS_LABELS,
  relationsFrom,
  type Criticality, type Entity, type EntityKind, type EntityLayer,
  type EntityLifecycle, type EntitySummary, type RelationKind,
  type ResolvedRelation, type StandardStatus
} from '@/lib/ea/types';
import type { Usage } from '@/lib/ea/repository';

/* The referential, edited.
 *
 * One screen, one kind at a time, because the kinds answer different questions
 * and mixing them into one list makes none of them readable. The filters are
 * grouped by layer rather than laid out in one row: twelve chips side by side
 * is a wall, four groups of two or six is a model somebody can read.
 *
 * The column that justifies the whole feature is "used by": the number of
 * projects citing an entity. Until this existed the answer was "open every
 * diagram and look", which is the reason nobody ever knew.
 *
 * Relationships are edited in the detail panel rather than in a screen of their
 * own. An edge has no meaning away from its ends — "realizes" is a sentence
 * about *this* application — and a list of a thousand edges is the shape of
 * data nobody curates.
 */

interface Props { initial: EntitySummary[] }

const LAYERS: EntityLayer[] = ['business', 'application', 'technology', 'motivation'];

export default function Referential({ initial }: Props) {
  const [entities, setEntities] = useState(initial);
  const [kind, setKind] = useState<EntityKind>('application');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    const { entities: next } = await api.json<{ entities: EntitySummary[] }>('/api/ea/entities');
    setEntities(next);
  }, []);

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
    setOpenId(null);
  });

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

        {LAYERS.map(layer => {
          const kinds = ENTITY_KINDS.filter(k => ENTITY_LAYER[k] === layer);
          return (
            <div key={layer} style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <span className="sub" style={{ width: 92, flexShrink: 0 }}>{LAYER_LABELS[layer]}</span>
              <div className="chiprow" style={{ flex: 1 }}>
                {kinds.map(k => (
                  <button key={k} className="chip" aria-pressed={kind === k}
                    title={ENTITY_BLURBS[k]} onClick={() => setKind(k)}>
                    {ENTITY_PLURALS[k]}
                    <span className="count">{entities.filter(e => e.kind === k).length}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div className="hint" style={{ margin: '12px 0' }}>{ENTITY_BLURBS[kind]}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="input" placeholder="Search" value={query}
            onChange={e => setQuery(e.target.value)} style={{ flex: 1 }} />
          <button className="btn" onClick={() => setImporting(true)}>
            <Icon name="save" size={14} />Import CSV
          </button>
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
              onOpen={() => setOpenId(e.id)} onRemove={remove} />
          ))}
        </div>
      </div>

      {openId && (
        <DetailDialog id={openId} all={entities}
          onClose={() => setOpenId(null)}
          onPatch={patch} onChanged={reload} />
      )}
      {importing && (
        <ImportDialog onClose={() => setImporting(false)}
          onDone={() => { setImporting(false); reload(); }} />
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
        placeholder={`New ${ENTITY_LABELS[kind].toLowerCase()}`}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
      <button className="btn primary" disabled={busy || !name.trim()} onClick={submit}>Add</button>
    </div>
  );
}

/** One line in the list. Everything editable moved into the detail panel: the
 *  row got to about nine controls, at which point scanning a list of two hundred
 *  applications stopped being possible, which is the one thing the list is for. */
function Row({ entity, path, busy, onOpen, onRemove }: {
  entity: EntitySummary;
  path: string;
  busy: boolean;
  onOpen: () => void;
  onRemove: (e: EntitySummary) => void;
}) {
  const marks = [
    entity.code,
    entity.status ? STATUS_LABELS[entity.status] : null,
    entity.lifecycle ? LIFECYCLE_LABELS[entity.lifecycle] : null,
    entity.criticality ? `${CRITICALITY_LABELS[entity.criticality]} criticality` : null,
    entity.source ? `from ${entity.source}` : null
  ].filter(Boolean);

  return (
    <div className="ccard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>
          <b>{path || entity.name}</b>
          <div className="sub">{marks.join(' · ')}</div>
        </span>

        {/* The number the whole feature exists to produce. A zero is a finding
            too: an entity nobody cites is either new or dead weight. */}
        <span className="chip" title={entity.usedBy ? 'Projects citing it' : 'No project cites it yet'}>
          used by <span className="count">{entity.usedBy}</span>
        </span>

        <button className="iconbtn" onClick={onOpen} title="Open">
          <Icon name="expand" size={14} />
        </button>
        <button className="iconbtn" disabled={busy} onClick={() => onRemove(entity)} title="Delete">
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- detail */

interface Detail {
  entity: Entity;
  relations: ResolvedRelation[];
  usage: Usage[];
}

/** Everything about one entity: its fields, its neighbourhood, and who cites it.
 *
 *  One request, because the three are always read together and a panel that
 *  paints in three stages reads as broken. */
function DetailDialog({ id, all, onClose, onPatch, onChanged }: {
  id: string;
  all: EntitySummary[];
  onClose: () => void;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await api.json<Detail>(`/api/ea/entities?entity=${encodeURIComponent(id)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load it.');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const patch = (body: Record<string, unknown>) => {
    onPatch(id, body);
    /* Optimistic enough: the list reloads on its own, and re-reading here keeps
     * the panel honest about what was actually stored — a gated field the server
     * refused must not stay on screen as though it had been kept. */
    void load();
  };

  const e = detail?.entity;
  const nests = e ? NESTING_KINDS.includes(e.kind) : false;
  const parents = e ? all.filter(x => x.kind === e.kind && x.id !== e.id) : [];

  const byProject = new Map<string, Usage[]>();
  (detail?.usage || []).forEach(r => {
    byProject.set(r.projectId, [...(byProject.get(r.projectId) || []), r]);
  });

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={ev => ev.stopPropagation()}
        style={{ maxHeight: '88vh', overflowY: 'auto', width: 620, maxWidth: '94vw' }}>
        <div className="modal-head">
          <h3>{e?.name ?? 'Loading…'}</h3>
          <button className="iconbtn" onClick={onClose}><Icon name="chevron" size={15} /></button>
        </div>

        {error && <div className="err">{error}</div>}
        {!e ? null : (
          <>
            <div className="hint" style={{ marginBottom: 12 }}>
              {ENTITY_LABELS[e.kind]} · {LAYER_LABELS[ENTITY_LAYER[e.kind]]} layer
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label className="field"><span>Name</span>
                <input className="input" defaultValue={e.name} key={`n${e.name}`}
                  onBlur={ev => ev.target.value.trim() !== e.name
                    && patch({ name: ev.target.value })} />
              </label>
              <label className="field"><span>Code</span>
                <input className="input" defaultValue={e.code || ''} placeholder="APP-0142"
                  key={`c${e.code || ''}`}
                  onBlur={ev => ev.target.value.trim() !== (e.code || '')
                    && patch({ code: ev.target.value })} />
                <div className="hint">The reference your organisation already uses. An import matches on it.</div>
              </label>

              {nests && (
                <label className="field"><span>Inside</span>
                  <select className="select" value={e.parent || ''}
                    onChange={ev => patch({ parent: ev.target.value || null })}>
                    <option value="">top level</option>
                    {parents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              )}

              {STATUS_KINDS.includes(e.kind) && (
                <Choice label="Decision" value={e.status} options={STANDARD_STATUSES}
                  labels={STATUS_LABELS} blurbs={STATUS_BLURBS}
                  empty="No decision recorded."
                  onPick={v => patch({ status: v as StandardStatus | null })} />
              )}

              {LIFECYCLE_KINDS.includes(e.kind) && (
                <Choice label="Lifecycle" value={e.lifecycle} options={LIFECYCLES}
                  labels={LIFECYCLE_LABELS} blurbs={LIFECYCLE_BLURBS}
                  empty="Not stated. Reads as live, but nothing can report on it."
                  onPick={v => patch({ lifecycle: v as EntityLifecycle | null })} />
              )}

              {CRITICALITY_KINDS.includes(e.kind) && (
                <Choice label="Criticality" value={e.criticality} options={CRITICALITIES}
                  labels={CRITICALITY_LABELS} blurbs={CRITICALITY_BLURBS}
                  empty="Not stated."
                  onPick={v => patch({ criticality: v as Criticality | null })} />
              )}

              {LIFECYCLE_KINDS.includes(e.kind) && (
                <div className="field"><span>In service</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" type="date" defaultValue={e.startsOn || ''}
                      key={`s${e.startsOn || ''}`}
                      onBlur={ev => ev.target.value !== (e.startsOn || '')
                        && patch({ startsOn: ev.target.value || null })} />
                    <input className="input" type="date" defaultValue={e.endsOn || ''}
                      key={`e${e.endsOn || ''}`}
                      onBlur={ev => ev.target.value !== (e.endsOn || '')
                        && patch({ endsOn: ev.target.value || null })} />
                  </div>
                  <div className="hint">From, and until. What the lifecycle says, in dates.</div>
                </div>
              )}

              <label className="field"><span>Description</span>
                <textarea className="textarea" defaultValue={e.description || ''}
                  key={`d${e.description || ''}`}
                  onBlur={ev => ev.target.value.trim() !== (e.description || '')
                    && patch({ description: ev.target.value })} />
              </label>

              <Provenance entity={e} onPatch={patch} />
              <Props entity={e} onPatch={patch} />
            </div>

            <Relations detail={detail!} all={all}
              onChanged={async () => { await load(); await onChanged(); }} />

            <h4 style={{ marginTop: 18 }}>Cited by</h4>
            {byProject.size === 0 ? (
              <div className="hint">No project cites it yet.</div>
            ) : (
              <div className="cardlist">
                {[...byProject.entries()].map(([pid, rows]) => (
                  <a key={pid} className="ccard" href={`/projects/${pid}`} style={{ textDecoration: 'none' }}>
                    <b>{rows[0].projectName}</b>
                    <div className="sub">{rows.map(r => `${r.componentId} (${r.role})`).join(' · ')}</div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** One closed vocabulary, as a row of radios that toggle off.
 *
 *  The three of them behave identically, so they are one component: the moment
 *  "Decision" and "Lifecycle" drifted apart visually, somebody would read one of
 *  them as the other. */
function Choice<T extends string>({ label, value, options, labels, blurbs, empty, onPick }: {
  label: string;
  value: T | undefined;
  options: T[];
  labels: Record<T, string>;
  blurbs: Record<T, string>;
  empty: string;
  onPick: (v: T | null) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="radio-row">
        {options.map(o => (
          <button key={o} className={`radio${value === o ? ' on' : ''}`} title={blurbs[o]}
            onClick={() => onPick(value === o ? null : o)}>
            <i /> {labels[o]}
          </button>
        ))}
      </div>
      <div className="hint">{value ? blurbs[value] : empty}</div>
    </div>
  );
}

/** Where the row came from, when it did not come from here. */
function Provenance({ entity, onPatch }: {
  entity: Entity; onPatch: (body: Record<string, unknown>) => void;
}) {
  return (
    <div className="field">
      <span>Provenance</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" placeholder="Source — cmdb, servicenow"
          defaultValue={entity.source || ''} key={`src${entity.source || ''}`}
          onBlur={e => e.target.value.trim() !== (entity.source || '')
            && onPatch({ source: e.target.value || null })} />
        <input className="input" placeholder="Its id over there"
          defaultValue={entity.externalId || ''} key={`ext${entity.externalId || ''}`}
          onBlur={e => e.target.value.trim() !== (entity.externalId || '')
            && onPatch({ externalId: e.target.value || null })} />
      </div>
      <div className="hint">
        Together these are what makes a feed run twice without duplicating anything.
        Leave them empty for a row that is maintained here.
      </div>
    </div>
  );
}

/** Whatever this organisation tracks that the model does not.
 *
 *  Replaced whole rather than patched key by key: "the attributes are now these"
 *  is the only reading everyone agrees on. An empty value removes the key, which
 *  is how a row is deleted without a second button. */
function Props({ entity, onPatch }: {
  entity: Entity; onPatch: (body: Record<string, unknown>) => void;
}) {
  const current = entity.props || {};
  const [draft, setDraft] = useState<[string, string][]>(Object.entries(current));

  useEffect(() => { setDraft(Object.entries(entity.props || {})); }, [entity.props]);

  const commit = (next: [string, string][]) => {
    setDraft(next);
    const out: Record<string, string> = {};
    next.forEach(([k, v]) => { if (k.trim() && v.trim()) out[k.trim()] = v.trim(); });
    onPatch({ props: out });
  };

  const setAt = (i: number, at: 0 | 1, value: string) =>
    setDraft(draft.map((pair, j) =>
      j === i ? (at === 0 ? [value, pair[1]] : [pair[0], value]) : pair));

  return (
    <div className="field">
      <span>Attributes</span>
      {draft.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input className="input" placeholder="Key" value={k}
            onChange={e => setAt(i, 0, e.target.value)}
            onBlur={() => commit(draft)} style={{ flex: 1 }} />
          <input className="input" placeholder="Value" value={v}
            onChange={e => setAt(i, 1, e.target.value)}
            onBlur={() => commit(draft)} style={{ flex: 2 }} />
          <button className="iconbtn" title="Remove"
            onClick={() => commit(draft.filter((_, j) => j !== i))}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => setDraft([...draft, ['', '']])}>
        <Icon name="plus" size={13} />Add attribute
      </button>
      <div className="hint">
        A cost centre, a hosting country, a DPIA reference. If one of these turns out
        to be asked about across projects, it has earned a column of its own.
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- relations */

/** The neighbourhood: what this entity is joined to, and a way to join it.
 *
 *  The relationship list offers only what `RELATION_ENDS` would accept from this
 *  kind, and the target list only what it would accept at the other end. Showing
 *  every combination and refusing most of them on submit is how a metamodel
 *  teaches people that the tool is fussy rather than that the model has a shape.
 */
function Relations({ detail, all, onChanged }: {
  detail: Detail;
  all: EntitySummary[];
  onChanged: () => Promise<void>;
}) {
  const me = detail.entity;
  const [kind, setKind] = useState<RelationKind | ''>('');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const offered = useMemo(() => relationsFrom(me.kind), [me.kind]);
  const targets = useMemo(() => {
    if (!kind) return [];
    const want = RELATION_ENDS[kind].to;
    return all.filter(x => x.id !== me.id && want.includes(x.kind));
  }, [kind, all, me.id]);

  useEffect(() => { setTarget(''); }, [kind]);

  const submit = async () => {
    if (!kind || !target) return;
    setBusy(true); setError(null);
    try {
      await api.json('/api/ea/relations', {
        method: 'POST',
        body: JSON.stringify({ kind, from: me.id, to: target, note: note.trim() || undefined })
      });
      setKind(''); setTarget(''); setNote('');
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add it.');
    } finally { setBusy(false); }
  };

  const drop = async (id: string) => {
    setBusy(true); setError(null);
    try {
      await api.json(`/api/ea/relations?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove it.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <h4 style={{ marginTop: 18 }}>Related</h4>
      <div className="hint" style={{ marginBottom: 8 }}>
        What somebody asserted, as opposed to what the diagrams happen to show. Both
        count in the analysis; only this one survives a diagram being redrawn.
      </div>

      {detail.relations.length === 0 ? (
        <div className="hint">Nothing joined to it yet.</div>
      ) : (
        <div className="cardlist">
          {detail.relations.map(r => {
            const outgoing = r.from === me.id;
            const other = outgoing
              ? { name: r.toName, kind: r.toKind }
              : { name: r.fromName, kind: r.fromKind };
            return (
              <div className="ccard" key={r.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1 }}>
                  <b>{outgoing ? RELATION_LABELS[r.kind] : `is ${RELATION_LABELS[r.kind]} by`} {other.name}</b>
                  <div className="sub">
                    {ENTITY_LABELS[other.kind]}{r.note ? ` · ${r.note}` : ''}
                  </div>
                </span>
                <button className="iconbtn" disabled={busy} title="Remove"
                  onClick={() => drop(r.id)}><Icon name="trash" size={13} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <select className="select" value={kind} style={{ flex: '1 1 160px' }}
          onChange={e => setKind(e.target.value as RelationKind | '')}>
          <option value="">Add a relationship…</option>
          {offered.map(r => (
            <option key={r} value={r} title={RELATION_BLURBS[r]}>{RELATION_LABELS[r]}</option>
          ))}
        </select>
        <select className="select" value={target} disabled={!kind} style={{ flex: '2 1 220px' }}
          onChange={e => setTarget(e.target.value)}>
          <option value="">{kind ? 'what…' : '—'}</option>
          {targets.map(t => (
            <option key={t.id} value={t.id}>
              {ENTITY_LABELS[t.kind]} · {t.name}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Note (optional)" value={note}
          style={{ flex: '1 1 160px' }} onChange={e => setNote(e.target.value)} />
        <button className="btn primary" disabled={busy || !kind || !target} onClick={submit}>Add</button>
      </div>
      {kind && targets.length === 0 && (
        <div className="hint" style={{ marginTop: 6 }}>
          Nothing of the right kind exists yet. {RELATION_LABELS[kind]} points at{' '}
          {RELATION_ENDS[kind].to.map(k => ENTITY_PLURALS[k].toLowerCase()).join(', ')}.
        </div>
      )}
      {error && <div className="err" style={{ marginTop: 8 }}>{error}</div>}
    </>
  );
}

/* --------------------------------------------------------------- dialogs */

interface Report {
  created: number; updated: number; skipped: number;
  rows: { line: number; outcome: string; reason?: string; name?: string }[];
  ignoredColumns: string[];
  shape: 'entities' | 'relations';
  preview?: boolean;
}

/** Paste a file, see what it would do, then decide.
 *
 *  The preview is the import rolled back rather than a prediction of it, so the
 *  numbers on this screen are the numbers you get. Two shapes of file, told
 *  apart by their header — nothing to choose here, which is why there is no
 *  selector.
 */
function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (preview: boolean) => {
    setBusy(true); setError(null);
    try {
      const out = await api.json<Report>('/api/ea/import', {
        method: 'POST', body: JSON.stringify({ text, preview })
      });
      if (preview) setReport(out);
      else { setReport(out); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import.');
    } finally { setBusy(false); }
  };

  const refusals = (report?.rows || []).filter(r => r.reason);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ maxHeight: '88vh', overflowY: 'auto', width: 620, maxWidth: '94vw' }}>
        <div className="modal-head">
          <h3>Import a spreadsheet</h3>
          <button className="iconbtn" onClick={onClose}><Icon name="chevron" size={15} /></button>
        </div>

        {!report || report.preview ? (
          <>
            <div className="hint" style={{ marginBottom: 8 }}>
              Two files, told apart by their header. Things:{' '}
              <span className="mono">kind,name,code,parent,status,lifecycle,criticality,…</span>.
              What joins them: <span className="mono">relation,from,to,note</span>.
              A row that already exists — matched on its source id, then its code, then
              its exact name within the same kind — is updated rather than duplicated.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <a className="btn" href="/api/ea/import">
                <Icon name="download" size={14} />Things template
              </a>
              <a className="btn" href="/api/ea/import?shape=relations">
                <Icon name="download" size={14} />Relations template
              </a>
            </div>
            <textarea className="textarea" rows={10} value={text}
              placeholder="Paste the file, or pick it below"
              onChange={e => { setText(e.target.value); setReport(null); }} />
            <input type="file" accept=".csv,text/csv" style={{ marginTop: 8 }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (file) { setText(await file.text()); setReport(null); }
              }} />
            {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}

            {report?.preview && (
              <div style={{ marginTop: 12 }}>
                <div className="hint">
                  <b>Nothing written yet.</b> This file would create {report.created},
                  update {report.updated} and refuse {report.skipped}
                  {report.shape === 'relations' ? ' relationships' : ' rows'}.
                </div>
                {report.ignoredColumns.length > 0 && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    Columns this importer does not read: {report.ignoredColumns.join(', ')}.
                  </div>
                )}
                {refusals.length > 0 && (
                  <div className="cardlist" style={{ marginTop: 10 }}>
                    {refusals.map(r => (
                      <div className="ccard" key={r.line}>
                        <b>Line {r.line}{r.name ? ` — ${r.name}` : ''}</b>
                        <div className="sub">{r.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn" disabled={busy || !text.trim()} onClick={() => send(true)}
                style={{ flex: 1, justifyContent: 'center' }}>
                {busy ? 'Reading…' : 'Preview'}
              </button>
              <button className="btn primary" disabled={busy || !text.trim()}
                onClick={() => send(false)} style={{ flex: 1, justifyContent: 'center' }}>
                Import
              </button>
            </div>
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
            {refusals.length > 0 && (
              <div className="cardlist" style={{ marginTop: 10 }}>
                {refusals.map(r => (
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

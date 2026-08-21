'use client';

/* Form primitives shared by the content editors. Nothing here knows about the
 * architecture document — they take a value and hand back the next one. */

import { useState, type ReactNode } from 'react';
import { Icon, ICONS } from '../Icon';
import { ICON_KEYS } from '@/lib/defaults';
import type { Architecture } from '@/lib/types';

export const RICH_HINT = 'Inline <b>, <i>, <code> and <span class="mono"> render as markup.';

/* ------------------------------------------------------------------ inputs */

export function Text({ label, value, onChange, onBlur, placeholder, hint, mono }: {
  label?: string; value: string; onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string; hint?: string; mono?: boolean;
}) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <input className="input" value={value} placeholder={placeholder}
        style={mono ? { fontFamily: 'ui-monospace, monospace', fontSize: 12 } : undefined}
        onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}

export function Area({ label, value, onChange, onBlur, placeholder, hint, minHeight }: {
  label?: string; value: string; onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string; hint?: string; minHeight?: number;
}) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <textarea className="textarea" value={value} placeholder={placeholder}
        style={minHeight ? { minHeight } : undefined}
        onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}

export function Choice({ label, value, onChange, options, hint }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; hint?: string;
}) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <select className="select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}

/** Scope picker. Scopes carry the accent colour a card or pole is painted with. */
export function ScopePicker({ doc, value, onChange, label = 'Scope' }: {
  doc: Architecture; value: string | undefined; onChange: (v: string) => void; label?: string;
}) {
  const current = doc.groups.find(g => g.id === value) || doc.groups[0];
  if (!doc.groups.length) {
    return (
      <div className="field">
        <span>{label}</span>
        <div className="hint">No scopes yet — place a brick or add a scope in the palette.</div>
      </div>
    );
  }
  return (
    <div className="field">
      <span>{label}</span>
      <div className="scopepick">
        <i style={{ background: current?.color || 'var(--brand)' }} />
        <select className="select" value={value ?? ''} onChange={e => onChange(e.target.value)}>
          {!value && <option value="">{current ? `${current.name} (default)` : '—'}</option>}
          {doc.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
    </div>
  );
}

export function IconPicker({ value, onChange, label = 'Icon' }: {
  value: string | undefined; onChange: (v: string) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="field">
      <span>{label}</span>
      <button className="btn sm" style={{ width: '100%', justifyContent: 'flex-start' }}
        onClick={() => setOpen(o => !o)}>
        <Icon name={value || 'box'} size={14} />{value || 'box'}
      </button>
      {open && (
        <div className="iconpick" style={{ marginTop: 6 }}>
          {ICON_KEYS.map(k => (
            <button key={k} title={k} aria-pressed={value === k}
              onClick={() => { onChange(k); setOpen(false); }}>
              <span dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>` }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A list of free-text lines — bullets, responsibilities, paragraphs. */
export function StringList({ label, items, onChange, placeholder, hint, addLabel = 'Add' }: {
  label: string; items: string[]; onChange: (v: string[]) => void;
  placeholder?: string; hint?: string; addLabel?: string;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="listedit">
        {items.map((it, i) => (
          <div className="row" key={i}>
            <textarea className="textarea" style={{ minHeight: 34 }} value={it} placeholder={placeholder}
              onChange={e => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="iconbtn" title="Remove"
              onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => onChange([...items, ''])}>
        <Icon name="plus" size={13} />{addLabel}
      </button>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- grid */

/** A fixed-width grid of cells — the body of a table or a key/value list. */
export function CellGrid({ label, headers, rows, onChange, hint, widths }: {
  label?: string; headers: string[]; rows: string[][];
  onChange: (v: string[][]) => void; hint?: string; widths?: string[];
}) {
  const cols = headers.length;
  const setCell = (r: number, c: number, v: string) =>
    onChange(rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)));

  return (
    <div className="field">
      {label && <span>{label}</span>}
      <div className="cellgrid" style={{ gridTemplateColumns: `${(widths || headers.map(() => '1fr')).join(' ')} 28px` }}>
        {headers.map((h, i) => <div className="gh" key={`h${i}`}>{h}</div>)}
        <div className="gh" />
        {rows.map((row, r) => (
          <GridRow key={r} row={row} cols={cols} onCell={(c, v) => setCell(r, c, v)}
            onRemove={() => onChange(rows.filter((_, i) => i !== r))} />
        ))}
      </div>
      <button className="btn sm" style={{ marginTop: 6 }}
        onClick={() => onChange([...rows, Array.from({ length: cols }, () => '')])}>
        <Icon name="plus" size={13} />Add row
      </button>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function GridRow({ row, cols, onCell, onRemove }: {
  row: string[]; cols: number; onCell: (c: number, v: string) => void; onRemove: () => void;
}) {
  return (
    <>
      {Array.from({ length: cols }, (_, c) => (
        <textarea key={c} className="textarea" style={{ minHeight: 34 }} value={row[c] ?? ''}
          onChange={e => onCell(c, e.target.value)} />
      ))}
      <button className="iconbtn" title="Remove row" onClick={onRemove}><Icon name="trash" size={14} /></button>
    </>
  );
}

/* --------------------------------------------------------------- card list */

/** An ordered list of records: add, reorder, delete, and edit one at a time. */
export function CardList<T>({ items, onChange, blank, summary, render, addLabel, empty, badge, duplicate }: {
  items: T[];
  onChange: (next: T[]) => void;
  blank: () => T;
  summary: (item: T, i: number) => string;
  render: (item: T, set: (fn: (draft: T) => void) => void, i: number) => ReactNode;
  addLabel: string;
  empty?: string;
  badge?: (item: T, i: number) => ReactNode;
  /* Opt-in rather than automatic: a blind `structuredClone` is wrong for any
   * record carrying an id, and only the caller knows the ids already taken. */
  duplicate?: (item: T) => T;
}) {
  const [open, setOpen] = useState<number | null>(null);

  const set = (i: number) => (fn: (draft: T) => void) =>
    onChange(items.map((it, j) => {
      if (j !== i) return it;
      const draft = structuredClone(it);
      fn(draft);
      return draft;
    }));

  const move = (i: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
    setOpen(o => (o === i ? to : o === to ? i : o));
  };

  const remove = (i: number) => {
    onChange(items.filter((_, j) => j !== i));
    setOpen(o => (o === null ? null : o === i ? null : o > i ? o - 1 : o));
  };

  /** The copy lands right below its original, open, ready to be renamed. */
  const clone = (i: number) => {
    const next = [...items];
    next.splice(i + 1, 0, duplicate!(items[i]));
    onChange(next);
    setOpen(i + 1);
  };

  return (
    <div className="cardlist">
      {items.length === 0 && empty && <div className="cardlist-empty">{empty}</div>}

      {items.map((item, i) => (
        <div className={`elist${open === i ? ' open' : ''}`} key={i}>
          <div className="elist-head">
            <button className="iconbtn twist" onClick={() => setOpen(o => (o === i ? null : i))}
              aria-expanded={open === i} title={open === i ? 'Collapse' : 'Expand'}>
              <Icon name="chevron" size={14} />
            </button>
            <button className="elist-name" onClick={() => setOpen(o => (o === i ? null : i))}>
              {summary(item, i) || <em>Untitled</em>}
            </button>
            {badge?.(item, i)}
            <button className="iconbtn" title="Move up" disabled={i === 0}
              onClick={() => move(i, i - 1)}>
              <Icon name="chevron" size={13} style={{ transform: 'rotate(-90deg)' }} />
            </button>
            <button className="iconbtn" title="Move down" disabled={i === items.length - 1}
              onClick={() => move(i, i + 1)}>
              <Icon name="chevron" size={13} style={{ transform: 'rotate(90deg)' }} />
            </button>
            {duplicate && (
              <button className="iconbtn" title="Duplicate" onClick={() => clone(i)}>
                <Icon name="copy" size={13} />
              </button>
            )}
            <button className="iconbtn danger" title="Remove" onClick={() => remove(i)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
          {open === i && <div className="elist-body">{render(item, set(i), i)}</div>}
        </div>
      ))}

      <button className="btn sm" style={{ marginTop: 8 }}
        onClick={() => { onChange([...items, blank()]); setOpen(items.length); }}>
        <Icon name="plus" size={13} />{addLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ layout */

export function Panel({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="cpanel">
      <div className="cpanel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="cpanel-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Group({ title, hint, children, cols }: {
  title?: string; hint?: string; children: ReactNode; cols?: number;
}) {
  return (
    <section className="cgroup">
      {title && <div className="sect-label">{title}</div>}
      {hint && <div className="hint" style={{ marginBottom: 8 }}>{hint}</div>}
      <div style={cols ? { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 } : undefined}>
        {children}
      </div>
    </section>
  );
}

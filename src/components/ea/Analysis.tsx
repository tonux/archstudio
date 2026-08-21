'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icon';
import { Lockup } from '../Brand';
import { api } from '@/lib/api';
import { ENTITY_LABELS, type EntityKind, type EntitySummary, type StandardStatus } from '@/lib/ea/types';

/* The five questions, asked.
 *
 * Every answer is a table, and that is not a UI shortcut — it is the shape a
 * question has to have in order to *leave*. A computed section in the design
 * document runs the same function and freezes the same table, so what is on
 * screen here and what a committee reads six months from now are the same
 * answer, differing only in the date at the bottom.
 */

interface QueryInfo {
  name: string; label: string; blurb: string; subject: EntityKind | null;
}
interface Leaving { id: string; name: string; status: StandardStatus }
interface Result {
  title: string; columns: string[]; rows: string[][]; empty: string; note?: string; ms: number;
}

export default function Analysis({ entities }: { entities: EntitySummary[] }) {
  const [queries, setQueries] = useState<QueryInfo[]>([]);
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  const [name, setName] = useState<string>('coverage');
  const [subject, setSubject] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.json<{ queries: QueryInfo[]; leaving: Leaving[] }>('/api/ea/query/index')
      .then(r => { setQueries(r.queries); setLeaving(r.leaving); })
      .catch(e => setError(e.message));
  }, []);

  const info = queries.find(q => q.name === name);
  const needs = info?.subject ?? null;
  const options = needs ? entities.filter(e => e.kind === needs) : [];

  /* Runs on its own once the question is answerable, rather than behind a
     button: the point of the screen is to make these cheap to ask. */
  useEffect(() => {
    if (!info) return;
    if (needs && !subject) { setResult(null); return; }
    let alive = true;
    setBusy(true); setError(null);
    const url = `/api/ea/query/${name}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
    api.json<Result>(url)
      .then(r => { if (alive) setResult(r); })
      .catch(e => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [name, subject, needs, info]);

  const pick = (q: string) => { setName(q); setSubject(''); setResult(null); };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Lockup />
        <span style={{ flex: 1 }} />
        <Link href="/ea" className="footbtn" style={{ textDecoration: 'none' }}>
          <Icon name="layers" size={15} />Referential
        </Link>
        <Link href="/" className="footbtn" style={{ textDecoration: 'none' }}>
          <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} />Workspace
        </Link>
      </header>

      <h1 style={{ marginBottom: 4 }}>Analysis</h1>
      <p className="hint" style={{ marginBottom: 18 }}>
        Questions across every project at once. Each of these can also be dropped into
        a design document as a section, where it is answered and frozen at export.
      </p>

      {/* The shortcut that makes this screen worth opening: standards somebody
          already decided to leave, with nothing done about it yet. */}
      {leaving.length > 0 && (
        <div className="ccard" style={{ marginBottom: 14 }}>
          <b>On the way out</b>
          <div className="chiprow" style={{ marginTop: 6 }}>
            {leaving.map(s => (
              <button key={s.id} className="chip"
                aria-pressed={name === 'standard' && subject === s.id}
                onClick={() => { setName('standard'); setSubject(s.id); }}>
                {s.name}<span className="count">{s.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chiprow" style={{ marginBottom: 10 }}>
        {queries.map(q => (
          <button key={q.name} className="chip" aria-pressed={name === q.name}
            title={q.blurb} onClick={() => pick(q.name)}>{q.label}</button>
        ))}
      </div>
      {info && <div className="hint" style={{ marginBottom: 12 }}>{info.blurb}</div>}

      {needs && (
        <label className="field" style={{ marginBottom: 12 }}>
          <span>{ENTITY_LABELS[needs]}</span>
          <select className="select" value={subject} onChange={e => setSubject(e.target.value)}>
            <option value="">choose one</option>
            {options.map(e => (
              <option key={e.id} value={e.id}>{e.name}{e.code ? ` · ${e.code}` : ''}</option>
            ))}
          </select>
          {options.length === 0 && (
            <div className="hint">
              Nothing of that kind in the referential yet.{' '}
              <Link href="/ea">Add some</Link>.
            </div>
          )}
        </label>
      )}

      {error && <div className="err">{error}</div>}
      {busy && <div className="hint">Reading every project…</div>}

      {result && !busy && (
        <>
          <h2 style={{ marginBottom: 6 }}>{result.title}</h2>
          {result.rows.length === 0 ? (
            <div className="cardlist-empty">{result.empty}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="hint" style={{ marginTop: 8 }}>
            {result.note ? `${result.note} ` : ''}
            {result.rows.length} row{result.rows.length === 1 ? '' : 's'} · {result.ms} ms
          </div>
        </>
      )}
    </div>
  );
}

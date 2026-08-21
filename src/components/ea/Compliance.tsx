'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icon';
import { Lockup } from '../Brand';
import { api } from '@/lib/api';
import type { Finding, Rule } from '@/lib/ea/compliance';

/* The compliance dashboard.
 *
 * Two levels, and the order matters: the rules first with a count against each,
 * then the findings. Someone opening this wants to know *whether* anything is
 * wrong before they read two hundred rows — and a rule with a zero against it
 * is as informative as one with forty.
 *
 * Every row names who can act on it. A report that lists violations and no
 * owners is a report that gets filed.
 */

interface Payload {
  rules: Rule[];
  summary: { rule: string; count: number }[];
  findings: Finding[];
}

export default function Compliance() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);

  useEffect(() => {
    api.json<Payload>('/api/ea/compliance').then(setData).catch(e => setError(e.message));
  }, []);

  const count = (id: string) => data?.summary.find(s => s.rule === id)?.count ?? 0;
  const shown = (data?.findings ?? []).filter(f => !only || f.rule === only);
  const total = data?.findings.length ?? 0;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Lockup />
        <span style={{ flex: 1 }} />
        <Link href="/analysis" className="footbtn" style={{ textDecoration: 'none' }}>
          <Icon name="chart" size={15} />Analysis
        </Link>
        <Link href="/" className="footbtn" style={{ textDecoration: 'none' }}>
          <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} />Workspace
        </Link>
      </header>

      <h1 style={{ marginBottom: 4 }}>Compliance</h1>
      <p className="hint" style={{ marginBottom: 18 }}>
        Six rules, checked against the referential and every drawing. A finding is
        not automatically a mistake — a new application has no owner yet, and that
        is fine. This makes it visible; deciding is still someone&rsquo;s job.
      </p>

      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="hint">Reading every project…</div>}

      {data && (
        <>
          <div className="cardlist" style={{ marginBottom: 16 }}>
            {data.rules.map(r => {
              const n = count(r.id);
              return (
                <button key={r.id} className="ccard"
                  aria-pressed={only === r.id}
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => setOnly(o => (o === r.id ? null : r.id))}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <b style={{ flex: 1 }}>{r.title}</b>
                    <span className="count">{n}</span>
                  </div>
                  <div className="sub">{r.says}</div>
                </button>
              );
            })}
          </div>

          {total === 0 ? (
            <div className="cardlist-empty">
              Nothing to report. Either everything holds, or there is nothing to
              check yet — the referential is where that starts.
            </div>
          ) : (
            <>
              <div className="sect-label">
                {only ? data.rules.find(r => r.id === only)?.title : 'Every finding'}
                <span className="spacer" />
                <span className="count">{shown.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr><th>Subject</th><th>Finding</th><th>Who can act</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((f, i) => (
                      <tr key={i}>
                        <td>{f.subject}</td>
                        <td>{f.detail}</td>
                        <td>{f.owner}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

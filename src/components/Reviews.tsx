'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { Lockup } from './Brand';
import { DiffList } from './DiffList';
import { api } from '@/lib/api';
import { summarise, type Diff } from '@/lib/diff';
import type { ProposalRecord, ReviewRecord } from '@/lib/proposals';

/* Proposed changes, waiting for an architect.
 *
 * The whole screen is the diff, and the diff is the same component the Versions
 * panel uses. That is not a saving so much as a correctness property: a review
 * and a version comparison are the same question asked of the same two
 * documents, and two renderings of it would be one rendering too many.
 */

interface Detail {
  proposal: ProposalRecord;
  diff: Diff | null;
  /** How far the project has moved since the proposal was opened. */
  drift: number;
  reviews: ReviewRecord[];
}

export default function Reviews({ initial }: { initial: ProposalRecord[] }) {
  const [list, setList] = useState(initial);
  const [picked, setPicked] = useState<string | null>(initial[0]?.id ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const reload = () =>
    api.json<{ proposals: ProposalRecord[] }>('/api/proposals')
      .then(r => { setList(r.proposals); setPicked(p => r.proposals.some(x => x.id === p) ? p : r.proposals[0]?.id ?? null); });

  useEffect(() => {
    if (!picked) { setDetail(null); return; }
    let alive = true;
    setDetail(null);
    api.json<Detail>(`/api/proposals?id=${encodeURIComponent(picked)}`)
      .then(d => { if (alive) setDetail(d); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [picked]);

  const verdict = async (v: 'approve' | 'reject') => {
    if (!picked) return;
    setBusy(true); setError(null);
    try {
      await api.json('/api/proposals', {
        method: 'PATCH', body: JSON.stringify({ id: picked, verdict: v, note })
      });
      setNote('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Lockup />
        <span style={{ flex: 1 }} />
        <Link href="/" className="footbtn" style={{ textDecoration: 'none' }}>
          <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} />Workspace
        </Link>
      </header>

      <h1 style={{ marginBottom: 4 }}>Reviews</h1>
      <p className="hint" style={{ marginBottom: 18 }}>
        Changes somebody proposed and cannot publish themselves. Approving writes
        the proposal into the project and leaves a frozen version signed by you.
      </p>

      {list.length === 0 && (
        <div className="cardlist-empty">Nothing waiting.</div>
      )}

      {list.length > 0 && (
        <div className="chiprow" style={{ marginBottom: 12 }}>
          {list.map(p => (
            <button key={p.id} className="chip" aria-pressed={picked === p.id}
              onClick={() => setPicked(p.id)}>
              {p.projectName}
              <span className="count">{p.authorName ?? 'unsigned'}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="err">{error}</div>}

      {detail && (
        <>
          <div className="ccard" style={{ marginBottom: 12 }}>
            <b>{detail.proposal.title || 'Untitled proposal'}</b>
            <div className="sub">
              {detail.proposal.projectName} · by {detail.proposal.authorName ?? 'someone unsigned'}
              {detail.diff && ` · ${summarise(detail.diff) ?? 'no changes'}`}
            </div>
            {/* A proposal opened against a project that has since moved. Approving
                it would overwrite whatever happened in between, so the reviewer
                is told before they click and not after. */}
            {detail.drift > 0 && (
              <div className="hint" style={{ marginTop: 6 }}>
                ⚠ The project has changed in {detail.drift} way{detail.drift > 1 ? 's' : ''} since
                this was opened. Approving replaces it with the proposal as written.
              </div>
            )}
            <Link href={`/projects/${detail.proposal.projectId}`} className="footbtn"
              style={{ textDecoration: 'none', marginTop: 8, display: 'inline-flex' }}>
              <Icon name="layers" size={14} />Open the project
            </Link>
          </div>

          <DiffList diff={detail.diff}
            empty="This proposal changes nothing — the two documents match." />

          <div className="field" style={{ marginTop: 14 }}>
            <span>Note</span>
            <textarea className="textarea" value={note} rows={2}
              placeholder="Why you are approving, or what has to change first."
              onChange={e => setNote(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" disabled={busy} onClick={() => verdict('approve')}>
              Approve and publish
            </button>
            <button className="btn" disabled={busy} onClick={() => verdict('reject')}>
              Reject
            </button>
          </div>

          {detail.reviews.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="sect-label">Earlier verdicts</div>
              {detail.reviews.map((r, i) => (
                <div className="diffrow" key={i}>
                  <span className="what">{r.verdict} — {r.who ?? 'someone'}</span>
                  {r.note && <em>{r.note}</em>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

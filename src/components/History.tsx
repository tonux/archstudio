'use client';

/* The versions panel.
 *
 * It was a history: a rolling log of snapshots where selecting a row never
 * showed the row, it showed what changed since it. That answers the question you
 * ask after a misdrop, and it stays answered — the snapshots are still here,
 * still restorable, folded away at the bottom.
 *
 * What it could not answer is the question you ask of a drawing that has been
 * evolving for months: *show me the version we sent in September*. So the named
 * rows are lifted out into a series with the live document at the top of it, and
 * a version is now something you can open, export and print rather than only
 * something to subtract from.
 *
 * Two things kept from the old panel because they were right. The comparison is
 * against the document held in the editor, not what is on disk — unsaved edits
 * are part of "now", and pretending otherwise would make the panel lie for
 * 700 ms. And the list still does not carry the documents: thirty snapshots are
 * thirty full architectures, fetched one at a time when a row is picked.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useAsk } from './Ask';
import { diffArchitecture, summarise } from '@/lib/diff';
import { DiffList } from './DiffList';
import { nextVersionNumber, snapshotsOf, versionsOf } from '@/lib/versions';
import type { Architecture, RevisionRecord } from '@/lib/types';

/** SQLite stores `YYYY-MM-DD HH:MM:SS` in UTC, with no zone marker on it. */
const parseStamp = (s: string) => new Date(s.replace(' ', 'T') + 'Z');

function since(iso: string): string {
  const ms = Date.now() - parseStamp(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const stamp = (iso: string) =>
  parseStamp(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });

/** The live document, given the same shape as a row so the list can hold both
 *  without every renderer asking which it has. `id` is the sentinel the two
 *  fetches below check for. */
const CURRENT = '@current';

export default function History({ projectId, doc, dirty, onClose, onRestore, onView, onFroze }: {
  projectId: string;
  doc: Architecture;
  dirty: boolean;
  onClose: () => void;
  onRestore: (data: Architecture) => void;
  /** Open a stored version in the Preview tab. */
  onView: (row: RevisionRecord) => void;
  /** A freeze wrote `meta.version` into the document — adopt it here so the
   *  canvas and the undo stack see the edit that just happened server-side. */
  onFroze: (data: Architecture) => void;
}) {
  const [list, setList] = useState<RevisionRecord[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  /** What `picked` is compared against. `CURRENT` is the live document. */
  const [against, setAgainst] = useState<string>(CURRENT);
  const [past, setPast] = useState<Architecture | null>(null);
  const [other, setOther] = useState<Architecture | null>(null);
  const [openSnaps, setOpenSnaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const ask = useAsk();
  const [error, setError] = useState('');

  const load = useCallback(async (select?: string) => {
    const rows: RevisionRecord[] = await fetch(`/api/projects/${projectId}/revisions`)
      .then(r => r.json());
    setList(rows);
    setPicked(p => select ?? (p && rows.some(r => r.id === p) ? p : rows[0]?.id ?? null));
  }, [projectId]);

  useEffect(() => { load().catch(() => setError('Could not read the versions.')); }, [load]);

  const fetchDoc = useCallback((id: string): Promise<Architecture | null> =>
    fetch(`/api/projects/${projectId}/revisions?revisionId=${encodeURIComponent(id)}`)
      .then(r => r.json()).then(r => r.data ?? null), [projectId]);

  useEffect(() => {
    if (!picked) { setPast(null); return; }
    let alive = true;
    setPast(null);
    fetchDoc(picked)
      .then(d => { if (alive) setPast(d); })
      .catch(() => { if (alive) setError('Could not read that version.'); });
    return () => { alive = false; };
  }, [fetchDoc, picked]);

  useEffect(() => {
    if (against === CURRENT) { setOther(null); return; }
    let alive = true;
    setOther(null);
    fetchDoc(against).then(d => { if (alive) setOther(d); }).catch(() => {});
    return () => { alive = false; };
  }, [fetchDoc, against]);

  const versions = useMemo(() => versionsOf(list ?? []), [list]);
  const snapshots = useMemo(() => snapshotsOf(list ?? []), [list]);
  const current = list?.find(r => r.id === picked) ?? null;
  const compared = against === CURRENT ? null : list?.find(r => r.id === against) ?? null;

  /* Always oldest → newest, whichever way round the two were picked. Reversing
   * them silently swaps every `+` for a `−`, which is the kind of wrong a reader
   * has no way to notice.
   *
   * Which is older comes from the list's own order, not from the timestamps.
   * `created_at` is `datetime('now')` at one-second granularity — three versions
   * frozen in the same minute can share a second, and comparing those strings
   * ties and falls whichever way the ternary happens to point. The store already
   * settled this with `created_at DESC, rowid DESC`, so the row further down the
   * list is the older one, full stop. */
  const [from, to, older] = useMemo(() => {
    const right = against === CURRENT ? doc : other;
    if (!past || !right || !current) return [null, null, null] as const;
    if (!compared) return [past, right, current] as const;

    const rows = list ?? [];
    const pickedIsOlder = rows.indexOf(current) > rows.indexOf(compared);
    return pickedIsOlder
      ? [past, right, current] as const
      : [right, past, compared] as const;
  }, [past, other, against, doc, compared, current, list]);

  const diff = useMemo(() => (from && to ? diffArchitecture(from, to) : null), [from, to]);

  /** The number to offer next: whatever the newest version carried, bumped. */
  const proposed = nextVersionNumber(versions[0]?.version ?? doc.meta.version);

  /* How far the live document has drifted from the newest version — the one
   * number that makes the Current row mean something. */
  const [drift, setDrift] = useState<number | null>(null);
  useEffect(() => {
    const newest = versionsOf(list ?? [])[0];
    if (!newest) { setDrift(null); return; }
    let alive = true;
    fetchDoc(newest.id)
      .then(d => { if (alive && d) setDrift(diffArchitecture(d, doc).total); })
      .catch(() => {});
    return () => { alive = false; };
  }, [fetchDoc, list, doc]);

  async function freeze() {
    const version = await ask.text({
      title: 'Freeze this version',
      body: 'The number is written into the document, so every export of this version prints it on the cover and in the viewer. A frozen version is never pruned.',
      label: 'Number', value: proposed, confirmLabel: 'Next'
    });
    if (version === null || !version.trim()) return;
    const label = await ask.text({
      title: `Freeze ${version.trim()}`,
      body: 'A title for what this version is — what it was sent for, or what it settled.',
      label: 'Title', value: '', placeholder: 'Sent to the client', allowEmpty: true
    });
    if (label === null) return;

    setBusy(true); setError('');
    try {
      const r: RevisionRecord = await fetch(`/api/projects/${projectId}/revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, label })
      }).then(x => x.json());
      /* The freeze edited the document server-side; bring that edit home. */
      onFroze({ ...doc, meta: { ...doc.meta, version: version.trim() } });
      await load(r.id);
    } catch { setError('Could not freeze this version.'); }
    setBusy(false);
  }

  async function rename(rev: RevisionRecord) {
    const label = await ask.text({
      title: rev.kind === 'version' ? 'Rename this version' : 'Make this a version',
      body: 'A named version is kept for good and shows in the series above. Clearing the name makes it an ordinary snapshot again, and it can then be pruned.',
      label: 'Title', value: rev.label ?? '', placeholder: 'Sent to the client',
      allowEmpty: true
    });
    if (label === null) return;
    setBusy(true);
    await fetch(`/api/projects/${projectId}/revisions`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionId: rev.id, label })
    }).catch(() => setError('Could not rename it.'));
    await load(rev.id);
    setBusy(false);
  }

  async function remove(rev: RevisionRecord) {
    const ok = await ask.confirm({
      title: `Delete the version from ${stamp(rev.createdAt)}?`,
      body: 'The document itself is untouched — only this snapshot of it goes, and it cannot be brought back.',
      danger: true
    });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/projects/${projectId}/revisions?revisionId=${encodeURIComponent(rev.id)}`,
      { method: 'DELETE' }).catch(() => setError('Could not delete it.'));
    setPicked(null);
    if (against === rev.id) setAgainst(CURRENT);
    await load();
    setBusy(false);
  }

  async function restore(rev: RevisionRecord) {
    const n = diff?.total ?? 0;
    const ok = await ask.confirm({
      title: `Restore the version from ${stamp(rev.createdAt)}?`,
      body: <>
        {n} change{n === 1 ? '' : 's'} made since then will be undone. The current version is kept
        in the history as <b>Before restore</b>, so this is reversible.
      </>,
      confirmLabel: 'Restore'
    });
    if (!ok) return;

    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionId: rev.id })
      });
      if (!res.ok) throw new Error();
      const project = await res.json();
      onRestore(project.data);
      onClose();
    } catch { setError('Could not restore that version.'); setBusy(false); }
  }

  const row = (r: RevisionRecord) => (
    <button key={r.id} className={`histrow${picked === r.id ? ' on' : ''}`}
      onClick={() => setPicked(r.id)}>
      <span className="when">{r.version ? <b className="vnum">{r.version}</b> : since(r.createdAt)}</span>
      {r.label && <b>{r.label}</b>}
      {/* The author only appears once there is one. An install with no
          authentication, and every row written before there was any, say
          nothing here rather than "unknown" — which would read as a gap in the
          record instead of a period when nobody was being asked. */}
      <span className="at">
        {stamp(r.createdAt)} · {r.componentCount} comp.{r.author ? ` · ${r.author}` : ''}
      </span>
    </button>
  );

  return (
    <>
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Versions</h2>
            <p className="lede">
              Freeze a version to keep it for good — it can be opened, exported and printed on its
              own. Under them are the automatic snapshots, one every five minutes while you edit.
            </p>
          </div>
          <button className="btn" onClick={freeze} disabled={busy}
            title="Keep the document as it stands, under a number and a title">
            <Icon name="flag" size={15} />Freeze this version
          </button>
        </div>

        {dirty && (
          <div className="warn">
            <Icon name="alert" size={15} />
            <span>You have edits that have not been saved yet. They count as “now” below, and
              restoring a version will discard them.</span>
          </div>
        )}
        {error && <div className="err">{error}</div>}

        {list === null ? (
          <div className="empty">Reading the versions…</div>
        ) : (
          <div className="hist">
            <div className="hist-list">
              {/* The live document, at the head of the series. Not selectable:
                  there is nothing to compare it against but itself, and nothing
                  to restore it to. */}
              <div className="histrow current">
                <span className="when"><i className="dot" />Current</span>
                {doc.meta.version && <b className="vnum">{doc.meta.version}</b>}
                <span className="at">
                  {doc.components.length} comp.
                  {drift !== null && ` · ${drift} change${drift === 1 ? '' : 's'} since ${versions[0]?.version || 'the last version'}`}
                </span>
              </div>

              {versions.map(row)}

              {versions.length === 0 && (
                <p className="muted" style={{ padding: '8px 10px' }}>
                  No frozen version yet. Freezing one is how this diagram keeps a past you can
                  go back and look at.
                </p>
              )}

              {snapshots.length > 0 && (
                <>
                  <button className="snapshead" onClick={() => setOpenSnaps(o => !o)}>
                    <Icon name="chevron" size={12}
                      style={{ transform: openSnaps ? 'rotate(90deg)' : 'none' }} />
                    Snapshots<span className="spacer" />
                    <span className="count">{snapshots.length}</span>
                  </button>
                  {openSnaps && snapshots.map(row)}
                </>
              )}
            </div>

            <div className="hist-pane">
              {!current ? (
                <div className="empty">Pick a version on the left.</div>
              ) : !from || !to ? (
                <div className="empty">Comparing…</div>
              ) : (
                <>
                  <div className="hist-paneh">
                    <div>
                      {/* Named after the *older* of the two, because that is
                          what "changed since" means — and the older one is not
                          always the row you clicked. */}
                      <b>Changed since {older?.version || since((older ?? current).createdAt)}</b>
                      <span>{summarise(diff!) ?? 'Nothing — the two documents match.'}</span>
                    </div>
                    <div className="hist-acts">
                      {/* The comparison target. "Current" is the default because
                          it is the question asked nine times in ten; the rest is
                          what makes "between the September and October boards" a
                          question you can ask at all. */}
                      <select className="select sm" value={against}
                        onChange={e => setAgainst(e.target.value)} title="Compare against">
                        <option value={CURRENT}>vs Current</option>
                        {versions.filter(v => v.id !== picked).map(v => (
                          <option key={v.id} value={v.id}>
                            vs {v.version || stamp(v.createdAt)}{v.label ? ` — ${v.label}` : ''}
                          </option>
                        ))}
                      </select>
                      <button className="iconbtn" title="View this version" disabled={busy}
                        onClick={() => onView(current)}><Icon name="eye" size={15} /></button>
                      <button className="iconbtn"
                        title={current.kind === 'version' ? 'Rename this version' : 'Make this a version'}
                        disabled={busy}
                        onClick={() => rename(current)}><Icon name="flag" size={15} /></button>
                      <button className="iconbtn danger" title="Delete this version" disabled={busy}
                        onClick={() => remove(current)}><Icon name="trash" size={15} /></button>
                      <button className="btn primary" disabled={busy || !diff?.total}
                        onClick={() => restore(current)}>
                        <Icon name="back" size={15} />Restore
                      </button>
                    </div>
                  </div>

                  <DiffList diff={diff} empty="Nothing to show — the two documents match." />
                </>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
    {ask.dialog}
    </>
  );
}

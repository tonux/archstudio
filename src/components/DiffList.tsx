'use client';

import { byArea, type Diff, type ChangeKind } from '@/lib/diff';

/* Two documents, in sentences.
 *
 * Extracted from the Versions panel rather than written a second time, and
 * that is the point: reviewing a proposal *is* comparing two documents, which
 * is a thing this app has done well since versions existed. Writing a second
 * diff view for reviews would have produced two renderings of the same facts,
 * and the day they disagreed the reviewer would be the one who found out.
 */

/* `+`, `−`, `~` rather than three coloured dots: circles are reserved for nodes
 * in a graph everywhere else in this app, and the glyph survives being read by
 * someone who cannot separate the two colours. */
const KIND_GLYPH: Record<ChangeKind, string> = { added: '+', removed: '−', changed: '~' };

export function DiffList({ diff, empty }: {
  diff: Diff | null;
  /** What to say when the two match. "No changes" is not the same sentence in
   *  a history panel and in a review, so the caller supplies it. */
  empty: string;
}) {
  const groups = diff ? byArea(diff) : [];
  if (!groups.length) return <p className="muted">{empty}</p>;

  return (
    <div className="hist-diff">
      {groups.map(g => (
        <div className="diffgroup" key={g.area}>
          <div className="sect-label">{g.label}<span className="spacer" />
            <span className="count">{g.changes.length}</span>
          </div>
          {g.changes.map((c, i) => (
            <div className="diffrow" key={i}>
              <i className={`dkind ${c.kind}`}>{KIND_GLYPH[c.kind]}</i>
              <span className="what">{c.label}</span>
              {c.detail && <em>{c.detail}</em>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

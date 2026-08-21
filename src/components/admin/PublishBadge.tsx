'use client';

export type PublishState = 'draft' | 'modified' | 'published';

const LABELS: Record<PublishState, string> = {
  draft: 'Draft',
  modified: 'Modified',
  published: 'Published',
};

const ARIA: Record<PublishState, string> = {
  draft: 'Publication state: Draft',
  modified: 'Publication state: Modified',
  published: 'Publication state: Published',
};

export function PublishBadge({ state }: { state: PublishState }) {
  if (state === 'modified') {
    return (
      <span
        className="btn sm"
        role="status"
        aria-label={ARIA.modified}
        style={{ borderColor: 'var(--brand)', color: 'var(--brand-ink)' }}
      >
        {LABELS.modified}
      </span>
    );
  }
  if (state === 'published') {
    return (
      <span
        className="btn sm"
        role="status"
        aria-label={ARIA.published}
        style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}
      >
        {LABELS.published}
      </span>
    );
  }
  return (
    <span className="btn sm" role="status" aria-label={ARIA.draft} style={{ color: 'var(--ink-2)' }}>
      {LABELS.draft}
    </span>
  );
}

'use client';

import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import { IssueList } from './IssueList';

type IssueInput = CatalogIssue | string;

export function AdminIssuePanel({
  title = 'Validation',
  issues,
}: {
  title?: string;
  issues: IssueInput[];
}) {
  if (issues.length === 0) return null;

  const catalogIssues: CatalogIssue[] = issues.map((issue, i) =>
    typeof issue === 'string'
      ? { code: `msg-${i}`, message: issue }
      : issue,
  );

  return (
    <div style={{ marginBottom: 14 }}>
      <IssueList issues={catalogIssues} title={title} clickable={false} />
    </div>
  );
}

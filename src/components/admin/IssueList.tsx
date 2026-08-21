'use client';

import Link from 'next/link';
import type { CatalogIssue } from '@/lib/lego/admin-catalog';
import { issueEditHref } from '@/lib/admin/issue-routes';

export function IssueList({
  issues,
  title,
  clickable = true,
}: {
  issues: CatalogIssue[];
  title?: string;
  clickable?: boolean;
}) {
  if (issues.length === 0) return null;

  return (
    <div className="warnbox">
      {title && <b>{title}</b>}
      <ul style={{ margin: title ? '8px 0 0' : 0, paddingLeft: 18 }}>
        {issues.map((issue, i) => {
          const href = clickable ? issueEditHref(issue) : null;
          // Always suffix index — same code+entityId can appear twice (e.g. en+fr placeholders).
          const key = `${issue.code}-${issue.entityId ?? ''}-${issue.field ?? ''}-${i}`;
          return (
            <li key={key} style={{ marginBottom: 6 }}>
              {href ? (
                <Link href={href}>{issue.message}</Link>
              ) : (
                <span>{issue.message}</span>
              )}
              {issue.field && (
                <span className="hint"> — field: {issue.field}</span>
              )}
              {issue.entityId && (
                <span className="mono" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                  {issue.entityId}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

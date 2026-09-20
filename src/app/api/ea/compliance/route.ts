import { NextResponse } from 'next/server';

import { requireApi } from '@/lib/auth/guard';
import { RULES, check, summary } from '@/lib/ea/compliance';
import { buildGraph } from '@/lib/ea/graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  /* One graph for both answers: building it parses every project, and the
   * dashboard asks the same question twice — once counted, once listed. */
  const graph = buildGraph();
  return NextResponse.json({
    rules: RULES,
    summary: summary(graph).map(s => ({ rule: s.rule.id, count: s.count })),
    findings: check(graph)
  });
}

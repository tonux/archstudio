import { NextResponse } from 'next/server';
import { publishFlowPatterns } from '@/lib/admin/flow-patterns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const result = publishFlowPatterns();
  if (!result.ok) {
    return NextResponse.json({ ok: false, issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publishedAt: result.publishedAt });
}

import { NextResponse } from 'next/server';
import { createFlowPattern, listFlowPatternsAdmin, type FlowPatternCreate } from '@/lib/admin/flow-patterns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ patterns: listFlowPatternsAdmin() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as FlowPatternCreate;
  try {
    const id = createFlowPattern(body);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

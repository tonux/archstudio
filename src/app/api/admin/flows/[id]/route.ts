import { NextResponse } from 'next/server';
import { deleteFlowPattern, getFlowPatternAdmin, updateFlowPattern } from '@/lib/admin/flow-patterns';
import type { FlowTemplate } from '@/lib/flows/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pattern = getFlowPatternAdmin(id);
  if (!pattern) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(pattern);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as FlowTemplate;
  try {
    updateFlowPattern(id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    deleteFlowPattern(id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

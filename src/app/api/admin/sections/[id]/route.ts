import { NextResponse } from 'next/server';
import { deleteAddSection, getAddSectionAdmin, updateAddSection, type AddSectionPayload } from '@/lib/admin/add-sections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const section = getAddSectionAdmin(id);
  if (!section) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { en, fr } = section;
  return NextResponse.json({ id, en, fr });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as AddSectionPayload;
  try {
    updateAddSection(id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}


export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    deleteAddSection(id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

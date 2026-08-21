import { NextResponse } from 'next/server';
import { buildSectionPreviewHtml, getAddSectionAdmin } from '@/lib/admin/add-sections';
import type { Section } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const lang = body.lang === 'fr' ? 'fr' : 'en';
  let section: Section | null = body.section ?? null;
  if (!section) {
    const row = getAddSectionAdmin(id);
    section = row ? (lang === 'fr' ? row.fr : row.en) : null;
  }
  if (!section) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const html = buildSectionPreviewHtml(section, lang);
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

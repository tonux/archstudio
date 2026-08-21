import { NextResponse } from 'next/server';
import { buildStandaloneHtml } from '@/lib/exportHtml';
import { normalizeArchitecture } from '@/lib/defaults';
import {
  getArchitectureTemplateAdmin,
  getProjectTemplateAdmin,
} from '@/lib/admin/project-templates';
import type { Architecture } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  let doc: Architecture | null = null;

  if (body.snapshot) {
    doc = normalizeArchitecture(body.snapshot);
  } else {
    const project = getProjectTemplateAdmin(id);
    if (project) doc = project.snapshot;
    else {
      const architecture = getArchitectureTemplateAdmin(id);
      doc = architecture?.snapshot ?? null;
    }
  }

  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const html = buildStandaloneHtml(doc);
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

import { NextResponse } from 'next/server';
import {
  createProjectTemplate,
  listAllAdminTemplates,
  type ProjectTemplateCreate,
} from '@/lib/admin/project-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ templates: listAllAdminTemplates() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<ProjectTemplateCreate>;
  const nameEn = String(body.nameEn || '').trim();
  const id = String(body.id || nameEn).trim();
  if (!nameEn) return NextResponse.json({ error: 'nameEn is required' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  try {
    const createdId = createProjectTemplate({
      id,
      nameEn,
      nameFr: body.nameFr ? String(body.nameFr).trim() : undefined,
      meta: body.meta,
      snapshot: body.snapshot,
      featured: body.featured,
      sortOrder: body.sortOrder,
    });
    return NextResponse.json({ ok: true, id: createdId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

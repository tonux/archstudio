import { NextResponse } from 'next/server';
import {
  deleteArchitectureTemplate,
  getArchitectureTemplateAdmin,
  updateArchitectureTemplate,
  type ArchitectureTemplatePatch,
} from '@/lib/admin/architecture-templates';
import {
  deleteProjectTemplate,
  getProjectTemplateAdmin,
  updateProjectTemplate,
  type ProjectTemplateUpdate,
} from '@/lib/admin/project-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = getProjectTemplateAdmin(id);
  if (project) {
    return NextResponse.json({
      kind: 'project' as const,
      editable: true,
      id: project.id,
      nameEn: project.nameEn,
      nameFr: project.nameFr,
      sortOrder: project.sortOrder,
      featured: project.featured,
      meta: project.meta,
      snapshot: project.snapshot,
      outline: {
        componentCount: project.snapshot.components?.length ?? 0,
        sectionIds: (project.snapshot.sections ?? []).map(s => s.id),
        flowCount: project.snapshot.flows?.length ?? 0,
      },
    });
  }

  const architecture = getArchitectureTemplateAdmin(id);
  if (architecture) return NextResponse.json(architecture);
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    if (getProjectTemplateAdmin(id)) {
      updateProjectTemplate(id, body as ProjectTemplateUpdate);
      return NextResponse.json({ ok: true, id });
    }
    if (getArchitectureTemplateAdmin(id)) {
      updateArchitectureTemplate(id, body as ArchitectureTemplatePatch);
      return NextResponse.json({ ok: true, id });
    }
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    if (getProjectTemplateAdmin(id)) {
      deleteProjectTemplate(id);
      return NextResponse.json({ ok: true, id });
    }
    if (getArchitectureTemplateAdmin(id)) {
      deleteArchitectureTemplate(id);
      return NextResponse.json({ ok: true, id });
    }
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

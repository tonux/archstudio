import { NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/store';
import { contentFromAdmin } from '@/lib/admin/flags';
import { getPublishedProjectTemplate, instantiateProjectTemplate } from '@/lib/admin/project-templates';
import { LANGS, TARGETS, t } from '@/lib/templates';
import { instantiateResolved, resolveGetTemplate } from '@/lib/templates/resolve.server';
import type { Architecture } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(listProjects());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  let data: Partial<Architecture> | undefined = body.data;
  let accent: string | undefined = body.accent;
  let description: string | undefined = body.description;

  /* A project created from a template is an ordinary project: the template is
   * resolved here, once, and never referenced again. */
  if (contentFromAdmin() && body.projectTemplateId) {
    const tpl = getPublishedProjectTemplate(String(body.projectTemplateId));
    if (!tpl) return NextResponse.json({ error: 'unknown projectTemplateId' }, { status: 400 });
    data = instantiateProjectTemplate(tpl, name);
    accent = accent || tpl.meta.accent;
    description = description || tpl.meta.taglineEn;
  } else if (body.templateId) {
    const tpl = resolveGetTemplate(String(body.templateId));
    if (!tpl) return NextResponse.json({ error: 'unknown templateId' }, { status: 400 });

    const target = TARGETS.includes(body.target) ? body.target : 'agnostic';
    if (!tpl.supportedTargets.includes(target)) {
      return NextResponse.json(
        { error: `${tpl.id} does not support the ${target} target` }, { status: 400 }
      );
    }
    const lang = LANGS.includes(body.lang) ? body.lang : 'en';

    data = instantiateResolved(tpl, { target, lang, projectName: name });
    accent = accent || tpl.accent;
    description = description || t(tpl.tagline, lang);
  }

  const project = createProject({
    name,
    folderId: body.folderId ?? null,
    description,
    accent,
    data
  });
  return NextResponse.json(project, { status: 201 });
}

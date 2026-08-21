import { NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/store';
import { LANGS, TARGETS, getTemplate, instantiate, t } from '@/lib/templates';
import type { Architecture } from '@/lib/types';
import { authorize, requireApi } from '@/lib/auth/guard';
import { isAdmPhase } from '@/lib/adm';
import { setProjectPhase } from '@/lib/adm-store';
import { applyTogafOutline } from '@/lib/document/preset-togaf';
import { updateProject } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return NextResponse.json(listProjects());
}

export async function POST(req: Request) {
  const denied = await authorize('write', { kind: 'workspace' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  let data: Partial<Architecture> | undefined = body.data;
  let accent: string | undefined = body.accent;
  let description: string | undefined = body.description;

  /* A project created from a template is an ordinary project: the template is
   * resolved here, once, and never referenced again. */
  if (body.templateId) {
    const tpl = getTemplate(String(body.templateId));
    if (!tpl) return NextResponse.json({ error: 'unknown templateId' }, { status: 400 });

    const target = TARGETS.includes(body.target) ? body.target : 'agnostic';
    if (!tpl.supportedTargets.includes(target)) {
      return NextResponse.json(
        { error: `${tpl.id} does not support the ${target} target` }, { status: 400 }
      );
    }
    const lang = LANGS.includes(body.lang) ? body.lang : 'en';

    data = instantiate(tpl, { target, lang, projectName: name });
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

  /* A project that says which ADM phase it is in gets the chapters that phase
   * expects, already slotted — cumulatively, so a project in B still carries
   * the vision it came from. The outline is a list of empty chapters plus three
   * questions this app can answer; offering an empty box where a real answer
   * belongs is how a template teaches people to ignore it. */
  if (isAdmPhase(body.phase)) {
    setProjectPhase(project.id, body.phase, body.iteration);
    const doc = project.data;
    applyTogafOutline(doc, body.phase, LANGS.includes(body.lang) ? body.lang : undefined);
    const saved = updateProject(project.id, { data: doc });
    return NextResponse.json(saved ?? project, { status: 201 });
  }

  return NextResponse.json(project, { status: 201 });
}

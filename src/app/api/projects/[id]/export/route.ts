import { NextResponse } from 'next/server';
import { getProject, getRevisionData } from '@/lib/store';
import { resolveFormat } from '@/lib/export/registry';
import { resolveComputed } from '@/lib/ea/computed';
import { projectAt } from '@/lib/plateau';
import { authorize } from '@/lib/auth/guard';
import { projectSubject } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await authorize('read', projectSubject(id));
  if (denied) return denied;

  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const url = new URL(req.url);
  const inline = url.searchParams.get('inline') === '1';

  /* A stored version, if one is asked for. Every format reads `doc` rather than
   * `project.data`, so exporting the September drawing is the same code path as
   * exporting today's — including the PNG, which rasterises the SVG. */
  const revisionId = url.searchParams.get('revisionId');
  const stored = revisionId ? getRevisionData(id, revisionId) : project.data;
  if (!stored) return NextResponse.json({ error: 'not found' }, { status: 404 });

  /* A cross-cutting question becomes its answer here, once, before any format
   * sees the document — so every export carries the same frozen table and the
   * standalone HTML needs no query engine it could never have. Returns the same
   * object untouched when the document asks nothing. */
  /* `?plateau=` sits beside `?revisionId=` on purpose: both answer "which
   * version of this drawing", one in time-already-passed and one in
   * time-still-to-come, and both fall back to the living document when the id
   * is unknown rather than 404-ing a bookmark. What comes out is an ordinary
   * document whose `state` marks are computed — every format below is unchanged. */
  const plateau = url.searchParams.get('plateau');
  const doc = resolveComputed(plateau ? projectAt(stored, plateau) : stored);

  /* One shape for every format: a body, a type, and the name the browser should
   * save it under — see `src/lib/export/registry.ts`. `inline` drops the
   * disposition: the preview iframe and the PNG builder both read these over
   * `fetch` and neither wants a download. */
  const { body, type, filename } = resolveFormat(url.searchParams.get('format'))
    .build({ doc, name: project.name, id: project.id });

  return new NextResponse(body, {
    headers: {
      'Content-Type': `${type}; charset=utf-8`,
      ...(inline ? {} : { 'Content-Disposition': `attachment; filename="${filename}"` })
    }
  });
}

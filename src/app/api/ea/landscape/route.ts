import { NextResponse } from 'next/server';

import { authorize } from '@/lib/auth/guard';
import { buildLandscape } from '@/lib/ea/landscape';
import { createProject } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Generate an application landscape as a new project.
 *
 * A project like any other from the moment it exists — someone will move a
 * card, and they should be able to. A regenerated view nobody can annotate is
 * a view nobody uses. */
export async function POST(req: Request) {
  const denied = await authorize('write', { kind: 'workspace' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim() || 'Application landscape';
  const doc = buildLandscape(name);

  if (!doc.components.length) {
    return NextResponse.json(
      { error: 'No applications in the referential yet. Add or import some first.' },
      { status: 400 }
    );
  }

  const project = createProject({
    name,
    description: `${doc.components.length} applications, banded by owning domain.`,
    data: doc
  });
  return NextResponse.json({ id: project.id, components: doc.components.length });
}

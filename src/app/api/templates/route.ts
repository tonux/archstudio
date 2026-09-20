import { NextResponse } from 'next/server';
import { contentFromAdmin } from '@/lib/admin/flags';
import { projectTemplateSummaries } from '@/lib/admin/project-templates';
import { resolveServices, resolveTemplateSummaries } from '@/lib/templates/resolve.server';
import { requireApi } from '@/lib/auth/guard';

export const runtime = 'nodejs';

/* Metadata only — both languages, no component bodies and no editorial content.
 * The picker needs to switch language without a second round trip, and the full
 * templates are far too large to ship to the browser. */
export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  const architecture = resolveTemplateSummaries();
  const project = contentFromAdmin() ? projectTemplateSummaries() : [];
  return NextResponse.json(
    { verifiedOn: resolveServices().verifiedOn, templates: [...project, ...architecture] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

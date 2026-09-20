import { NextResponse } from 'next/server';
import { publishProjectTemplates } from '@/lib/admin/project-templates';
import { authorize } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const result = publishProjectTemplates();
  if (!result.ok) {
    return NextResponse.json({ error: 'validation failed', issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publishedAt: result.publishedAt });
}

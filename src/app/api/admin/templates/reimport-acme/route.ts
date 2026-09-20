import { NextResponse } from 'next/server';
import { reimportAcmeTemplate } from '@/lib/admin/project-templates';
import { authorize } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const id = reimportAcmeTemplate();
  return NextResponse.json({ ok: true, id });
}

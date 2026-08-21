import { NextResponse } from 'next/server';
import { publishProjectTemplates } from '@/lib/admin/project-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const result = publishProjectTemplates();
  if (!result.ok) {
    return NextResponse.json({ error: 'validation failed', issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publishedAt: result.publishedAt });
}

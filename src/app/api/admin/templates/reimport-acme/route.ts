import { NextResponse } from 'next/server';
import { reimportAcmeTemplate } from '@/lib/admin/project-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const id = reimportAcmeTemplate();
  return NextResponse.json({ ok: true, id });
}

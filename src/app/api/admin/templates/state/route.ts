import { NextResponse } from 'next/server';
import { getProjectTemplatesAdminState } from '@/lib/admin/project-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const validate = new URL(req.url).searchParams.get('validate') === '1';
  return NextResponse.json(getProjectTemplatesAdminState({ validate }));
}

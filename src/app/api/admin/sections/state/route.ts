import { NextResponse } from 'next/server';
import { getAddSectionsAdminState } from '@/lib/admin/add-sections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const validate = new URL(req.url).searchParams.get('validate') === '1';
  return NextResponse.json(getAddSectionsAdminState({ validate }));
}

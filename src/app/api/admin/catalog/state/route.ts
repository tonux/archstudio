import { NextResponse } from 'next/server';
import { getCatalogAdminStateWithIssues } from '@/lib/lego/admin-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const validate = new URL(req.url).searchParams.get('validate') === '1';
  return NextResponse.json(getCatalogAdminStateWithIssues({ validate }), { headers: { 'Cache-Control': 'no-store' } });
}

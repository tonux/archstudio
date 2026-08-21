import { NextResponse } from 'next/server';
import { createAddSection, listAddSectionsAdmin, type AddSectionCreate } from '@/lib/admin/add-sections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ sections: listAddSectionsAdmin() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AddSectionCreate;
  try {
    const id = createAddSection(body);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

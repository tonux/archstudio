import { NextResponse } from "next/server";
import {
  createArchitectureTemplate,
  listArchitectureTemplatesAdmin,
  type ArchitectureTemplateCreate,
} from "@/lib/admin/architecture-templates";
import { authorize, requireApi } from '@/lib/auth/guard';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return NextResponse.json({ templates: listArchitectureTemplatesAdmin() });
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as ArchitectureTemplateCreate;
  try {
    const id = createArchitectureTemplate(body);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

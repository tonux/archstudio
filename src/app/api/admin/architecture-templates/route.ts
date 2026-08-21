import { NextResponse } from "next/server";
import {
  createArchitectureTemplate,
  listArchitectureTemplatesAdmin,
  type ArchitectureTemplateCreate,
} from "@/lib/admin/architecture-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ templates: listArchitectureTemplatesAdmin() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ArchitectureTemplateCreate;
  try {
    const id = createArchitectureTemplate(body);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

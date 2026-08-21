import { NextResponse } from "next/server";
import {
  deleteArchitectureTemplate,
  getArchitectureTemplateAdmin,
  updateArchitectureTemplate,
  type ArchitectureTemplatePatch,
} from "@/lib/admin/architecture-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const template = getArchitectureTemplateAdmin(id);
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as ArchitectureTemplatePatch;
  try {
    updateArchitectureTemplate(id, body);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    deleteArchitectureTemplate(id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

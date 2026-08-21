import { NextResponse } from "next/server";
import { publishArchitectureTemplates } from "@/lib/admin/architecture-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = publishArchitectureTemplates();
  if (!result.ok) {
    return NextResponse.json({ ok: false, issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publishedAt: result.publishedAt });
}

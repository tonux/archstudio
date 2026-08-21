import { NextResponse } from "next/server";
import { publishSystemCopy } from "@/lib/admin/system-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = publishSystemCopy();
  if (!result.ok) {
    return NextResponse.json({ ok: false, issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publishedAt: result.publishedAt });
}

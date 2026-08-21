import { NextResponse } from "next/server";
import { publishCloudServices } from "@/lib/admin/cloud-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = publishCloudServices();
  if (!result.ok) {
    return NextResponse.json({ ok: false, issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publishedAt: result.publishedAt });
}

import { NextResponse } from "next/server";
import { publishSystemCopy } from "@/lib/admin/system-copy";
import { authorize } from '@/lib/auth/guard';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const result = publishSystemCopy();
  if (!result.ok) {
    return NextResponse.json({ ok: false, issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publishedAt: result.publishedAt });
}

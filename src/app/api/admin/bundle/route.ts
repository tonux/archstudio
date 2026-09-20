import { NextResponse } from "next/server";
import { exportContentBundle, importContentBundle } from "@/lib/admin/bundle";
import { authorize, requireApi } from '@/lib/auth/guard';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return NextResponse.json(exportContentBundle());
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const mode = body && typeof body === "object" && body.mode === "replace" ? "replace" : "merge";
  const bundle = body && typeof body === "object" && "bundle" in body ? body.bundle : body;
  const result = importContentBundle(bundle, { mode });
  if (!result.ok) {
    return NextResponse.json({ ok: false, issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ ok: true, issues: result.issues });
}

import { NextResponse } from "next/server";
import { getSystemCopyState } from "@/lib/admin/system-copy";
import { requireApi } from '@/lib/auth/guard';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const validate = new URL(req.url).searchParams.get("validate") === "1";
  return NextResponse.json(getSystemCopyState({ validate }));
}

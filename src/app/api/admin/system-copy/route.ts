import { NextResponse } from "next/server";
import { listSystemCopy, upsertSystemCopy, type SystemCopyPair } from "@/lib/admin/system-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ keys: listSystemCopy() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    en?: string;
    fr?: string;
  };
  if (!body.key?.trim()) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  try {
    const pair: SystemCopyPair = {
      en: typeof body.en === "string" ? body.en : "",
      fr: typeof body.fr === "string" ? body.fr : "",
    };
    upsertSystemCopy(body.key.trim(), pair);
    return NextResponse.json({ ok: true, key: body.key.trim() }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

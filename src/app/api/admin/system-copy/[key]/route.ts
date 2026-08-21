import { NextResponse } from "next/server";
import {
  deleteSystemCopy,
  getSystemCopy,
  upsertSystemCopy,
  type SystemCopyPair,
} from "@/lib/admin/system-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const item = getSystemCopy(decodeURIComponent(key));
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const decoded = decodeURIComponent(key);
  const body = (await req.json().catch(() => ({}))) as Partial<SystemCopyPair>;
  if (typeof body.en !== "string" && typeof body.fr !== "string") {
    return NextResponse.json({ error: "en and/or fr is required" }, { status: 400 });
  }
  try {
    const current = getSystemCopy(decoded);
    const pair: SystemCopyPair = {
      en: typeof body.en === "string" ? body.en : (current?.en ?? ""),
      fr: typeof body.fr === "string" ? body.fr : (current?.fr ?? ""),
    };
    upsertSystemCopy(decoded, pair);
    return NextResponse.json({ ok: true, key: decoded });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  try {
    deleteSystemCopy(decodeURIComponent(key));
    return NextResponse.json({ ok: true, key: decodeURIComponent(key) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

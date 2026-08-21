import { NextResponse } from "next/server";
import {
  deleteCloudService,
  getCloudServiceAdmin,
  updateCloudService,
} from "@/lib/admin/cloud-services";
import type { ServiceRow } from "@/lib/templates/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const service = getCloudServiceAdmin(key);
  if (!service) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(service);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const body = await req.json().catch(() => ({})) as { payload?: ServiceRow };
  if (!body.payload) return NextResponse.json({ error: "payload is required" }, { status: 400 });
  try {
    updateCloudService(key, body.payload);
    return NextResponse.json({ ok: true, roleKey: key });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  try {
    deleteCloudService(key);
    return NextResponse.json({ ok: true, roleKey: key });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

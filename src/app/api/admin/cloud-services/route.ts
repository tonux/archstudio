import { NextResponse } from "next/server";
import {
  createCloudService,
  listCloudServicesAdmin,
  type CloudServiceCreate,
} from "@/lib/admin/cloud-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ services: listCloudServicesAdmin() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CloudServiceCreate;
  try {
    const roleKey = createCloudService(body);
    return NextResponse.json({ ok: true, roleKey }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

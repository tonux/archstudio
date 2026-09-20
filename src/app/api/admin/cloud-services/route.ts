import { NextResponse } from "next/server";
import {
  createCloudService,
  listCloudServicesAdmin,
  type CloudServiceCreate,
} from "@/lib/admin/cloud-services";
import { authorize, requireApi } from '@/lib/auth/guard';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireApi();
  if (denied) return denied;

  return NextResponse.json({ services: listCloudServicesAdmin() });
}

export async function POST(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as CloudServiceCreate;
  try {
    const roleKey = createCloudService(body);
    return NextResponse.json({ ok: true, roleKey }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getCloudServicesAdminState, setCloudServicesVerifiedOn } from "@/lib/admin/cloud-services";
import { authorize, requireApi } from '@/lib/auth/guard';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireApi();
  if (denied) return denied;

  const validate = new URL(req.url).searchParams.get("validate") === "1";
  return NextResponse.json(getCloudServicesAdminState({ validate }));
}

export async function PATCH(req: Request) {
  const denied = await authorize('manage-referential', { kind: 'referential' });
  if (denied) return denied;

  const body = await req.json().catch(() => ({})) as { verifiedOn?: string };
  if (typeof body.verifiedOn === "string") setCloudServicesVerifiedOn(body.verifiedOn);
  return NextResponse.json(getCloudServicesAdminState());
}

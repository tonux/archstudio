import { NextResponse } from "next/server";
import { getCloudServicesAdminState, setCloudServicesVerifiedOn } from "@/lib/admin/cloud-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const validate = new URL(req.url).searchParams.get("validate") === "1";
  return NextResponse.json(getCloudServicesAdminState({ validate }));
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({})) as { verifiedOn?: string };
  if (typeof body.verifiedOn === "string") setCloudServicesVerifiedOn(body.verifiedOn);
  return NextResponse.json(getCloudServicesAdminState());
}

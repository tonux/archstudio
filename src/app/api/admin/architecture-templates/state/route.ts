import { NextResponse } from "next/server";
import { getArchitectureTemplatesAdminState } from "@/lib/admin/architecture-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const validate = new URL(req.url).searchParams.get("validate") === "1";
  return NextResponse.json(getArchitectureTemplatesAdminState({ validate }));
}

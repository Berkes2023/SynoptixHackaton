import { NextResponse } from "next/server";
import { ENGINE_VERSION, METHODOLOGY_VERSION } from "@/lib/fairness/audit";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "deeptrace-api",
    engineVersion: ENGINE_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    mode: "synthetic-demo",
    time: new Date().toISOString(),
  });
}

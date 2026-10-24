import { NextResponse } from "next/server";
import { ENGINE_VERSION, METHODOLOGY_VERSION } from "@/lib/fairness/audit";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "deeptrace-api",
      build: process.env.NEXT_PUBLIC_BUILD_ID ?? "local",
      engineVersion: ENGINE_VERSION,
      methodologyVersion: METHODOLOGY_VERSION,
      mode: "synthetic-demo",
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

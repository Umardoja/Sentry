export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { demoModeEnabled } from "@/server/config";
import { publicDemoPersonas } from "@/server/auth/demoPersonas";
import { json } from "@/server/services/http";

export function GET() {
  const demoMode = demoModeEnabled();
  return json({ demo_mode: demoMode, personas: demoMode ? publicDemoPersonas() : [] });
}

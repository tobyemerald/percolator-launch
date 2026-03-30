import { type NextRequest, NextResponse } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";
import { validateSlabParam } from "@/lib/route-validators";
import { BLOCKED_SLAB_ADDRESSES } from "@/lib/blocklist";

export const dynamic = "force-dynamic";

/**
 * Blocked slab set: hardcoded list + env var runtime overrides.
 * Mirrors the guard in /api/funding/[slab]/history/route.ts.
 */
const BLOCKED_MARKET_ADDRESSES: ReadonlySet<string> = new Set([
  ...BLOCKED_SLAB_ADDRESSES,
  ...(process.env.BLOCKED_MARKET_ADDRESSES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);

/**
 * GET /api/funding/[slab]/historySince?since=<timestamp>
 *
 * Proxies to percolator-api GET /funding/:slab/historySince?since=...
 * Added for PERC-8282 / GH#1923 — backend route existed but proxy was missing.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slab: string }> }
) {
  const { slab } = await params;

  const validation = validateSlabParam(slab);
  if (!validation.valid) {
    return validation.response;
  }
  const validSlab = validation.slab;

  if (BLOCKED_MARKET_ADDRESSES.has(validSlab)) {
    return NextResponse.json(
      { error: "Market not found" },
      { status: 404 }
    );
  }

  return proxyToApi(req, `/funding/${validSlab}/historySince`);
}

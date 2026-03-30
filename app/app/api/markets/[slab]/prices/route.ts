import { type NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";
import { validateSlabParam } from "@/lib/route-validators";

export const dynamic = "force-dynamic";

/**
 * GET /api/markets/[slab]/prices
 *
 * Proxies to percolator-api GET /markets/:slab/prices
 * Removed standalone Supabase impl (GH#1066 — arch cleanup).
 *
 * **Slab:** `validateSlabParam` (base58 pubkey) — path segment only; no SQL in this layer.
 * Query string is forwarded unchanged. **Ordering**, resolution, and row caps are enforced in
 * percolator-api `routes/prices.ts` (see repo README “Price history for charting”).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slab: string }> }
) {
  const { slab } = await params;

  // Validate slab parameter format
  const validation = validateSlabParam(slab);
  if (!validation.valid) {
    return validation.response;
  }
  const validSlab = validation.slab;

  return proxyToApi(req, `/markets/${validSlab}/prices`);
}

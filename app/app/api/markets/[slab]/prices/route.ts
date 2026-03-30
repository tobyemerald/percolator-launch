import { type NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";
import { validateSlabParam } from "@/lib/route-validators";

export const dynamic = "force-dynamic";

/**
 * GET /api/markets/[slab]/prices
 *
 * Proxies to percolator-api GET /prices/:slab
 * Removed standalone Supabase impl (GH#1066 — arch cleanup).
 * Fixed GH#1928: route was incorrectly proxying to /markets/:slab/prices (404→500);
 * correct backend path is /prices/:slab (registered in priceRoutes()).
 *
 * **Slab:** `validateSlabParam` (base58 pubkey) — path segment only; no SQL in this layer.
 * Query string is forwarded unchanged. **Ordering**, resolution, and row caps are enforced in
 * percolator-api `routes/prices.ts` (see repo README "Price history for charting").
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

  return proxyToApi(req, `/prices/${validSlab}`);
}

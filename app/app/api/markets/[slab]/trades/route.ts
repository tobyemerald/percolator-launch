import { type NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";
import { validateNumericParam, validateSlabParam } from "@/lib/route-validators";

export const dynamic = "force-dynamic";

/** Matches percolator-api / README contract for GET /markets/:slab/trades */
const TRADES_LIMIT_MAX = 200;

/**
 * GET /api/markets/[slab]/trades
 *
 * Proxies to percolator-api GET /markets/:slab/trades
 * Removed standalone Supabase impl (GH#1066 — arch cleanup).
 *
 * **Slab:** `validateSlabParam` (base58 pubkey) — not concatenated into raw SQL here.
 * **`limit`:** optional query, integers **1–200**; invalid → 400. Other query
 * keys forwarded unchanged. **Ordering** (e.g. newest first) is defined upstream in
 * `routes/trades.ts`.
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

  const qs = new URLSearchParams(req.nextUrl.searchParams);
  const limitRaw = qs.get("limit");
  if (limitRaw !== null) {
    const lim = validateNumericParam(limitRaw, { min: 1, max: TRADES_LIMIT_MAX });
    if (!lim.valid) {
      return lim.response;
    }
    qs.set("limit", String(lim.value));
  }

  return proxyToApi(req, `/markets/${validSlab}/trades`, undefined, {
    queryString: qs.toString(),
  });
}

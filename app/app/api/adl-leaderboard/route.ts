import { type NextRequest, NextResponse } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

/**
 * GET /api/adl-leaderboard
 *
 * Compatibility alias for GET /api/adl/rankings.
 *
 * PERC-8334: QA regression tests and external callers referenced this URL before
 * the canonical proxy was introduced at /api/adl/rankings (PERC-8295, PR#1930).
 * This route ensures those callers receive valid JSON instead of an HTML 404.
 *
 * Query string is forwarded unchanged (?slab=, ?limit=, etc.).
 *
 * @see /api/adl/rankings/route.ts — canonical upstream route
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();

  // If this is a direct browser navigation (accepts HTML), redirect to the
  // canonical path so bookmarks and browser history stay consistent.
  const acceptsHtml = req.headers.get("accept")?.includes("text/html") ?? false;
  if (acceptsHtml) {
    url.pathname = "/api/adl/rankings";
    return NextResponse.redirect(url, 301);
  }

  // For programmatic callers (curl, fetch, SDK): proxy directly so they get
  // JSON without an extra round-trip.
  return proxyToApi(req, `/api/adl/rankings`);
}

#!/usr/bin/env npx ts-node --esm
/**
 * PERC-8220 — Devnet smoke test script
 *
 * Verifies the core devnet API health after deployments / migrations.
 * Catches issues like missing Supabase columns, zero oracle prices, etc.
 *
 * Usage:
 *   BASE_URL=https://percolator.trade npx ts-node scripts/smoke-test.ts
 *   BASE_URL=http://localhost:3000   npx ts-node scripts/smoke-test.ts
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

const BASE_URL = process.env.BASE_URL ?? "https://percolator.trade";
const MIN_MARKETS = 1;
const MIN_ORACLE_PRICES = 10;
const TIMEOUT_MS = 15_000;

interface SmokeResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: SmokeResult[] = [];

/** Record a passing check result and print to stdout. */
function pass(name: string, detail: string) {
  results.push({ name, passed: true, detail });
  console.log(`  ✅ ${name}: ${detail}`);
}

/** Record a failing check result and print to stderr. */
function fail(name: string, detail: string) {
  results.push({ name, passed: false, detail });
  console.error(`  ❌ ${name}: ${detail}`);
}

/**
 * Fetch a URL with an AbortController-based timeout.
 * Throws if the request exceeds `timeoutMs` milliseconds.
 */
async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Verify that /api/health returns HTTP 200 with status "ok" or "degraded". */
async function checkHealth() {
  console.log("\n📋 CHECK: /api/health");
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
    if (!res.ok) {
      fail("health", `HTTP ${res.status}`);
      return;
    }
    const body = await res.json();
    if (body.status === "ok" || body.status === "degraded") {
      pass("health", `status=${body.status}`);
    } else {
      fail("health", `unexpected status: ${body.status ?? "missing"}`);
    }
  } catch (e: unknown) {
    fail("health", `request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Verify /api/markets: HTTP 200, correct response shape, minimum market count,
 * oracle price coverage, and funding rate presence. Also triggers a single-market
 * detail spot-check on the first returned market.
 */
async function checkMarkets() {
  console.log("\n📋 CHECK: /api/markets");
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/markets`);
    if (!res.ok) {
      fail("markets-status", `HTTP ${res.status}`);
      return;
    }
    const body = await res.json();

    // 1. Parse response — /api/markets returns { total, activeTotal, marketsWithPrice, markets: [...] }
    //    Guard against legacy plain-array shape too.
    let markets: Record<string, unknown>[];
    let total: number;
    if (Array.isArray(body)) {
      // Legacy or plain-array shape
      markets = body;
      total = body.length;
      pass("markets-format", "response is an array (legacy shape)");
    } else if (body && typeof body === "object" && Array.isArray(body.markets)) {
      // Current shape: { total, markets: [...] }
      markets = body.markets;
      total = typeof body.total === "number" ? body.total : markets.length;
      pass("markets-format", `response is object with markets array (total=${total})`);
    } else {
      fail("markets-format", `unexpected response shape: ${JSON.stringify(body).slice(0, 120)}`);
      return;
    }

    if (total < MIN_MARKETS) {
      fail("markets-count", `got ${total}, expected >= ${MIN_MARKETS}`);
    } else {
      pass("markets-count", `${total} markets (${markets.length} in this page)`);
    }

    // 2. Network migration guard — /api/markets does NOT include `network` in market objects
    //    (it is used as a DB filter, not returned in SELECT_FIELDS). The migration guard is:
    //    HTTP 200 + total > 0 means the network filter worked (or PERC-8215 fallback applied).
    if (total >= MIN_MARKETS) {
      pass("markets-network-filter", "markets served — network filter active or fallback applied");
    } else {
      fail("markets-network-filter", "0 markets — network filter may have rejected all rows");
    }

    // 3. Oracle prices — field is mark_price (not oracle_price).
    //    Verified live: API returns last_price, mark_price, index_price.
    const withPrice = markets.filter(
      (m) => m.mark_price != null && Number(m.mark_price) > 0
    );
    if (withPrice.length < MIN_ORACLE_PRICES) {
      fail(
        "markets-oracle-prices",
        `only ${withPrice.length}/${markets.length} markets have mark_price — expected >= ${MIN_ORACLE_PRICES}`
      );
    } else {
      pass("markets-oracle-prices", `${withPrice.length}/${markets.length} markets have mark_price`);
    }

    // 4. Funding rate — soft warning on devnet (all zeros until keeper cranks).
    const withFunding = markets.filter(
      (m) => m.funding_rate != null && m.funding_rate !== 0
    );
    if (withFunding.length === 0) {
      console.warn(`  ⚠️  markets-funding-rate: no markets have non-zero funding rate (expected on devnet)`);
    } else {
      pass("markets-funding-rate", `${withFunding.length} markets have funding rate data`);
    }

    // 5. Spot-check single market detail endpoint using first returned market
    if (markets.length > 0) {
      await checkSingleMarket(markets[0]);
    }
  } catch (e: unknown) {
    fail("markets", `request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Spot-check the /api/markets/[slab] detail endpoint for a single market.
 * Verifies that the endpoint returns HTTP 200 and a valid market object.
 */
async function checkSingleMarket(market: Record<string, unknown>) {
  console.log("\n📋 CHECK: /api/markets/[slab]");
  const slabAddress = market.slab_address ?? market.id ?? market.market_address;
  if (!slabAddress) {
    fail("single-market", "could not determine slab address from first market");
    return;
  }
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/markets/${slabAddress}`);
    if (!res.ok) {
      fail("single-market-status", `HTTP ${res.status} for slab=${slabAddress}`);
      return;
    }
    const body = await res.json();
    // /api/markets/[slab] wraps the market in { market: { slab_address, ... } }
    const inner = body?.market ?? body;
    if (inner && (inner.slab_address || inner.id || inner.market_address)) {
      pass("single-market-data", `market detail returned for slab=${slabAddress}`);
    } else {
      fail("single-market-data", `unexpected shape: ${JSON.stringify(body).slice(0, 120)}`);
    }
  } catch (e: unknown) {
    fail("single-market", `request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Main entry point: run all smoke checks in sequence and exit 0 (all passed)
 * or 1 (one or more failed).
 */
async function main() {
  console.log(`\n🚬 Percolator Devnet Smoke Test`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Min oracle prices required: ${MIN_ORACLE_PRICES}`);

  await checkHealth();
  await checkMarkets();

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Result: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error(`\n❌ SMOKE TEST FAILED — ${failed} check(s) failed:`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`   • ${r.name}: ${r.detail}`));
    process.exit(1);
  } else {
    console.log(`\n✅ SMOKE TEST PASSED — all ${passed} checks passed`);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Fatal smoke test error:", e);
  process.exit(1);
});

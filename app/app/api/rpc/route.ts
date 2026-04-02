import { NextRequest, NextResponse } from "next/server";
import { getRpcEndpoint } from "@/lib/config";
import { createHash, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

/**
 * RPC proxy endpoint — forwards JSON-RPC requests to Helius while keeping the API key server-side.
 * This prevents exposing HELIUS_API_KEY in the client bundle.
 *
 * Supports both single requests and JSON-RPC batch requests (arrays).
 * Includes response caching for read-only methods to reduce upstream load.
 *
 * Single request:
 *   POST { jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }
 *
 * Batch request:
 *   POST [
 *     { jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [...] },
 *     { jsonrpc: "2.0", id: 2, method: "getBalance", params: [...] },
 *   ]
 */

/**
 * PERC-8310: Network guard — restrict ?network= override by deployment environment.
 *
 * Problem (GH#1945): any caller could pass ?network=mainnet to route traffic to the mainnet
 * Helius key even on a devnet deployment, draining quota and bypassing traffic policy.
 *
 * Rules:
 *   1. If NEXT_PUBLIC_DEFAULT_NETWORK=devnet, mainnet routing is hard-disabled.
 *      Callers attempting ?network=mainnet receive HTTP 403 Forbidden.
 *   2. If mainnet routing is allowed (mainnet deployment), callers must include
 *      the internal API secret (INTERNAL_API_SECRET env var) in the
 *      X-Internal-Token header. Requests without a valid secret receive 403.
 *      Server-side callers (no Origin header) are still guarded by the secret.
 *   3. devnet routing (?network=devnet) is always allowed without extra auth on
 *      devnet deployments; on mainnet deployments it requires the same secret.
 *
 * This prevents unauthenticated external actors from steering network traffic.
 */

/** Returns the deployment network from env, defaulting to "mainnet" */
function getDeploymentNetwork(): "mainnet" | "devnet" {
  const n = process.env.NEXT_PUBLIC_DEFAULT_NETWORK?.trim();
  return n === "devnet" ? "devnet" : "mainnet";
}

/**
 * Validate that a network override is permitted for this deployment.
 * Returns an error response string, or null if allowed.
 */
function validateNetworkOverride(
  requestedNetwork: "mainnet" | "devnet",
  authHeader: string | null,
): { error: string; status: number } | null {
  const deploymentNetwork = getDeploymentNetwork();

  // Rule 1: devnet-only deployment — hard-block mainnet routing
  if (deploymentNetwork === "devnet" && requestedNetwork === "mainnet") {
    console.warn("[/api/rpc] PERC-8310: mainnet routing blocked on devnet deployment");
    return { error: "Mainnet routing is not available on this deployment", status: 403 };
  }

  // Rule 2 & 3: any cross-network override requires internal auth secret
  if (requestedNetwork !== deploymentNetwork) {
    const secret = process.env.INTERNAL_API_SECRET?.trim();
    if (!secret) {
      // No secret configured — disallow all network overrides for safety
      console.warn("[/api/rpc] PERC-8310: network override blocked (INTERNAL_API_SECRET not set)");
      return { error: "Network override requires authentication", status: 403 };
    }
    // Use timing-safe comparison to prevent side-channel brute-force of the secret.
    // Hash both values to equalise buffer lengths (timingSafeEqual requires same length).
    const expected = createHash("sha256").update(secret).digest();
    const provided = createHash("sha256").update(authHeader ?? "").digest();
    if (!timingSafeEqual(expected, provided)) {
      console.warn("[/api/rpc] PERC-8310: network override blocked (invalid secret)");
      return { error: "Network override requires authentication", status: 403 };
    }
  }

  return null;
}

/**
 * Build the upstream Helius RPC URL for a specific network.
 * PERC-469: Supports optional ?network=mainnet|devnet query param so Privy can
 * configure both chains through the same proxy without exposing any API key.
 *
 * Priority for API key resolution:
 *   HELIUS_MAINNET_API_KEY / HELIUS_DEVNET_API_KEY (network-specific) →
 *   HELIUS_API_KEY (generic fallback) → public Solana RPC (rate-limited, no key)
 */
function buildHeliusUrl(network: "mainnet" | "devnet"): string {
  if (network === "mainnet") {
    const key = (process.env.HELIUS_MAINNET_API_KEY ?? process.env.HELIUS_API_KEY ?? "").trim();
    return key
      ? `https://mainnet.helius-rpc.com/?api-key=${key}`
      : "https://api.mainnet-beta.solana.com";
  }
  const key = (process.env.HELIUS_DEVNET_API_KEY ?? process.env.HELIUS_API_KEY ?? "").trim();
  return key
    ? `https://devnet.helius-rpc.com/?api-key=${key}`
    : "https://api.devnet.solana.com";
}

/**
 * Lazy per-network RPC URL cache — avoids rebuilding on every request.
 * One entry per network ("mainnet" | "devnet" | "default").
 */
const _rpcUrlCache: Partial<Record<string, string>> = {};

function getRpcUrl(networkOverride?: "mainnet" | "devnet"): string {
  if (networkOverride) {
    if (!_rpcUrlCache[networkOverride]) {
      _rpcUrlCache[networkOverride] = buildHeliusUrl(networkOverride);
    }
    return _rpcUrlCache[networkOverride]!;
  }
  // No override — fall back to existing env-driven behaviour
  if (!_rpcUrlCache["default"]) {
    _rpcUrlCache["default"] = getRpcEndpoint();
  }
  return _rpcUrlCache["default"]!;
}

/**
 * Allowlist of JSON-RPC methods that may be proxied to Helius.
 * Prevents abuse of the API key for unauthorized operations.
 *
 * PERC-8308: sendTransaction and simulateTransaction are intentionally EXCLUDED.
 * Mutating RPC methods must not be exposed publicly — clients should submit
 * transactions via their own RPC connection or a dedicated authenticated endpoint.
 */
const ALLOWED_RPC_METHODS = new Set([
  // Health & cluster
  "getHealth",
  "getVersion",
  "getSlot",
  "getBlockHeight",
  "getEpochInfo",
  // Account queries
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getProgramAccounts",
  // Transaction queries
  "getTransaction",
  "getSignaturesForAddress",
  "getSignatureStatuses",
  "getLatestBlockhash",
  "getRecentPrioritizationFees",
  "getFeeForMessage",
  "isBlockhashValid",
  // Misc read
  "getMinimumBalanceForRentExemption",
  "getSupply",
  // Helius DAS API — token metadata resolution (PERC-198)
  "getAsset",
  "getAssetBatch",
]);

/** Maximum number of requests allowed in a single batch */
const MAX_BATCH_SIZE = 40;

/**
 * Methods whose responses can be cached briefly (read-only, non-user-specific).
 * Cache TTL varies by method — slot/blockhash change every ~400ms, account data less often.
 */
const CACHEABLE_METHODS: Record<string, number> = {
  getHealth: 5_000,
  getVersion: 60_000,
  getSlot: 2_000,
  getBlockHeight: 2_000,
  getEpochInfo: 10_000,
  getAccountInfo: 3_000,
  getMultipleAccounts: 3_000,
  getBalance: 3_000,
  getTokenAccountBalance: 3_000,
  getProgramAccounts: 5_000,
  getMinimumBalanceForRentExemption: 60_000,
  getSupply: 10_000,
  getRecentPrioritizationFees: 5_000,
};

/** Simple in-memory cache with TTL */
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const MAX_CACHE_SIZE = 500;

function getCacheKey(method: string, params: unknown): string {
  // Hash the cache key to prevent leaking sensitive request patterns or wallet identifiers
  // that might be present in params (e.g., getTokenAccountsByOwner with specific wallet)
  const plainKey = `${method}:${JSON.stringify(params ?? [])}`;
  return createHash("sha256").update(plainKey).digest("hex");
}

function getCached(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  // Evict oldest entries if cache is too large
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Methods that mutate state — never cache, never deduplicate */
const MUTATING_METHODS = new Set<string>();

/**
 * In-flight request deduplication — if the same read request is already being
 * fetched upstream, return the same promise instead of sending a duplicate.
 */
const inflightRequests = new Map<string, Promise<unknown>>();

interface JsonRpcRequest {
  jsonrpc: string;
  id: unknown;
  method: string;
  params?: unknown;
}

/** Validate a single JSON-RPC request, return error response or null if valid */
function validateRequest(req: Record<string, unknown>): { jsonrpc: string; error: { code: number; message: string }; id: unknown } | null {
  const method = req?.method;
  if (!method || typeof method !== "string") {
    return {
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid request: missing method" },
      id: req?.id ?? null,
    };
  }
  if (!ALLOWED_RPC_METHODS.has(method)) {
    console.warn(`[/api/rpc] Blocked disallowed method: ${method}`);
    return {
      jsonrpc: "2.0",
      error: { code: -32601, message: `Method not allowed: ${method}` },
      id: req?.id ?? null,
    };
  }
  return null;
}

/**
 * Process a single validated JSON-RPC request with caching and deduplication.
 * @param networkOverride — optional "mainnet"|"devnet" to route to a specific Helius endpoint
 *   (used by Privy so both chains can be initialised without exposing any API key)
 */
async function processSingleRequest(
  req: JsonRpcRequest,
  networkOverride?: "mainnet" | "devnet",
): Promise<unknown> {
  const method = req.method;
  const isMutating = MUTATING_METHODS.has(method);
  const ttl = CACHEABLE_METHODS[method];
  // Include network in cache key so mainnet/devnet responses don't collide
  const cacheKey = !isMutating
    ? getCacheKey(`${networkOverride ?? "default"}:${method}`, req.params)
    : "";

  // Check cache for read-only methods
  if (ttl && !isMutating) {
    const cached = getCached(cacheKey);
    if (cached !== undefined) {
      // Return cached response with the correct request id
      return { ...(cached as Record<string, unknown>), id: req.id };
    }
  }

  // Deduplicate in-flight requests for read-only methods
  if (!isMutating && inflightRequests.has(cacheKey)) {
    const result = await inflightRequests.get(cacheKey)!;
    return { ...(result as Record<string, unknown>), id: req.id };
  }

  const fetchPromise = (async () => {
    const response = await fetch(getRpcUrl(networkOverride), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    return await response.json();
  })();

  // Register in-flight for dedup
  if (!isMutating) {
    inflightRequests.set(cacheKey, fetchPromise);
  }

  try {
    const data = await fetchPromise;

    // Cache successful responses
    if (ttl && !isMutating && !data.error) {
      setCache(cacheKey, data, ttl);
    }

    return data;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

/**
 * PERC-8308: Enforce same-origin or allowlisted origin for all POST requests.
 * Prevents arbitrary external callers from abusing the Helius API key quota.
 */
function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // Server-side calls (Railway services, crons) have no Origin header — allow
  if (!origin && !referer) return true;

  const allowedHosts = [
    "percolatorlaunch.com",
    "www.percolatorlaunch.com",
    "localhost",
    "127.0.0.1",
  ];

  const hostToCheck = origin ?? referer ?? "";
  return allowedHosts.some((h) => hostToCheck.includes(h));
}

export async function POST(req: NextRequest) {
  // PERC-8308: block external origin abuse of Helius API key
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Forbidden" }, id: null },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const isBatch = Array.isArray(body);

    // PERC-469: Optional ?network=mainnet|devnet query param lets Privy configure both
    // Solana chains through the same proxy without exposing any Helius API key client-side.
    // PERC-8308/PERC-8310: Network override is guarded — same-origin check + validateNetworkOverride()
    // prevents external callers from forcing mainnet routing to consume paid quota.
    const networkParam = req.nextUrl.searchParams.get("network");
    const networkOverride: "mainnet" | "devnet" | undefined =
      isAllowedOrigin(req) && networkParam === "mainnet" ? "mainnet"
      : isAllowedOrigin(req) && networkParam === "devnet" ? "devnet"
      : undefined;

    // PERC-8310: Validate network override before proceeding
    if (networkOverride !== undefined) {
      const authHeader = req.headers.get("x-internal-token");
      const networkError = validateNetworkOverride(networkOverride, authHeader);
      if (networkError) {
        return NextResponse.json(
          { jsonrpc: "2.0", error: { code: -32600, message: networkError.error }, id: null },
          { status: networkError.status }
        );
      }
    }

    if (isBatch) {
      // --- Batch request handling ---
      if (body.length === 0) {
        return NextResponse.json(
          { jsonrpc: "2.0", error: { code: -32600, message: "Empty batch" }, id: null },
          { status: 400 }
        );
      }

      if (body.length > MAX_BATCH_SIZE) {
        return NextResponse.json(
          { jsonrpc: "2.0", error: { code: -32600, message: `Batch too large (max ${MAX_BATCH_SIZE})` }, id: null },
          { status: 400 }
        );
      }

      // Validate all requests, process valid ones with caching/dedup
      const results = await Promise.all(
        body.map(async (item: Record<string, unknown>) => {
          const error = validateRequest(item);
          if (error) return error;
          return processSingleRequest(item as unknown as JsonRpcRequest, networkOverride);
        })
      );

      return NextResponse.json(results, { status: 200 });
    }

    // --- Single request handling ---
    const error = validateRequest(body);
    if (error) {
      const status = error.error.code === -32601 ? 403 : 400;
      return NextResponse.json(error, { status });
    }

    const result = await processSingleRequest(body as JsonRpcRequest, networkOverride);
    // JSON-RPC errors are application-level, not transport-level — always return HTTP 200.
    // Returning 400 for RPC errors breaks @solana/web3.js which treats non-2xx as network failures.
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[/api/rpc] Error:", error);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal RPC proxy error" }, id: null },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "RPC proxy only accepts POST requests" },
    { status: 405 }
  );
}

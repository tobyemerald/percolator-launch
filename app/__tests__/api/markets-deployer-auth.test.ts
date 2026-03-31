/**
 * PERC-8332: Tests for nonce+ed25519 deployer wallet-sig auth on POST /api/markets
 *
 * Tests the following cases:
 * 1. Missing nonce/signature → 400
 * 2. Unknown nonce → 401
 * 3. Expired nonce → 401
 * 4. Already-used nonce → 401
 * 5. Signature mismatch → 401
 * 6. Valid nonce+signature → passes auth gate (on-chain check still runs)
 * 7. Bypass header (dev-only) → skips sig check
 */

import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies (Vitest hoisted vi.mock calls)
vi.mock("@/lib/supabase", () => ({
  getServiceClient: vi.fn(),
  getServerNetwork: vi.fn(() => "devnet"),
}));
vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(() => ({
    rpcUrl: "https://api.devnet.solana.com",
    programId: "FwfBKZXbYr4vTK23bMFkbgKq3npJ3MSDxEaKmq9Aj4Qn",
  })),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@solana/web3.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/web3.js")>();
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getAccountInfo: vi.fn().mockRejectedValue(new Error("mock RPC error")),
    })),
  };
});

import { getServiceClient } from "@/lib/supabase";

/** Generate a fresh ed25519 keypair for testing */
function genKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    secretKey: kp.secretKey,
    publicKey: new PublicKey(kp.publicKey),
    publicKeyBytes: kp.publicKey,
  };
}

/** Sign a nonce string with a secret key */
function signNonce(nonce: string, secretKey: Uint8Array): string {
  const nonceBytes = new Uint8Array(Buffer.from(nonce, "utf-8"));
  const sig = nacl.sign.detached(nonceBytes, secretKey);
  return Buffer.from(sig).toString("base64");
}

const NONCE = "550e8400-e29b-41d4-a716-446655440000";

describe("POST /api/markets — PERC-8332 deployer auth", () => {
  const kp = genKeypair();
  const deployer = kp.publicKey.toBase58();

  const baseBody = {
    slab_address: "7eubYRwJiQdJgXsw1VdaNQ7YHvHbgChe7wbPNQw74S23",
    mint_address: "So11111111111111111111111111111111111111112",
    deployer,
  };

  /**
   * Build a mock Supabase client for the atomic nonce-claim pattern (PERC-8332 TOCTOU fix).
   *
   * The route uses a single conditional UPDATE instead of SELECT+UPDATE:
   *   .update({ used_at }).eq(nonce).eq(deployer).is("used_at", null).gt("expires_at", now).select(..., { count })
   * → resolves to { count: claimCount, error: claimError }
   *
   * claimCount = 1  → nonce claimed successfully (valid, not used, not expired)
   * claimCount = 0  → nonce invalid/expired/already-used (one unified 401)
   */
  function buildMockSupabase(claimCount: number, claimError?: unknown) {
    // Chain for the atomic update: update().eq().eq().is().gt().select() → { count, error }
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ count: claimCount, error: claimError ?? null }),
    };
    return {
      from: vi.fn((table: string) => {
        if (table === "market_challenges") {
          return {
            delete: vi.fn(() => ({ lt: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ error: null }) })) })),
            update: vi.fn(() => updateChain),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: { message: "Slab not found" } }) };
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 if nonce is missing", async () => {
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(buildMockSupabase(0));
    const { POST } = await import("@/app/api/markets/route");
    const req = new Request("http://localhost/api/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, signature: "dGVzdA==" }),
    });
    // @ts-ignore - NextRequest wraps Request
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/nonce/i);
  });

  it("returns 400 if signature is missing", async () => {
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(buildMockSupabase(0));
    const { POST } = await import("@/app/api/markets/route");
    const req = new Request("http://localhost/api/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, nonce: NONCE }),
    });
    // @ts-ignore
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
  });

  it("returns 401 for unknown nonce", async () => {
    // claimCount=0 → DB found no matching unused, unexpired nonce for this deployer
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(buildMockSupabase(0));
    const { POST } = await import("@/app/api/markets/route");
    const sig = signNonce(NONCE, kp.secretKey);
    const req = new Request("http://localhost/api/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, nonce: NONCE, signature: sig }),
    });
    // @ts-ignore
    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid|unknown nonce/i);
  });

  it("returns 401 for expired nonce", async () => {
    // Expired nonce: DB's .gt("expires_at", now) filter excludes it → count=0
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(buildMockSupabase(0));
    const { POST } = await import("@/app/api/markets/route");
    const sig = signNonce(NONCE, kp.secretKey);
    const req = new Request("http://localhost/api/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, nonce: NONCE, signature: sig }),
    });
    // @ts-ignore
    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    // Unified error covers invalid/expired/used cases
    expect(body.error).toMatch(/invalid|expired|already-used/i);
  });

  it("returns 401 for already-used nonce", async () => {
    // Already-used nonce: DB's .is("used_at", null) filter excludes it → count=0
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(buildMockSupabase(0));
    const { POST } = await import("@/app/api/markets/route");
    const sig = signNonce(NONCE, kp.secretKey);
    const req = new Request("http://localhost/api/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, nonce: NONCE, signature: sig }),
    });
    // @ts-ignore
    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    // Unified error covers invalid/expired/used cases
    expect(body.error).toMatch(/invalid|expired|already-used/i);
  });

  it("returns 401 for wrong signature (different key)", async () => {
    // Valid nonce claimed successfully (count=1) but signature doesn't match → 401
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(buildMockSupabase(1));
    const { POST } = await import("@/app/api/markets/route");
    // Sign with a different keypair
    const wrongKp = nacl.sign.keyPair();
    const sig = Buffer.from(nacl.sign.detached(new Uint8Array(Buffer.from(NONCE, "utf-8")), wrongKp.secretKey)).toString("base64");
    const req = new Request("http://localhost/api/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, nonce: NONCE, signature: sig }),
    });
    // @ts-ignore
    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
  });

  it("passes auth check with valid signature (hits on-chain step after)", async () => {
    // Valid nonce, valid sig → auth passes, hits on-chain slab check (which fails with 400)
    const mockSupa = buildMockSupabase(1);
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupa);
    const { POST } = await import("@/app/api/markets/route");
    const sig = signNonce(NONCE, kp.secretKey);
    const req = new Request("http://localhost/api/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, nonce: NONCE, signature: sig }),
    });
    // @ts-ignore
    const res = await POST(req as any);
    // Should fail with 400 (slab not found on-chain), NOT 401 (auth failure)
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/slab|on-chain/i);
  });

  it("bypass header skips sig check (dev env only)", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test"; // ensure not "production" so bypass is honoured
    process.env.MARKETS_AUTH_BYPASS_SECRET = "dev-bypass-secret-123";
    try {
      (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(buildMockSupabase(0));
      const { POST } = await import("@/app/api/markets/route");
      const req = new Request("http://localhost/api/markets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-markets-bypass": "dev-bypass-secret-123",
        },
        body: JSON.stringify({ ...baseBody }), // no nonce/sig
      });
      // @ts-ignore
      const res = await POST(req as any);
      // Should fail with 400 (slab not found), NOT 400 (missing nonce/sig)
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).not.toMatch(/nonce|signature/i);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      delete process.env.MARKETS_AUTH_BYPASS_SECRET;
    }
  });
});

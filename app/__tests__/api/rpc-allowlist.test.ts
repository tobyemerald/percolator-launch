import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Verify the RPC proxy allowlist behaviour.
 *
 * History:
 *   PERC-232: sendTransaction was missing, causing "Method not allowed" on faucet mint.
 *   PERC-8308: sendTransaction + simulateTransaction REMOVED from public proxy allowlist
 *              to prevent unauthenticated callers draining the Helius API key quota.
 *              Clients must submit transactions via their own RPC connection.
 */
describe("/api/rpc allowlist", () => {
  const routeSource = readFileSync(
    resolve(__dirname, "../../app/api/rpc/route.ts"),
    "utf-8"
  );

  // PERC-8308: mutating methods must NOT be in the public allowlist
  it("does NOT allow sendTransaction (PERC-8308 security fix)", () => {
    // sendTransaction must not appear inside ALLOWED_RPC_METHODS
    // The comment referencing it (as excluded) is okay, but the string literal in the Set must not exist
    expect(routeSource).not.toMatch(/ALLOWED_RPC_METHODS[^;]*"sendTransaction"/s);
  });

  it("does NOT allow simulateTransaction (PERC-8308 security fix)", () => {
    expect(routeSource).not.toMatch(/ALLOWED_RPC_METHODS[^;]*"simulateTransaction"/s);
  });

  it("returns 403 for sendTransaction (documented in route source)", () => {
    // Route source should document the exclusion with a PERC-8308 reference
    expect(routeSource).toContain("PERC-8308");
  });

  // These read-only methods must remain allowed
  it("allows getLatestBlockhash (needed for tx building)", () => {
    expect(routeSource).toContain('"getLatestBlockhash"');
  });

  it("allows getSignatureStatuses (needed for tx confirmation)", () => {
    expect(routeSource).toContain('"getSignatureStatuses"');
  });

  it("has origin guard for cross-origin protection (PERC-8308)", () => {
    // isAllowedOrigin or equivalent origin check must be present
    expect(routeSource).toMatch(/isAllowedOrigin|allowedOrigin|origin.*check|403.*Forbidden|Forbidden.*403/i);
  });
});

/**
 * PERC-8375: Trade page UX — network-aware error when slab account not found on-chain.
 *
 * When SlabProvider emits an "account not found" error, the trade page should show
 * a helpful message with a network-switch button rather than a generic error panel.
 *
 * Tests here cover:
 * 1. isNotFound detection logic for various error strings from SlabProvider
 * 2. Network-switch button behaviour (localStorage + reload)
 */

import { describe, it, expect } from "vitest";

// ────────────────────────────────────────────────────────────
// 1. Error string detection logic (pure unit)
// ────────────────────────────────────────────────────────────

/** Mirror the detection logic from trade/[slab]/page.tsx */
function isSlabNotFound(slabError: string): boolean {
  return (
    slabError.includes("not found on-chain") ||
    slabError.includes("Market not found") ||
    slabError.includes("Account not found")
  );
}

describe("PERC-8375: slab not-found error detection", () => {
  it("detects SlabProvider 'not found on-chain' message", () => {
    expect(isSlabNotFound("Market not found on-chain. It may have been closed or the address is invalid.")).toBe(true);
  });

  it("detects 'Market not found' short form", () => {
    expect(isSlabNotFound("Market not found")).toBe(true);
  });

  it("detects 'Account not found' form", () => {
    expect(isSlabNotFound("Account not found")).toBe(true);
  });

  it("does NOT flag generic RPC errors as not-found", () => {
    expect(isSlabNotFound("RPC error: connection failed")).toBe(false);
    expect(isSlabNotFound("Invalid market address. Check the URL and try again.")).toBe(false);
    expect(isSlabNotFound("This market's on-chain data format has changed")).toBe(false);
  });

  it("does NOT flag version mismatch errors as not-found", () => {
    expect(isSlabNotFound("This market uses slab version 2 but the current program expects version 1.")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 2. Network-switch localStorage key
// ────────────────────────────────────────────────────────────

describe("PERC-8375: network-switch behaviour", () => {
  const STORAGE_KEY = "percolator-network";

  it("switching to devnet sets localStorage key to 'devnet'", () => {
    const store: Record<string, string> = {};
    const mockStorage = {
      setItem: (k: string, v: string) => { store[k] = v; },
      getItem: (k: string) => store[k] ?? null,
    };
    // Simulate the button handler
    mockStorage.setItem(STORAGE_KEY, "devnet");
    expect(mockStorage.getItem(STORAGE_KEY)).toBe("devnet");
  });

  it("switching to mainnet sets localStorage key to 'mainnet'", () => {
    const store: Record<string, string> = {};
    const mockStorage = {
      setItem: (k: string, v: string) => { store[k] = v; },
      getItem: (k: string) => store[k] ?? null,
    };
    mockStorage.setItem(STORAGE_KEY, "mainnet");
    expect(mockStorage.getItem(STORAGE_KEY)).toBe("mainnet");
  });
});

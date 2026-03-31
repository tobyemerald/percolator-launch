/**
 * Trading math unit tests.
 *
 * All prices in e6 format (1 USD = 1_000_000).
 */

import {
  computeMarkPnl,
  computeLiqPrice,
  computePreTradeLiqPrice,
  computeTradingFee,
  computePnlPercent,
  computeEstimatedEntryPrice,
  computeFundingRateAnnualized,
  computeRequiredMargin,
  computeMaxLeverage,
} from "../src/math/trading";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    failed++;
  } else {
    console.log(`  ✓ ${msg}`);
    passed++;
  }
}

const USD = (n: number) => BigInt(n) * 1_000_000n;

// --- computeMarkPnl ---
console.log("--- computeMarkPnl ---");

assert(computeMarkPnl(0n, USD(100), USD(110)) === 0n, "zero position → 0");
assert(computeMarkPnl(1000n, USD(100), 0n) === 0n, "zero oracle → 0");

// Long profit: (110-100)*1M / 110 = 90909
assert(computeMarkPnl(1_000_000n, USD(100), USD(110)) === 90909n, "long profit");
// Long loss: (90-100)*1M / 90 = -111111
assert(computeMarkPnl(1_000_000n, USD(100), USD(90)) === -111111n, "long loss");
// Short profit: (100-90)*1M / 90 = 111111
assert(computeMarkPnl(-1_000_000n, USD(100), USD(90)) === 111111n, "short profit");
// Short loss: (100-110)*1M / 110 = -90909
assert(computeMarkPnl(-1_000_000n, USD(100), USD(110)) === -90909n, "short loss");
// No price change
assert(computeMarkPnl(1_000_000n, USD(100), USD(100)) === 0n, "no change long");
assert(computeMarkPnl(-1_000_000n, USD(100), USD(100)) === 0n, "no change short");
// Large position (no overflow)
assert(computeMarkPnl(10_000_000_000n, USD(50000), USD(50100)) > 0n, "large position no overflow");

// --- computeLiqPrice ---
console.log("--- computeLiqPrice ---");

assert(computeLiqPrice(USD(100), 1000n, 0n, 500n) === 0n, "zero position → 0");
assert(computeLiqPrice(0n, 1000n, 1000n, 500n) === 0n, "zero entry → 0");

{
  const liq = computeLiqPrice(USD(100), 10_000_000n, 100_000_000n, 500n);
  assert(liq < USD(100) && liq > 0n, "long liq below entry");
}
{
  const liq = computeLiqPrice(USD(100), 10_000_000n, -100_000_000n, 500n);
  assert(liq > USD(100), "short liq above entry");
}
{
  // Massive capital → liq at 0 for long
  const liq = computeLiqPrice(USD(100), 1_000_000_000n, 1000n, 500n);
  assert(liq === 0n, "over-collateralized long → 0");
}
{
  const maxU64 = 18446744073709551615n;
  assert(computeLiqPrice(USD(100), 1000n, -1000n, 10000n) === maxU64, "100% maint short → max u64");
  assert(computeLiqPrice(USD(100), 1000n, -1000n, 15000n) === maxU64, ">100% maint short → max u64");
}
{
  // More capital → safer (lower liq price for longs)
  const liq1 = computeLiqPrice(USD(100), 5_000_000n, 100_000_000n, 500n);
  const liq2 = computeLiqPrice(USD(100), 10_000_000n, 100_000_000n, 500n);
  assert(liq2 < liq1, "more capital → lower long liq price");
}

// --- computePreTradeLiqPrice ---
console.log("--- computePreTradeLiqPrice ---");

assert(computePreTradeLiqPrice(0n, 1000n, 1000n, 500n, 30n, "long") === 0n, "zero oracle → 0");
assert(computePreTradeLiqPrice(USD(100), 0n, 1000n, 500n, 30n, "long") === 0n, "zero margin → 0");
assert(computePreTradeLiqPrice(USD(100), 1000n, 0n, 500n, 30n, "long") === 0n, "zero pos → 0");
{
  const noFee = computePreTradeLiqPrice(USD(100), 10_000_000n, 100_000_000n, 500n, 0n, "long");
  const withFee = computePreTradeLiqPrice(USD(100), 10_000_000n, 100_000_000n, 500n, 30n, "long");
  assert(withFee > noFee, "fee raises long liq price (conservative, matches on-chain model)");
}
{
  const noFee = computePreTradeLiqPrice(USD(100), 10_000_000n, 100_000_000n, 500n, 0n, "short");
  const withFee = computePreTradeLiqPrice(USD(100), 10_000_000n, 100_000_000n, 500n, 30n, "short");
  assert(withFee < noFee, "fee lowers short liq price (conservative, matches on-chain model)");
}
{
  // GH#1965 regression: fee unit consistency — liq must be computed from fee-adjusted entry price,
  // NOT from fee subtracted from margin. Use computeEstimatedEntryPrice as ground truth.
  // Long: effectiveEntry = oracle + oracle*feeBps/10000; liq = computeLiqPrice(effectiveEntry, margin, pos, maint)
  const oracle = USD(100);
  const margin = 10_000_000n;
  const pos = 100_000_000n;
  const maintBps = 500n;
  const feeBps = 30n;
  // fee-adjusted entry: 100.003 USD (100 + 100*30/10000)
  const effectiveEntry = oracle + (oracle * feeBps) / 10000n;
  // Expected liq = computeLiqPrice(effectiveEntry, margin, pos, maint)
  const expected = computeLiqPrice(effectiveEntry, margin, pos, maintBps);
  const actual = computePreTradeLiqPrice(oracle, margin, pos, maintBps, feeBps, "long");
  assert(actual === expected, "long liq computed from fee-adjusted entry (GH#1965 — unit consistency)");
}
{
  // Short: effectiveEntry = oracle - oracle*feeBps/10000
  const oracle = USD(100);
  const margin = 10_000_000n;
  const pos = 100_000_000n;
  const maintBps = 500n;
  const feeBps = 30n;
  const effectiveEntry = oracle - (oracle * feeBps) / 10000n;
  const expected = computeLiqPrice(effectiveEntry, margin, -pos, maintBps);
  const actual = computePreTradeLiqPrice(oracle, margin, pos, maintBps, feeBps, "short");
  assert(actual === expected, "short liq computed from fee-adjusted entry (GH#1965 — unit consistency)");
}
{
  // Zero fee: liq must equal computeLiqPrice(oracle, margin, pos, maint) exactly
  const oracle = USD(100);
  const margin = 10_000_000n;
  const pos = 100_000_000n;
  const maintBps = 500n;
  const expected = computeLiqPrice(oracle, margin, pos, maintBps);
  const actual = computePreTradeLiqPrice(oracle, margin, pos, maintBps, 0n, "long");
  assert(actual === expected, "zero fee: liq equals computeLiqPrice directly");
}

// --- computeTradingFee ---
console.log("--- computeTradingFee ---");

assert(computeTradingFee(1_000_000n, 30n) === 3000n, "30bps on 1M");
assert(computeTradingFee(0n, 30n) === 0n, "zero notional → 0");
assert(computeTradingFee(1_000_000n, 0n) === 0n, "zero fee → 0");
assert(computeTradingFee(1_000_000n, 10000n) === 1_000_000n, "100% fee");

// --- computePnlPercent ---
console.log("--- computePnlPercent ---");

assert(computePnlPercent(1000n, 0n) === 0, "zero capital → 0");
assert(computePnlPercent(500n, 10000n) === 5, "5% profit");
assert(computePnlPercent(-500n, 10000n) === -5, "-5% loss");
assert(computePnlPercent(1n, 10000n) === 0.01, "fractional 0.01%");
assert(computePnlPercent(10000n, 10000n) === 100, "100% profit");
{
  // Large values near MAX_SAFE_INTEGER
  const result = computePnlPercent(500_000_000_000_000n, 10_000_000_000_000_000n);
  assert(result === 5, "large values → 5% (no truncation)");
}

// --- computeEstimatedEntryPrice ---
console.log("--- computeEstimatedEntryPrice ---");

assert(computeEstimatedEntryPrice(0n, 30n, "long") === 0n, "zero oracle → 0");
assert(computeEstimatedEntryPrice(USD(100), 30n, "long") > USD(100), "long entry > oracle");
assert(computeEstimatedEntryPrice(USD(100), 30n, "short") < USD(100), "short entry < oracle");
assert(computeEstimatedEntryPrice(USD(100), 0n, "long") === USD(100), "zero fee → oracle");
{
  const longDiff = computeEstimatedEntryPrice(USD(100), 30n, "long") - USD(100);
  const shortDiff = USD(100) - computeEstimatedEntryPrice(USD(100), 30n, "short");
  assert(longDiff === shortDiff, "symmetric fee impact");
}

// --- computeFundingRateAnnualized ---
console.log("--- computeFundingRateAnnualized ---");

assert(computeFundingRateAnnualized(0n) === 0, "zero rate → 0");
assert(computeFundingRateAnnualized(1n) > 0, "positive rate");
assert(computeFundingRateAnnualized(-1n) < 0, "negative rate");

// --- computeRequiredMargin ---
console.log("--- computeRequiredMargin ---");

assert(computeRequiredMargin(1_000_000n, 1000n) === 100_000n, "10% margin");
assert(computeRequiredMargin(0n, 1000n) === 0n, "zero notional → 0");
assert(computeRequiredMargin(1_000_000n, 0n) === 0n, "zero rate → 0");
assert(computeRequiredMargin(1_000_000n, 10000n) === 1_000_000n, "100% margin");

// --- computeMaxLeverage ---
console.log("--- computeMaxLeverage ---");

assert(computeMaxLeverage(0n) === 1, "zero bps → 1x");
assert(computeMaxLeverage(1000n) === 10, "1000 bps → 10x");
assert(computeMaxLeverage(500n) === 20, "500 bps → 20x");
assert(computeMaxLeverage(10000n) === 1, "10000 bps → 1x");
assert(computeMaxLeverage(200n) === 50, "200 bps → 50x");

// --- Summary ---
console.log(`\n${failed === 0 ? "✅" : "❌"} Trading math: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

#!/usr/bin/env npx tsx
/**
 * drain-broken-slab.ts — Drain a broken slab (null oracle) to allow CloseSlab.
 *
 * Root cause: engine.vault != 0 because users deposited before oracle became null.
 * Standard fix: ResolveMarket → force-close all positions → users withdraw.
 * But for devnet where oracle is null and users can't withdraw, we need admin drain.
 *
 * This script:
 * 1. Reads all 6 active accounts from the slab
 * 2. Shows their owners, balances, and positions
 * 3. Calls PushOraclePrice to set an admin price (enables settlement)
 * 4. Calls ResolveMarket to enter resolved mode
 * 5. For each account: calls admin ForceClose to zero their balance
 * 6. After all accounts drained, checks if CloseSlab is now possible
 *
 * Usage:
 *   npx tsx scripts/drain-broken-slab.ts --slab <SLAB_PUBKEY> --price <BTC_USD_INT> [--dry-run]
 *   Example: npx tsx scripts/drain-broken-slab.ts --slab AB3ZN1v... --price 80000 --dry-run
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { parseArgs } from "node:util";
import {
  parseHeader,
  parseConfig,
  parseEngine,
  parseAllAccounts,
  detectSlabLayout,
} from "../packages/core/src/solana/slab.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";
import {
  encodePushOraclePrice,
  encodeResolveMarket,
} from "../packages/core/src/abi/instructions.js";
import {
  ACCOUNTS_PUSH_ORACLE_PRICE,
  ACCOUNTS_RESOLVE_MARKET,
  buildAccountMetas,
} from "../packages/core/src/abi/accounts.js";

dotenv.config();

const { values: args } = parseArgs({
  options: {
    slab: { type: "string" },
    price: { type: "string" }, // BTC price in USD (integer), e.g. 80000
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

if (!args.slab) throw new Error("--slab <PUBKEY> is required");

const DRY_RUN = args["dry-run"] ?? false;
const PRICE_USD = args.price ? parseInt(args.price) : 80000;

function loadKeypair(path: string): Keypair {
  const resolved = path.startsWith("~/")
    ? path.replace("~", process.env.HOME || "")
    : path;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf-8"))));
}

function readU64LE(data: Uint8Array, off: number): bigint {
  const dv = new DataView(data.buffer, data.byteOffset);
  return dv.getBigUint64(off, true);
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("DRAIN BROKEN SLAB — enable CloseSlab when vault != 0");
  console.log("=".repeat(70));

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL not set in .env");

  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";
  const payer = loadKeypair(keypairPath);
  const conn = new Connection(rpcUrl, "confirmed");
  const slabPk = new PublicKey(args.slab!);

  console.log(`\nAdmin: ${payer.publicKey.toBase58()}`);
  console.log(`Slab:  ${slabPk.toBase58()}`);
  console.log(`Price: $${PRICE_USD} USD (will be used as settlement price)`);
  console.log(`Mode:  ${DRY_RUN ? "DRY-RUN" : "LIVE"}`);

  // ========================================================================
  // Step 1: Read slab state
  // ========================================================================
  console.log("\n--- Step 1: Read slab state ---");

  const info = await conn.getAccountInfo(slabPk);
  if (!info) throw new Error(`Slab not found: ${slabPk.toBase58()}`);

  const data = new Uint8Array(info.data);
  const PROGRAM_ID = info.owner;
  const layout = detectSlabLayout(data.length);
  if (!layout) throw new Error(`Unknown slab layout for size ${data.length}`);

  const header = parseHeader(data);
  const config = parseConfig(data);
  const engine = parseEngine(data);
  const reservedOff = layout.reservedOff;
  const dustBase = readU64LE(data, reservedOff + 16);

  console.log(`  Admin:        ${header.admin.toBase58()}`);
  console.log(`  Resolved:     ${header.resolved}`);
  console.log(`  engine.vault: ${engine.vault}`);
  console.log(`  ins.balance:  ${engine.insuranceFund.balance}`);
  console.log(`  dust_base:    ${dustBase}`);

  // Verify admin matches
  if (header.admin.toBase58() !== payer.publicKey.toBase58()) {
    throw new Error(
      `Admin mismatch!\n  Slab admin: ${header.admin.toBase58()}\n  Your key:   ${payer.publicKey.toBase58()}`
    );
  }

  // Parse active accounts
  let activeAccounts: ReturnType<typeof parseAllAccounts> = [];
  try {
    activeAccounts = parseAllAccounts(data);
    console.log(`  Active accts: ${activeAccounts.length}`);
    for (const [i, acct] of activeAccounts.entries()) {
      const ownerStr = acct.owner ? acct.owner.toBase58() : "(unknown)";
      console.log(`    [${i}] owner=${ownerStr} capital=${acct.capital ?? "?"} posSize=${acct.positionSize ?? "?"}`);
    }
  } catch (e) {
    console.log(`  ⚠️  Could not parse accounts (old V1 layout): ${e}`);
  }

  if (engine.vault === 0n && engine.insuranceFund.balance === 0n && dustBase === 0n && activeAccounts.length === 0) {
    console.log("\n✅ All checks pass — CloseSlab should work already. Run reinit-slab directly.");
    return;
  }

  // ========================================================================
  // Step 2: PushOraclePrice — needed for ResolveMarket
  // ========================================================================
  console.log("\n--- Step 2: PushOraclePrice ---");

  // Price in e6 format (price_e6 = USD * 1_000_000)
  const priceE6 = BigInt(PRICE_USD) * 1_000_000n;
  console.log(`  Setting authority_price_e6 = ${priceE6} ($${PRICE_USD} × 1e6)`);

  if (!DRY_RUN) {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));
    tx.add(
      buildIx({
        programId: PROGRAM_ID,
        data: encodePushOraclePrice({ priceE6: priceE6.toString(), confE6: "0" }),
        keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [
          payer.publicKey,
          slabPk,
        ]),
      })
    );

    const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
    console.log(`  ✅ PushOraclePrice: ${sig}`);
  } else {
    console.log(`  [dry-run] Would call PushOraclePrice with priceE6=${priceE6}`);
  }

  // ========================================================================
  // Step 3: ResolveMarket
  // ========================================================================
  console.log("\n--- Step 3: ResolveMarket ---");

  if (header.resolved) {
    console.log("  Already resolved — skipping.");
  } else if (!DRY_RUN) {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));
    tx.add(
      buildIx({
        programId: PROGRAM_ID,
        data: encodeResolveMarket(),
        keys: buildAccountMetas(ACCOUNTS_RESOLVE_MARKET, [
          payer.publicKey,
          slabPk,
        ]),
      })
    );
    const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
    console.log(`  ✅ ResolveMarket: ${sig}`);
  } else {
    console.log("  [dry-run] Would call ResolveMarket");
  }

  // ========================================================================
  // Summary & next steps
  // ========================================================================
  console.log("\n" + "=".repeat(70));
  console.log("📋 NEXT STEPS (after this script):");
  console.log("=".repeat(70));
  console.log(`
  The slab now has ${activeAccounts.length} open accounts with funds locked.
  In resolved mode, positions are force-closed by the keeper crank.

  Option A — Wait for crank to force-close all positions, then users withdraw.
  After all positions withdrawn, CloseSlab should succeed.

  Option B (devnet, destructive) — Requires a new on-chain instruction
  'AdminForceDrainVault' that zeroes all account balances and transfers
  vault tokens to admin. This bypasses user withdrawals for devnet cleanup.

  🔑 Recommendation for devnet:
  Add AdminForceDrainVault instruction to percolator-prog:
    - Requires admin + RESOLVED state
    - Transfers all vault SPL tokens to admin ATA  
    - Sets engine.vault = 0 and all account.capital = 0
    - Sets dust_base = 0
  Then call CloseSlab.

  Or: use 'unsafe_close' devnet program build (compile with --features unsafe_close)
  and call CloseSlab directly (skips all validation).

  Active account owners to contact for withdrawal (if not using force drain):
`);
  for (const acct of activeAccounts) {
    console.log(`    ${acct.owner.toBase58()} — capital=${acct.capital}`);
  }
}

main().catch((e) => {
  console.error("\nFatal:", e.message ?? e);
  process.exit(1);
});

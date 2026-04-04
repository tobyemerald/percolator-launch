#!/usr/bin/env npx tsx
/**
 * diagnose-slab-close.ts — Read engine state to diagnose 0xd CloseSlab failures.
 * 
 * Usage: npx tsx scripts/diagnose-slab-close.ts <SLAB_PUBKEY> [<SLAB2> ...]
 *
 * Reports: vault balance, insurance balance, dust_base, num_used_accounts.
 * These are the 4 conditions checked by CloseSlab on-chain.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import {
  parseHeader,
  parseConfig,
  parseEngine,
  parseAllAccounts,
} from "../packages/core/src/solana/slab.js";
import { detectSlabLayout } from "../packages/core/src/solana/slab.js";

dotenv.config();

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";

const slabArgs = process.argv.slice(2);
if (slabArgs.length === 0) {
  throw new Error("Usage: npx tsx scripts/diagnose-slab-close.ts <SLAB1> [<SLAB2> ...]");
}

function readU64LE(data: Uint8Array, off: number): bigint {
  const dv = new DataView(data.buffer, data.byteOffset);
  return dv.getBigUint64(off, true);
}

async function diagnoseSlab(conn: Connection, slabPk: string) {
  console.log("\n" + "=".repeat(70));
  console.log(`Slab: ${slabPk}`);
  console.log("=".repeat(70));

  const info = await conn.getAccountInfo(new PublicKey(slabPk));
  if (!info) {
    console.log("  ❌ Account not found");
    return;
  }

  const data = new Uint8Array(info.data);
  console.log(`  Size:    ${data.length} bytes`);
  console.log(`  Owner:   ${info.owner.toBase58()}`);

  const layout = detectSlabLayout(data.length);
  if (!layout) {
    console.log(`  ❌ Unknown slab layout for size ${data.length}`);
    return;
  }

  // Header
  let header: ReturnType<typeof parseHeader> | null = null;
  try {
    header = parseHeader(data);
    console.log(`  Admin:   ${header.admin.toBase58()}`);
    console.log(`  Version: ${header.version}`);
    console.log(`  Flags:   resolved=${header.resolved} paused=${header.paused}`);
  } catch (e) {
    console.log(`  ❌ Header parse error: ${e}`);
  }

  // Config
  try {
    const config = parseConfig(data);
    const feedBytes = config.indexFeedId.toBytes();
    const isNullFeed = feedBytes.every((b: number) => b === 0) || feedBytes.every((b: number, i: number) => i === 0 ? b === 1 : b === 0);
    console.log(`  Mint:    ${config.collateralMint.toBase58()}`);
    console.log(`  Oracle:  ${config.indexFeedId.toBase58()} ${isNullFeed ? "(NULL ⚠️)" : ""}`);
  } catch (e) {
    console.log(`  ❌ Config parse error: ${e}`);
  }

  // Engine state — the 4 checks CloseSlab does
  try {
    const engine = parseEngine(data);
    console.log("\n  CloseSlab guard checks:");
    console.log(`    engine.vault          = ${engine.vault} ${engine.vault !== 0n ? "❌ MUST BE ZERO" : "✅"}`);
    console.log(`    insurance.balance     = ${engine.insuranceFund.balance} ${engine.insuranceFund.balance !== 0n ? "❌ MUST BE ZERO" : "✅"}`);
    
    // dust_base is at RESERVED_OFF + 16..+24 (see slab.ts constants)
    const reservedOff = layout.reservedOff;
    const dustBase = readU64LE(data, reservedOff + 16);
    console.log(`    dust_base             = ${dustBase} ${dustBase !== 0n ? "❌ MUST BE ZERO" : "✅"}`);

    // num_used_accounts check (returns EngineAccountNotFound not EngineInsufficientBalance)
    let numUsed = 0;
    try {
      const accounts = parseAllAccounts(data);
      numUsed = accounts.length;
    } catch {
      // undersized slab can't parse accounts — count from bitmap if possible
      numUsed = -1;
    }
    const numUsedLabel = numUsed === -1 ? "parse error" : `${numUsed}`;
    console.log(`    num_used_accounts     = ${numUsedLabel} (would return 0x13 if != 0)`);

    // Diagnosis
    console.log("\n  Diagnosis:");
    if (engine.vault !== 0n) {
      console.log("  🔴 BLOCKED: engine.vault != 0 → EngineInsufficientBalance (0xd)");
      console.log("     Fix: drain vault via Withdraw or admin emergency path before CloseSlab");
    } else if (engine.insuranceFund.balance !== 0n) {
      console.log("  🔴 BLOCKED: insurance.balance != 0 → EngineInsufficientBalance (0xd)");
      console.log("     Fix: call WithdrawInsurance (requires RESOLVED + no open positions)");
    } else if (dustBase !== 0n) {
      console.log("  🔴 BLOCKED: dust_base != 0 → EngineInsufficientBalance (0xd)");
      console.log("     Fix: dust can only be cleared by settling — likely need a crank sweep or admin drain");
    } else if (numUsed > 0) {
      console.log("  🔴 BLOCKED: num_used_accounts != 0 → EngineAccountNotFound (0x13)");
      console.log("     Fix: close all user accounts first");
    } else {
      console.log("  ✅ All 4 checks should pass — CloseSlab should succeed");
      console.log("     If still failing, check admin keypair match and slab_guard");
    }
  } catch (e) {
    console.log(`  ❌ Engine parse error: ${e}`);
  }
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  for (const slab of slabArgs) {
    await diagnoseSlab(conn, slab);
  }
}

main().catch(console.error);

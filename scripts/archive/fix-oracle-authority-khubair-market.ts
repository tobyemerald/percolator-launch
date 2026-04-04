/**
 * Fix oracle_authority for Khubair's market slab
 *
 * Slab: HjBePQZnoZVftg9B52gyeuHGjBvt2f8FNCVP4FeoP3YT
 * Current authority: 5Eb8PYou2Q38tuaMen3J7TV9mNXzazmDpq6VZLd6tStU (creator wallet)
 * New authority: FF7KFfU5Bb3Mze2AasDHCCZuyhdaSLjUZy2K3JvjdB7x (oracle keeper)
 *
 * Usage:
 *   npx tsx /tmp/fix-khubair-oracle-authority.ts [--dry-run]
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";
import {
  encodeSetOracleAuthority,
  buildAccountMetas,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  buildIx,
} from "../packages/core/src/index.js";

const SMALL_PROGRAM = new PublicKey("FwfBKZXbYr4vTK23bMFkbgKq3npJ3MSDxEaKmq9Aj4Qn");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

const SLAB_ADDRESS = new PublicKey("HjBePQZnoZVftg9B52gyeuHGjBvt2f8FNCVP4FeoP3YT");
const NEW_ORACLE_AUTHORITY = new PublicKey("FF7KFfU5Bb3Mze2AasDHCCZuyhdaSLjUZy2K3JvjdB7x");

async function main() {
  const adminPath =
    process.env.ADMIN_KEYPAIR_PATH ??
    path.join(process.env.HOME!, ".config/solana/percolator-upgrade-authority.json");

  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(adminPath, "utf8")))
  );

  const conn = new Connection(RPC_URL, "confirmed");
  const dryRun = process.argv.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("Fix oracle_authority — Khubair's market slab");
  console.log("=".repeat(60));
  console.log("Signer (admin):     ", adminKp.publicKey.toBase58());
  console.log("Slab:               ", SLAB_ADDRESS.toBase58());
  console.log("New oracle_authority:", NEW_ORACLE_AUTHORITY.toBase58());
  console.log("Program:            ", SMALL_PROGRAM.toBase58());
  console.log("Dry run:            ", dryRun);
  console.log();

  const accountInfo = await conn.getAccountInfo(SLAB_ADDRESS);
  if (!accountInfo) {
    console.error("❌ Slab not found on-chain");
    process.exit(1);
  }
  console.log("  Slab size:", accountInfo.data.length, "bytes ✅");

  if (dryRun) {
    console.log("  🔍 DRY RUN — would call SetOracleAuthority with newAuthority =", NEW_ORACLE_AUTHORITY.toBase58());
    return;
  }

  const data = encodeSetOracleAuthority({ newAuthority: NEW_ORACLE_AUTHORITY });
  const keys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [
    adminKp.publicKey,
    SLAB_ADDRESS,
  ]);

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    buildIx({ programId: SMALL_PROGRAM, keys, data })
  );

  try {
    const sig = await sendAndConfirmTransaction(conn, tx, [adminKp], {
      commitment: "confirmed",
    });
    console.log("  ✅ SetOracleAuthority success:", sig);
    console.log("  Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
  } catch (err) {
    const e = err as Error & { logs?: string[] };
    console.log("  ❌ SetOracleAuthority failed:", e.message);
    if (e.logs) {
      console.log("  Logs:", e.logs.slice(-10).join("\n    "));
    }
    process.exit(1);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

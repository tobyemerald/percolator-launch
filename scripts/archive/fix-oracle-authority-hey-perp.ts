/**
 * Fix oracle_authority for HEY-PERP on Medium program
 *
 * Slab: FrzyATwi84ecScxXseSCmiEBP1pVmQ6zsrm7kqyJTo5C (343264 bytes, Medium tier)
 * Program: g9msRSV3sJmmE3r5Twn9HuBsxzuuRGTjKCVTKudm9in (Medium)
 * Admin: percolator-upgrade-authority.json (FF7KFfU5...)
 * Sets oracle_authority = admin pubkey (FF7KFfU5...) so the keeper can push prices
 *
 * Usage:
 *   npx tsx scripts/fix-oracle-authority-hey-perp.ts [--dry-run]
 *   ADMIN_KEYPAIR_PATH=/path/to/key.json npx tsx scripts/fix-oracle-authority-hey-perp.ts
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

const MEDIUM_PROGRAM = new PublicKey("g9msRSV3sJmmE3r5Twn9HuBsxzuuRGTjKCVTKudm9in");
const HEY_PERP_SLAB = new PublicKey("FrzyATwi84ecScxXseSCmiEBP1pVmQ6zsrm7kqyJTo5C");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

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
  console.log("Fix oracle_authority — HEY-PERP (Medium)");
  console.log("=".repeat(60));
  console.log("Admin:             ", adminKp.publicKey.toBase58());
  console.log("New oracle_auth:   ", adminKp.publicKey.toBase58());
  console.log("Program:           ", MEDIUM_PROGRAM.toBase58());
  console.log("Slab:              ", HEY_PERP_SLAB.toBase58());
  console.log("Dry run:           ", dryRun);
  console.log();

  // Verify slab exists
  const accountInfo = await conn.getAccountInfo(HEY_PERP_SLAB);
  if (!accountInfo) {
    console.log("❌ HEY-PERP slab not found on devnet — aborting");
    process.exit(1);
  }
  console.log(`✅ Slab found: ${accountInfo.data.length} bytes, owner: ${accountInfo.owner.toBase58()}`);

  // Parse oracle_authority from raw slab data (V0 layout)
  // V0: HEADER_LEN=72, CONFIG starts at byte 72
  // Within CONFIG: oracle_authority is at offset 32 (after collateral_mint 32 bytes)
  // Total config offset: 72 + 32 = 104
  const HEADER_LEN = 72;
  const ORACLE_AUTH_OFFSET = HEADER_LEN + 32; // 104
  const currentOracleAuth = new PublicKey(accountInfo.data.slice(ORACLE_AUTH_OFFSET, ORACLE_AUTH_OFFSET + 32));
  console.log(`Current oracle_authority: ${currentOracleAuth.toBase58()}`);
  const isZero = currentOracleAuth.equals(PublicKey.default);
  console.log(`Is zero (admin-only mode): ${isZero}`);
  console.log();

  if (dryRun) {
    console.log("🔍 DRY RUN — would call SetOracleAuthority with:");
    console.log("  newAuthority:", adminKp.publicKey.toBase58());
    console.log("  program:", MEDIUM_PROGRAM.toBase58());
    console.log("  slab:", HEY_PERP_SLAB.toBase58());
    return;
  }

  const data = encodeSetOracleAuthority({ newAuthority: adminKp.publicKey });
  const keys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [
    adminKp.publicKey,
    HEY_PERP_SLAB,
  ]);

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    buildIx({ programId: MEDIUM_PROGRAM, keys, data })
  );

  try {
    const sig = await sendAndConfirmTransaction(conn, tx, [adminKp], {
      commitment: "confirmed",
    });
    console.log("✅ SetOracleAuthority success:", sig);
    console.log("Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
  } catch (err) {
    const e = err as Error & { logs?: string[] };
    console.log("❌ SetOracleAuthority failed:", e.message);
    if (e.logs) {
      console.log("Program logs:", e.logs.slice(-10).join("\n  "));
    }
    process.exit(1);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

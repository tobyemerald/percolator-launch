"use client";

import { useCallback, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useWalletCompat, useConnectionCompat } from "@/hooks/useWalletCompat";
import {
  encodeTradeCpi,
  encodePermissionlessCrank,
  CrankAction,
  ACCOUNTS_TRADE_CPI,
  ACCOUNTS_KEEPER_CRANK,
  buildAccountMetas,
  buildIx,
  deriveLpPda,
  derivePythPushOraclePDA,
  deriveMatcherDelegate,
  WELL_KNOWN,
} from "@percolatorct/sdk";
// TODO(oracle-migration): encodePushOraclePrice/ACCOUNTS_PUSH_ORACLE_PRICE removed in beta.29.
// The DEX oracle inline push path needs to migrate to /api/oracle/advance-phase.
import {
  encodePushOraclePrice,
  ACCOUNTS_PUSH_ORACLE_PRICE,
} from "@/lib/sdk-compat";
import { sendTx } from "@/lib/tx";
import { useSlabState } from "@/components/providers/SlabProvider";
import { detectOracleMode } from "@/lib/oraclePrice";
import { assertKnownProgram } from "@/lib/programAllowlist";
import { useLivePrice } from "@/hooks/useLivePrice";
import { computeLimitPriceE6 } from "@/lib/slippage";

const INLINE_ORACLE_PUSH_REMOVED_ERROR =
  "Inline oracle price push was removed on-chain in beta.29. Migrate this flow to /api/oracle/advance-phase or another server-side oracle publisher before trading as the oracle authority.";

// ---------------------------------------------------------------------------
// v17 portfolio account layout constants
// (mirrored from v16_program.rs state module — update if the program layout changes)
// ---------------------------------------------------------------------------

// V17 portfolio account magic (first 8 bytes, little-endian): PERCV16\0
// Used as the memcmp filter for getProgramAccounts.
const V17_PORTFOLIO_MAGIC = Buffer.from([0x00, 0x36, 0x31, 0x56, 0x43, 0x52, 0x45, 0x50]);

// Provenance header offsets (HEADER_LEN=16, then provenance at +0)
// market_group_id is at HEADER_LEN(16) + provenance.market_group_id(0) = 16
// portfolio_account_id is at HEADER_LEN(16) + 32 = 48
// owner is at HEADER_LEN(16) + 64 = 80
const PORTFOLIO_PROVENANCE_MARKET_GROUP_OFF = 16; // offset 16 in raw account data
const PORTFOLIO_PROVENANCE_OWNER_OFF = 80;        // offset 80 in raw account data

// PortfolioMatcherConfigV16 is appended after the portfolio body.
// PORTFOLIO_ENGINE_ACCOUNT_LEN = HEADER_LEN(16) + PORTFOLIO_STATE_LEN
// PORTFOLIO_MATCHER_CONFIG_OFF = PORTFOLIO_ENGINE_ACCOUNT_LEN
// Layout: matcher_program[32] | matcher_context[32] | matcher_delegate[32] | enabled[8] = 104 bytes
// From v16_program.rs: PORTFOLIO_MATCHER_CONFIG_OFF and PORTFOLIO_MATCHER_CONFIG_LEN=104
//
// NOTE: PORTFOLIO_STATE_LEN is not stable — derive the offset from the account data length
// minus 104 bytes (the matcher config size). The program always appends this at the end.
const PORTFOLIO_MATCHER_CONFIG_LEN = 104; // sizeof(PortfolioMatcherConfigV16)

/**
 * Read PortfolioMatcherConfigV16 from a v17 portfolio account.
 * The config is at the END of the account data, PORTFOLIO_MATCHER_CONFIG_LEN bytes before the end.
 * Returns null if the account is too short or matcher is disabled (enabled != 1).
 */
function readPortfolioMatcherConfig(data: Buffer): {
  matcherProgram: PublicKey;
  matcherContext: PublicKey;
  matcherDelegate: PublicKey;
} | null {
  if (data.length < PORTFOLIO_MATCHER_CONFIG_LEN) return null;
  const off = data.length - PORTFOLIO_MATCHER_CONFIG_LEN;
  const enabled = data.readBigUInt64LE(off + 96);
  if (enabled !== 1n) return null;
  return {
    matcherProgram: new PublicKey(data.subarray(off, off + 32)),
    matcherContext: new PublicKey(data.subarray(off + 32, off + 64)),
    matcherDelegate: new PublicKey(data.subarray(off + 64, off + 96)),
  };
}

/**
 * Read the LP owner public key from a v17 portfolio account provenance header.
 * The owner wallet is at offset 80 in the raw account data.
 */
function readPortfolioOwner(data: Buffer): PublicKey {
  return new PublicKey(data.subarray(PORTFOLIO_PROVENANCE_OWNER_OFF, PORTFOLIO_PROVENANCE_OWNER_OFF + 32));
}

/**
 * Find the v17 standalone portfolio account for a given (market, owner) pair.
 * Uses getProgramAccounts with memcmp filters on magic, market_group_id, and owner.
 * Returns null if no portfolio exists for this user on this market.
 *
 * Shared with useDeposit — kept co-located here to avoid a cross-hook import.
 */
async function findV17Portfolio(
  connection: Connection,
  programId: PublicKey,
  marketPk: PublicKey,
  ownerPk: PublicKey,
): Promise<PublicKey | null> {
  try {
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { memcmp: { offset: 0, bytes: V17_PORTFOLIO_MAGIC.toString("base64"), encoding: "base64" } },
        { memcmp: { offset: PORTFOLIO_PROVENANCE_MARKET_GROUP_OFF, bytes: marketPk.toBase58() } },
        { memcmp: { offset: PORTFOLIO_PROVENANCE_OWNER_OFF, bytes: ownerPk.toBase58() } },
      ],
    });
    if (accounts.length === 0) return null;
    return accounts[0].pubkey;
  } catch {
    return null;
  }
}

export function useTrade(slabAddress: string) {
  const { connection } = useConnectionCompat();
  const wallet = useWalletCompat();
  const { config: mktConfig, accounts, programId: slabProgramId } = useSlabState();
  const { priceE6: livePriceE6 } = useLivePrice();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const trade = useCallback(
    async (params: { lpIdx: number; userIdx: number; size: bigint; limitPriceE6?: bigint }) => {
      if (inflightRef.current) throw new Error("Trade already in progress");
      inflightRef.current = true;
      setLoading(true);
      setError(null);
      try {
        if (!wallet.publicKey || !mktConfig || !slabProgramId) throw new Error("Wallet not connected or market not loaded");
        // Defense-in-depth: refuse to build a tx whose programId is not in
        // our deployed allowlist. See SlabProvider.parseSlab for the primary
        // gate.
        assertKnownProgram(slabProgramId);

        const programId = slabProgramId;
        const slabPk = new PublicKey(slabAddress);

        // Slippage protection. The on-chain handler treats limit_price_e6 == 0
        // as a "no limit" sentinel and skips the slippage check entirely
        // (percolator.rs::handle_trade_cpi). Without a real limit, the only
        // remaining defense is the anti-off-market band (~1% by default),
        // leaving the user exposed within that band to a hostile matcher or
        // an in-band MEV race. Derive a non-zero limit from the live mark
        // when the caller omits one. An explicit `limitPriceE6: 0n` from the
        // caller is preserved as an opt-in escape hatch for keeper/bot paths
        // that intentionally skip the check.
        const effectiveLimitPriceE6: bigint =
          params.limitPriceE6 !== undefined
            ? params.limitPriceE6
            : computeLimitPriceE6({ markE6: livePriceE6 ?? 0n, size: params.size });

        // Determine oracle mode using centralised detectOracleMode (oraclePrice.ts).
        // "pyth-pinned" = Pyth feed; "admin" or "hyperp" = use slab as oracle account.
        const oracleMode = detectOracleMode(mktConfig);
        const useAdminOracle = oracleMode !== "pyth-pinned";
        const feedHex = Array.from(mktConfig.indexFeedId.toBytes()).map(b => b.toString(16).padStart(2, "0")).join("");
        const oracleAccount = useAdminOracle ? slabPk : derivePythPushOraclePDA(feedHex)[0];

        const instructions = [];

        // For admin oracle markets where user IS the oracle authority,
        // push a fresh price before cranking (crank needs fresh oracle data).
        // PERC-8328 / GH#1966: NEVER fall back to a hardcoded price — if we can't get
        // a valid, fresh price from the backend, abort the trade entirely. Pushing a
        // fabricated oracle price (e.g. $1) would cause catastrophic mispricing.
        const userIsOracleAuth = useAdminOracle && mktConfig.oracleAuthority.equals(wallet.publicKey);
        if (userIsOracleAuth) {
          throw new Error(INLINE_ORACLE_PUSH_REMOVED_ERROR);
        }

        // Always prepend a permissionless crank before trading.
        // v17: KeeperCrank (tag 5 v12 wire) replaced by PermissionlessCrank (tag 5 v17 wire).
        // fundingRateE9 is hardcoded 0n inside encodePermissionlessCrank (program rejects nonzero).
        const crankIx = buildIx({
          programId,
          keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [wallet.publicKey, slabPk, WELL_KNOWN.clock, oracleAccount]),
          data: encodePermissionlessCrank({ action: CrankAction.FeeSweep, assetIndex: 0, nowSlot: 0n, closeQ: 0n, feeBps: 0n, recoveryReason: 0 }),
        });
        instructions.push(crankIx);

        // ── v17 TradeCpi account resolution ──────────────────────────────────
        // v17 TradeCpi (tag 10) requires 7 accounts:
        //   [0] signerA       signer (taker wallet)
        //   [1] market        writable (market group account = slabPk)
        //   [2] accountA      writable (taker's standalone v17 portfolio)
        //   [3] accountB      writable (LP's standalone v17 portfolio)
        //   [4] matcherProg   readonly executable (external matcher program)
        //   [5] matcherCtx    writable (matcher context account)
        //   [6] matcherDelegate readonly (PDA: deriveMatcherDelegate)
        //
        // v12 stale accounts removed: lpOwner (signer), clock, oracle, lpPda.
        // See v16_program.rs::handle_trade_cpi (line ~7338).

        // Detect whether this is a v17 market (accounts bitmap is empty in SlabProvider
        // for v17 slabs — v17 does not embed accounts in the slab data).
        const isV17Market = accounts.length === 0;

        let accountA: PublicKey;
        let accountB: PublicKey;
        let matcherProg: PublicKey;
        let matcherCtx: PublicKey;
        let matcherDelegate: PublicKey;

        if (!isV17Market) {
          // ── v12 market path ────────────────────────────────────────────────
          // LP account data comes from the parsed slab bitmap.
          // accountB = deriveLpPda (the LP's portfolio PDA in v12)
          // matcherProg/matcherCtx from the parsed LP account entry
          const lpAccount = accounts.find((a) => a.idx === params.lpIdx);
          if (!lpAccount) throw new Error(`LP at index ${params.lpIdx} not found`);

          const [lpPda] = deriveLpPda(programId, slabPk, params.lpIdx);
          accountA = wallet.publicKey; // v12: taker wallet; program validates via signer check
          accountB = lpPda;
          matcherProg = lpAccount.account.matcherProgram;
          matcherCtx = lpAccount.account.matcherContext;
          const [delegatePk] = deriveMatcherDelegate(
            programId, slabPk, accountB, lpAccount.account.owner, matcherProg, matcherCtx,
          );
          matcherDelegate = delegatePk;
        } else {
          // ── v17 market path ────────────────────────────────────────────────
          // Portfolio accounts are standalone program-owned accounts (not PDAs).
          // accountB = LP's portfolio, found by scanning the LP's config storage.
          // The LP portfolio stores PortfolioMatcherConfigV16 appended at the end.
          //
          // LP portfolio discovery: derive lpPda as the LP's portfolio pubkey.
          // In v17 bring-up, LPs are initialized at the deriveLpPda address so
          // the frontend can find them without a GPAs scan.
          const [lpPda] = deriveLpPda(programId, slabPk, params.lpIdx);
          accountB = lpPda;

          // Fetch LP portfolio on-chain to read matcher config.
          const lpPortfolioInfo = await connection.getAccountInfo(lpPda);
          if (!lpPortfolioInfo) {
            throw new Error(
              `LP portfolio account not found at ${lpPda.toBase58()}. ` +
              "The LP may not be initialized on this market.",
            );
          }
          const lpPortfolioData = Buffer.from(lpPortfolioInfo.data);
          const matcherCfg = readPortfolioMatcherConfig(lpPortfolioData);
          if (!matcherCfg) {
            throw new Error(
              `LP portfolio at ${lpPda.toBase58()} does not have matcher config enabled. ` +
              "The LP must call SetMatcherConfig before trading.",
            );
          }
          matcherProg = matcherCfg.matcherProgram;
          matcherCtx = matcherCfg.matcherContext;

          // Read LP owner from provenance header of the LP portfolio.
          const lpOwner = readPortfolioOwner(lpPortfolioData);

          // Derive matcherDelegate — must match what SetMatcherConfig stored.
          const [delegatePk] = deriveMatcherDelegate(
            programId, slabPk, accountB, lpOwner, matcherProg, matcherCtx,
          );
          matcherDelegate = delegatePk;

          // Find taker's portfolio (accountA).
          const userPortfolioPk = await findV17Portfolio(connection, programId, slabPk, wallet.publicKey);
          if (!userPortfolioPk) {
            throw new Error(
              "No portfolio account found for your wallet on this market. " +
              "Please deposit collateral first to create a portfolio.",
            );
          }
          accountA = userPortfolioPk;
        }

        const tradeIx = buildIx({
          programId,
          keys: buildAccountMetas(ACCOUNTS_TRADE_CPI, [
            wallet.publicKey,   // [0] signerA
            slabPk,             // [1] market
            accountA,           // [2] accountA (taker portfolio)
            accountB,           // [3] accountB (LP portfolio)
            matcherProg,        // [4] matcherProg
            matcherCtx,         // [5] matcherCtx
            matcherDelegate,    // [6] matcherDelegate
          ]),
          // v17: TradeCpi wire changed — assetIndex (u16) replaces lpIdx; sizeQ+feeBps+limitPrice.
          // feeBps=0n → program applies the market's configured tradingFeeBps.
          data: encodeTradeCpi({ assetIndex: 0, sizeQ: params.size.toString(), feeBps: 0n, limitPrice: effectiveLimitPriceE6.toString() }),
        });
        instructions.push(tradeIx);

        return await sendTx({ connection, wallet, instructions, computeUnits: 600_000 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        inflightRef.current = false;
        setLoading(false);
      }
    },
    [connection, wallet, mktConfig, accounts, slabAddress, slabProgramId, livePriceE6]
  );

  return { trade, loading, error };
}

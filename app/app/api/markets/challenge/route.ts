import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getServiceClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/get-client-ip";
import * as Sentry from "@sentry/nextjs";
import * as crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * PERC-8332: Nonce challenge endpoint for deployer wallet-sig verification.
 *
 * Flow:
 *   1. Deployer calls GET /api/markets/challenge?deployer=<pubkey>
 *   2. Server stores a UUID nonce in market_challenges (TTL 5min)
 *   3. Deployer signs the nonce bytes with their ed25519 keypair
 *   4. POST /api/markets includes { nonce, signature } for verification
 *
 * Rate limit: max 10 pending (unused) challenges per deployer pubkey.
 * This prevents challenge-flood attacks that could fill the table.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PENDING_PER_DEPLOYER = 10;

/**
 * GH#2019: Per-IP rate limit for challenge issuance.
 * Without this, an attacker can exhaust all 10 pending slots for any deployer
 * from a single IP. This adds an independent per-IP cap so a single source
 * cannot monopolize challenge slots across multiple deployers.
 */
const MAX_PENDING_PER_IP = 20;

export async function GET(req: NextRequest) {
  try {
    const deployer = req.nextUrl.searchParams.get("deployer");

    if (!deployer) {
      return NextResponse.json(
        { error: "Missing required param: deployer" },
        { status: 400 }
      );
    }

    // Validate deployer is a valid Solana pubkey
    try {
      new PublicKey(deployer);
    } catch {
      return NextResponse.json(
        { error: "Invalid deployer: must be a valid Solana public key" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
    const clientIp = getClientIp(req);

    // Prune expired challenges lazily (cap query to avoid long-running cleanup)
    await (supabase as ReturnType<typeof getServiceClient>)
      .from("market_challenges" as never)
      .delete()
      .lt("expires_at", now.toISOString())
      .limit(100);

    // Rate-limit: count pending (unused) challenges for this deployer
    const { count: pendingCount, error: countError } = await (supabase as ReturnType<typeof getServiceClient>)
      .from("market_challenges" as never)
      .select("nonce", { count: "exact", head: true })
      .eq("deployer", deployer)
      .is("used_at", null)
      .gt("expires_at", now.toISOString());

    if (countError) {
      Sentry.captureException(countError, {
        tags: { endpoint: "/api/markets/challenge", method: "GET" },
      });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if ((pendingCount ?? 0) >= MAX_PENDING_PER_DEPLOYER) {
      return NextResponse.json(
        {
          error: `Too many pending challenges for this deployer. Wait for existing challenges to expire (TTL: 5 min).`,
        },
        { status: 429 }
      );
    }

    // GH#2019: Per-IP rate limit — prevent a single source from exhausting slots across deployers
    if (clientIp) {
      const { count: ipCount, error: ipCountError } = await (supabase as ReturnType<typeof getServiceClient>)
        .from("market_challenges" as never)
        .select("nonce", { count: "exact", head: true })
        .eq("client_ip", clientIp)
        .is("used_at", null)
        .gt("expires_at", now.toISOString());

      if (ipCountError) {
        Sentry.captureException(ipCountError, {
          tags: { endpoint: "/api/markets/challenge", method: "GET", guard: "ip-rate" },
        });
        // Fail open on count error — deployer-level guard still applies
      } else if ((ipCount ?? 0) >= MAX_PENDING_PER_IP) {
        return NextResponse.json(
          { error: "Too many pending challenges from this IP. Wait for existing challenges to expire." },
          { status: 429 }
        );
      }
    }

    // Generate a cryptographically secure nonce
    const nonce = crypto.randomUUID();

    // Store in DB
    const { error: insertError } = await (supabase as ReturnType<typeof getServiceClient>)
      .from("market_challenges" as never)
      .insert({
        nonce,
        deployer,
        expires_at: expiresAt.toISOString(),
        client_ip: clientIp,
      } as never);

    if (insertError) {
      Sentry.captureException(insertError, {
        tags: { endpoint: "/api/markets/challenge", method: "GET" },
      });
      return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
    }

    return NextResponse.json(
      {
        nonce,
        deployer,
        expiresAt: expiresAt.toISOString(),
        message: `Sign the nonce bytes (UTF-8 encoded) with your deployer keypair to authenticate market registration.`,
        instructions: {
          step1: "Encode the nonce as UTF-8 bytes",
          step2: "Sign the bytes with ed25519 using the deployer keypair (nacl.sign.detached or @solana/web3.js signMessage)",
          step3: "Include nonce and base64-encoded signature in POST /api/markets body",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: "/api/markets/challenge", method: "GET" },
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

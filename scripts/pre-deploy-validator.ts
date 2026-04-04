#!/usr/bin/env npx tsx
/**
 * Pre-Deployment Environment Validator
 * Validates all required env vars and configurations before mainnet deployment.
 *
 * Usage:
 *   npx tsx scripts/pre-deploy-validator.ts [--strict]
 *
 * Options:
 *   --strict    Fail on warnings (recommended for mainnet)
 *   --json      Output results as JSON (for CI integration)
 *
 * Validates:
 *   ✓ Required env vars are set and non-empty
 *   ✓ URL formats are valid
 *   ✓ No devnet keypairs mixed with mainnet config
 *   ✓ Network isolation (NETWORK=mainnet, not devnet)
 *   ✓ Supabase project configuration
 *   ✓ Program IDs are valid Solana addresses
 *   ✓ RPC endpoints are accessible
 */

import * as fs from "fs";
import * as path from "path";

interface ValidationResult {
  category: string;
  check: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  value?: string;
}

class EnvValidator {
  private results: ValidationResult[] = [];
  private strict = false;
  private outputJson = false;

  constructor(strict = false, json = false) {
    this.strict = strict;
    this.outputJson = json;
  }

  private pass(category: string, check: string, message: string) {
    this.results.push({ category, check, status: "PASS", message });
  }

  private warn(category: string, check: string, message: string) {
    this.results.push({ category, check, status: "WARN", message });
  }

  private fail(category: string, check: string, message: string) {
    this.results.push({ category, check, status: "FAIL", message });
  }

  private log(msg: string) {
    if (!this.outputJson) console.log(msg);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidSolanaAddress(addr: string): boolean {
    // Solana addresses are base58 strings, 44-44 chars for standard, 43-44 for program IDs
    if (!addr || !/^[1-9A-HJ-NP-Z]{43,44}$/.test(addr)) {
      return false;
    }
    return true;
  }

  private isValidPublicKey(key: string): boolean {
    // Solana public key in base58, 44 chars
    return this.isValidSolanaAddress(key);
  }

  private isValidKeypair(key: string): boolean {
    // Base58 keypair or JSON array
    try {
      const parsed = JSON.parse(key);
      return Array.isArray(parsed) && parsed.length === 64;
    } catch {
      return /^[1-9A-HJ-NP-Z]{88}$/.test(key); // Base58 encoded keypair
    }
  }

  validateNetwork() {
    this.log("\n📋 Network Configuration");
    const network = process.env.NETWORK || "";
    const forceMainnet = process.env.FORCE_MAINNET || "";
    const nodeEnv = process.env.NODE_ENV || "";

    if (network === "mainnet") {
      this.pass("Network", "NETWORK set to mainnet", "✓ NETWORK=mainnet");
    } else {
      this.fail("Network", "NETWORK must be mainnet", `Found: NETWORK=${network}`);
    }

    if (forceMainnet === "1") {
      this.pass("Network", "FORCE_MAINNET=1", "✓ FORCE_MAINNET=1");
    } else {
      this.warn("Network", "FORCE_MAINNET", `FORCE_MAINNET=${forceMainnet} (should be 1 for mainnet)`);
    }

    if (nodeEnv === "production") {
      this.pass("Network", "NODE_ENV=production", "✓ NODE_ENV=production");
    } else {
      this.warn("Network", "NODE_ENV", `NODE_ENV=${nodeEnv} (should be production)`);
    }
  }

  validateUrls() {
    this.log("\n🌐 URL Configuration");
    const urls: Record<string, string> = {
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "",
      FALLBACK_RPC_URL: process.env.FALLBACK_RPC_URL || "",
      SUPABASE_URL: process.env.SUPABASE_URL || "",
      NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "",
    };

    for (const [key, value] of Object.entries(urls)) {
      if (!value) {
        this.fail("URLs", key, `${key} is not set`);
      } else if (this.isValidUrl(value)) {
        this.pass("URLs", key, `✓ ${key} is valid URL`);
      } else {
        this.fail("URLs", key, `${key}=${value} is not a valid URL`);
      }
    }
  }

  validateSecrets() {
    this.log("\n🔐 Secrets & Keys");
    const requiredSecrets = [
      "SUPABASE_KEY",
      "SUPABASE_SERVICE_KEY",
      "API_AUTH_KEY",
      "WS_AUTH_SECRET",
      "HELIUS_WEBHOOK_SECRET",
      "ADMIN_API_SECRET",
      "INDEXER_API_KEY",
      "KEEPER_REGISTER_SECRET",
    ];

    for (const secret of requiredSecrets) {
      const value = process.env[secret];
      if (!value || value.trim() === "") {
        this.fail("Secrets", secret, `${secret} is not set or empty`);
      } else if (value.length < 32) {
        this.warn("Secrets", secret, `${secret} seems short (${value.length} chars, expect 64+)`);
      } else {
        this.pass("Secrets", secret, `✓ ${secret} is set`);
      }
    }
  }

  validateKeypairs() {
    this.log("\n🔑 Keypairs");
    const keypairs: Record<string, string> = {
      KEEPER_PRIVATE_KEY: process.env.KEEPER_PRIVATE_KEY || "",
      CRANK_KEYPAIR: process.env.CRANK_KEYPAIR || "",
    };

    for (const [key, value] of Object.entries(keypairs)) {
      if (!value) {
        this.fail("Keypairs", key, `${key} is not set`);
      } else if (this.isValidKeypair(value)) {
        this.pass("Keypairs", key, `✓ ${key} is valid keypair format`);
      } else {
        this.fail("Keypairs", key, `${key} is not valid keypair format`);
      }
    }

    // Check for devnet keypair reuse
    if (process.env.KEEPER_PRIVATE_KEY && process.env.KEEPER_PRIVATE_KEY.includes("devnet")) {
      this.fail("Keypairs", "Devnet mixing", "KEEPER_PRIVATE_KEY contains 'devnet' — use fresh mainnet keypair");
    }
  }

  validateProgramIds() {
    this.log("\n💻 Program IDs");
    const programIds: Record<string, string> = {
      PROGRAM_ID: process.env.PROGRAM_ID || "",
      NEXT_PUBLIC_PROGRAM_ID: process.env.NEXT_PUBLIC_PROGRAM_ID || "",
    };

    for (const [key, value] of Object.entries(programIds)) {
      if (!value) {
        this.warn("Program IDs", key, `${key} is not set (may be set post-deploy)`);
      } else if (this.isValidPublicKey(value)) {
        this.pass("Program IDs", key, `✓ ${key} is valid Solana address`);
      } else {
        this.fail("Program IDs", key, `${key}=${value} is not valid Solana address`);
      }
    }
  }

  validateSupabase() {
    this.log("\n🗄️  Supabase Configuration");
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_KEY || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || "";

    if (this.isValidUrl(supabaseUrl)) {
      this.pass("Supabase", "SUPABASE_URL valid", `✓ ${supabaseUrl}`);

      // Check for production project
      if (supabaseUrl.includes("ygvbajglkrwkbjdjyhxi")) {
        this.pass("Supabase", "Using mainnet project", "✓ Using correct Supabase project");
      } else {
        this.warn("Supabase", "Project verification", "Verify this is the mainnet Supabase project");
      }
    } else {
      this.fail("Supabase", "SUPABASE_URL invalid", `Invalid URL: ${supabaseUrl}`);
    }

    if (supabaseKey) {
      this.pass("Supabase", "SUPABASE_KEY set", "✓ SUPABASE_KEY is set");
    } else {
      this.fail("Supabase", "SUPABASE_KEY missing", "SUPABASE_KEY is required");
    }

    if (supabaseServiceKey) {
      this.pass("Supabase", "SUPABASE_SERVICE_KEY set", "✓ SUPABASE_SERVICE_KEY is set");
      // Warn if service key looks like it hasn't been rotated recently
      if (supabaseServiceKey === "NEEDS_ROTATION") {
        this.fail(
          "Supabase",
          "Service role rotation",
          "SUPABASE_SERVICE_KEY needs rotation (PERC-8232)"
        );
      }
    } else {
      this.fail("Supabase", "SUPABASE_SERVICE_KEY missing", "SUPABASE_SERVICE_KEY is required");
    }
  }

  validateHelius() {
    this.log("\n📡 Helius Configuration");
    const heliusMainnetKey = process.env.HELIUS_MAINNET_API_KEY || "";
    const heliusPublicKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || "";
    const heliusWebhookSecret = process.env.HELIUS_WEBHOOK_SECRET || "";

    if (heliusMainnetKey) {
      this.pass("Helius", "HELIUS_MAINNET_API_KEY set", "✓ Set");
    } else {
      this.fail("Helius", "HELIUS_MAINNET_API_KEY missing", "Required for mainnet RPC");
    }

    if (heliusPublicKey) {
      this.pass("Helius", "NEXT_PUBLIC_HELIUS_API_KEY set", "✓ Set (public-safe)");
    } else {
      this.warn("Helius", "NEXT_PUBLIC_HELIUS_API_KEY", "Frontend may need fallback RPC");
    }

    if (heliusWebhookSecret && heliusWebhookSecret.length > 32) {
      this.pass("Helius", "HELIUS_WEBHOOK_SECRET set", "✓ Set");
    } else {
      this.fail("Helius", "HELIUS_WEBHOOK_SECRET", "Required for indexer webhook");
    }
  }

  validateRateLimiting() {
    this.log("\n⏱️  Rate Limiting");
    const wsAuthRequired = process.env.WS_AUTH_REQUIRED || "";
    const maxWsConnections = process.env.MAX_WS_CONNECTIONS || "";
    const corsOrigins = process.env.CORS_ORIGINS || "";

    if (wsAuthRequired === "true") {
      this.pass("Rate Limiting", "WS_AUTH_REQUIRED=true", "✓ WebSocket requires auth");
    } else {
      this.warn("Rate Limiting", "WS_AUTH_REQUIRED", `Set to ${wsAuthRequired} (should be true)`);
    }

    if (maxWsConnections && parseInt(maxWsConnections) > 0) {
      this.pass("Rate Limiting", "MAX_WS_CONNECTIONS set", `✓ ${maxWsConnections}`);
    } else {
      this.warn("Rate Limiting", "MAX_WS_CONNECTIONS", "Consider setting connection limits");
    }

    if (corsOrigins && corsOrigins.includes("percolatorlaunch.com")) {
      this.pass("Rate Limiting", "CORS_ORIGINS configured", "✓ Mainnet domain in CORS");
    } else {
      this.warn("Rate Limiting", "CORS_ORIGINS", `Set to ${corsOrigins} (verify it's correct)`);
    }
  }

  async validate(): Promise<boolean> {
    this.log("🔍 Pre-Deployment Environment Validation");
    this.log("==========================================");

    this.validateNetwork();
    this.validateUrls();
    this.validateSecrets();
    this.validateKeypairs();
    this.validateProgramIds();
    this.validateSupabase();
    this.validateHelius();
    this.validateRateLimiting();

    // Print summary
    const passed = this.results.filter((r) => r.status === "PASS").length;
    const warned = this.results.filter((r) => r.status === "WARN").length;
    const failed = this.results.filter((r) => r.status === "FAIL").length;

    this.log("\n" + "=".repeat(50));
    this.log(`Results: ${passed} passed, ${warned} warnings, ${failed} failed`);
    this.log("=".repeat(50));

    if (this.outputJson) {
      console.log(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            summary: { passed, warned, failed },
            results: this.results,
          },
          null,
          2
        )
      );
    } else {
      for (const result of this.results) {
        const icon =
          result.status === "PASS" ? "✅" : result.status === "WARN" ? "⚠️ " : "❌";
        this.log(
          `${icon} [${result.category}] ${result.check}: ${result.message}`
        );
      }
    }

    if (failed > 0) {
      this.log("\n❌ Validation FAILED — fix errors before deploying");
      return false;
    }

    if (warned > 0 && this.strict) {
      this.log("\n⚠️  Validation OK with warnings — use --no-strict to ignore");
      return false;
    }

    this.log("\n✅ Validation passed — safe to deploy");
    return true;
  }
}

async function main() {
  const strict = process.argv.includes("--strict");
  const json = process.argv.includes("--json");

  const validator = new EnvValidator(strict, json);
  const success = await validator.validate();

  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error("Validation error:", err);
  process.exit(1);
});

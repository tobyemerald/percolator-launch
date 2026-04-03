# PERC-353: Devnet Markets — Strategy to Make Them Live, Active, and Impressive
**Author:** Strategist Agent  
**Date:** 2026-03-03  
**Priority:** P1  
**Status:** Final  
**Inputs:** PERC-354 researcher memo (2026-03-03), PM brief (PERC-353)

---

## Problem Statement

Percolator devnet currently shows **$0 volume, 0 OI, 0 traders** across all markets. Anyone evaluating the protocol — investors, developers, market makers, integration partners — lands on a dead product. First impressions are the only impressions at this stage. A living devnet is a credibility signal and a product demonstration.

---

## Research Synthesis (PERC-354)

The researcher memo confirms a clear pattern across top perp DEXs:

- **Drift and Hyperliquid look alive** — because they run their own bots
- **GMX and Vertex look dead** — because they don't
- The difference is not funding or sophistication; it's the decision to invest in bot infrastructure early
- Drift open-sourced their entire keeper fleet (`keeper-bots-v2`, TypeScript, Apache 2.0) — directly adaptable
- Key finding: a **Filler/Matching bot requires zero collateral** — it just matches existing orders and earns keeper rewards; this is the highest-leverage starting point

---

## Impact × Effort Matrix

| # | Strategy | Impact | Effort | Risk | Priority |
|---|----------|--------|--------|------|----------|
| 1 | **Auto-faucet + auto-deposit on connect** | 🔴 Critical | Low (2-3 days) | Low | **P0** |
| 2 | **Market making bot (JIT maker, two-sided quotes)** | 🔴 Critical | Medium (1 week) | Low (devnet mock funds) | **P0** |
| 3 | **Order filler/matching bot** | 🟠 High | Low (2-3 days, free) | None | **P1** |
| 4 | **Oracle price simulation (Binance mirror)** | 🟠 High | Low (1-2 days) | Low | **P1** |
| 5 | **Pre-seed LP liquidity (treasury wallets)** | 🟡 Medium | Low (half-day) | None | **P1** |
| 6 | **Simulated trader fleet (5-10 wallets)** | 🟡 Medium | Medium (3-5 days) | Low | **P2** |
| 7 | **Leaderboard + devnet trading competition** | 🟡 Medium | Medium (1 week) | Low | **P2** |
| 8 | **Demo/simulation mode (no wallet required)** | 🟢 Lower | High (2-3 weeks) | None | **P3** |
| 9 | **Social seeding (10 friendly traders)** | 🟢 Lower | Very Low (1 day) | None | **P2** |

---

## Recommended Approach

### Phase 1: Immediate (Days 1-3) — Remove All Friction

**Strategy 1A: Auto-faucet + auto-deposit on wallet connect**

This is the single highest-leverage action. Every evaluator who connects a wallet must immediately have funds and a ready account. Zero friction = more real users testing = organic volume.

Implementation:
```
On wallet connect:
  1. Detect: user account exists? USDC balance >= 1000?
  2. If not: call Helius devnet faucet API → airdrop 2 SOL + 10k mock USDC
  3. Auto-submit initUserAccount() + deposit(10000 USDC) instructions
  4. Show: "Welcome! 10,000 USDC deposited. Start trading."
  Total: ~2 transactions, runs in background, ~3-5 seconds
```

Reference: Drift devnet `--force-deposit` flag pattern; Helius faucet REST API.

**Strategy 1B: Pre-seed LP liquidity from protocol wallet**

Before any bot runs, deposit from a protocol treasury wallet into each market vault. Ensures markets have non-zero liquidity depth immediately.

- SOL-PERP: $50k notional
- BTC-PERP: $50k notional  
- ETH-PERP: $50k notional
- Half-day effort, immediate visual improvement

---

### Phase 2: Core (Days 3-10) — Generate Real Activity

**Strategy 2A: Order Filler/Matching Bot (no capital required)**

Fork Drift's `keeper-bots-v2` → adapt to Percolator's program interface → run the `filler` bot type.

- The filler bot matches taker orders against maker orders or AMM
- Runs permissionlessly, earns keeper rewards per fill
- No collateral required — bot pays only tx fees
- Generates real fill events, real volume numbers, real OI
- Run 24/7 as a background service (devops: Railway or simple EC2/cron)

**Strategy 2B: JIT Market Making Bot (small collateral)**

Seed 3 devnet wallets with mock USDC (~10k each from our own faucet). Run adapted `jit-proxy` pattern:

- Each wallet places two-sided quotes ±10bps from oracle mid
- Quotes refreshed every 5-10 seconds
- 3 wallets × 3 markets = persistent tight spreads + real order book depth
- Shows active bids/asks on the UI at all times

This is what makes Hyperliquid testnet look credible. We need this.

**Strategy 2C: Oracle Price Simulation**

If Pyth devnet feeds are stale or zero (a known issue on Solana devnet), mirror real prices from Coingecko/Binance REST API via a lightweight oracle keeper:

```
Every 5 seconds:
  1. Fetch BTC/ETH/SOL price from Binance spot REST API (free, no auth)
  2. If devnet oracle price deviates >0.5% from Binance → submit updateOracle tx
  3. Bot wallet: just needs SOL for tx fees, 1 SOL covers weeks
```

Without live oracle prices, all on-chain trading is broken. This is a prerequisite for everything else.

---

### Phase 3: Growth (Days 10-21) — Social + Competition Layer

**Strategy 3A: Simulated Trader Fleet**

5-10 funded devnet wallets with distinct "trading personalities":
- Scalper: small trades, high frequency, SOL-PERP
- Swing trader: larger trades, holds for hours, BTC-PERP  
- Long-biased: mostly longs, ETH-PERP
- Contrarian: trades opposite recent price move

This generates organic-looking account diversity, realistic PnL distributions, and makes the "Top Traders" leaderboard feel real.

**Strategy 3B: Leaderboard + Devnet Trading Competition**

Run a 2-week "Devnet Alpha Challenge":
- Funded wallets (10k USDC each, free mint)
- Leaderboard ranked by % return, not absolute PnL
- Winner gets mainnet whitelist slot + NFT
- Drives real user testing, real feedback, real volume

Low effort: leaderboard is just a read from on-chain account PnL; hosted on a simple static page.

**Strategy 3C: Social Seeding**

Identify 10 Solana DeFi power users + market makers (from Drift, Mango, Zeta communities). Give them funded devnet wallets. Ask for 30 minutes of testing + public feedback tweet. This creates:
- Real organic trades
- Real product feedback
- Social proof ("X tested Percolator devnet")

---

### Phase 4: Stretch (Week 3+) — Demo Mode

**Strategy 4: Client-side simulation mode (no wallet)**

A fully simulated trading experience that runs in-browser, no wallet required:
- Realistic price movement (simulated Brownian motion + mean reversion)
- Realistic order fills, slippage, liquidations
- Good for showcasing at conferences, investor demos, blog posts

This is the highest-effort item and should only be built once the core market infrastructure is polished. **Do not prioritize over Phase 1-2 items.**

---

## Implementation Priority Order

```
WEEK 1:
  Day 1:   ✅ Pre-seed LP liquidity (protocol treasury wallets)
  Day 1-2: ✅ Oracle keeper bot (Binance price mirror → Pyth devnet)
  Day 2-3: ✅ Auto-faucet + auto-deposit on wallet connect (frontend)
  Day 3-7: ✅ JIT market making bot (3 wallets, 3 markets)
  Day 3-5: ✅ Order filler bot (keeper-bots-v2 fork, no capital)

WEEK 2:
  Day 7-10: ✅ Simulated trader fleet (5 wallets)
  Day 10:   ✅ Devnet trading competition launch
  Day 10:   ✅ Social seeding outreach (10 friendly traders)

WEEK 3+:
  Stretch:  🔲 Demo/simulation mode (only if engineering has bandwidth)
```

---

## What "Impressive" Looks Like (Target State)

After 2 weeks, devnet should show:
- **Volume**: $500k+ daily (bot-generated + real users)
- **OI**: $200k+ across SOL/BTC/ETH markets
- **Active traders**: 50+ unique wallets per day
- **Order book depth**: Tight spreads on all 3 markets at all times
- **New user onboarding**: Wallet connect → funded account in <10 seconds

This creates a credible demo environment for:
- Investor screenshots
- Integration partner evaluation
- Bug bounty participants
- Press/media

---

## Competitive Context (Research Summary)

| Protocol | Testnet Looks Alive? | Method |
|----------|---------------------|--------|
| **Drift** | ✅ Yes | Open-source keeper bots + faucet in UI |
| **Hyperliquid** | ✅ Yes | Internal MM bots + faucet (mainnet-gated) |
| **dYdX v4** | ✅ Yes | Partner MM firms seeded early (Wintermute, GSR) |
| **GMX** | ❌ No | No public bot infrastructure, sparse |
| **Vertex** | ❌ No | No documented volume seeding |

**Strategic conclusion**: Running our own bots is table stakes for a credible perp DEX launch. Every top protocol does it. It is not "fake" — it is infrastructure. Real users can't test a dead market. The bots exist to enable real testing.

---

## Assignments Recommended

| Task | Agent | Effort |
|------|-------|--------|
| Oracle keeper bot | coder | 1-2 days |
| Auto-faucet + auto-deposit (frontend) | coder | 2-3 days |
| JIT market making bot (Drift fork → Percolator) | coder | 5-7 days |
| Order filler/matching bot | coder | 2-3 days |
| Pre-seed LP from treasury wallet | devops/coder | 0.5 days |
| Simulated trader fleet | coder | 3-5 days |
| Devnet trading competition page | designer + coder | 3 days |
| Social seeding outreach | pm | 1 day |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Bots overwhelm devnet RPC | Use rate limiting (1 req/sec per bot), run on Helius devnet endpoint not public RPC |
| Bot wallet runs out of SOL for tx fees | Auto-refill via devnet faucet when balance < 0.5 SOL |
| Drift bot code requires heavy refactor | Start with filler bot (simplest), add JIT maker in week 2 |
| Oracle keeper submits bad price | Set max deviation guard: if Binance price move > 10% in 1 min, pause and alert |
| Social seeding participants don't engage | Offer mainnet early access, not just bragging rights |

---

## Summary

The fastest path to an impressive devnet is:

1. **Oracle bot first** (can't trade without prices) — 1-2 days
2. **Auto-faucet on connect** (remove all friction) — 2-3 days  
3. **JIT market maker bot** (makes it look real) — 1 week
4. **Filler bot** (generates real fills) — alongside #3

Everything else is optimization on top of this foundation. The Drift open-source repos give us a near-complete starting point. This is a 2-week engineering sprint, not a 2-month project.

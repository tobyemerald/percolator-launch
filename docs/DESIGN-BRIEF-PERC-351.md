# DESIGN-BRIEF-PERC-351
## Full UI/UX Brainstorm + Analysis — Percolator as a World-Class Perp DEX
### Designer Agent | March 2, 2026

---

## 1. COMPETITIVE UX TEARDOWN

### 1.1 How does percolatorlaunch.com compare?

**Hyperliquid** — Gold standard for perp DEX UX. Extremely dense information layout with zero wasted space. The order form, position card, chart, and orderbook all coexist on a single desktop view. Mark/index spread shown permanently. Funding rate ticker inline with stats bar. Mobile app is a separate native-quality experience. Percolator is **6–7/10** vs Hyperliquid's **9/10**.

**dYdX v4** — Very clean, muted dark theme with solid spacing. Excellent onboarding flow (guided deposit → trade). Strong position management panel with clear PnL/ROE/liquidation price displayed on a single card. Slow due to Cosmos chain but UX polish is high. Percolator matches or exceeds in raw trading speed (Solana) but trails in onboarding clarity.

**Drift Protocol** — Cluttered by trying to do too much (spot + perps + vaults + borrow/lend). Information density is high but organisation is poor. Percolator is cleaner by comparison. Drift's mobile experience is unusable.

**GMX v2** — Best "first-time user" experience of the group. The trade form has inline plain-English explanations for every field. Good for retail, too slow for power traders. Percolator is faster but scarier for new users.

**Vertex** — Very polished desktop experience with a proper orderbook and two-sided depth chart. Good keyboard shortcut support. Funding rate always visible. No mobile to speak of.

### 1.2 What competitors do right that Percolator currently does not

| Feature | Hyperliquid | Drift | dYdX | Vertex | Percolator |
|---|---|---|---|---|---|
| Persistent funding rate ticker | ✅ | ❌ | ✅ | ✅ | ❌ |
| Mark vs index price spread visible | ✅ | ✅ | ✅ | ✅ | ❌ |
| PnL shown in trade header bar | ✅ | ✅ | ✅ | ❌ | ❌ |
| One-click close position | ✅ | ✅ | ✅ | ✅ | ❌ |
| Order type: Market + Limit + TP/SL | ✅ | ✅ | ✅ | ✅ | ❌ (market only) |
| Markets list with sortable columns | ✅ | ✅ | ✅ | ✅ | ✅ |
| Guided first-trade onboarding | ❌ | ❌ | ✅ | ❌ | Partial |
| Native mobile app quality | ✅ | ❌ | ❌ | ❌ | ❌ |

### 1.3 What Percolator does better

- **Permissionless market creation** — unique differentiator. No competitor allows any token perp in 60 seconds.
- **Speed** — Solana sub-400ms fills beat anything on Cosmos or EVM.
- **Fee transparency** — "8% creator fee" shown inline in the trade form. No hidden surprises.
- **Clean aesthetic** — the dark terminal theme with JetBrains Mono is genuinely distinctive and looks expensive. Hyperliquid's design has become generic; Percolator has its own voice.
- **On-chain insurance fund** — visible on every market. dYdX hides this.

---

## 2. TRADING INTERFACE DESIGN

### 2.1 Order Entry Panel — Ideal Layout

**Current state:** Single tab (market order only). Margin input + leverage slider + presets + LONG/SHORT buttons. Clean but incomplete.

**What's missing:**
- Limit order support (critical for power traders — market-only is a dealbreaker)
- TP/SL fields (take profit / stop loss)
- Notional size display ("You're buying $X of exposure")
- Slippage estimate before submission

**Ideal order panel — desktop (380px wide right column):**
```
[Market ▼] [Limit] [TP/SL]          ← order type tabs
─────────────────────────────────
Margin (SOL)          [Balance: 4.2]
[________________] [25%][50%][75%][Max]

Leverage              1x ─────── 20x
●─────────────────────────────────○
[1x] [2x] [3x] [5x] [10x] [20x]

Notional size: $0.00
Est. liq price: —

[       LONG       ] [      SHORT      ]
─────────────────────────────────
Fee: 0.05% · Slippage: ~0.02%
```

**Ideal order panel — mobile (375px full width):**
- Tabs collapsed to icon+label: 📈 Market | 📋 Limit | 🎯 TP/SL
- Keyboard handling: when number input focused, CTA buttons dock above keyboard (position: sticky; bottom: 0 + keyboard height). Currently buttons scroll off screen.
- LONG/SHORT as full-width alternating buttons, minimum 52px height (thumb target)
- Leverage as horizontal scroll chips: `[1x] [2x] [3x] [5x] [10x] [20x]` — no slider on mobile (hard to tap precisely)

### 2.2 Position Cards — What Information Matters

**Signal (show prominently):**
- Entry price / Mark price / Liquidation price — three critical numbers
- Unrealized PnL in USD + ROE% (colored green/red)
- Size (token amount + USD value)
- Side badge (LONG/SHORT)

**Noise (show collapsed or on hover):**
- Open interest contribution
- Funding payments accumulated
- Account index number

**Current state:** PositionPanel shows most of this but it's buried in a tab called "Position" that new users miss. PnL is visible but ROE% is absent.

**Ideal position card layout:**
```
SOL-PERP  LONG  5x               ×Close
──────────────────────────────────────
Entry: $178.40    Mark: $183.20   Size: 2.5 SOL ($458)
Liq:   $162.10    PnL: +$11.90 (+2.6% ROE)   [▼ Details]
```
One-click Close button on the card itself (not buried in a form). This is the biggest UX miss on the current site.

### 2.3 PnL Display — Unrealized/Realized/ROE%/Liquidation Price

**Best pattern (Hyperliquid-inspired, adapted for Percolator):**
- Unrealized PnL: large, bold, colored. Primary metric.
- ROE%: smaller, same line. `+$11.90 · +2.6%`
- Realized PnL: secondary row, muted
- Liquidation price: always visible, colored amber when < 10% away from mark price (danger warning)
- Funding accrued: small badge on position card, tooltip on hover

**Current state rating: 5/10** — PnL shown but no ROE%, no liq price color-coding, no funding accrued.

### 2.4 Orderbook + Depth Chart

**On desktop:** Orderbook is currently in a "Book" tab which hides it. Should be a persistent panel (collapsible) alongside the chart. Even a 120px wide simplified book showing top 5 levels each side adds real value.

**On mobile:** Skip the orderbook entirely. Replace with: a live price ticker (mark price with 24h %) and a simple buy/sell pressure bar (cumulative bids vs asks as a colored ratio bar). This conveys the same sentiment signal without the density.

**Depth chart:** Keep desktop-only. The current implementation is good. Consider adding a crosshair tooltip that shows bid/ask qty at each price level on hover.

### 2.5 Funding Rate Display

**Current state:** Funding rate is shown in a tab called "Stats". New users never find it.

**Ideal:** Show funding rate in the header bar next to the price, always visible. Small, monospace:
```
SOL-PERP  $183.24 +3.2%  │  Funding: +0.0081%/hr  │  OI: $2.4M
```
Color-code: green = long-favorable, red = short-favorable. Add tooltip explaining what it means on first visit.

### 2.6 Mark Price vs Index Price

**Current:** Not displayed together anywhere visible.
**Ideal:** In the market stats bar, show:
- Mark: `$183.24`
- Index: `$183.18`
- Spread: `+$0.06 (+0.03%)` — colored amber if spread > 0.5%

This is a critical signal for traders (basis risk). Absent from Percolator currently.

---

## 3. MOBILE-FIRST PRINCIPLES

### 3.1 What fits on 375px without scrolling

Critical path is: see price → enter trade → see position.

**Viewport budget for 375×812 (iPhone 14):**
- Navigation bar: 48px
- Market header (price + stats bar): 56px
- Chart: 200px
- Trade form: 280px (collapsed leverage slider, single input)
- LONG/SHORT buttons: 56px
- Total: 640px — fits without scroll ✅

**What to cut on mobile:**
- Orderbook (move to tab)
- Funding history chart
- Engine health card (power user only)
- Collateral chart on DepositTrigger

### 3.2 Thumb-Zone Navigation

Based on Steven Hoober's research: the bottom 40% of the screen is the "easy" thumb zone on a right-handed 375px device.

**Current problem:** LONG/SHORT buttons are in the middle of the form, surrounded by inputs. On mobile after interacting with inputs, the keyboard covers the buttons.

**Fix:** Sticky trade CTA bar at bottom:
```css
.trade-cta-bar {
  position: sticky;
  bottom: env(safe-area-inset-bottom, 0px);
  z-index: 50;
  padding: 8px 16px;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border);
}
```
Place LONG and SHORT buttons inside this bar, always visible above the keyboard. Notional size shown inline.

### 3.3 Bottom Nav vs Hamburger

**Verdict: Bottom nav — always.**

Trading apps need instant tab switching. A hamburger forces 2 taps. Bottom nav is 1.

**Proposed bottom nav (5 items max):**
```
[📊 Markets] [📈 Trade] [💼 Portfolio] [🏦 Earn] [⚙️ More]
```
Current nav is top-only. On mobile, a sticky bottom nav bar (48px) replaces the current hamburger menu from the top navbar.

The top navbar on mobile should shrink to: logo | connect wallet button only. All navigation moves to the bottom.

### 3.4 Touch Targets

**Minimum 44×44px per Apple HIG and WCAG 2.5.5.**

**Current failures on mobile:**
- Leverage preset chips `[1x]` `[2x]` etc: ~28×24px — too small
- The `▾` collapse toggles: ~20×20px — too small
- The `tokens | usd` toggle in trade header: ~24×18px — too small
- "Copy address" button: 16×16px icon — too small

**Fix:** All interactive elements need `min-h-[44px] min-w-[44px]` or at minimum `px-3 py-2` padding on tappable areas. Use `touch-action: manipulation` to remove 300ms tap delay.

### 3.5 Keyboard Handling on Order Entry

**Current problem:** When user taps the margin input on mobile, the software keyboard appears (≈300px tall on most phones). The form scrolls but the LONG/SHORT submit buttons scroll off-screen. User can't submit without dismissing keyboard.

**Fix (as above):** Sticky CTA bar that stays above keyboard. Additionally, use `inputMode="decimal"` on all numeric inputs to get the numeric keypad instead of full keyboard (already done in some inputs, needs to be consistent).

---

## 4. NAVIGATION + INFORMATION ARCHITECTURE

### 4.1 Current Screen Map

```
/ (landing)
/markets
/trade/[slab]
/portfolio
/create (launch market)
/earn (vault/LP)
/faucet (devnet)
/developers
/admin/[slab]
```

**Assessment:** Good coverage. Missing: `/leaderboard`, `/positions` (global), `/notifications`.

### 4.2 Ideal Screen Map (Production)

```
/ (landing — unauthenticated) → redirects /markets if connected
/markets → default landing for authenticated users
/trade/[slab] → trading view
/portfolio → positions, history, PnL, account settings
/earn → LP vaults, yield farming
/leaderboard → top traders, volume rankings
/create → market creation wizard
/developers → API docs, SDK
/learn → trading academy for new users
```

### 4.3 New User Journey: Landing → First Trade in Under 2 Minutes

**Target: 90 seconds.**

**Current journey (estimated time):**
1. Land on percolatorlaunch.com (~5s)
2. Read hero copy, understand it's a perp DEX (~15s)
3. Find "Trade Now" button → goes to /trade/... but which market? (~10s confusion)
4. Connect wallet → Privy modal (~20s)
5. Find "Create Account" → why do I need an account? (~15s friction)
6. Deposit collateral → approve token, amount, confirm (~20s)
7. Set margin, leverage → submit → confirm modal → sign (~20s)

**Total: ~105s — failing target.**

**Proposed optimizations:**
- Hero CTA "Trade Now" → goes to `/markets` with SOL-PERP pre-selected (most liquid)
- After wallet connect, show inline prompt: "To trade, deposit $5+ of SOL as collateral" with "Deposit Now" one-click
- Collapse "Create Account" into the deposit flow — create account automatically on first deposit (or at least explain "1 SOL = 1 account slot")
- Quick deposit: pre-fill $25 USDC with a "Start with $25" shortcut chip
- After deposit confirmed, auto-scroll to trade form with a pulsing LONG button

**Optimized journey:**
1. Land → read hero (~10s)
2. "Trade Now" → markets list (~5s)
3. Connect Privy → one-click (~10s)
4. "Start with $25" deposit → auto sign (~20s)
5. Account created automatically (~0s)
6. Trade form pre-populated → sign (~15s)

**Total: ~60s ✅**

### 4.4 Power Trader Journey: 5 Positions Across 3 Markets

**Critical needs:**
- See all open positions across markets from a single view (Portfolio → My Positions table)
- One-click jump from position card to its market's trade page
- PnL summary at top: "Today: +$234 | All-time: +$1,204"
- Quick close buttons on position rows
- Bulk close: select multiple → "Close Selected"

**Current state:** Positions tab exists in the trade page but it's market-specific. `/portfolio` presumably shows all — need to verify it has bulk close.

---

## 5. DESIGN SYSTEM RECOMMENDATIONS

### 5.1 Typography

**Current:** JetBrains Mono for all text + Outfit for display headings. This is distinctive but creates readability issues at small sizes.

**Recommendation:**
- Keep JetBrains Mono for all **data** (prices, numbers, addresses, stats)
- Keep Outfit/Space Grotesk for **headings** (H1–H3)
- Add a **readable sans-serif** (Inter or DM Sans) for body text, tooltips, descriptions — monospace is hard to read in paragraphs
- Typography scale:
  - Display (hero H1): 64px/1.1 — Outfit Bold
  - H2: 36px/1.2 — Outfit SemiBold
  - H3: 24px/1.3 — Outfit Medium
  - UI Label: 12px/1.4 — JetBrains Mono
  - Data: 13px/1.4 — JetBrains Mono tabular
  - Body: 14px/1.6 — Inter Regular
  - Caption: 11px/1.4 — Inter Regular, text-secondary color

### 5.2 Colour System (Dark Theme)

**Current tokens are good.** Specific enhancements:

```css
/* Existing — keep */
--bg: #0A0A0F;
--accent: #9945FF;    /* Solana purple */
--cyan: #14F195;      /* Solana green */
--long: #14F195;      /* Same as cyan — good */
--short: #FF3B5C;     /* Good red */
--warning: #E5A100;

/* Add: */
--long-dim: rgba(20, 241, 149, 0.12);   /* position card backgrounds */
--short-dim: rgba(255, 59, 92, 0.12);   /* position card backgrounds */
--neutral: #4A90D9;   /* neutral/info state */
--price-up: #14F195;  /* same as long, for price ticks going up */
--price-down: #FF3B5C;
--liq-danger: #E5A100; /* liq price approaching */
--liq-critical: #FF3B5C; /* liq price imminent */
```

**On-screen PnL convention (consistent across all components):**
- Positive PnL: `text-[var(--long)]` — never use Tailwind `text-green-*`
- Negative PnL: `text-[var(--short)]` — never use Tailwind `text-red-*`
- Neutral/zero: `text-[var(--text-secondary)]`

### 5.3 Spacing: 8px Grid

Use 8px base grid throughout. Tailwind defaults to 4px (`p-1` = 4px). Use even numbers:
- `gap-2` (8px) — base unit
- `gap-4` (16px) — between sections
- `gap-6` (24px) — between panels
- `px-4` (16px) — panel padding
- `px-6` (24px) — page padding

Currently the site uses `gap-1.5` (6px) in several places which breaks the grid. Standardize.

### 5.4 Key Components to Standardize

**Buttons:**
```
Primary CTA (LONG): bg-[var(--long)] text-black font-bold h-11 px-6 rounded-none — sharp corners enforce terminal aesthetic
Danger CTA (SHORT): bg-[var(--short)] text-white font-bold h-11 px-6 rounded-none
Ghost: border border-[var(--border)] bg-transparent text-[var(--text-secondary)] h-9 px-4
Subtle: bg-[var(--bg-elevated)] text-[var(--text-secondary)] h-8 px-3 text-xs
Minimum touch target: ALL buttons min-h-[44px] on mobile
```

**Input fields:**
```
bg-[var(--bg-elevated)] border border-[var(--border)] rounded-none px-3 py-2.5
font-mono text-sm text-[var(--text)]
focus: border-[var(--accent)]/60 outline-none ring-1 ring-[var(--accent)]/20
error: border-[var(--short)]/60
```
Currently inputs vary in height and border radius across components. Standardize to `h-10` with `rounded-none` everywhere in the trading interface.

**Cards/Panels:**
```
bg-[var(--panel-bg)] border border-[var(--border)] rounded-none p-4
Header: border-b border-[var(--border)] px-4 py-2 text-xs uppercase tracking-widest text-[var(--text-dim)]
```

**Badges:**
```
LONG:  bg-[var(--long-dim)]  text-[var(--long)]  px-2 py-0.5 text-[10px] font-mono uppercase
SHORT: bg-[var(--short-dim)] text-[var(--short)] px-2 py-0.5 text-[10px] font-mono uppercase
```

**Loading skeleton:**
The current `ShimmerSkeleton` is good. Ensure it matches panel background: `bg-[var(--bg-elevated)] animate-pulse`.

---

## 6. SPECIFIC IMPROVEMENTS TO PERCOLATORLAUNCH.COM

### 6.1 Homepage (/) — Rating: 7/10

**What's good:**
- Hero headline is punchy and memorable ("Any Token. Any Market. Permissionless.")
- Feature cards are clean
- Dark CRT aesthetic is distinctive
- Live market preview card (SOL-PERP) adds credibility

**Issues:**
- **P1:** Stats bar shows "Markets: —" "24h Volume: —" dashes while loading. Should show skeleton shimmer, not raw dashes.
- **P1:** "Built Different" section headline uses `Different` with no styling differentiation from the label "// PROTOCOL METRICS" above it — confusing hierarchy.
- **P2:** Protocol metrics section (Markets Live, 24h Volume, Insurance Fund) shows "— (devnet)" for volume on devnet. This reads as embarrassing to first-time visitors. Either filter out devnet markers from the display or show a "devnet preview" badge separately.
- **P2:** Three-step onboarding ("Paste a Token Address", "Set Your Terms", "Market Goes Live") is for market creators, not for traders. Add a parallel track: "How to trade in 3 steps" for traders.
- **P3:** Footer is bare. Add: Discord link, Twitter/X, GitHub, "Powered by Solana" logo. Currently only GitHub, X, Discord icons — text labels would help on mobile.
- **P3:** Hero demo card (SOL-PERP) doesn't have an active state — it just sits there. Make the LONG/SHORT buttons pulse or animate to demonstrate the product is live.

### 6.2 Markets Page (/markets) — Rating: 7/10

**What's good:**
- Filter chips (All/5x/10x/20x leverage, Admin/Live oracle)
- Health badge on each market
- Logo fetched per token
- Sorting by volume/OI/health

**Issues:**
- **P1:** No 24h price change column (% change). This is the first thing a trader looks for. Currently visible only on the hero card.
- **P1:** Table rows have no hover state that clearly signals "click to trade." Add: `hover:bg-[var(--bg-elevated)] cursor-pointer` and a faint right-arrow `→` on hover.
- **P2:** "ADMIN ORACLE" badge is alarming-looking (warning color) with no tooltip explaining what it means. Add: hover tooltip "Price set by market admin — higher risk."
- **P2:** On mobile, the table truncates token names mid-word and the columns collapse in a confusing way. Either implement a proper mobile card layout or use horizontal scroll with fixed-width columns.
- **P3:** No search/filter by token name. With 126 markets, a search input at the top would help.

### 6.3 Trade Page (/trade/[slab]) — Rating: 7/10

**What's good:**
- Desktop two-column layout (chart left, form right) is well-structured
- Stats/Trades/Health/Risk/Book tabs are logically grouped
- Quick-start guide (connect → create account → deposit → trade) is helpful

**Issues:**
- **P0:** No limit order type. Only market orders available. Every serious trader needs limit orders. This is a protocol-level limitation but UX can surface it as "coming soon" so traders aren't confused.
- **P0:** One-click close position missing. User must go to the form, remove their position manually (long → short?). This is the #1 friction point in position management.
- **P1:** Funding rate not visible without clicking "Stats" tab. Move to the stats bar: `Funding: +0.0081%/hr` always visible next to price.
- **P1:** Mark price vs index price not visible. Add to stats bar.
- **P1:** Leverage slider is functional but the `1x` through preset chips are 28px tall — fails 44px touch target on mobile.
- **P1:** DepositTrigger shows "Connect wallet to deposit" even after wallet is connected (until account is created). The copy should change to "Create account to deposit" at that stage. Currently confusing.
- **P1:** Trade confirmation modal repeats all the values the user just entered — good — but is missing the estimated liquidation price. Add it.
- **P2:** The "Coin-Margined Market" explanation text in the form is in very small gray text and easily overlooked. First-time users don't realize their collateral is the traded token (not USDC). This is a crucial fact. Make it a proper highlighted notice box.
- **P2:** Chart "No price data yet" empty state shows but has no guidance. Add: "This market has no recent trades. Price will update after the first trade." And show a link to the current oracle price.
- **P2:** `$47K vol/hr` ticker in top-left — no label, no tooltip. New users have no idea what it means. Add label: "Vol/hr: $47K".
- **P3:** The `tokens | usd` toggle is 9px text and hidden in a corner. This is actually a very useful feature (show in token units vs USD). Make it more prominent — maybe a pill toggle near the position panel header.
- **P3:** "Admin Active" / "Admin Renounced" badge has no tooltip. Add: "When admin key is renounced, market parameters are immutable — nobody can change fees or liquidation rules."

### 6.4 Portfolio Page (/portfolio) — Rating: Unknown (needs separate review)

Not yet able to screenshot in devnet state. Key design requirements:
- All open positions across all markets in one table
- PnL summary: today, 7d, all-time
- Trade history filterable by market/date
- Quick-close buttons on each row
- Realized PnL chart (30d)

### 6.5 Create Market Page (/create) — Rating: 7/10

Solid wizard UI. Main improvements needed:
- **P1:** Token address input should show a live preview of the token (logo, name, symbol, market cap) as soon as a valid mint is entered. Currently just the raw address.
- **P2:** "Set Your Terms" step should show a live preview of what the market URL will look like.
- **P2:** "Launch in 60 seconds" claim should have a timer that actually counts down from 60 as the transaction processes — makes the claim feel real and builds trust.

---

## 7. TOP 10 PERP TRADER PAIN POINTS

### Pain Point 1: No Limit Orders
**Severity: Critical** | **Percolator: Fails**
Every serious trader uses limit orders to enter at specific prices and avoid slippage. Market-only is acceptable for market makers or casual traders but is a blocker for volume traders. Without limit orders, Percolator cannot compete for the serious trader segment.
**Fix:** Protocol-level feature. UX fix: add a "Limit" tab in the order form with a grayed-out input and "Coming soon" state, so traders at least know it's on the roadmap.

### Pain Point 2: No One-Click Position Close
**Severity: Critical** | **Percolator: Fails**
When a trade goes wrong fast, every second counts. Users must manually navigate to close a position — there is no "Close" button on the position card. Hyperliquid, Drift, dYdX all have one-click close.
**Fix:** Add a "Close" button to PositionPanel and PositionsTable row. Submits a market close order for the full position size.

### Pain Point 3: Liquidation Price Not Prominent Enough
**Severity: High** | **Percolator: Partial**
Traders need to see their liquidation price at all times, especially when the market moves against them. Currently in pre-trade summary but not visible once a position is open.
**Fix:** Show liq price on the open position card. Color it amber when mark price is within 10% of liq price, red when within 5%.

### Pain Point 4: Funding Rate Hard to Find
**Severity: High** | **Percolator: Fails**
Funding rate determines the long-term cost of holding a position. Traders check this before opening. Currently buried in a "Stats" tab click.
**Fix:** Show `Funding: +0.0081%/hr` in the market header bar, always visible.

### Pain Point 5: Confusing Account Creation Flow
**Severity: High** | **Percolator: Partial**
The concept of "create a trading account" (a Solana PDA) before depositing is unfamiliar to users coming from CEXes or Hyperliquid. The current UI shows "Create Account" as step 2 without explaining what it is or why it costs SOL rent.
**Fix:** Inline explanation: "Percolator uses a on-chain account to track your positions. Create once, trade forever. Costs ~0.002 SOL rent." Ideally batch this with the first deposit transaction so it's invisible.

### Pain Point 6: No Price Change % Anywhere Obvious
**Severity: Medium** | **Percolator: Partial**
The 24h price change percentage is the second thing a trader looks for after the price itself. It's shown in the live hero card (+3.24%) but not in the markets list table, not in the trade page header.
**Fix:** Add to the market header bar: `$183.24 +3.2% (24h)`. Add as a column in the markets table.

### Pain Point 7: Mobile Keyboard Covers Trade Buttons
**Severity: Medium** | **Percolator: Fails**
When typing a margin amount on mobile, the software keyboard slides up and covers the LONG/SHORT submission buttons. User cannot complete the trade without dismissing keyboard first.
**Fix:** Sticky bottom CTA bar above keyboard, as described in Section 3.

### Pain Point 8: Coin-Margined Mechanics Are Non-Obvious
**Severity: Medium** | **Percolator: Partial**
Percolator uses coin-margined markets (collateral = the traded token). Most DeFi traders are used to stablecoin-margined (USDC collateral). This means your PnL and margin are in SOL, not USD — your risk is higher than it appears. Users are not warned clearly enough.
**Fix:** At deposit step, show: "⚠️ This is a coin-margined market. Your collateral is SOL. When SOL price falls, your margin and your PnL both decrease." Consider adding a persistent banner on the trade form for coin-margined markets.

### Pain Point 9: No Notification System
**Severity: Medium** | **Percolator: Missing**
Traders want alerts for: position liquidated, trade filled, price hitting target, funding rate spike. Currently there is no notification system of any kind.
**Fix (Phase 1 — low cost):** Browser push notifications on key events (position opened, closed, liquidated). Use the `Notification` API.
**Fix (Phase 2):** Telegram bot integration — send `/percolator notify` to get a bot that DMs you trade events.

### Pain Point 10: No Portfolio PnL Overview
**Severity: Medium** | **Percolator: Unknown**
A trader with 5 open positions wants to see total portfolio PnL at a glance: total unrealized, realized today, total realized, max drawdown. This should be the first thing on the Portfolio page.
**Fix:** Portfolio page hero: total unrealized PnL in large text (colored), with sub-rows for each open position. 30-day PnL sparkline chart.

---

## 8. DESIGN SYSTEM — QUICK REFERENCE CARD

### Color Tokens (summary)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0A0F` | Page background |
| `--bg-elevated` | `#0F1018` | Inputs, hover states |
| `--bg-surface` | `#141820` | Cards |
| `--panel-bg` | `#0D0E15` | Panel interiors |
| `--accent` | `#9945FF` | Solana purple — CTAs, links, active states |
| `--cyan` | `#14F195` | Solana green — LONG, positive PnL |
| `--short` | `#FF3B5C` | RED — SHORT, negative PnL, errors |
| `--warning` | `#E5A100` | Amber — liquidation warning, admin oracle |
| `--text` | `#E1E2E8` | Primary text |
| `--text-secondary` | `#7A7F96` | Labels, captions |
| `--text-dim` | `#454B5F` | Disabled, placeholder |
| `--border` | `#1C1F2E` | Default border |

### Font Scale
| Level | Size | Font | Use |
|---|---|---|---|
| Hero H1 | 64px | Outfit Bold | Homepage headline only |
| H2 | 36px | Outfit SemiBold | Section titles |
| H3 | 24px | Outfit Medium | Card titles |
| UI label | 12px | JetBrains Mono | Caps tracking |
| Data | 13px | JetBrains Mono tabular | Prices, numbers |
| Body | 14px | Inter | Tooltips, descriptions |
| Caption | 11px | Inter | Legal, fine print |

### Spacing Grid (8px base)
```
4px  → internal padding on tight chips
8px  → gap-2 — default item spacing
16px → gap-4, p-4 — panel padding, section gaps
24px → gap-6, px-6 — page-level padding
32px → gap-8 — major section separation
```

### Touch Targets (mobile)
- All tappable elements: `min-h-[44px] min-w-[44px]`
- CTA buttons: `h-[52px]` 
- Chips/presets: `h-[40px] min-w-[40px]` (acceptable for dense UI)
- Icon buttons: pad with `p-3` to hit 44px

---

## 9. IMPLEMENTATION PRIORITY QUEUE

### P0 — Ship this week (trader blockers)
1. **One-click close position button** on PositionPanel + PositionsTable row
2. **Funding rate in header bar** — always visible, not tab-only
3. **Mobile sticky CTA bar** — LONG/SHORT above keyboard

### P1 — Ship this sprint (UX gaps)
4. **Mark price vs index price** in stats bar
5. **24h price change %** in trade header and markets table
6. **Leverage chips touch targets** — `min-h-[44px]`
7. **Coin-margined warning** — prominent box on deposit + trade form
8. **Liquidation price color coding** — amber at 10%, red at 5%
9. **Stats bar skeleton** on homepage (remove dashes on load)
10. **Token preview** in Create Market address input

### P2 — Next sprint (polish)
11. Limit order tab (UI shell, "coming soon" state)
12. Mobile bottom nav bar
13. Portfolio page: total PnL hero
14. Search/filter in markets list
15. Notification system (browser push, Phase 1)

### P3 — Future (differentiation)
16. TP/SL order types
17. Telegram notification bot
18. Bulk close positions
19. Trading leaderboard
20. "Learn" section / trading academy

---

## 10. SUMMARY

Percolator has genuinely excellent bones: the permissionless market creation angle is unique in DeFi, the Solana speed is real, and the dark terminal aesthetic is distinctive and better-looking than most DeFi apps. The design system (colors, fonts, spacing) is coherent and the homepage communicates the value proposition well.

The gaps are almost entirely in the **trading interface mechanics**, not the visual design. The biggest competitive disadvantages:
1. No limit orders (protocol limitation, but must be surface UX)
2. No one-click close (pure UX win, 1 day of work)
3. Funding rate buried in a tab (pure UX win, 2 hours of work)
4. Mobile keyboard UX (sticky CTA bar, 1 day of work)
5. Missing mark/index spread (pure UX win, 2 hours of work)

Items 2–5 above are pure frontend changes with no protocol dependency. Fix those first. They will immediately move Percolator from "impressive prototype" to "usable trading app" for real traders.

---

*Document produced by: designer agent | PERC-351 | March 2, 2026*
*Based on: live review of percolatorlaunch.com, codebase analysis (~/percolator-launch/app/), competitor analysis (Hyperliquid, dYdX, Drift, GMX, Vertex)*

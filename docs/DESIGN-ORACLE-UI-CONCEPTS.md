# Oracle UI Design Concepts — Percolator Trading Interface

## Overview
Competitor reference: Pyth shows a simple "Pyth Network" badge on price feeds. Drift uses a small lock icon + "Pyth" label in the price header. Neither offers drill-down on mobile. We can do better on all counts.

---

## 1. Oracle Badge (per-market indicator)

**Concept: Feed Health Pill**
- Small pill badge in the market header row (markets list) and trade page price header
- 3-part composition: [icon] [feed-type] [freshness dot]
- Feed type icons: custom SVG — H (Hyperp), P (Pyth), C (Chainlink), D (DEX)
- Freshness dot: 8px circle, green (<5s), amber (5-30s), red (>30s)
- Colors: dark bg (#1a1d27), border 1px #2a2d3a, text #9ca3af for label
- On hover (desktop): tooltip "Pyth · Updated 2s ago · 3 publishers"
- On mobile: tap → opens Oracle Details Sheet (see #3)
- Size: 20px height pill, 6px horizontal padding — sits right of mark price
- Hyperp mode gets a subtle brand gradient border (rare/premium feel)

**Competitor gap:** Pyth/Drift show badge but no freshness state, no mode indicator. We show all three at a glance.

---

## 2. Price Freshness Indicator (trade page)

**Concept: Pulsing Timestamp Row**
- Lives directly under the mark price on the trade page, right-aligned
- Format: "● 2s ago" with the dot colored by staleness
- Green: <5s (dot pulses softly with CSS keyframe at 2s interval)
- Amber: 5–30s (pulse stops, static amber dot)
- Red: >30s (dot blinks 1s interval, tooltip "Price may be stale — verify before trading")
- Typography: 10px monospace (#6b7280), dot 8px
- Red state also adds a subtle amber tint to the price display bg (#1a1200) to catch the eye
- On click: opens Oracle Details Panel (see #3)

**UX principle:** Traders should never need to wonder "is this price live?" — the answer is always visible in peripheral vision.

---

## 3. Oracle Details Panel (click/tap expand)

**Concept: Bottom Sheet (mobile) / Slide-in Sidebar Drawer (desktop)**

Mobile: bottom sheet slides up 60vh, drag handle at top, blurred backdrop
Desktop: right drawer 320px wide, slides in over the trade panel, dismissible by click-outside or X

**Content layout (top to bottom):**
```
┌─────────────────────────────────┐
│  🔮 Oracle Feed                  [X]
│  BTC-PERP · Active              ●
├─────────────────────────────────┤
│  Source        Hyperp Network
│  Mode          HyperpOracle
│  Last Update   1.2s ago (13:56:31)
│  24h Deviation  ±0.03%
│  Uptime (30d)  99.97%
├─────────────────────────────────┤
│  Publishers (3/5 active)
│  ● Pyth Data DAO     ✓
│  ● Chainlink Labs    ✓
│  ● Jump Crypto       ✓
│  ○ DWF Labs          offline
│  ○ Wintermute        offline
├─────────────────────────────────┤
│  Fallback Mode: Chainlink
│  [View on Explorer ↗]
└─────────────────────────────────┘
```

- Publisher rows: 32px height, 10px avatar circle (colored by first letter), name, status dot
- Active publishers green dot; offline grey
- "Fallback Mode" row only shown if primary is degraded
- Explorer link opens Solscan/HyperpOracle explorer in new tab
- Colors: panel bg #0f1117, section dividers 1px #1e2130

---

## 4. Market Creation — Oracle Mode Selection

**Concept: Oracle Selector Card Grid + Confirmation Summary**

**Step in creation flow:** After market parameters (ticker, collateral, leverage cap), before final confirm.

Card grid (2 columns on mobile, 4 on desktop):
```
┌─────────────┐  ┌─────────────┐
│  ⚡ Hyperp   │  │  🔵 Pyth    │
│  Fastest    │  │  Most assets│
│  Recommended│  │  Reliable   │
│  [Selected] │  │             │
└─────────────┘  └─────────────┘
┌─────────────┐  ┌─────────────┐
│  🔗 Chainlnk│  │  🌊 DEX Pool│
│  Most trust │  │  No oracle  │
│  ed. Slower │  │  required   │
└─────────────┘  └─────────────┘
```
- Selected card: brand accent border (2px gradient), light bg tint
- Each card: icon 24px, title 14px bold, descriptor 12px grey, 2 lines max
- "Recommended" badge in top-right corner of Hyperp card (small green pill)
- Below the grid: info callout explaining the chosen mode in plain language
  - Hyperp: "Prices will update from HyperpOracle publishers every ~1s. Fastest and most decentralized."
  - DEX Pool: "Price derived from on-chain liquidity pool. Works without external oracle but may lag during low liquidity."

**Confirmation step:** Summary card shows chosen oracle as a line item:
```
Oracle Feed     Hyperp Network (HyperpOracle)
               ● Live · 3 publishers required
```

---

## 5. Feed Health Dashboard (ops page)

**Concept: /oracle — internal ops dashboard**

**Audience:** Percolator team + advanced users / LPs who want to verify feed health before depositing.

**Layout:**
- Top: summary row — "X feeds active · Y publishers online · Last sync Ns ago"
- Main table (desktop) / card list (mobile):

Desktop columns: Market | Mode | Status | Last Push | Publishers | 24h Dev | Uptime
Mobile card: Market name + mode badge, large status dot, "Updated Ns ago", publisher count

**Status column:**
- Green "Healthy" pill: all publishers reporting, <5s lag
- Amber "Degraded" pill: <50% publishers active or 5–60s lag
- Red "Stalled" pill: >60s since last push — triggers alert banner at top of page

**Additional features:**
- Sortable by uptime / last push / publisher count
- Filter by mode (Hyperp / Pyth / Chainlink / DEX)
- Auto-refresh every 5s (counter shows "Refreshing in 3s...")
- Stalled feeds trigger a persistent amber banner at top of page (dismissible per feed, not globally)
- Export CSV button (top right) for ops/monitoring

**Who is this for:** Primarily the Percolator ops team + sophisticated LPs / market creators who want to verify before committing capital. Could be public (trust-building signal) or ops-only behind wallet auth.

---

## Design Principles (tying it all together)

1. **Ambient trust** — oracle health is always visible at a glance, never buried in settings
2. **Progressive disclosure** — badge → freshness indicator → details panel (3 levels of depth)
3. **Color as signal, not decoration** — green/amber/red carry real operational meaning; never used decoratively elsewhere in the UI
4. **Mobile parity** — every oracle feature available on 375px, no information hidden behind desktop-only views
5. **Plain language** — "Updated 2s ago" not "lastPushTimestamp: 1740924991" — always human-readable

## vs. Pyth / UXD / Drift comparison
- Pyth.network dashboard: shows feed health excellently but it's a separate site — traders never see it
- Drift: Pyth badge in price header, no freshness, no publisher breakdown, no mobile detail
- UXD: oracle address shown in market info — requires user to go to Solscan themselves
- **Percolator advantage:** Inline, real-time, accessible on mobile, with publisher transparency — this is the premium experience none of them offer

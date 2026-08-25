# exitliq.wtf — am i exit liq?

*(engine name: LAYERS — the buyer-layer state machine)*

Static web app + a scheduled central scanner. Two surfaces:

1. **THE RADAR** (homepage) — the visitor's browser pulls trending pools on
   SOL/BSC/BASE/ROBINHOOD (GeckoTerminal), gates out majors/stables/tokenized equities,
   replays the level state machine on the top ~6 pools per chain, and renders a
   feed sorted PVE MOMENT → BUILDING → risk states. A receipts strip marks every
   layer that held in the last 24h to market ("$KEYCAT +6% since layer held 22h
   ago") — deterministic self-backtest, no backend. localStorage remembers each
   token's last signal and badges state changes since your last scan.
   Auto-rescans every 5 minutes; scan pace is throttled to ~15 req/min to stay
   inside GeckoTerminal's free per-IP rate limit (429s get one 12s retry, then
   the token is counted as "unreadable" in the status line).
2. **CHECK** (paste box / `?t=` deep link) — verdict card for any single CA,
   with an asset-domain gate: majors, stables and CEX-priced assets get
   "NOT A TRENCH ASSET" instead of a fake score.

**Zero backend · zero API keys · zero cost.** Everything runs in the visitor's
browser against two free public APIs (both CORS-open):

- DexScreener `latest/dex/tokens/{address}` — live pair, price, buys/sells, volume, mcap
- GeckoTerminal `networks/{net}/pools/{pool}/ohlcv/hour` — up to 1000 hourly candles (~41 days)

## Beta architecture — central scan (recommended for any public link)

Every visitor scanning from their own browser hits per-IP rate limits (CGNAT
users share IPs) and re-computes identical results. The fix: **scan once,
serve everyone.**

- `scanner.mjs` — Node port of the same engine; writes `feed.json` and appends
  every verdict to `verdicts.jsonl` (the receipt ledger; git history makes the
  timestamps tamper-evident).
- `.github/workflows/scan.yml` — runs it every ~10 min and commits the output.
- `index.html` — on load, tries `feed.json` first (fresh <25 min → central
  mode: instant paint, zero API calls from the browser). Missing/stale → falls
  back to in-browser solo scan. Force solo with `?solo=1`.

Setup: push this folder to a GitHub repo → enable Pages (main branch, root)
→ Actions tab → run "radar scan" once manually → bind the custom domain.

## Run locally

```bash
python3 -m http.server 8471
# open http://localhost:8471
```

## Deploy (pick one, all free)

- **Vercel**: `npx vercel deploy` in this folder, or drag the folder into vercel.com/new
- **Netlify**: drag the folder onto app.netlify.com/drop
- **GitHub Pages**: push, enable Pages on the repo

No build step. `index.html` is the entire product.

## Share mechanics built in

- `?t=<address>` deep link — every shared verdict re-runs live when opened
- "SHARE VERDICT ON 𝕏" — prefilled tweet intent with score/layer/verdict
- "DOWNLOAD RECEIPT PNG" — canvas-rendered receipt card for attaching to posts

## Signal logic (mirrors the CLI pve_agent)

Breakout = close ≥ 2% above running ATH. Check +4h: ≥85% held → level
confirmed; ≤60% → round-trip. Score = levels(.35) + buy pressure(.25) +
streak(.15) + volume trend(.10) + retention(.15). Verdicts:

| Signal | Trigger |
|---|---|
| EXIT_LIQ | round-trip ≤12h ago, no level held since |
| PVE_MOMENT | score ≥62 and ≥1 level held in 96h |
| PVE_BUILDING | live pending breakout, score ≥45 |
| PVP_CHURN | turnover >3× mcap, zero levels ever |
| STRUCT_RISK | score ≤45 |
| TOO_EARLY | <8h of candles |
| NEUTRAL | everything else |

Thresholds live at the top of the `<script>` block (`BREAKOUT/CONFIRM_H/HOLD/FAIL`)
— tune them from the CLI PnL buckets, redeploy.

## Known limits (v0, on purpose)

- 41-day ATH window (GT free tier) — "ATH" means window-high, not lifetime
- Buy pressure is 24h pair-level buys/sells, not ATH-proximity-filtered
- Receipts are client-generated: timestamped but not yet server-verifiable
- No holder data (that's the paid-API v2)

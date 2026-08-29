<div align="center">

# exitliq.wtf

### am i exit liq? — find out **before** you click buy.

paste a CA. it replays every new high, waits four hours,
and checks whether the floor held. verdict in seconds.

**[▶ try it live](https://exitliq.wtf)** · no sign-up · nothing signed, nothing stored · not advice

<img src="docs/demo.gif" alt="exitliq.wtf demo — radar feed and verdict cards" width="840">

### zero backend · zero API keys · zero cost

everything runs in **your** browser against two public APIs.
no server between you and the data, no tracking. the whole engine is one HTML file —
open it, read it, fork it. **don't trust — verify.**

</div>

---

## what it does

**🎯 CHECK — one CA, one verdict.** Paste any token address (or open a `?t=<address>` deep link) and get a verdict card: `PVE_MOMENT`, `PVE_BUILDING`, `EXIT_LIQ`, `PVP_CHURN`, `STRUCT_RISK`… An asset-domain gate means majors, stables and CEX-priced assets get **"NOT A TRENCH ASSET"** instead of a fake score.

**🛰 THE RADAR — the live trench scan.** The homepage pulls trending pools on SOL / BSC / BASE / ROBINHOOD, gates out majors and stables, replays the layer state machine on the top pools per chain, and renders a feed sorted PVE MOMENT → BUILDING → risk states. A receipts strip marks every layer that held in the last 24h to market ("$KEYCAT +6% since layer held 22h ago") — a deterministic self-backtest, no backend. Your browser remembers each token's last signal (localStorage) and badges what changed since your last visit.

**👜 BAG SCAN — every holding gets a verdict.** Connect a wallet read-only, or just paste a SOL / 0x address. Nothing signed, nothing stored.

## built to be shared

- `?t=<address>` deep links — every shared verdict re-runs **live** when opened
- **SHARE VERDICT ON 𝕏** — prefilled tweet with score, layer and verdict
- **DOWNLOAD RECEIPT PNG** — a canvas-rendered receipt card for attaching to posts

## how the verdict works

The engine is **LAYERS**, a buyer-layer state machine: a breakout = close ≥2% above the running ATH. Check again +4h: ≥85% of the move held → the level **confirmed** (a buyer layer that held); ≤60% → a **round-trip** (those buyers were the exit liquidity).

Score = levels (.35) + buy pressure (.25) + streak (.15) + volume trend (.10) + retention (.15).

| Verdict | Trigger |
|---|---|
| EXIT_LIQ | round-trip ≤12h ago, no level held since |
| PVE_MOMENT | score ≥62 and ≥1 level held in 96h |
| PVE_BUILDING | live pending breakout, score ≥45 |
| PVP_CHURN | turnover >3× mcap, zero levels ever |
| STRUCT_RISK | score ≤45 |
| TOO_EARLY | <8h of candles |
| NEUTRAL | everything else |

Thresholds live at the top of the `<script>` block (`BREAKOUT/CONFIRM_H/HOLD/FAIL`) — tune them, redeploy.

## under the hood

Two free public APIs, both CORS-open, called straight from your browser:

- DexScreener `latest/dex/tokens/{address}` — live pair, price, buys/sells, volume, mcap
- GeckoTerminal `networks/{net}/pools/{pool}/ohlcv/hour` — up to 1000 hourly candles (~41 days)

**Central scan (beta).** Every visitor scanning solo hits per-IP rate limits and re-computes identical results. The fix: **scan once, serve everyone.**

- `scanner.mjs` — Node port of the same engine; writes `feed.json` and appends every verdict to `verdicts.jsonl`, the receipt ledger. **Git history makes the timestamps tamper-evident.**
- `.github/workflows/scan.yml` — scheduled run, commits the output
- `index.html` — tries `feed.json` first (fresh → central mode: instant paint, zero API calls from the browser). Missing/stale → in-browser solo scan. Force solo with `?solo=1`.

## run locally

```bash
python3 -m http.server 8471
# open http://localhost:8471
```

## deploy your own fork (all free)

- **GitHub Pages**: push, enable Pages (main branch, root) → Actions tab → run "radar scan" once → bind your domain
- **Vercel**: `npx vercel deploy` in this folder, or drag the folder into vercel.com/new
- **Netlify**: drag the folder onto app.netlify.com/drop

No build step. `index.html` is the entire product.

## known limits (v0, on purpose)

- 41-day ATH window (GT free tier) — "ATH" means window-high, not lifetime
- Buy pressure is 24h pair-level buys/sells, not ATH-proximity-filtered
- Receipts are client-generated: timestamped but not yet server-verifiable
- No holder data (that's the paid-API v2)

---

*exitliq reads structure, not fortunes. it never blocks a trade — your click, your receipt.*
***nothing here is financial advice.***

// exitliq.wtf — shared verdict engine (Node)
// Single source of truth for scanner.mjs (radar) and guard.mjs (TG guardian).
// Mirrors the in-page engine in index.html; keep constants in sync.

export const BREAKOUT = 1.02, CONFIRM_H = 4, HOLD = 0.85, FAIL = 0.60;

export const STABLES = new Set(['USDT','USDC','DAI','FDUSD','USDE','TUSD','USD1','PYUSD','BUSD','USDS']);
export const MAJORS = new Set(['ETH','WETH','BTC','WBTC','BTCB','CBBTC','SOLVBTC','STETH','WSTETH','WEETH','CBETH','RETH','BNSOL','JITOSOL','MSOL','JUPSOL','XRP','SOL','WSOL','BNB','WBNB','ADA','DOGE','TRX','LTC','LINK','AVAX','MATIC','POL','TON','SUI','HYPE','DOT','BCH','XLM','SHIB','PEPE']);
export const TOKENIZED_EQUITY = /^(NVDA|TSLA|AAPL|MSFT|GOOGL?|AMZN|META|SPY|QQQ|COIN|MSTR|HOOD|CRCL)[XC]?$/;

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const fmtAge = (h) => h < 1 ? Math.max(1, Math.round(h * 60)) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd';

export function gateReason({ sym, mcap, vol24, ageDays }) {
  const s = (sym || '').toUpperCase().replace(/^\$+/, '');
  if (STABLES.has(s)) return 'stable';
  if (MAJORS.has(s)) return 'major';
  if (TOKENIZED_EQUITY.test(s)) return 'major';
  if (mcap > 500e6) return 'major';
  if (ageDays > 730 && mcap > 50e6) return 'major';
  if (mcap > 100e6 && vol24 > 0 && vol24 / mcap < 0.005) return 'shadow';
  return null;
}

export async function gt(path) {
  let r = await fetch('https://api.geckoterminal.com/api/v2' + path);
  if (r.status === 429) { await sleep(15000); r = await fetch('https://api.geckoterminal.com/api/v2' + path); }
  if (!r.ok) throw new Error('gt ' + r.status + ' ' + path);
  return r.json();
}

export async function fetchCandles(net, pool) {
  const d = await gt('/networks/' + net + '/pools/' + pool + '/ohlcv/hour?aggregate=1&limit=1000');
  const list = (((d.data || {}).attributes || {}).ohlcv_list || []).slice();
  list.sort((a, b) => a[0] - b[0]);
  return list.map(c => ({ t: c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] }));
}

export function replayLevels(candles) {
  const levels = [];
  let pending = null;
  if (candles.length < 6) return { levels, pending, ath: candles.length ? Math.max(...candles.map(c => c.h)) : 0 };
  let ath = candles[0].h;
  let i = 1;
  while (i < candles.length) {
    const c = candles[i];
    if (c.c > ath * BREAKOUT) {
      const bPrice = c.c, bTime = c.t;
      if (i + CONFIRM_H < candles.length) {
        const later = candles[i + CONFIRM_H].c;
        const ratio = later / bPrice;
        // confT/confPrice = when the signal became knowable — receipts measure from HERE (no lookahead)
        levels.push({ price: bPrice, t: bTime, confT: candles[i + CONFIRM_H].t, confPrice: later, held: ratio >= HOLD, failed: ratio <= FAIL, ratio });
        for (let k = i; k <= i + CONFIRM_H; k++) ath = Math.max(ath, candles[k].h);
        i += CONFIRM_H + 1;
        continue;
      } else {
        pending = { price: bPrice, t: bTime, confirmsIn: (i + CONFIRM_H - (candles.length - 1)) };
        ath = Math.max(ath, c.h);
        i++;
        continue;
      }
    }
    ath = Math.max(ath, c.h);
    i++;
  }
  return { levels, pending, ath };
}

export function greenStreak(candles) {
  const days = {};
  for (const c of candles) {
    const d = new Date(c.t * 1000).toISOString().slice(0, 10);
    if (!days[d]) days[d] = { o: c.o, c: c.c };
    days[d].c = c.c;
  }
  const keys = Object.keys(days).sort();
  let streak = 0;
  for (let i = keys.length - 1; i >= 0; i--) {
    const d = days[keys[i]];
    if (d.c > d.o) streak++; else break;
  }
  return streak;
}

export function analyze(pair, candles) {
  const now = Date.now() / 1000;
  const price = +pair.priceUsd || (candles.length ? candles[candles.length - 1].c : 0);
  const { levels, pending, ath } = replayLevels(candles);
  const tx = (pair.txns || {}).h24 || { buys: 0, sells: 0 };
  const buys = tx.buys || 0, sells = tx.sells || 0;
  const buyRatio = (buys + sells) > 0 ? buys / (buys + sells) : 0.5;
  const vol24 = ((pair.volume || {}).h24) || 0;
  const vol6 = ((pair.volume || {}).h6) || 0;
  const mcap = pair.marketCap || 0;
  const turnover = mcap > 0 ? vol24 / mcap : 0;
  const retention = ath > 0 ? price / ath : 0;
  const streak = greenStreak(candles);

  const H96 = now - 96 * 3600;
  const held96 = levels.filter(l => l.held && l.t >= H96).length;
  const heldAll = levels.filter(l => l.held).length;
  const lastFail = [...levels].reverse().find(l => l.failed);
  const failAgeH = lastFail ? (now - (lastFail.confT || lastFail.t + CONFIRM_H * 3600)) / 3600 : null;
  const heldAfterFail = lastFail ? levels.some(l => l.held && l.t > lastFail.t) : false;

  const sLevels = Math.min(held96, 3) / 3 * 100;
  const sBuyers = buyRatio * 100;
  const sStreak = Math.min(streak, 5) / 5 * 100;
  const volTrend = vol24 > 0 ? Math.min((vol6 * 4) / vol24, 2) / 2 * 100 : 0;
  const sRet = retention * 100;
  const score = Math.round(sLevels * .35 + sBuyers * .25 + sStreak * .15 + volTrend * .10 + sRet * .15);

  let sig, why;
  const tooEarly = candles.length < 8;
  if (tooEarly) {
    sig = 'TOO_EARLY';
    why = 'Less than 8 hours of trading history. There are no buyer layers to read — anyone entering now is gambling on distribution that doesn\'t exist yet. That\'s not a structure trade, that\'s a coin flip with extra steps.';
  } else if (lastFail && failAgeH !== null && failAgeH <= 12 && !heldAfterFail) {
    sig = 'EXIT_LIQ';
    why = 'A buyer layer round-tripped ' + fmtAge(failAgeH) + ' ago and no new layer has held since. Holders above your entry are underwater and waiting to sell into strength — your click is the strength.';
  } else if (score >= 62 && held96 >= 1) {
    sig = 'PVE_MOMENT';
    why = held96 + ' buyer layer' + (held96 > 1 ? 's' : '') + ' confirmed in the last 96h and buys are still showing up near the highs. New money keeps absorbing at ATH — that\'s what a PvE moment looks like while it lasts.';
  } else if (pending && score >= 45) {
    sig = 'PVE_BUILDING';
    why = 'A breakout is live but unconfirmed — the new layer proves itself in ~' + pending.confirmsIn + 'h. If it holds ≥85% of the breakout, a level is born. Entering now means betting on that confirmation, not on confirmed structure.';
  } else if (turnover > 3 && heldAll === 0) {
    sig = 'PVP_CHURN';
    why = 'Turnover is ' + turnover.toFixed(1) + '× market cap with zero confirmed levels — the same money is rotating between hands without creating new layers. Pure musical chairs: someone wins your seat, not the environment.';
  } else if (score <= 45) {
    sig = 'STRUCT_RISK';
    why = 'Weak structure: ' + (heldAll === 0 ? 'no confirmed buyer layers' : 'levels are old and retention is ' + Math.round(retention * 100) + '% of ATH') + ', sell pressure at ' + Math.round((1 - buyRatio) * 100) + '%. Nothing here says new buyers are arriving.';
  } else {
    sig = 'NEUTRAL';
    why = 'Mixed tape — some structure (' + heldAll + ' level' + (heldAll !== 1 ? 's' : '') + ' all-time, ' + held96 + ' in 96h), but no fresh confirmation and no fresh failure. No edge in either direction; whatever you do here, size like you\'re guessing.';
  }

  const layer = heldAll + (pending ? 1 : 0) + 1;
  return { sig, why, score, layer, held96, heldAll, failAgeH, buyRatio, sells24: Math.round((1 - buyRatio) * 100), levels, pending, retention, streak, turnover, parts: { sLevels, sBuyers, sStreak, volTrend, sRet }, price, mcap, nCandles: candles.length };
}

export const pseudoPair = (t) => ({
  priceUsd: t.price, chainId: t.chain, marketCap: t.mcap,
  txns: { h24: { buys: t.buys, sells: t.sells } },
  volume: { h24: t.vol24, h6: t.vol6 },
  baseToken: { symbol: t.sym, address: t.addr },
});

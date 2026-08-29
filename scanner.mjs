// exitliq.wtf — central radar scanner
// Run: node scanner.mjs
// Writes feed.json (consumed by index.html) and appends verdicts.jsonl (the receipt ledger).
// Verdict logic lives in engine.mjs (shared with guard.mjs).
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { gt, fetchCandles, analyze, gateReason, pseudoPair, sleep } from './engine.mjs';

const RADAR_CHAINS = ['solana', 'bsc', 'base', 'robinhood'];
const PER_CHAIN = 5, MIN_VOL = 20000, PACE_MS = 2500;

async function fetchTrending(net) {
  try {
    const d = await gt('/networks/' + net + '/trending_pools?page=1');
    return (d.data || []).map(p => {
      const a = p.attributes || {};
      const rel = (((p.relationships || {}).base_token || {}).data || {});
      return {
        chain: net, pool: a.address,
        addr: (rel.id || '').split('_').slice(1).join('_'),
        sym: (a.name || '?').split(' / ')[0].trim().replace(/^\$+/, ''),
        price: +a.base_token_price_usd || 0,
        mcap: +(a.market_cap_usd || a.fdv_usd) || 0,
        vol24: +(((a.volume_usd) || {}).h24) || 0,
        vol6: +(((a.volume_usd) || {}).h6) || 0,
        buys: ((((a.transactions) || {}).h24) || {}).buys || 0,
        sells: ((((a.transactions) || {}).h24) || {}).sells || 0,
        ageDays: a.pool_created_at ? (Date.now() - new Date(a.pool_created_at).getTime()) / 864e5 : 0,
      };
    }).filter(t => t.addr && t.pool);
  } catch (e) { console.error('trending failed', net, e.message); return []; }
}

// ---- main ----
const lists = await Promise.all(RADAR_CHAINS.map(fetchTrending));
const seen = new Set(); const cands = []; let skippedOOS = 0;
for (const t of lists.flat()) {
  const k = t.chain + ':' + t.addr;
  if (seen.has(k)) continue; seen.add(k);
  if (gateReason({ sym: t.sym, mcap: t.mcap, vol24: t.vol24, ageDays: t.ageDays })) { skippedOOS++; continue; }
  if (t.vol24 < MIN_VOL) continue;
  cands.push(t);
}
cands.sort((x, y) => y.vol24 - x.vol24);
const perChain = {};
const scanList = cands.filter(t => (perChain[t.chain] = (perChain[t.chain] || 0) + 1) <= PER_CHAIN);

const results = []; let tooEarly = 0, unreadable = 0;
for (const t of scanList) {
  try {
    const candles = await fetchCandles(t.chain, t.pool);
    const a = analyze(pseudoPair(t), candles);
    if (a.sig === 'TOO_EARLY') tooEarly++;
    else results.push({ t, a });
    console.log(`${t.chain}/${t.sym}: ${a.sig} ${a.score}`);
  } catch (e) { unreadable++; console.error(`${t.chain}/${t.sym}: FAILED ${e.message}`); }
  await sleep(PACE_MS);
}

console.log(`scan: ${results.length} readable, ${tooEarly} too early, ${skippedOOS} out-of-scope, ${unreadable} unreadable`);

if (!results.length) {
  console.error('zero results — keeping previous feed.json');
  process.exit(existsSync('feed.json') ? 0 : 1);
}

writeFileSync('feed.json', JSON.stringify({ at: Date.now(), results }));

// append-only receipt ledger: one line per verdict per scan, timestamped by the commit
const ts = new Date().toISOString();
const lines = results.map(({ t, a }) =>
  JSON.stringify({ ts, chain: t.chain, addr: t.addr, sym: t.sym, sig: a.sig, score: a.score, layer: a.layer, price: a.price })).join('\n') + '\n';
appendFileSync('verdicts.jsonl', lines);
console.log('wrote feed.json + appended', results.length, 'lines to verdicts.jsonl');

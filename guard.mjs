// exitliq.wtf — TG bag guardian (Stage B, personal edition)
// Watches one wallet's holdings; pushes a Telegram message ONLY on verdict
// state transitions (never on price moves). Optionally broadcasts new radar
// PVE confirmations to a public group (RADAR_CHAT_ID) as review invitations.
//
// Config via env (GitHub Actions secrets):
//   TG_BOT_TOKEN   Telegram bot token (from @BotFather)          [required to push]
//   TG_CHAT_ID     your personal chat id with the bot            [required for bag alerts]
//   WATCH_WALLET   SOL wallet address to guard                   [required for bag alerts]
//   WATCH_CAS      optional extra tokens: "chain:address,chain:address"
//   RADAR_CHAT_ID  optional public group/channel id for new-PVE radar posts
//   STATE_KEY      passphrase encrypting guard_state.enc (repo is public)
//   DRY_RUN=1      print messages instead of sending; state saved unencrypted to guard_state.dry.json
//
// Missing config = graceful no-op (exit 0), so public forks never fail CI.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { fetchCandles, analyze, gateReason, fmtAge, sleep } from './engine.mjs';

const ENV = process.env;
const DRY = ENV.DRY_RUN === '1';
const BOT = ENV.TG_BOT_TOKEN, CHAT = ENV.TG_CHAT_ID, WALLET = ENV.WATCH_WALLET;
const RADAR_CHAT = ENV.RADAR_CHAT_ID, KEY = ENV.STATE_KEY;
const DUST_USD = 10, DAILY_CAP_BAG = 5, DAILY_CAP_RADAR = 3;
const SITE = 'https://exitliq.wtf';

// ---- encrypted state (repo is public; holdings are not) ----
const STATE_FILE = 'guard_state.enc', DRY_STATE = 'guard_state.dry.json';
function loadState() {
  try {
    if (DRY && existsSync(DRY_STATE)) return JSON.parse(readFileSync(DRY_STATE, 'utf8'));
    if (!existsSync(STATE_FILE) || !KEY) return {};
    const raw = Buffer.from(readFileSync(STATE_FILE, 'utf8'), 'base64');
    const salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), tag = raw.subarray(28, 44), ct = raw.subarray(44);
    const k = scryptSync(KEY, salt, 32);
    const d = createDecipheriv('aes-256-gcm', k, iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
  } catch (e) { console.error('state load failed (starting fresh):', e.message); return {}; }
}
function saveState(st) {
  const json = JSON.stringify(st);
  if (DRY) { writeFileSync(DRY_STATE, json); return; }
  if (!KEY) return;
  const salt = randomBytes(16), iv = randomBytes(12);
  const k = scryptSync(KEY, salt, 32);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(json, 'utf8'), c.final()]);
  writeFileSync(STATE_FILE, Buffer.concat([salt, iv, c.getAuthTag(), ct]).toString('base64'));
}

// ---- telegram ----
async function tgSend(chatId, text) {
  if (DRY || !BOT) { console.log('---- PUSH to ' + (chatId === RADAR_CHAT ? 'RADAR_CHAT' : 'personal') + ' ----\n' + text + '\n----'); return true; }
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!r.ok) console.error('tg send failed', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) { console.error('tg send error', e.message); return false; }
}

// ---- holdings (SOL via Jupiter lite-api; server-side, no CORS constraints) ----
async function solHoldings(wallet) {
  const r = await fetch('https://lite-api.jup.ag/ultra/v1/holdings/' + encodeURIComponent(wallet));
  if (!r.ok) throw new Error('jupiter holdings ' + r.status);
  const d = await r.json();
  const out = [];
  const tokens = d.tokens || d; // shape: { mint: [{amount, uiAmount, ...}] } or {tokens: {...}}
  for (const [mint, accs] of Object.entries(tokens || {})) {
    if (!Array.isArray(accs)) continue;
    const ui = accs.reduce((s, a) => s + (+a.uiAmount || 0), 0);
    if (ui > 0) out.push({ chain: 'solana', addr: mint, ui });
  }
  return out;
}

// batch-price all mints first (25 per request), keep each token's deepest pair
// per chain — dust dies here before any per-token work happens.
async function batchBestPairs(items) {
  const out = {}; // key: chain:addrLower -> pair
  const ingest = (ps) => {
    for (const p of (ps || [])) {
      if (!p.baseToken || !p.baseToken.address) continue;
      const k = p.chainId + ':' + p.baseToken.address.toLowerCase();
      const liq = ((p.liquidity || {}).usd) || 0;
      if (!out[k] || liq > (((out[k].liquidity || {}).usd) || 0)) out[k] = p;
    }
  };
  const addrs = [...new Set(items.map(i => i.addr))];
  for (let i = 0; i < addrs.length; i += 25) {
    try {
      const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + addrs.slice(i, i + 25).join(','));
      if (r.ok) ingest(((await r.json()) || {}).pairs);
    } catch (e) {}
    await sleep(300);
  }
  return out;
}

// ---- transition rules: push on group changes, stay silent inside a group ----
const GOOD = new Set(['PVE_MOMENT', 'PVE_BUILDING']);
const BAD = new Set(['PVP_CHURN', 'STRUCT_RISK', 'EXIT_LIQ', 'DEAD']);
const grp = (s) => GOOD.has(s) ? 'good' : BAD.has(s) ? 'bad' : 'mid';
function transitionKind(prev, next) {
  if (!prev || prev === next) return null;
  const a = grp(prev), b = grp(next);
  if (b === 'bad' && a !== 'bad') return 'alarm';                       // 🚨 结构破位
  if (next === 'EXIT_LIQ' && prev !== 'EXIT_LIQ') return 'alarm';       // 任何→EXIT_LIQ 都值得叫醒
  if (b === 'good' && a !== 'good') return 'brick';                     // 🧱 结构修复
  if (prev === 'PVE_BUILDING' && next === 'PVE_MOMENT') return 'brick'; // 层确认
  return null; // mid↔mid、bad 内部漂移、good→mid：不打扰
}

const ZH_SIG = { PVE_MOMENT: 'PVE MOMENT（结构成立）', PVE_BUILDING: 'PVE BUILDING（新层待确认）', NEUTRAL: '无边际', PVP_CHURN: 'PVP 抢椅子', STRUCT_RISK: '结构性风险', EXIT_LIQ: 'EXIT LIQ（接盘警报）', DEAD: '交易对消失', TOO_EARLY: '太新' };

function bagMsg(item, prev, a, value) {
  const kind = transitionKind(prev, a.sig);
  const head = kind === 'alarm' ? '🚨' : '🧱';
  const lines = [
    head + ' $' + item.sym + ': ' + (ZH_SIG[prev] || prev) + ' → ' + (ZH_SIG[a.sig] || a.sig),
    (value != null ? '你的仓位 ≈ $' + value.toFixed(0) : '手动关注') + ' · 结构分 ' + a.score + ' · L' + a.layer,
  ];
  if (a.sig === 'EXIT_LIQ') lines.push('下方买家层 ' + (a.failAgeH != null ? fmtAge(a.failAgeH) : '') + ' 前被回吐，此后无新地板。上面的套牢盘在等反弹出货。');
  else if (a.sig === 'STRUCT_RISK') lines.push('结构疲弱：现价为窗口高点的 ' + Math.round(a.retention * 100) + '%，无新买家层迹象。');
  else if (a.sig === 'PVP_CHURN') lines.push('换手 ' + a.turnover.toFixed(1) + '× 市值、零层站住——存量互割，没有地板。');
  else if (a.sig === 'DEAD') lines.push('在 DexScreener 上找不到活着的交易对了。');
  else if (kind === 'brick') lines.push('新买家层扛住了 4 小时，地板 +1。');
  lines.push(SITE + '/?t=' + item.addr);
  return lines.join('\n');
}

function radarMsg(t, a) {
  return ['📡 新结构确认：$' + t.sym + ' (' + t.chain.toUpperCase() + ') · 结构分 ' + a.score,
    '第 ' + a.heldAll + ' 层买家站住 · 你现在进场是 L' + a.layer,
    'mcap ' + (t.mcap ? '$' + (t.mcap / 1e6).toFixed(1) + 'M' : '—') + ' · 这是审查邀请，不是买入信号',
    SITE + '/?t=' + t.addr].join('\n');
}

// ---- main ----
const st = loadState();
st.bag = st.bag || {}; st.radar = st.radar || {}; st.pushes = (st.pushes || []).filter(p => Date.now() - p.at < 24 * 3600e3);
const budget = (kind) => st.pushes.filter(p => p.kind === kind).length < (kind === 'bag' ? DAILY_CAP_BAG : DAILY_CAP_RADAR);
let sent = 0;

// —— 需求2（可选）：雷达新 PVE_MOMENT → 公开群，审查邀请框架 ——
if ((RADAR_CHAT || DRY) && existsSync('feed.json')) {
  try {
    const feed = JSON.parse(readFileSync('feed.json', 'utf8'));
    for (const { t, a } of (feed.results || [])) {
      const key = t.chain + ':' + t.addr;
      const prev = st.radar[key];
      if (a.sig === 'PVE_MOMENT' && prev !== 'PVE_MOMENT' && prev !== undefined && budget('radar')) {
        if (await tgSend(RADAR_CHAT || 'DRY', radarMsg(t, a))) { st.pushes.push({ at: Date.now(), kind: 'radar' }); sent++; }
      }
      st.radar[key] = a.sig;
    }
  } catch (e) { console.error('radar broadcast failed:', e.message); }
}

// —— 需求1：绑定钱包持仓的结构劣化/修复 ——
if ((WALLET && (CHAT || DRY)) || ENV.WATCH_CAS) {
  const held = [];
  if (WALLET) {
    try { held.push(...await solHoldings(WALLET)); }
    catch (e) { console.error('holdings fetch failed:', e.message); }
  }
  for (const spec of (ENV.WATCH_CAS || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const [chain, addr] = spec.split(':');
    if (chain && addr) held.push({ chain, addr, ui: null });
  }
  console.log('holdings to evaluate:', held.length);

  // feed.json verdicts are free — reuse them before spending GT quota
  let feedMap = {};
  try {
    const feed = JSON.parse(readFileSync('feed.json', 'utf8'));
    for (const { t, a } of (feed.results || [])) feedMap[t.chain + ':' + t.addr.toLowerCase()] = { a, sym: t.sym };
  } catch (e) {}

  // price everything in batches first; dust and majors never cost a candle call
  const pairMap = await batchBestPairs(held);
  const rows = [];
  for (const item of held) {
    const key = item.chain + ':' + item.addr.toLowerCase();
    const pair = pairMap[key] || null;
    if (!pair) {
      // only a token we previously tracked as alive can "die"
      if (st.bag[key] && !['DUST', 'GATED', 'NOPAIR', 'DEAD'].includes(st.bag[key].sig)) rows.push({ item, key, pair: null });
      else st.bag[key] = st.bag[key] || { sym: item.addr.slice(0, 6) + '…', sig: 'NOPAIR' };
      continue;
    }
    const sym = pair.baseToken.symbol.replace(/^\$+/, '');
    const price = +pair.priceUsd || 0;
    const value = item.ui != null ? item.ui * price : null;
    if (value != null && value < DUST_USD) { st.bag[key] = { sym, sig: 'DUST' }; continue; }
    const gated = gateReason({ sym, mcap: pair.marketCap || pair.fdv || 0, vol24: ((pair.volume || {}).h24) || 0, ageDays: pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 864e5 : 0 });
    if (gated) { st.bag[key] = { sym, sig: 'GATED' }; continue; }
    rows.push({ item, key, pair, sym, value });
  }
  rows.sort((x, y) => (y.value || 0) - (x.value || 0));
  const MAX_SCAN = 25;
  if (rows.length > MAX_SCAN) console.log('guarding top', MAX_SCAN, 'by value;', rows.length - MAX_SCAN, 'skipped this run');
  for (const row of rows.slice(0, MAX_SCAN)) {
    const { item, key, pair } = row;
    try {
      let a, sym = row.sym, value = row.value;
      if (!pair) {
        sym = st.bag[key].sym;
        a = { sig: 'DEAD', score: 0, layer: 0, retention: 0, turnover: 0, failAgeH: null };
      } else {
        const hit = feedMap[key];
        if (hit) a = hit.a;
        else { const candles = await fetchCandles(item.chain, pair.pairAddress); a = analyze(pair, candles); await sleep(2500); }
      }
      const prevSig = (st.bag[key] || {}).sig;
      const kind = transitionKind(prevSig, a.sig);
      if (kind && !['DUST', 'GATED', 'NOPAIR'].includes(prevSig) && budget('bag')) {
        const msg = bagMsg({ sym, addr: item.addr }, prevSig, a, value);
        if (await tgSend(CHAT || 'DRY', msg)) { st.pushes.push({ at: Date.now(), kind: 'bag' }); sent++; }
      }
      st.bag[key] = { sym, sig: a.sig, score: a.score, at: Date.now() };
    } catch (e) { console.error('guard item failed', key, e.message); }
  }
} else {
  console.log('bag guardian not configured (need WATCH_WALLET + TG_CHAT_ID, or WATCH_CAS) — skipping');
}

saveState(st);
console.log('guard run done · pushes sent:', sent);

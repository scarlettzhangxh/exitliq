# BAG GUARDIAN（持仓守护）— 本版本 spec

一句话定位：CHECK 回答"我现在买是不是接盘"，守护回答"**我手里的仓正在变成接盘吗**"。
判决是获客，守护是留存。转化钩子只有一个动作：查完 → "让雷达盯着你的包"。

分两级，都进这个版本。Stage A 纯前端零成本先上；Stage B 是真守护（人离开也被保护）。

---

## Stage A — BAG SCAN + 本地守护（零后端 · 零 key · 纯前端）

### 流程

1. **入口 ×2**：首页 CHECK 框旁 "SCAN MY BAGS / 扫我的包"；每张判决卡底部同款 CTA。
2. 贴 SOL 钱包地址 → 浏览器直连公共 RPC 拉全部 SPL 持仓：
   - `getTokenAccountsByOwner`（`jsonParsed`，Token + Token-2022 两个 programId 各一次）
   - 端点：`api.mainnet-beta.solana.com`，429 时退避换 `solana-rpc.publicnode.com`（均免 key、CORS 开放）
3. 每个 mint → 现有 CHECK 管线（DexScreener `tokens/{mint}` 定价定池 → GT candles → `analyze()`），
   复用现有限速/重试逻辑；先按 uiAmount×price 算 USD，**<$10 尘埃仓直接跳过**，省请求。
4. **BAG REPORT**：每仓一行（sym / USD 价值 / 信号 / layer / 一句 why），按危险度排序；顶部汇总判决行：
   > 你 $X 的持仓里，**Y% 的价值坐在无地板结构上**（EXIT_LIQ + STRUCT_RISK + PVP_CHURN + 已死盘的价值占比——PVP 触发条件就是零层站住，抢椅子游戏没有地板）
5. **分享卡**：复用收据 PNG 管线出 "MY BAG VERDICT" 卡（自嘲向，语气对齐 LAUNCH.md）。
6. **开启守护**：持仓列表写 `localStorage guard_bags_v1`（结构照抄 `layers_seen_v1` 的 diff 模式）→
   每次回访自动重扫守护列表，状态迁移置顶播报："自上次：$WIF PVE_MOMENT → EXIT_LIQ"。
7. **可选成本价**：每仓一个手动输入 "我大概 $X 进的"（只存本地）→ 判决语可以指名道姓：
   "你入场层**下方**的那一层刚刚 round-trip"。没有链上成本基础（免费 RPC 拿不到交易历史），手动一格解决 80% 情绪价值。
8. **EVM 链持仓（2026-08-26 更新）**：EVM 没有"列出我的代币"这种原生 RPC——枚举持仓必须靠链下索引器。
   免 key + CORS 开放的索引器只有 Blockscout：**robinhood ✓ 已验证**（robinhoodchain.blockscout.com，ACAO:*，真实数据），
   **base 已接入但实例当时超时(524)**——按链优雅降级，失败链在报告脚注注明"本轮未读取"。
   **BSC 没有任何免 key 索引器**（BscScan 要 key）→ BSC 持仓扫描放 Stage B 服务端（key 存 Actions secret）。
   0x 钱包 = 一次扫 base+robinhood 合并报告；EVM 连接钱包走 MetaMask `eth_requestAccounts`（同样只拿地址，零签名）。
   所有链的 CA 仍可**手动添加**进守护列表（同一 diff 机制）。

### 隐私

钱包地址只进 RPC 请求和 localStorage，不进任何我们的存储（我们本来也没有存储）。页面上明示这句话——这是卖点，写出来。

---

## Stage B — TG 推送守护（真守护：离开也被保护）

> **状态 2026-08-28：个人版已 SHIP**（guard.mjs + scan.yml 的 guard job，需求1 全量 + 雷达群播钩子）。
> 与原规格的差异：① 单用户版免订阅表/免 /watch 命令——wallet/chat_id 全走 Actions secrets，
> 状态文件 guard_state.enc 用 STATE_KEY AES-256-GCM 加密后提交公开仓（持仓构成不泄露）；
> ② 判决引擎抽成 engine.mjs（scanner/guard 共用，杜绝第三份拷贝）；③ 原"需求2 个人买入推送"
> 改为可选的公开 TG 群广播（RADAR_CHAT_ID）——新 PVE_MOMENT 以"审查邀请"框架进群（带层位数、
> 无 buy 字样、每日 ≤3 条），群 = alpha 讨论社区 + 分发渠道。④ 迁移推送规则：组间迁移才推
> （GOOD/MID/BAD 三组），组内漂移静默；任何→EXIT_LIQ 必推；🚨降级/🧱修复，个人 ≤5 条/天。
> 激活清单见 README「Guardian setup」。

已经有每 10 分钟的 cron 在跑，守护复用同一套：

- 新建 `guard.yml`（或并入 scan job）：每轮 `getUpdates` 收 `/watch <wallet|ca>`、`/unwatch`、`/mute`
- **订阅表存私有仓库**（如 `exitliq-state`，Actions 用 PAT secret 读写）
- `scanner.mjs` 扩展：trending 之外 merge 订阅 token（DexScreener token→pool→candles），
  去重，每轮上限 ~100 个，超出轮转；feed.json 只含 token 级判决（无个人数据，可继续公开）
- 信号迁移 → `sendMessage` 推送

延迟 ≤20 分钟，信号本来就基于小时 K，足够。新增成本：一个 bot token + 一个 PAT，仍然 $0/月。

### 路线 2（留给 v2）：Cloudflare Worker + KV + TG webhook

命令即时响应、扩展性好（免费额度 100k req/天），但破坏"零后端"叙事，用户量起来再换。

### 铁律

`chat_id ↔ wallet` 映射**绝不进公开仓库**。Pages 仓库是 public 的：verdicts.jsonl 可以公开（token 级），订阅表不行（人级）。

### 推送内容 = 只推状态迁移，不推行情

- 降级 🚨："$WIF: PVE_MOMENT → EXIT_LIQ。你下方的买家层刚 round-trip，上面的套牢盘在等你的买入拉高出货。"
- 升级 🧱："$KEYCAT: 新层扛住 4h。地板 +1（现在 L3）。"
- 每周一 BAG WEEKLY：本周你的包躲过几刀/挨了几刀（数据源 verdicts.jsonl，已在积累）

频控：每 token 每次迁移只推一次；每人每天 ≤5 条；`/mute` 可静音。en/zh 文案与站内 i18n 同源。

---

## 埋点（判决→守护转化是生死线）

- Stage A：`guard_bags_v1` 非空率、回访重扫率（localStorage 即可算，直接显示在状态栏——build in public）
- Stage B：`t.me/<bot>?start=guard_<src>` 按来源计数（card / home / weekly）

## 对 LAUNCH.md 的影响

- 主线程加第 6 条："it can also watch your bags — paste a wallet, get a verdict per holding, and a ping when your floor breaks. free, nothing signed."
- 静默期 3–5 天同时用来跑通 Stage B 推送稳定性，发布时守护已经是稳定功能而不是承诺

## Connect Wallet 与交易（本版本已实现的部分 + Stage C 决策）

**已做（Stage A 内）**：
- **Connect Wallet（只读）**：`connect()` 只取公钥，永不请求签名——"nothing signed" 承诺不变。
  一键完成体检 + 守护绑定；公钥存 localStorage，回访一键重扫。没装插件 → 提示贴地址（贴地址永远是一等公民）。
- **交易深链**：判决卡上"去 GMGN 交易 ↗"（sol/bsc/base/eth 映射，robinhood 无 GMGN 不显示）。
  `GMGN_REF` 常量填入 ref 码后即开始吃 GMGN 返佣分成（格式 `gmgn.ai/{chain}/token/{ref}_{addr}`）——**收入从深链开始，不等自营交易**。

**明确不做（推迟到 Stage C 再决策）——站内自营 swap**：
1. 站内发交易 = 请求签名，安全叙事从"只读工具"变成"资金入口"，匿名新域名请求签名会触发钱包反钓鱼且毁掉中立判决位；
2. 执行体验（滑点/优先费/MEV/失败重试）是交易终端的主场，零后端拼不过，一笔失败交易毁掉的信任比判决卡挣的多；
3. 若 Stage C 要做：Jupiter Swap API + platformFee 收费是现成路径，届时需要完整的滑点/优先费 UX 和独立安全审视。

## 实现顺序与工作量

| # | 内容 | 量 |
|---|---|---|
| 1 | Stage A：RPC 拉仓 → 批量 CHECK → BAG REPORT + 分享卡 | ~1 天 |
| 2 | Stage A：guard_bags_v1 守护 diff + 回访播报 | ~半天 |
| 3 | Stage B：guard.yml + 私仓订阅表 + scanner merge + 消息模板 | 1–2 天 |
| 4 | BAG WEEKLY 周报 | ~半天 |

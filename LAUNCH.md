# exitliq.wtf — launch kit

## Pre-flight checklist（发布前逐项打勾）

- [ ] 注册 `exitliq.wtf`（主域）+ `amiexitliq.com`（301 → 主域）
- [ ] 建 GitHub 仓库（建议 public，git 历史 = 可验证收据账本），推送本目录
- [ ] Settings → Pages → 从 main 分支根目录部署；Settings → Actions 确认允许 workflow 写入
- [ ] Actions 页手动跑一次 "radar scan"，确认 feed.json 提交成功
- [ ] 绑定自定义域名到 Pages，确认 `exitliq.wtf` 打开即中央模式（状态栏显示 "central scan · Xm old"）
- [ ] 静默跑 3–5 天，等第一张 CALLED IT 收据（EXIT_LIQ 判决后 7 天 −50% 级别，或 PVE 判决后显著上涨）
- [ ] 用真收据替换主线程第 3 条的占位图

## Launch thread (EN) — 五条主线程

**1/**
every trench trader knows the feeling: you ape, it dumps, and you realize you WERE the liquidity.

i built a small tool that answers one question before you click buy:

am i exit liq?

exitliq.wtf

**2/**
it doesn't read charts. it counts buyer layers.

every time someone paid a new high and HELD it for 4 hours — that's a layer. a floor of real hands.

no layers under you = no floor.
a layer just got dumped on = you're next.

(附：台阶图截图)

**3/**
it is probably wrong sometimes. that's the point of this beta.

every verdict is timestamped and committed to a public git log — including the misses. we keep the wrong ones. that's what makes the right ones mean something.

here's one from this week: (附：收据 PNG)

**4/**
the ask:

reply with a CA → i post its verdict.
think the verdict is wrong? even better. best dunk gets pinned — i'm collecting exactly the cases where it fails.

**5/**
free. no login. no keys. nothing signed. your browser doesn't even make data calls — verdicts come from a public scanner anyone can audit.

it reads structure, not fortunes. not financial advice.

personal experiment, built in public: exitliq.wtf

## 中文 QT（主线程发出后自己引用转发）

**QT 1:**
做了个小工具回答一个问题：你现在买入，是第几层接盘的？

它不看 K 线，数"买家层"——每一批在新高接盘并且扛住 4 小时的人算一层。你脚下没有层 = 没有地板；刚有一层被出货 = 下一个就是你。

exitliq.wtf 免费，不用登录，查查再按键。

**QT 2（隔天）:**
每个判决都带时间戳进公开 git 记录，错的也永久保留——敢留错题的信号才配被信。

回复 CA，我贴判决。觉得判错了更好，最狠的打脸我置顶。

## 日常内容节奏（发布后 2–3 周）

| 频率 | 格式 | 备注 |
|---|---|---|
| 每天 1 条 | Receipt of the day：一张收据图 + 一句话 | 对错都发；错的配 "logged. this is what calibration looks like" |
| 每 2–3 天 | "radar flagged $X as PVE_BUILDING Nh ago → 现在 ±Y%" | 正反都发 |
| 每周 1 条 | 信号桶前向收益分布小结（数据来自 verdicts.jsonl） | 给行业受众的硬通货 |
| 相机 | CT 热议币 → 贴判决卡进讨论串 | 用页面的 SHARE 按钮 |

## 反馈收集

- 公开层：维护"分歧案例表"——币 / 判决 / 质疑者 / 理由 / 7 天后谁对
- 深访层：挑 10 个真在交易 meme 的互动者，DM 三问：哪个判决你不同意？它替代了你工作流里哪一步？什么情况你会回来再用？
- 小群层：15–30 人 TG 群 "exitliq beta · roast channel"，单向收件箱 + 每周数据发布

## 红线

- 发布周不改判决逻辑（回应质疑用 "logged, next week's calibration"）
- 不 tag Qwerty，直到手里有桶分离数据或他喊过的币被雷达提前标记的实例
- 以个人名义发，不挂公司

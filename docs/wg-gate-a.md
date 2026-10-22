# Gate A：规则版本与数据基线

**状态：未通过（blocked）**。本文件是 Gate A 的验收物，不是通过声明。当前 blocker：正式预置队伍与依赖实现。

## 1. 版本锁

| 项目 | 值 |
|---|---|
| `rulesetId` | `wg-c7` |
| `rulesRevision` | `c7-2020-07-24-errata`（目标，待核） |
| 允许来源 | C7 Core Rulebook、Forsaken System Player's Guide（仅 Tech-Adept）、Graveyard Shift |
| 明确拒绝 | 458 页 Ulisses 版 Core Rules |
| 机械校验 | `src/games/wrath-glory/rules/sources.ts`、`registry.ts` |

加载器只接受 `wg-c7-*`；把 Ulisses 版来源写进规则数据会直接报错。

## 2. 勘误核验

| 规则 | C7 印刷 | 目标值 | 状态 |
|---|---|---|---|
| `maxWounds` | Toughness + Tier（p.37 / p.193） | Toughness + 2 × Tier（2020-07-24 勘误） | **verified** |

- 本地 `E:\VTT\战锤跑团书` 内没有 2020-07-24 勘误 PDF；官方链接当前被 Cloudflare 403 拦截。
- 已通过官方勘误的公开检索文本核对：`Max Wounds now equal your Tier × 2, plus your Toughness`（W&G Rulebook Errata 24/07/2020）。
- 因此 `maxWounds` 采用 **Toughness + 2 × Tier**，状态改为 `verified`；完整 PDF 仍建议你本地留档。

## 3. 规则清单与验证状态

规则注册表：`src/games/wrath-glory/rules/registry.ts`。

| ruleId | 状态 | 说明 |
|---|---|---|
| dice.icons | verified | 1–3 空、4–5 一图标、6 尊崇 |
| dn.reference | verified | 1/3/5/7/9/11 是参考，不是枚举 |
| maxWounds | verified | Toughness + 2 × Tier（勘误） |
| maxShock | verified | Willpower + Tier，起始 0 |
| defence / resilience | verified | Init−1；Tough+1+AR |
| determination.pool | verified | Toughness 骰；每图标 1 Wound→1 Shock |
| wounds.start / wounded.penalty | verified | 累计创伤；任何创伤 +1 DN |
| dying.threshold / annihilation | verified | `woundsTaken > maxWounds`；单次 >2×Max Wounds |
| wrath.start / glory.start | verified | 2 / 0 |
| ruin.start / ruin.max | verified | 人数 / 2×人数 |
| wrathCritical.player / gm | verified | 成功攻击才暴击；GM 6 得 Ruin |
| attack.melee / attack.ranged | verified | I+WS / A+BS |
| weapon.ranges | verified | 每武器三段，禁止中距×2 |
| damage.resilience | verified | 相等 1d3 Shock；超出为 Wounds |
| tier.bonusDice / tier.buySuccess | draft | 旧版沿袭，C7 待核 |

## 4. 预置队伍（Tier 1）

目标三人：

1. 审判庭侍从（Inquisitorial Acolyte，C7 p.94）
2. 帝国卫兵（Imperial Guardsman，C7 p.93）
3. 技术侍从（Tech-Adept，Forsaken p.109；Tier 1，XP 22，IMPERIUM/ADEPTUS MECHANICUS）

**当前状态：draft。**

- 公开仓库只有 `content/wg/prefabs/example-original.json`，用于 schema 测试与公开 demo，**不是** Graveyard Shift 官方预置队。
- 正式三人队与构筑记录放在本地私有包 `data/wg/packs/graveyard-shift/pregens.json`（不入 git）；需要补齐 XP、属性/技能成本、Talent、装备、派生数值后再过 Gate A。
- 技术位不用 Tech-Priest（Tier 3），避免提前引入升阶。

## 5. 副本依赖表

数据：`content/wg/dependencies/graveyard-shift.json`。

| 依赖 | testId | 状态 |
|---|---|---|
| 墓室雕刻腐化 DN 1 | `wg.corruption.dn1` | declared |
| 裂隙事件腐化 DN 3 | `wg.corruption.dn3` | declared |
| Pink Horror（Fear/On Fire/Determination/死亡分裂） | `wg.threat.pink-horror` | declared |
| Guardian Amalgamation（静止 Mob、3 组件/T1、Shock 关闭、Ruin 行动） | `wg.threat.guardian-amalgamation` | declared |
| Stalker Flare（单一信号装置） | `wg.item.stalker-flare` | declared |
| 荒野 3×DN 4 Survival（线索降至 2） | `wg.exploration.survival` | declared |
| 固定 DN（含 DN 10 Scholar） | `wg.investigation.fixed-dn` | declared |
| 结局分支（Mendax 生/死；Revelator 交付/保留/销毁） | `wg.ending.branches` | declared |

`declared` 表示“已登记、尚未实现/测试”；Gate A 要求每条至少到 `implemented` 或 `adapted`，不能有 `missing`。

## 6. 中文词表

`docs/glossary-wg-zh.md`：约 70 词，区分“通用译名 / 待核 / 用户确认”。W&G 专有机制词没有随书官方中文对照表；标 `待核` 的条目需你确认后才能冻结。

## 7. Gate A 通过条件

- [x] 勘误公式核对（官方检索文本；PDF 直连被拦，建议本地留档）
- [x] `maxWounds` 状态改为 `verified`
- [ ] 三人预置队构筑记录完整并通过 `validatePregen`
- [ ] 依赖表无 `missing`，关键项有实现计划与 testId
- [ ] 中文词表 `待核` 条目确认
- [ ] `npm run build && npm test` 通过

## 8. 下一步

Gate A 剩余项与 Gate B 可并行准备：先搭骰池/判定/`pendingDecision` 最小流程，但战斗数值在勘误核对前不冻结。

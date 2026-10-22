# 怒火与荣耀 v1 验收

日期：2026-10-23（Asia/Hong_Kong）
状态：**v1 范围达成**；边界见文末。

## 版本

```text
gameId:        wrath-glory
rulesetId:     wg-c7
rulesRevision: c7-2020-07-24-errata
content:       private Graveyard Shift pack (local, not in public repo)
```

## Gate A：规则版本与数据

- 来源锁：只允许 C7 core / Forsaken Guide / Graveyard Shift；Ulisses 458p 被拒绝（`tests/wg-m0.test.mjs`）。
- 规则表：source/page/errata/verification 字段齐全；Maximum Wounds 采用 2020-07-24 勘误 `Toughness + 2 × Tier`。
- 预置队：三人 Tier 1，XP 预算审计通过；Flak Armour AR 3 计入 Resilience。
- 依赖表：Corruption DN1/DN3、Pink Horror Fear/On Fire/死亡分裂、Guardian Ruin/Mob、Stalker Flare 单实体、Survival DN4、结局分支均有 testId。
- 证据：`docs/wg-gate-a-signoff.md`、`tests/wg-m0.test.mjs`、`tests/wg-pregens` 预算断言（在 m0 测试内）。

## Gate B：可暂停结算与最小可玩

- Shift 与 Determination 都是持久化 `pendingDecision`，刷新后仍面对同一骰子与选择。
- 攻击中途选择、资源不自动消费、`requestId` 幂等重放。
- 证据：`tests/wg-dice.test.mjs`、`tests/wg-session.test.mjs`、浏览器训练遭遇流程。

## Gate C：无 AI 完整 Graveyard Shift

- 五段：Intro / Part I–V；四个结局：`dawn`、`destroy`、`keep`、`handover`。
- 敌方队列、Determination、Corruption、Fear、On Fire、死亡分裂、Guardian Mob 组件与 Ruin 行动。
- 证据：`tests/wg-scenario-run.test.mjs`（固定 `WG_SEED=42`，四个结局全走通）。

## Gate D：AI GM 与验收

- `POST /sessions/:id/gm`：模型返回叙述 + 至多一个动作（choose / attack）。
- 服务端只执行当前场景存在的 choice、合法的攻击者/目标；不接收模型给出的数字或资源。
- Shift / Determination 仍由玩家选择，AI 不替玩家花 Wrath/Glory。
- 证据：真实端点手工走查（`docs/wg-ai.md`）、AI mock 测试、浏览器 GM 面板检查。
- 界面：中央聊天流 + 左右侧栏；1440/1920 宽度下三栏常驻，可见文案无英文标签。
- 人机交互检查见 `docs/wg-ux-check.md`。

## 命令与结果

```text
npm test              -> 89/89
npm run test:browser  -> 34/34 (private pack installed; includes 1440/1920 三栏布局、无英文可见文案、字号、回车发送、检定卡结构、棋子移动检查)
npm run verify        -> ok
POST /api/ai/ping     -> ok, 3 models
```

## 边界（不声称）

- 公开仓库不含官方正文/插画/完整 stat block；Graveyard Shift 是本地私有改编包。
- 中文词表仍是“官方 40K 通用译名 + 项目约定”，W&G 专有机制词没有随书官方中文对照表。
- 预置队是 draft（按 Suggested Attributes/Skills 组队），不是逐页审计的官方预置角色。
- AI 不处理 Shift/Determination，不自主花玩家资源；敌方选目标仍是简单策略。
- Guardian 的 Resilience 6 是本地可玩性改编值；官方原值以书为准。

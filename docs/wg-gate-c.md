# Gate C 进度：Graveyard Shift 无 AI 跑通

**状态：核心闭环通过。** 五段场景、两场遭遇、敌方回合、Determination、Corruption、Pink Horror 特殊能力、Guardian Mob 组件与 Ruin 行动均已接通；固定种子 42 的端到端测试可从开场走到 `dawn` 结局。

## 已接入

- 私有包：`data/wg/packs/graveyard-shift/scenario.json`（git 忽略）。
- 13 个场景：Intro/Part I → Part II → Part III → Part IV → Part V → 四个结局。
- 线索门槛：墓城方位、卡莉娅的钥匙、迪奥梅德斯的指引。
- 两场遭遇：拾骨者、守护融合体；攻击结算与场景推进。
- 敌方回合：每轮第一个存活敌人反击；玩家受伤时进入 Determination 待决（可选掷 Toughness 把 Wound 转 Shock）。
- 腐化检定：墓塔 DN 1、裂隙 DN 3；失败给 GM +1 Ruin。
- Wounded +1 DN 已用于玩家攻击、场景检定和敌方目标防御。
- 五段结构、Stalker Flare 单实体、DN 4 Survival 等依赖已登记。
- 封面：`public/games/wrath-glory/art/graveyard-shift.webp`（原创生成）。

## 尚未接入

- Pink Horror 的 Fear / On Fire / 死亡分裂已实现简化版（Fear DN3、命中点燃、死亡分裂蓝色恐魔）。
- Guardian 的 Ruin 行动已接入（花 1 Ruin 加伤）；Mob 按 3 个组件 × 4 Wounds 记录，每 4 点创伤摧毁一个组件。
- 端到端回归：`tests/wg-scenario-run.test.mjs`，`WG_SEED=42` 跑完五段并到达 `dawn`。
- 敌方多目标选择：现在同一轮会按队列让所有存活敌人行动；目标仍默认选第一个可行动 PC（尚未做 AI/战术选目标）。
- 其他三个结局的固定回归（目前只回归 `dawn`）。
- 结局条件与奖励的完整审计。
- 结局条件与奖励的完整审计。

## 测试

- `tests/wg-session.test.mjs`：私有包存在时跑调查场景与线索获取；无包时 skip。
- `npm test` 81/81；`npm run test:browser` 19/19（浏览器测试使用公开 demo，不依赖私有包）。

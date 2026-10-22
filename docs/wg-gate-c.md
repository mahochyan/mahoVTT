# Gate C 进度：Graveyard Shift 无 AI 跑通

**状态：部分完成。** 目前能走完五段场景骨架与两场静态敌人遭遇；还没有敌方回合、Determination 待决、Corruption/特殊敌人完整规则。

## 已接入

- 私有包：`data/wg/packs/graveyard-shift/scenario.json`（git 忽略）。
- 13 个场景：Intro/Part I → Part II → Part III → Part IV → Part V → 四个结局。
- 线索门槛：墓城方位、卡莉娅的钥匙、迪奥梅德斯的指引。
- 两场遭遇：拾骨者、守护融合体；攻击结算与场景推进。
- 五段结构、Stalker Flare 单实体、DN 4 Survival 等依赖已登记。
- 封面：`public/games/wrath-glory/art/graveyard-shift.webp`（原创生成）。

## 尚未接入

- 敌方回合与攻击玩家（当前敌人只在被攻击时结算）。
- PC 受伤后的 Determination 待决、Wounded +1 DN 已用于检定但未覆盖全部攻击。
- Corruption DN 1 / DN 3、Pink Horror 的 Fear/On Fire/死亡分裂、Guardian 的 Ruin 行动。
- 结局条件与奖励的完整审计。

## 测试

- `tests/wg-session.test.mjs`：私有包存在时跑调查场景与线索获取；无包时 skip。
- `npm test` 81/81；`npm run test:browser` 19/19（浏览器测试使用公开 demo，不依赖私有包）。

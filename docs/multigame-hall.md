# mahoVTT 一级游戏厅 / 二级游戏模块

## 为什么这样划分

一级游戏厅负责发现游戏、导航、共用设置、跨游戏角色模板（后续）；不能用 d20 解释 D6 角色卡。二级模块拥有独立的规则集 ID、冒险内容、地图、角色数据、命令校验、结算、AI 上下文及存档。

## 新模块契约

`src/games/contracts.ts` 描述 `GameDescriptor` 和 `GameRuntime`。注册表为 `src/games/hub.ts`。新增模块使用 `/api/games/<gameId>/*` API 与自己独立的 Web 页面，可以不再修改旧引擎。

《无声钟塔》是过渡期 legacy adapter。原存档 `data/sagas.sqlite` 与路由 `/c/:id` 不迁移、不覆盖。实验 D6 数据库位于 `data/games/wrath-d6-experiment.sqlite`；端点 `/api/games/wrath-d6-experiment`，界面 `/games/wrath-d6-experiment`。

## 当前 D6 模块范围

原创《黑井中继站》短篇：创建侦察员/修复师/战地医师；三人小队；12×9 固定地图；移动、射击、缓存调查、中继恢复、规则机器人队友；服务端 D6 骰池与特殊骰、测试结果和世界状态由同一事务保存。AI 仅可选择性生成 DM 叙事，不可直接修改伤亡或任务状态。叙事失败只回退到确定性事实播报。

### 重要限制

- 本实现**不是官方 Wrath & Glory 完整规则**。仅把可公开讨论的基础骰池思想用于实验；当前战斗数值、剧情、场景、职业及战术回合是自定义简化规则。
- 同伴目前是确定性规则机器人，不是调用模型独立决策的 AI Agent；后续应将其抽象成受控命令的策略接口。
- 当前只有一个 D6 短篇，暂不支持自定义内容包、完整人物成长、付费官方条目、多人或跨规则人物数据转换。
- 未取得许可前，不会把商业官方 PDF、角色/装备数据库或 GW / Cubicle 7 官方插画打包进公开仓库。代码自行编写，不移植 GPL Foundry 规则仓库源文件。
- `GET /api/games/wrath-d6-experiment` 只暴露公开世界书，不返回内部 GM 秘密。

## 运行与测试

原有服务入口 `node scripts/start.mjs`。游戏厅 `http://127.0.0.1:3000/games`。运行构建：`npm install && npm run build && npm test`。模块的六项测试在 `tests/games.test.mjs`，覆盖目录隔离、D6 判定、恶意命令拒绝、碰撞规则、版本幂等与 API 闭环。

下一步：将统一角色模板升级为 ruleset-specific adapter；内容包 schema 单独版本化；增加 W&G 角色与装备真实授权规则核对、状态负面效果、战役 AI 决策和独立副本商店。

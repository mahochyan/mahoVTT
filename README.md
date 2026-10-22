# mahoVTT

**本地单机、多游戏的 AI 跑团平台。** 当前是干净的剧本空壳：旧的两部演示剧本已移除，等待新的“点开即玩”剧本包。

仓库：https://github.com/mahochyan/mahoVTT

## 当前状态

- **平台**：工作台、战役列表/详情、角色名册、世界库、内容库、设置、游戏厅（空状态）。
- **游戏厅**：暂无剧本。旧《无声钟塔》与《黑井中继站》的入口、存档、示例与相关文档已于 2026-10-22 移除。
- **角色**：战士 / 游侠 / 牧师的创建、名册、角色卡与编辑仍然可用；等剧本上线后可直接选用。
- **引擎**：d20 运行时保留在 `src/engine` 与 `src/world.ts`（legacy，不在界面暴露，仅作为后续剧本运行时）；D6 实验模块已删除。
- **AI**：模型调用在服务端；默认“规则演示模式”不需要模型，设置页可接 OpenAI 兼容端点。

## 运行

需要 Node.js 22.16 或以上，推荐 Node.js 24。

```powershell
# 双击 start.cmd，或：
node scripts/start.mjs
```

浏览器打开 `http://127.0.0.1:3000`。预编译版本不需要 `npm install`，修改源码后才需要：

```powershell
npm install
npm run build
npm test
```

数据保存在本机 `data/`；`data/` 不入仓库。

## 测试

```powershell
npm test                # 规则 / 存档 / HTTP / 平台 API
npm run test:browser    # Windows + Edge headless；无 Edge 时自动跳过
```

浏览器测试通过 Chrome DevTools Protocol 驱动真实页面，覆盖空状态、角色创建与移动端布局。

## 目录

```text
src/              后端源码（平台、legacy d20 引擎、游戏厅契约）
dist/             已编译可运行程序
public/           前端（平台壳、游戏厅、legacy 跑团页）
legacy/           旧剧本运行时数据（不在界面暴露）
docs/             视觉规范
tools/            本地素材生成与验收脚本
tests/            Node 测试 + 浏览器冒烟
```

## 下一步

1. 定义“剧本包”格式：封面、预设队伍、开场、地图、目标、遭遇、结局。
2. 从 `/games` 一键进入，跳过建世界/建角色向导。
3. 先做一个 30–60 分钟、可存可续的完整短篇，再复制第二部。


## 怒火与荣耀（W&G）

`/games/wrath-glory` 是按 C7 核心规则实现的 AI 跑团模块，当前为 v1：

- d6 图标骰池、怒火骰、Shift、Wrath/Glory/Ruin
- 敌人回合、Determination、Wounded/Dying、Corruption
- Graveyard Shift 五段流程与四个结局
- AI GM：本地端点叙述，并可提出/执行经过服务端校验的场景选择与攻击
- 官方内容包放在本地 `data/wg/packs/graveyard-shift/`，不入公开仓库；公开 demo 仍可玩训练遭遇

本地 AI 默认配置见 `docs/wg-ai.md`；Gate 验收见 `docs/wg-acceptance.md`。

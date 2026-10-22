# 进度记录（只写实测结果）

**最后更新：** 2026-10-22 23:36 (+08:00)
**分支：** `feat/deathwatch-d100-private-campaign`
**工作副本：** 独立 worktree，避免与同一 checkout 上的其他会话互相覆盖

## S1 接手与启动恢复（已完成，待复核）

### 实际问题（复现见证据 S1/01-repro.log）

- 分支提交 `9c38827` 的 `modules/deathwatch/` 只有 7 个文件，**缺 `engine.mjs`**。
- `runtime.mjs` 第 6 行 `import {activeActor,fallbackCommand} from './engine.mjs'`，
  `store.mjs` 第 8 行同样 import；`src/games/hub.ts` 在模块顶层 eager import runtime。
  因此缺文件不是"少一个按钮"，而是**整个服务在加载大厅时失败**。用该提交的原文件直接 import
  `runtime.mjs` 得到 `ERR_MODULE_NOT_FOUND`。

### 本轮补了什么

| 文件 | 性质 |
|---|---|
| `modules/deathwatch/engine.mjs` | 新增。规则运行时：建团、命令校验、结算、观察视图、确定性兜底策略 |
| `public/games/deathwatch/index.html` + `app.js` + `style.css` | 新增。独立页面，不复用 d20 角色卡 |
| `tests/deathwatch.test.mjs` | 新增。18 项规则/建团/战斗/持久化测试 |
| `tests/deathwatch-http.test.mjs` | 新增。7 项真实 HTTP 测试（含 SIGKILL 恢复） |
| `tests/platform.test.mjs` | 修正：清空演示后大厅不再是空数组，应断言只登记 deathwatch 且仍为 experimental |

### 实测结果

- `npm run build`：通过（tsc，无错误）。
- `node --test tests/*.test.mjs`：**87 通过 / 0 失败 / 0 跳过**。
- 真实启动（隔离数据目录 + 3300 端口）：
  - `/api/health` 200
  - `/api/games` → `[{"id":"deathwatch-d100","phase":"experimental"}]`
  - `/api/games/deathwatch-d100` → 6 战团、6 专长、1 个内置原创副本
  - `/games/deathwatch/index.html`、`app.js`、`style.css` 均 200
- 通过 HTTP 实际创建了一个存档并执行移动命令，版本 0→1 落库。

### 明确还没做

- 没有接真实模型跑过队友决策或主持人叙事（端点已探测，见 `docs/evidence/S-image/`）。
- 没有官方《Final Sanction》私有内容包。
- 没有真实浏览器交互测试（本轮只验证了静态资源 200 与 API 行为）。
- 没有三小时长局、没有 DGX 实机报告。
- 因此本阶段**不是**"可玩版本"，只是"能启动、能建团、能移动"。

## 规则实现口径（与 RULES.md 同步）

- 属性：2d10+30，允许一次重掷（Core p.26–27）。
- Wounds：1d5+18，风暴守卫 +2（Core p.27）。
- Fate：1d10，1–7→3，8–9→4，10→5（表 1–2）。
- 初始经验：12,000 已花 + 1,000 可分配（Core p.27）。
- 护甲：动力甲 头 8 / 躯干 10 / 四肢 8。
- 命中部位：个位十位反转；100 反转后为 001，按 1 处理（头部）。
- Horde：每次有效命中 -1 Magnitude，X 型武器额外 -1（Core p.360）。
- 未实现/未核对的内容一律不标 `automated`。
